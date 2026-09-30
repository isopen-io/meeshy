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
            HStack(spacing: MeeshySpacing.md) {
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
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.smPlus)
        }
        .frame(height: 100)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Attachment Preview Tile
    func attachmentPreviewTile(_ attachment: MessageAttachment) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
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
                                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))

                            if attachment.type == .video {
                                Image(systemName: "play.circle.fill")
                                    // Doctrine 86i : overlay décoratif borné par la tuile fixe 56×56 → figé + masqué.
                                    .font(.system(size: 20))
                                    .foregroundStyle(MeeshyColors.mediaChromeForeground, MeeshyColors.mediaChromeFill)
                                    .accessibilityHidden(true)
                            } else if attachment.type == .image {
                                Image(systemName: "eye.fill")
                                    // Doctrine 86i : indicateur décoratif borné par la tuile fixe 56×56 → figé + masqué.
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(MeeshySpacing.xs)
                                    .background(Circle().fill(MeeshyColors.mediaChromeFill))
                                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                                    .padding(MeeshySpacing.xxs)
                                    .accessibilityHidden(true)
                            }
                        } else if attachment.type == .audio {
                            PendingAudioTile(attachment: attachment, player: pendingAudioPlayer)
                        } else if attachment.type == .location {
                            locationTileFallback()
                        } else {
                            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(MeeshyOpacity.heavy)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 56, height: 56)

                            Image(systemName: attachment.type.composerGlyph)
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
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
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

    /// Ferme la retouche et oublie sa source décodée (#8524) — l'image à
    /// 2 048 px ne survit pas à la couverture.
    func closePendingImageRetouche() {
        scrollState.editingPendingAttachmentId = nil
        scrollState.editingPendingSource = nil
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
            guard let vignette = composerState.pendingThumbnails[attachment.id],
                  ConversationImageRetouche.offersRetouche(mimeType: attachment.mimeType) else { return }
            let id = attachment.id
            let fichier = composerState.pendingMediaFiles[id]
            Task {
                var source: UIImage?
                if let fichier { source = await ConversationImageRetouche.loadSource(fileURL: fichier) }
                scrollState.editingPendingSource = source ?? vignette
                scrollState.editingPendingAttachmentId = id
            }
        case .video:
            if let url = composerState.pendingMediaFiles[attachment.id] {
                scrollState.videoToEdit = PendingVideoEdit(id: attachment.id, url: url)
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
            VStack(spacing: MeeshySpacing.lg) {
                Image(systemName: "photo.badge.exclamationmark")
                    .font(.system(size: 40))
                    .foregroundColor(.white.opacity(MeeshyOpacity.heavy))
                Text(String(localized: "conversation.view.composer.attachmentUnavailable",
                            defaultValue: "Pièce jointe indisponible", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                    .foregroundColor(.white)
                Button(action: onDismiss) {
                    Text(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, MeeshySpacing.xxl)
                        .padding(.vertical, MeeshySpacing.smPlus)
                        .background(Capsule().fill(.white.opacity(MeeshyOpacity.light)))
                }
            }
        }
    }

    // MARK: - Rich Tile Fallbacks

    private func locationTileFallback() -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.success, MeeshyColors.successDeep],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 56, height: 56)

            VStack(spacing: MeeshySpacing.xxs) {
                Image(systemName: "mappin.circle.fill")
                    // Doctrine 86i : glyphe décoratif borné par la tuile fixe 56×56 → figé + masqué.
                    .font(.system(size: 22))
                    .foregroundStyle(.white, .white.opacity(MeeshyOpacity.medium))
                    .accessibilityHidden(true)
                Circle()
                    .fill(Color.white.opacity(MeeshyOpacity.medium))
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
        return VStack(spacing: MeeshySpacing.xs) {
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
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
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
        let color = Color(hex: attachment.thumbnailColor)
        let isPlaying = player.isPlaying
        return ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(
                    LinearGradient(
                        colors: [color, color.opacity(MeeshyOpacity.heavy)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 56, height: 56)

            VStack(spacing: MeeshySpacing.xxs) {
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
                    .foregroundColor(.white.opacity(MeeshyOpacity.intense))
                    .accessibilityHidden(true)
            }
        }
    }
}
