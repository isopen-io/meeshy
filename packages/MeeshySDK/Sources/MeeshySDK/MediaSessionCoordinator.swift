#if os(iOS)
import AVFoundation
import Combine
import Foundation
import os

private let logger = Logger(subsystem: "com.meeshy.sdk", category: "audio-session")

/// Coordonne l'accès à AVAudioSession entre tous les composants audio.
///
/// Actor = thread-safe garanti à la compilation. Responsible for:
/// - Activating/deactivating the shared AVAudioSession in a refcounted way
/// - Listening to system interruptions (phone calls, Siri) and route changes
///   (AirPods, headphones, Bluetooth) and rebroadcasting them so individual
///   players can pause/resume coherently
/// - Providing a single `deactivateForBackground()` entry point the app can
///   call during the scene background transition.
public actor MediaSessionCoordinator {

    public static let shared = MediaSessionCoordinator()

    public enum AudioRole: Sendable {
        case playback
        case record
        case playAndRecord
    }

    /// Events rebroadcast to players. They should pause on `.interruptionBegan`
    /// and optionally resume on `.interruptionEndedShouldResume`, and pause on
    /// `.routeChangedOldDeviceUnavailable` (unplugged headphones, etc).
    public enum Event: Sendable {
        case interruptionBegan
        case interruptionEndedShouldResume
        case interruptionEndedShouldNotResume
        case routeChangedOldDeviceUnavailable
        case routeChangedOther
        /// F3 — a VoIP call just ended (the `setCallActive` true→false edge).
        /// In-process WebRTC / RTCAudioSession teardown does NOT reliably post a
        /// system `AVAudioSession.interruptionNotification`, so media that gated
        /// itself off while `isCallActive` (story reader audio, reels) gets no
        /// `interruptionEndedShouldResume`. This explicit signal lets those
        /// SDK-internal observers re-start their gated playback. Treat it exactly
        /// like `interruptionEndedShouldResume` (resume only if still on-screen
        /// and not user-paused). SDK-internal: emitted by `setCallActive`, no
        /// dependency on the app's call layer.
        case callEndedShouldResume
    }

    private var activationCount = 0
    /// Mirror of the app's VoIP call state, pushed via `setCallActive(_:)`.
    /// While `true`, the coordinator must NOT reconfigure or tear down the
    /// shared `AVAudioSession`: the call owns it as `.playAndRecord/.voiceChat`
    /// (via RTCAudioSession) and switching the category to `.playback` mid-call
    /// mutes the microphone. `nonisolated(unsafe)` (same pattern as
    /// `CallManager.isCallActiveFlag`) so the `@MainActor` call layer can push
    /// the flag SYNCHRONOUSLY from `callState.didSet` — avoiding a `Task`-hop
    /// whose reordering across rapid call start/end could leave the flag stuck
    /// `true` (→ session never reconfigured again → post-call audio broken). A
    /// lone `Bool` write (MainActor) / read (actor executor) needs no further
    /// synchronization. Default `false` ⇒ behavior identical to before this seam.
    nonisolated(unsafe) private var callActive = false
    private var observersInstalled = false
    nonisolated(unsafe) private var observerTokens: [any NSObjectProtocol] = []

    /// Non-isolated Combine subject so observers can subscribe from any
    /// context without hopping into the actor; the subject itself is
    /// thread-safe.
    public nonisolated(unsafe) let events = PassthroughSubject<Event, Never>()

    #if DEBUG
    /// Test seam: increments `deactivateCount` from callers that want to
    /// assert whether `deactivateForBackground()` was reached via the
    /// background transition path. `nonisolated(unsafe)` so a synchronous
    /// `MediaSessionCoordinator.shared.testProbe = probe` assignment from a
    /// test running on `@MainActor` does not require an `await` hop. The
    /// probe is only read/written from `@MainActor` callers in this codebase.
    public nonisolated(unsafe) var testProbe: MediaSessionCoordinatorTestProbe?
    #endif

    private init() {}

    deinit {
        let center = NotificationCenter.default
        for token in observerTokens {
            center.removeObserver(token)
        }
    }

    /// Push the app's VoIP call state into the coordinator (call on call
    /// start/end). While active, `request`/`release` skip ALL shared-session
    /// (re)configuration so the call keeps ownership of `.playAndRecord`.
    /// `nonisolated` + synchronous so `CallManager.callState.didSet` can call it
    /// without a `Task` hop (no reorder risk). SDK stays call-layer-agnostic:
    /// the app wires this from `CallManager`.
    public nonisolated func setCallActive(_ active: Bool) {
        let wasActive = callActive
        callActive = active
        // On the true→false edge, broadcast an explicit resume signal. The system
        // interruption-ended notification is NOT reliably posted for in-process
        // WebRTC/RTCAudioSession call teardown, so SDK media that gated itself off
        // during the call (story reader audio, reels) would otherwise stay silent
        // until the next slide/page change. Emitted AFTER `callActive = false` so
        // any observer that re-checks `isCallActive` sees the cleared state.
        if wasActive && !active {
            events.send(.callEndedShouldResume)
        }
    }

    /// `true` tant qu'un appel VoIP possède la session audio (`.playAndRecord/
    /// .voiceChat` via RTCAudioSession). Lu par les composants SDK qui posent la
    /// session DIRECTEMENT (vidéo, story) afin de NE PAS la reconfigurer pendant
    /// un appel (sinon micro coupé) — source UNIQUE de l'état d'appel côté SDK,
    /// sans dépendance à la couche appel de l'app. `nonisolated` → lecture sync.
    public nonisolated var isCallActive: Bool { callActive }

    /// Configure + active SYNCHRONEMENT la session `.playback` (call-aware) — source
    /// UNIQUE de la config de session de lecture pour les composants dont `load`/`play`
    /// sont synchrones (vidéo `SharedAVPlayerManager`, story canvas/coordinator), par
    /// opposition aux moteurs voice-note qui passent par `request(role:)` async
    /// refcompté. NE TOUCHE PAS la session pendant un appel VoIP (sinon micro coupé) :
    /// le média joue alors sous la session de l'appel. `nonisolated` (I/O session +
    /// `callActive` sont synchrones). Pas de refcount : `PlaybackCoordinator` garantit
    /// déjà l'exclusion mutuelle entre lecteurs.
    public nonisolated func activatePlaybackSync(
        mode: AVAudioSession.Mode = .default,
        options: AVAudioSession.CategoryOptions
    ) {
        guard Self.shouldManageSession(callActive: callActive) else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: mode, options: options)
        try? session.setActive(true)
    }

    /// Configure SYNCHRONEMENT la session pour un enregistrement micro
    /// (voice note, voice story). Source unique call-aware : pendant un
    /// appel VoIP la session appartient à RTCAudioSession — reconfigurer
    /// en `.playAndRecord` ici casserait l'uplink micro de l'appel.
    /// Retourne `false` si la session n'a pas pu être prise (appel actif).
    @discardableResult
    public nonisolated func activateRecordingSync(
        options: AVAudioSession.CategoryOptions = [.defaultToSpeaker, .allowBluetoothA2DP]
    ) -> Bool {
        guard Self.shouldManageSession(callActive: callActive) else { return false }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: options)
            try session.setActive(true)
            return true
        } catch {
            return false
        }
    }

    /// Désactive SYNCHRONEMENT la session (call-aware : ne coupe rien pendant un appel,
    /// la session appartient alors à l'appel).
    public nonisolated func deactivatePlaybackSync() {
        guard Self.shouldManageSession(callActive: callActive) else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Pure, testable decision: may the coordinator (re)configure or tear down
    /// the shared `AVAudioSession` right now? `false` while a VoIP call owns it
    /// — switching the category to `.playback` mid-call mutes the microphone.
    /// `nonisolated static` so the call-aware contract is unit-testable without
    /// touching the real `AVAudioSession`.
    nonisolated static func shouldManageSession(callActive: Bool) -> Bool {
        !callActive
    }

    /// Active AVAudioSession pour le rôle demandé.
    public func request(role: AudioRole) async throws {
        installSystemObserversIfNeeded()
        // Never reconfigure the shared session while a VoIP call owns it (would
        // mute the mic). The refcount still tracks holders so balancing across
        // the call boundary stays coherent.
        if Self.shouldManageSession(callActive: callActive) {
            let session = AVAudioSession.sharedInstance()
            switch role {
            case .playback:
                try session.setCategory(.playback, mode: .default, options: [.duckOthers])
            case .record:
                try session.setCategory(.record, mode: .default)
            case .playAndRecord:
                // Audit P2-iOS-3 — `.allowBluetooth` is the deprecated alias for
                // HFP. Use `.allowBluetoothHFP` explicitly to align with the
                // call-path policy (CallManager L1081 / PERF-010) and remove
                // the deprecation warning.
                try session.setCategory(.playAndRecord, mode: .default,
                                        options: [.defaultToSpeaker, .allowBluetoothHFP])
            }
            try session.setActive(true)
        }
        activationCount += 1
    }

    /// Libère la session si personne d'autre ne l'utilise.
    public func release() async {
        guard activationCount > 0 else { return }
        activationCount -= 1
        if activationCount == 0, Self.shouldManageSession(callActive: callActive) {
            try? AVAudioSession.sharedInstance().setActive(false,
                options: .notifyOthersOnDeactivation)
        }
    }

    /// Called during the `.background` scene transition. Forces the session
    /// to release even if the refcount is still > 0 — individual players are
    /// expected to have been stopped by `PlaybackCoordinator.stopAll()`
    /// beforehand. Fails quietly if the session is already inactive.
    ///
    /// During an active call the audio session is owned by RTCAudioSession /
    /// CallKit, NOT by this coordinator — tearing it down here would mute a
    /// live VoIP call the moment the user locks the screen. Mirror the
    /// `callActive` guard every other method in this class already applies.
    public func deactivateForBackground() async {
        guard Self.shouldManageSession(callActive: callActive) else { return }
        activationCount = 0
        #if DEBUG
        testProbe?.deactivateCount += 1
        #endif
        do {
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: .notifyOthersOnDeactivation
            )
        } catch {
            logger.error("deactivateForBackground failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - System observers

    private func installSystemObserversIfNeeded() {
        guard !observersInstalled else { return }
        observersInstalled = true

        let center = NotificationCenter.default

        let t1 = center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self else { return }
            let event = Self.parseInterruption(notification)
            Task { await self.forward(event) }
        }
        observerTokens.append(t1)

        let t2 = center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self else { return }
            let event = Self.parseRouteChange(notification)
            Task { await self.forward(event) }
        }
        observerTokens.append(t2)
    }

    private func forward(_ event: Event?) {
        guard let event else { return }
        logger.info("Audio session event: \(String(describing: event))")
        events.send(event)
    }

    private nonisolated static func parseInterruption(_ notification: Notification) -> Event? {
        guard let info = notification.userInfo,
              let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType) else {
            return nil
        }
        switch type {
        case .began:
            return .interruptionBegan
        case .ended:
            let optionsRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
            return options.contains(.shouldResume)
                ? .interruptionEndedShouldResume
                : .interruptionEndedShouldNotResume
        @unknown default:
            return nil
        }
    }

    private nonisolated static func parseRouteChange(_ notification: Notification) -> Event? {
        guard let info = notification.userInfo,
              let rawReason = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason) else {
            return nil
        }
        switch reason {
        case .oldDeviceUnavailable:
            if let previousRoute = info[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription,
               !previousRoute.outputs.isEmpty {
                return .routeChangedOldDeviceUnavailable
            }
            return .routeChangedOther
        default:
            return .routeChangedOther
        }
    }
}

#if DEBUG
/// Probe attached to `MediaSessionCoordinator.shared.testProbe` so
/// background-transition tests can assert whether the session was
/// actually torn down via `deactivateForBackground()`. Reference type
/// so the +1 mutation done by the production code is visible to the
/// test that owns the probe.
public final class MediaSessionCoordinatorTestProbe: @unchecked Sendable {
    public var deactivateCount: Int = 0
    public init() {}
}
#endif
#endif
