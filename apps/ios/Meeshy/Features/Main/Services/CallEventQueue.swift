import Foundation
import os

/// Serial event queue for the call FSM. Owns the canonical client-side state
/// and processes transitions from any event source (socket, CallKit, WebRTC,
/// network) in order. This is the single source of truth for call state
/// client-side; `CallManager` (`@MainActor`) is a thin façade observing this
/// actor and publishing mirror state for SwiftUI binding.
///
/// Phase 0: scaffold only — no transition logic wired yet. Subsequent phases
/// progressively migrate logic from `CallManager` into this actor.
///
/// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.2
actor CallEventQueue {
    private(set) var state: CallState = .idle
    private(set) var version: Int = 0
    private(set) var currentCallId: String?

    private var hooks: [any MediaPipelineHook] = []
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-event-queue")

    init() {}

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
}
