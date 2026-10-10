import Foundation
import Combine
import MeeshySDK

// MARK: - Ce qu'un visiteur sans compte a ouvert (#9171)

/// Les contenus qu'un lien universel ouvre SANS session (#9171, jumeau iOS de
/// #9149) : une publication ou un réel PUBLICS, que la passerelle sert sans
/// jeton (`GET /posts/:postId`). Le reste des liens de contenu attend la
/// connexion, comme avant.
enum VisitorContentKind: Equatable, Sendable {
    case post
    case reel
}

/// Le contenu à montrer à un visiteur, et le jeton du `/l/<jeton>` qui l'a
/// amené (`via`), seul moyen de nommer qui le lui a partagé.
struct VisitorContentRequest: Equatable, Identifiable, Sendable {
    let postId: String
    let kind: VisitorContentKind
    let via: String?

    var id: String { "\(postId)|\(via ?? "")" }

    /// `nil` pour tout lien qui n'est ni une publication ni un réel.
    init?(link: DeepLink, via: String?) {
        switch link {
        case .postDetail(let postId):
            self.init(postId: postId, kind: .post, via: via)
        case .reel(let postId):
            self.init(postId: postId, kind: .reel, via: via)
        default:
            return nil
        }
    }

    init(postId: String, kind: VisitorContentKind, via: String?) {
        self.postId = postId
        self.kind = kind
        self.via = via
    }
}

/// Ce que l'écran visiteur peut dire de son contenu.
enum VisitorContentState: Sendable {
    /// En lecture.
    case pending
    /// Là — avec qui l'a partagé, quand le lien le nomme.
    case served(post: FeedPost, sharer: TrackedLinkSharer?)
    /// La passerelle a répondu non (404/403 confondus) : rien à réessayer, la
    /// carte d'invitation reste seule.
    case refused
    /// Panne ou coupure : « Réessayer » a un sens.
    case failed

    var isServed: Bool {
        if case .served = self { return true }
        return false
    }
}

// MARK: - Chargeur

protocol VisitorContentProviding: Sendable {
    func load(_ request: VisitorContentRequest) async -> VisitorContentState
}

/// Charge le contenu d'un visiteur et, si le lien en porte un, son partageur.
///
/// Le post part par `PostService.getPost` sans jeton ; la résolution du lien
/// (`/tracking-links/:token/resolve`) n'est demandée QUE si un jeton est là.
/// Un partageur introuvable ne coûte rien : le contenu reste servi, sans nom.
struct VisitorContentLoader: VisitorContentProviding {
    let posts: PostServiceProviding
    let links: TrackedLinkResolving
    let preferredLanguages: @Sendable () -> [String]

    init(
        posts: PostServiceProviding = PostService.shared,
        links: TrackedLinkResolving = TrackedLinkService.shared,
        preferredLanguages: @escaping @Sendable () -> [String] = { ReaderPrism.resolve(for: nil) }
    ) {
        self.posts = posts
        self.links = links
        self.preferredLanguages = preferredLanguages
    }

    func load(_ request: VisitorContentRequest) async -> VisitorContentState {
        async let namedSharer = sharer(via: request.via)
        do {
            let post = try await posts.getPost(postId: request.postId)
                .toFeedPost(preferredLanguages: preferredLanguages())
            return .served(post: post, sharer: await namedSharer)
        } catch {
            return ContentFetchFailure.classify(error).isAbsence ? .refused : .failed
        }
    }

    private func sharer(via token: String?) async -> TrackedLinkSharer? {
        guard let token else { return nil }
        do {
            return try await links.resolve(token: token).sharer
        } catch {
            return nil
        }
    }
}

// MARK: - Présentation

/// **Le contenu d'un lien ouvert sans session, présenté AU-DESSUS de
/// l'écran de connexion** (#9171).
///
/// Le lien en attente (`DeepLinkRouter.pendingDeepLink`) n'est PAS consommé :
/// la racine connectée le reprend à son montage, et le contenu s'ouvre après
/// la connexion comme avant. Le visiteur voit seulement ce que le lien
/// promettait en attendant.
final class VisitorContentPresenter: ObservableObject {
    nonisolated deinit {}
    static let shared = VisitorContentPresenter()

    @Published private(set) var request: VisitorContentRequest?

    /// L'écran de compte choisi depuis la carte, remis à `LoginView` une fois
    /// l'écran visiteur refermé — l'inscription ne s'ouvre pas sous lui.
    private(set) var accountEntryAfterDismiss: InviteLandingChoice?

    private let router: DeepLinkRouter
    private let isAuthenticated: @MainActor () -> Bool

    init(
        router: DeepLinkRouter = .shared,
        isAuthenticated: @escaping @MainActor () -> Bool = { AuthManager.shared.isAuthenticated }
    ) {
        self.router = router
        self.isAuthenticated = isAuthenticated
    }

    /// Présente `link` s'il est un contenu qu'un visiteur peut voir. Rend
    /// `true` quand l'écran visiteur est présenté.
    @discardableResult
    func present(_ link: DeepLink?) -> Bool {
        guard !isAuthenticated(), let link,
              let request = VisitorContentRequest(link: link, via: router.via(for: link)) else { return false }
        self.request = request
        return true
    }

    /// « Créer un compte » / « Se connecter » : l'écran se ferme et l'écran de
    /// compte s'ouvre derrière lui.
    func requestAccount(_ entry: InviteLandingChoice) {
        accountEntryAfterDismiss = entry
        request = nil
    }

    func dismiss() {
        request = nil
    }

    /// Appelé quand l'écran visiteur a quitté l'écran.
    func didDismiss() {
        guard let entry = accountEntryAfterDismiss else { return }
        accountEntryAfterDismiss = nil
        router.requestedAccountEntry = entry
    }
}
