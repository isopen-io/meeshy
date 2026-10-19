#if os(iOS) && DEBUG
import Testing
import Foundation
import os
@testable import MeeshySDK

/// #11039 / #11040, décision porteur j (2026-10-20) — Meeshy rend la main à
/// l'app qu'il a interrompue : en fin de lecture, après une pause, ET après
/// une interruption qui ne débouche pas sur une reprise. La libération est
/// centrale, et un lecteur Meeshy encore actif l'empêche.
struct ContentSessionReleaseTests {

    @Test func theEndOfAnInterruption_callsForTheRelease() {
        #expect(ContentSessionReleaseLaw.endsAnInterruption(.interruptionEndedShouldNotResume))
        #expect(ContentSessionReleaseLaw.endsAnInterruption(.interruptionEndedShouldResume))
        #expect(ContentSessionReleaseLaw.endsAnInterruption(.callEndedShouldResume))
    }

    @Test func neitherTheStartOfAnInterruptionNorARouteChange_callsForIt() {
        #expect(!ContentSessionReleaseLaw.endsAnInterruption(.interruptionBegan))
        #expect(!ContentSessionReleaseLaw.endsAnInterruption(.routeChangedOldDeviceUnavailable))
        #expect(!ContentSessionReleaseLaw.endsAnInterruption(.routeChangedOther))
    }

    @Test func aReleaseRuns_onlyWhenNothingResumedAndNothingStillPlays() {
        #expect(ContentSessionReleaseLaw.mayRelease(activatedSinceRequest: false, meeshyStillPlays: false))
        #expect(!ContentSessionReleaseLaw.mayRelease(activatedSinceRequest: true, meeshyStillPlays: false))
        #expect(!ContentSessionReleaseLaw.mayRelease(activatedSinceRequest: false, meeshyStillPlays: true))
    }

    @Test func aContentRelease_runsOnceItsDelayHasPassed() async {
        let coordinator = MediaSessionCoordinator.makeForTesting()
        let ran = OSAllocatedUnfairLock(initialState: 0)

        coordinator.releaseContentSession(after: 0.05, on: .global(), meeshyStillPlays: { false }) {
            ran.withLock { $0 += 1 }
        }

        #expect(await Self.settle(ran) == 1)
    }

    @Test func aMeeshyPlayerStillPlaying_preventsTheRelease() async {
        let coordinator = MediaSessionCoordinator.makeForTesting()
        let ran = OSAllocatedUnfairLock(initialState: 0)

        coordinator.releaseContentSession(after: 0.05, on: .global(), meeshyStillPlays: { true }) {
            ran.withLock { $0 += 1 }
        }

        #expect(await Self.settle(ran, atLeast: 0.4) == 0)
    }

    @Test func aPlayerResumingWithinTheGrace_cancelsTheRelease() async {
        let coordinator = MediaSessionCoordinator.makeForTesting()
        let ran = OSAllocatedUnfairLock(initialState: 0)

        coordinator.releaseContentSession(after: 0.05, on: .global(), meeshyStillPlays: { false }) {
            ran.withLock { $0 += 1 }
        }
        coordinator.noteActivationForTesting()

        #expect(await Self.settle(ran, atLeast: 0.4) == 0)
    }

    /// La libération est CENTRALE : le coordinateur la demande lui-même à la
    /// fin de toute interruption, système ou appel Meeshy — aucun lecteur n'a
    /// à s'en souvenir.
    @Test func theCoordinator_releasesAfterEveryInterruptionEnd() throws {
        let code = try Self.coordinatorSource()
        let forward = try Self.body(of: "nonisolated private func forward(", in: code)
        #expect(forward.contains("ContentSessionReleaseLaw.endsAnInterruption"))
        #expect(forward.contains("releaseAfterUnresumedInterruption()"))
        let callEdge = try Self.body(of: "public nonisolated func setCallActive(", in: code, length: 2_400)
        #expect(callEdge.contains("releaseAfterUnresumedInterruption()"))
        let pause = try Self.body(of: "public nonisolated func releaseAfterUserPause(", in: code)
        #expect(pause.contains("releaseContentSession("))
    }

    private static func settle(_ counter: OSAllocatedUnfairLock<Int>, atLeast minimum: TimeInterval = 0) async -> Int {
        let start = Date()
        let deadline = start.addingTimeInterval(5)
        while Date() < deadline {
            let value = counter.withLock { $0 }
            if value > 0 || (minimum > 0 && Date().timeIntervalSince(start) >= minimum) { return value }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return counter.withLock { $0 }
    }

    private static func body(of signature: String, in code: String, length: Int = 700) throws -> String {
        let start = try #require(code.range(of: signature))
        return String(code[start.upperBound...].prefix(length))
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
