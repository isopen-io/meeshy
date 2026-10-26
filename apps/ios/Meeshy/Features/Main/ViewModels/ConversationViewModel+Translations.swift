import Foundation
import Combine
import UIKit
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
    /// FACULTATIF — le fil ne garantit pas le modèle (audit iOS ↔ passerelle,
    /// 2026-09-11) : une entrée de `Message.translations` écrite par une version
    /// antérieure n'en porte pas, et le schéma wire ne la déclare pas
    /// `nullable`, donc elle arrive absente. Aucune surface ne l'affiche ; la
    /// rendre obligatoire ne protégeait rien et coûtait la traduction entière.
    let translationModel: String?
    let confidenceScore: Double?
}

// MessageTranscription, MessageTranscriptionSegment, MessageTranslatedAudio
// are defined in MeeshySDK.TranscriptionModels — use those directly.

extension ConversationViewModel {

    // MARK: - Extract Text Translations from REST Responses

    func extractTextTranslations(from apiMessages: [APIMessage]) {
        let prism = MessageTranslationMerge.prism(of: preferredLanguages)
        for msg in apiMessages {
            guard let translations = msg.translations, !translations.isEmpty else { continue }
            absorbTranslations(
                MessageTranslationMerge.translations(from: translations, originalLanguage: msg.originalLanguage),
                for: msg.id, prism: prism
            )
        }
    }

    private func absorbTranslations(_ incoming: [MessageTranslation], for messageId: String, prism: Set<String>) {
        messageTranslations[messageId] = MessageTranslationMerge.merging(
            incoming, into: messageTranslations[messageId] ?? [], prism: prism
        )
        translationResolutionCache.removeValue(forKey: messageId)
    }

    func hydrateTranslationsFromCache(messageIds: [String]? = nil) async {
        let msgIds = messageIds ?? messages.map(\.id)
        let prism = MessageTranslationMerge.prism(of: preferredLanguages)

        let cached = await translationSource.cached(for: msgIds)
        for (msgId, translations) in cached {
            absorbTranslations(MessageTranslationMerge.translations(from: translations), for: msgId, prism: prism)
        }

        let uncoveredIds = msgIds.filter { messageTranslations[$0] == nil || messageTranslations[$0]?.isEmpty == true }
        guard !uncoveredIds.isEmpty else { return }
        let persisted = await translationSource.persisted(for: uncoveredIds)
        for (msgId, records) in persisted {
            absorbTranslations(MessageTranslationMerge.translations(from: records, messageId: msgId), for: msgId, prism: prism)
        }
    }

    /// Pré-hydrate `messageTranslations` depuis GRDB AVANT que `messageStore`
    /// ne fasse surfacer les messages : le tout premier rendu applique déjà le
    /// Prisme Linguistique, sans second temps.
    func hydratePersistedTranslations() async {
        let grouped = await translationSource.recentPersisted(conversationId: conversationId, limit: 80)
        guard !grouped.isEmpty else { return }
        let prism = MessageTranslationMerge.prism(of: preferredLanguages)
        for (msgId, records) in grouped {
            absorbTranslations(MessageTranslationMerge.translations(from: records, messageId: msgId), for: msgId, prism: prism)
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
        let source = translationSource
        let ids = resolved == messageId ? [messageId] : [messageId, resolved]
        Task { await source.purge(ids: ids) }
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
    /// Fail-closed en E2EE (#11214) : `ServerTranslationAdmission`.
    func requestTextTranslation(
        messageId: String, content: String, sourceLanguage: String, targetLanguage: String, conversationEncryptionMode: String?
    ) async {
        guard ServerTranslationAdmission.admits(messageIndex(for: messageId).map { messages[$0] }, conversationEncryptionMode: startupDependencies.encryptedEra.encryptionMode(conversationEncryptionMode, in: self)) else { return translationRequestFailed.send(.serverRefused(messageId: messageId, language: targetLanguage, kind: .text)) }
        guard !(translatingTextLanguages[messageId]?.contains(targetLanguage) ?? false) else { return }
        translatingTextLanguages[messageId, default: []].insert(targetLanguage)
        defer { translatingTextLanguages[messageId]?.remove(targetLanguage) }

        do {
            let response = try await translationService.translate(
                text: content, sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage, messageId: messageId
            )
            let translation = MessageTranslation(
                id: "\(messageId)-\(targetLanguage)", messageId: messageId, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage,
                translatedContent: response.translatedText, translationModel: "on-demand", confidenceScore: nil
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
        messageId: String, attachmentId: String, sourceLanguage: String, targetLanguage: String, conversationEncryptionMode: String?
    ) async {
        guard ServerTranslationAdmission.admits(messageIndex(for: messageId).map { messages[$0] }, conversationEncryptionMode: startupDependencies.encryptedEra.encryptionMode(conversationEncryptionMode, in: self)) else { return translationRequestFailed.send(.serverRefused(messageId: messageId, language: targetLanguage, kind: .audio)) }
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
        if let override = activeTranslationOverrides[messageId], startupDependencies.encryptedEra.serves(override, for: messageId, in: self) {
            return override
        }
        if cachedRevisionForTranslation != preferredLanguageRevision {
            translationResolutionCache.removeAll()
            cachedRevisionForTranslation = preferredLanguageRevision
        }
        // #9191 — le prisme se lit AVANT le cache : un profil arrivé après une
        // première résolution (connexion neuve) change le prisme, et la lecture
        // de `preferredLanguages` vide alors les résolutions faites sans lui.
        let readerPrism = preferredLanguages
        switch translationResolutionCache[messageId] {
        case .some(let cached):
            return cached
        case .none:
            break
        }
        guard case let translations = startupDependencies.encryptedEra.servedTranslations(for: messageId, in: self), !translations.isEmpty else {
            translationResolutionCache.updateValue(nil, forKey: messageId)
            return nil
        }

        // #8896 — la langue d'origine se lit sur le message de la fenêtre. Un
        // message pas encore entré dans `messages` (rendu depuis le magasin
        // avant le miroir) n'en a pas : elle se lit alors sur les traductions,
        // et la résolution reste PROVISOIRE — jamais mise en cache, sinon le
        // rang 2 servi trop tôt collait à la bulle (le `didSet` de `messages`
        // ne vide pas ce cache).
        let windowOrigin = messageIndex(for: messageId)
            .map { messages[$0].originalLanguage.lowercased() }
        let originalLang = windowOrigin ?? PrismTranslationLaw.translatedFromLanguage(of: translations)
        let resolved = PrismTranslationLaw.prismTranslation(
            in: translations, originalLanguage: originalLang, preferredLanguages: readerPrism
        )
        if windowOrigin != nil {
            translationResolutionCache.updateValue(resolved, forKey: messageId)
        }
        return resolved
    }

    /// #9191 — une résolution mise en cache a été calculée sur la langue
    /// d'origine de la fenêtre. Quand la base corrige cette origine (une ligne
    /// née provisoire — bulle de la NSE, réconciliation depuis le cache —
    /// reçoit l'origine servie par la passerelle), la résolution d'avant ment :
    /// elle servait l'original d'un message coréen pris pour du français. Elle
    /// se retire, la bulle redescend le Prisme sur la bonne origine.
    func forgetPrismResolutions(whoseOriginChangedFrom previous: [Message]?) {
        guard let previous, !translationResolutionCache.isEmpty else { return }
        for id in PrismTranslationLaw.messageIdsWhoseOriginChanged(from: previous, to: messages) {
            translationResolutionCache.removeValue(forKey: id)
        }
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
            availableTranslations: startupDependencies.encryptedEra.servedTranslations(for: messageId, in: self).map(\.targetLanguage),
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
        let resolved = messageIds.reduce(into: [String: String]()) { resolved, id in
            resolved[id] = consumedLanguage(for: id)
        }
        return PrismTranslationLaw.dominantSplit(resolved)
    }

    // MARK: - Transcription Retry for Audio Messages

    func scheduleTranscriptionRetry(for apiMessages: [APIMessage]) {
        let scheduler: any TranscriptionRetryScheduling = startupDependencies.transcriptionRetry
            ?? TranscriptionRetryScheduler(messageService: messageService)
        scheduler.schedule(for: apiMessages, conversationId: conversationId, receiver: self)
    }

    // MARK: - Extract Transcription/Translation Data from REST Responses

    func extractAttachmentTranscriptions(from apiMessages: [APIMessage]) {
        applyAudioMetadata(AttachmentAudioMetadata.entries(fromAPI: apiMessages), forceOverwrite: true)
    }

    var audioMetadataState: AttachmentAudioState {
        AttachmentAudioState(
            transcriptions: messageTranscriptions,
            transcriptionsByAttachment: messageTranscriptionsByAttachment,
            translatedAudios: messageTranslatedAudios,
            translatedAudiosByAttachment: messageTranslatedAudiosByAttachment
        )
    }

    func applyAudioMetadata(_ entries: [AttachmentAudioEntry], forceOverwrite: Bool) {
        guard !entries.isEmpty else { return }
        adoptAudioMetadata(AttachmentAudioMetadata.merged(entries, into: audioMetadataState, forceOverwrite: forceOverwrite))
    }

    func adoptAudioMetadata(_ next: AttachmentAudioState) {
        let current = audioMetadataState
        if next.transcriptions != current.transcriptions { messageTranscriptions = next.transcriptions }
        if next.transcriptionsByAttachment != current.transcriptionsByAttachment {
            messageTranscriptionsByAttachment = next.transcriptionsByAttachment
        }
        if next.translatedAudios != current.translatedAudios { messageTranslatedAudios = next.translatedAudios }
        if next.translatedAudiosByAttachment != current.translatedAudiosByAttachment {
            messageTranslatedAudiosByAttachment = next.translatedAudiosByAttachment
        }
    }
}
