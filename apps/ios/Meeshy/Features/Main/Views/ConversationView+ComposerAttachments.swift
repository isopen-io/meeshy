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
    var pendingAttachmentsPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(composerState.preparingAttachments) { prep in
                    AttachmentLoadingTile(prep: prep) {
                        cancelPreparation(prep)
                    }
                }
                ForEach(composerState.pendingAttachments) { attachment in
                    attachmentPreviewTile(attachment)
                }
                if let place = composerState.pendingPlace {
                    pendingPlaceTile(place)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .frame(height: 100)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Attachment Preview Tile
    func attachmentPreviewTile(_ attachment: MessageAttachment) -> some View {
        VStack(spacing: 4) {
            ZStack(alignment: .topTrailing) {
                // Tappable preview area
                Button {
                    HapticFeedback.light()
                    handleAttachmentPreviewTap(attachment)
                } label: {
                    ZStack {
                        if let thumb = composerState.pendingThumbnails[attachment.id] {
                            Image(uiImage: thumb)
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: 56, height: 56)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                            if attachment.type == .video {
                                Image(systemName: "play.circle.fill")
                                    // Doctrine 86i : overlay décoratif borné par la tuile fixe 56×56 → figé + masqué.
                                    .font(.system(size: 20))
                                    .foregroundStyle(.white, .black.opacity(0.4))
                                    .accessibilityHidden(true)
                            } else if attachment.type == .image {
                                Image(systemName: "eye.fill")
                                    // Doctrine 86i : indicateur décoratif borné par la tuile fixe 56×56 → figé + masqué.
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(4)
                                    .background(Circle().fill(.black.opacity(0.4)))
                                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                                    .padding(3)
                                    .accessibilityHidden(true)
                            }
                        } else if attachment.type == .audio {
                            audioTileFallback(attachment)
                        } else if attachment.type == .location {
                            locationTileFallback()
                        } else {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.7)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 56, height: 56)

                            Image(systemName: iconForAttachmentType(attachment.type))
                                // Doctrine 86i : glyphe de type décoratif borné par la tuile fixe 56×56 → figé + masqué
                                // (le libellé sous la tuile porte le nom du fichier).
                                .font(.system(size: 22))
                                .foregroundColor(.white)
                                .accessibilityHidden(true)
                        }
                    }
                    .frame(width: 56, height: 56)
                }
                .accessibilityLabel(String(localized: "conversation.composer.attachment.preview", defaultValue: "Aperçu \(labelForAttachment(attachment))", bundle: .main))

                // Delete button — top-right corner
                Button {
                    removePendingAttachment(attachment)
                } label: {
                    Image(systemName: "xmark")
                        // Doctrine 82i : glyphe de suppression dans un cadre tap fixe 18×18 → figé.
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 18, height: 18)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: MeeshyColors.error.opacity(0.4), radius: 3, y: 1)
                        )
                }
                .accessibilityLabel(String(localized: "conversation.view.composer.delete_attachment", defaultValue: "Supprimer \(labelForAttachment(attachment))", bundle: .main))
                .offset(x: 5, y: -5)
            }

            Text(labelForAttachment(attachment))
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 60)
        }
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
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            let id = attachment.id
            if pendingAudioPlayer.isPlaying { pendingAudioPlayer.stop() }
            composerState.pendingAttachments.removeAll { $0.id == id }
            if let url = composerState.pendingMediaFiles.removeValue(forKey: id) {
                try? FileManager.default.removeItem(at: url)
            }
            composerState.pendingThumbnails.removeValue(forKey: id)
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
        case .image:
            // Guard at the source: only open the editor when a thumbnail
            // genuinely exists to show. The fullScreenCover below has its own
            // defense-in-depth fallback for the (rarer) case where the
            // thumbnail vanishes AFTER presentation starts, but there is no
            // reason to open the cover at all for an id that has none now.
            guard composerState.pendingThumbnails[attachment.id] != nil else { return }
            scrollState.editingPendingAttachmentId = attachment.id
        case .video:
            if let url = composerState.pendingMediaFiles[attachment.id] {
                scrollState.videoToEdit = url
            }
        case .audio:
            if let url = composerState.pendingMediaFiles[attachment.id] {
                scrollState.audioToEdit = PendingAudioEdit(id: attachment.id, url: url)
            }
        default:
            break
        }
    }

    /// Dismissable full-screen fallback for the (rare) race where a pending
    /// attachment's thumbnail is gone by the time its editor cover presents —
    /// see the doc-comment on the "C. Tap pending image" fullScreenCover.
    func attachmentPreviewUnavailableFallback(onDismiss: @escaping () -> Void) -> some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "photo.badge.exclamationmark")
                    .font(.system(size: 40))
                    .foregroundColor(.white.opacity(0.7))
                Text(String(localized: "conversation.view.composer.attachmentUnavailable",
                            defaultValue: "Pièce jointe indisponible", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .medium))
                    .foregroundColor(.white)
                Button(action: onDismiss) {
                    Text(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(.white.opacity(0.15)))
                }
            }
        }
    }

    // MARK: - Rich Tile Fallbacks

    private func audioTileFallback(_ attachment: MessageAttachment) -> some View {
        let color = Color(hex: attachment.thumbnailColor)
        let isPlaying = pendingAudioPlayer.isPlaying
        return ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(
                    LinearGradient(
                        colors: [color, color.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 56, height: 56)

            VStack(spacing: 3) {
                HStack(spacing: 1.5) {
                    ForEach(0..<7, id: \.self) { i in
                        let h: CGFloat = [0.3, 0.8, 0.5, 1.0, 0.4, 0.9, 0.6][i]
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color.white.opacity(isPlaying ? 0.9 : 0.6))
                            .frame(width: 2, height: 4 + 14 * h)
                    }
                }
                .frame(height: 20)

                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    // Doctrine 86i : glyphe décoratif borné par la tuile fixe 56×56 → figé + masqué.
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white.opacity(0.8))
                    .accessibilityHidden(true)
            }
        }
    }

    private func locationTileFallback() -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.success, MeeshyColors.successDeep],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 56, height: 56)

            VStack(spacing: 2) {
                Image(systemName: "mappin.circle.fill")
                    // Doctrine 86i : glyphe décoratif borné par la tuile fixe 56×56 → figé + masqué.
                    .font(.system(size: 22))
                    .foregroundStyle(.white, .white.opacity(0.3))
                    .accessibilityHidden(true)
                Circle()
                    .fill(Color.white.opacity(0.3))
                    .frame(width: 8, height: 4)
                    .scaleEffect(x: 1.8, y: 1)
            }
        }
    }

    /// Tuile d'aperçu du lieu en attente d'envoi — même gabarit 56×56 que
    /// `attachmentPreviewTile`, mais pour un `SharedPlace` : depuis la Task
    /// 11/12 il ne vit plus dans `pendingAttachments`, donc sans cette tuile
    /// dédiée le choix d'un lieu ne produirait plus aucun retour visuel dans
    /// le composer (régression que l'ancien `MessageAttachment.location`
    /// couvrait par accident).
    private func pendingPlaceTile(_ place: SharedPlace) -> some View {
        let label = MediaKindLabel.placeLabel(place.name)
        return VStack(spacing: 4) {
            ZStack(alignment: .topTrailing) {
                locationTileFallback()

                Button {
                    removePendingPlace()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 18, height: 18)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: MeeshyColors.error.opacity(0.4), radius: 3, y: 1)
                        )
                }
                .accessibilityLabel(String(localized: "conversation.view.composer.delete_attachment", defaultValue: "Supprimer \(label)", bundle: .main))
                .offset(x: 5, y: -5)
            }

            Text(label)
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 60)
        }
    }

    private func removePendingPlace() {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            composerState.pendingPlace = nil
        }
    }

    func iconForAttachmentType(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    func labelForAttachment(_ attachment: MessageAttachment) -> String {
        MediaKindLabel.attachmentLabel(for: attachment)
    }

    // See ConversationView+AttachmentHandlers.swift for: startRecording, stopAndPreviewRecording, stopAndSendRecording, sendMessageWithAttachments, handlePhotoSelection, generateVideoThumbnail, handleFileImport, mimeTypeForURL, getFileSize, handleCameraCapture, sendMessage
}
