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
    /// Les favoris en cours d'écriture : un second toucher n'envoie rien.
    @Published private(set) var bookmarkInFlightIds: Set<String> = []

    private let service: PostServiceProviding
    private let languageProvider: LanguageProviding
    /// « Repartager » d'une carte (#15934) : l'écrivain unique, construit sur
    /// le service injecté, et le retour à l'utilisateur.
    private let reposter: ListedPostReposter
    /// « Enregistrer » d'une carte (#15994) : le même écrivain que le fil.
    private let bookmarker: PostBookmarkWriter
    /// « Partager » du menu ⋯ (#15994).
    private let sharer: ListedPostSharer
    /// La file des impressions de CE listing — la carte y situe son
    /// apparition et y relaie sa visibilité (#10501).
    let impressions: ReachImpressionRecording
    private var nextCursor: String?
    private var hasMore = true
    /// Chaque `load()` ouvre une génération : une page de `loadMore` (ou un
    /// `load` plus ancien) qui revient après n'écrit plus rien — elle
    /// collerait la page 2 de l'ANCIENNE liste à la nouvelle, et son curseur.
    private var generation = 0

    init(
        tag: String,
        service: PostServiceProviding = PostService.shared,
        languageProvider: LanguageProviding = AuthManagerLanguageProvider(),
        impressions: ReachImpressionRecording? = nil,
        reposter: ListedPostReposter? = nil,
        bookmarker: PostBookmarkWriter? = nil
    ) {
        self.tag = tag
        self.service = service
        self.languageProvider = languageProvider
        self.reposter = reposter ?? ListedPostReposter(publisher: RepostPublisher(postService: service))
        self.bookmarker = bookmarker ?? PostBookmarkWriter(service: service)
        self.sharer = ListedPostSharer(service: service)
        if let impressions {
            self.impressions = impressions
        } else {
            self.impressions = ImpressionBatcher(source: "search", surface: .hashtag, postService: service)
        }
    }

    /// #10483 — un résultat qui apparaît à l'écran est une impression, à
    /// chaque apparition.
    func recordImpression(_ postId: String) {
        impressions.record(postId)
    }

    /// Le rang auquel `postId` est RENDU dans ces résultats.
    func position(of postId: String) -> Int? {
        posts.firstIndex { $0.id == postId }
    }

    /// L'écran se ferme : le lot en cours de groupement part.
    func flushImpressions() async {
        await impressions.flushNow()
    }

    /// `apiPost.toFeedPost(preferredLanguages:)` — même conversion que
    /// `FeedViewModel.loadFeed`, pas un `FeedPost.init` inventé : c'est cette
    /// méthode qui résout la traduction affichée selon les langues préférées
    /// de l'utilisateur (`FeedModels.swift`).
    func load() async {
        generation += 1
        let current = generation
        isLoading = true
        defer { if current == generation { isLoading = false } }
        let preferred = languageProvider.preferredLanguages
        do {
            let response = try await service.getPostsByHashtag(tag: tag, cursor: nil, limit: 20)
            guard current == generation else { return }
            posts = response.data.map { $0.toFeedPost(preferredLanguages: preferred) }
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false
        } catch {
            guard current == generation else { return }
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

    /// **« Repartager » ne faisait rien depuis un hashtag** (#15934) : la vue
    /// montait la carte sans `onRepost`, et le choix appelait un rappel absent.
    /// Même règle que le profil — bascule optimiste de l'icône et du compteur,
    /// retour arrière à l'échec — par `PostRepostMutation`.
    func toggleRepost(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }),
              let reposted = PostRepostMutation.reposted(posts[index]) else { return }
        let shown = posts[index]
        posts[index] = reposted
        guard await !reposter.repost(shown),
              let current = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[current] = PostRepostMutation.withdrawn(posts[current])
    }

    /// **« Enregistrer » ne faisait rien depuis un hashtag** (#15994) : la vue
    /// montait la carte sans `onBookmark`, et le marque-page s'affichait avec
    /// son compteur sur un rappel absent. Bascule optimiste de l'icône et du
    /// compteur (`PostBookmarkMutation`), envoi par l'écrivain du fil, retour
    /// arrière du SEUL favori à l'échec.
    func toggleBookmark(_ postId: String) async {
        guard !bookmarkInFlightIds.contains(postId),
              let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        let wanted = !posts[index].isBookmarkedByMe
        posts[index] = PostBookmarkMutation.setting(posts[index], bookmarked: wanted)
        bookmarkInFlightIds.insert(postId)
        defer { bookmarkInFlightIds.remove(postId) }
        guard await !bookmarker.write(bookmarked: wanted, postId: postId, post: posts[index]),
              let current = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[current] = PostBookmarkMutation.setting(posts[current], bookmarked: !wanted)
    }

    func isBookmarkInFlight(_ postId: String) -> Bool {
        bookmarkInFlightIds.contains(postId)
    }

    /// Le lien à présenter pour « Partager » ; le compteur ne bouge que si la
    /// passerelle a enregistré le partage.
    func shareLink(for postId: String) async -> ShareableLink? {
        guard let post = posts.first(where: { $0.id == postId }) else { return nil }
        let outcome = await sharer.share(post)
        if outcome.recorded, let index = posts.firstIndex(where: { $0.id == postId }) {
            posts[index].shareCount += 1
        }
        return outcome.link
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        let current = generation
        isLoading = true
        defer { if current == generation { isLoading = false } }
        let preferred = languageProvider.preferredLanguages
        do {
            let response = try await service.getPostsByHashtag(tag: tag, cursor: nextCursor, limit: 20)
            guard current == generation else { return }
            // Le serveur pagine par DÉCALAGE (`skip`) : un post publié sous ce
            // hashtag entre deux pages repousse la liste d'un rang, et le dernier
            // post de la page déjà montrée revient en tête de la suivante. Deux
            // fois le même id dans `ForEach(posts)`, c'est une identité SwiftUI
            // indéfinie (cellule qui montre l'autre, état croisé).
            let shown = Set(posts.map(\.id))
            let fresh = response.data
                .map { $0.toFeedPost(preferredLanguages: preferred) }
                .filter { !shown.contains($0.id) }
            posts.append(contentsOf: fresh)
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false
        } catch {
            // Une requête perdue n'est pas la fin de la liste : le prochain
            // défilement la redemande (comme `ReelsViewModel`).
        }
    }
}
