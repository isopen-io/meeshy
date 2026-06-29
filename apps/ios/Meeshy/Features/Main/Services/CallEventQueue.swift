import Foundation
import os

// MARK: - CallEvent

/// All events that can drive the call FSM forward.
///
/// Each event originates from one external or internal source: a Socket.IO
/// signaling message, a CallKit action, a WebRTC delegate callback, or a
/// network-monitor change. `CallEventQueue.handle(_:)` validates the event
/// against the current state and either applies the transition atomically or
/// throws `CallEventError.illegalTransition`.
enum CallEvent: Sendable {
    /// Local user initiated an outgoing call.
    case outgoingStarted(callId: String, isVideo: Bool, peerId: String)
    /// A VoIP push or signaling message arrived for an incoming call.
    case incomingReceived(callId: String, isVideo: Bool, peerId: String)
    /// Remote peer joined the signaling room (outgoing-call path only).
    case peerJoined
    /// SDP offer/answer exchange has begun (caller after answer; callee after accept).
    case negotiating
    /// ICE/DTLS handshake complete — media is flowing, RTP gate passed.
    case established
    /// Network disruption detected; ICE restart in progress (`attempt` is 1-based).
    case reconnecting(attempt: Int)
    /// ICE restart succeeded; media is flowing again.
    case reconnected
    /// Call ended for any reason (local hang-up, remote hang-up, timeout, error).
    case ended(reason: CallEndReason)
    /// Force the queue back to `.idle` (safety valve — always accepted regardless of state).
    case reset
}

// MARK: - CallEventError

enum CallEventError: Error, Equatable, Sendable {
    case illegalTransition(from: CallState, event: String)
}

extension CallEventError {
    nonisolated static func == (lhs: CallEventError, rhs: CallEventError) -> Bool {
        switch (lhs, rhs) {
        case (.illegalTransition(let f1, let e1), .illegalTransition(let f2, let e2)):
            return f1 == f2 && e1 == e2
        }
    }
}

// MARK: - CallEventQueue

/// Serial event queue for the call FSM. Owns the canonical client-side call
/// state and processes transitions from any event source in order, eliminating
/// the race conditions that arise from multiple callers mutating `@Published`
/// state directly. `CallManager` (`@MainActor`) observes this actor and
/// mirrors state for SwiftUI binding.
///
/// Phase 1 invariants:
/// - State is mutated atomically before any suspension point (no interleaved
///   partial-state readers).
/// - `version` is incremented on every accepted transition (including reset).
/// - All registered `MediaPipelineHook` instances are notified after each
///   accepted transition via `callDidTransition(_:in:)`.
/// - `reset` is universally accepted from any state (safety valve for crash
///   recovery and error paths), though hook dispatch is skipped when no
///   active call context exists.
///
/// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.2
actor CallEventQueue {
    private(set) var state: CallState = .idle
    private(set) var version: Int = 0
    private(set) var currentCallId: String?
    private(set) var currentContext: CallContext?

    private var hooks: [any MediaPipelineHook] = []
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-event-queue")

    init() {}

    // MARK: - Hook Management

    func register(hook: any MediaPipelineHook) {
        hooks.append(hook)
        logger.info("Hook registered: \(hook.identifier, privacy: .public)")
    }

    func unregister(hookIdentifier: String) {
        hooks.removeAll { $0.identifier == hookIdentifier }
    }

    func currentHooks() -> [any MediaPipelineHook] {
        hooks
    }

    // MARK: - FSM

    /// Apply `event` to the current state, update canonical state atomically,
    /// then notify all registered hooks. Throws `CallEventError.illegalTransition`
    /// when the event is not valid for the current state.
    func handle(_ event: CallEvent) async throws {
        // Capture both before applyTransition mutates them so hooks can see the
        // pre-transition context on reset (currentContext is cleared by reset).
        let prev = state
        let contextSnapshot = currentContext

        let next = try applyTransition(event: event)

        // Atomic: no suspension between capturing state and setting state.
        state = next
        version += 1
        logger.info(
            "[\(self.version, privacy: .public)] \(String(describing: prev), privacy: .public) → \(String(describing: next), privacy: .public)"
        )

        // Dispatch to hooks: use pre-transition context for reset (where
        // applyTransition cleared currentContext), fall back to the new one
        // (outgoingStarted/incomingReceived sets it during applyTransition).
        guard let context = contextSnapshot ?? currentContext else { return }
        let capturedHooks = hooks
        for hook in capturedHooks {
            await hook.callDidTransition(next, in: context)
        }
    }

    // MARK: - Internal Transition Logic

    private func applyTransition(event: CallEvent) throws -> CallState {
        // Universal escape hatch — always accepted, clears call context.
        if case .reset = event {
            currentCallId = nil
            currentContext = nil
            return .idle
        }
        switch (state, event) {

        // ── idle → ringing ───────────────────────────────────────────────────

        case (.idle, .outgoingStarted(let callId, let isVideo, let peerId)):
            currentCallId = callId
            currentContext = CallContext(callId: callId, isVideo: isVideo, role: .caller, peerId: peerId)
            return .ringing(isOutgoing: true)

        case (.idle, .incomingReceived(let callId, let isVideo, let peerId)):
            currentCallId = callId
            currentContext = CallContext(callId: callId, isVideo: isVideo, role: .callee, peerId: peerId)
            return .ringing(isOutgoing: false)

        // ── ringing (outgoing) → offering ────────────────────────────────────

        case (.ringing(isOutgoing: true), .peerJoined):
            return .offering

        // ── ringing (incoming) / offering → connecting ────────────────────────

        case (.ringing(isOutgoing: false), .negotiating),
             (.offering, .negotiating):
            return .connecting

        // ── connecting → connected / reconnecting ────────────────────────────

        case (.connecting, .established):
            return .connected

        case (.connecting, .reconnecting(let attempt)):
            return .reconnecting(attempt: attempt)

        // ── connected → reconnecting ─────────────────────────────────────────

        case (.connected, .reconnecting(let attempt)):
            return .reconnecting(attempt: attempt)

        // ── reconnecting → reconnecting / connected ──────────────────────────

        case (.reconnecting, .reconnecting(let attempt)):
            return .reconnecting(attempt: attempt)

        case (.reconnecting, .reconnected):
            return .connected

        // ── any active state → ended ─────────────────────────────────────────

        case (let s, .ended(let reason)) where s.isActive:
            return .ended(reason: reason)

        // ── catch-all: illegal transition (includes non-reset events from .ended) ──

        default:
            throw CallEventError.illegalTransition(from: state, event: String(describing: event))
        }
    }
}
