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
    }

    private var activationCount = 0
    private var observersInstalled = false

    /// Non-isolated Combine subject so observers can subscribe from any
    /// context without hopping into the actor; `PassthroughSubject` is
    /// documented as thread-safe but lacks a `Sendable` conformance, so
    /// we opt out of the check explicitly.
    public nonisolated(unsafe) let events = PassthroughSubject<Event, Never>()

    private init() {}

    /// Active AVAudioSession pour le rôle demandé.
    public func request(role: AudioRole) async throws {
        installSystemObserversIfNeeded()
        let session = AVAudioSession.sharedInstance()
        switch role {
        case .playback:
            try session.setCategory(.playback, mode: .default, options: [.duckOthers])
        case .record:
            try session.setCategory(.record, mode: .default)
        case .playAndRecord:
            try session.setCategory(.playAndRecord, mode: .default,
                                    options: [.defaultToSpeaker, .allowBluetooth])
        }
        try session.setActive(true)
        activationCount += 1
    }

    /// Libère la session si personne d'autre ne l'utilise.
    public func release() async {
        guard activationCount > 0 else { return }
        activationCount -= 1
        if activationCount == 0 {
            try? AVAudioSession.sharedInstance().setActive(false,
                options: .notifyOthersOnDeactivation)
        }
    }

    /// Called during the `.background` scene transition. Forces the session
    /// to release even if the refcount is still > 0 — individual players are
    /// expected to have been stopped by `PlaybackCoordinator.stopAll()`
    /// beforehand. Fails quietly if the session is already inactive.
    public func deactivateForBackground() async {
        activationCount = 0
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

        center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self else { return }
            Task { await self.handleInterruption(notification) }
        }

        center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self else { return }
            Task { await self.handleRouteChange(notification) }
        }
    }

    private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType) else {
            return
        }
        switch type {
        case .began:
            logger.info("Audio interruption began")
            events.send(.interruptionBegan)
        case .ended:
            let optionsRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
            if options.contains(.shouldResume) {
                logger.info("Audio interruption ended — should resume")
                events.send(.interruptionEndedShouldResume)
            } else {
                logger.info("Audio interruption ended — should not resume")
                events.send(.interruptionEndedShouldNotResume)
            }
        @unknown default:
            break
        }
    }

    private func handleRouteChange(_ notification: Notification) {
        guard let info = notification.userInfo,
              let rawReason = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason) else {
            return
        }
        switch reason {
        case .oldDeviceUnavailable:
            logger.info("Route change: old device unavailable")
            events.send(.routeChangedOldDeviceUnavailable)
        default:
            events.send(.routeChangedOther)
        }
    }
}
#endif
