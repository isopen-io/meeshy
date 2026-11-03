import Foundation
import Combine
import MeeshySDK

/// Ce que la liste « Publications non envoyées » lit et fait dans la file
/// durable (#13415).
nonisolated protocol UnsentPublicationsSource: Sendable {
    func unsentPublications() async -> [UnsentPublication]
    func retryPublication(clientMutationId: String) async throws
    func cancelPendingPublication(clientMutationId: String) async -> PublicationCancellation
}

extension OfflineQueue: UnsentPublicationsSource {
    func retryPublication(clientMutationId: String) async throws {
        try await retryByClientMessageId(clientMutationId)
    }
}

/// Les brouillons du meuble rangés par publication acceptée (#13415).
@MainActor
protocol UnsentPublicationDrafts {
    /// Les publications dont le brouillon complet est encore sur l'appareil.
    func parkedPublicationIds() -> Set<String>
    func discardDraft(of publicationId: String)
    /// `false` si la création du meuble porte déjà un brouillon : il ne
    /// s'écrase jamais.
    func canReopen() -> Bool
    /// Rend le brouillon de la publication à la création du meuble.
    func reopen(_ publicationId: String)
}

/// Les sources réelles, nommées hors du modèle de vue.
@MainActor
enum UnsentPublicationsLive {
    static var source: UnsentPublicationsSource { OfflineQueue.shared }
    static var drafts: UnsentPublicationDrafts { ComposerUnsentPublicationDrafts() }
}

@MainActor
struct ComposerUnsentPublicationDrafts: UnsentPublicationDrafts {
    var store: ComposerAutosaveProviding = ComposerAutosaveStore.shared
    var account: () -> ComposerAutosaveAccount? = {
        ComposerAutosaveAccount(userId: AuthManager.shared.currentUser?.id,
                                serverOrigin: MeeshyConfig.shared.persistedServerOrigin)
    }

    func parkedPublicationIds() -> Set<String> {
        guard let account = account() else { return [] }
        return Set(store.publicationSlots(account: account).compactMap(\.publicationId))
    }

    func discardDraft(of publicationId: String) {
        guard let account = account() else { return }
        store.delete(account: account, slot: .publication(publicationId))
    }

    func canReopen() -> Bool {
        guard let account = account() else { return false }
        return !store.hasDraft(account: account, slot: .creation)
    }

    func reopen(_ publicationId: String) {
        guard let account = account() else { return }
        store.move(account: account, from: .publication(publicationId), to: .creation)
        store.waitForPendingWrites()
    }
}

/// Ce que « Rouvrir en brouillon » a fait.
enum UnsentPublicationReopening: Equatable {
    /// Le brouillon est dans le meuble ; l'hôte ouvre le composeur.
    case reopened
    /// Le meuble porte déjà un brouillon, qui ne s'écrase pas.
    case composerBusy
    /// La publication part en ce moment, ou vient de partir.
    case alreadySending
    case failed
}

enum UnsentPublicationsCopy {
    static var title: String {
        String(localized: "feed.unsent.title", defaultValue: "Publications non envoyées", bundle: .main)
    }
    static var retry: String { String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main) }
    static var delete: String { String(localized: "feed.unsent.delete", defaultValue: "Supprimer", bundle: .main) }
    static var waiting: String { String(localized: "feed.unsent.waiting", defaultValue: "En attente d'envoi", bundle: .main) }
    static var sending: String { String(localized: "feed.unsent.sending", defaultValue: "Envoi en cours…", bundle: .main) }
    static var failed: String { String(localized: "feed.unsent.failed", defaultValue: "Non envoyée", bundle: .main) }
    static var empty: String { String(localized: "feed.unsent.empty", defaultValue: "Tout est publié.", bundle: .main) }
    static var deleteConfirmTitle: String {
        String(localized: "feed.unsent.delete.confirm", defaultValue: "Supprimer cette publication ?", bundle: .main)
    }
    static var deleteConfirmMessage: String {
        String(localized: "feed.unsent.delete.message", defaultValue: "Elle n'a pas été publiée : son texte et ses médias quitteront cet appareil.", bundle: .main)
    }
    static var cancel: String { String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main) }
    static var cancelSend: String { String(localized: "story.mine.waiting.cancel", defaultValue: "Annuler l'envoi", bundle: .main) }
    static var close: String { String(localized: "common.close", defaultValue: "Fermer", bundle: .main) }
    static var deleted: String { String(localized: "feed.post.pending.withdrawn", defaultValue: "Envoi annulé", bundle: .main) }
    static var alreadySent: String {
        String(localized: "feed.post.pending.alreadySent", defaultValue: "Cette publication vient de partir. Supprimez-la une fois en ligne.", bundle: .main)
    }
    static var deleteError: String { String(localized: "feed.post.deleteError", defaultValue: "Erreur lors de la suppression", bundle: .main) }
    static var retryError: String {
        String(localized: "feed.unsent.retryError", defaultValue: "Impossible de relancer l'envoi", bundle: .main)
    }
    static var reopen: String {
        String(localized: "feed.unsent.reopen", defaultValue: "Rouvrir en brouillon", bundle: .main)
    }
    static var composerBusy: String {
        String(localized: "feed.unsent.composerBusy", defaultValue: "Un brouillon est déjà en cours dans le composeur : publiez-le ou videz-le d'abord.", bundle: .main)
    }
    static var alreadySending: String {
        String(localized: "feed.unsent.alreadySending", defaultValue: "Cette publication est en train de partir.", bundle: .main)
    }
    static func typeLabel(_ type: String) -> String {
        switch type {
        case "REEL": String(localized: "feed.unsent.type.reel", defaultValue: "Réel", bundle: .main)
        case "STATUS": String(localized: "content.kind.mood", defaultValue: "Humeur", bundle: .main)
        default: String(localized: "feed.unsent.type.post", defaultValue: "Post", bundle: .main)
        }
    }
}

/// **Ce que l'auteur lit quand il annule l'envoi d'une publication en attente**
/// (#10331) — le même verdict depuis le détail d'un post et depuis Mes stories.
/// Rend `true` quand rien ne partira plus.
@MainActor
enum PendingSendNotice {
    @discardableResult
    static func announce(
        _ verdict: PublicationCancellation,
        toasts: FeedbackToastSurfacing = FeedbackToastManager.shared
    ) -> Bool {
        switch verdict {
        case .removed, .cancelRequested: toasts.showSuccess(UnsentPublicationsCopy.deleted)
        case .notFound: toasts.showError(UnsentPublicationsCopy.alreadySent)
        case .failed: toasts.showError(UnsentPublicationsCopy.deleteError)
        }
        return verdict == .removed || verdict == .cancelRequested
    }

    @discardableResult
    static func announce(
        _ verdict: StoryPendingCancellation,
        toasts: FeedbackToastSurfacing = FeedbackToastManager.shared
    ) -> Bool {
        switch verdict {
        case .removed: toasts.showSuccess(UnsentPublicationsCopy.deleted)
        case .inFlight: toasts.showError(UnsentPublicationsCopy.alreadySending)
        case .notFound: toasts.showError(UnsentPublicationsCopy.alreadySent)
        }
        return verdict == .removed
    }
}

/// **Pourquoi une publication n'est pas partie, dit à l'auteur** (#13415) :
/// `lastError` est la description technique que la file a gardée ; la liste
/// n'en montre que la cause, en mots.
nonisolated enum UnsentPublicationFailureReason: Equatable {
    case unsupportedFormat
    case offline
    case sessionExpired
    /// #13824 — refus définitif du serveur sur la publication elle-même.
    case refusedByServer
    case other

    private static let refusalTraces = ["statusCode: 400,", "statusCode: 413,", "statusCode: 422,"]

    init(lastError: String?) {
        let trace = lastError ?? ""
        if trace.contains("UnsupportedImageFormatRefusal") || trace.contains("statusCode: 415") {
            self = .unsupportedFormat
        } else if Self.refusalTraces.contains(where: trace.contains) {
            self = .refusedByServer
        } else if trace.contains("NSURLErrorDomain") || trace.contains("network") || trace.contains("URLError") {
            self = .offline
        } else if trace.contains("sessionExpired") {
            self = .sessionExpired
        } else {
            self = .other
        }
    }

    var message: String {
        switch self {
        case .unsupportedFormat:
            return String(localized: "feed.unsent.reason.format", defaultValue: "Le serveur a refusé le format d'une photo.", bundle: .main)
        case .offline:
            return String(localized: "feed.unsent.reason.offline", defaultValue: "Pas de connexion au moment de l'envoi.", bundle: .main)
        case .sessionExpired:
            return String(localized: "feed.unsent.reason.session", defaultValue: "Session expirée : reconnectez-vous, puis réessayez.", bundle: .main)
        case .refusedByServer:
            return String(localized: "feed.unsent.reason.refused", defaultValue: "Le serveur a refusé cette publication telle quelle.", bundle: .main)
        case .other:
            return String(localized: "feed.unsent.reason.other", defaultValue: "L'envoi a échoué.", bundle: .main)
        }
    }
}

/// **« Annuler l'envoi » d'une publication encore dans la file** (#10331) —
/// l'UNIQUE action, que le détail d'un post, la carte du fil et la pastille de
/// synchronisation empruntent. Rien n'existe côté serveur sous un cmid : la
/// ligne `.createPost` est retirée (ou marquée si elle est en vol), l'auteur
/// lit le verdict, et `withdrawn` prévient les fils ouverts que leur carte
/// optimiste n'a plus de ligne pour la réconcilier.
///
/// Un fil peut ne pas être ouvert au moment de l'annulation : depuis le
/// détail, la racine iPhone démonte le fil et son modèle (#14879). La carte
/// quitte donc AUSSI le cache, et `withdrawnIds` empêche tout fil remonté
/// pendant la session de la relire — sinon elle revenait, vignette cassée,
/// et rien ne pouvait plus la retirer.
@MainActor
enum PendingPublicationCancel {
    static let withdrawn = PassthroughSubject<String, Never>()
    private(set) static var withdrawnIds: Set<String> = []

    @discardableResult
    static func run(
        _ cmid: String,
        queue: OfflineQueueing = OfflineQueue.shared,
        toasts: FeedbackToastSurfacing = FeedbackToastManager.shared,
        feedCache: any FeedCacheStoring = SharedFeedCache()
    ) async -> Bool {
        let verdict = await queue.cancelPendingPublication(clientMutationId: cmid)
        let alreadyCancelled = verdict == .notFound && withdrawnIds.contains(cmid)
        guard PendingSendNotice.announce(alreadyCancelled ? .removed : verdict, toasts: toasts) else { return false }
        withdrawnIds.insert(cmid)
        withdrawn.send(cmid)
        await feedCache.removeEverywhere(itemId: cmid)
        return true
    }

    /// Ce qu'un fil peut afficher d'une liste relue (cache, réseau) : jamais
    /// une publication dont l'envoi a été annulé.
    static func excludingWithdrawn(_ posts: [FeedPost]) -> [FeedPost] {
        withdrawnIds.isEmpty ? posts : posts.filter { !withdrawnIds.contains($0.id) }
    }

    /// Le geste d'une vue : l'accusé tombe dès que la file a répondu.
    static func start(_ cmid: String) {
        HapticFeedback.light()
        Task { await run(cmid) }
    }
}
