import SwiftUI
import MeeshySDK

// MARK: - Ce que la face Liens d'un autre montre au-delà de ses adresses (#19444 — planche `Autre-Liens`)
//
// Sous « Ses adresses », ce que mon cercle tient fermé ne se montre pas (#19674). Puis « Ses communautés ouvertes » : un
// billet de rangée (K30) par communauté publique, son adresse, ses membres, et au talon « Rejoindre » ou « Tu en fais
// partie ». Rien n'est déduit ici : sans champ servi (#19274), rien ne se montre.

/// Rejoindre une communauté depuis la fiche : l'appartenance se montre AVANT la réponse du serveur, et se défait sur
/// un refus. Un second geste pendant l'attente ne part pas.
nonisolated struct RelationCommunityJoins: Equatable, Sendable {
    private(set) var joined: Set<String> = []
    private(set) var pending: Set<String> = []

    func isMember(_ community: ProfileOpenCommunity) -> Bool {
        community.isReaderMember || joined.contains(community.id)
    }

    func isPending(_ id: String) -> Bool { pending.contains(id) }

    mutating func begin(_ community: ProfileOpenCommunity) -> Bool {
        guard !pending.contains(community.id), !isMember(community) else { return false }
        joined.insert(community.id)
        pending.insert(community.id)
        return true
    }

    mutating func settle(_ id: String, succeeded: Bool) {
        pending.remove(id)
        if !succeeded { joined.remove(id) }
    }
}

/// La porte que l'app ouvre vers une communauté (son identifiant serveur). `nil` : le billet d'une communauté dont je
/// fais partie ne s'ouvre pas.
public struct ProfileCommunityDoor {
    public let open: (String) -> Void

    public init(open: @escaping (String) -> Void) {
        self.open = open
    }
}

private struct ProfileCommunityDoorKey: EnvironmentKey {
    static let defaultValue: ProfileCommunityDoor? = nil
}

public extension EnvironmentValues {
    /// Ouvrir une communauté depuis la fiche d'un autre ; l'app la pose, la fiche se referme d'abord.
    var profileCommunityDoor: ProfileCommunityDoor? {
        get { self[ProfileCommunityDoorKey.self] }
        set { self[ProfileCommunityDoorKey.self] = newValue }
    }
}

/// « Ses communautés ouvertes » : un billet par communauté, « Rejoindre » au talon, ou « Tu en fais partie ».
struct RelationOpenCommunitiesSection: View {
    let communities: [ProfileOpenCommunity]
    let tint: Color
    let join: (String) async -> Bool
    let onOpen: ((String) -> Void)?

    @State private var joins = RelationCommunityJoins()

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: RelationLinksReachCopy.communitiesTitle)
            ForEach(communities) { community in
                ticket(community)
            }
        }
        .accessibilityIdentifier("profile.relation.links.communities")
    }

    private func ticket(_ community: ProfileOpenCommunity) -> some View {
        let isMember = joins.isMember(community)
        let press: (() -> Void)? = isMember && onOpen != nil ? { onOpen?(community.id) } : nil
        return MeeshyTicket(
            title: community.name,
            code: community.displayAddress,
            tint: tint,
            systemImage: "person.3.fill",
            size: .row,
            statusLabel: RelationLinksReachCopy.status(of: community, isMember: isMember),
            onPress: press,
            stub: { stub(community, isMember: isMember) },
            leading: { EmptyView() },
            trailing: { chevron(isShown: press != nil) },
            status: { EmptyView() },
            back: { EmptyView() }
        )
        .accessibilityIdentifier("profile.relation.links.community.\(community.id)")
    }

    @ViewBuilder
    private func stub(_ community: ProfileOpenCommunity, isMember: Bool) -> some View {
        if isMember {
            Label(RelationLinksReachCopy.member, systemImage: "checkmark")
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
        } else {
            if let count = community.memberCount {
                Text(ProfileInCommonCopy.members(count))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            Spacer(minLength: MeeshySpacing.sm)
            MeeshyButton(RelationLinksReachCopy.join, kind: .accent, size: .s44, tint: tint,
                         isPending: joins.isPending(community.id), action: { start(community) })
                .accessibilityHint(Text(community.name))
        }
    }

    @ViewBuilder
    private func chevron(isShown: Bool) -> some View {
        if isShown {
            Image(systemName: "chevron.right")
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
    }

    private func start(_ community: ProfileOpenCommunity) {
        guard joins.begin(community) else { return }
        let id = community.id
        Task {
            let succeeded = await join(id)
            joins.settle(id, succeeded: succeeded)
        }
    }
}

/// Les mots de ce que la face Liens d'un autre montre au-delà de ses adresses (#19444).
enum RelationLinksReachCopy {
    static var communitiesTitle: String {
        String(localized: "profile.relation.links.communities", defaultValue: "Ses communautés ouvertes", bundle: .module)
    }
    static var join: String {
        String(localized: "profile.relation.links.communities.join", defaultValue: "Rejoindre", bundle: .module)
    }
    static var member: String {
        String(localized: "profile.relation.links.communities.member", defaultValue: "Tu en fais partie", bundle: .module)
    }
    static func status(of community: ProfileOpenCommunity, isMember: Bool) -> String? {
        if isMember { return member }
        return community.memberCount.map { ProfileInCommonCopy.members($0) }
    }
}
