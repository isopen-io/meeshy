import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes, et ne change AUCUN
// comportement — les corps sont déplacés à l'identique.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : le PRISME LINGUISTIQUE côté conversation — le type
// `MessageTranslation`, l'extraction des traductions et des transcriptions des
// réponses REST, les demandes de traduction à la volée (texte et audio), la
// relance de transcription quand Whisper n'avait pas fini, et la RÉSOLUTION de
// la traduction préférée. Cette dernière garde sa règle intacte : aucune
// traduction ne matche le prisme ⇒ `nil` ⇒ on sert l'ORIGINAL, jamais
// `translations.first`.

// MARK: - Real-time Translation Type (text translations, not in SDK)

struct MessageTranslation: Identifiable, Equatable {
    let id: String
    let messageId: String
    let sourceLanguage: String
    let targetLanguage: String
    let translatedContent: String
    let translationModel: String
    let confidenceScore: Double?
}

// MessageTranscription, MessageTranscriptionSegment, MessageTranslatedAudio
// are defined in MeeshySDK.TranscriptionModels — use those directly.

extension ConversationViewModel {

    // MARK: - Extract Text Translations from REST Responses

    func extractTextTranslations(from apiMessages: [APIMessage]) {
        let prismeLangs = Set(preferredLanguages.map { $0.lowercased() })
        for msg in apiMessages {
            guard let translations = msg.translations, !translations.isEmpty else { continue }
            var existing = messageTranslations[msg.id] ?? []
            for t in translations {
                guard prismeLangs.contains(t.targetLanguage.lowercased()) else { continue }
                let mt = MessageTranslation(
                    id: t.id,
                    messageId: t.messageId,
                    sourceLanguage: t.sourceLanguage ?? msg.originalLanguage ?? "auto",
                    targetLanguage: t.targetLanguage,
                    translatedContent: t.translatedContent,
                    translationModel: t.translationModel,
                    confidenceScore: t.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msg.id] = existing
            translationResolutionCache.removeValue(forKey: msg.id)
        }
    }

    func hydrateTranslationsFromCache(messageIds: [String]? = nil) async {
        let msgIds = messageIds ?? messages.map(\.id)
        let prismeLangs = Set(preferredLanguages.map { $0.lowercased() })

        // 1. In-memory CacheCoordinator (fast, volatile)
        let cached = await CacheCoordinator.shared.cachedTranslations(for: msgIds)
        for (msgId, translations) in cached {
            var existing = messageTranslations[msgId] ?? []
            for t in translations {
                guard prismeLangs.contains(t.targetLanguage.lowercased()) else { continue }
                let mt = MessageTranslation(
                    id: t.id,
                    messageId: t.messageId,
                    sourceLanguage: t.sourceLanguage,
                    targetLanguage: t.targetLanguage,
                    translatedContent: t.translatedContent,
                    translationModel: t.translationModel,
                    confidenceScore: t.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msgId] = existing
            translationResolutionCache.removeValue(forKey: msgId)
        }

        // 2. GRDB fallback — for message IDs not covered by the volatile cache,
        //    read persisted TranslationRecords so cold-start shows translations
        //    instantly without waiting for a REST round-trip.
        let uncoveredIds = msgIds.filter { messageTranslations[$0] == nil || messageTranslations[$0]?.isEmpty == true }
        guard !uncoveredIds.isEmpty else { return }
        let reader = messagePersistence.reader
        let grdbTranslations: [String: [TranslationRecord]] = (try? await reader.read { db in
            let records = try TranslationRecord
                .filter(uncoveredIds.contains(Column("messageLocalId")))
                .fetchAll(db)
            return Dictionary(grouping: records, by: \.messageLocalId)
        }) ?? [:]

        for (msgId, records) in grdbTranslations {
            var existing = messageTranslations[msgId] ?? []
            for r in records {
                guard prismeLangs.contains(r.targetLanguage.lowercased()) else { continue }
                let mt = MessageTranslation(
                    id: r.id,
                    messageId: msgId,
                    sourceLanguage: r.sourceLanguage ?? "auto",
                    targetLanguage: r.targetLanguage,
                    translatedContent: r.translatedContent,
                    translationModel: r.translationModel,
                    confidenceScore: r.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msgId] = existing
            translationResolutionCache.removeValue(forKey: msgId)
        }
    }

    /// Pré-hydrate `messageTranslations` depuis GRDB AVANT que `messageStore`
    /// ne fasse surfacer les messages. Sans ça, les bulles se rendent une
    /// première fois sans traduction, puis re-rendent quand
    /// `hydrateTranslationsFromCache()` (appelé après `loadInitial`) se termine
    /// — d'où l'apparition « en second temps » des données de langue. En
    /// peuplant le dictionnaire en amont, le tout premier rendu applique déjà
    /// le Prisme Linguistique (contenu traduit affiché comme du natif).
    func hydratePersistedTranslations() async {
        let convId = conversationId
        let reader = messagePersistence.reader
        let grouped: [String: [TranslationRecord]] = (try? await reader.read { db in
            // grdb-07 — un message "own" est keyé localId=cid en GRDB mais ses
            // traductions sont persistées sous l'id SERVEUR : filtrer sur le
            // seul localId ne matchait rien pour ces messages.
            let localIds = try MessageRecord
                .filter(Column("conversationId") == convId)
                .order(Column("createdAt").desc)
                .limit(80)
                .fetchAll(db)
                .flatMap { [$0.localId, $0.serverId].compactMap { $0 } }
            guard !localIds.isEmpty else { return [:] }
            let records = try TranslationRecord
                .filter(localIds.contains(Column("messageLocalId")))
                .fetchAll(db)
            return Dictionary(grouping: records, by: \.messageLocalId)
        }) ?? [:]

        guard !grouped.isEmpty else { return }

        let prismeLangs = Set(preferredLanguages.map { $0.lowercased() })
        for (msgId, records) in grouped {
            var existing = messageTranslations[msgId] ?? []
            for r in records {
                guard prismeLangs.contains(r.targetLanguage.lowercased()) else { continue }
                let mt = MessageTranslation(
                    id: r.id,
                    messageId: msgId,
                    sourceLanguage: r.sourceLanguage ?? "auto",
                    targetLanguage: r.targetLanguage,
                    translatedContent: r.translatedContent,
                    translationModel: r.translationModel,
                    confidenceScore: r.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msgId] = existing
            translationResolutionCache.removeValue(forKey: msgId)
        }
    }

    /// Éviction des traductions d'un message dont le CONTENU vient de changer.
    ///
    /// Le gateway invalide les siennes à l'ÉCRITURE (`translations: null` posé
    /// dans le même `updateMany` que `content`) ; ceci en est le jumeau client.
    /// Une traduction d'un contenu périmé n'est pas une traduction.
    ///
    /// Les QUATRE caches tombent ensemble, et c'est le point : vider le seul
    /// dictionnaire en mémoire range le message parmi les « non couverts » de
    /// `hydrateTranslationsFromCache`, qui le RÉINJECTE depuis le
    /// CacheCoordinator puis depuis GRDB — le texte périmé survivrait alors au
    /// redémarrage. Pendant la fenêtre, l'ORIGINAL est servi (règle 1 du
    /// Prisme) jusqu'à la prochaine `translation:completed`, qui réalimente le
    /// dictionnaire langue par langue.
    ///
    /// La bascule MANUELLE tombe avec eux : `activeTranslationOverrides`
    /// COURT-CIRCUITE les quatre autres dans `preferredTranslation(for:)`, un
    /// override survivant afficherait donc le texte d'avant l'édition alors
    /// même que tout le reste est vide. La clé est RETIRÉE, jamais écrasée par
    /// `nil` — une clé présente valant `nil` signifie « le lecteur a demandé
    /// l'ORIGINAL », un choix qu'il n'a pas fait ici.
    ///
    /// Les deux ESPACES D'IDS sont évincés : une bulle optimiste vit sous son
    /// `temp_…` pendant que les deux caches persistants sont déjà keyés par
    /// l'id SERVEUR (`pendingServerIds`), et l'édition est le seul chemin que
    /// l'utilisateur déclenche lui-même — sur SES messages, donc justement
    /// ceux qui portent un id temporaire. Inerte sur le chemin socket, où
    /// `serverId(for:)` rend l'id reçu.
    func invalidateTranslations(for messageId: String) {
        let resolved = serverId(for: messageId)
        messageTranslations.removeValue(forKey: messageId)
        translationResolutionCache.removeValue(forKey: messageId)
        activeTranslationOverrides.removeValue(forKey: messageId)
        if resolved != messageId {
            messageTranslations.removeValue(forKey: resolved)
            translationResolutionCache.removeValue(forKey: resolved)
            activeTranslationOverrides.removeValue(forKey: resolved)
        }
        let persistence = messagePersistence
        let ids = resolved == messageId ? [messageId] : [messageId, resolved]
        Task {
            for id in ids {
                await CacheCoordinator.shared.invalidateTranslations(for: id)
                do {
                    try await persistence.deleteTranslations(messageLocalId: id)
                } catch {
                    Logger.messages.warning("[ConversationVM] deleteTranslations failed \(id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    func setActiveTranslation(for messageId: String, translation: MessageTranslation?) {
        activeTranslationOverrides[messageId] = translation
    }

    /// Sélection de langue AUDIO (vue Langue du menu d'appui long, fin d'une
    /// traduction audio à la demande) — DÉLÈGUE au canal unique du message
    /// (`bubbleLanguageSelections`), le seul que l'hôte observe et que
    /// `playAudio`/`syncActiveTrack` lisent. `activeAudioLanguageOverrides`
    /// était un canal MORT (écrit ici, lu par personne — revue adversariale
    /// 2026-08-18) : sélectionner une langue dans la vue Langue ne changeait
    /// ni la piste, ni le karaoké, ni le drapeau.
    func setActiveAudioLanguage(for messageId: String, language: String?) {
        setBubbleActiveDisplayLanguage(language, for: messageId)
    }

    /// On-demand text translation, triggered by "Traduire" in the language
    /// detail view. Owning the in-flight flag AND the network call here
    /// (rather than in the view) is what lets the loader survive the sheet
    /// being dismissed and re-presented.
    func requestTextTranslation(
        messageId: String, content: String, sourceLanguage: String, targetLanguage: String
    ) async {
        guard !(translatingTextLanguages[messageId]?.contains(targetLanguage) ?? false) else { return }
        translatingTextLanguages[messageId, default: []].insert(targetLanguage)
        defer { translatingTextLanguages[messageId]?.remove(targetLanguage) }

        do {
            let response = try await translationService.translate(
                text: content, sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage, messageId: messageId
            )
            let translation = MessageTranslation(
                id: "\(messageId)-\(targetLanguage)",
                messageId: messageId,
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage,
                translatedContent: response.translatedText,
                translationModel: "on-demand",
                confidenceScore: nil
            )
            var existing = messageTranslations[messageId] ?? []
            if let idx = existing.firstIndex(where: { $0.targetLanguage == targetLanguage }) {
                existing[idx] = translation
            } else {
                existing.append(translation)
            }
            messageTranslations[messageId] = existing
            setActiveTranslation(for: messageId, translation: translation)
        } catch {
            translationRequestFailed.send(.init(
                messageId: messageId, language: targetLanguage, kind: .text,
                message: error.localizedDescription
            ))
        }
    }

    /// On-demand audio translation (transcription+NLLB+TTS pipeline behind
    /// `POST /attachments/:id/translate`). Same in-flight-in-the-VM rationale
    /// as `requestTextTranslation`; additionally persists the result into
    /// `messageTranslatedAudios` so a second open of the language sheet
    /// never re-triggers the full pipeline for a language already fetched.
    func requestAudioTranslation(
        messageId: String, attachmentId: String, sourceLanguage: String, targetLanguage: String
    ) async {
        guard !(translatingAudioLanguages[messageId]?.contains(targetLanguage) ?? false) else { return }
        translatingAudioLanguages[messageId, default: []].insert(targetLanguage)
        defer { translatingAudioLanguages[messageId]?.remove(targetLanguage) }

        do {
            let response = try await attachmentTranslationService.translate(
                attachmentId: attachmentId, targetLanguages: [targetLanguage],
                sourceLanguage: sourceLanguage, generateVoiceClone: false
            )
            messageTranslatedAudios[messageId] = MessageLanguageDetailView.mergeAudioTranslations(
                existing: messageTranslatedAudios[messageId] ?? [],
                incoming: response.translations,
                attachmentId: attachmentId
            )
            setActiveAudioLanguage(for: messageId, language: targetLanguage)
        } catch {
            let message = (error as? AttachmentConsentError)?.message ?? error.localizedDescription
            translationRequestFailed.send(.init(
                messageId: messageId, language: targetLanguage, kind: .audio, message: message
            ))
        }
    }

    // MARK: - Résolution du Prisme (traduction préférée)

    func preferredTranslation(for messageId: String) -> MessageTranslation? {
        if let override = activeTranslationOverrides[messageId] {
            return override
        }
        if cachedRevisionForTranslation != preferredLanguageRevision {
            translationResolutionCache.removeAll()
            cachedRevisionForTranslation = preferredLanguageRevision
        }
        switch translationResolutionCache[messageId] {
        case .some(let cached):
            return cached
        case .none:
            break
        }
        guard let translations = messageTranslations[messageId], !translations.isEmpty else {
            translationResolutionCache.updateValue(nil, forKey: messageId)
            return nil
        }

        let originalLang = messageIndex(for: messageId)
            .map { messages[$0].originalLanguage.lowercased() }

        let langs = preferredLanguages
        for lang in langs {
            let langLower = lang.lowercased()
            if let orig = originalLang, orig == langLower {
                translationResolutionCache.updateValue(nil, forKey: messageId)
                return nil
            }
            if let match = translations.first(where: { $0.targetLanguage.lowercased() == langLower }) {
                translationResolutionCache[messageId] = match
                return match
            }
        }
        translationResolutionCache.updateValue(nil, forKey: messageId)
        return nil
    }

    /// Version linguistique que le lecteur a RÉELLEMENT sous les yeux pour ce
    /// message.
    ///
    /// Ce n'est pas sa langue préférée : sans traduction disponible, c'est
    /// l'ORIGINAL qui s'affiche. La résolution suit donc exactement celle du
    /// TEXTE (`preferredTranslation(for:)`) via `ConsumedLanguageResolver` —
    /// toute divergence entre les deux produirait une statistique fausse.
    ///
    /// Une bascule manuelle prime : le lecteur a explicitement ouvert cette
    /// version-là.
    func consumedLanguage(for messageId: String) -> String? {
        guard let index = messageIndex(for: messageId) else { return nil }
        let manual = activeTranslationOverrides[messageId].flatMap { $0?.targetLanguage }
        return ConsumedLanguageResolver.resolve(
            originalLanguage: messages[index].originalLanguage,
            availableTranslations: (messageTranslations[messageId] ?? []).map(\.targetLanguage),
            preferredLanguages: preferredLanguages,
            manualSelection: manual
        )
    }

    /// Répartit un lot entre la langue DOMINANTE et ses exceptions — la forme
    /// qu'attend le corps de `mark-read`. Miroir de `splitConsumedLanguages`
    /// côté web : sur une conversation lue d'une traite, la table d'exceptions
    /// est vide et rien de superflu ne voyage.
    func splitConsumedLanguages(
        for messageIds: [String]
    ) -> (language: String?, exceptions: [String: String]) {
        var resolved: [String: String] = [:]
        var counts: [String: Int] = [:]
        for id in messageIds {
            guard let code = consumedLanguage(for: id) else { continue }
            resolved[id] = code
            counts[code, default: 0] += 1
        }

        // À égalité, le code alphabétiquement premier : deux exécutions sur les
        // mêmes données doivent produire le même corps de requête.
        guard let dominant = counts
            .sorted(by: { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key })
            .first?.key
        else { return (nil, [:]) }

        let exceptions = resolved.filter { $0.value != dominant }
        return (dominant, exceptions)
    }

    // MARK: - Transcription Retry for Audio Messages

    /// When Whisper has not finished transcribing an audio attachment by the
    /// time the REST response arrives, `attachment.transcription` is nil.
    /// This method collects those message IDs and schedules a single retry
    /// fetch after 5 seconds so the transcription is surfaced on the second
    /// attempt (Whisper typically completes within 3–15 s).
    func scheduleTranscriptionRetry(for apiMessages: [APIMessage]) {
        let audioMissingTranscription = apiMessages.filter { msg in
            msg.attachments?.contains(where: { att in
                guard let mime = att.mimeType, mime.hasPrefix("audio/") else { return false }
                return att.transcription == nil
            }) ?? false
        }
        guard !audioMissingTranscription.isEmpty else { return }

        let msgIds = audioMissingTranscription.map(\.id)
        let convId = conversationId
        Logger.messages.info("[TranscriptionRetry] Scheduling retry for \(msgIds.count) audio message(s) missing transcription")

        Task { [weak self, messageService] in
            try? await Task.sleep(for: .seconds(5))
            guard let self, !Task.isCancelled else { return }

            // Re-fetch the same messages from REST; by now Whisper should have
            // finished transcribing. We use `listAround` with the first message
            // to get a window that includes the missing ones.
            for msgId in msgIds {
                guard !Task.isCancelled else { return }
                do {
                    let response = try await messageService.listAround(
                        conversationId: convId,
                        around: msgId,
                        limit: 5,
                        includeReplies: false,
                        includeTranslations: true
                    )
                    await MainActor.run {
                        self.extractAttachmentTranscriptions(from: response.data)
                    }
                } catch {
                    Logger.messages.warning("[TranscriptionRetry] Retry failed for \(msgId): \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Extract Transcription/Translation Data from REST Responses

    func extractAttachmentTranscriptions(from apiMessages: [APIMessage]) {
        for msg in apiMessages {
            for att in msg.attachments ?? [] {
                if let t = att.transcription {
                    let segments = (t.segments ?? []).map {
                        MessageTranscriptionSegment(
                            text: $0.text,
                            startTime: $0.startTime,
                            endTime: $0.endTime,
                            speakerId: $0.speakerId
                        )
                    }
                    let transcription = MessageTranscription(
                        attachmentId: att.id,
                        text: t.resolvedText,
                        language: t.language ?? "?",
                        confidence: t.confidence,
                        durationMs: t.durationMs,
                        segments: segments,
                        speakerCount: t.speakerCount
                    )
                    messageTranscriptions[msg.id] = transcription
                    messageTranscriptionsByAttachment[att.id] = transcription
                }
                if let translations = att.translations {
                    var audios: [MessageTranslatedAudio] = []
                    for (lang, trans) in translations {
                        guard let url = trans.url, !url.isEmpty else { continue }
                        let segments = (trans.segments ?? []).map {
                            MessageTranscriptionSegment(
                                text: $0.text,
                                startTime: $0.startTime,
                                endTime: $0.endTime,
                                speakerId: $0.speakerId
                            )
                        }
                        audios.append(MessageTranslatedAudio(
                            id: "\(att.id)_\(lang)",
                            attachmentId: att.id,
                            targetLanguage: lang,
                            url: url,
                            transcription: trans.transcription ?? "",
                            durationMs: trans.durationMs ?? 0,
                            format: trans.format ?? "mp3",
                            cloned: trans.cloned ?? false,
                            quality: trans.quality ?? 0,
                            voiceModelId: trans.voiceModelId,
                            ttsModel: trans.ttsModel ?? "xtts",
                            segments: segments
                        ))
                    }
                    if !audios.isEmpty {
                        messageTranslatedAudios[msg.id] = audios
                        messageTranslatedAudiosByAttachment[att.id] = audios
                    }
                }
            }
        }
    }
}
