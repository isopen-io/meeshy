import Foundation
import MeeshySDK

/// État d'une connexion vers UN membre d'un appel de groupe (#3585).
enum GroupCallLinkState: Equatable, Sendable {
    case connecting
    case connected
    case reconnecting
}

/// Ce qu'un membre peut basculer : `call:media-toggled.mediaType`.
enum GroupCallMediaKind: String, Equatable, Sendable {
    case audio
    case video
    case screen
}

/// Un membre DISTANT d'un appel de groupe, tel que la grille le dessine.
struct GroupCallMember: Equatable, Identifiable, Sendable {
    let userId: String
    let displayName: String
    let avatarURL: String?
    let isPrimary: Bool
    let isMicMuted: Bool
    let isCameraOn: Bool
    let isScreenSharing: Bool
    let link: GroupCallLinkState

    var id: String { userId }

    func with(
        displayName: String? = nil,
        avatarURL: String? = nil,
        isPrimary: Bool? = nil,
        isMicMuted: Bool? = nil,
        isCameraOn: Bool? = nil,
        isScreenSharing: Bool? = nil,
        link: GroupCallLinkState? = nil
    ) -> GroupCallMember {
        GroupCallMember(
            userId: userId,
            displayName: displayName ?? self.displayName,
            avatarURL: avatarURL ?? self.avatarURL,
            isPrimary: isPrimary ?? self.isPrimary,
            isMicMuted: isMicMuted ?? self.isMicMuted,
            isCameraOn: isCameraOn ?? self.isCameraOn,
            isScreenSharing: isScreenSharing ?? self.isScreenSharing,
            link: link ?? self.link
        )
    }
}

/// Une arrivée annoncée par `call:participant-joined` (ou découverte par un
/// signal d'un membre déjà présent quand on rejoint).
struct GroupCallArrival: Equatable, Sendable {
    let userId: String
    let displayName: String?
    let avatarURL: String?
    let isAudioEnabled: Bool?
    let isVideoEnabled: Bool?

    init(userId: String, displayName: String? = nil, avatarURL: String? = nil, isAudioEnabled: Bool? = nil, isVideoEnabled: Bool? = nil) {
        self.userId = userId
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.isAudioEnabled = isAudioEnabled
        self.isVideoEnabled = isVideoEnabled
    }

    init?(_ event: CallParticipantData) {
        guard let userId = event.userId, !userId.isEmpty else { return nil }
        self.init(
            userId: userId,
            displayName: event.displayName ?? event.username,
            avatarURL: event.avatar,
            isAudioEnabled: event.isAudioEnabled,
            isVideoEnabled: event.isVideoEnabled
        )
    }
}

/// Les membres DISTANTS d'un appel de groupe, dans l'ordre d'arrivée (la
/// grille ne se réagence pas quand quelqu'un parle). Valeur immuable : chaque
/// changement rend un nouveau registre.
///
/// Le plafond est celui de la passerelle (`CallRules.maxParticipants`, moi
/// compris) : un maillage sans SFU ne tient pas au-delà.
struct GroupCallRoster: Equatable, Sendable {
    let localUserId: String
    let capacity: Int
    let members: [GroupCallMember]

    init(localUserId: String, capacity: Int = CallRules.maxParticipants, members: [GroupCallMember] = []) {
        self.localUserId = localUserId
        self.capacity = capacity
        self.members = members
    }

    /// Participants de l'appel, moi compris.
    var participantCount: Int { members.count + 1 }

    var isFull: Bool { participantCount >= capacity }

    func member(_ userId: String) -> GroupCallMember? {
        members.first { $0.userId == userId }
    }

    func contains(_ userId: String) -> Bool { member(userId) != nil }

    /// Admet (ou enrichit) un membre. Moi-même, un identifiant vide ou un
    /// arrivant au-delà du plafond ne sont jamais admis.
    func admitting(_ arrival: GroupCallArrival, isPrimary: Bool = false) -> GroupCallRoster {
        guard !arrival.userId.isEmpty, arrival.userId != localUserId else { return self }
        if let existing = member(arrival.userId) {
            return replacing(existing.with(
                displayName: arrival.displayName.flatMap { $0.isEmpty ? nil : $0 },
                avatarURL: arrival.avatarURL,
                isPrimary: isPrimary || existing.isPrimary,
                isMicMuted: arrival.isAudioEnabled.map { !$0 },
                isCameraOn: arrival.isVideoEnabled
            ))
        }
        guard !isFull else { return self }
        let member = GroupCallMember(
            userId: arrival.userId,
            displayName: arrival.displayName ?? "",
            avatarURL: arrival.avatarURL,
            isPrimary: isPrimary,
            isMicMuted: arrival.isAudioEnabled.map { !$0 } ?? false,
            isCameraOn: arrival.isVideoEnabled ?? false,
            isScreenSharing: false,
            link: .connecting
        )
        return GroupCallRoster(localUserId: localUserId, capacity: capacity, members: members + [member])
    }

    /// #9091 — le nom d'un groupe qui continue sans son principal : son titre
    /// s'il en a un, sinon ses membres restants, « Ada, Bruno +2 » comme une
    /// ligne du journal des appels (iOS `CallsTab`, web `participantsLine`).
    func callTitle(groupTitle: String?) -> String {
        if let title = groupTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty { return title }
        let unknown = String(localized: "call.group.tile.unknown", defaultValue: "Participant", bundle: .main)
        let names = members.map { $0.displayName.isEmpty ? unknown : $0.displayName }
        guard !names.isEmpty else {
            return String(localized: "call.group.stage", defaultValue: "Participants à l'appel", bundle: .main)
        }
        let shown = names.prefix(Self.titledMembers).joined(separator: ", ")
        let more = names.count - Self.titledMembers
        guard more > 0 else { return shown }
        return String(format: String(localized: "calls.participants.more", defaultValue: "%@ +%lld", bundle: .main), shown, more)
    }

    private static let titledMembers = 2

    func removing(_ userId: String) -> GroupCallRoster {
        GroupCallRoster(localUserId: localUserId, capacity: capacity, members: members.filter { $0.userId != userId })
    }

    func applying(_ kind: GroupCallMediaKind, enabled: Bool, for userId: String) -> GroupCallRoster {
        guard let existing = member(userId) else { return self }
        switch kind {
        case .audio: return replacing(existing.with(isMicMuted: !enabled))
        case .video: return replacing(existing.with(isCameraOn: enabled))
        case .screen: return replacing(existing.with(isScreenSharing: enabled))
        }
    }

    func updatingLink(_ state: GroupCallLinkState, for userId: String) -> GroupCallRoster {
        guard let existing = member(userId) else { return self }
        return replacing(existing.with(link: state))
    }

    private func replacing(_ member: GroupCallMember) -> GroupCallRoster {
        GroupCallRoster(
            localUserId: localUserId,
            capacity: capacity,
            members: members.map { $0.userId == member.userId ? member : $0 }
        )
    }
}
