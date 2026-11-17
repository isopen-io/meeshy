import Foundation
import Combine
import MeeshySDK

/// Ce que la fiche apprend de la communauté elle-même : qui peut entrer, le rôle du lecteur, le compte des membres,
/// et de quoi ouvrir ses réglages.
nonisolated struct CommunityLinkDetails: Equatable, Sendable {
    let isPrivate: Bool
    let role: String?
    let memberCount: Int?
    let avatar: String?
    let settingsCommunity: MeeshyCommunity?

    init(isPrivate: Bool, role: String?, memberCount: Int?, avatar: String?, settingsCommunity: MeeshyCommunity?) {
        self.isPrivate = isPrivate
        self.role = role
        self.memberCount = memberCount
        self.avatar = avatar
        self.settingsCommunity = settingsCommunity
    }

    init(community: APICommunity) {
        self.init(isPrivate: community.isPrivate, role: community.currentUserRole,
                  memberCount: community.memberCount ?? community._count?.members, avatar: community.avatar,
                  settingsCommunity: community.toCommunity())
    }
}

/// Les entrées du lien : en chemin, servies, ou introuvables.
nonisolated enum CommunityLinkEntriesState: Equatable, Sendable {
    case loading
    case loaded(CommunityLinkEntries)
    case failed
}

/// La fiche d'un lien de communauté (planche `Lien-Communaute`, #18871). Le lien s'affiche tout de suite depuis la
/// ligne qui l'a ouvert ; la communauté et ses arrivées viennent ensuite, sans jamais bloquer la fiche.
@MainActor
final class CommunityLinkDetailViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage hors d'une tâche.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    @Published private(set) var details: CommunityLinkDetails?
    @Published private(set) var entries: CommunityLinkEntriesState = .loading
    @Published private(set) var isClosed: Bool?

    let link: CommunityLink
    private let viewerId: String?
    private let loadDetails: @Sendable (String) async throws -> CommunityLinkDetails
    private let loadEntries: @Sendable (String) async throws -> [CommunityLinkEntry]
    private let setPrivate: @Sendable (String, Bool) async throws -> Void

    init(link: CommunityLink,
         viewerId: String?,
         loadDetails: @escaping @Sendable (String) async throws -> CommunityLinkDetails,
         loadEntries: @escaping @Sendable (String) async throws -> [CommunityLinkEntry],
         setPrivate: @escaping @Sendable (String, Bool) async throws -> Void) {
        self.link = link
        self.viewerId = viewerId
        self.loadDetails = loadDetails
        self.loadEntries = loadEntries
        self.setPrivate = setPrivate
    }

    var memberCount: Int { details?.memberCount ?? link.memberCount }

    var stewardship: CommunityLinkStewardship { CommunityLinkStewardship(role: details?.role) }

    var loadedEntries: CommunityLinkEntries? {
        guard case .loaded(let loaded) = entries else { return nil }
        return loaded
    }

    func load() async {
        let id = link.id
        let loadDetails = self.loadDetails
        let loadEntries = self.loadEntries
        async let detailsFetch = try? loadDetails(id)
        async let entriesFetch = try? loadEntries(id)
        let (fetchedDetails, fetchedEntries) = await (detailsFetch, entriesFetch)
        if let fetchedDetails {
            details = fetchedDetails
            isClosed = fetchedDetails.isPrivate
        }
        if let fetchedEntries {
            entries = .loaded(CommunityLinkEntries(entries: fetchedEntries, excludingUserId: viewerId))
        } else if loadedEntries == nil {
            entries = .failed
        }
    }

    /// Optimiste : les entrées se ferment (ou rouvrent) tout de suite, et reviennent si le serveur refuse.
    func setEntriesClosed(_ closed: Bool) async -> Bool {
        guard let previous = isClosed else { return false }
        guard previous != closed else { return true }
        isClosed = closed
        do {
            try await setPrivate(link.id, closed)
            return true
        } catch {
            isClosed = previous
            return false
        }
    }
}
