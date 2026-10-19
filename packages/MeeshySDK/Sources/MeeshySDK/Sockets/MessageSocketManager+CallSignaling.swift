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
        return try await withCheckedThrowingContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:initiate", payload).timingOut(after: 10) { items in
                guard !resumed else { return }
                resumed = true

                guard let response = items.first as? [String: Any] else {
                    continuation.resume(throwing: CallInitiateError.timeout)
                    return
                }
                guard let success = response["success"] as? Bool, success,
                      let data = response["data"] as? [String: Any],
                      let callId = data["callId"] as? String else {
                    let message = (response["error"] as? [String: Any])?["message"] as? String
                        ?? (response["error"] as? String)
                        ?? "unknown error"
                    continuation.resume(throwing: CallInitiateError.serverError(message))
                    return
                }

                let mode = data["mode"] as? String
                let rawServers = data["iceServers"] as? [[String: Any]] ?? []

                let servers: [SocketIceServer]
                do {
                    let serversData = try JSONSerialization.data(withJSONObject: rawServers)
                    servers = try JSONDecoder().decode([SocketIceServer].self, from: serversData)
                } catch {
                    // Sans serveurs ICE, l'appel ne peut pas s'établir : la
                    // cause exacte doit être exploitable.
                    Logger.socket.error("call ICE servers undecodable, call cannot be established: \(error.localizedDescription, privacy: .public)")
                    continuation.resume(throwing: CallInitiateError.malformedResponse)
                    return
                }

                let ttl = data["ttl"] as? Int
                continuation.resume(returning: CallInitiateAck(callId: callId, mode: mode, iceServers: servers, ttl: ttl))
            }
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
        return await withCheckedContinuation { continuation in
            var resumed = false
            // 6s (was 3s): the gateway only sends the success ACK AFTER
            // `joinCall` (Prisma transaction → 'connecting', TURN credential
            // generation, participant enrichment, C8 same-user socket eviction
            // via fetchSockets). Under load that work can exceed 3s, so a
            // slow-but-successful join was falsely reported `NOT ACKed`, firing
            // a redundant retry that burned the caller's ring budget → `missed`.
            // Still well under the 45s ring / 30s connect budget, even with the
            // one retry in joinCallRoomReliably.
            socket.emitWithAck("call:join", payload).timingOut(after: 6) { items in
                guard !resumed else { return }
                resumed = true
                let response = items.first as? [String: Any]
                let success = response?["success"] as? Bool ?? false
                let error = response?["error"] as? [String: Any]
                let errorCode = error?["code"] as? String
                let endReason = error?["endReason"] as? String
                continuation.resume(returning: CallJoinAckResult(
                    joined: success, errorCode: errorCode, endReason: endReason
                ))
            }
        }
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
        return await withCheckedContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:signal", ["callId": callId, "signal": signal]).timingOut(after: 3) { items in
                guard !resumed else { return }
                resumed = true
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool {
                    continuation.resume(returning: success)
                } else if items.isEmpty {
                    continuation.resume(returning: false)
                } else {
                    continuation.resume(returning: false)
                }
            }
        }
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
        return await withCheckedContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:end", ["callId": callId, "reason": "rejected"]).timingOut(after: 3) { items in
                guard !resumed else { return }
                resumed = true
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool {
                    continuation.resume(returning: success)
                } else {
                    continuation.resume(returning: false)
                }
            }
        }
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
        return await withCheckedContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:end", ["callId": callId]).timingOut(after: 3) { items in
                guard !resumed else { return }
                resumed = true
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool {
                    continuation.resume(returning: success)
                } else {
                    continuation.resume(returning: false)
                }
            }
        }
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
