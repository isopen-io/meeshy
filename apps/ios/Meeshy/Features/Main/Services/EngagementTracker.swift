import Foundation
import MeeshySDK
import os

nonisolated private let engagementLogger = Logger(subsystem: "me.meeshy.app", category: "engagement")

/// Sink the tracker pushes sessions into (durable outbox in production).
public protocol EngagementSinking: Sendable {
    func beginSession(_ s: EngagementSession) async
    func checkpoint(_ s: EngagementSession) async
    func finalizeSession(_ s: EngagementSession) async
    func requestFlush() async
}

/// Tracks one consumption session per surface: monotonic dwell, micro-actions,
/// optional watch-time, consent gating, qualified-session threshold, and the
/// topmost-owns-the-clock rule (an overlay surface pauses the one underneath).
@MainActor
final class EngagementTracker {
    static let shared = EngagementTracker()

    private struct ActiveSession {
        let sessionId: String
        let postId: String
        let contentType: EngagementSession.ContentType
        let surface: EngagementSurface
        let startedAtWall: Date
        let consent: String
        var accumulatedMs: Int          // dwell already counted (paused segments)
        var runningSinceMs: Int?        // monotonic ms when the clock (re)started; nil = paused
        var actions: [EngagementAction]
        var watchSamples: [WatchSample]
        var watchMs: Int?
        var mediaDurationMs: Int?
        var completed: Bool
    }

    // Qualified-session thresholds (spec D8).
    private static let minDwellMs = 1000
    private static let minWatchMs = 2000

    private let sink: EngagementSinking
    private let nowMs: () -> Int
    private let userIdProvider: () -> String?
    private let consentProvider: () -> Bool

    private var sessions: [EngagementSurface: ActiveSession] = [:]
    private var topStack: [EngagementSurface] = []

    init(sink: EngagementSinking = EngagementOutboxSink.shared,
         nowMs: @escaping () -> Int = { Int(ProcessInfo.processInfo.systemUptime * 1000) },
         userIdProvider: @escaping () -> String? = { AuthManager.shared.currentUser?.id },
         consentProvider: @escaping () -> Bool = { UserPreferencesManager.shared.privacy.allowAnalytics }) {
        self.sink = sink
        self.nowMs = nowMs
        self.userIdProvider = userIdProvider
        self.consentProvider = consentProvider
    }

    func begin(postId: String, contentType: EngagementSession.ContentType, surface: EngagementSurface) {
        guard consentProvider(), let userId = userIdProvider() else { return }
        pauseTop()   // topmost-owns-the-clock
        let s = ActiveSession(
            sessionId: UUID().uuidString, postId: postId, contentType: contentType, surface: surface,
            startedAtWall: Date(), consent: "granted", accumulatedMs: 0, runningSinceMs: nowMs(),
            actions: [], watchSamples: [], watchMs: nil, mediaDurationMs: nil, completed: false
        )
        sessions[surface] = s
        topStack.append(surface)
        let session = snapshot(s, userId: userId, truncated: false)
        Task { await sink.beginSession(session) }
    }

    func recordAction(_ type: EngagementAction.ActionType, surface: EngagementSurface) {
        guard var s = sessions[surface] else { return }
        let atMs = currentDwell(of: s)
        s.actions.append(EngagementAction(type: type, atMs: atMs))
        sessions[surface] = s
    }

    /// Push watch-time captured by the surface from the player at finalize (or sample).
    func attachWatch(surface: EngagementSurface, watchMs: Int?, mediaDurationMs: Int?, completed: Bool, samples: [WatchSample]) {
        guard var s = sessions[surface] else { return }
        s.watchMs = watchMs
        s.mediaDurationMs = mediaDurationMs
        s.completed = completed
        s.watchSamples = samples
        sessions[surface] = s
    }

    func checkpointAll() async {
        guard let userId = userIdProvider() else { return }
        for (_, s) in sessions {
            await sink.checkpoint(snapshot(s, userId: userId, truncated: false))
        }
    }

    func end(surface: EngagementSurface) async {
        guard let userId = userIdProvider(), var s = sessions[surface] else { return }
        s.accumulatedMs = currentDwell(of: s)
        s.runningSinceMs = nil
        sessions[surface] = nil
        topStack.removeAll { $0 == surface }
        resumeTop()

        let qualifies = s.accumulatedMs >= Self.minDwellMs
            || (s.watchMs ?? 0) >= Self.minWatchMs || s.completed
        guard qualifies else {
            engagementLogger.debug("dropping sub-threshold engagement session for \(s.postId, privacy: .public)")
            return
        }
        await sink.finalizeSession(snapshot(s, userId: userId, truncated: false))
        await sink.requestFlush()
    }

    // MARK: - Clock helpers
    private func currentDwell(of s: ActiveSession) -> Int {
        guard let since = s.runningSinceMs else { return s.accumulatedMs }
        return s.accumulatedMs + max(0, nowMs() - since)
    }
    private func pauseTop() {
        guard let top = topStack.last, var s = sessions[top] else { return }
        s.accumulatedMs = currentDwell(of: s)
        s.runningSinceMs = nil
        sessions[top] = s
    }
    private func resumeTop() {
        guard let top = topStack.last, var s = sessions[top], s.runningSinceMs == nil else { return }
        s.runningSinceMs = nowMs()
        sessions[top] = s
    }
    private func snapshot(_ s: ActiveSession, userId: String, truncated: Bool) -> EngagementSession {
        EngagementSession(
            sessionId: s.sessionId, userId: userId, postId: s.postId,
            contentType: s.contentType, surface: s.surface, startedAt: s.startedAtWall,
            dwellMs: currentDwell(of: s), watchMs: s.watchMs, mediaDurationMs: s.mediaDurationMs,
            completed: s.completed, truncated: truncated, consent: s.consent,
            actions: s.actions, watchSamples: s.watchSamples
        )
    }
}
