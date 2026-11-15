#if os(iOS) && DEBUG
import Testing
import Foundation
import AVFoundation
import Combine
import os
@testable import MeeshySDK

/// #11039 — Meeshy rend la main : après une pause, la session se libère au
/// bout d'un délai (la musique des autres apps reprend), sauf relance d'ici là.
/// #11040 — les interruptions arrivent aussi aux lecteurs qui n'activent la
/// session que par le chemin synchrone.
struct MediaSessionReleaseAfterPauseTests {

    @Test func aDelayedRelease_runsOnceTheDelayHasPassed() {
        let clock = ManualDelayedScheduler()
        let coordinator = MediaSessionCoordinator.makeForTesting(scheduleAfter: clock.scheduler)
        let ran = OSAllocatedUnfairLock(initialState: 0)

        coordinator.deactivatePlaybackDeferred(on: .global(), after: 0.05) { ran.withLock { $0 += 1 } }
        #expect(clock.delays == [0.05])
        #expect(ran.withLock { $0 } == 0)

        clock.advance()
        clock.advance()

        #expect(ran.withLock { $0 } == 1)
    }

    @Test func aRelaunchWithinTheDelay_cancelsTheRelease() {
        let clock = ManualDelayedScheduler()
        let coordinator = MediaSessionCoordinator.makeForTesting(scheduleAfter: clock.scheduler)
        let ran = OSAllocatedUnfairLock(initialState: 0)

        coordinator.deactivatePlaybackDeferred(on: .global(), after: 0.05) { ran.withLock { $0 += 1 } }
        coordinator.noteActivationForTesting()
        clock.advance()

        #expect(ran.withLock { $0 } == 0)
    }

    @Test func theUserPauseRelease_waitsTheLawsDelay() throws {
        let code = try Self.coordinatorSource()
        let start = try #require(code.range(of: "public nonisolated func releaseAfterUserPause("))
        let body = String(code[start.upperBound...].prefix(400))
        #expect(body.contains("ContentPlaybackSessionLaw.userPauseReleaseDelay"))
    }

    @Test func systemInterruptions_reachSubscribersWithoutAnyAsyncRequest() async throws {
        let coordinator = MediaSessionCoordinator.makeForTesting()
        let received = OSAllocatedUnfairLock(initialState: 0)
        let subscription = coordinator.events.sink { event in
            if case .interruptionBegan = event { received.withLock { $0 += 1 } }
        }
        defer { subscription.cancel() }

        coordinator.observeSystemEvents()
        await MainActor.run {
            NotificationCenter.default.post(
                name: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance(),
                userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        }
        try? await Task.sleep(nanoseconds: 100_000_000)

        #expect(received.withLock { $0 } >= 1)
    }

    @Test func theSynchronousPaths_installTheSystemObservers() throws {
        let code = try Self.coordinatorSource()
        for signature in ["public nonisolated func activatePlaybackSync(",
                          "private nonisolated func configureAmbientForMutedPlayback(",
                          "public func request("] {
            let start = try #require(code.range(of: signature))
            let body = String(code[start.upperBound...].prefix(700))
            #expect(body.contains("observeSystemEvents()"), "\(signature)")
        }
    }

    private static func coordinatorSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Media/MediaSessionCoordinator.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
#endif
