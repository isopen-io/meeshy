import UIKit
import Combine
import os
import MeeshySDK
import MeeshyUI

protocol AttachmentGroupQueueing {
    func enqueueOffline(_ send: OutgoingMediaGroup, mediaFiles: [String: URL]) async -> Bool
    func requeueAfterOnlineFailure(_ send: OutgoingMediaGroup, mediaFiles: [String: URL]) async -> Bool
}

extension AttachmentGroupOutbox: AttachmentGroupQueueing {}

protocol AttachmentSendFeedbackGiving {
    func sendSucceeded()
    func sendFailed()
    func showError(_ message: String)
}

struct LiveAttachmentSendFeedback: AttachmentSendFeedbackGiving {
    func sendSucceeded() { HapticFeedback.success() }
    func sendFailed() { HapticFeedback.error() }
    func showError(_ message: String) { FeedbackToastManager.shared.showError(message) }
}

struct AttachmentUploadSession {
    let uploader: any MediaGroupUploading
    let progress: AnyPublisher<UploadQueueProgress, Never>

    /// `nil` sans origine serveur ou sans identifiant de requête. Une pièce jointe de MESSAGE
    /// ne demande pas de compte : un invité de lien partagé a le droit d'en envoyer.
    static func live(thumbnails: [String: UIImage]) -> AttachmentUploadSession? {
        guard let baseURL = URL(string: MeeshyConfig.shared.serverOrigin),
              let credential = APIClient.shared.requestCredential else { return nil }
        let manager = TusUploadManager(baseURL: baseURL)
        return AttachmentUploadSession(
            uploader: TusMediaGroupUploader(uploader: manager, credential: credential, thumbnails: thumbnails),
            progress: manager.progressPublisher
        )
    }
}

struct AttachmentSendCallbacks {
    let restorePlace: @MainActor (SharedPlace?, Bool) -> Void
    let setProgress: @MainActor (UploadQueueProgress) -> Void
    let abortUpload: @MainActor () -> Void
}

@MainActor
protocol AttachmentSendRunning {
    func run(_ batch: AttachmentSendBatch) async
}

@MainActor
final class AttachmentSendRunner: AttachmentSendRunning {
    nonisolated deinit {}

    private static let failureToast = "Échec de l'envoi de la pièce jointe"
    private static let audioRetention: Duration = .seconds(10)

    let host: any AttachmentSendHosting
    private let callbacks: AttachmentSendCallbacks
    let network: any NetworkMonitorProviding
    private let uploadSession: @MainActor (AttachmentSendBatch) -> AttachmentUploadSession?
    private let outboxFor: @MainActor (AttachmentSendBatch, String) -> any AttachmentGroupQueueing
    let transcriber: any VoiceNoteLocalTranscribing
    let feedback: any AttachmentSendFeedbackGiving
    /// Le chiffrement sur l'appareil des pièces d'une conversation chiffrée de
    /// bout en bout (#10789) ; `nil` sans session.
    let endToEndPieces: @MainActor () -> (any EndToEndPieceSealing)?

    init(
        host: any AttachmentSendHosting,
        callbacks: AttachmentSendCallbacks,
        network: any NetworkMonitorProviding = NetworkMonitor.shared,
        uploadSession: @escaping @MainActor (AttachmentSendBatch) -> AttachmentUploadSession? = { batch in
            AttachmentUploadSession.live(thumbnails: batch.thumbnails)
        },
        outbox: @escaping @MainActor (AttachmentSendBatch, String) -> any AttachmentGroupQueueing = { batch, conversationId in
            AttachmentGroupOutbox(
                conversationId: conversationId, originalLanguage: batch.language,
                replyToId: batch.replyToId, protection: batch.protection
            )
        },
        transcriber: any VoiceNoteLocalTranscribing = VoiceNoteLocalTranscriber.shared,
        feedback: any AttachmentSendFeedbackGiving = LiveAttachmentSendFeedback(),
        endToEndPieces: @escaping @MainActor () -> (any EndToEndPieceSealing)? = { EndToEndPieceSealer.live() }
    ) {
        self.host = host
        self.callbacks = callbacks
        self.network = network
        self.uploadSession = uploadSession
        self.outboxFor = outbox
        self.transcriber = transcriber
        self.feedback = feedback
        self.endToEndPieces = endToEndPieces
    }

    func run(_ batch: AttachmentSendBatch) async {
        // #10789 — en E2EE, chaque pièce part chiffrée sur l'appareil, et seulement ainsi.
        if host.endToEndSealsPieces {
            await runSealed(batch)
            return
        }
        if await EndToEndPieceGuard.refuses(batch.mediaGroupSends.map(\.tempId), on: host, toast: { feedback.showError($0) }) {
            _ = await sendTrailing(batch)
            cleanUp(batch)
            return
        }
        guard let session = uploadSession(batch) else {
            abortWithoutCredential(batch)
            return
        }
        let progress = observeProgress(of: session)
        let outbox = outboxFor(batch, host.conversationId)
        var anySuccess = false
        for send in batch.mediaGroupSends {
            if await sendGroup(send, in: batch, session: session, outbox: outbox) { anySuccess = true }
        }
        if await sendTrailing(batch) { anySuccess = true }
        progress.cancel()
        finish(batch, anySuccess: anySuccess)
    }

    private func abortWithoutCredential(_ batch: AttachmentSendBatch) {
        callbacks.abortUpload()
        feedback.showError(Self.failureToast)
        callbacks.restorePlace(batch.place, false)
    }

    private func observeProgress(of session: AttachmentUploadSession) -> AnyCancellable {
        let setProgress = callbacks.setProgress
        return session.progress
            .receive(on: DispatchQueue.main)
            .sink { progress in setProgress(progress) }
    }

    private func sendGroup(
        _ send: OutgoingMediaGroup,
        in batch: AttachmentSendBatch,
        session: AttachmentUploadSession,
        outbox: any AttachmentGroupQueueing
    ) async -> Bool {
        if !network.isOnline {
            return await outbox.enqueueOffline(send, mediaFiles: batch.mediaFiles)
        }
        do {
            let uploaded = try await uploadGroup(send, in: batch, session: session)
            return await host.send(OutgoingMessage(
                conversationId: ConversationID(host.conversationId),
                content: send.group.messageContent,
                relation: send.group.carriesReply ? batch.relation : .none,
                attachments: OutgoingAttachments(
                    ids: uploaded.ids.isEmpty ? nil : uploaded.ids,
                    previews: uploaded.attachments.isEmpty ? nil : uploaded.attachments
                ),
                protection: batch.protection,
                originalLanguage: batch.language,
                reusedClientMessageId: MessageID(send.tempId)
            )).isAccepted
        } catch {
            return await handleGroupFailure(error, send: send, in: batch, outbox: outbox)
        }
    }

    private func uploadGroup(
        _ send: OutgoingMediaGroup,
        in batch: AttachmentSendBatch,
        session: AttachmentUploadSession
    ) async throws -> UploadedMediaGroup {
        let transcriptions = await awaitedTranscriptions(for: send)
        let items = MediaGroupUploadItem.items(
            for: send, mediaFiles: batch.mediaFiles, thumbnails: batch.thumbnails, transcriptions: transcriptions
        )
        let host = self.host
        let transcriber = self.transcriber
        return try await session.uploader.upload(send, items: items, currentUserId: batch.currentUserId) { localId, serverId in
            guard let transcription = transcriptions[localId] else { return }
            host.messageTranscriptionsByAttachment[serverId] = transcription.rekeyed(attachmentId: serverId)
            transcriber.discard(attachmentId: localId)
        }
    }

    /// Attente bornée par le budget d'ENVOI, jamais par le plafond du moteur : au-delà, le
    /// fichier part sans texte et Whisper reprend côté serveur.
    func awaitedTranscriptions(for send: OutgoingMediaGroup) async -> [String: MessageTranscription] {
        guard send.group.kind == .audio else { return [:] }
        let awaited = await transcriber.awaitTranscriptions(
            for: send.group.attachments.map(\.id),
            within: VoiceNoteLocalTranscriber.sendWaitBudget
        )
        LocalTranscriptionPlacement.place(awaited, tempId: send.tempId, on: host)
        return Dictionary(awaited.map { ($0.attachmentId, $0) }, uniquingKeysWith: { first, _ in first })
    }

    /// Un échec en ligne rejoint l'outbox durable ; le refus d'une pièce d'INVITÉ est définitif
    /// et la bulle dit pourquoi. `recordSendFailure` passe AVANT toute autre issue.
    private func handleGroupFailure(
        _ error: any Error,
        send: OutgoingMediaGroup,
        in batch: AttachmentSendBatch,
        outbox: any AttachmentGroupQueueing
    ) async -> Bool {
        Logger.messages.error("Group upload failed (\(String(describing: send.group.kind))): \(error.localizedDescription)")
        await host.recordSendFailure(tempId: send.tempId, error: error)
        if let refusal = error as? GuestAttachmentRefusal {
            await host.markOptimisticMediaFailed(
                tempId: send.tempId,
                reason: GuestAttachmentCopy.serverRefusal(refusal, kinds: batch.guestAllowedKinds)
            )
            return false
        }
        if await outbox.requeueAfterOnlineFailure(send, mediaFiles: batch.mediaFiles) {
            Logger.messages.info("Group upload failed online — requeued to durable outbox \(send.tempId)")
            return true
        }
        await host.markOptimisticMediaFailed(
            tempId: send.tempId,
            reason: OutgoingAttachmentRules.uploadFailureReason(error: error, attachmentCount: send.group.attachments.count)
        )
        return false
    }

    /// Le texte part EN DERNIER, sur la bulle posée au tap ; sans texte, un lieu part seul.
    func sendTrailing(_ batch: AttachmentSendBatch) async -> Bool {
        guard batch.textGroup != nil || batch.place != nil else { return false }
        let carriesReply = batch.textGroup?.carriesReply == true
        let ok = await host.send(OutgoingMessage(
            conversationId: ConversationID(host.conversationId),
            content: batch.textGroup?.text ?? "",
            relation: carriesReply ? batch.relation : .none,
            attachments: .none,
            protection: batch.protection,
            originalLanguage: batch.language,
            reusedClientMessageId: batch.textTempId.map { MessageID($0) },
            location: batch.place
        )).isAccepted
        callbacks.restorePlace(batch.place, ok)
        return ok
    }

    /// Les vocaux gardent leur fichier un moment : la ligne optimiste porte l'URL `file://`
    /// jusqu'à l'écho socket, et le tap de lecture lit le disque dans cette fenêtre.
    private func finish(_ batch: AttachmentSendBatch, anySuccess: Bool) {
        cleanUp(batch)
        if anySuccess {
            feedback.sendSucceeded()
            return
        }
        feedback.sendFailed()
        feedback.showError(Self.failureToast)
    }

    func cleanUp(_ batch: AttachmentSendBatch) {
        let urls = batch.cleanupURLs()
        for url in urls.visual { try? FileManager.default.removeItem(at: url) }
        if !urls.audio.isEmpty { removeAfterRetention(urls.audio) }
    }

    func removeAfterRetention(_ urls: [URL]) {
        Task {
            _ = await cancellableSleep(for: AttachmentSendRunner.audioRetention)
            for url in urls { try? FileManager.default.removeItem(at: url) }
        }
    }
}
