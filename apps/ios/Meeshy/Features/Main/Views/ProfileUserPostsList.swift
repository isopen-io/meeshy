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
        HStack(spacing: 8) {
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
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo500)
                Text(display)
                    .font(MeeshyFont.relative(18, weight: .bold, design: .rounded))
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
            .padding(.vertical, 12)
            .background(theme.surfaceGradient(tint: accentHex))
            .glassCard(cornerRadius: 14)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(MeeshyColors.indigo500.opacity(isSelected ? 0.9 : 0), lineWidth: 1.5)
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
        LazyVStack(spacing: 12) {
            if viewModel.posts.isEmpty {
                if viewModel.isLoading {
                    ProgressView()
                        .padding(.top, 40)
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
                .padding(.horizontal, 12)
                .padding(.bottom, 4)

                if viewModel.visiblePosts.isEmpty {
                    filteredEmptyState
                }

                ForEach(viewModel.visiblePosts) { post in
                    card(for: post)
                        .onAppear {
                            viewModel.trackImpression(post.id)
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
        .padding(.top, 8)
        .padding(.bottom, 24)
        .task { await viewModel.loadInitial() }
        // Flush au niveau LISTE. Posé sur le `ForEach`, ce modificateur était
        // appliqué à CHAQUE carte générée : toute carte quittant l'écran
        // annulait le minuteur de groupement et postait un lot d'un seul id —
        // une requête réseau par carte défilée, soit exactement l'inverse du
        // batching que `ImpressionBatcher` existe pour faire.
        .onDisappear { Task { await viewModel.flushImpressions() } }
        .sheet(item: $shareableLink) { link in
            ShareSheet(activityItems: [link.url])
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $commentingPost) { post in
            // Même feuille de commentaires que le feed — le bouton commentaire
            // d'un poste OU d'un réel du profil commente sans quitter le profil.
            CommentsSheetView(post: post, accentColor: post.authorColor)
        }
        .sheet(item: $editingPost) { post in
            EditPostSheet(
                originalContent: post.content,
                originalLanguage: post.originalLanguage,
                originalType: post.type,
                media: post.media.map { EditablePostMedia($0) },
                originalLocation: post.location,
                originalVisibility: post.visibility,
                originalVisibilityUserIds: post.visibilityUserIds ?? [],
                isRepost: post.repost != nil,
                onSave: { draft in
                    await viewModel.updatePost(post.id, content: draft.content, language: draft.language, type: draft.type, removeMediaIds: draft.removeMediaIds.isEmpty ? nil : draft.removeMediaIds, location: draft.location, visibility: draft.visibility, visibilityUserIds: draft.visibilityUserIds, known: draft.known)
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
            onReport: !isOwnPost ? { id in Task { await viewModel.report(id) } } : nil,
            onPin: isOwnPost ? { id in Task { await viewModel.pinPost(id) } } : nil
        )
        .equatable()
        .padding(.horizontal, 12)
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
            onSeeMore: {
                // "Voir plus" expands the text inline AND counts a post view —
                // throttled to once per hour per user+post (shared with open).
                recordView(post.id)
            },
            onDelete: isOwnPost ? { id in Task { await viewModel.deletePost(id) } } : nil,
            onReport: !isOwnPost ? { id in
                Task { await viewModel.report(id) }
            } : nil,
            onPin: isOwnPost ? { id in Task { await viewModel.pinPost(id) } } : nil,
            onEdit: isOwnPost ? { post in editingPost = post } : nil
        )
        .equatable()
    }

    // MARK: - Open / view tracking

    private func openPost(_ post: FeedPost) {
        recordView(post.id)
        onOpenPost?(post)
    }

    private func openReel(_ post: FeedPost) {
        recordView(post.id)
        if let onOpenReel {
            onOpenReel(post, viewModel.reels)
        } else {
            onOpenPost?(post)
        }
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

    /// Counts ONE post view (open or "voir plus") through the persistent 1-hour
    /// per-(user, post) throttle: the local guard is checked and written BEFORE
    /// anything reaches the backend, so reopening or tapping "voir plus" again
    /// within the hour sends nothing — even across app launches.
    private func recordView(_ postId: String) {
        guard PostViewThrottle.shared.shouldRecordView(postId: postId) else { return }
        Task { try? await PostService.shared.viewPost(postId: postId, duration: nil) }
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
        shareableLink = ShareableLink(url: url)
    }

    // MARK: - End of content

    /// Zone de fin de liste : la pagination est ÉPUISÉE — on a atteint le tout
    /// premier contenu publié par ce profil. Ancre visuelle explicite (l'ancien
    /// comportement — la sentinelle disparaît sans signal — se lisait comme un
    /// blocage de chargement).
    private var endOfContentFooter: some View {
        VStack(spacing: 6) {
            Image(systemName: "checkmark.seal")
                .font(MeeshyFont.relative(20))
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
        .padding(.vertical, 20)
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
        .padding(.bottom, 24)
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
            .padding(.vertical, 24)
        }
    }
}

// MARK: - Profile posts opener (shared host-side navigation)
//
// Centralizes how a host (any sheet presenting `ProfileUserPostsList`) opens a
// tapped post or reel: dismiss the profile sheet first, then navigate at the
// root. Reels present the immersive overlay — which lives behind the sheet, so
// it must come up AFTER the dismiss settles (hence the small delay). Posts push
// the detail route via RootView's existing `pushNavigateToRoute` listener, so
// hosts without a `Router` in scope (audio fullscreen, comments sheet) work too.
@MainActor
enum ProfilePostsOpener {
    static func openReel(_ reel: FeedPost, in reels: [FeedPost], dismiss: @escaping () -> Void) {
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            HapticFeedback.medium()
            ReelsPresenter.shared.present(posts: reels, startId: reel.id)
        }
    }

    static func openPost(_ post: FeedPost, dismiss: @escaping () -> Void) {
        dismiss()
        NotificationCenter.default.post(
            name: Notification.Name("pushNavigateToRoute"),
            object: "postDetail:\(post.id)"
        )
    }
}

// MARK: - Post View Throttle (persistent, per user+post, 1 hour)
//
// Product rule (app-side, not an SDK atom): a post "view" — opening the post OR
// tapping "voir plus" — is counted at most ONCE per hour per signed-in user per
// post, even across reopens and app launches. The local guard is persisted to
// UserDefaults and checked/written BEFORE anything is sent to the backend, so
// the network increment only happens when the throttle actually allows it.
@MainActor
final class PostViewThrottle {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = PostViewThrottle()

    private let defaults: UserDefaults
    private let storageKey = "meeshy.postViewThrottle.v1"
    private let ttl: TimeInterval = 3600
    /// key = "<userId>:<postId>" → last recorded view (epoch seconds).
    private var timestamps: [String: Date]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let raw = defaults.dictionary(forKey: storageKey) as? [String: TimeInterval] {
            timestamps = raw.mapValues { Date(timeIntervalSince1970: $0) }
        } else {
            timestamps = [:]
        }
    }

    private func key(for postId: String) -> String {
        let uid = AuthManager.shared.currentUser?.id ?? "anon"
        return "\(uid):\(postId)"
    }

    /// Returns `true` (and records "now", persisted) when no view has been
    /// counted for this user+post within the last hour; returns `false` (skip
    /// the increment + network call) otherwise.
    func shouldRecordView(postId: String) -> Bool {
        let k = key(for: postId)
        let now = Date()
        if let last = timestamps[k], now.timeIntervalSince(last) < ttl {
            return false
        }
        timestamps[k] = now
        persist()
        return true
    }

    private func persist() {
        // Prune expired entries opportunistically so the store stays bounded.
        let cutoff = Date().addingTimeInterval(-ttl)
        timestamps = timestamps.filter { $0.value >= cutoff }
        defaults.set(timestamps.mapValues { $0.timeIntervalSince1970 }, forKey: storageKey)
    }
}

@MainActor
final class ProfileUserPostsViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published private(set) var posts: [FeedPost] = [] { didSet { refreshDerivedState() } }
    /// Chargement INITIAL uniquement (plein écran). La page suivante vit dans
    /// `isLoadingMore` — un seul flag pour les deux forçait la vue à afficher
    /// des sémantiques opposées (plein écran vs pied de liste).
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true { didSet { refreshDerivedState() } }
    /// État de pagination consommé par le pied de liste : `.exhausted` rend la
    /// zone « plus de contenu » (on a atteint le tout premier contenu publié).
    @Published private(set) var paginationState: PaginationState = .idle

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "profile")
    /// Number of posts actually rendered. Grows via the infinite-scroll sentinel
    /// so the nested LazyVStack never builds the whole cached list at once.
    @Published private(set) var renderWindow = ProfileUserPostsViewModel.initialRenderWindow {
        didSet { refreshDerivedState() }
    }

    /// Filtre piloté par les tuiles du bandeau (Postes/Réels ; re-tap = tout).
    /// Changer de filtre REMET la fenêtre de rendu à sa taille initiale : sans
    /// ça, passer de « tout » (fenêtre étendue à 40 cartes) à « Réels » faisait
    /// construire d'un coup tous les réels connus dans le LazyVStack imbriqué —
    /// exactement le pic de travail synchrone que la fenêtre existe pour éviter.
    @Published var filter: ProfilePostsFilter = .all {
        didSet {
            guard oldValue != filter else { return }
            renderWindow = Self.initialRenderWindow
            refreshDerivedState()
        }
    }
    /// Stats backend du profil (compteurs de contenu exacts) — `nil` tant que
    /// `GET /users/:id/stats` n'a pas répondu.
    @Published private(set) var userStats: UserStats? { didSet { refreshDerivedState() } }

    /// Optimistic engagement overrides keyed by postId (nil = use server flag).
    @Published var likedOverrides: [String: Bool] = [:]
    @Published var bookmarkedOverrides: [String: Bool] = [:]
    @Published var repostedOverrides: [String: Bool] = [:]
    /// Optimistic share-count delta keyed by postId (share is append-only).
    @Published var shareDelta: [String: Int] = [:]

    static let initialRenderWindow = 5
    static let renderStep = 5

    private let userId: String
    private let cacheKey: String
    private var nextCursor: String?
    private let postService: PostServiceProviding
    private let userService: UserServiceProviding
    private let languageProvider: LanguageProviding
    private let socialSocket: SocialSocketProviding
    private let currentUserIdProvider: @MainActor () -> String?

    /// Une révélation/pagination est déjà programmée : sans cette garde, les
    /// trois dernières cartes de la fenêtre déclenchaient chacune leur `Task`
    /// au même frame et la fenêtre bondissait de 3 × `renderStep` d'un coup.
    private var isRevealScheduled = false
    /// Reposts déjà comptabilisés — `post:reposted` ne porte qu'un delta (pas
    /// de total absolu comme `post:liked`), une re-livraison ferait dériver le
    /// compteur.
    private var appliedRepostIds = Set<String>()

    /// Groupement, persistance et flush (sortie d'écran / arrière-plan /
    /// relance) portés par `ImpressionBatcher`.
    private lazy var impressions = ImpressionBatcher(source: "profile")

    private var cancellables = Set<AnyCancellable>()

    init(
        userId: String,
        postService: PostServiceProviding = PostService.shared,
        userService: UserServiceProviding = UserService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        currentUserIdProvider: @MainActor @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.userId = userId
        self.cacheKey = "user:\(userId)"
        self.postService = postService
        self.userService = userService
        self.languageProvider = languageProvider
        self.socialSocket = socialSocket
        self.currentUserIdProvider = currentUserIdProvider
        subscribeToSocketUpdates()
    }

    private var preferredLanguages: [String] { languageProvider.preferredLanguages }

    // MARK: - Derived render state
    //
    // MÉMOÏSÉ, pas calculé à la volée : `filteredPosts` copie jusqu'à 100
    // `FeedPost` (chacun portant médias, commentaires, traductions) et
    // `visiblePosts` était relu à CHAQUE évaluation de body ET à chaque
    // `onAppear` de carte (via `loadMoreIfNeeded`) — soit une poignée de
    // balayages complets de la liste par cran de défilement. Les trois vues
    // dérivées sont désormais recalculées UNE fois, quand leurs entrées
    // (`posts`, `filter`, `renderWindow`, `hasMore`, `userStats`) changent.

    /// Liste après application du filtre des tuiles. La fenêtre de rendu
    /// s'applique APRÈS le filtre — appliquée avant, un profil à 90 % de réels
    /// afficherait une liste vide en mode « Postes ».
    @Published private(set) var filteredPosts: [FeedPost] = []
    @Published private(set) var visiblePosts: [FeedPost] = []
    @Published private(set) var reels: [FeedPost] = []
    /// Compteurs du bandeau : totaux backend exacts quand `GET /users/:id/stats`
    /// les fournit (phase 2), sinon dérivés des postes chargés (phase 1).
    @Published private(set) var postsCounts = ProfilePostsCounts(posts: 0, reels: 0, stories: 0, isApproximate: true)

    var hasMoreToRender: Bool { renderWindow < filteredPosts.count }

    private func refreshDerivedState() {
        let filtered: [FeedPost]
        switch filter {
        case .all: filtered = posts
        case .posts: filtered = posts.filter { !$0.isReel && !$0.isStory }
        case .reels: filtered = posts.filter(\.isReel)
        }
        filteredPosts = filtered
        visiblePosts = filtered.count > renderWindow ? Array(filtered.prefix(renderWindow)) : filtered
        reels = filter == .reels ? filtered : posts.filter(\.isReel)
        postsCounts = .merging(derived: .compute(from: posts, hasMore: hasMore), stats: userStats)
    }

    // MARK: - Derived engagement state

    func isLiked(_ post: FeedPost) -> Bool { likedOverrides[post.id] ?? post.isLiked }
    func isReposted(_ post: FeedPost) -> Bool { repostedOverrides[post.id] ?? post.isRepostedByMe }
    func isBookmarked(_ post: FeedPost) -> Bool { bookmarkedOverrides[post.id] ?? post.isBookmarkedByMe }

    func likeCount(_ post: FeedPost) -> Int { adjusted(post.likes, post.isLiked, likedOverrides[post.id]) }
    func repostCount(_ post: FeedPost) -> Int { adjusted(post.repostCount, post.isRepostedByMe, repostedOverrides[post.id]) }
    func bookmarkCount(_ post: FeedPost) -> Int { adjusted(post.bookmarkCount, post.isBookmarkedByMe, bookmarkedOverrides[post.id]) }
    func shareCount(_ post: FeedPost) -> Int { max(0, post.shareCount + (shareDelta[post.id] ?? 0)) }

    /// Server base count adjusted by the optimistic override: +1 when the user
    /// just participated, -1 when they just un-participated, unchanged otherwise.
    private func adjusted(_ base: Int, _ serverFlag: Bool, _ override: Bool?) -> Int {
        guard let override, override != serverFlag else { return base }
        return max(0, base + (override ? 1 : -1))
    }

    // MARK: - Loading (cache-first, SWR)

    func loadInitial() async {
        guard posts.isEmpty, !isLoading else { return }

        // Compteurs exacts du bandeau (fire-and-forget, silencieux — le
        // bandeau retombe sur les valeurs dérivées si la requête échoue).
        Task { [weak self] in await self?.loadStatsCounts() }

        // Restaure le curseur persisté AVANT de servir la page cachée (ordre
        // imposé — cf. ConversationListViewModel) : sans lui, un cache `.fresh`
        // laissait `nextCursor` à nil pour toute la vie de la vue et la
        // pagination se coinçait définitivement à la frontière du cache.
        var cursorRestored = false
        if let cursor = await CacheCoordinator.shared.feed.loadCursor(for: cacheKey) {
            nextCursor = cursor.nextCursor
            hasMore = cursor.hasMore
            if !cursor.hasMore { paginationState = .exhausted }
            cursorRestored = true
        }

        let cached = await CacheCoordinator.shared.feed.load(for: cacheKey)
        switch cached {
        case .fresh(let data, _):
            posts = data
            // `touch` re-fraîchit la fenêtre SWR à chaque visite : ne le faire
            // QUE si un curseur a été restauré — sinon un profil rouvert
            // régulièrement ne repassait JAMAIS par le réseau et le blocage de
            // pagination devenait permanent (le seul recours était l'expiration
            // à 7 jours).
            if cursorRestored {
                await CacheCoordinator.shared.feed.touch(for: cacheKey)
            }
            return
        case .stale(let data, _):
            posts = data
            Task { [weak self] in await self?.fetchFromNetwork() }
            return
        case .expired, .empty:
            break
        }

        isLoading = true
        defer { isLoading = false }
        _ = await fetchFromNetwork()
    }

    /// Charge les stats backend du profil pour les compteurs exacts du bandeau
    /// (dont le compteur de stories, structurellement 0 côté dérivé).
    private func loadStatsCounts() async {
        guard userStats == nil else { return }
        userStats = try? await userService.getUserStats(userId: userId)
    }

    /// Prefetch anticipé par carte : déclenche la révélation/chargement dès
    /// qu'une carte à ≤3 de la fin de la fenêtre rendue apparaît — le contenu
    /// suivant charge AVANT que l'utilisateur n'atteigne le bas, et le
    /// déclencheur se ré-arme tout seul (contrairement à la sentinelle
    /// one-shot, qui mourait dès que la fenêtre ne bougeait plus).
    func loadMoreIfNeeded(currentPost post: FeedPost) {
        guard let index = visiblePosts.firstIndex(where: { $0.id == post.id }) else { return }
        guard index >= visiblePosts.count - 3 else { return }
        scheduleReveal()
    }

    /// Point d'entrée unique et COALESCÉ des déclencheurs de révélation (les
    /// `onAppear` des dernières cartes et la sentinelle de bas de liste). Le
    /// drapeau est posé de façon synchrone, donc les déclencheurs d'un même
    /// frame se fondent en une seule progression de la fenêtre.
    func scheduleReveal() {
        guard !isRevealScheduled else { return }
        isRevealScheduled = true
        Task { [weak self] in
            await self?.revealOrLoadMore()
            self?.isRevealScheduled = false
        }
    }

    /// Sentinel handler: reveal more already-cached cards first (cheap), then
    /// fetch the next network page once the cache is fully rendered.
    func revealOrLoadMore() async {
        if hasMoreToRender {
            renderWindow = min(posts.count, renderWindow + Self.renderStep)
        } else if hasMore {
            await loadMore()
            // Grow the window to include the freshly fetched page — otherwise
            // the rendered prefix is unchanged, the bottom sentinel never moves,
            // its onAppear never re-fires, and pagination dead-ends at the cache
            // boundary.
            renderWindow = min(posts.count, renderWindow + Self.renderStep)
        }
    }

    func loadMore() async {
        // Pas de garde `nextCursor != nil` — même correctif que
        // `FeedViewModel.loadMoreIfNeeded` et `BookmarksViewModel` : un cache
        // `.fresh` ne produit jamais de curseur, et `cursor: nil` signifie
        // « page 1 », exactement ce qu'il faut pour récupérer un vrai curseur.
        // `hasMore` seul est une garde sûre (posé avec le curseur par
        // `fetchFromNetwork`).
        guard hasMore, !isLoading, !isLoadingMore else { return }
        isLoadingMore = true
        paginationState = .loadingMore
        defer { isLoadingMore = false }
        let countBefore = posts.count
        let succeeded = await fetchFromNetwork()
        // Garde zéro-progrès : une page entièrement dupliquée (curseur qui ne
        // progresse pas) laisserait `hasMore == true` avec une liste inchangée
        // → boucle réseau infinie sur le déclencheur auto-ré-armé. On déclare
        // la pagination épuisée plutôt que de marteler le gateway.
        if succeeded, hasMore, posts.count == countBefore, countBefore > 0 {
            hasMore = false
            paginationState = .exhausted
            await CacheCoordinator.shared.feed.saveCursor(nextCursor: nil, hasMore: false, for: cacheKey)
        }
    }

    @discardableResult
    private func fetchFromNetwork() async -> Bool {
        do {
            let response = try await postService.getUserPosts(userId: userId, cursor: nextCursor, limit: 20)
            let preferred = preferredLanguages
            let payload = response.data
            // Decode off the main actor — toFeedPost decodes media / comments /
            // translations (heavy). Both [APIPost] and [FeedPost] are Sendable.
            let fetched = await Task.detached(priority: .userInitiated) {
                payload.map { $0.toFeedPost(preferredLanguages: preferred) }
            }.value

            if nextCursor == nil, posts.isEmpty {
                posts = fetched
            } else if nextCursor == nil {
                // Recovery « page 1 » par-dessus une liste cachée : FUSIONNER,
                // jamais remplacer — un remplacement faisait rétrécir 100
                // cartes en 20 sous le doigt de l'utilisateur (et
                // `renderWindow > posts.count` cassait `visiblePosts`). La page
                // serveur (newest-first) prime ; la queue cachée plus ancienne
                // est conservée derrière.
                let fetchedIds = Set(fetched.map(\.id))
                let olderTail = posts.filter { !fetchedIds.contains($0.id) }
                posts = fetched + olderTail
            } else {
                let existing = Set(posts.map(\.id))
                posts.append(contentsOf: fetched.filter { !existing.contains($0.id) })
            }
            nextCursor = response.pagination?.nextCursor
            // Défaut sûr quand le bloc pagination est strippé de la réponse :
            // un curseur présent vaut « il y a une suite » (forme ReelsViewModel)
            // — `?? false` figeait la pagination définitivement sans recours.
            hasMore = response.pagination?.hasMore ?? (response.pagination?.nextCursor != nil)
            paginationState = hasMore ? .idle : .exhausted

            // Drop any override / share delta whose value now matches server
            // truth, and prune entries for posts no longer present.
            let ids = Set(posts.map(\.id))
            likedOverrides = likedOverrides.filter { ids.contains($0.key) }
            bookmarkedOverrides = bookmarkedOverrides.filter { ids.contains($0.key) }
            repostedOverrides = repostedOverrides.filter { ids.contains($0.key) }
            shareDelta = shareDelta.filter { ids.contains($0.key) }
            for post in posts {
                if likedOverrides[post.id] == post.isLiked { likedOverrides[post.id] = nil }
                if bookmarkedOverrides[post.id] == post.isBookmarkedByMe { bookmarkedOverrides[post.id] = nil }
                if repostedOverrides[post.id] == post.isRepostedByMe { repostedOverrides[post.id] = nil }
            }

            // The live VM keeps the full paginated list in memory; the cache is
            // bounded to the NEWEST 100. GRDBCacheStore.save keeps `suffix(100)`
            // (oldest, posts are newest-first) so we persist `prefix(100)` to
            // avoid trimming the newest posts on cold start.
            try? await CacheCoordinator.shared.feed.save(Array(posts.prefix(100)), for: cacheKey)
            // Persisté À CÔTÉ de la page (même clé) : la prochaine instance du
            // VM reprend au curseur profond au lieu de se coincer sur un cache
            // `.fresh` sans curseur.
            await CacheCoordinator.shared.feed.saveCursor(nextCursor: nextCursor, hasMore: hasMore, for: cacheKey)
            return true
        } catch {
            // Échec réseau : `hasMore`/`nextCursor` restent intacts (retenter la
            // même page), le déclencheur par carte se ré-arme au prochain scroll.
            paginationState = .error(String(localized: "profile.posts.loadError", defaultValue: "Erreur lors du chargement des publications", bundle: .main))
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.loadError", defaultValue: "Erreur lors du chargement des publications", bundle: .main))
            return false
        }
    }

    func refresh() async {
        nextCursor = nil
        hasMore = true
        paginationState = .idle
        renderWindow = Self.initialRenderWindow
        await CacheCoordinator.shared.feed.invalidate(for: cacheKey)
        await fetchFromNetwork()
    }

    // MARK: - Engagement actions (optimistic, crash-free)

    func toggleLike(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let current = isLiked(post)
        likedOverrides[postId] = !current
        do {
            if current {
                try await postService.unlike(postId: postId)
            } else {
                try await postService.like(postId: postId)
            }
        } catch {
            likedOverrides[postId] = current
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.likeError", defaultValue: "Erreur", bundle: .main))
        }
    }

    func toggleBookmark(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }) else { return }
        let current = isBookmarked(post)
        bookmarkedOverrides[postId] = !current
        do {
            if current {
                try await postService.removeBookmark(postId: postId)
            } else {
                try await postService.bookmark(postId: postId)
            }
        } catch {
            bookmarkedOverrides[postId] = current
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.bookmarkError", defaultValue: "Erreur", bundle: .main))
        }
    }

    /// Reposts are append-only on the backend — the optimistic flip only
    /// persists if the server confirmed the create (mirrors FeedView).
    func toggleRepost(_ postId: String) async {
        guard let post = posts.first(where: { $0.id == postId }), !isReposted(post) else { return }
        repostedOverrides[postId] = true
        do {
            // `visibility: nil` = héritage de l'original. Un repost simple
            // depuis le profil n'offre aucun sélecteur d'audience.
            let cible = RepostTargeting.target(
                cardId: postId, cardType: post.type,
                repostOfId: post.repost?.id, originalRepostOfId: post.repost?.originalRepostOfId
            )
            try await RepostPublisher(postService: postService).publish(
                .simple(postId: cible.postId, targetType: cible.targetType, visibility: nil)
            )
            FeedbackToastManager.shared.showSuccess(String(localized: "profile.posts.repost.success", defaultValue: "Repartagé", bundle: .main))
        } catch {
            repostedOverrides[postId] = nil
            FeedbackToastManager.shared.showError(String(localized: "profile.posts.repostError", defaultValue: "Erreur lors du repost", bundle: .main))
        }
    }

    // `sendComment` retiré (2026-07-24) : aucun call site. Les commentaires de
    // cette liste passent par le viewer/détail hôte (PostDetailViewModel), pas
    // par un composer inline ici — la méthode était du code mort trompeur.

    func report(_ postId: String) async {
        do {
            try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.reported", defaultValue: "Publication signalée", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.reportError", defaultValue: "Erreur lors du signalement", bundle: .main))
        }
    }

    // MARK: - Options « … » (parité avec FeedViewModel — menu de la carte poste/réel)

    func deletePost(_ postId: String) async {
        let snapshot = posts
        posts.removeAll { $0.id == postId }
        do {
            try await postService.delete(postId: postId)
            // Le cache vit sous PLUSIEURS clés (`user:<id>`, main-feed, la clé
            // détail, bookmarks) : sans cette purge, la carte supprimée
            // ressortait à la réouverture du profil, servie cache-first.
            await CacheCoordinator.shared.feed.removeEverywhere(itemId: postId)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.deleted", defaultValue: "Publication supprimée", bundle: .main))
        } catch {
            posts = snapshot
            FeedbackToastManager.shared.showError(String(localized: "feed.post.deleteError", defaultValue: "Erreur lors de la suppression", bundle: .main))
        }
    }

    func pinPost(_ postId: String) async {
        do {
            try await postService.pinPost(postId: postId)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.pinned", defaultValue: "Publication épinglée", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.pinError", defaultValue: "Erreur lors de l'épinglage", bundle: .main))
        }
    }

    func updatePost(
        _ postId: String,
        content: String,
        language: String? = nil,
        type: String? = nil,
        removeMediaIds: [String]? = nil,
        location: PostLocationUpdate? = nil,
        visibility: String? = nil,
        visibilityUserIds: [String]? = nil,
        known: Set<PostEditField> = EditPostDraft.documentFields
    ) async {
        guard let idx = posts.firstIndex(where: { $0.id == postId }) else { return }
        let snapshot = posts[idx]
        var optimistic = snapshot
        optimistic.content = content
        optimistic.translatedContent = nil
        optimistic.translations = nil
        switch location {
        case .set(let place): optimistic.location = place
        case .remove: optimistic.location = nil
        case nil: break
        }
        if let visibility {
            optimistic.visibility = visibility
            optimistic.visibilityUserIds = visibilityUserIds
        }
        posts[idx] = optimistic
        do {
            // Le corps ne se construit plus ici : `known` dit ce que la
            // surface a su RENDRE, `PostEditPayload.build` en tire le PUT. Un
            // champ non déclaré est OMIS, et le serveur préserve le sien.
            let updated = try await postService.update(postId: postId, known: known, draft: PostEditDraft(
                content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                originalLanguage: language, type: type, removeMediaIds: removeMediaIds,
                location: location
            ))
            if let newIdx = posts.firstIndex(where: { $0.id == postId }) {
                let edited = updated.toFeedPost(preferredLanguages: languageProvider.preferredLanguages)
                posts[newIdx] = edited
                // `post:updated` n'est pas réconcilié côté cache (contrairement
                // aux likes/commentaires) : sans ce patch, la réouverture du
                // profil ressert l'ANCIEN texte depuis le cache. Fraîcheur
                // préservée — c'est une mutation locale, pas un fetch.
                await CacheCoordinator.shared.feed.patchEverywhere(itemId: postId) { $0 = edited }
            }
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.edited", defaultValue: "Publication modifiée", bundle: .main))
        } catch {
            if let rollbackIdx = posts.firstIndex(where: { $0.id == postId }) {
                posts[rollbackIdx] = snapshot
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.post.editError", defaultValue: "Erreur lors de la modification", bundle: .main))
        }
    }

    // MARK: - On-demand translation (mirrors FeedViewModel)

    /// Requests a translation for `postId` into `language`. The computed
    /// translation is delivered asynchronously via the social socket and patched
    /// into `posts` by `subscribeToSocketUpdates` (so the flag lights up).
    func requestTranslation(postId: String, language: String) async {
        do {
            try await postService.requestTranslation(postId: postId, targetLanguage: language)
        } catch {
            // On failure the flag simply stays "untranslated" — no toast (the
            // tap is exploratory, not a committed user action).
        }
    }

    // MARK: - Real-time sync (parité FeedViewModel, périmètre listing profil)
    //
    // Sans ces sinks, le listing du profil était un instantané mort : un like
    // reçu, un commentaire posté depuis la feuille de commentaires hoistée, une
    // suppression ou une édition faite ailleurs ne touchaient JAMAIS les cartes
    // — seul l'optimisme local bougeait, et le compteur serveur restait figé sur
    // la valeur du fetch. Le CACHE, lui, était déjà réconcilié
    // (`CacheCoordinator.subscribeToPostEngagement`) : l'écart ne portait que
    // sur l'exemplaire EN MÉMOIRE, donc il se voyait tant que la vue restait
    // ouverte et disparaissait à la réouverture — la signature exacte d'un
    // « compteur qui ne se synchronise pas ».

    private func subscribeToSocketUpdates() {
        // Idempotent — garantit que le socket social est monté quand la feuille
        // de profil est ouverte hors du feed.
        socialSocket.connect()
        // Les événements post/commentaire sont diffusés vers la feed room du
        // viewer (cf. `SocialEventsHandler.broadcastToFeedRooms`) : sans ce
        // join, un profil ouvert depuis une conversation ou la recherche ne
        // recevait AUCUNE mise à jour. Join idempotent, et JAMAIS quitté ici —
        // `feed:unsubscribe` appartient au feed, le quitter depuis le profil
        // couperait le temps réel de l'écran d'accueil.
        socialSocket.subscribeFeed()

        socialSocket.postLiked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyLike(postId: data.postId, actorId: data.userId,
                                likeCount: data.likeCount, liked: true)
            }
            .store(in: &cancellables)

        socialSocket.postUnliked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyLike(postId: data.postId, actorId: data.userId,
                                likeCount: data.likeCount, liked: false)
            }
            .store(in: &cancellables)

        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyCommentCount(postId: data.postId, count: data.commentCount)
            }
            .store(in: &cancellables)

        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyCommentCount(postId: data.postId, count: data.commentCount)
            }
            .store(in: &cancellables)

        socialSocket.postBookmarked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId })
                else { return }
                self.posts[index].isBookmarkedByMe = data.bookmarked
                if let count = data.bookmarkCount { self.posts[index].bookmarkCount = count }
                self.bookmarkedOverrides[data.postId] = nil
            }
            .store(in: &cancellables)

        socialSocket.postReposted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in self?.applyRepost(data) }
            .store(in: &cancellables)

        socialSocket.postDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] postId in self?.posts.removeAll { $0.id == postId } }
            .store(in: &cancellables)

        socialSocket.postUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == apiPost.id })
                else { return }
                var merged = apiPost.toFeedPost(preferredLanguages: self.preferredLanguages)
                // L'état personnel n'est pas porté par un broadcast destiné à
                // toute l'audience — le reprendre de l'exemplaire local évite
                // que l'édition d'un poste éteigne le cœur de son lecteur.
                merged.isLiked = self.posts[index].isLiked
                merged.isBookmarkedByMe = self.posts[index].isBookmarkedByMe
                merged.isRepostedByMe = self.posts[index].isRepostedByMe
                self.posts[index] = merged
            }
            .store(in: &cancellables)

        socialSocket.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (data: SocketPostTranslationUpdatedData) in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                var post = self.posts[index]
                var translations = post.translations ?? [:]
                translations[data.language] = PostTranslation(
                    text: data.translation.text,
                    translationModel: data.translation.translationModel,
                    confidenceScore: data.translation.confidenceScore
                )
                post.translations = translations
                if self.preferredLanguages.contains(where: { $0.caseInsensitiveCompare(data.language) == .orderedSame }),
                   post.translatedContent == nil {
                    post.translatedContent = data.translation.text
                }
                self.posts[index] = post
            }
            .store(in: &cancellables)
    }

    /// `post:liked` / `post:unliked` portent le total ABSOLU : il devient la
    /// base. L'override optimiste est levé dès que l'écho de NOTRE propre
    /// action arrive — le garder ferait dériver l'affichage de ±1, `adjusted()`
    /// l'appliquant par-dessus un total qui inclut déjà ce like.
    private func applyLike(postId: String, actorId: String, likeCount: Int, liked: Bool) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[index].likes = likeCount
        guard actorId == currentUserIdProvider() else { return }
        posts[index].isLiked = liked
        likedOverrides[postId] = nil
    }

    private func applyCommentCount(postId: String, count: Int) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[index].commentCount = count
    }

    /// `post:reposted` ne porte PAS de total absolu (contrairement aux likes) —
    /// d'où l'incrément gardé par `appliedRepostIds`. Le repost lui-même est un
    /// poste de son auteur : il rejoint la tête du listing quand c'est le profil
    /// consulté.
    private func applyRepost(_ data: SocketPostRepostedData) {
        guard appliedRepostIds.insert(data.repost.id).inserted else { return }
        if let index = posts.firstIndex(where: { $0.id == data.originalPostId }) {
            posts[index].repostCount += 1
            if data.repost.author.id == currentUserIdProvider() {
                posts[index].isRepostedByMe = true
                repostedOverrides[data.originalPostId] = nil
            }
        }
        // Le compteur ci-dessus vaut pour TOUT repost — c'est celui de
        // l'original. La GRILLE, elle, ne sert que ce que sa lecture REST sert
        // (`getUserPosts` : `[POST, REEL]`) : une story repostee arrivait par
        // `post:reposted`, non type, et s'y inserait alors qu'elle vit dans le
        // tray.
        guard !data.repost.belongsToStoryTray,
              data.repost.author.id == userId,
              !posts.contains(where: { $0.id == data.repost.id }) else { return }
        posts.insert(data.repost.toFeedPost(preferredLanguages: preferredLanguages), at: 0)
    }

    /// Optimistic share-count bump — the gateway always increments shareCount on
    /// `POST /posts/:id/share` regardless of mint success, so we mirror it.
    func bumpShare(_ postId: String) {
        shareDelta[postId, default: 0] += 1
    }

    // MARK: - Impressions (batched, source "profile")

    func trackImpression(_ postId: String) {
        impressions.record(postId)
    }

    /// À appeler quand la liste disparaît : sans ce flush, le lot en cours de
    /// groupement est perdu.
    func flushImpressions() async {
        await impressions.flushNow()
    }
}
