import SwiftUI
import MeeshySDK
import MeeshyUI

/// Conteneur d'observation pour `ReelFeedCard` : SEUL point qui dépend de
/// `activeReelId`. Il observe le coordinator et calcule `isActive` EN INTERNE,
/// de sorte que le body de `FeedView` ne lise jamais `activeReelId` — sans quoi
/// tout changement d'élection ré-évaluerait le `ForEach` entier (I1). Ici, seuls
/// les conteneurs visibles du `LazyVStack` se ré-évaluent ; `ReelFeedCard`
/// (feuille Equatable, inputs primitifs) court-circuite les cartes dont
/// `isActive` n'a pas bougé.
struct ReelFeedCardContainer: View {
    @ObservedObject var coordinator: ReelFeedAutoplayCoordinator
    let post: FeedPost
    let isDark: Bool

    let isLiked: Bool
    let displayLikeCount: Int
    let isBookmarked: Bool
    let displayBookmarkCount: Int
    let isReposted: Bool
    let displayRepostCount: Int
    let displayShareCount: Int

    let onTapMedia: () -> Void
    let onTapGlyph: () -> Void
    let onLike: (String) -> Void
    let onComment: (String) -> Void
    let onRepost: (String) -> Void
    let onBookmark: (String) -> Void
    let onShare: (String) -> Void
    let onTapAuthor: (String) -> Void

    var body: some View {
        ReelFeedCard(
            post: post,
            isActive: coordinator.activeReelId == post.id,
            isDark: isDark,
            isLiked: isLiked,
            displayLikeCount: displayLikeCount,
            isBookmarked: isBookmarked,
            displayBookmarkCount: displayBookmarkCount,
            isReposted: isReposted,
            displayRepostCount: displayRepostCount,
            displayShareCount: displayShareCount,
            onTapMedia: onTapMedia,
            onTapGlyph: onTapGlyph,
            onLike: onLike,
            onComment: onComment,
            onRepost: onRepost,
            onBookmark: onBookmark,
            onShare: onShare,
            onTapAuthor: onTapAuthor
        )
        .equatable()
    }
}

/// Carte Réel plein-cadre du feed : média en fond (aspect-fill, plafond 4:5),
/// auteur + boutons en overlay, logo Réel coin haut-droit sans texte. Autoplay
/// muet quand `isActive`. Tap sur le média → viewer plein écran via `onTapMedia` ;
/// tap sur le logo Réel → page détail du poste via `onTapGlyph`.
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
    let onTapGlyph: () -> Void
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

    // Repost-aware: a republished reel has no media on the outer post — resolve
    // from the reposted reel so the card shows the original content, not blank.
    private var media: FeedMedia? { post.primaryReelDisplayMedia }
    private var accentHex: String { post.authorColor }

    /// Non-nil when this card displays a REPUBLISHED reel: the outer post has no
    /// media (content sourced from the reposted reel). Drives author attribution
    /// + caption so the card shows the ORIGINAL author, not just the re-poster.
    private var repostedReel: RepostContent? {
        guard post.media.isEmpty, let reposted = post.repost, !reposted.media.isEmpty else { return nil }
        return reposted
    }
    private var displayAuthor: String { repostedReel?.author ?? post.author }
    private var displayAuthorColor: String { repostedReel?.authorColor ?? accentHex }
    private var displayAvatarURL: String? { repostedReel?.authorAvatarURL ?? post.authorAvatarURL }
    private var displayCaption: String {
        post.content.isEmpty ? (repostedReel?.content ?? "") : post.displayContent
    }

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
            // Hauteur dérivée de la MÊME base que le frame extérieur (l.124) pour que
            // le ZStack remplisse EXACTEMENT son conteneur. Sinon hauteur intérieure
            // (depuis la largeur réelle) ≠ hauteur extérieure (depuis l'estimation),
            // le ZStack déborde le GeometryReader et chevauche la carte suivante
            // (entremêlement). Le média est aspect-fill → aucune déformation visible.
            let height = reelCardHeight(mediaWidth: media?.width, mediaHeight: media?.height, cardWidth: cardWidthEstimate)
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
        .accessibilityLabel(String(localized: "feed.reel.card.a11y", defaultValue: "Réel de \(displayAuthor)", bundle: .main))
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

    // MARK: - Logo Réel (coin haut-droit) — tap → page détail du poste

    private var reelGlyph: some View {
        VStack {
            HStack {
                Spacer()
                Button {
                    onTapGlyph()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "play.rectangle.on.rectangle.fill")
                        .font(MeeshyFont.relative(15, weight: .bold))
                        .foregroundColor(.white)
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                        .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                        .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .padding(10)
                .accessibilityLabel(String(localized: "feed.reel.open_detail.a11y", defaultValue: "Ouvrir le détail du réel", bundle: .main))
            }
            Spacer()
        }
    }

    // MARK: - Overlay bas (scrim + auteur + texte + boutons)

    private var bottomOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            Spacer()
            if repostedReel != nil {
                Label(String(localized: "feed.reel.republished.by", defaultValue: "Republié par \(post.author)", bundle: .main),
                      systemImage: "arrow.2.squarepath")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.white.opacity(0.85))
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
            authorRow
            if !displayCaption.isEmpty {
                Text(displayCaption)
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

    /// True when the signed-in user authored this post — gates the private
    /// impression (reach) badge shown only to the author.
    private var isAuthor: Bool {
        guard let me = AuthManager.shared.currentUser?.id else { return false }
        return me == post.authorId
    }

    private var displayUsername: String? { repostedReel?.authorUsername ?? post.authorUsername }

    private var authorRow: some View {
        Button { onTapAuthor(repostedReel?.authorId ?? post.authorId) } label: {
            HStack(spacing: 8) {
                MeeshyAvatar(
                    name: displayAuthor,
                    context: .custom(34),
                    accentColor: displayAuthorColor,
                    avatarURL: displayAvatarURL
                )
                VStack(alignment: .leading, spacing: 1) {
                    Text(displayAuthor)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    authorMetaLine
                }
                .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "feed.reel.author.a11y", defaultValue: "Profil de \(displayAuthor)", bundle: .main))
    }

    /// Username, then (AUTHOR ONLY) the reach analytics — impressions then views,
    /// separated by middle dots: "@pseudo · 📊 1.2k · 👁 3.4k".
    @ViewBuilder
    private var authorMetaLine: some View {
        HStack(spacing: 5) {
            if let u = displayUsername, !u.isEmpty {
                Text("@\(u)").font(.caption).foregroundColor(.white.opacity(0.75))
            }
            if isAuthor {
                if displayUsername?.isEmpty == false { metaDot }
                metricInline(icon: "chart.bar.fill", count: post.impressionCount,
                             a11yLabel: String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main))
                metaDot
                metricInline(icon: "eye.fill", count: post.postOpenCount,
                             a11yLabel: String(localized: "feed.reel.views", defaultValue: "Vues", bundle: .main))
            }
        }
    }

    private var metaDot: some View {
        Text("·").font(.caption).foregroundColor(.white.opacity(0.55))
    }

    private func metricInline(icon: String, count: Int, a11yLabel: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(MeeshyFont.relative(10, weight: .semibold))
            Text(Self.compactCount(count)).font(.caption2.weight(.medium))
        }
        .foregroundColor(.white.opacity(0.85))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(a11yLabel)
        .accessibilityValue("\(count)")
    }

    /// Compact count format (1.2k / 3.4M) — mirrors the reel viewer's badge.
    static func compactCount(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.1fk", Double(value) / 1_000) }
        return "\(value)"
    }

    private var actionsRow: some View {
        HStack(spacing: 0) {
            likeButton
            Spacer()
            reelButton(outline: "bubble.right", filled: "bubble.right.fill",
                       tint: .white,
                       count: post.commentCount,
                       label: String(localized: "feed.post.comments_count", defaultValue: "\(post.commentCount) commentaires", bundle: .main),
                       hint: String(localized: "a11y.feed.reel.comments.hint", defaultValue: "Ouvre les commentaires du réel", bundle: .main)) { onComment(post.id) }
            Spacer()
            reelButton(outline: "arrow.2.squarepath", filled: "arrow.2.squarepath",
                       tint: isReposted ? MeeshyColors.success : .white,
                       count: displayRepostCount,
                       label: String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main),
                       hint: String(localized: "a11y.feed.post.repost.hint", defaultValue: "Repartage ou cite cette publication", bundle: .main),
                       participated: isReposted) { onRepost(post.id) }
            Spacer()
            reelButton(outline: "bookmark", filled: "bookmark.fill",
                       tint: isBookmarked ? MeeshyColors.warning : .white,
                       count: displayBookmarkCount,
                       label: String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main),
                       hint: String(localized: "a11y.feed.post.save.hint", defaultValue: "Enregistre la publication dans vos favoris", bundle: .main),
                       participated: isBookmarked) { onBookmark(post.id) }
            Spacer()
            reelButton(outline: "square.and.arrow.up", filled: "square.and.arrow.up",
                       tint: .white,
                       count: displayShareCount,
                       label: String(localized: "feed.post.share", defaultValue: "Partager", bundle: .main),
                       hint: String(localized: "a11y.feed.post.share.hint", defaultValue: "Partage cette publication via un lien", bundle: .main)) { onShare(post.id) }
        }
    }

    /// Action glyph that gains an accent-colour BORDER on the glyph itself when
    /// the current user has participated (liked / reposted / bookmarked) — the
    /// outline symbol overlaid in the post accent traces the glyph edge. Never a
    /// circle around it.
    private func actionGlyph(outline: String, filled: String, tint: Color, participated: Bool) -> some View {
        ZStack {
            Image(systemName: participated ? filled : outline)
                .font(MeeshyFont.relative(18))
                .foregroundColor(participated ? tint : .white)
            if participated {
                Image(systemName: outline)
                    .font(MeeshyFont.relative(18))
                    .foregroundColor(Color(hex: accentHex))
            }
        }
        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
    }

    // Bouton like dédié : cœur plein dès qu'il y a des likes (rouge si moi, blanc
    // sinon). Quand j'ai liké, un contour couleur d'accent borde le glyph cœur.
    private var likeButton: some View {
        Button {
            onLike(post.id)
            HapticFeedback.light()
        } label: {
            HStack(spacing: 5) {
                actionGlyph(outline: "heart", filled: "heart.fill", tint: MeeshyColors.error, participated: isLiked)
                if displayLikeCount > 0 {
                    Text("\(displayLikeCount)")
                        .font(.footnote.weight(.medium))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "a11y.feed.post.like", defaultValue: "Aimer", bundle: .main))
        .accessibilityValue(String(format: String(localized: "a11y.feed.post.like.value", defaultValue: "%d j'aime", bundle: .main), displayLikeCount))
        .accessibilityAddTraits(isLiked ? .isSelected : [])
    }

    private func reelButton(outline: String, filled: String, tint: Color, count: Int, label: String, hint: String? = nil, participated: Bool = false, action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 5) {
                actionGlyph(outline: outline, filled: filled, tint: tint, participated: participated)
                if count > 0 {
                    Text("\(count)").font(.footnote.weight(.medium))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityHint(hint ?? "")
        .accessibilityAddTraits(participated ? .isSelected : [])
    }
}
