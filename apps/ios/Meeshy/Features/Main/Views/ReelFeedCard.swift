import SwiftUI
import MeeshySDK
import MeeshyUI

/// Carte Réel plein-cadre du feed : média en fond (aspect-fill, plafond 4:5),
/// auteur + boutons en overlay, logo Réel coin haut-droit sans texte. Autoplay
/// muet quand `isActive`. Tap sur le média → viewer plein écran via `onTapMedia`.
struct ReelFeedCard: View, Equatable {
    let post: FeedPost
    let isActive: Bool
    let isDark: Bool

    // Optimistic state (fourni par FeedView, identique à FeedPostCard)
    let isLiked: Bool
    let displayLikeCount: Int
    let isBookmarked: Bool
    let displayBookmarkCount: Int
    let isReposted: Bool
    let displayRepostCount: Int
    let displayShareCount: Int

    // Callbacks (mêmes signatures que FeedPostCard)
    let onTapMedia: () -> Void
    let onLike: (String) -> Void
    let onComment: (String) -> Void
    let onRepost: (String) -> Void
    let onBookmark: (String) -> Void
    let onShare: (String) -> Void
    let onTapAuthor: (String) -> Void

    static func == (lhs: ReelFeedCard, rhs: ReelFeedCard) -> Bool {
        lhs.post.id == rhs.post.id
            && lhs.isActive == rhs.isActive
            && lhs.isDark == rhs.isDark
            && lhs.isLiked == rhs.isLiked
            && lhs.displayLikeCount == rhs.displayLikeCount
            && lhs.isBookmarked == rhs.isBookmarked
            && lhs.displayBookmarkCount == rhs.displayBookmarkCount
            && lhs.isReposted == rhs.isReposted
            && lhs.displayRepostCount == rhs.displayRepostCount
            && lhs.displayShareCount == rhs.displayShareCount
            && lhs.post.commentCount == rhs.post.commentCount
            && lhs.post.content == rhs.post.content
            && lhs.post.translatedContent == rhs.post.translatedContent
    }

    private var media: FeedMedia? { post.primaryReelMedia }
    private var accentHex: String { post.authorColor }

    private var kind: ReelMediaKind {
        switch media?.type {
        case .video: return .video
        case .audio: return .audio
        default: return .imageOnly
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = reelCardHeight(mediaWidth: media?.width, mediaHeight: media?.height, cardWidth: width)
            ZStack(alignment: .bottom) {
                background(width: width, height: height)
                bottomOverlay
                reelGlyph
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .onTapGesture { onTapMedia() }
        }
        .frame(height: reelCardHeight(mediaWidth: media?.width, mediaHeight: media?.height, cardWidth: cardWidthEstimate))
        .reportReelFrame(id: post.id, kind: kind)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "feed.reel.card.a11y", defaultValue: "Réel de \(post.author)", bundle: .main))
    }

    // Largeur de contenu du feed (le GeometryReader donne la vraie ; estimation
    // pour fixer la hauteur du conteneur avant mesure).
    private var cardWidthEstimate: CGFloat { UIScreen.main.bounds.width - 32 }

    // MARK: - Background média (aspect-fill)

    @ViewBuilder
    private func background(width: CGFloat, height: CGFloat) -> some View {
        switch kind {
        case .video:
            if let media {
                ReelFeedVideoSurface(media: media, isActive: isActive)
                    .frame(width: width, height: height)
                    .clipped()
            } else {
                Color(hex: accentHex).opacity(0.5)
            }
        case .audio:
            ReelAudioBackdrop(accentHex: accentHex, isActive: isActive)
        case .imageOnly:
            if let media, media.thumbnailUrl != nil || media.url != nil || media.thumbHash != nil {
                ProgressiveCachedImage(
                    thumbHash: media.thumbHash,
                    thumbnailUrl: media.thumbnailUrl,
                    fullUrl: media.url,
                    autoLoad: true
                ) {
                    Color(hex: media.thumbnailColor)
                        .shimmer()
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: width, height: height)
                .clipped()
            } else {
                Color(hex: accentHex).opacity(0.5)
            }
        }
    }

    // MARK: - Logo Réel (coin haut-droit, sans texte)

    private var reelGlyph: some View {
        VStack {
            HStack {
                Spacer()
                Image(systemName: "play.rectangle.on.rectangle.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .padding(8)
                    .background(Circle().fill(.ultraThinMaterial))
                    .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                    .padding(10)
                    .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
            }
            Spacer()
        }
        .accessibilityHidden(true)
    }

    // MARK: - Overlay bas (scrim + auteur + texte + boutons)

    private var bottomOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            Spacer()
            authorRow
            if !post.content.isEmpty {
                Text(post.displayContent)
                    .font(.subheadline)
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
            actionsRow
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [.clear, .black.opacity(0.55)],
                startPoint: .top, endPoint: .bottom
            )
        )
    }

    private var authorRow: some View {
        Button { onTapAuthor(post.authorId) } label: {
            HStack(spacing: 8) {
                MeeshyAvatar(
                    name: post.author,
                    context: .custom(34),
                    accentColor: accentHex,
                    avatarURL: post.authorAvatarURL
                )
                Text(post.author)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "feed.reel.author.a11y", defaultValue: "Profil de \(post.author)", bundle: .main))
    }

    private var actionsRow: some View {
        HStack(spacing: 0) {
            reelButton(system: isLiked || displayLikeCount > 0 ? "heart.fill" : "heart",
                       tint: isLiked ? MeeshyColors.error : .white,
                       count: displayLikeCount,
                       label: String(localized: "feed.post.likes_count", defaultValue: "\(displayLikeCount) j'aime", bundle: .main)) { onLike(post.id) }
            Spacer()
            reelButton(system: "bubble.right",
                       tint: .white,
                       count: post.commentCount,
                       label: String(localized: "feed.post.comments_count", defaultValue: "\(post.commentCount) commentaires", bundle: .main)) { onComment(post.id) }
            Spacer()
            reelButton(system: isReposted ? "arrow.2.squarepath.circle.fill" : "arrow.2.squarepath",
                       tint: isReposted ? MeeshyColors.success : .white,
                       count: displayRepostCount,
                       label: String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main)) { onRepost(post.id) }
            Spacer()
            reelButton(system: isBookmarked ? "bookmark.fill" : "bookmark",
                       tint: isBookmarked ? MeeshyColors.warning : .white,
                       count: displayBookmarkCount,
                       label: String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main)) { onBookmark(post.id) }
            Spacer()
            reelButton(system: "square.and.arrow.up",
                       tint: .white,
                       count: displayShareCount,
                       label: String(localized: "feed.post.share", defaultValue: "Partager", bundle: .main)) { onShare(post.id) }
        }
    }

    private func reelButton(system: String, tint: Color, count: Int, label: String, action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: system).font(.system(size: 18))
                if count > 0 {
                    Text("\(count)").font(.footnote.weight(.medium))
                }
            }
            .foregroundColor(tint)
            .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
