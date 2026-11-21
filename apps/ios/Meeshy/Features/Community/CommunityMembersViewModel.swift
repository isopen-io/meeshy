import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

@MainActor
final class CommunityMembersViewModel: ObservableObject, CommunityMembersModeling {
    nonisolated deinit {}

    @Published private(set) var members: [APICommunityMember] = []
    @Published private(set) var sections: [CommunityMemberSection] = []
    @Published private(set) var isLoading = false
    @Published private(set) var hasMore = false
    @Published private(set) var isCurrentUserAdmin = false
    @Published private(set) var isMember = false
    @Published private(set) var joinRequests: [APICommunityJoinRequest] = []
    @Published private(set) var hasMoreJoinRequests = false
    @Published private(set) var decidingJoinRequestId: String?
    @Published private(set) var joinRequestNotice: CommunityJoinRequestNotice?

    let communityId: String
    var canInvite: Bool { isMember }
    var isEmpty: Bool { members.isEmpty }

    private var hasLoaded = false
    private var currentOffset = 0
    private let pageSize = 30
    private let service: CommunityServiceProviding
    private let currentUserId: @MainActor () -> String
    private let log = MeeshyLog.logger(.ui)
    private var liveMembers: AnyCancellable?
    private var liveJoinRequests: AnyCancellable?
    private let memberLane = OrderedEventLane()
    private let joinRequestLane = OrderedEventLane()
    private var isSteward = false
    private var joinRequestCursor: String?
    private let joinRequestPageSize = 50

    /// `memberChanges` : `community:member-*` (#18767) — la charge ne nomme la
    /// personne que par son identifiant ; la liste ouverte se RELIT, et la
    /// relecture repasse par les gardes de la passerelle (présence, blocage).
    /// `joinRequested` : `community:join-requested` (#19877), posé chez les
    /// intendants seuls — la liste des demandes se relit de même.
    init(
        communityId: String,
        service: CommunityServiceProviding = CommunityService.shared,
        currentUserId: @escaping @MainActor () -> String = { AuthManager.shared.currentUser?.id ?? "" },
        memberChanges: AnyPublisher<CommunityMemberChange, Never> = CommunityMemberChannel.live,
        joinRequested: AnyPublisher<CommunityJoinRequestedEvent, Never> = CommunityJoinRequestChannel.live
    ) {
        self.communityId = communityId
        self.service = service
        self.currentUserId = currentUserId
        self.liveMembers = memberChanges
            .relay(through: memberLane) { [weak self] change in await self?.apply(change) }
        self.liveJoinRequests = joinRequested
            .relay(through: joinRequestLane) { [weak self] event in await self?.apply(event) }
    }

    /// Une demande arrivée ailleurs : la liste se relit, si l'écran l'a déjà
    /// chargée pour un intendant. Personne d'autre ne la demande.
    func apply(_ event: CommunityJoinRequestedEvent) async {
        guard event.communityId == communityId, hasLoaded, isSteward else { return }
        await reloadJoinRequests()
    }

    /// Une liste jamais chargée ne se charge pas sur un événement : l'écran le fera.
    func apply(_ change: CommunityMemberChange) async {
        guard change.communityId == communityId, hasLoaded else { return }
        await refresh()
    }

    func loadIfNeeded() async {
        guard !hasLoaded else { return }
        await load()
    }

    func refresh() async {
        currentOffset = 0
        hasLoaded = false
        await load()
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        await load(append: true)
    }

    private func setMembers(_ newMembers: [APICommunityMember]) {
        members = newMembers
        sections = CommunityMemberSection.sections(from: newMembers)
    }

    private func load(append: Bool = false) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await service.getMembers(
                communityId: communityId,
                offset: append ? currentOffset : 0,
                limit: pageSize
            )

            if append {
                let known = Set(members.map(\.id))
                setMembers(members + response.data.filter { !known.contains($0.id) })
            } else {
                setMembers(response.data)
            }

            currentOffset = members.count
            hasMore = response.pagination?.hasMore ?? false
            hasLoaded = true

            let readerId = currentUserId()
            let currentMember = members.first { $0.userId == readerId }
            isMember = currentMember != nil
            isCurrentUserAdmin = currentMember?.communityRole.hasMinimumRole(.admin) ?? false
        } catch {
            log.error("[CommunityMembersVM] Error loading: \(error)")
        }
        if !append { await loadStewardship() }
    }

    func updateRole(memberId: String, role: MemberRole) async {
        do {
            _ = try await service.updateMemberRole(
                communityId: communityId,
                memberId: memberId,
                role: role
            )
            await refresh()
        } catch {
            log.error("[CommunityMembersVM] Error updating role: \(error)")
        }
    }

    func removeMember(userId: String) async {
        do {
            try await service.removeMember(communityId: communityId, userId: userId)
            setMembers(members.filter { $0.userId != userId })
        } catch {
            log.error("[CommunityMembersVM] Error removing member: \(error)")
        }
    }

    // MARK: - Demandes d'entrée (#19877)

    /// Qui tranche se lit dans ce que le DÉTAIL sert au lecteur
    /// (`currentUserRole`, `createdBy`), jamais dans une page de membres où il
    /// peut ne pas figurer. La liste n'est demandée qu'à un intendant : tout
    /// autre lecteur recevrait le 404 générique.
    private func loadStewardship() async {
        let readerId = currentUserId()
        guard !readerId.isEmpty, let community = try? await service.get(communityId: communityId) else { return }
        let served = community.currentUserRole.flatMap(MemberRole.init(rawValue:))
        isSteward = community.createdBy == readerId || (served?.hasMinimumRole(.moderator) ?? false)
        guard isSteward else {
            joinRequests = []
            hasMoreJoinRequests = false
            return
        }
        await reloadJoinRequests()
    }

    private func reloadJoinRequests() async {
        guard let page = try? await service.joinRequests(communityId: communityId, cursor: nil, limit: joinRequestPageSize) else { return }
        joinRequests = page.requests
        joinRequestCursor = page.nextCursor
        hasMoreJoinRequests = page.nextCursor != nil
    }

    func loadMoreJoinRequests() async {
        guard isSteward, let cursor = joinRequestCursor,
              let page = try? await service.joinRequests(communityId: communityId, cursor: cursor, limit: joinRequestPageSize) else { return }
        let known = Set(joinRequests.map(\.id))
        joinRequests += page.requests.filter { !known.contains($0.id) }
        joinRequestCursor = page.nextCursor
        hasMoreJoinRequests = page.nextCursor != nil
    }

    /// OPTIMISTE : la ligne quitte la liste au geste. Accepter fait entrer le
    /// membre que la passerelle sert ; un 404 dit que la demande n'est plus
    /// tranchable par ce lecteur (déjà tranchée, blocage, compte fermé) — la
    /// ligne reste partie et tout se relit ; toute autre erreur rend la liste
    /// EXACTEMENT telle qu'elle était.
    func decide(_ request: APICommunityJoinRequest, _ decision: CommunityJoinRequestDecision) async {
        guard isSteward, decidingJoinRequestId == nil else { return }
        let snapshot = joinRequests
        decidingJoinRequestId = request.id
        joinRequestNotice = nil
        joinRequests.removeAll { $0.id == request.id }
        defer { decidingJoinRequestId = nil }
        do {
            let entered = try await service.decideJoinRequest(communityId: communityId, requestId: request.id, decision: decision)
            if decision == .accept {
                joinRequestNotice = .accepted(name: request.name)
                if let entered, !members.contains(where: { $0.userId == entered.userId }) { setMembers(members + [entered]) }
            }
        } catch let error where Self.isGone(error) {
            joinRequestNotice = .gone
            await refresh()
        } catch {
            joinRequests = snapshot
            joinRequestNotice = .failed
            log.error("[CommunityMembersVM] Error deciding join request: \(error)")
        }
    }

    private static func isGone(_ error: Error) -> Bool {
        if case .server(404, _) = MeeshyError.from(error) { return true }
        return false
    }
}
