import Foundation
import MeeshySDK

@MainActor
final class HashtagResultsViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    let tag: String
    @Published private(set) var posts: [FeedPost] = []
    @Published private(set) var isLoading = false

    private let service: PostServiceProviding
    private let languageProvider: LanguageProviding
    private var nextCursor: String?
    private var hasMore = true

    init(
        tag: String,
        service: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider()
    ) {
        self.tag = tag
        self.service = service
        self.languageProvider = languageProvider
    }

    /// `apiPost.toFeedPost(preferredLanguages:)` — même conversion que
    /// `FeedViewModel.loadFeed`, pas un `FeedPost.init` inventé : c'est cette
    /// méthode qui résout la traduction affichée selon les langues préférées
    /// de l'utilisateur (`FeedModels.swift`).
    func load() async {
        isLoading = true
        defer { isLoading = false }
        let preferred = languageProvider.preferredLanguages
        do {
            let response = try await service.getPostsByHashtag(tag: tag, cursor: nil, limit: 20)
            posts = response.data.map { $0.toFeedPost(preferredLanguages: preferred) }
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false
        } catch {
            // Échec silencieux : liste vide plutôt qu'un crash, même
            // invariant que le reste du feed sur perte réseau.
            posts = []
            hasMore = false
        }
    }

    /// **Le cœur des RÉSULTATS D'UN HASHTAG aimait dans le vide** (retour
    /// porteur 2026-09-13) — jumeau exact du défaut des favoris :
    /// `HashtagResultsView` montait `FeedPostCard(post: post)` et rien d'autre.
    /// Garde : `FeedPostCardLikeWiringSourceGuardTests`.
    ///
    /// Même règle partagée (`PostLikeMutation`), même restauration par ID plutôt
    /// que par index — `loadMore` peut avoir ajouté une page pendant
    /// l'aller-retour réseau. Pas de cache à sauver ici : cet écran n'en a pas,
    /// et l'écho serveur `post:liked` réaffirmera le total absolu.
    func toggleLike(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        let snapshot = posts[index]
        let outcome = PostLikeMutation.toggled(isLiked: snapshot.isLiked, likes: snapshot.likes)
        posts[index].isLiked = outcome.isLiked
        posts[index].likes = outcome.likes
        do {
            if outcome.isLiked {
                try await service.like(postId: postId)
            } else {
                try await service.unlike(postId: postId)
            }
        } catch {
            if let current = posts.firstIndex(where: { $0.id == postId }) {
                posts[current] = snapshot
            }
            FeedbackToastManager.shared.showError(String(localized: "feed.like.error", defaultValue: "Impossible d'aimer la publication", bundle: .main))
        }
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        let preferred = languageProvider.preferredLanguages
        do {
            let response = try await service.getPostsByHashtag(tag: tag, cursor: nextCursor, limit: 20)
            posts.append(contentsOf: response.data.map { $0.toFeedPost(preferredLanguages: preferred) })
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false
        } catch {
            hasMore = false
        }
    }
}
