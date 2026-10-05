import Foundation

// `call:initiated` — un appel qui sonne chez moi. Sorti de
// `MessageSocketManager.swift`, hors budget de taille, pour recevoir #8433.

public struct CallOfferData: Decodable, Sendable {
    public let callId: String
    public let conversationId: String
    /// Architecture mode (`"p2p"` or `"sfu"`). NOT the media type — see `type`.
    public let mode: String?
    /// Media type (`"audio"` or `"video"`). Drives CallKit `hasVideo`.
    /// Optional for backwards compatibility with older gateway builds that
    /// did not include this field; absence is treated as audio call.
    public let type: String?
    public let initiator: CallInitiatorInfo
    public let iceServers: [SocketIceServer]?
    /// Audit P1-26 — initial participant list emitted by the gateway in
    /// `call:initiated`. Optional for backwards compat with older builds.
    /// Lets the iOS UI show all participants during the ringing phase
    /// rather than waiting for `call:participant-joined` events.
    public let participants: [CallParticipantInfo]?
    /// `"direct"` | `"group"` (#3585) — absent d'une passerelle ancienne.
    public let conversationType: String?
    public let conversationTitle: String?
    /// #8433 — la personne qui m'invite dans un appel DÉJÀ en cours : l'écran
    /// entrant et CallKit disent « X vous invite à un appel de groupe ».
    public let invitedBy: CallInitiatorInfo?
    /// #8433 — vrai pour une invitation : l'appel est (ou devient) de groupe.
    public let isGroup: Bool?

    public struct CallInitiatorInfo: Decodable, Sendable {
        public let userId: String
        public let username: String
        public let displayName: String?
        public let avatar: String?
    }

    public struct CallParticipantInfo: Decodable, Sendable {
        public let id: String
        public let userId: String?
        public let role: String?
        public let isAudioEnabled: Bool?
        public let isVideoEnabled: Bool?
        public let username: String?
        public let displayName: String?
        public let avatar: String?
    }
}
