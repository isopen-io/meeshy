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
