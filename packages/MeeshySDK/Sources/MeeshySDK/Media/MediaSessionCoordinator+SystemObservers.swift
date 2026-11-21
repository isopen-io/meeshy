#if os(iOS)
import AVFoundation
import Foundation
import os

private let logger = MeeshyLog.logger(.audioSession, subsystem: .legacySDK)

/// Les observateurs d'interruption et de changement de route du système.
extension MediaSessionCoordinator {

    // MARK: - System observers

    /// Pose les observateurs d'interruption et de route s'ils ne le sont pas
    /// encore. Appelé par chaque chemin qui touche la session, et par tout
    /// abonné à `events` qui veut les recevoir avant sa première activation.
    /// `nonisolated` et synchrone : aucun saut d'acteur sur le fil principal,
    /// et l'événement est publié dès sa réception.
    public nonisolated func observeSystemEvents() {
        _systemObserversLock.withLock { installed in
            guard !installed else { return }
            installed = true
            let center = NotificationCenter.default
            let interruption = center.addObserver(
                forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
            ) { [weak self] notification in
                self?.forward(Self.parseInterruption(notification))
            }
            let routeChange = center.addObserver(
                forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
            ) { [weak self] notification in
                self?.forward(Self.parseRouteChange(notification))
            }
            observerTokens.mutateUnchecked { $0 += [interruption, routeChange] }
        }
    }

    nonisolated private func forward(_ event: Event?) {
        guard let event else { return }
        logger.info("Audio session event: \(String(describing: event))")
        emit(event)
        // Meeshy rend la main si rien ne reprend (#11040, j).
        if ContentSessionReleaseLaw.endsAnInterruption(event) {
            releaseAfterUnresumedInterruption()
        }
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
#endif
