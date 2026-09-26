import Foundation
import Combine
import MeeshySDK

@MainActor
class BookmarksViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var hasMore = true

    private var nextCursor: String?
    private let postService: PostServiceProviding
    private let languageProvider: LanguageProviding

    init(
        postService: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider()
    ) {
        self.postService = postService
        self.languageProvider = languageProvider
    }

    private var preferredLanguages: [String] {
        languageProvider.preferredLanguages
    }

    func loadBookmarks() async {
        guard !isLoading else { return }

        if nextCursor == nil {
            let cached = await CacheCoordinator.shared.feed.load(for: "bookmarks")
            switch cached {
            case .fresh(let data, _):
                posts = data
                return
            case .stale(let data, _):
                posts = data
                // Revalidation SILENCIEUSE. Elle passait par `loadMore()`, qui
                // lève `isLoading` — et `BookmarksView` rend un `ProgressView`
                // dessus : l'utilisateur voyait ses favoris AVEC un spinner par-
                // dessus, exactement ce que le cache-first existe pour éviter.
                // `loadMore()` AJOUTE de surcroît, en dédoublonnant : un favori
                // retiré depuis un autre appareil ne disparaissait jamais de
                // cette liste.
                Task { [weak self] in await self?.revalidateFirstPage() }
                return
            case .expired, .empty:
                break
            }
        }

        isLoading = true
        defer { isLoading = false }
        await fetchBookmarksFromNetwork()
    }

    /// Relit la PREMIÈRE page en arrière-plan, sans lever `isLoading`.
    private func revalidateFirstPage() async {
        guard !isLoading else { return }
        nextCursor = nil
        await fetchBookmarksFromNetwork(replacingExisting: true)
    }

    /// - Parameter replacingExisting: la page reçue REMPLACE la liste au lieu de
    ///   s'y ajouter. C'est ce qu'une première page veut dire — et c'est la
    ///   seule forme qui fait disparaître un favori retiré ailleurs. Le
    ///   remplacement n'a lieu qu'APRÈS la réponse : une panne laisse la liste
    ///   et le cache exactement où ils étaient.
    private func fetchBookmarksFromNetwork(replacingExisting: Bool = false) async {
        do {
            let response = try await postService.getBookmarks(cursor: nextCursor, limit: 20)
            // Decode off the main actor — toFeedPost decodes each post's media /
            // comments / translations (same heavy decode as the feed). Both
            // [APIPost] and [FeedPost] are Sendable.
            let preferred = preferredLanguages
            let payload = response.data
            let newPosts = await Task.detached(priority: .userInitiated) {
                payload.map { $0.toFeedPost(preferredLanguages: preferred) }
            }.value
            let appendsToEmptyList = !replacingExisting && posts.isEmpty
            if replacingExisting {
                posts = newPosts
            } else {
                let existingIds = Set(posts.map(\.id))
                posts.append(contentsOf: newPosts.filter { !existingIds.contains($0.id) })
            }
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false

            if replacingExisting || nextCursor == nil || appendsToEmptyList {
                try? await CacheCoordinator.shared.feed.save(posts, for: "bookmarks")
            }
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.bookmark.loadError", defaultValue: "Impossible de charger les favoris", bundle: .main))
        }
    }

    func removeBookmark(_ postId: String) async {
        let snapshot = posts
        posts.removeAll { $0.id == postId }
        do {
            try await postService.removeBookmark(postId: postId)
            try? await CacheCoordinator.shared.feed.save(posts, for: "bookmarks")
        } catch {
            posts = snapshot
            FeedbackToastManager.shared.showError(String(localized: "feed.bookmark.removeError", defaultValue: "Impossible de retirer le favori", bundle: .main))
        }
    }

    /// **Le cœur des FAVORIS aimait dans le vide** (retour porteur 2026-09-13).
    ///
    /// `BookmarksView` montait `FeedPostCard` sans `onLike`. Le paramètre étant
    /// optionnel, rien ne rougissait — et le bouton n'était pas seulement
    /// inerte : il jouait sa rafale ET sa haptique avant d'appeler un rappel
    /// absent. L'utilisateur recevait la confirmation sensorielle d'un geste qui
    /// n'avait pas lieu. Garde : `FeedPostCardLikeWiringSourceGuardTests`.
    ///
    /// La règle de bascule vient de `PostLikeMutation`, partagée : ce qui reste
    /// ici est ce que ce modèle SEUL possède — son service, son instantané de
    /// restauration, et sa clé de cache « bookmarks ».
    ///
    /// L'instantané est relocalisé par ID à la restauration, jamais par l'index
    /// capturé : la liste peut avoir bougé pendant l'aller-retour réseau
    /// (`removeBookmark` retire des lignes, `loadMore` en ajoute), et réécrire à
    /// un index périmé restaurerait l'ancien état SUR UN AUTRE POST.
    func toggleLike(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        let snapshot = posts[index]
        let outcome = PostLikeMutation.toggled(isLiked: snapshot.isLiked, likes: snapshot.likes)
        posts[index].isLiked = outcome.isLiked
        posts[index].likes = outcome.likes
        do {
            if outcome.isLiked {
                try await postService.like(postId: postId)
            } else {
                try await postService.unlike(postId: postId)
            }
            try? await CacheCoordinator.shared.feed.save(posts, for: "bookmarks")
        } catch {
            if let current = posts.firstIndex(where: { $0.id == postId }) {
                posts[current] = snapshot
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.like.error", defaultValue: "Impossible d'aimer la publication", bundle: .main))
        }
    }

    /// vm-bookmarks-pagination-01 — page suivante RÉSEAU, jamais le cache :
    /// le sentinel rappelait loadBookmarks() qui re-servait le .fresh et
    /// bloquait la pagination pour toute la session.
    func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        await fetchBookmarksFromNetwork()
    }

    /// Fetch-then-replace : NI l'écran NI le cache ne se vident avant que le
    /// réseau ait répondu.
    ///
    /// Le geste vidait `posts` puis INVALIDAIT le cache, et ne partait chercher
    /// qu'ensuite : un tirer-pour-rafraîchir hors ligne laissait « aucun
    /// favori » à l'écran ET un cache détruit — l'ouverture suivante repartait
    /// elle aussi du réseau, alors que la liste était sur le disque une seconde
    /// plus tôt. Même loi que `ConversationListViewModel.forceRefresh`.
    func refresh() async {
        guard !isLoading else { return }
        nextCursor = nil
        hasMore = true
        await fetchBookmarksFromNetwork(replacingExisting: true)
    }
}
