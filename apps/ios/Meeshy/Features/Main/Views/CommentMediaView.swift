import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bandeau réutilisable des pièces jointes stagées d'un commentaire (chips avec
/// retrait). Partagé par toutes les surfaces de composer commentaire (feed/reels,
/// post detail, stories) via `customAttachmentsPreview` de `UniversalComposerBar`.
struct CommentAttachmentsTray: View {
    let attachments: [ComposerAttachment]
    let onRemove: (String) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(attachments) { attachment in
                    HStack(spacing: 6) {
                        Image(systemName: icon(for: attachment.type))
                            .font(.caption)
                            .foregroundColor(Color(hex: attachment.thumbnailColor))
                        Text(attachment.name)
                            .font(.caption.weight(.medium))
                            .lineLimit(1)
                            .frame(maxWidth: 120)
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                                onRemove(attachment.id)
                            }
                            if let url = attachment.url { try? FileManager.default.removeItem(at: url) }
                        } label: {
                            Image(systemName: "xmark")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(theme.textMuted)
                                .frame(width: 18, height: 18)
                                .background(Circle().fill(theme.textMuted.opacity(0.15)))
                        }
                        .accessibilityLabel(String(localized: "composer.a11y.removeAttachment", defaultValue: "Retirer la pi\u{00E8}ce jointe", bundle: .main))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(theme.inputBackground)
                            .overlay(Capsule().stroke(theme.textMuted.opacity(0.2), lineWidth: 0.5))
                    )
                    .foregroundColor(theme.textPrimary)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
    }

    private func icon(for type: ComposerAttachmentType) -> String {
        switch type {
        case .voice: return "mic.fill"
        case .location: return "location.fill"
        case .image: return "photo.fill"
        case .file: return "doc.fill"
        case .video: return "video.fill"
        }
    }
}

/// Rendu inline du média unique d'un commentaire (image / vidéo / audio), avec
/// lecture plein écran « comme dans une conversation ». Réutilise EXACTEMENT les
/// mêmes building blocks que les médias de post/message :
/// - image  → `ProgressiveCachedImage` + plein écran `ConversationMediaGalleryView`
/// - vidéo  → `MeeshyVideoPlayer(.inline)` + expand plein écran
/// - audio  → `AudioPlayerView(.feedPost)` avec transcription + variantes TTS (Prisme)
///
/// Le commentaire ne porte QU'UN SEUL média (cf. backend `commentId` FK sur PostMedia).
/// Orchestration cache → policy → downloader déléguée aux resolvers app-side
/// (`VideoAvailabilityResolver` / `AudioAvailabilityResolver`).
struct CommentMediaView: View {
    let media: FeedMedia
    let accentColor: String
    /// Infos auteur pour le label expéditeur du viewer plein écran (parité
    /// conversation : avatar + nom + date au-dessus du média).
    let authorName: String
    let authorAvatarURL: String?
    let authorColor: String
    let sentAt: Date

    @State private var showFullscreen = false
    @State private var audioFullscreen: AudioFullscreenSource?

    private var theme: ThemeManager { ThemeManager.shared }

    private var author: ProfileSheetUser {
        ProfileSheetUser(username: authorName, displayName: authorName,
                         avatarURL: authorAvatarURL, accentColor: authorColor)
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .fullScreenCover(isPresented: $showFullscreen) {
                fullscreenViewer
            }
            .audioFullscreenCover($audioFullscreen, accentColor: accentColor)
    }

    @ViewBuilder
    private var content: some View {
        switch media.type {
        case .image:
            imageView
        case .video:
            videoView
        case .audio:
            audioView
        case .document, .location:
            // Hors périmètre commentaire (image/vidéo/audio) — fallback discret.
            EmptyView()
        }
    }

    // MARK: - Image

    private var imageView: some View {
        let aspectRatio: CGFloat? = {
            guard let w = media.width, let h = media.height, w > 0, h > 0 else { return nil }
            return CGFloat(w) / CGFloat(h)
        }()
        return ProgressiveCachedImage(
            thumbHash: media.thumbHash,
            thumbnailUrl: media.thumbnailUrl,
            fullUrl: media.url,
            autoLoad: true
        ) {
            Color(hex: media.thumbnailColor).shimmer()
        }
        .aspectRatio(aspectRatio, contentMode: .fill)
        .frame(maxWidth: 260, minHeight: 120, maxHeight: 220)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .onTapGesture {
            showFullscreen = true
            HapticFeedback.light()
        }
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(String(localized: "a11y.comment.media.image", defaultValue: "Image du commentaire", bundle: .main))
        .accessibilityHint(String(localized: "feed.media.viewFullscreen", defaultValue: "Toucher pour agrandir", bundle: .main))
    }

    // MARK: - Video

    private var videoView: some View {
        let attachment = media.toMessageAttachment()
        return VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            MeeshyVideoPlayer(
                attachment: attachment,
                style: .inline,
                controls: .inlineDefault,
                accentColor: accentColor,
                frame: .card,
                availability: availability,
                performance: .inline,
                onDownload: onDownload,
                onExpand: {
                    showFullscreen = true
                    HapticFeedback.light()
                }
            )
        }
        .frame(maxWidth: 260, maxHeight: 220)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
    }

    // MARK: - Audio

    private var audioView: some View {
        let attachment = media.toMessageAttachment()
        return AudioAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            AudioPlayerView(
                attachment: attachment,
                context: .feedPost,
                accentColor: accentColor,
                transcription: media.transcription,
                translatedAudios: media.translatedAudios,
                onFullscreen: {
                    audioFullscreen = .fromFeed(
                        media: media, author: author,
                        originalLanguage: nil, caption: "", createdAt: sentAt
                    )
                },
                availability: availability,
                onDownload: onDownload
            )
        }
        .frame(maxWidth: 320)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
    }

    // MARK: - Fullscreen

    @ViewBuilder
    private var fullscreenViewer: some View {
        let attachment = media.toMessageAttachment()
        let senderInfo = ConversationViewModel.MediaSenderInfo(
            senderName: authorName,
            senderAvatarURL: authorAvatarURL,
            senderColor: authorColor,
            sentAt: sentAt
        )
        ConversationMediaGalleryView(
            allAttachments: [attachment],
            startAttachmentId: attachment.id,
            accentColor: accentColor,
            senderInfoMap: [attachment.id: senderInfo]
        )
    }
}
