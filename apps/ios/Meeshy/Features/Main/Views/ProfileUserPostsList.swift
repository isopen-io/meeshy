import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// MARK: - Profile User Posts List
//
// Rich posts list injected into `UserProfileSheet`'s Postes tab. It mirrors the
// main feed (`FeedView`) so a user's profile renders posts AND reels with the
// exact same cards, cache and engagement:
//   - `FeedPostCard` for posts, `ReelFeedCard` for reels (`post.isReel`).
//   - `CacheCoordinator.shared.feed` keyed `"user:<id>"` (same store as the feed)
//     for cache-first display (Instant App, stale-while-revalidate).
//   - Optimistic like / repost / bookmark / share via `PostService` (with
//     rollback), and comment send via `addComment` — every action is wired and
//     crash-free. (Unlike the feed, comments here are best-effort: no durable
//     offline outbox — a failed send surfaces a toast rather than queuing.)
//   - Real-time reconciliation of the SAME counters the feed reconciles
//     (`post:liked`/`unliked`, `comment:added`/`deleted`, `post:reposted`,
//     `post:bookmarked`, `post:updated`/`deleted`): the server's ABSOLUTE count
//     becomes the base and the matching optimistic override is dropped, so the
//     displayed number never drifts by the ±1 the override would re-apply.
//   - Impression batching (source `"profile"`) for every card that appears, and a
//     `viewPost` call when a post is opened or its text expanded ("voir plus").
//   - Reels open the immersive viewer (host wires `onOpenReel`); posts open detail
//     (`onOpenPost`).
//
// This is app-side product orchestration (cache → network cascade, FeedPost
// mapping, optimistic flags, viewer hand-off), not an SDK atom — per SDK purity.
//
// LATENCY: the list is injected INSIDE `UserProfileSheet`'s outer ScrollView, so
// its `LazyVStack` is nested in another lazy container and loses laziness — it
// would build EVERY cached card (up to 100) synchronously on first paint and
// freeze the UI. We therefore render a growing WINDOW (`visiblePosts`) that
// starts small and extends via the infinite-scroll sentinel, bounding the
// synchronous work to a handful of cards per frame.
// MARK: - Stats band (pure counts + view)

/// Compteurs du bandeau de stats en tête de l'onglet Postes d'un profil.
/// Phase 1 (hybride) : dérivés des postes DÉJÀ chargés — donc des bornes basses
/// tant que `hasMore` (affichées « N+ »). `posts` = type POST hors réels/stories.
/// La phase 2 (backend) réalimentera le même bandeau avec des totaux exacts.
struct ProfilePostsCounts: Equatable {
    let posts: Int
    let reels: Int
    let stories: Int
    let isApproximate: Bool

    /// `reduce` plutôt que `filter().count` : recalculé à chaque mutation de la
    /// liste (dont chaque like reçu en temps réel), le triple `filter` allouait
    /// trois tableaux intermédiaires pour n'en lire que la taille.
    static func compute(from posts: [FeedPost], hasMore: Bool) -> ProfilePostsCounts {
        ProfilePostsCounts(
            posts: posts.reduce(0) { $0 + (!$1.isReel && !$1.isStory ? 1 : 0) },
            reels: posts.reduce(0) { $0 + ($1.isReel ? 1 : 0) },
            stories: posts.reduce(0) { $0 + ($1.isStory ? 1 : 0) },
            isApproximate: hasMore
        )
    }

    /// Phase 2 (backend) : totaux exacts issus de `GET /users/:id/stats`.
    /// `nil` sur un champ (vieux gateway) → repli sur la valeur dérivée.
    /// Le compteur de stories DÉRIVÉ vaut structurellement 0 (le listing
    /// exclut le type STORY) — seule la valeur backend est signifiante.
    static func merging(derived: ProfilePostsCounts, stats: UserStats?) -> ProfilePostsCounts {
        guard let stats, stats.postsCount != nil || stats.reelsCount != nil || stats.storiesCount != nil else {
            return derived
        }
        return ProfilePostsCounts(
            posts: stats.postsCount ?? derived.posts,
            reels: stats.reelsCount ?? derived.reels,
            stories: stats.storiesCount ?? derived.stories,
            isApproximate: false
        )
    }

    /// « N+ » quand le compteur est une borne basse strictement positive, « N » sinon.
    static func displayValue(_ value: Int, isApproximate: Bool) -> String {
        (isApproximate && value > 0) ? "\(value)+" : "\(value)"
    }
}

/// Filtre du listing piloté par les tuiles du bandeau : tap « Postes » →
/// postes uniquement, tap « Réels » → réels uniquement, re-tap → tout.
enum ProfilePostsFilter: Equatable {
    case all, posts, reels

    /// Toggle : sélectionner la tuile déjà active revient à « tout ».
    func toggled(with tapped: ProfilePostsFilter) -> ProfilePostsFilter {
        self == tapped ? .all : tapped
    }
}

/// Bande horizontale de 3 mini-stats (Postes / Réels / Stories) affichée en tête
/// du listing. Style aligné sur `miniStatChip` (icône + valeur arrondie + label).
/// Valeurs opaques : agnostique de leur provenance (phase 1 dérivée / phase 2 backend).
/// Tuiles TAPPABLES : Postes/Réels filtrent le listing, Stories ouvre la page
/// des stories en cours et passées (profil propre).
private struct ProfilePostsStatsBand: View {
    let counts: ProfilePostsCounts
    var selectedFilter: ProfilePostsFilter = .all
    var onSelectFilter: ((ProfilePostsFilter) -> Void)? = nil
    var onStoriesTap: (() -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    /// Profil non lié à une conversation → accent de marque (indigo500).
    private let accentHex = "6366F1"

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            chip(icon: "square.grid.2x2.fill", value: counts.posts,
                 label: String(localized: "profile.posts.stat.posts", defaultValue: "Postes", bundle: .main),
                 isSelected: selectedFilter == .posts,
                 action: { onSelectFilter?(.posts) })
            chip(icon: "play.rectangle.fill", value: counts.reels,
                 label: String(localized: "profile.posts.stat.reels", defaultValue: "Réels", bundle: .main),
                 isSelected: selectedFilter == .reels,
                 action: { onSelectFilter?(.reels) })
            chip(icon: "circle.dashed", value: counts.stories,
                 label: String(localized: "profile.posts.stat.stories", defaultValue: "Stories", bundle: .main),
                 isSelected: false,
                 action: { onStoriesTap?() })
        }
    }

    private func chip(icon: String, value: Int, label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        let display = ProfilePostsCounts.displayValue(value, isApproximate: counts.isApproximate)
        return Button {
            action()
            HapticFeedback.light()
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo500)
                Text(display)
                    .font(MeeshyFont.relative(MeeshyFont.subtitleSize, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(label)
                    .font(.caption2)
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md)
            .background(theme.surfaceGradient(tint: accentHex))
            .glassCard(cornerRadius: MeeshyRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .stroke(MeeshyColors.indigo500.opacity(isSelected ? 0.9 : 0), lineWidth: MeeshyBorder.emphasis)
            )
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("\(display) \(label)"))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

struct ProfileUserPostsList: View {
    let userId: String
    /// Opens a standard post (host pushes the full PostDetail).
    var onOpenPost: ((FeedPost) -> Void)? = nil
    /// Opens a reel in the immersive viewer. Param = tapped reel + the user's
    /// reels (seed). When `nil`, reels fall back to `onOpenPost` (detail).
    var onOpenReel: ((_ reel: FeedPost, _ reels: [FeedPost]) -> Void)? = nil

    @StateObject private var viewModel: ProfileUserPostsViewModel
    @State private var shareableLink: ShareableLink?
    /// Poste (ou réel) en édition via le menu « … » — parité avec `FeedView`.
    @State private var editingPost: FeedPost?
    /// Poste/réel dont les commentaires sont présentés en feuille — hoisté au
    /// niveau LISTE (parité `FeedView.reelCommentsPost`). La sheet interne de
    /// `FeedPostCard` entrait en concurrence avec les feuilles empilées du
    /// profil : le bouton commentaire ne répondait plus, et celui d'un réel
    /// fermait carrément la feuille de profil (openReel).
    @State private var commentingPost: FeedPost?
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    private var isDark: Bool { theme.mode.isDark }

    init(
        userId: String,
        onOpenPost: ((FeedPost) -> Void)? = nil,
        onOpenReel: ((_ reel: FeedPost, _ reels: [FeedPost]) -> Void)? = nil
    ) {
        self.userId = userId
        self.onOpenPost = onOpenPost
        self.onOpenReel = onOpenReel
        _viewModel = StateObject(wrappedValue: ProfileUserPostsViewModel(userId: userId))
    }

    // NOTE: This view is injected as content INSIDE `UserProfileSheet`'s outer
    // ScrollView. It MUST NOT wrap its content in its own ScrollView — a vertical
    // ScrollView nested in a vertical ScrollView breaks both the scroll gesture
    // and the parent's scrollOffset (the collapsible header would never collapse
    // on the Posts tab). The content flows directly in the parent's single
    // scroll container. Pull-to-refresh is intentionally dropped here (the outer
    // ScrollView owns scrolling); SWR + the visit revalidate covers freshness.
    var body: some View {
        LazyVStack(spacing: MeeshySpacing.md) {
            if viewModel.posts.isEmpty {
                if viewModel.isLoading {
                    // Cache VIDE ⇒ squelette (bible § I4), jamais un spinner.
                    SkeletonFeedList(count: 3).padding(.top, MeeshySpacing.sm)
                } else {
                    emptyState
                }
            } else {
                ProfilePostsStatsBand(
                    counts: viewModel.postsCounts,
                    selectedFilter: viewModel.filter,
                    onSelectFilter: { tapped in
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            viewModel.filter = viewModel.filter.toggled(with: tapped)
                        }
                    },
                    onStoriesTap: {
                        openStories()
                    }
                )
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.bottom, MeeshySpacing.xs)

                if viewModel.visiblePosts.isEmpty {
                    filteredEmptyState
                }

                ForEach(viewModel.visiblePosts) { post in
                    card(for: post)
                        .countsListedImpression(of: post.id, isVideo: post.isReel, in: viewModel.listedImpressions) {
                            viewModel.visiblePosts.firstIndex { $0.id == post.id }
                        }
                        .onAppear {
                            // Prefetch anticipé : charge la suite dès qu'une
                            // carte à ≤3 de la fin apparaît — auto-ré-armé,
                            // contrairement à la sentinelle one-shot qui
                            // mourait quand la fenêtre ne bougeait plus.
                            viewModel.loadMoreIfNeeded(currentPost: post)
                        }
                }

                if viewModel.hasMoreToRender || viewModel.hasMore {
                    // Sentinelle de secours (le déclencheur principal est le
                    // onAppear par carte ci-dessus) — couvre le cas où moins de
                    // 3 cartes sont rendues.
                    Color.clear
                        .frame(height: 1)
                        .onAppear { viewModel.scheduleReveal() }
                    if viewModel.isLoadingMore {
                        ProgressView().padding()
                    }
                } else if case .exhausted = viewModel.paginationState, !viewModel.posts.isEmpty {
                    endOfContentFooter
                }
            }
        }
        .padding(.top, MeeshySpacing.sm)
        .padding(.bottom, MeeshySpacing.xxl)
        .task { await viewModel.loadInitial() }
        .onAppear {
            if let visit = DiscoveryTelemetry.profileVisit(userId, viewerId: AuthManager.shared.currentUser?.id) { SocialEventsV2Reporter.shared.emit(visit) }
        }
        .tracksOutboundLinks(surface: SocialSurface(.profile))
        // Flush au niveau LISTE. Posé sur le `ForEach`, ce modificateur était
        // appliqué à CHAQUE carte générée : toute carte quittant l'écran
        // annulait le minuteur de groupement et postait un lot d'un seul id —
        // une requête réseau par carte défilée, soit exactement l'inverse du
        // batching que `ImpressionBatcher` existe pour faire.
        .onDisappear { Task { await viewModel.flushImpressions() } }
        .sheet(item: $shareableLink) { link in
            ShareSheet(activityItems: link.activityItems)
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $commentingPost) { post in
            // Même feuille de commentaires que le feed — le bouton commentaire
            // d'un poste OU d'un réel du profil commente sans quitter le profil.
            CommentsSheetView(post: post, accentColor: post.authorColor)
        }
        .postEditCover(item: $editingPost) { post in
            EditPostSheet(
                originalContent: post.content,
                originalLanguage: post.originalLanguage,
                originalType: post.type,
                media: post.media.map { EditablePostMedia($0) }, originalStoryEffects: post.storyEffects,
                originalLocation: post.location,
                originalVisibility: post.visibility,
                originalVisibilityUserIds: post.visibilityUserIds ?? [],
                isRepost: post.repost != nil,
                onSave: { draft in
                    await viewModel.updatePost(post.id, content: draft.content, language: draft.language, type: draft.type, removeMediaIds: draft.removeMediaIds.isEmpty ? nil : draft.removeMediaIds, location: draft.location, visibility: draft.visibility, visibilityUserIds: draft.visibilityUserIds, known: draft.known, storyEffects: draft.storyEffects)
                },
                onDismiss: { editingPost = nil }
            )
        }
    }

    // MARK: - Card routing (reel vs post)

    @ViewBuilder
    private func card(for post: FeedPost) -> some View {
        if post.isReel {
            reelCard(post)
        } else {
            postCard(post)
        }
    }

    private func reelCard(_ post: FeedPost) -> some View {
        let isOwnPost = post.authorId == AuthManager.shared.currentUser?.id
        return ReelFeedCard(
            post: post,
            // No autoplay coordinator in the profile list — the card shows its
            // poster (PAUSED); tapping the media opens the immersive viewer where
            // playback actually happens.
            isActive: false,
            isDark: isDark,
            isLiked: viewModel.isLiked(post),
            displayLikeCount: viewModel.likeCount(post),
            isBookmarked: viewModel.isBookmarked(post),
            displayBookmarkCount: viewModel.bookmarkCount(post),
            isReposted: viewModel.isReposted(post),
            displayRepostCount: viewModel.repostCount(post),
            displayShareCount: viewModel.shareCount(post),
            onTapMedia: { openReel(post) },
            onTapGlyph: { openPost(post) },
            onLike: { id in Task { await viewModel.toggleLike(id) } },
            onComment: { _ in
                // Feuille de commentaires DIRECTE (parité FeedView) — avant, le
                // bouton commentaire ouvrait le viewer immersif en FERMANT la
                // feuille de profil : perçu comme « la barre d'action ne marche pas ».
                HapticFeedback.medium()
                commentingPost = post
            },
            onRepost: { id in Task { await viewModel.toggleRepost(id) } },
            onBookmark: { id in Task { await viewModel.toggleBookmark(id) } },
            onShare: { id in Task { await share(id) } },
            // We are already inside this user's profile sheet — tapping the
            // (reposted) author is a no-op here to avoid stacking sheets.
            onTapAuthor: { _ in },
            onEdit: isOwnPost ? { post in editingPost = post } : nil,
            onDelete: isOwnPost ? { id in Task { await viewModel.deletePost(id) } } : nil,
            onRemove: ContentRemovalOffer.publication(for: post) { [viewModel] in await viewModel.withdrawPost($0, $1) },
            onReport: !isOwnPost ? { id in Task { await viewModel.report(id) } } : nil,
            onPin: isOwnPost ? { id in Task { await viewModel.pinPost(id) } } : nil
        )
        .equatable()
        .padding(.horizontal, MeeshySpacing.md)
    }

    private func postCard(_ post: FeedPost) -> some View {
        let isOwnPost = post.authorId == AuthManager.shared.currentUser?.id
        return FeedPostCard(
            post: post,
            isLiked: viewModel.isLiked(post),
            displayLikeCount: viewModel.likeCount(post),
            isBookmarked: viewModel.isBookmarked(post),
            displayRepostCount: viewModel.repostCount(post),
            displayBookmarkCount: viewModel.bookmarkCount(post),
            displayShareCount: viewModel.shareCount(post),
            isReposted: viewModel.isReposted(post),
            onOpenComments: { commentingPost = post },
            onLike: { id in Task { await viewModel.toggleLike(id) } },
            onRepost: { id in Task { await viewModel.toggleRepost(id) } },
            onQuote: { _ in openPost(post) },
            onShare: { id in Task { await share(id) } },
            onBookmark: { id in Task { await viewModel.toggleBookmark(id) } },
            onSelectLanguage: { postId, language in
                // Tap on a flag whose translation isn't loaded yet → request it.
                // The result arrives via the social socket and patches the card.
                Task { await viewModel.requestTranslation(postId: postId, language: language) }
            },
            onTapPost: { tapped in openPost(tapped) },
            onTapRepost: { _ in openPost(post) },
            onDelete: isOwnPost ? { id in Task { await viewModel.deletePost(id) } } : nil,
            onRemove: ContentRemovalOffer.publication(for: post) { [viewModel] in await viewModel.withdrawPost($0, $1) },
            onReport: !isOwnPost ? { id in
                Task { await viewModel.report(id) }
            } : nil,
            onPin: isOwnPost ? { id in Task { await viewModel.pinPost(id) } } : nil,
            onEdit: isOwnPost ? { post in editingPost = post } : nil
        )
        .equatable()
    }

    // MARK: - Open

    /// L'ouverture se compte à DESTINATION (#10483) : le détail
    /// (`PostDetailViewModel.registerDetailOpen`) et le lecteur de réels
    /// (`ReelsViewModel.recordView`) envoient chacun la vue de leur ouverture.
    /// La liste du profil n'en envoie aucune — elle doublait la vue de la
    /// destination, et sa fenêtre d'une heure taisait les réouvertures.
    private var opening: ProfilePostOpening {
        ProfilePostOpening(onOpenPost: onOpenPost, onOpenReel: onOpenReel)
    }

    private func openPost(_ post: FeedPost) {
        opening.openPost(post)
    }

    private func openReel(_ post: FeedPost) {
        opening.openReel(post, in: viewModel.reels)
    }

    /// Tap sur la tuile « Stories » : sur SON PROPRE profil, ouvre la page des
    /// stories en cours et passées (`MyStoriesView`, hébergée par la RACINE —
    /// RootView / iPadRootView écoutent `openMyStories`, donc la tuile marche
    /// quel que soit l'écran qui a présenté la feuille de profil). La feuille
    /// de profil est fermée d'abord — le même motif différé que
    /// `ProfilePostsOpener` (une sheet présentée par-dessus une sheet en cours
    /// de dismiss est avalée). Sur le profil d'un AUTRE utilisateur, la tuile
    /// reste informative (ses stories passées ne nous sont pas accessibles).
    private func openStories() {
        guard userId == AuthManager.shared.currentUser?.id else { return }
        dismissHost()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            NotificationCenter.default.post(name: .openMyStories, object: nil)
        }
    }

    private func dismissHost() {
        dismiss()
    }

    // MARK: - Share

    private func share(_ postId: String) async {
        // `try?` → nil when the request never reached the gateway (offline,
        // rate-limit). Only bump the optimistic share count when it succeeded —
        // the gateway increments shareCount on any request that lands, but a
        // transport failure records nothing, so bumping then would be wrong.
        let result = try? await PostService.shared.share(postId: postId, platform: "system", generateLink: true)
        if result != nil { viewModel.bumpShare(postId) }
        // Always surface a shareable URL (tracked when minted, canonical web URL
        // otherwise) so the user is never stuck with nothing to share.
        let resolved = result?.shortUrl ?? "\(ShareableLink.webBaseURL)/feeds/post/\(postId)"
        guard let url = URL(string: resolved) else { return }
        shareableLink = ShareableLink(url: url, fileSource: viewModel.posts.first(where: { $0.id == postId }).map(ShareFileSource.post))
    }

    // MARK: - End of content

    /// Zone de fin de liste : la pagination est ÉPUISÉE — on a atteint le tout
    /// premier contenu publié par ce profil. Ancre visuelle explicite (l'ancien
    /// comportement — la sentinelle disparaît sans signal — se lisait comme un
    /// blocage de chargement).
    private var endOfContentFooter: some View {
        VStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: "checkmark.seal")
                .font(MeeshyFont.relative(MeeshyIconSize.xl))
                .foregroundColor(theme.textSecondary)
            Text(String(localized: "profile.posts.endOfContent", defaultValue: "Vous avez tout vu", bundle: .main))
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textSecondary)
            if let firstPublished = viewModel.posts.last?.timestamp {
                Text(String(format: String(localized: "profile.posts.firstPublishedAt", defaultValue: "Premier contenu publié le %@", bundle: .main), firstPublished.formatted(date: .abbreviated, time: .omitted)))
                    .font(.caption)
                    .foregroundColor(theme.textMuted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xl)
        .accessibilityElement(children: .combine)
    }

    // Empty state deferred to the shared design-system `EmptyStateView`
    // (canonical icon+title+subtitle, combined VoiceOver label + spring appear)
    // rather than a hand-rolled VStack — same pattern the peer lists
    // `BookmarksView`/`ShareLinksView` already reuse. `compact` keeps it sized
    // for this in-scroll (nested LazyVStack) section, and the shared component
    // adds the guidance subtitle + a single combined VoiceOver label.
    private var emptyState: some View {
        EmptyStateView(
            icon: "square.text.square",
            title: String(localized: "profile.posts.empty", defaultValue: "Aucune publication", bundle: .main),
            subtitle: String(localized: "profile.posts.empty.subtitle", defaultValue: "Les publications apparaîtront ici", bundle: .main),
            compact: true
        )
        .padding(.top, 40)
        .padding(.bottom, MeeshySpacing.xxl)
    }

    /// Le profil a des publications, mais AUCUNE ne passe le filtre actif. Sans
    /// ce repli, la tuile « Réels » d'un profil sans réel ne laissait qu'un
    /// bandeau surmontant du vide — indiscernable d'un chargement bloqué.
    /// Muet tant que `hasMore` : la sentinelle de bas de liste porte déjà
    /// l'indicateur de chargement, en doubler un ici afficherait deux roues.
    @ViewBuilder
    private var filteredEmptyState: some View {
        if !viewModel.hasMore {
            EmptyStateView(
                icon: viewModel.filter == .reels ? "play.rectangle" : "square.text.square",
                title: viewModel.filter == .reels
                    ? String(localized: "profile.posts.empty.reels", defaultValue: "Aucun réel", bundle: .main)
                    : String(localized: "profile.posts.empty.posts", defaultValue: "Aucun poste", bundle: .main),
                subtitle: String(localized: "profile.posts.empty.filter.subtitle", defaultValue: "Touchez à nouveau la tuile pour tout revoir", bundle: .main),
                compact: true
            )
            .padding(.vertical, MeeshySpacing.xxl)
        }
    }
}
