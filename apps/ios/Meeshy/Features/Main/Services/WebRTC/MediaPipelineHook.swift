import Foundation
import CoreMedia
import CoreVideo

/// Identifies the role of the local user in a call.
enum CallRole: Sendable, Equatable {
    case caller
    case callee
}

typealias PeerID = String

/// Read-only snapshot of the current call context, passed to every hook invocation.
/// Hooks can read it to decide their behaviour but cannot mutate it.
struct CallContext: Sendable {
    let callId: String
    let isVideo: Bool
    let role: CallRole
    let peerId: String?

    init(callId: String, isVideo: Bool, role: CallRole, peerId: String?) {
        self.callId = callId
        self.isVideo = isVideo
        self.role = role
        self.peerId = peerId
    }
}

/// Single bus for all in-call cross-cutting features:
/// transcription, translation, recording, AI insights, AR effects, E2EE, etc.
/// Each hook is invoked at well-defined seams in the media flow.
///
/// All methods have default no-op implementations so adopters only override the
/// seams they need.
///
/// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §1.bis.1
protocol MediaPipelineHook: Sendable {
    /// Stable identifier used for deregistration / diagnostics.
    /// Marked `nonisolated` so non-MainActor contexts (e.g. the
    /// `CallEventQueue` actor) can read it without hopping to the main actor.
    nonisolated var identifier: String { get }

    /// Called once per call setup, before peer connection is created.
    /// Hook can request additional codecs, data channels, encryption layer, etc.
    func willConfigure(call: CallContext, config: inout CallMediaConfig) async throws

    /// Called for each local audio frame after AEC/NS/AGC (post-VPIO),
    /// before encoding to Opus. Hook sees clean voice samples.
    /// Buffers are CMSampleBuffer (PCM Int16) at 48 kHz mono.
    func processLocalAudio(_ buffer: CMSampleBuffer, context: CallContext) async

    /// Called for each remote audio frame after Opus decode + jitter buffer,
    /// before audio mixer / playback.
    func processRemoteAudio(_ buffer: CMSampleBuffer, from peer: PeerID, context: CallContext) async

    /// Called for each local video frame BEFORE filters apply.
    func processLocalVideoPreFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async

    /// Called for each local video frame AFTER filters, before encoding.
    func processLocalVideoPostFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async

    /// Called when the call enters or leaves a state. Hooks can react
    /// (start/stop services, attach/detach listeners, persist state).
    func callDidTransition(_ state: CallState, in context: CallContext) async
}

extension MediaPipelineHook {
    func willConfigure(call: CallContext, config: inout CallMediaConfig) async throws {}
    func processLocalAudio(_ buffer: CMSampleBuffer, context: CallContext) async {}
    func processRemoteAudio(_ buffer: CMSampleBuffer, from peer: PeerID, context: CallContext) async {}
    func processLocalVideoPreFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async {}
    func processLocalVideoPostFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async {}
    func callDidTransition(_ state: CallState, in context: CallContext) async {}
}
