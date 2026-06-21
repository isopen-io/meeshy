import SwiftUI
import MeeshySDK
import MeeshyUI

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

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .fullScreenCover(isPresented: $showFullscreen) {
                fullscreenViewer
            }
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
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contentShape(RoundedRectangle(cornerRadius: 12))
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
        .clipShape(RoundedRectangle(cornerRadius: 12))
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
                availability: availability,
                onDownload: onDownload
            )
        }
        .frame(maxWidth: 320)
        .clipShape(RoundedRectangle(cornerRadius: 12))
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
