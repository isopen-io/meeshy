import SwiftUI
import MeeshySDK
import MeeshyUI

/// La rangée d'actions d'une carte du fil (aimer, commenter, repartager,
/// enregistrer, partager) — extraite de `FeedPostCard`, qui reste l'hôte : il
/// calcule les valeurs EFFECTIVES (surcharge socket / delta optimiste ou repli
/// sur le post) et les passe ici, la rangée ne lit plus le post.
///
/// Feuille `.equatable()` comme la carte : l'égalité porte sur les valeurs
/// rendues (jamais sur les fermetures, que la carte ignore déjà), plus
/// `isDark` pour qu'un changement de thème repeigne la rangée.
struct FeedPostActionsBar: View, Equatable {
    let postId: String
    let accentColor: String
    let isDark: Bool
    let isLikedByMe: Bool
    let likeCount: Int
    let isHeartInFlight: Bool
    let commentCount: Int
    let isCommentsSheetPresented: Bool
    let repostCount: Int
    let isReposted: Bool
    let isRepostInFlight: Bool
    let bookmarkCount: Int
    let isBookmarked: Bool
    let isBookmarkInFlight: Bool
    let shareCount: Int
    let isShareInFlight: Bool
    let onLike: ((String) -> Void)?
    let onOpenCommentsTap: () -> Void
    let onRepost: ((String) -> Void)?
    let onQuote: ((String) -> Void)?
    let onBookmark: ((String) -> Void)?
    let onShare: ((String) -> Void)?

    // Lecture directe sans @ObservedObject — même règle que la carte hôte.
    private var theme: ThemeManager { ThemeManager.shared }
    @State private var showRepostOptions = false
    @State private var likeAnimating = false

    nonisolated static func == (lhs: FeedPostActionsBar, rhs: FeedPostActionsBar) -> Bool {
        lhs.postId == rhs.postId
            && lhs.accentColor == rhs.accentColor
            && lhs.isDark == rhs.isDark
            && lhs.isLikedByMe == rhs.isLikedByMe
            && lhs.likeCount == rhs.likeCount
            && lhs.isHeartInFlight == rhs.isHeartInFlight
            && lhs.commentCount == rhs.commentCount
            && lhs.isCommentsSheetPresented == rhs.isCommentsSheetPresented
            && lhs.repostCount == rhs.repostCount
            && lhs.isReposted == rhs.isReposted
            && lhs.isRepostInFlight == rhs.isRepostInFlight
            && lhs.bookmarkCount == rhs.bookmarkCount
            && lhs.isBookmarked == rhs.isBookmarked
            && lhs.isBookmarkInFlight == rhs.isBookmarkInFlight
            && lhs.shareCount == rhs.shareCount
            && lhs.isShareInFlight == rhs.isShareInFlight
    }

    var body: some View {
        HStack(spacing: 0) {
            // Like with heart burst animation (socket-driven — see FeedView.postLikedIds)
            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                    likeAnimating = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    likeAnimating = false
                }
                onLike?(postId)
                HapticFeedback.light()
            } label: {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    ZStack {
                        // Burst ring behind heart
                        if isLikedByMe {
                            Circle()
                                .stroke(MeeshyColors.error.opacity(likeAnimating ? 0.6 : 0), lineWidth: likeAnimating ? 2 : 0)
                                .frame(width: likeAnimating ? 32 : 18, height: likeAnimating ? 32 : 18)
                                .animation(.easeOut(duration: 0.4), value: likeAnimating)
                        }

                        let heartColor: Color = isLikedByMe ? MeeshyColors.error : (likeCount > 0 ? Color(hex: accentColor) : theme.textSecondary)
                        Image(systemName: isLikedByMe || likeCount > 0 ? "heart.fill" : "heart")
                            .font(MeeshyFont.relative(MeeshyIconSize.lg))
                            .foregroundColor(heartColor)
                            .scaleEffect(likeAnimating ? 1.3 : (isLikedByMe ? 1.1 : 1.0))
                            .rotationEffect(.degrees(likeAnimating ? -15 : 0))
                            .opacity(isHeartInFlight ? 0.5 : 1.0)
                        // Accent BORDER on the glyph when the current user liked.
                        if isLikedByMe {
                            Image(systemName: "heart")
                                .font(MeeshyFont.relative(MeeshyIconSize.lg))
                                .foregroundColor(Color(hex: accentColor))
                                .scaleEffect(likeAnimating ? 1.3 : 1.1)
                                .rotationEffect(.degrees(likeAnimating ? -15 : 0))
                        }
                    }

                    Text("\(likeCount)")
                        .font(.footnote.weight(.medium))
                        .foregroundColor(isLikedByMe ? MeeshyColors.error : (likeCount > 0 ? Color(hex: accentColor) : theme.textSecondary))
                        .contentTransition(.numericText())
                }
            }
            // Cible tactile 44x44 (HIG) : les glyphes font 17-18 pt, la zone
            // de hit se limitait au tracé — le marque-page (icone fine, sans
            // compteur) ratait un tap sur deux a l'usage.
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .disabled(isHeartInFlight)
            .animation(.easeOut(duration: 0.2), value: isLikedByMe)
            .accessibilityLabel(String(localized: "a11y.feed.post.like", defaultValue: "Aimer", bundle: .main))
            .accessibilityValue(PostStatAccessibility.likesLabel(likeCount))
            .accessibilityAddTraits(isLikedByMe ? .isSelected : [])

            Spacer()

            // Comment
            Button {
                onOpenCommentsTap()
                HapticFeedback.light()
            } label: {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Image(systemName: "bubble.right")
                        .font(MeeshyFont.relative(17))

                    if commentCount > 0 {
                        Text("\(commentCount)")
                            .font(.footnote.weight(.medium))
                    }
                }
                .foregroundColor(isCommentsSheetPresented ? theme.accentText(accentColor) : theme.textSecondary)
            }
            // Cible tactile 44x44 (HIG) : les glyphes font 17-18 pt, la zone
            // de hit se limitait au tracé — le marque-page (icone fine, sans
            // compteur) ratait un tap sur deux a l'usage.
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityLabel(String(localized: "feed.post.comments_count", defaultValue: "\(commentCount) commentaires", bundle: .main))
            .accessibilityHint(String(localized: "feed.post.comments.hint", defaultValue: "Ouvre les commentaires", bundle: .main))

            Spacer()

            // Repost
            Button {
                showRepostOptions = true
                HapticFeedback.light()
            } label: {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    // Les flèches nues dans les deux états, comme le réel : la famille `.circle` du repost n'existe pas
                    // au catalogue SF Symbols et l'état reposté se peignait vide (#8939). Le reposté se lit à sa teinte
                    // et au contour d'accent qu'EngagementGlyph superpose.
                    EngagementGlyph(
                        outline: "arrow.2.squarepath",
                        filled: "arrow.2.squarepath",
                        participated: isReposted,
                        accentHex: accentColor,
                        activeTint: MeeshyColors.success,
                        inactiveTint: theme.textSecondary
                    )
                    .scaleEffect(isRepostInFlight ? 0.85 : 1.0)
                    let count = repostCount
                    if count > 0 {
                        Text("\(count)")
                            .font(.footnote.weight(.medium))
                            .contentTransition(.numericText())
                    }
                }
                .foregroundColor(isReposted ? MeeshyColors.success : theme.textSecondary)
                .animation(.spring(response: 0.35, dampingFraction: 0.55), value: isReposted)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isRepostInFlight)
            }
            // Cible tactile 44x44 (HIG) : les glyphes font 17-18 pt, la zone
            // de hit se limitait au tracé — le marque-page (icone fine, sans
            // compteur) ratait un tap sur deux a l'usage.
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .disabled(isRepostInFlight)
            .accessibilityLabel(String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main))
            .accessibilityValue(String(format: String(localized: "a11y.feed.post.repost.value", defaultValue: "%d repartages", bundle: .main), repostCount))
            .accessibilityHint(String(localized: "a11y.feed.post.repost.hint", defaultValue: "Repartage ou cite cette publication", bundle: .main))
            .accessibilityAddTraits(isReposted ? .isSelected : [])
            .alert(String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main), isPresented: $showRepostOptions) {
                Button(String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main)) { onRepost?(postId) }
                Button(String(localized: "feed.post.quote", defaultValue: "Citer", bundle: .main)) { onQuote?(postId) }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            }

            Spacer()

            // Bookmark
            Button {
                onBookmark?(postId)
                HapticFeedback.light()
            } label: {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    ZStack {
                        Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                            .font(MeeshyFont.relative(17))
                            .scaleEffect(isBookmarkInFlight ? 0.85 : 1.0)
                        // Accent BORDER on the glyph when the current user bookmarked.
                        if isBookmarked {
                            Image(systemName: "bookmark")
                                .font(MeeshyFont.relative(17))
                                .foregroundColor(Color(hex: accentColor))
                        }
                    }
                    let count = bookmarkCount
                    if count > 0 {
                        Text("\(count)")
                            .font(.footnote.weight(.medium))
                            .contentTransition(.numericText())
                    }
                }
                .foregroundColor(isBookmarked ? MeeshyColors.warning : theme.textSecondary)
                .animation(.spring(response: 0.35, dampingFraction: 0.55), value: isBookmarked)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isBookmarkInFlight)
            }
            // Cible tactile 44x44 (HIG) : les glyphes font 17-18 pt, la zone
            // de hit se limitait au tracé — le marque-page (icone fine, sans
            // compteur) ratait un tap sur deux a l'usage.
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .disabled(isBookmarkInFlight)
            .accessibilityLabel(String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main))
            .accessibilityValue(String(format: String(localized: "a11y.feed.post.save.value", defaultValue: "%d enregistrements", bundle: .main), bookmarkCount))
            .accessibilityHint(String(localized: "a11y.feed.post.save.hint", defaultValue: "Enregistre la publication dans vos favoris", bundle: .main))
            .accessibilityAddTraits(isBookmarked ? .isSelected : [])

            Spacer()

            // Share
            Button {
                onShare?(postId)
                HapticFeedback.light()
            } label: {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    ZStack {
                        Image(systemName: "square.and.arrow.up")
                            .font(MeeshyFont.relative(17))
                            .opacity(isShareInFlight ? 0 : 1)
                        if isShareInFlight {
                            ProgressView()
                                .scaleEffect(0.6)
                                .progressViewStyle(.circular)
                        }
                    }
                    let count = shareCount
                    if count > 0 {
                        Text("\(count)")
                            .font(.footnote.weight(.medium))
                            .contentTransition(.numericText())
                    }
                }
                .foregroundColor(theme.textSecondary)
                .animation(.easeInOut(duration: 0.2), value: isShareInFlight)
            }
            // Cible tactile 44x44 (HIG) : les glyphes font 17-18 pt, la zone
            // de hit se limitait au tracé — le marque-page (icone fine, sans
            // compteur) ratait un tap sur deux a l'usage.
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .disabled(isShareInFlight)
            .accessibilityLabel(String(localized: "feed.post.share", defaultValue: "Partager", bundle: .main))
            .accessibilityValue(String(format: String(localized: "a11y.feed.post.share.value", defaultValue: "%d partages", bundle: .main), shareCount))
            .accessibilityHint(String(localized: "a11y.feed.post.share.hint", defaultValue: "Partage cette publication via un lien", bundle: .main))

            // Pas de bouton muet ici en E2 (correctif revue DoD, constat
            // majeur #2) : la carte n'embarque encore AUCUN lecteur local
            // capable de jouer le fond (l'embed story-repost fige
            // `mute: true` dans `StoryRepostEmbedCell`, hors périmètre E2 ;
            // la scène jouée dans la carte arrive avec E3,
            // `MeeshyScenePlayer(.card)`). Le badge d'ANNONCE ci-dessus
            // (`backgroundSoundAnnouncement`, rangée auteur, E1) reste seul
            // — un bouton sans lecteur à piloter serait décoratif.
        }
        .padding(.top, MeeshySpacing.xs)
    }
}
