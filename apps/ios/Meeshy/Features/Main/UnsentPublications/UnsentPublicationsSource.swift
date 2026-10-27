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
        type == "REEL"
            ? String(localized: "feed.unsent.type.reel", defaultValue: "Réel", bundle: .main)
            : String(localized: "feed.unsent.type.post", defaultValue: "Post", bundle: .main)
    }
}
