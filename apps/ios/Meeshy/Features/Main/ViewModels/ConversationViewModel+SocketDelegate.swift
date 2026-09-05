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
// Responsabilité tenue ici : la conformité `ConversationSocketDelegate` — ce que
// le socket POUSSE dans le modèle : rôle d'un participant, accès révoqué, et
// l'enrichissement d'une pièce jointe (transcription / pistes traduites) injecté
// en une seule tranche d'acteur principal puis écrit dans GRDB, pour qu'une
// réouverture le serve depuis le cache au lieu de le faire « pop » après coup.

// MARK: - ConversationSocketDelegate Conformance

extension ConversationViewModel: ConversationSocketDelegate {
    /// Read-receipt precision gate input: the scroll controller pushes the
    /// near-bottom flag here via `onNearBottomChanged`, so the socket handler can
    /// refuse to auto-mark-read a message that landed off-screen while the user
    /// was reading history.
    var isViewportAtBottom: Bool { isCurrentlyNearBottom }

    func handleParticipantRoleUpdated(participantId: String, newRole: String) {
        Logger.socket.info("Participant \(participantId) role changed to \(newRole)")
        _topActiveMembers = nil
        let convId = conversationId
        Task {
            await CacheCoordinator.shared.participants.invalidate(for: convId)
        }
        objectWillChange.send()
    }

    /// Bridge for `ConversationSocketHandler` — reuses the same purge +
    /// dismiss path as the REST 403 case so socket-rejected joins look
    /// identical to API-rejected loads from the user's perspective.
    func handleSocketAccessRevoked(reason: String?) {
        Task { [weak self] in
            await self?.handleAccessRevoked(reason: reason)
        }
    }

    /// Applies a server-pushed attachment delta (transcription / audio
    /// translation finalized) by:
    /// 1. Injecting the enriched metadata directly into
    ///    `messageTranscriptions` / `messageTranslatedAudios` in a
    ///    single MainActor slice (no await between assignments — same
    ///    atomic-publish rule as `hydrateMetadataFromGRDB`).
    /// 2. Fire-and-forget GRDB write-through via
    ///    `MessagePersistenceActor.applyAttachmentEnrichment`, so a
    ///    subsequent open of this conversation surfaces the enrichment
    ///    from cache instead of pop-in-then-replace when
    ///    `refreshMessagesFromAPI` later runs.
    func applyAttachmentUpdate(_ event: AttachmentUpdatedEvent) {
        injectAttachmentMetadata(from: event.attachment, intoMessageId: event.messageId)

        let messageId = event.messageId
        let attachmentId = event.attachment.id
        let transcription = event.attachment.transcription
        let translations = event.attachment.translations
        Task { [persistence = messagePersistence] in
            try? await persistence.applyAttachmentEnrichment(
                messageId: messageId,
                attachmentId: attachmentId,
                transcription: transcription,
                translations: translations
            )
        }
    }

    /// Injects an enriched attachment's transcription + audio translations
    /// directly into the metadata dictionaries (same shape as
    /// `hydrateMetadataFromGRDB` but sourced from a socket payload).
    private func injectAttachmentMetadata(
        from attachment: APIMessageAttachment,
        intoMessageId msgId: String
    ) {
        if let t = attachment.transcription {
            let segments = (t.segments ?? []).map {
                MessageTranscriptionSegment(
                    text: $0.text,
                    startTime: $0.startTime,
                    endTime: $0.endTime,
                    speakerId: $0.speakerId
                )
            }
            let transcription = MessageTranscription(
                attachmentId: attachment.id,
                text: t.transcribedText ?? t.text ?? "",
                language: t.language ?? "?",
                confidence: t.confidence,
                durationMs: t.durationMs,
                segments: segments,
                speakerCount: t.speakerCount
            )
            messageTranscriptions[msgId] = transcription
            messageTranscriptionsByAttachment[attachment.id] = transcription
        }
        if let translations = attachment.translations, !translations.isEmpty {
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
                    id: "\(attachment.id)_\(lang)",
                    attachmentId: attachment.id,
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
                messageTranslatedAudios[msgId] = audios
                messageTranslatedAudiosByAttachment[attachment.id] = audios
            }
        }
    }
}
