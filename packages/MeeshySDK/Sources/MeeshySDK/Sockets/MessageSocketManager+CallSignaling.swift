import Foundation
import SocketIO
import Combine
import os

extension MessageSocketManager {

    // MARK: - Call Signaling Emission

    public enum CallInitiateError: Error, Sendable, LocalizedError {
        case noSocket
        case timeout
        case serverError(String)
        case malformedResponse

        // Conformance LocalizedError pour que les logs d'app et les UI surfaces
        // exposent la cause réelle au lieu du fallback Swift "error N" peu
        // discriminant (N étant l'index de case bridgé en NSError._code, qui
        // peut différer entre les builds quand on ajoute/réordonne des cases).
        public var errorDescription: String? {
            switch self {
            case .noSocket:
                return "noSocket — MessageSocket non connecté lors de l'émission de call:initiate (vérifier login, connexion réseau, état du gateway)"
            case .timeout:
                return "timeout — Le gateway n'a pas répondu à call:initiate sous 10s (vérifier gateway up, latence réseau)"
            case .serverError(let message):
                return "serverError — Gateway a rejeté call:initiate: \(message)"
            case .malformedResponse:
                return "malformedResponse — La réponse ACK de call:initiate ne contient pas data.callId ou iceServers"
            }
        }
    }

    public struct CallInitiateAck: Sendable {
        public let callId: String
        public let mode: String?
        public let iceServers: [SocketIceServer]
        public let ttl: Int?

        public init(callId: String, mode: String?, iceServers: [SocketIceServer], ttl: Int? = nil) {
            self.callId = callId
            self.mode = mode
            self.iceServers = iceServers
            self.ttl = ttl
        }
    }

    /// Emits `call:initiate` and awaits the gateway ACK that returns the real
    /// MongoDB callId, mode and per-user ICE servers (TURN credentials).
    /// The caller MUST configure WebRTC with these ICE servers BEFORE building
    /// any SDP offer — otherwise NAT-symmetric peers can never connect.
    public func emitCallInitiate(conversationId: String, isVideo: Bool) async throws -> CallInitiateAck {
        guard let socket else { throw CallInitiateError.noSocket }
        let payload: [String: Any] = [
            "conversationId": conversationId,
            "type": isVideo ? "video" : "audio"
        ]
        let ack = await socket.emitWithAck(.callInitiate, payload, as: CallInitiateAckBody.self, payloadAt: .data, timingOutAfter: 10)
        return try Self.callInitiateResult(from: ack).get()
    }

    static func callInitiateResult(from ack: SocketAck<CallInitiateAckBody>) -> Result<CallInitiateAck, CallInitiateError> {
        switch ack {
        case .timedOut:
            return .failure(.timeout)
        case .refused(let refusal):
            return .failure(.serverError(refusal.message ?? "unknown error"))
        case .acceptedWithoutPayload:
            return .failure(.serverError("unknown error"))
        case .undecodable(let reason):
            // Sans serveurs ICE, l'appel ne peut pas s'établir : la
            // cause exacte doit être exploitable.
            Logger.socket.error("call ICE servers undecodable, call cannot be established: \(reason, privacy: .public)")
            return .failure(.malformedResponse)
        case .accepted(let body):
            guard let callId = body.callId else { return .failure(.serverError("unknown error")) }
            return .success(CallInitiateAck(callId: callId, mode: body.mode, iceServers: body.iceServers ?? [], ttl: body.ttl))
        }
    }

    public func emitCallJoin(callId: String) {
        socket?.emit("call:join", ["callId": callId])
    }

    /// Detailed outcome of an ACK-aware `call:join` — mirrors the gateway's
    /// `CallJoinAck` shape (`packages/shared/types/video-call.ts`) instead of
    /// collapsing it to a bare `Bool`. `endReason` carries the RAW server
    /// string (Prisma `CallSession.endReason`, populated only when
    /// `errorCode == "CALL_ENDED"`) — the SDK stays pure and does not map it;
    /// the app layer maps it via `CallEndReasonMapper`, same convention
    /// already used for `call:ended`/`call:missed`.
    public struct CallJoinAckResult: Sendable {
        public let joined: Bool
        public let errorCode: String?
        public let endReason: String?

        public init(joined: Bool, errorCode: String? = nil, endReason: String? = nil) {
            self.joined = joined
            self.errorCode = errorCode
            self.endReason = endReason
        }
    }

    /// ACK-aware join: emits `call:join` and awaits gateway confirmation (6 s
    /// timeout), returning the full ack (success + error detail) rather than
    /// just success. Use this on socket reconnect before sending room-scoped
    /// events (call:request-ice-servers, call:toggle-video) — the gateway
    /// guards those with `socket.rooms.has(ROOMS.call(callId))` which is only
    /// true after the async joinCall() DB work completes and socket.join()
    /// runs. Also lets a reconnect distinguish "the call already ended
    /// server-side while we were disconnected" (`errorCode == "CALL_ENDED"`)
    /// from a plain ACK timeout — see Vague 162.
    public func emitCallJoinWithAckDetailed(callId: String) async -> CallJoinAckResult {
        guard let socket else { return CallJoinAckResult(joined: false) }
        let payload: [String: Any] = ["callId": callId]
        // 6s (was 3s): the gateway only sends the success ACK AFTER
        // `joinCall` (Prisma transaction → 'connecting', TURN credential
        // generation, participant enrichment, C8 same-user socket eviction
        // via fetchSockets). Under load that work can exceed 3s, so a
        // slow-but-successful join was falsely reported `NOT ACKed`, firing
        // a redundant retry that burned the caller's ring budget → `missed`.
        // Still well under the 45s ring / 30s connect budget, even with the
        // one retry in joinCallRoomReliably.
        let ack = await socket.emitWithAck(.callJoin, payload, as: SocketAckNoPayload.self, payloadAt: .none, timingOutAfter: 6)
        return Self.callJoinResult(from: ack)
    }

    static func callJoinResult(from ack: SocketAck<SocketAckNoPayload>) -> CallJoinAckResult {
        switch ack {
        case .accepted:
            return CallJoinAckResult(joined: true)
        case .refused(let refusal):
            return CallJoinAckResult(joined: false, errorCode: refusal.errorCode, endReason: refusal.endReason)
        case .acceptedWithoutPayload, .undecodable, .timedOut:
            return CallJoinAckResult(joined: false)
        }
    }

    static func ackSucceeded(_ ack: SocketAck<SocketAckNoPayload>) -> Bool {
        guard case .accepted = ack else { return false }
        return true
    }

    /// Boolean-only convenience over `emitCallJoinWithAckDetailed` — kept for
    /// callers (e.g. the incoming-call cold-start join) that only care whether
    /// the room join succeeded, not why it didn't.
    public func emitCallJoinWithAck(callId: String) async -> Bool {
        await emitCallJoinWithAckDetailed(callId: callId).joined
    }

    public func emitCallLeave(callId: String) {
        socket?.emit("call:leave", ["callId": callId])
    }

    public func emitRequestIceServers(callId: String) {
        socket?.emit("call:request-ice-servers", ["callId": callId])
    }

    /// Informs the gateway the app entered background while a call is active.
    /// The gateway uses this to switch ringing delivery to VoIP push and extend
    /// its heartbeat tolerance window.
    public func emitCallBackgrounded(callId: String, participantId: String) {
        socket?.emit("call:backgrounded", ["callId": callId, "participantId": participantId])
    }

    /// Informs the gateway the app returned to foreground during an active call.
    /// Resets the heartbeat tolerance window and re-enables socket-based ringing.
    public func emitCallForegrounded(callId: String, participantId: String) {
        socket?.emit("call:foregrounded", ["callId": callId, "participantId": participantId])
    }

    /// Notifies the gateway (and, by relay, other participants) that the local
    /// screen capture state changed. Other participants receive
    /// `call:screen-capture-alert` so they can display a warning.
    public func emitCallScreenCaptureDetected(callId: String, participantId: String, isCapturing: Bool) {
        socket?.emit("call:screen-capture-detected", [
            "callId": callId,
            "participantId": participantId,
            "isCapturing": isCapturing
        ])
    }

    /// Emits a `call:analytics` event with aggregated call metrics at session end.
    /// Fire-and-forget — the gateway persists the summary for observability dashboards.
    public func emitCallAnalytics(callId: String, payload: [String: Any]) {
        var data = payload
        data["callId"] = callId
        socket?.emit("call:analytics", data)
    }

    /// Émet `call:force-leave` pour la conversation donnée. Le gateway
    /// nettoie alors toute trace d'appel actif où l'utilisateur courant
    /// était participant (CallParticipant.leftAt = null) sans nécessiter
    /// le callId — utile en pré-flight avant `call:initiate` pour purger
    /// les zombies laissés par un crash, un kill app, ou un test antérieur
    /// dont le cleanup gateway n'a pas tourné. Idempotent : no-op si pas
    /// de zombie côté DB.
    public func emitCallForceLeave(conversationId: String) {
        socket?.emit("call:force-leave", ["conversationId": conversationId])
    }

    public func emitCallSignal(callId: String, type: String, payload: [String: Any]) {
        var signal: [String: Any] = ["type": type]
        for (key, value) in payload { signal[key] = value }
        socket?.emit("call:signal", ["callId": callId, "signal": signal])
    }

    /// PERF-004: Emit a `call:signal` and await the gateway ACK with a 3s
    /// timeout. Returns `true` once the gateway confirms the signal was
    /// relayed to the peer, `false` on timeout / no socket / server error.
    /// Used for the SDP answer path so CXAnswerCallAction.fulfill() only
    /// runs after the answer is on the wire — without this, CallKit would
    /// race the WebRTC signaling and the audio engine could start before
    /// the peer has received the answer.
    public func emitCallSignalWithAck(callId: String, type: String, payload: [String: Any]) async -> Bool {
        guard let socket else { return false }
        var signal: [String: Any] = ["type": type]
        for (key, value) in payload { signal[key] = value }
        let ack = await socket.emitWithAck(
            .callSignal, ["callId": callId, "signal": signal] as [String: Any],
            as: SocketAckNoPayload.self, payloadAt: .none, timingOutAfter: 3
        )
        return Self.ackSucceeded(ack)
    }

    public func emitCallToggleAudio(callId: String, enabled: Bool) {
        socket?.emit("call:toggle-audio", ["callId": callId, "enabled": enabled])
    }

    public func emitCallToggleVideo(callId: String, enabled: Bool) {
        socket?.emit("call:toggle-video", ["callId": callId, "enabled": enabled])
    }

    public func emitCallEnd(callId: String) {
        socket?.emit("call:end", ["callId": callId])
    }

    /// Refus explicite : `call:end` avec `reason: "rejected"`. Sans la raison,
    /// le gateway résout tout end pré-décroché en `missed` — fausse
    /// notification « appel manqué » chez le callee qui vient de refuser, et
    /// le refus tombe dans le filtre « manqués » du journal. Parité Android
    /// `emitEnd(callId, reason)` / web `handleRejectCall`.
    public func emitCallReject(callId: String) {
        socket?.emit("call:end", ["callId": callId, "reason": "rejected"])
    }

    /// Variante avec ACK du refus (parité `emitCallEndWithAck`, 2026-08-11) :
    /// émet `call:end {reason:"rejected"}` et attend confirmation du gateway
    /// (max 3s). Sans elle, un socket vu « connecté » au moment du refus
    /// pouvait perdre l'emit en vol — un blip qui s'auto-répare avant que
    /// `connectionState` n'observe la coupure — laissant l'appelant sonner
    /// jusqu'au timeout serveur pendant que le gateway résout `missed` au
    /// lieu de `rejected` (le mislabel que l'arc reject 2026-07-12 fermait
    /// déjà sur tous les autres chemins de refus).
    public func emitCallRejectWithAck(callId: String) async -> Bool {
        guard let socket else { return false }
        let ack = await socket.emitWithAck(
            .callEnd, ["callId": callId, "reason": "rejected"] as [String: Any],
            as: SocketAckNoPayload.self, payloadAt: .none, timingOutAfter: 3
        )
        return Self.ackSucceeded(ack)
    }

    /// Variante avec ACK : émet `call:end` et attend confirmation du gateway
    /// (max 3s). Le gateway accepte et broadcast `call:ended` à tous les
    /// participants. Sans ACK le client ne sait pas si le peer a été notifié
    /// — symptôme : l'appelé reste bloqué en `.connecting` ou `.connected`
    /// alors que l'appelant a raccroché. Utiliser cette variante quand le
    /// client a un cycle de vie immédiat (raccrocher = vouloir confirmation
    /// avant de fermer le socket / quitter l'écran).
    public func emitCallEndWithAck(callId: String) async -> Bool {
        guard let socket else { return false }
        let ack = await socket.emitWithAck(
            .callEnd, ["callId": callId] as [String: Any],
            as: SocketAckNoPayload.self, payloadAt: .none, timingOutAfter: 3
        )
        return Self.ackSucceeded(ack)
    }

    public func emitCallHeartbeat(callId: String) {
        socket?.emit("call:heartbeat", ["callId": callId])
    }

    /// Emits a final (isFinal=true only — callers must not send partials)
    /// local transcription segment. The gateway relays it, translated per
    /// listener's `systemLanguage`, as `call:translated-segment`.
    /// Signale aux autres participants que ce device vient d'activer
    /// (`active: true`) ou de fermer (`active: false`) son panneau de
    /// transcription — le gateway estampille l'émetteur et rediffuse à la
    /// room pour l'indicateur d'invitation. Fire-and-forget.
    public func emitCallTranscriptionActive(callId: String, active: Bool) {
        socket?.emit("call:transcription-active", [
            "callId": callId,
            "active": active
        ])
    }

    public func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload) {
        socket?.emit("call:transcription-segment", [
            "callId": callId,
            "segment": [
                "id": segment.id,
                "text": segment.text,
                "speakerId": segment.speakerId,
                "startMs": segment.startMs,
                "endMs": segment.endMs,
                "isFinal": segment.isFinal,
                "confidence": segment.confidence,
                "language": segment.language,
                "capturedAtMs": segment.capturedAtMs
            ]
        ])
    }

    /// Report periodic call quality + cumulative data usage to the gateway. The
    /// last report before teardown carries the call totals, which the gateway
    /// persists on the CallSession so the call-summary message can surface
    /// "data spent · network quality". Fire-and-forget. `bytesSent`/`bytesReceived`
    /// are cumulative WebRTC counters; `level` is excellent|good|fair|poor.
    public func emitCallQualityReport(
        callId: String, level: String, rtt: Double, packetLoss: Double,
        bytesSent: Int, bytesReceived: Int, availableOutgoingBitrateBps: Int = 0,
        jitterMs: Double = 0
    ) {
        var stats: [String: Any] = [
            "level": level,
            "rtt": rtt,
            "packetLoss": packetLoss,
            "bytesSent": bytesSent,
            "bytesReceived": bytesReceived
        ]
        if availableOutgoingBitrateBps > 0 {
            stats["availableOutgoingBitrateBps"] = availableOutgoingBitrateBps
        }
        if jitterMs > 0 {
            stats["jitterMs"] = jitterMs
        }
        socket?.emit("call:quality-report", ["callId": callId, "stats": stats])
    }

    /// Notify the gateway that a local ICE restart is in progress (e.g. network
    /// handoff or connectivity loss). Fire-and-forget. The gateway updates the
    /// call DB status to `reconnecting` and suppresses premature cleanup.
    public func emitCallReconnecting(callId: String, participantId: String, attempt: Int) {
        socket?.emit("call:reconnecting", [
            "callId": callId,
            "participantId": participantId,
            "attempt": attempt
        ])
    }

    /// Notify the gateway that the ICE restart completed successfully and the
    /// call is active again. Fire-and-forget. Resets call DB status to `active`.
    public func emitCallReconnected(callId: String, participantId: String) {
        socket?.emit("call:reconnected", [
            "callId": callId,
            "participantId": participantId
        ])
    }
}

struct CallInitiateAckBody: Decodable, Sendable {
    let callId: String?
    let mode: String?
    let ttl: Int?
    let iceServers: [SocketIceServer]?

    private enum CodingKeys: String, CodingKey {
        case callId, mode, ttl, iceServers
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        callId = try? container.decodeIfPresent(String.self, forKey: .callId)
        mode = try? container.decodeIfPresent(String.self, forKey: .mode)
        ttl = try? container.decodeIfPresent(Int.self, forKey: .ttl)
        iceServers = try container.decodeIfPresent([SocketIceServer].self, forKey: .iceServers)
    }
}
