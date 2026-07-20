//
//  VideoSurvivalController.swift
//  Meeshy
//
//  Graceful audio-only survival for an unstable link, layered on top of the
//  existing adaptive bitrate ladder (`WebRTCService.applyVideoQuality`).
//
//  WHY THIS EXISTS
//  iOS already sheds bitrate/resolution down to a `.critical` floor
//  (360p15 @ ~100 kbps, `degradationPreference = .maintainFramerate`). That
//  rescues *most* congestion. This controller adds the LAST-RESORT layer the
//  ladder deliberately omits: when the link stays degraded long enough that
//  even the floor tier can't survive, DROP outbound video so the call lives on
//  as audio-only — then bring video back once the link has clearly recovered.
//
//  DESIGNED FOR ULTRA-LONG CALLS (tens to hundreds of hours)
//  • Monotonic clock (not wall-clock): NTP/DST/user clock jumps never trigger a
//    spurious suspend/resume over a multi-hour call.
//  • Fixed-size state: the policy carries two optional timestamps + a flag. It
//    does NOT accumulate history, so 72k+ samples over 100h cost O(1) memory.
//  • Task hygiene: at most ONE in-flight media transition (renegotiation) at a
//    time; no per-tick Task/allocation churn.
//  • Pure, deterministic policy → exhaustively unit-testable without WebRTC.
//

import Combine
import Foundation

// MARK: - Policy (pure)

/// The decision a quality sample yields.
enum VideoSurvivalAction: Equatable {
    case none
    /// Drop outbound video → audio-only (sustained degraded link).
    case suspend
    /// Re-acquire the camera and resume sending video (link recovered).
    case resume
}

/// Immutable state of the survival state machine. Timestamps are MONOTONIC
/// seconds (see `VideoSurvivalController.now`), never wall-clock.
struct VideoSurvivalState: Equatable {
    /// true: sending (or intending to send) video; false: audio-only survival.
    var isSending: Bool
    /// Monotonic time the current sustained *degraded* streak began (while sending).
    var degradedSince: TimeInterval?
    /// Monotonic time the current sustained *good* streak began (while suspended).
    var recoveringSince: TimeInterval?

    static let initial = VideoSurvivalState(isSending: true, degradedSince: nil, recoveringSince: nil)
}

/// Pure, deterministic graceful-degradation policy with TIME-BASED hysteresis.
///
/// Thresholds are wall-clock DURATIONS, not sample counts, so the policy is
/// independent of the quality monitor's cadence (5s today, anything tomorrow)
/// and of any single dropped/late stats tick.
struct VideoSurvivalPolicy {
    /// Sustained degraded duration before dropping to audio-only.
    let suspendAfter: TimeInterval
    /// Sustained good duration before resuming video. Longer than `suspendAfter`
    /// on purpose: re-acquiring the camera + renegotiating is expensive, so we
    /// require the link to have clearly settled to avoid oscillation.
    let resumeAfter: TimeInterval

    init(suspendAfter: TimeInterval = QualityThresholds.videoSurvivalSuspendAfterSeconds,
         resumeAfter: TimeInterval = QualityThresholds.videoSurvivalResumeAfterSeconds) {
        self.suspendAfter = suspendAfter
        self.resumeAfter = resumeAfter
    }

    /// A degraded level is one the adaptive ladder can no longer rescue at its floor.
    private func isDegraded(_ level: VideoQualityLevel) -> Bool {
        level == .poor || level == .critical
    }
    private func isGood(_ level: VideoQualityLevel) -> Bool {
        level == .excellent || level == .good
    }

    /// Advance the machine by one timestamped sample. Side-effect free.
    func reduce(
        _ state: VideoSurvivalState,
        level: VideoQualityLevel,
        at now: TimeInterval,
        userWantsVideo: Bool
    ) -> (state: VideoSurvivalState, action: VideoSurvivalAction) {
        // User isn't sending video by choice → idle; forget survival state so we
        // never re-enable video against intent.
        guard userWantsVideo else { return (.initial, .none) }

        if state.isSending {
            if isDegraded(level) {
                let since = state.degradedSince ?? now
                if now - since >= suspendAfter {
                    return (VideoSurvivalState(isSending: false, degradedSince: nil, recoveringSince: nil), .suspend)
                }
                var next = state
                next.degradedSince = since
                next.recoveringSince = nil
                return (next, .none)
            }
            // Healthy/fair while sending → the adaptive ladder owns bitrate; we
            // just clear the degraded streak.
            var next = state
            next.degradedSince = nil
            next.recoveringSince = nil
            return (next, .none)
        }

        // Audio-only survival: require a sustained good streak before resuming.
        if isGood(level) {
            let since = state.recoveringSince ?? now
            if now - since >= resumeAfter {
                return (VideoSurvivalState(isSending: true, degradedSince: nil, recoveringSince: nil), .resume)
            }
            var next = state
            next.recoveringSince = since
            return (next, .none)
        }
        if isDegraded(level) {
            // Degraded again → wipe the recovery timer.
            var next = state
            next.recoveringSince = nil
            return (next, .none)
        }
        // `.fair` HOLDS the recovery timer: a brief mid-recovery dip shouldn't
        // restart the whole recovery window.
        return (state, .none)
    }
}

// MARK: - Actuation contract

/// Performs the actual media transition the controller decides on. Implemented
/// by `CallManager` (WebRTC downgrade/upgrade + peer notification + renegotiation).
/// `AnyObject` so the controller can hold it weakly (the actuator owns the controller).
/// `Sendable` : l'existential `any VideoSurvivalActuating` est capturé dans le
/// `group.addTask` concurrent de `performTransition` (course renégociation vs
/// timeout). Sous SWIFT_VERSION=6.0 + défaut MainActor, capturer un type non-Sendable
/// dans une closure @Sendable est une erreur de data-race. Les deux conformeurs
/// (`CallManager`, `MockVideoSurvivalActuator`) sont `@MainActor` donc déjà Sendable.
protocol VideoSurvivalActuating: AnyObject, Sendable {
    /// Stop sending outbound video (audio-only) WITHOUT changing the user's
    /// camera intent. Returns true on success.
    func suspendOutboundVideo() async -> Bool
    /// Re-acquire the camera and resume sending video. Returns true on success.
    func resumeOutboundVideo() async -> Bool
}

protocol VideoSurvivalControlling: AnyObject {
    var isVideoSuspended: Bool { get }
    /// Feed one quality sample (one per monitor tick).
    func handle(level: VideoQualityLevel, userWantsVideo: Bool)
    /// Forget all survival state — call on camera-off and on call teardown so
    /// state never leaks across calls over the device's lifetime.
    func reset()
}

// MARK: - Controller

@MainActor
final class VideoSurvivalController: ObservableObject, VideoSurvivalControlling {
    /// Outbound video auto-suspended by survival (distinct from user camera intent).
    @Published private(set) var isVideoSuspended: Bool = false

    private let policy: VideoSurvivalPolicy
    /// Monotonic time source (seconds). Defaults to `systemUptime` — immune to
    /// wall-clock jumps, which matters over multi-hour calls. Injectable for tests.
    private let now: () -> TimeInterval
    private weak var actuator: VideoSurvivalActuating?
    private var state: VideoSurvivalState = .initial
    /// At most one media transition (renegotiation) in flight at a time, to avoid
    /// SDP offer glare and Task pile-up on a flaky link.
    private var isTransitioning = false
    /// Default hard cap (seconds) on a single suspend/resume renegotiation. A
    /// renegotiation can hang on a dead link; without this, `isTransitioning`
    /// would stay `true` forever and freeze survival for the rest of a
    /// (potentially multi-hour) call. Named + centralised here rather than left
    /// as a literal in `init`. `nonisolated` so the init default argument can
    /// read it without hopping onto the main actor.
    nonisolated static let defaultTransitionTimeout: TimeInterval = 20

    /// Per-instance cap on a single suspend/resume renegotiation. Injectable for
    /// tests; defaults to `defaultTransitionTimeout`.
    private let transitionTimeout: TimeInterval

    init(
        actuator: VideoSurvivalActuating? = nil,
        policy: VideoSurvivalPolicy = VideoSurvivalPolicy(),
        now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
        transitionTimeout: TimeInterval = VideoSurvivalController.defaultTransitionTimeout
    ) {
        self.actuator = actuator
        self.policy = policy
        self.now = now
        self.transitionTimeout = transitionTimeout
    }

    /// Wire the actuator after `self` exists (owner constructs the controller in
    /// its own init before it can pass `self`).
    func attach(actuator: VideoSurvivalActuating) {
        self.actuator = actuator
    }

    func handle(level: VideoQualityLevel, userWantsVideo: Bool) {
        // Don't advance the machine mid-transition: suspend/resume is async and
        // renegotiates; the next tick re-evaluates against settled state.
        guard !isTransitioning else { return }

        let (next, action) = policy.reduce(state, level: level, at: now(), userWantsVideo: userWantsVideo)
        state = next

        switch action {
        case .none:
            break
        case .suspend:
            performTransition(suspend: true)
        case .resume:
            performTransition(suspend: false)
        }
    }

    /// Incrémenté par `reset()` : une complétion de transition encore en vol
    /// devient orpheline et no-op. Sans ce token, la complétion posait
    /// `isVideoSuspended = suspend` APRÈS le reset de fin d'appel — un nouvel
    /// appel démarré entre-temps héritait d'un état « vidéo suspendue »
    /// fantôme qu'aucun resume ne viendrait lever.
    private var generation = 0
    /// Cancelled by `reset()` so a call ending mid-transition doesn't leave the
    /// suspend/resume renegotiation running for up to `transitionTimeout` (20s
    /// default) after the call has visibly ended — cancellation makes the
    /// `Task.sleep` timeout race resolve immediately instead of waiting it out.
    private var transitionTask: Task<Void, Never>?

    func reset() {
        state = .initial
        isVideoSuspended = false
        isTransitioning = false
        generation += 1
        transitionTask?.cancel()
        transitionTask = nil
    }

    private func performTransition(suspend: Bool) {
        guard let actuator else { return }
        isTransitioning = true
        let timeoutSeconds = transitionTimeout
        let generation = self.generation
        transitionTask = Task { [weak self] in
            // Race the (possibly hanging) renegotiation against a timeout. A
            // timeout is treated as a failure: we revert and let a later sustained
            // streak retry, and crucially `isTransitioning` is always cleared.
            let ok: Bool = await withTaskGroup(of: Bool?.self) { group in
                group.addTask {
                    suspend
                        ? await actuator.suspendOutboundVideo()
                        : await actuator.resumeOutboundVideo()
                }
                group.addTask {
                    try? await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
                    return nil // timeout sentinel
                }
                defer { group.cancelAll() }
                for await result in group {
                    if let value = result { return value } // actuator finished first
                    return false                           // timeout won
                }
                return false
            }
            guard let self, generation == self.generation else { return }
            if ok {
                self.isVideoSuspended = suspend
            } else {
                // Revert so a later sustained streak retries the transition.
                if suspend {
                    self.state.isSending = true
                    self.state.degradedSince = nil
                } else {
                    self.state.isSending = false
                    self.state.recoveringSince = nil
                }
            }
            self.isTransitioning = false
            self.transitionTask = nil
        }
    }
}
