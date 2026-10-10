#if os(iOS)
import AVFoundation
import Foundation
import Testing
@testable import MeeshySDK

/// **Le bail de lecture (#9702)** — `activatePlaybackSync` payait un
/// `setActive(true)` synchrone, sur le fil principal, à CHAQUE balayage de
/// réel, pour une session déjà active dans la bonne configuration. Il n'est
/// plus sauté que lorsque ce coordinateur tient le bail d'une activation
/// identique, et tout ce qui peut retirer la session le révoque.
@Suite(.serialized)
struct MediaSessionCoordinatorPlaybackLeaseTests {

    @Test func activates_whenNoLeaseIsHeld() {
        #expect(MediaSessionCoordinator.shouldActivatePlayback(configurationDiffers: false, leaseHeld: false))
    }

    @Test func activates_whenTheConfigurationDiffers_evenUnderLease() {
        #expect(MediaSessionCoordinator.shouldActivatePlayback(configurationDiffers: true, leaseHeld: true))
    }

    @Test func skipsActivation_onlyUnderLeaseWithTheSameConfiguration() {
        #expect(!MediaSessionCoordinator.shouldActivatePlayback(configurationDiffers: false, leaseHeld: true))
    }

    @Test func aCallEdgeRevokesTheLease() {
        let coordinator = MediaSessionCoordinator.shared
        coordinator.playbackLeaseHeld = true
        coordinator.setCallActive(true)
        #expect(!coordinator.playbackLeaseHeld)

        coordinator.playbackLeaseHeld = true
        coordinator.setCallActive(false)
        #expect(!coordinator.playbackLeaseHeld)
    }

    @Test func deactivationRevokesTheLease() {
        let coordinator = MediaSessionCoordinator.shared
        coordinator.playbackLeaseHeld = true
        coordinator.deactivatePlaybackSync()
        #expect(!coordinator.playbackLeaseHeld)
    }

    @Test func backgroundTeardownRevokesTheLease() async {
        let coordinator = MediaSessionCoordinator.shared
        coordinator.playbackLeaseHeld = true
        await coordinator.deactivateForBackground()
        #expect(!coordinator.playbackLeaseHeld)
    }

    @Test func aSystemInterruptionRevokesTheLease() {
        let coordinator = MediaSessionCoordinator.shared
        coordinator.activatePlaybackSync(options: [.duckOthers])
        coordinator.playbackLeaseHeld = true

        NotificationCenter.default.post(
            name: AVAudioSession.interruptionNotification,
            object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue]
        )

        #expect(!coordinator.playbackLeaseHeld)
        coordinator.deactivatePlaybackSync()
    }
}
#endif
