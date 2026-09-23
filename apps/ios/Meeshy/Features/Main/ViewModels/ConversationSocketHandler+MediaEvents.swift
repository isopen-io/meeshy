import Foundation
import Combine
import MeeshySDK
import os

// MARK: - ConversationSocketHandler + Media/Attachment Events

/// **Événements d'ENRICHISSEMENT et de CONSOMMATION d'une pièce jointe** —
/// extrait de `ConversationSocketHandler.subscribeToSocket()` (I4, #7360),
/// qui dépassait le plafond de 1200 lignes du dépôt (1393 lignes avant ce
/// lot). La frontière suit une RESPONSABILITÉ, pas une tranche arbitraire :
/// tout ce qui touche une pièce jointe APRÈS son envoi — réactions, statut
/// de consommation (écouté / visionné / téléchargé), transcription et
/// traduction audio finalisées côté serveur — vit ici. Le reste (messages,
/// frappe, accusés de lecture, localisation live) reste dans le fichier
/// d'origine, qui appelle `subscribeToMediaEvents` depuis
/// `subscribeToSocket()`.
///
/// `cancellables`, `persistence` et `delegate` sont accédés directement sur
/// `self` : `ConversationSocketHandler` les déclare `internal` (voir le
/// commentaire sur `cancellables`) exactement pour permettre ce découpage en
/// extensions par fichier, comme `ConversationSyncEngine+Socket.swift` /
/// `+Ecritures.swift` le font déjà pour son homologue du SDK.
extension ConversationSocketHandler {

    func subscribeToMediaEvents(
        socketManager: MessageSocketProviding,
        convId: String,
        userId: String
    ) {
        // BUG2 A' — réactions par-image : le delta porte le reactionSummary
        // autoritaire ; on remplace les comptes in-memory (currentUserReactions
        // reste géré optimiste côté VM, comme message-level).
        socketManager.attachmentReactionAdded
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let delegate = self.delegate, let summary = event.reactionSummary else { return }
                delegate.applyAttachmentReactionDelta(attachmentId: event.attachmentId, reactionSummary: summary)
            }
            .store(in: &cancellables)

        socketManager.attachmentReactionRemoved
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let delegate = self.delegate, let summary = event.reactionSummary else { return }
                delegate.applyAttachmentReactionDelta(attachmentId: event.attachmentId, reactionSummary: summary)
            }
            .store(in: &cancellables)

        socketManager.attachmentStatusUpdated
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                // At-rest consumption tint (waveform/progress bar) : only OUR OWN
                // playback echo (multi-device sync) may feed this store — it is
                // documented and purged as single-local-user state, so another
                // participant's progress must never tint MY bubble.
                if event.userId == userId,
                   let playPositionMs = event.playPositionMs,
                   let durationMs = event.durationMs, durationMs > 0 {
                    let fraction = Double(playPositionMs) / Double(durationMs)
                    MediaConsumptionStore.shared.record(
                        fraction: fraction, complete: fraction >= 1, for: event.attachmentId)
                }
                guard let persistence = self.persistence else { return }
                // Touch the record so the store observation fires and
                // bubbles re-render with the updated attachment status.
                Task {
                    do {
                        try await persistence.touchUpdatedAt(localId: event.messageId)
                    } catch {
                        Logger.messages.error("Persistence touchUpdatedAt failed: \(error, privacy: .public) messageId=\(event.messageId, privacy: .public)")
                    }
                }

                // I4 (#7360) — a report from ANOTHER participant, in a 1:1
                // conversation, means that recipient IS the whole audience:
                // `AttachmentConsumptionResolver` — the same all-or-nothing
                // judge `DeliveryStatusResolver` already is for read
                // receipts (`subscribeToSocket`'s `readStatusUpdated`
                // handler) — can mark the primary action complete-by-all
                // from this SINGLE event, without the server-side aggregate
                // counts G-6 (#7359, not yet merged into `dev`) will add to
                // this event's payload. A group cannot say WHICH member
                // reported from one event alone; crediting a partial report
                // as "by all" there would be a worse defect than staying
                // silent, so groups wait for #7359 — logged, not solved
                // here.
                // L'AUTEUR n'est jamais un destinataire : la passerelle
                // l'exclut des deux côtés de « écouté par tous »
                // (`MessageMediaConsumptionService.updateAttachmentComputedStatus`).
                guard event.userId != userId,
                      let delegate = self.delegate,
                      let message = delegate.messages.first(where: { $0.id == event.messageId }),
                      message.senderId != event.userId,
                      message.recipientCount == 1,
                      let attachment = message.attachments.first(where: { $0.id == event.attachmentId }),
                      let confirmedAt = event.updatedAt
                else { return }

                let primaryAction = AttachmentConsumptionResolver.primaryAction(forMimeType: attachment.mimeType)
                // The reported action must be the PRIMARY one for this
                // media type — a "downloaded" report on a voice message
                // saved to Files is not evidence anyone listened to it.
                guard event.action == primaryAction.rawValue else { return }

                let status = AttachmentConsumptionResolver.resolve(
                    mimeType: attachment.mimeType,
                    recipientCount: message.recipientCount,
                    viewedCount: primaryAction == .viewed ? 1 : (attachment.viewedCount ?? 0),
                    downloadedCount: primaryAction == .downloaded ? 1 : (attachment.downloadedCount ?? 0),
                    consumedCount: primaryAction == .listened || primaryAction == .watched
                        ? 1 : (attachment.consumedCount ?? 0),
                    viewedByAllAt: attachment.viewedByAllAt,
                    downloadedByAllAt: attachment.downloadedByAllAt,
                    listenedByAllAt: attachment.listenedByAllAt,
                    watchedByAllAt: attachment.watchedByAllAt
                )
                guard status.isCompleteByAll else { return }

                Task {
                    do {
                        try await persistence.markAttachmentConsumedByAll(
                            messageId: event.messageId,
                            attachmentId: event.attachmentId,
                            action: status.action,
                            at: confirmedAt
                        )
                    } catch {
                        Logger.messages.error("Persistence markAttachmentConsumedByAll failed: \(error, privacy: .public) messageId=\(event.messageId, privacy: .public)")
                    }
                }
            }
            .store(in: &cancellables)

        // Attachment payload enriched server-side (transcription finalized,
        // audio translation finalized for one language). Delegate handles
        // the metadata dictionaries injection atomically + GRDB upsert ;
        // the same atomic rule as `loadInitialSnapshot` ensures no
        // intermediate frame ever renders the message without its enriched
        // transcription / translated audios.
        socketManager.attachmentUpdated
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.delegate?.applyAttachmentUpdate(event)
            }
            .store(in: &cancellables)

        // View-once consumed
        socketManager.messageConsumed
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let delegate = self.delegate else { return }
                // Capture the current message snapshot for eviction BEFORE
                // the persistence write updates the record and the store
                // observation refreshes delegate.messages.
                let messageForEviction: Message? = event.isFullyConsumed
                    ? delegate.messages.first(where: { $0.id == event.messageId })
                    : nil
                if let persistence = self.persistence {
                    // Write through persistence; store observation surfaces the count update.
                    Task {
                        do {
                            try await persistence.updateViewOnceCount(
                                localId: event.messageId,
                                count: event.viewOnceCount
                            )
                        } catch {
                            Logger.messages.error("Persistence updateViewOnceCount failed: \(error, privacy: .public) messageId=\(event.messageId, privacy: .public)")
                        }
                    }
                }
                // Eviction is media-cache housekeeping; not a messages array mutation.
                if event.isFullyConsumed {
                    if let msg = messageForEviction {
                        delegate.evictViewOnceMedia(message: msg)
                    }
                    delegate.markMessageAsConsumed(messageId: event.messageId)
                }
            }
            .store(in: &cancellables)

        // Translation received — coalesce bursts (the server can fire 5+
        // language translations for the same message within ~50ms when the
        // recipient ring is fanned out). Collecting via `.collect(.byTime)`
        // means a single `@Published` write fires instead of N, cutting
        // ConversationView body re-evals by ~80% on multilingual groups.
        socketManager.translationReceived
            .collect(.byTime(DispatchQueue.main, .milliseconds(80)))
            .filter { !$0.isEmpty }
            .sink { [weak self] events in
                guard let delegate = self?.delegate else { return }
                var buckets: [String: [MessageTranslation]] = [:]
                for event in events {
                    guard delegate.containsMessage(id: event.messageId) else { continue }
                    let mapped = event.translations.map { t in
                        MessageTranslation(
                            id: t.id,
                            messageId: t.messageId,
                            sourceLanguage: t.sourceLanguage,
                            targetLanguage: t.targetLanguage,
                            translatedContent: t.translatedContent,
                            translationModel: t.translationModel,
                            confidenceScore: t.confidenceScore
                        )
                    }
                    var merged = buckets[event.messageId] ?? delegate.messageTranslations[event.messageId] ?? []
                    for translation in mapped {
                        if let idx = merged.firstIndex(where: { $0.targetLanguage == translation.targetLanguage }) {
                            merged[idx] = translation
                        } else {
                            merged.append(translation)
                        }
                    }
                    buckets[event.messageId] = merged
                }
                // Single assignment so SwiftUI publishes once per burst
                // regardless of how many messages/languages came in.
                for (msgId, merged) in buckets {
                    delegate.messageTranslations[msgId] = merged
                }

                // Persist translations via actor
                if let persistence = self?.persistence {
                    let capturedEvents = events
                    Task {
                        for event in capturedEvents {
                            for t in event.translations {
                                let record = TranslationRecord(
                                    id: t.id,
                                    messageLocalId: t.messageId,
                                    messageServerId: t.messageId,
                                    targetLanguage: t.targetLanguage,
                                    translatedContent: t.translatedContent,
                                    translationModel: t.translationModel,
                                    confidenceScore: t.confidenceScore,
                                    sourceLanguage: t.sourceLanguage,
                                    receivedAt: Date()
                                )
                                do {
                                    try await persistence.saveTranslation(record)
                                } catch {
                                    Logger.messages.error("Persistence saveTranslation failed: \(error, privacy: .public) messageId=\(t.messageId, privacy: .public) lang=\(t.targetLanguage, privacy: .public)")
                                }
                            }
                        }
                    }
                }
            }
            .store(in: &cancellables)

        // Transcription ready
        socketManager.transcriptionReady
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                let segments = (event.transcription.segments ?? []).map { s in
                    MessageTranscriptionSegment(
                        text: s.text,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        speakerId: s.speakerId
                    )
                }
                let transcription = MessageTranscription(
                    attachmentId: event.attachmentId,
                    text: event.transcription.text,
                    language: event.transcription.language,
                    confidence: event.transcription.confidence,
                    durationMs: event.transcription.durationMs,
                    segments: segments,
                    speakerCount: event.transcription.speakerCount
                )
                // Per-message dict (single-audio backward compat)
                delegate.messageTranscriptions[event.messageId] = transcription
                // Per-attachment dict (multi-audio karaoke realtime fix):
                // mirrors how all 3 VM hydration sites populate both dicts.
                delegate.messageTranscriptionsByAttachment[event.attachmentId] = transcription
            }
            .store(in: &cancellables)

        // Audio translation (all 3 events use same handler)
        let audioHandler: (AudioTranslationEvent) -> Void = { [weak self] event in
            guard let delegate = self?.delegate else { return }
            guard event.conversationId == convId else { return }
            let msgId = event.messageId
            let segments = (event.translatedAudio.segments ?? []).map { s in
                MessageTranscriptionSegment(
                    text: s.text,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    speakerId: s.speakerId
                )
            }
            let audio = MessageTranslatedAudio(
                id: event.translatedAudio.id,
                attachmentId: event.attachmentId,
                targetLanguage: event.translatedAudio.targetLanguage,
                url: event.translatedAudio.url,
                transcription: event.translatedAudio.transcription,
                durationMs: event.translatedAudio.durationMs,
                format: event.translatedAudio.format,
                cloned: event.translatedAudio.cloned,
                quality: event.translatedAudio.quality,
                voiceModelId: event.translatedAudio.voiceModelId,
                ttsModel: event.translatedAudio.ttsModel,
                segments: segments
            )
            // Per-message dict (single-audio backward compat): dedup by
            // targetLanguage only.
            var existing = delegate.messageTranslatedAudios[msgId] ?? []
            if let idx = existing.firstIndex(where: { $0.targetLanguage == audio.targetLanguage }) {
                existing[idx] = audio
            } else {
                existing.append(audio)
            }
            delegate.messageTranslatedAudios[msgId] = existing
            // Per-attachment dict (multi-audio Prisme realtime fix): dedup
            // scoped to (attachmentId, targetLanguage) so each track keeps its
            // own language buttons. Mirrors how the transcription handler
            // populates `messageTranscriptionsByAttachment`.
            var existingForAttachment = delegate.messageTranslatedAudiosByAttachment[event.attachmentId] ?? []
            if let idx = existingForAttachment.firstIndex(where: { $0.targetLanguage == audio.targetLanguage }) {
                existingForAttachment[idx] = audio
            } else {
                existingForAttachment.append(audio)
            }
            delegate.messageTranslatedAudiosByAttachment[event.attachmentId] = existingForAttachment
        }

        socketManager.audioTranslationReady
            .receive(on: DispatchQueue.main)
            .sink(receiveValue: audioHandler)
            .store(in: &cancellables)

        socketManager.audioTranslationProgressive
            .receive(on: DispatchQueue.main)
            .sink(receiveValue: audioHandler)
            .store(in: &cancellables)

        socketManager.audioTranslationCompleted
            .receive(on: DispatchQueue.main)
            .sink(receiveValue: audioHandler)
            .store(in: &cancellables)
    }
}
