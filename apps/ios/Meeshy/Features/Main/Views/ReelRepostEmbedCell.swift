import SwiftUI
import MeeshySDK
import MeeshyUI

/// Renders a feed POST that reposts a REEL as a rich, tappable reel preview —
/// poster (or audio backdrop) + center play glyph + reel badge (top-right) +
/// the original author + caption + like count — instead of the empty
/// text-only quote block. A reel's content lives in `media` + caption, never in
/// the `content` text, so the legacy `repostView` rendered a blank card.
///
/// Used by `FeedPostCard` when `post.type == "POST"` AND `post.repost?.type == "REEL"`.
/// Tap forwards to `onTap` (→ reel detail page). Mirrors `StoryRepostEmbedCell`.
///
/// Leaf view: reads `ThemeManager.shared` directly and takes value inputs only
/// (no `@ObservedObject` on global singletons) so the feed list stays cheap to
/// re-render.
struct ReelRepostEmbedCell: View {
    let post: FeedPost
    var onTap: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            attributionHeader

            // The re-poster's own added text (quote). The reel's caption is
            // shown inside the preview overlay, not here.
            if !post.content.isEmpty {
                Text(post.displayContent)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let repost = post.repost {
                Button {
                    HapticFeedback.light()
                    onTap?()
                } label: {
                    reelPreview(repost)
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(String(localized: "feed.reel.repost.by", defaultValue: "Réel de \(repost.author)", bundle: .main))
                .accessibilityHint(String(localized: "feed.reel.repost.hint", defaultValue: "Appuyez deux fois pour ouvrir le réel", bundle: .main))
                .accessibilityAddTraits(.isButton)
            }
        }
    }

    // MARK: - Attribution (single-level, mirrors StoryRepostEmbedCell)

    @ViewBuilder
    private var attributionHeader: some View {
        if let repost = post.repost {
            let handle = repost.authorUsername ?? repost.author
            Text(String(localized: "story.repost.from", defaultValue: "Reposted from", bundle: .main) + " @\(handle)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.bottom, 4)
        }
    }

    // MARK: - Reel preview (9:16, poster + glyphs + overlay)

    @ViewBuilder
    private func reelPreview(_ repost: RepostContent) -> some View {
        ZStack {
            poster(repost)
            centerPlayButton(repost)
            reelBadge
            bottomOverlay(repost)
        }
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        // Cap the embed width so on iPad it doesn't stretch into a giant
        // vertical column in a wide feed pane (mirrors StoryRepostEmbedCell).
        .frame(maxWidth: 420)
        .frame(maxWidth: .infinity, alignment: .center)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder
    private func poster(_ repost: RepostContent) -> some View {
        if let media = repost.primaryReelMedia, media.type != .audio, posterURL(media) != nil {
            ProgressiveCachedImage(
                thumbHash: media.thumbHash,
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: posterURL(media),
                autoLoad: true
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
        } else {
            // Audio-only or media-less reel: brand-tinted backdrop + music glyph.
            ZStack {
                Color(hex: repost.authorColor).opacity(0.45)
                Image(systemName: "music.note")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundColor(.white.opacity(0.85))
            }
        }
    }

    /// Center play affordance — shown for video reels only (poster is a still).
    @ViewBuilder
    private func centerPlayButton(_ repost: RepostContent) -> some View {
        if repost.primaryReelMedia?.type == .video {
            Image(systemName: "play.fill")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.white)
                .padding(16)
                .background(Circle().fill(.ultraThinMaterial))
                .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                .shadow(color: .black.opacity(0.3), radius: 4, y: 1)
        }
    }

    /// Reel badge (top-right) — the "logo Réel" lost when a reel share renders
    /// as a plain POST card. Visual only; the whole preview is the tap target.
    private var reelBadge: some View {
        VStack {
            HStack {
                Spacer()
                Image(systemName: "play.rectangle.on.rectangle.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .padding(7)
                    .background(Circle().fill(.ultraThinMaterial))
                    .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                    .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
                    .padding(10)
            }
            Spacer()
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func bottomOverlay(_ repost: RepostContent) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Spacer()
            HStack(spacing: 8) {
                MeeshyAvatar(
                    name: repost.author,
                    context: .postComment,
                    accentColor: repost.authorColor,
                    avatarURL: repost.authorAvatarURL
                )
                Text("@\(repost.authorUsername ?? repost.author)")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }

            if !repost.content.isEmpty {
                Text(repost.content)
                    .font(.subheadline)
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }

            HStack(spacing: 4) {
                Image(systemName: "heart.fill")
                    .font(.caption2)
                    .accessibilityHidden(true)
                Text("\(repost.likes)")
                    .font(.caption.weight(.medium))
            }
            .foregroundColor(.white.opacity(0.9))
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [.clear, .black.opacity(0.55)],
                startPoint: .top, endPoint: .bottom
            )
        )
    }

    // MARK: - Helpers

    /// Poster (still) URL for the preview: a video's thumbnail, or an image's
    /// own URL falling back to its thumbnail.
    private func posterURL(_ media: FeedMedia) -> String? {
        media.type == .image ? (media.url ?? media.thumbnailUrl) : media.thumbnailUrl
    }
}
