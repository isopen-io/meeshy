import Foundation
import Combine
import MeeshySDK

/// Ce que la liste « Publications non envoyées » lit et fait dans la file
/// durable (#13415).
protocol UnsentPublicationsSource: Sendable {
    func unsentPublications() async -> [UnsentPublication]
    func retryPublication(clientMutationId: String) async throws
    func cancelPendingPublication(clientMutationId: String) async -> PublicationCancellation
}

extension OfflineQueue: UnsentPublicationsSource {
    func retryPublication(clientMutationId: String) async throws {
        try await retryByClientMessageId(clientMutationId)
    }
}

/// **Les publications encore sur l'appareil** (#13415) : un post ou un réel
/// que le serveur n'a pas confirmé y reste jusqu'à sa confirmation ou au geste
/// « Supprimer » de son auteur. Chaque action répond tout de suite ; la file
/// confirme ensuite, et un refus remet la ligne à sa place.
@MainActor
final class UnsentPublicationsViewModel: ObservableObject {
    @Published private(set) var publications: [UnsentPublication] = []
    @Published private(set) var hasLoaded = false

    private let source: UnsentPublicationsSource

    init(source: UnsentPublicationsSource = OfflineQueue.shared) {
        self.source = source
    }

    var count: Int { publications.count }

    func load() async {
        publications = await source.unsentPublications()
        hasLoaded = true
    }

    func retry(_ id: String) async {
        guard let index = publications.firstIndex(where: { $0.id == id }) else { return }
        let before = publications[index]
        publications[index] = UnsentPublication(draft: before.draft, state: .waiting, lastError: nil)
        do {
            try await source.retryPublication(clientMutationId: id)
        } catch {
            FeedbackToastManager.shared.showError(UnsentPublicationsCopy.retryError)
        }
        await load()
    }

    /// Le SEUL chemin par lequel une publication non envoyée quitte
    /// l'appareil sans être publiée.
    func delete(_ id: String) async {
        guard let index = publications.firstIndex(where: { $0.id == id }) else { return }
        let removed = publications.remove(at: index)
        switch await source.cancelPendingPublication(clientMutationId: id) {
        case .removed, .cancelRequested:
            FeedbackToastManager.shared.showSuccess(UnsentPublicationsCopy.deleted)
        case .notFound:
            FeedbackToastManager.shared.showError(UnsentPublicationsCopy.alreadySent)
        case .failed:
            publications.insert(removed, at: min(index, publications.count))
            FeedbackToastManager.shared.showError(UnsentPublicationsCopy.deleteError)
        }
    }
}

enum UnsentPublicationsCopy {
    static var title: String {
        String(localized: "feed.unsent.title", defaultValue: "Publications non envoyées", bundle: .main)
    }
    static func banner(_ count: Int) -> String {
        String(localized: "feed.unsent.banner", defaultValue: "\(count) publication(s) non envoyée(s)", bundle: .main)
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
    static var deleted: String { String(localized: "feed.post.pending.withdrawn", defaultValue: "Envoi annulé", bundle: .main) }
    static var alreadySent: String {
        String(localized: "feed.post.pending.alreadySent", defaultValue: "Cette publication vient de partir. Supprimez-la une fois en ligne.", bundle: .main)
    }
    static var deleteError: String { String(localized: "feed.post.deleteError", defaultValue: "Erreur lors de la suppression", bundle: .main) }
    static var retryError: String {
        String(localized: "feed.unsent.retryError", defaultValue: "Impossible de relancer l'envoi", bundle: .main)
    }
    static func typeLabel(_ type: String) -> String {
        type == "REEL"
            ? String(localized: "feed.unsent.type.reel", defaultValue: "Réel", bundle: .main)
            : String(localized: "feed.unsent.type.post", defaultValue: "Post", bundle: .main)
    }
}
