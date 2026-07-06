import SwiftUI
import MeeshySDK
import MeeshyUI

/// Renders a feed POST that reposts a REEL as a compact, full-width "cited
/// post" card — a short media strip (reel logo + centered music glyph for an
/// audio reel, or a cropped poster for a video reel) followed by the original
/// author, caption and engagement counts. Mirrors the visual language of the
/// generic `repostView` (cited posts) instead of a tall 9:16 portrait that
/// filled most of the feed.
///
/// Used by `FeedPostCard` when `post.type == "POST"` AND `post.repost?.type == "REEL"`.
/// Tap forwards to `onTap` (→ reel detail page).
///
/// Leaf view: reads `ThemeManager.shared` directly and takes value inputs only
/// (no `@ObservedObject` on global singletons) so the feed list stays cheap to
/// re-render.
struct ReelRepostEmbedCell: View {
    let post: FeedPost
    /// Drives the inline muted autoplay surface for a video reel. Elected by
    /// `ReelFeedAutoplayCoordinator` and threaded in by `ReelRepostEmbedContainer`
    /// — keyed on this card's CONTAINING post id (`reelCellId`), never the reposted
    /// reel id, so a reel shown natively AND as a repost elects exactly one surface.
    var isActive: Bool = false
    var onTap: (() -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }

    /// Election identity reported to `ReelFeedAutoplayCoordinator`: the CONTAINING
    /// (reposter's) post id. NEVER `post.repost?.id` (the reposted reel id) — if a
    /// reel appears both as a native reel card and inside this repost cell, keying
    /// on the reel id would make BOTH surfaces bind the single shared player.
    var reelCellId: String { post.id }

    /// The reposted reel's primary media when it is a VIDEO — the only case that
    /// mounts the autoplay surface. `nil` for audio-only / media-less reels (which
    /// keep the tinted music backdrop) or non-reel reposts. Pure; unit-tested.
    static func reelVideoMedia(for repost: RepostContent) -> FeedMedia? {
        guard let media = repost.primaryReelMedia, media.type == .video else { return nil }
        return media
    }

    private func reelKind(_ repost: RepostContent) -> ReelMediaKind {
        switch repost.primaryReelMedia?.type {
        case .video: return .video
        case .audio: return .audio
        default: return .imageOnly
        }
    }

    /// Short media-strip height. Tall enough to read the reel badge + the
    /// centered music glyph (audio) or a cropped poster band (video), short
    /// enough that the card stays compact — the caption drives the rest of the
    /// height, exactly like a cited post.
    private let stripHeight: CGFloat = 116

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            attributionHeader

            // The re-poster's own added text (quote). The reel's caption is
            // shown inside the card, not here.
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
                    reelCard(repost)
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

    // MARK: - Reel card (full-width, content-height — mirrors repostView)

    @ViewBuilder
    private func reelCard(_ repost: RepostContent) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            mediaStrip(repost)

            // Original author
            HStack(spacing: 8) {
                MeeshyAvatar(
                    name: repost.author,
                    context: .postComment,
                    accentColor: repost.authorColor,
                    avatarURL: repost.authorAvatarURL
                )
                Text("@\(repost.authorUsername ?? repost.author)")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(theme.accentText(repost.authorColor))
                    .lineLimit(1)
                Spacer(minLength: 0)
            }

            // Reel caption — drives the card height, like a cited post.
            if !repost.content.isEmpty {
                Text(repost.content)
                    .font(.footnote)
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            statsRow(repost)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.accentText(repost.authorColor).opacity(0.2), lineWidth: 1)
                )
        )
    }

    // MARK: - Media strip (short, full-width)

    /// Short full-width banner: poster (video/image) or tinted music backdrop
    /// (audio/media-less), with the reel badge top-right and a center play
    /// glyph for video reels. Cropped to a fixed short height so the card stays
    /// compact instead of a full 9:16 portrait.
    private func mediaStrip(_ repost: RepostContent) -> some View {
        ZStack {
            poster(repost)
            centerPlayButton(repost)
            reelBadge
        }
        .frame(maxWidth: .infinity)
        .frame(height: stripHeight)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        // Publish this card's frame so the feed coordinator can elect it (keyed on
        // the containing post id — see `reelCellId`). Same `.global` aggregation as
        // the native `ReelFeedCard`, so native + repost cells compete in one election.
        .reportReelFrame(id: reelCellId, kind: reelKind(repost))
    }

    @ViewBuilder
    private func poster(_ repost: RepostContent) -> some View {
        if let videoMedia = Self.reelVideoMedia(for: repost) {
            // Video reel: inline MUTED autoplay surface routed through the single
            // `SharedAVPlayerManager` (no 2nd player), call-gated, force-muted (feed
            // policy). It renders its own poster beneath until the first frame, and
            // shows only the poster while inactive.
            ReelFeedVideoSurface(media: videoMedia, isActive: isActive)
                .aspectRatio(contentMode: .fill)
        } else if let media = repost.primaryReelMedia, media.type != .audio, posterURL(media) != nil {
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
                    // doctrine 86i — glyphe décoratif borné par la bande média de hauteur fixe (stripHeight)
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundColor(.white.opacity(0.85))
            }
        }
    }

    /// Center play affordance — shown for video reels only (poster is a still).
    @ViewBuilder
    private func centerPlayButton(_ repost: RepostContent) -> some View {
        if repost.primaryReelMedia?.type == .video {
            Image(systemName: "play.fill")
                // doctrine 86i — affordance décorative bornée par la bande média de hauteur fixe (stripHeight)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)
                .padding(13)
                .background(Circle().fill(.ultraThinMaterial))
                .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                .shadow(color: .black.opacity(0.3), radius: 4, y: 1)
        }
    }

    /// Reel badge (top-right) — the "logo Réel". Visual only; the whole card is
    /// the tap target.
    private var reelBadge: some View {
        VStack {
            HStack {
                Spacer()
                Image(systemName: "play.rectangle.on.rectangle.fill")
                    // doctrine 86i — badge décoratif borné par la bande média de hauteur fixe (stripHeight)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .padding(6)
                    .background(Circle().fill(.ultraThinMaterial))
                    .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                    .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
                    .padding(8)
            }
            Spacer()
        }
        .accessibilityHidden(true)
    }

    // MARK: - Stats (likes — shares count is not in the repost payload)

    private func statsRow(_ repost: RepostContent) -> some View {
        HStack(spacing: 16) {
            HStack(spacing: 4) {
                Image(systemName: "heart.fill")
                    .font(.caption2)
                    .accessibilityHidden(true)
                Text("\(repost.likes)")
                    .font(.caption.weight(.medium))
            }
            .foregroundColor(theme.accentText(repost.authorColor).opacity(0.8))
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "feed.reel.repost.likes", defaultValue: "\(repost.likes) j'aime", bundle: .main))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Helpers

    /// Poster (still) URL for the preview: a video's thumbnail, or an image's
    /// own URL falling back to its thumbnail.
    private func posterURL(_ media: FeedMedia) -> String? {
        media.type == .image ? (media.url ?? media.thumbnailUrl) : media.thumbnailUrl
    }
}

// MARK: - Equatable (leaf-cell short-circuit)

extension ReelRepostEmbedCell: Equatable {
    /// Re-render only when identity, the elected `isActive`, or the visible reel
    /// fields change — election churn from OTHER cells leaves this one untouched.
    nonisolated static func == (lhs: ReelRepostEmbedCell, rhs: ReelRepostEmbedCell) -> Bool {
        lhs.post.id == rhs.post.id
            && lhs.isActive == rhs.isActive
            && lhs.post.content == rhs.post.content
            && lhs.post.repost?.id == rhs.post.repost?.id
            && lhs.post.repost?.likes == rhs.post.repost?.likes
            && lhs.post.repost?.content == rhs.post.repost?.content
    }
}

// MARK: - Autoplay container

/// Observes the feed's `ReelFeedAutoplayCoordinator` and drives the embedded reel
/// cell's `isActive` from the CONTAINING post id (cell identity). Mirrors
/// `ReelFeedCardContainer`: the container observes the coordinator while the inner
/// `.equatable()` `ReelRepostEmbedCell` short-circuits, so an election change on a
/// different cell never re-renders this one.
struct ReelRepostEmbedContainer: View {
    @ObservedObject var coordinator: ReelFeedAutoplayCoordinator
    let post: FeedPost
    var onTap: (() -> Void)? = nil

    var body: some View {
        ReelRepostEmbedCell(
            post: post,
            isActive: coordinator.activeReelId == post.id,
            onTap: onTap
        )
        .equatable()
    }
}
