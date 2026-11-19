import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class CommunityDetailViewModel: ObservableObject, CommunityDetailModeling {
    nonisolated deinit {}

    @Published var community: MeeshyCommunity?
    @Published var conversations: [APIConversation] = [] {
        didSet { conversationTitles = communityConversationTitles(conversations, readerId: currentUserId()) }
    }
    @Published private(set) var conversationTitles: [String: String] = [:]
    @Published var isMember = false
    @Published var isCreator = false
    @Published var isAdmin = false
    @Published var currentUserRole: MemberRole = .member
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published private(set) var loadFailure: CommunityLoadFailure?

    let communityId: String
    private let service: CommunityServiceProviding
    private let currentUserId: @MainActor () -> String
    private let postsCache: @MainActor () async -> CommunityPostsCache?
    private let myCommunities: MyCommunitiesWrites
    private var liveUpdates: AnyCancellable?
    private var liveMembers: AnyCancellable?
    private var liveDeletions: AnyCancellable?
    private let memberLane = OrderedEventLane()

    /// `communityUpdates` : `community:updated` (#18439) réécrit l'identité
    /// affichée — nom, description, avatar, bannière, confidentialité,
    /// effectif — sans relance réseau ni toucher au rôle du lecteur.
    /// `memberChanges` : `community:member-*` (#18767) recopie l'effectif et
    /// fait suivre le rôle du lecteur quand le geste le concerne.
    /// `deletions` : `community:deleted` (#19591) rend la fiche indisponible
    /// sur-le-champ, puis la relit en silence.
    init(
        communityId: String,
        service: CommunityServiceProviding = CommunityService.shared,
        currentUserId: @escaping @MainActor () -> String = { AuthManager.shared.currentUser?.id ?? "" },
        postsCache: @escaping @MainActor () async -> CommunityPostsCache? = { nil },
        communityUpdates: AnyPublisher<CommunityUpdatedEvent, Never> = CommunityUpdateChannel.live,
        memberChanges: AnyPublisher<CommunityMemberChange, Never> = CommunityMemberChannel.live,
        deletions: AnyPublisher<String, Never> = CommunityDeletedChannel.live,
        myCommunities: MyCommunitiesWrites = .live
    ) {
        self.communityId = communityId
        self.service = service
        self.currentUserId = currentUserId
        self.postsCache = postsCache
        self.myCommunities = myCommunities
        self.liveUpdates = communityUpdates
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.apply(event) }
        self.liveMembers = memberChanges
            .relay(through: memberLane) { [weak self] change in await self?.apply(change) }
        self.liveDeletions = deletions
            .relay(through: memberLane) { [weak self] communityId in await self?.applyDisappearance(of: communityId) }
    }

    /// La communauté regardée a été supprimée ou désactivée : l'écran dit
    /// aussitôt qu'elle n'est plus disponible — plus aucun geste n'est offert —,
    /// oublie ses canaux et ses publications gardées, la retire de « mes
    /// communautés », puis la relit sans indicateur (un compte qui la lit
    /// encore la retrouve).
    func applyDisappearance(of disappearedId: String) async {
        guard disappearedId == communityId else { return }
        community = nil
        conversations = []
        isCreator = false
        adopt(role: nil)
        loadFailure = .refused
        await forgetCachedPosts()
        await myCommunities.remove(communityId)
        await loadServed(showsProgress: false)
    }

    func apply(_ event: CommunityUpdatedEvent) {
        guard let updated = community?.applying(event) else { return }
        community = updated
    }

    /// Un tiers : l'effectif seul. Le lecteur : son rôle suit — promu, il
    /// gère ; sorti (d'un autre appareil, ou retiré), il perd ses droits, ses
    /// canaux et les publications gardées, et la fiche se relit (une
    /// communauté privée cesse de lui être servie) ; entré d'ailleurs, la
    /// fiche se relit pour servir ce qu'un membre lit.
    func apply(_ change: CommunityMemberChange) async {
        guard change.communityId == communityId else { return }
        if let updated = community?.applying(change) { community = updated }
        guard change.concerns(readerId: currentUserId()) else { return }
        let wasMember = isMember
        adopt(role: change.role)
        switch (wasMember, isMember) {
        case (true, false):
            conversations = []
            await forgetCachedPosts()
            await myCommunities.remove(communityId)
            await loadServed()
        case (false, true):
            await forgetCachedPosts()
            if let joined = await loadServed(), isMember { await myCommunities.add(joined) }
        default:
            return
        }
    }

    func load() async {
        await loadServed()
    }

    /// Ce que le serveur sert de la communauté, `nil` sur un échec.
    @discardableResult
    private func loadServed(showsProgress: Bool = true) async -> APICommunity? {
        if showsProgress { isLoading = true }
        defer { if showsProgress { isLoading = false } }

        do {
            let apiCommunity = try await service.get(communityId: communityId)
            community = apiCommunity.toCommunity()
            applyMembership(of: apiCommunity)
            loadFailure = nil

            if isMember {
                conversations = try await service.getConversations(communityId: communityId)
            }
            return apiCommunity
        } catch {
            loadFailure = Self.loadFailure(for: error)
            return nil
        }
    }

    /// #7816 — la cause d'un échec se lit par la loi unique de l'app
    /// (`ContentFetchFailure.classify`), jamais par le message brut du serveur.
    nonisolated static func loadFailure(for error: Error) -> CommunityLoadFailure {
        switch ContentFetchFailure.classify(error) {
        case .forbidden, .notFound: return .refused
        case .network: return .network
        case .server: return .server
        }
    }

    /// `currentUserRole` (servi par le détail depuis #6378) fait foi ; `members`
    /// n'est lu que si un ancien serveur le portait, puis le créateur vaut admin.
    private func applyMembership(of apiCommunity: APICommunity) {
        let readerId = currentUserId()
        let creatorMatch = apiCommunity.createdBy == readerId
        let servedRole = apiCommunity.currentUserRole.flatMap(MemberRole.init(rawValue:))
        let recordRole = apiCommunity.members?.first(where: { $0.userId == readerId })?.communityRole
        isCreator = creatorMatch
        adopt(role: servedRole ?? recordRole)
    }

    /// Le créateur vaut admin quand aucun rôle n'est tenu.
    private func adopt(role served: MemberRole?) {
        let role = served ?? (isCreator ? .admin : nil)
        isMember = role != nil
        currentUserRole = role ?? .member
        isAdmin = currentUserRole.hasMinimumRole(.admin) || isCreator
    }

    func joinCommunity() async {
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await service.join(communityId: communityId)
            await forgetCachedPosts()
            // #18935 — la bande Communautés et le partage la voient au retour.
            if let joined = await loadServed(), isMember { await myCommunities.add(joined) }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func leaveCommunity() async {
        do {
            try await service.leave(communityId: communityId)
            await forgetCachedPosts()
            await myCommunities.remove(communityId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// #16878 — les publications de l'onglet sont lues sous le rôle du
    /// lecteur : un départ ne laisse pas celles d'une communauté privée sur
    /// l'appareil, une adhésion fait relire ce qu'un membre peut lire.
    private func forgetCachedPosts() async {
        await postsCache()?.invalidate(for: CommunityPostsViewModel.cacheKey(communityId: communityId))
    }
}
