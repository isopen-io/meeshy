import Foundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC

/// Adaptateurs async des callbacks de `RTCPeerConnection` : descriptions SDP locale et
/// distante, et relevé des statistiques d'appel.
enum PeerConnectionAsync {
    static func setLocalDescription(_ sdp: RTCSessionDescription, on pc: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setLocalDescription(sdp) { error in
                if let error { cont.resume(throwing: error) }
                else { cont.resume() }
            }
        }
    }

    static func localDescription(from pc: RTCPeerConnection, constraints: RTCMediaConstraints, asOffer: Bool) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { continuation in
            let handler: @Sendable (RTCSessionDescription?, (any Error)?) -> Void = { sdp, error in
                if let error { continuation.resume(throwing: error); return }
                guard let sdp else { continuation.resume(throwing: WebRTCError.failedToCreateSDP); return }
                continuation.resume(returning: sdp)
            }
            if asOffer { pc.offer(for: constraints, completionHandler: handler) } else { pc.answer(for: constraints, completionHandler: handler) }
        }
    }

    static func setRemoteDescription(_ sdp: RTCSessionDescription, on pc: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(sdp) { error in
                if let error { cont.resume(throwing: error) }
                else { cont.resume() }
            }
        }
    }

    static func callStats(of pc: RTCPeerConnection) async -> CallStats? {
        // Project the framework's `RTCStatisticsReport` into `[CallStats.RawEntry]`
        // inside the nonisolated `pc.statistics` callback, then reduce it after the
        // continuation returns (`CallStats.init` is @MainActor; getStats() runs on
        // the main actor). The arithmetic lives in the pure, tested
        // `CallStats.reduce` (§5.7) — here we only adapt NSObject → Double.
        let entries: [CallStats.RawEntry] = await withCheckedContinuation { continuation in
            pc.statistics { report in
                let parsed = report.statistics.map { id, stats in
                    CallStats.RawEntry(id: id, type: stats.type, raw: stats.values)
                }
                continuation.resume(returning: parsed)
            }
        }

        let result = CallStats.reduce(entries: entries)
        Logger.webrtc.info(
            "[CALL-DIAG][STATS] sent=\(result.bandwidth)B/\(result.outboundPacketsSent)pkt recvAudio=\(result.inboundAudioPackets)pkt recvVideo=\(result.inboundVideoPackets)pkt rtt=\(result.roundTripTimeMs)ms lost=\(result.packetsLost) bwe=\(result.availableOutgoingBitrateBps)bps codec=\(result.codec ?? "?", privacy: .public)"
        )
        return result
    }
}

#endif
