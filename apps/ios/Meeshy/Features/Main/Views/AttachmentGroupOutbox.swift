import Foundation
import os
import MeeshySDK

// MARK: - L'écriture d'un groupe de pièces dans l'outbox durable
//
// Extrait de `ConversationView+AttachmentHandlers.swift` (cohésion). Deux
// chemins y mènent, qui écrivaient chacun deux fois le même couple
// audio / média : la coupure réseau AVANT l'upload (write-ahead) et l'échec
// d'un upload EN LIGNE (règle 4 de la spec 2026-07-08, message-send-failure-
// retry-flow). Le type porte ce que l'envoi a saisi UNE fois au tap — langue,
// citation, protection — et le remet à chaque mise en file.

struct AttachmentGroupOutbox {
    let conversationId: String
    let originalLanguage: String
    let replyToId: String?
    let protection: MessageProtectionIntent

    /// A3 / S7b ST2 — écriture durable d'un groupe quand l'appareil est HORS
    /// LIGNE : jamais le chemin TUS, qui échouerait aussitôt. Un passage en
    /// ligne entre le test et l'écriture GRDB est absorbé par le flusher, qui
    /// vide la file au cycle suivant. Rend `true` si le groupe est en file.
    func enqueueOffline(_ send: OutgoingMediaGroup, mediaFiles: [String: URL]) async -> Bool {
        if send.group.kind == .audio {
            let urls = send.group.attachments.compactMap { mediaFiles[$0.id] }
            // Offline: NEVER fall through to the TUS path (it would just
            // fail).
            guard !urls.isEmpty else {
                Logger.messages.warning("Audio group offline but no source URLs — skipping \(send.tempId)")
                return false
            }
            do {
                _ = try await OfflineQueue.shared.enqueueAudios(
                    sourceAudioURLs: urls,
                    conversationId: conversationId,
                    content: send.group.text,
                    clientMessageId: send.tempId,
                    originalLanguage: originalLanguage,
                    replyToId: send.group.carriesReply ? replyToId : nil,
                    protection: protection
                )
                Logger.messages.info("Audio group queued offline for \(send.tempId)")
                return true
            } catch {
                Logger.messages.error("Audio offline enqueue failed: \(error.localizedDescription)")
                FeedbackToastManager.shared.showError("Échec de la mise en file du message vocal")
                return false
            }
        }

        // S7b ST2 — visual-media (photo/video/file) offline write-ahead:
        // durable — survives an app kill and auto-resends on flush via the
        // ST3 dispatcher branch; the optimistic bubble stays durably `.sending`.
        let pairs = mediaSources(of: send, mediaFiles: mediaFiles)
        guard !pairs.isEmpty else {
            Logger.messages.warning("Visual group offline but no source URLs — skipping \(send.tempId)")
            return false
        }
        do {
            _ = try await OfflineQueue.shared.enqueueMedia(
                sourceMediaURLs: pairs.map { $0.url },
                kinds: pairs.map { $0.kind },
                conversationId: conversationId,
                content: send.group.text,
                clientMessageId: send.tempId,
                originalLanguage: originalLanguage,
                replyToId: send.group.carriesReply ? replyToId : nil,
                protection: protection
            )
            Logger.messages.info("Visual group queued offline for \(send.tempId)")
            return true
        } catch {
            // enqueueMedia's copy-error path already flips the bubble
            // (emits retryExhausted) + marks the row terminal; surface
            // a toast too. Mirrors the audio offline branch.
            Logger.messages.error("Visual offline enqueue failed: \(error.localizedDescription)")
            FeedbackToastManager.shared.showError("Échec de la mise en file du média")
            return false
        }
    }

    /// Un échec d'upload EN LIGNE rejoint l'outbox durable — mêmes
    /// re-tentatives automatiques avec backoff que le texte. Rend `true` si le
    /// groupe a été ré-enfilé ; `false` quand c'est impossible (fichiers
    /// sources disparus, disque plein, encodage) : état terminal, retry manuel.
    func requeueAfterOnlineFailure(_ send: OutgoingMediaGroup, mediaFiles: [String: URL]) async -> Bool {
        if send.group.kind == .audio {
            let urls = send.group.attachments.compactMap { mediaFiles[$0.id] }
            guard !urls.isEmpty else { return false }
            return (try? await OfflineQueue.shared.enqueueAudios(
                sourceAudioURLs: urls,
                conversationId: conversationId,
                content: send.group.text,
                clientMessageId: send.tempId,
                originalLanguage: originalLanguage,
                replyToId: send.group.carriesReply ? replyToId : nil,
                protection: protection
            )) != nil
        }
        let pairs = mediaSources(of: send, mediaFiles: mediaFiles)
        guard !pairs.isEmpty else { return false }
        return (try? await OfflineQueue.shared.enqueueMedia(
            sourceMediaURLs: pairs.map { $0.url },
            kinds: pairs.map { $0.kind },
            conversationId: conversationId,
            content: send.group.text,
            clientMessageId: send.tempId,
            originalLanguage: originalLanguage,
            replyToId: send.group.carriesReply ? replyToId : nil,
            protection: protection
        )) != nil
    }

    private func mediaSources(of send: OutgoingMediaGroup, mediaFiles: [String: URL]) -> [(url: URL, kind: String)] {
        send.group.attachments.compactMap { att in
            guard let url = mediaFiles[att.id] else { return nil }
            let kind = AttachmentKind(mimeType: MimeTypeResolver.mimeType(forURL: url)).rawValue
            return (url, kind)
        }
    }
}
