// MARK: - Extracted from ConversationView+Composer.swift (#4105)
//
// Aperçu des pièces jointes en attente d'envoi dans le composer : la zone,
// ses tuiles et leurs actions (suppression, tap, lecture d'un vocal).
import SwiftUI
import Combine
import PhotosUI
import AVFoundation
import MeeshySDK
import MeeshyUI

extension ConversationView {

    // MARK: - Pending Attachments Preview
    //
    // La zone et sa tuile sont celles de TOUT le produit
    // (`ComposerAttachmentZone`, `ComposerAttachmentTile`, #9736) : cette
    // surface n'y verse que ses pièces.
    var pendingAttachmentsPreview: some View {
        ComposerAttachmentZone(accentColor: accentColor) {
            ForEach(composerState.preparingAttachments) { prep in
                AttachmentLoadingTile(prep: prep) {
                    cancelPreparation(prep)
                }
            }
            ForEach(composerState.pendingAttachments) { attachment in
                attachmentPreviewTile(attachment)
            }
            if let place = composerState.pendingPlace {
                ComposerPlaceTile(place: place, onRemove: removePendingPlace)
            }
        }
    }

    // MARK: - Attachment Preview Tile
    //
    // La tuile vit chez elle (`ConversationPendingAttachmentTile`) ; la racine
    // ne lui remet que son plateau, son lecteur et ses gestes. Un vocal se lit
    // depuis sa tuile sans ouvrir l'éditeur (#7171).
    func attachmentPreviewTile(_ attachment: MessageAttachment) -> some View {
        ConversationPendingAttachmentTile(
            attachment: attachment,
            thumbnail: composerState.pendingThumbnails[attachment.id],
            fileURL: composerState.pendingMediaFiles[attachment.id],
            player: pendingAudioPlayer,
            onTap: { handleAttachmentPreviewTap(attachment) },
            onRemove: { removePendingAttachment(attachment) },
            onToggleAudio: {
                PendingAudioPlayback(player: pendingAudioPlayer)
                    .toggle(attachmentId: attachment.id, fileURL: composerState.pendingMediaFiles[attachment.id])
            }
        )
    }

    /// Removes a staged attachment: drops it from the tray, deletes its temp
    /// file, and stops playback if it was the currently-playing audio note.
    /// Shared by the tile's delete button and its long-press menu action.
    private func removePendingAttachment(_ attachment: MessageAttachment) {
        HapticFeedback.light()
        detachPendingPieces([attachment.id])
    }

    /// Retire des pièces de la zone, prêtes ou en préparation, avec leurs
    /// fichiers et leurs vignettes. Le retrait d'un toucher et le décochage
    /// dans le sélecteur système (#9697) passent tous deux par ici.
    func detachPendingPieces(_ ids: [String]) {
        let gone = Set(ids)
        guard !gone.isEmpty else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            if pendingAudioPlayer.isPlaying { pendingAudioPlayer.stop() }
            composerState.pendingAttachments.removeAll { gone.contains($0.id) }
            composerState.preparingAttachments.removeAll { gone.contains($0.id) }
            for id in gone {
                if let url = composerState.pendingMediaFiles.removeValue(forKey: id) {
                    try? FileManager.default.removeItem(at: url)
                }
                composerState.pendingThumbnails.removeValue(forKey: id)
            }
        }
    }

    // MARK: - Preparation Cancellation
    func cancelPreparation(_ prep: PreparingAttachment) {
        // Mark the in-flight prep as failed so any waiter resumes immediately
        // and the observation task drops it from `preparingAttachments`. The
        // Task spawned inside `AttachmentPreparationService` keeps running but
        // can no longer write back because the handle is gone from state.
        composerState.preparingAttachments.removeAll { $0.id == prep.id }
    }

    // MARK: - Attachment Preview Tap Handler
    func handleAttachmentPreviewTap(_ attachment: MessageAttachment) {
        switch attachment.type {
        case .image, .video:
            openPieceRetouch(attachment.id)
        case .audio:
            if let url = composerState.pendingMediaFiles[attachment.id] {
                scrollState.audioToEdit = PendingAudioEdit(id: attachment.id, url: url)
            }
        default:
            break
        }
    }

    private func removePendingPlace() {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            composerState.pendingPlace = nil
        }
    }

    func labelForAttachment(_ attachment: MessageAttachment) -> String {
        MediaKindLabel.attachmentLabel(for: attachment)
    }

    // See ConversationView+AttachmentHandlers.swift for: startRecording, stopAndPreviewRecording, stopAndSendRecording, sendMessageWithAttachments, handlePhotoSelection, generateVideoThumbnail, handleFileImport, getFileSize, handleCameraCapture, sendMessage
}
