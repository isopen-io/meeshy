import Foundation
import SocketIO
import Combine
import os

// MARK: - Call Signaling Event Data

public struct SocketIceServer: Decodable, Sendable {
    public let urls: IceServerURLs
    public let username: String?
    public let credential: String?

    public enum IceServerURLs: Decodable, Sendable {
        case single(String)
        case multiple([String])

        public init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let str = try? container.decode(String.self) {
                self = .single(str)
            } else {
                self = .multiple(try container.decode([String].self))
            }
        }

        public var asArray: [String] {
            switch self {
            case .single(let url): return [url]
            case .multiple(let urls): return urls
            }
        }
    }
}

public struct CallIceServersRefreshedData: Decodable, Sendable {
    public let callId: String
    public let iceServers: [SocketIceServer]
    public let ttl: Int
}

public struct CallAnswerData: Decodable, Sendable {
    public let callId: String
    public let signal: CallSignalPayload
}

public struct CallSignalPayload: Decodable, Sendable {
    public let type: String
    public let sdp: String?
    public let candidate: String?
    public let sdpMLineIndex: Int?
    public let sdpMid: String?
    public let from: String?
    public let to: String?
    /// §3.5 — negotiation epoch. Monotonic per peer; the receiver drops any
    /// SDP/ICE whose generation is older than the highest already seen, so
    /// offers/candidates from a churned socket become inert. Optional for
    /// backward compatibility (absent ⇒ generation 0).
    public let negotiationId: Int?
}

public struct CallICECandidateData: Decodable, Sendable {
    public let callId: String
    public let signal: CallSignalPayload
}

public struct CallEndData: Decodable, Sendable {
    public let callId: String
    public let duration: Int?
    public let endedBy: String?
    /// Audit P1-24 — gateway emits `reason: CallEndReason` (`"missed"`,
    /// `"rejected"`, `"completed"`, `"connectionLost"`, `"failed"`,
    /// `"declined"`, `"answeredElsewhere"`). Without surfacing it on iOS,
    /// every remote-end was indistinguishable and CallKit reported every
    /// case as `.remoteEnded` — wrong for missed/declined/answeredElsewhere
    /// (Recents UX) and for analytics.
    public let reason: String?
}

/// Audit P1-25 — `call:missed` event payload. Gateway emits this on
/// ringing-timeout to the callee's user-room sockets (in addition to
/// `call:ended`). The dedicated event lets the iOS UI raise a missed-call
/// banner without inferring it from `endedBy != self`.
public struct CallMissedData: Decodable, Sendable {
    public let callId: String
    public let conversationId: String
    public let callerId: String
    public let callerName: String?
}

/// Audit P1-27 — `call:already-answered` event payload. Emitted by the
/// gateway to the joining user's OTHER sockets when one of their devices
/// answers a call, so the rest can dismiss CallKit + ringing UI.
public struct CallAlreadyAnsweredData: Decodable, Sendable {
    public let callId: String
}

public struct CallErrorData: Decodable, Sendable {
    public let code: String?
    public let message: String?
    /// The call this error pertains to, when the gateway knows it. Consumers with
    /// an active call MUST ignore any error whose `callId` is present and does not
    /// match their current call — errors for a different call must never affect a
    /// healthy, unrelated one. Absent for errors that occur before a call context
    /// exists (e.g. auth failures) or from emit sites not yet call-scoped server-side.
    public let callId: String?
}

public struct CallQualityAlertData: Decodable, Sendable {
    public let callId: String
    public let participantId: String
    public let metric: String
    public let value: Double
    public let threshold: Double
}

/// Received when the remote peer starts or stops screen-capturing the call.
/// The gateway relays `call:screen-capture-alert` to the OTHER participant
/// only (socket.to(room)) — every event we receive reflects the remote peer.
public struct CallScreenCaptureAlertData: Decodable, Sendable {
    public let callId: String
    public let participantId: String
    public let isCapturing: Bool
}

/// Received when the gateway force-removes the current user from an active call.
/// The gateway emits `call:force-leave` to the user's personal room so every
/// device they have connected receives the event and tears down the call.
public struct CallForcedLeaveData: Decodable, Sendable {
    public let callId: String
    public let reason: String?
}

public struct CallTranscriptionSegmentPayload: Sendable {
    /// Stable journal id (UUID minted at capture) — the cross-transport merge
    /// key: the same segment can reach a peer over the WebRTC data channel
    /// AND the server relay; receivers dedup/enrich by this id.
    public let id: String
    public let text: String
    public let speakerId: String
    public let startMs: Int
    public let endMs: Int
    public let isFinal: Bool
    public let confidence: Double
    /// Automatic tag of the language this segment was transcribed in — feeds
    /// the journal badge today and the live-translate + TTS pipeline next.
    public let language: String
    /// Wall-clock capture time (epoch ms) — the journal ordering key,
    /// rendered as `displayName (heure): message` on every side.
    public let capturedAtMs: Int

    public init(
        id: String, text: String, speakerId: String, startMs: Int, endMs: Int,
        isFinal: Bool, confidence: Double, language: String, capturedAtMs: Int
    ) {
        self.id = id
        self.text = text
        self.speakerId = speakerId
        self.startMs = startMs
        self.endMs = endMs
        self.isFinal = isFinal
        self.confidence = confidence
        self.language = language
        self.capturedAtMs = capturedAtMs
    }
}

/// Event: call:translated-segment (Server → Client). Mirrors
/// `CallTranslatedSegmentEvent` in `packages/shared/types/video-call.ts`.
/// `translatedText` is omitted when ZMQ translation is disabled/unavailable —
/// consumers fall back to displaying `text`.
public struct CallTranslatedSegmentData: Decodable, Sendable {
    public let callId: String
    public let segment: Segment

    public struct Segment: Decodable, Sendable {
        /// Cross-transport merge key (absent from legacy gateways/peers).
        public let id: String?
        public let text: String
        public let translatedText: String?
        public let speakerId: String
        /// Server-stamped display name of the speaker (anti-spoof: resolved
        /// by the gateway from the authenticated participant, same principle
        /// as `speakerId`). Receivers still prefer their local roster name.
        public let speakerDisplayName: String?
        public let startMs: Int
        public let endMs: Int
        public let isFinal: Bool
        public let sourceLanguage: String
        public let targetLanguage: String
        public let confidence: Double
        /// Wall-clock capture time (epoch ms) — journal ordering key.
        public let capturedAtMs: Int?
    }
}

/// Event: call:transcription-active (Server -> Client). Mirrors
/// `CallTranscriptionActiveBroadcast` in `packages/shared/types/video-call.ts`.
/// `speakerId` est estampillé côté gateway (anti-usurpation). Signal de
/// présence : jamais gâté par la visibilité du panneau du récepteur — c'est
/// l'invitation à l'ouvrir.
public struct CallTranscriptionActiveData: Decodable, Sendable {
    public let callId: String
    public let speakerId: String
    public let active: Bool
}
