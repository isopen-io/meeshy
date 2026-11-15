import Foundation

/// `call:participant-joined` et `call:participant-left` (serveur → client).
///
/// Les deux événements n'ont pas la même forme : l'arrivée porte le membre SOUS
/// `participant` (`CallParticipantJoinedEvent`, `packages/shared/types/video-call.ts`),
/// le départ le porte à plat (`CallParticipantLeftEvent`). Le décodeur lit les
/// deux — la forme plate l'emporte quand les deux sont présentes. Sorti de
/// `MessageSocketManager.swift` (hors budget) au lot #3585, qui en a besoin pour
/// nommer chaque membre d'un appel de groupe.
public struct CallParticipantData: Decodable, Sendable {
    public let callId: String
    public let participantId: String?
    public let userId: String?
    public let mode: String?
    public let iceServers: [SocketIceServer]?
    public let username: String?
    public let displayName: String?
    public let avatar: String?
    public let isAudioEnabled: Bool?
    public let isVideoEnabled: Bool?

    public init(
        callId: String,
        participantId: String? = nil,
        userId: String? = nil,
        mode: String? = nil,
        iceServers: [SocketIceServer]? = nil,
        username: String? = nil,
        displayName: String? = nil,
        avatar: String? = nil,
        isAudioEnabled: Bool? = nil,
        isVideoEnabled: Bool? = nil
    ) {
        self.callId = callId
        self.participantId = participantId
        self.userId = userId
        self.mode = mode
        self.iceServers = iceServers
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.isAudioEnabled = isAudioEnabled
        self.isVideoEnabled = isVideoEnabled
    }

    private enum CodingKeys: String, CodingKey {
        case callId, participantId, userId, mode, iceServers, participant
    }

    private struct Member: Decodable {
        let id: String?
        let participantId: String?
        let userId: String?
        let username: String?
        let displayName: String?
        let avatar: String?
        let isAudioEnabled: Bool?
        let isVideoEnabled: Bool?
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let member = try? container.decodeIfPresent(Member.self, forKey: .participant)
        callId = try container.decode(String.self, forKey: .callId)
        participantId = try container.decodeIfPresent(String.self, forKey: .participantId)
            ?? member?.participantId
        userId = try container.decodeIfPresent(String.self, forKey: .userId) ?? member?.userId
        mode = try container.decodeIfPresent(String.self, forKey: .mode)
        iceServers = try? container.decodeIfPresent([SocketIceServer].self, forKey: .iceServers)
        username = member?.username
        displayName = member?.displayName
        avatar = member?.avatar
        isAudioEnabled = member?.isAudioEnabled
        isVideoEnabled = member?.isVideoEnabled
    }
}

/// `call:media-toggled` (serveur → client) : un AUTRE membre a basculé son
/// micro, sa caméra ou son partage d'écran (`mediaType` : `audio` / `video` /
/// `screen`). `userId` (Vague 140 passerelle) nomme le membre dans un appel de
/// groupe ; `participantId` est la clé héritée.
public struct CallMediaToggleData: Decodable, Sendable {
    public let callId: String
    public let participantId: String?
    public let userId: String?
    public let mediaType: String
    public let enabled: Bool

    public init(callId: String, participantId: String? = nil, userId: String? = nil, mediaType: String, enabled: Bool) {
        self.callId = callId
        self.participantId = participantId
        self.userId = userId
        self.mediaType = mediaType
        self.enabled = enabled
    }
}
