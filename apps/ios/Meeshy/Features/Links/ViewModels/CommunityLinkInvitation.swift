import Foundation
import MeeshySDK

/// Une personne qu'on peut inviter depuis le lien d'une communauté (planche `Lien-Communaute`, #19505) : un ami
/// accepté, lu dans le cache des amis, qui n'est pas déjà connu comme membre.
nonisolated struct CommunityInviteCandidate: Equatable, Sendable, Identifiable {
    let id: String
    let name: String
    let avatar: String?
    let ring: ServedProfileDecorItem?

    init(id: String, name: String, avatar: String?, ring: ServedProfileDecorItem? = nil) {
        self.id = id
        self.name = name
        self.avatar = avatar
        self.ring = ring
    }

    /// Le prénom sous l'avatar de la rangée : le premier mot du nom.
    var shortName: String {
        name.split(separator: " ").first.map(String.init) ?? name
    }
}

/// Ce qu'un envoi d'invitations a donné : combien sont parties, combien sont revenues.
nonisolated struct CommunityInviteOutcome: Equatable, Sendable {
    let sent: Int
    let failed: Int

    static let nothing = CommunityInviteOutcome(sent: 0, failed: 0)
}

// MARK: - Envoyer l'invitation

extension CommunityLinkDetailViewModel {

    /// La passerelle laisse inviter à une communauté fermée ses admins et ses modérateurs, et à une communauté
    /// ouverte tout membre (`POST /communities/:id/invite`). Avant la lecture de la communauté, rien n'est offert.
    var canInvite: Bool {
        guard details != nil else { return false }
        return stewardship != .member || isClosed == false
    }

    /// Mes amis, sans moi, sans les membres que la fiche connaît déjà, sans ceux qu'on vient d'inviter.
    var inviteCandidates: [CommunityInviteCandidate] {
        let members = Set(loadedEntries?.entries.map(\.userId) ?? [])
        return friends.filter { candidate in
            candidate.id != viewerId && !members.contains(candidate.id) && !invitedIds.contains(candidate.id)
        }
    }

    func toggleInvitee(_ id: String) {
        guard inviteCandidates.contains(where: { $0.id == id }) else { return }
        chosenInviteeIds = chosenInviteeIds.contains(id)
            ? chosenInviteeIds.filter { $0 != id }
            : chosenInviteeIds + [id]
    }

    func setChosenInvitees(_ ids: [String]) {
        let allowed = Set(inviteCandidates.map(\.id))
        chosenInviteeIds = ids.filter { allowed.contains($0) }
    }

    /// Optimiste : les personnes choisies quittent la rangée tout de suite ; celles que le serveur refuse y
    /// reviennent, encore choisies, pour qu'un second geste suffise.
    func inviteChosen() async -> CommunityInviteOutcome {
        let allowed = Set(inviteCandidates.map(\.id))
        let chosen = chosenInviteeIds.filter { allowed.contains($0) }
        guard canInvite, !chosen.isEmpty else { return .nothing }
        invitedIds.formUnion(chosen)
        chosenInviteeIds = []
        let refused = await Self.send(chosen, to: link.id, through: inviteUser)
        invitedIds.subtract(refused)
        chosenInviteeIds = chosen.filter { refused.contains($0) }
        return CommunityInviteOutcome(sent: chosen.count - refused.count, failed: refused.count)
    }

    nonisolated private static func send(
        _ userIds: [String],
        to communityId: String,
        through invite: @escaping @Sendable (String, String) async throws -> Void
    ) async -> Set<String> {
        await withTaskGroup(of: String?.self) { group in
            for userId in userIds {
                group.addTask {
                    do {
                        try await invite(communityId, userId)
                        return nil
                    } catch {
                        return userId
                    }
                }
            }
            var refused: Set<String> = []
            for await failure in group {
                if let failure { refused.insert(failure) }
            }
            return refused
        }
    }
}
