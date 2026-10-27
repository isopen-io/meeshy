import Foundation
import Combine
import MeeshySDK

/// **Les publications encore sur l'appareil** (#13415) : un post ou un réel
/// que le serveur n'a pas confirmé y reste jusqu'à sa confirmation ou au geste
/// « Supprimer » de son auteur. Chaque action répond tout de suite ; la file
/// confirme ensuite, et un refus remet la ligne à sa place.
@MainActor
final class UnsentPublicationsViewModel: ObservableObject {
    @Published private(set) var publications: [UnsentPublication] = []
    @Published private(set) var hasLoaded = false
    @Published private(set) var reopenable: Set<String> = []

    private let source: UnsentPublicationsSource
    private let drafts: UnsentPublicationDrafts

    init(source: UnsentPublicationsSource = UnsentPublicationsLive.source,
         drafts: UnsentPublicationDrafts = UnsentPublicationsLive.drafts) {
        self.source = source
        self.drafts = drafts
    }

    var count: Int { publications.count }

    /// Relit la file — et retire le brouillon gardé d'une publication dont la
    /// ligne est partie : confirmée par le serveur, ou supprimée.
    func load() async {
        publications = await source.unsentPublications()
        let enFile = Set(publications.map(\.id))
        let ranges = drafts.parkedPublicationIds()
        ranges.subtracting(enFile).forEach(drafts.discardDraft(of:))
        reopenable = ranges.intersection(enFile)
        hasLoaded = true
    }

    func canReopen(_ id: String) -> Bool {
        reopenable.contains(id)
    }

    /// Retire la publication de la file et rend son brouillon au meuble —
    /// jamais par-dessus un brouillon déjà ouvert.
    func reopen(_ id: String) async -> UnsentPublicationReopening {
        guard reopenable.contains(id) else { return .failed }
        guard drafts.canReopen() else { return .composerBusy }
        switch await source.cancelPendingPublication(clientMutationId: id) {
        case .removed:
            drafts.reopen(id)
            publications.removeAll { $0.id == id }
            reopenable.remove(id)
            return .reopened
        case .cancelRequested, .notFound:
            await load()
            return .alreadySending
        case .failed:
            return .failed
        }
    }

    /// `false` si la file n'a pas pu réarmer la ligne.
    @discardableResult
    func retry(_ id: String) async -> Bool {
        guard let index = publications.firstIndex(where: { $0.id == id }) else { return false }
        let before = publications[index]
        publications[index] = UnsentPublication(draft: before.draft, state: .waiting, lastError: nil)
        let rearmed = (try? await source.retryPublication(clientMutationId: id)) != nil
        await load()
        return rearmed
    }

    /// Le SEUL chemin par lequel une publication non envoyée quitte
    /// l'appareil sans être publiée.
    @discardableResult
    func delete(_ id: String) async -> PublicationCancellation {
        guard let index = publications.firstIndex(where: { $0.id == id }) else { return .notFound }
        let removed = publications.remove(at: index)
        let verdict = await source.cancelPendingPublication(clientMutationId: id)
        switch verdict {
        case .removed, .cancelRequested:
            drafts.discardDraft(of: id)
            reopenable.remove(id)
        case .notFound:
            break
        case .failed:
            publications.insert(removed, at: min(index, publications.count))
        }
        return verdict
    }
}

