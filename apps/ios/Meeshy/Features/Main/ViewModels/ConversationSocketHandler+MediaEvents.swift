import Foundation
import Combine
import MeeshySDK
import os

// MARK: - ConversationSocketHandler + Media/Attachment Events

/// **Événements d'ENRICHISSEMENT et de CONSOMMATION d'une pièce jointe** —
/// extrait de `ConversationSocketHandler.subscribeToSocket()` (I4, #7360).
/// La frontière suit une RESPONSABILITÉ : tout ce qui touche une pièce jointe
/// APRÈS son envoi — réactions, statut de consommation (écouté / visionné /
/// téléchargé), transcription et traduction audio finalisées côté serveur —
/// vit ici.
///
/// Ces événements entrent dans la MÊME file ordonnée que ceux des messages
/// (`OrderedEventLane`, #11047) : un enrichissement reçu juste après son
/// `message:new` s'applique après lui, jamais devant.
///
/// `cancellables`, `persistence` et `delegate` sont accédés directement sur
/// `self` : `ConversationSocketHandler` les déclare `internal` exactement pour
/// permettre ce découpage en extensions par fichier.
extension ConversationSocketHandler {

    func subscribeToMediaEvents(
        socketManager: MessageSocketProviding,
        convId: String,
        userId: String,
        on lane: OrderedEventLane
    ) {
        subscribeAttachmentEvents(socketManager: socketManager, convId: convId, userId: userId, on: lane)
        subscribeEnrichmentEvents(socketManager: socketManager, convId: convId, on: lane)
    }

    private func subscribeAttachmentEvents(
        socketManager: MessageSocketProviding,
        convId: String,
        userId: String,
        on lane: OrderedEventLane
    ) {
        socketManager.attachmentReactionAdded
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyAttachmentReaction($0) }
            .store(in: &cancellables)

        socketManager.attachmentReactionRemoved
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyAttachmentReaction($0) }
            .store(in: &cancellables)

        socketManager.attachmentStatusUpdated
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyAttachmentStatus($0, userId: userId) }
            .store(in: &cancellables)

        // Attachment payload enriched server-side (transcription finalized,
        // audio translation finalized for one language). Le délégué injecte les
        // dictionnaires de métadonnées atomiquement + upsert GRDB.
        socketManager.attachmentUpdated
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyAttachmentUpdated($0) }
            .store(in: &cancellables)

        socketManager.messageConsumed
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyMessageConsumed($0) }
            .store(in: &cancellables)
    }

    private func subscribeEnrichmentEvents(
        socketManager: MessageSocketProviding,
        convId: String,
        on lane: OrderedEventLane
    ) {
        // Translation received — coalesce bursts (le serveur peut émettre 5+
        // traductions pour le même message en ~50 ms). Un `.collect(.byTime)`
        // donne UNE écriture `@Published` au lieu de N : ~80 % de ré-évaluations
        // de body en moins sur les groupes multilingues. Le lot entre ensuite
        // dans la file, comme tout le reste.
        socketManager.translationReceived
            .collect(.byTime(DispatchQueue.main, .milliseconds(80)))
            .filter { !$0.isEmpty }
            .relay(through: lane) { [weak self] in await self?.applyTranslations($0) }
            .store(in: &cancellables)

        socketManager.transcriptionReady
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyTranscription($0) }
            .store(in: &cancellables)

        socketManager.audioTranslationReady
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyAudioTranslation($0) }
            .store(in: &cancellables)

        socketManager.audioTranslationProgressive
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyAudioTranslation($0) }
            .store(in: &cancellables)

        socketManager.audioTranslationCompleted
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyAudioTranslation($0) }
            .store(in: &cancellables)
    }

    // MARK: - Attachments

    /// BUG2 A' — réactions par-image : le delta porte le reactionSummary
    /// autoritaire ; on remplace les comptes in-memory (currentUserReactions
    /// reste géré optimiste côté VM, comme message-level).
    private func applyAttachmentReaction(_ event: AttachmentReactionUpdateEvent) {
        guard let delegate, let summary = event.reactionSummary else { return }
        delegate.applyAttachmentReactionDelta(attachmentId: event.attachmentId, reactionSummary: summary)
    }

    private func applyAttachmentStatus(_ event: AttachmentStatusUpdatedEvent, userId: String) async {
        // At-rest consumption tint (waveform/progress bar) : seul l'écho de
        // NOTRE PROPRE lecture (multi-appareil) peut nourrir ce store — il est
        // documenté et purgé comme état d'un utilisateur local unique, donc la
        // progression d'un autre participant ne doit jamais teinter MA bulle.
        if event.userId == userId,
           let playPositionMs = event.playPositionMs,
           let durationMs = event.durationMs, durationMs > 0 {
            let fraction = Double(playPositionMs) / Double(durationMs)
            MediaConsumptionStore.shared.record(
                fraction: fraction, complete: fraction >= 1, for: event.attachmentId)
        }
        guard let persistence else { return }
        // Touch the record so the store observation fires and bubbles
        // re-render with the updated attachment status.
        do {
            try await persistence.touchUpdatedAt(localId: event.messageId)
        } catch {
            Logger.messages.error("Persistence touchUpdatedAt failed: \(error, privacy: .public) messageId=\(event.messageId, privacy: .public)")
        }
        await markConsumedByAllIfComplete(event, userId: userId, in: persistence)
    }

    /// I4 (#7360) — un rapport d'un AUTRE participant, dans une conversation
    /// 1:1, fait de ce destinataire TOUTE l'audience : `AttachmentConsumptionResolver`
    /// (même juge « tout ou rien » que `DeliveryStatusResolver` pour les
    /// accusés de lecture) marque l'action primaire complète-par-tous depuis ce
    /// SEUL événement. Un groupe ne peut pas dire QUEL membre a rapporté ;
    /// créditer un rapport partiel comme « par tous » serait pire que se taire.
    /// L'AUTEUR n'est jamais un destinataire (`MessageMediaConsumptionService
    /// .updateAttachmentComputedStatus`). Le rapport doit viser l'action
    /// PRIMAIRE du type de média : un « téléchargé » sur un vocal enregistré
    /// dans Fichiers n'est pas la preuve que quelqu'un l'a écouté.
    private func markConsumedByAllIfComplete(
        _ event: AttachmentStatusUpdatedEvent, userId: String, in persistence: MessagePersistenceActor
    ) async {
        guard event.userId != userId,
              let delegate,
              let messageIndex = delegate.messageIndex(for: event.messageId),
              delegate.messages[messageIndex].senderId != event.userId,
              delegate.messages[messageIndex].recipientCount == 1,
              let attachment = delegate.messages[messageIndex].attachments.first(where: { $0.id == event.attachmentId }),
              let confirmedAt = event.updatedAt
        else { return }
        let message = delegate.messages[messageIndex]

        let primaryAction = AttachmentConsumptionResolver.primaryAction(forMimeType: attachment.mimeType)
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

    private func applyAttachmentUpdated(_ event: AttachmentUpdatedEvent) {
        delegate?.applyAttachmentUpdate(event)
    }

    /// #7579 — une vue unique se consomme PAR PERSONNE : ce qu'un autre ouvre
    /// ne retire RIEN chez moi. Seul le compteur est tenu ; la destruction,
    /// quand tous l'ont ouverte, arrive par `message:deleted`, qui rend la
    /// bulle « déjà ouverte ».
    private func applyMessageConsumed(_ event: MessageConsumedEvent) async {
        guard let persistence else { return }
        do {
            try await persistence.updateViewOnceCount(localId: event.messageId, count: event.viewOnceCount)
        } catch {
            Logger.messages.error("Persistence updateViewOnceCount failed: \(error, privacy: .public) messageId=\(event.messageId, privacy: .public)")
        }
    }

    // MARK: - Enrichments

    private func applyTranslations(_ events: [TranslationEvent]) async {
        if let delegate {
            mergeTranslations(events, into: delegate)
        }
        guard let persistence else { return }
        await persistTranslations(events, in: persistence)
    }

    private func mergeTranslations(_ events: [TranslationEvent], into delegate: ConversationSocketDelegate) {
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
        // Single assignment so SwiftUI publishes once per burst regardless of
        // how many messages/languages came in.
        guard !buckets.isEmpty else { return }
        var next = delegate.messageTranslations
        for (msgId, merged) in buckets { next[msgId] = merged }
        delegate.messageTranslations = next
    }

    private func persistTranslations(_ events: [TranslationEvent], in persistence: MessagePersistenceActor) async {
        for event in events {
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

    private func applyTranscription(_ event: TranscriptionReadyEvent) {
        guard let delegate else { return }
        let segments = (event.transcription.segments ?? []).map(MessageTranscriptionSegment.init)
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
        // Per-attachment dict (multi-audio karaoke realtime fix) : reflète les
        // trois sites d'hydratation du VM, qui peuplent les deux dictionnaires.
        delegate.messageTranscriptionsByAttachment[event.attachmentId] = transcription
    }

    /// Les trois événements d'audio traduit (prêt, progressif, terminé) ont le
    /// même effet.
    private func applyAudioTranslation(_ event: AudioTranslationEvent) {
        guard let delegate else { return }
        let segments = (event.translatedAudio.segments ?? []).map(MessageTranscriptionSegment.init)
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
        // Per-message dict (single-audio backward compat) : dédoublonné par
        // langue cible seule. Per-attachment dict (multi-audio Prisme realtime) :
        // même règle, par pièce jointe, pour que chaque piste garde ses boutons.
        delegate.messageTranslatedAudios[event.messageId] = Self.upserting(
            audio, into: delegate.messageTranslatedAudios[event.messageId] ?? [])
        delegate.messageTranslatedAudiosByAttachment[event.attachmentId] = Self.upserting(
            audio, into: delegate.messageTranslatedAudiosByAttachment[event.attachmentId] ?? [])
    }

    private static func upserting(
        _ audio: MessageTranslatedAudio, into tracks: [MessageTranslatedAudio]
    ) -> [MessageTranslatedAudio] {
        var next = tracks
        if let idx = next.firstIndex(where: { $0.targetLanguage == audio.targetLanguage }) {
            next[idx] = audio
        } else {
            next.append(audio)
        }
        return next
    }
}
