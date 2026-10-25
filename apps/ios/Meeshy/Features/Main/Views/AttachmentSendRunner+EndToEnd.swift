import UIKit
import os
import MeeshySDK
import MeeshyUI

/// **Les pièces d'une conversation chiffrée de bout en bout** (#10789, spec
/// § 7.1). Aucune n'emprunte la porte des pièces en clair : ni téléversement du
/// fichier, ni file hors ligne (qui ne garde que du clair), ni amorçage des
/// caches média. Chaque groupe est chiffré sur l'appareil, ses blobs seuls
/// partent, ses pointeurs voyagent dans l'envoi scellé (`EndToEndSendSealer`).
/// Hors ligne ou sans session, rien ne part et la bulle dit pourquoi.
extension AttachmentSendRunner {

    func runSealed(_ batch: AttachmentSendBatch) async {
        // Une conversation où l'envoi chiffré ne peut pas partir (groupe, pair
        // inconnu) ne chiffre ni ne téléverse rien : aucun blob orphelin.
        let refusal: EndToEndSendRefusal? = host.endToEndRecipientRefusal
            ?? (network.isOnline ? nil : .outboxUnsealable)
        let sealer = refusal == nil ? endToEndPieces() : nil
        var anySuccess = false
        var failed: EndToEndSendRefusal?
        for send in batch.mediaGroupSends {
            guard let sealer else {
                failed = refusal ?? .pieceUploadFailed
                await host.markOptimisticMediaFailed(tempId: send.tempId, reason: (refusal ?? .pieceUploadFailed).userMessage)
                continue
            }
            switch await sendSealedGroup(send, in: batch, sealer: sealer) {
            case .sent: anySuccess = true
            case .refusedBySend: break
            case .notSealed:
                failed = .pieceUploadFailed
                await host.markOptimisticMediaFailed(tempId: send.tempId, reason: EndToEndSendRefusal.pieceUploadFailed.userMessage)
            }
        }
        if let failed { feedback.showError(failed.userMessage) }
        if await sendTrailing(batch) { anySuccess = true }
        // Aucun clair n'amorce les caches média en E2EE : la bulle optimiste lit
        // ses fichiers locaux jusqu'à l'écho, qui pose les pointeurs (#10789).
        let urls = batch.cleanupURLs()
        removeAfterRetention(urls.visual + urls.audio)
        anySuccess ? feedback.sendSucceeded() : feedback.sendFailed()
    }

    private enum SealedGroupOutcome {
        case sent
        /// L'envoi scellé a refusé : il a déjà dit pourquoi (`EndToEndSendSealer.refuse`).
        case refusedBySend
        /// Le chiffrement ou le téléversement d'un blob a échoué : rien n'est parti.
        case notSealed
    }

    private func sendSealedGroup(_ send: OutgoingMediaGroup, in batch: AttachmentSendBatch, sealer: any EndToEndPieceSealing) async -> SealedGroupOutcome {
        let transcriptions = await awaitedTranscriptions(for: send)
        let sources = await EndToEndPieceSources.make(for: send, in: batch, transcriptions: transcriptions)
        guard sources.count == send.group.attachments.count else { return .notSealed }
        let pointers: [E2EEAttachmentPointer]
        do {
            pointers = try await sealer.seal(sources)
        } catch {
            Logger.messages.warning("E2EE piece not sealed, nothing sent: \(String(describing: type(of: error)), privacy: .public)")
            return .notSealed
        }
        let result = await host.send(OutgoingMessage(
            conversationId: ConversationID(host.conversationId),
            content: send.group.messageContent,
            relation: send.group.carriesReply ? batch.relation : .none,
            attachments: OutgoingAttachments(ids: pointers.flatMap(\.blobIds), previews: nil, sealed: pointers),
            protection: batch.protection,
            originalLanguage: batch.language,
            reusedClientMessageId: MessageID(send.tempId)
        ))
        return result.isAccepted ? .sent : .refusedBySend
    }
}

/// Ce que les pièces d'un groupe disent d'elles à leur pointeur : type réel,
/// nom, dimensions, durée, ThumbHash, affiche en JPEG, transcription faite sur
/// l'appareil. Une pièce sans fichier n'est pas une source (le groupe échoue entier).
enum EndToEndPieceSources {
    @MainActor
    static func make(
        for send: OutgoingMediaGroup,
        in batch: AttachmentSendBatch,
        transcriptions: [String: MessageTranscription]
    ) async -> [EndToEndPieceSource] {
        var sources: [EndToEndPieceSource] = []
        for attachment in send.group.attachments {
            guard let fileURL = batch.mediaFiles[attachment.id] else { continue }
            let isAudio = send.group.kind == .audio
            let thumbnail = isAudio ? nil : batch.thumbnails[attachment.id]
            var jpeg: Data?
            if let thumbnail { jpeg = await ImageCompressor.jpegOffMain(thumbnail, quality: 0.8) }
            let transcript = transcriptions[attachment.id].map { E2EEAttachmentPointer.Transcript(text: $0.text, language: $0.language) }
            sources.append(EndToEndPieceSource(
                localId: attachment.id, fileURL: fileURL,
                contentType: isAudio ? "audio/mp4" : (attachment.mimeType.isEmpty ? "application/octet-stream" : attachment.mimeType),
                fileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                kind: isAudio ? .audio : EndToEndPieceSource.kind(of: attachment),
                width: attachment.width, height: attachment.height, durationMs: attachment.duration,
                thumbHash: thumbnail?.toThumbHash(), thumbnailJPEG: jpeg, transcript: transcript
            ))
        }
        return sources
    }
}
