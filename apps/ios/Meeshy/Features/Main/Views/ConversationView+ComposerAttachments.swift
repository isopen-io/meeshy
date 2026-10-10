// MARK: - Extracted from ConversationView+Composer.swift (#4105)
//
// Aperçu des pièces jointes en attente d'envoi dans le composer : tuiles,
// replis visuels par type, et leurs actions (suppression, tap).
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
    func attachmentPreviewTile(_ attachment: MessageAttachment) -> some View {
        ComposerAttachmentTile(
            thumbnail: composerState.pendingThumbnails[attachment.id],
            art: pendingTileArt(attachment),
            tint: attachment.thumbnailColor,
            typeGlyph: attachment.type.composerGlyph,
            centerGlyph: ComposerPendingTileGlyph.center(for: attachment.type, mimeType: attachment.mimeType),
            label: labelForAttachment(attachment),
            tapAccessibilityLabel: pendingTileAccessibilityLabel(attachment),
            removeAccessibilityLabel: String(localized: "conversation.view.composer.delete_attachment", defaultValue: "Supprimer \(labelForAttachment(attachment))", bundle: .main),
            onTap: { handleAttachmentPreviewTap(attachment) },
            onRemove: { removePendingAttachment(attachment) }
        )
        // Long-press → full-screen quick-look (image enlarged / video playing),
        // mirroring the recent-media strip's context-menu preview pattern
        // (RecentMediaStrip.swift). Staged attachments already have their
        // media locally (pendingMediaFiles), so this needs no PHAsset
        // resolution — it's a much lighter version of the same idea.
        .contextMenu {
            Button(role: .destructive) {
                removePendingAttachment(attachment)
            } label: {
                Label(
                    String(localized: "conversation.view.composer.delete_attachment", defaultValue: "Supprimer \(labelForAttachment(attachment))", bundle: .main),
                    systemImage: "trash"
                )
            }
        } preview: {
            if attachment.type == .image || attachment.type == .video {
                AttachmentQuickLookPreview(
                    kind: attachment.type == .video ? .video : .image,
                    fileURL: composerState.pendingMediaFiles[attachment.id],
                    thumbnail: composerState.pendingThumbnails[attachment.id]
                )
            }
        }
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
            openRetouchSeries(focusId: attachment.id)
        case .audio:
            if let url = composerState.pendingMediaFiles[attachment.id] {
                scrollState.audioToEdit = PendingAudioEdit(id: attachment.id, url: url)
            }
        default:
            break
        }
    }

    // MARK: - Rich Tile Fallbacks

    /// Le dessin d'une pièce sans vignette : l'onde d'un son (qui suit le
    /// lecteur du composeur), l'épingle d'un lieu.
    private func pendingTileArt(_ attachment: MessageAttachment) -> AnyView? {
        switch attachment.type {
        case .audio: return AnyView(PendingAudioTile(attachment: attachment, player: pendingAudioPlayer))
        case .location: return AnyView(ComposerLocationTileArt())
        default: return nil
        }
    }

    private func removePendingPlace() {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            composerState.pendingPlace = nil
        }
    }

    private func pendingTileAccessibilityLabel(_ attachment: MessageAttachment) -> String {
        let label = labelForAttachment(attachment)
        guard ComposerPendingTileGlyph.center(for: attachment.type, mimeType: attachment.mimeType) != nil else {
            return String(localized: "conversation.composer.attachment.preview", defaultValue: "Aperçu \(label)", bundle: .main)
        }
        return String(localized: "conversation.composer.attachment.edit", defaultValue: "Éditer \(label)", bundle: .main)
    }

    func labelForAttachment(_ attachment: MessageAttachment) -> String {
        MediaKindLabel.attachmentLabel(for: attachment)
    }

    // See ConversationView+AttachmentHandlers.swift for: startRecording, stopAndPreviewRecording, stopAndSendRecording, sendMessageWithAttachments, handlePhotoSelection, generateVideoThumbnail, handleFileImport, mimeTypeForURL, getFileSize, handleCameraCapture, sendMessage
}

// MARK: - Tuile d'un audio en attente

/// Seul abonné du lecteur du composeur : cette tuile DESSINE « lecture »
/// ou « pause », elle a donc besoin de se re-rendre à chaque bascule. La
/// racine, elle, POSSÈDE le lecteur sans l'observer — il publie sa
/// progression toutes les 100 ms, et 2 911 lignes n'ont pas à se
/// réévaluer pour une icône (#6226).
///
/// Même dispositif que `ComposerAudioHost` pour le vumètre, et que
/// `ComposerTextHost` pour le texte (#4105) : la racine possède, l'hôte
/// observe.
struct PendingAudioTile: View {
    let attachment: MessageAttachment
    @ObservedObject var player: AudioPlaybackManager

    var body: some View {
        ComposerAudioTileArt(tint: attachment.thumbnailColor, isPlaying: player.isPlaying)
    }
}
