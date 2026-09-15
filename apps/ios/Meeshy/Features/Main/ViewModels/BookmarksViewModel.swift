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
                // vm-bookmarks-pagination-01 — router par loadMore : un seul
                // point de vérité pour le guard concurrentiel isLoading.
                Task { [weak self] in await self?.loadMore() }
                return
            case .expired, .empty:
                break
            }
        }

        isLoading = true
        defer { isLoading = false }
        await fetchBookmarksFromNetwork()
    }

    private func fetchBookmarksFromNetwork() async {
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
            let existingIds = Set(posts.map(\.id))
            let unique = newPosts.filter { !existingIds.contains($0.id) }
            posts.append(contentsOf: unique)
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false

            if nextCursor == nil || posts.count == unique.count {
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

    func refresh() async {
        posts = []
        nextCursor = nil
        hasMore = true
        await CacheCoordinator.shared.feed.invalidate(for: "bookmarks")
        await loadBookmarks()
    }
}
