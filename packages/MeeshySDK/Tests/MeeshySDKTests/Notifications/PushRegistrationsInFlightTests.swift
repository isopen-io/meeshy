import XCTest
@testable import MeeshySDK

/// #18911 (audit du lot notif-ios) — la sortie de session attend la fin des
/// enregistrements de jetons push encore en vol avant de retirer ceux de
/// l'appareil : une passerelle antérieure à #18910 valide un POST traité APRÈS le
/// DELETE et recrée la ligne active du compte quitté. L'attente est bornée.
@MainActor
final class PushRegistrationsInFlightTests: XCTestCase {

    private final class Latch: @unchecked Sendable {
        private let lock = NSLock()
        private var _open = false
        var isOpen: Bool { lock.withLock { _open } }
        func open() { lock.withLock { _open = true } }
    }

    private func waitUntil(_ condition: () -> Bool) async {
        var turns = 0
        while !condition(), turns < 500 {
            turns += 1
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    private func holdUntilOpen(_ latch: Latch) async {
        while !latch.isOpen {
            try? await Task.sleep(for: .milliseconds(5))
        }
    }

    func test_settle_returnsOnlyOnceTheTrackedRegistrationHasEnded() async {
        let flights = PushRegistrationsInFlight()
        let latch = Latch()
        let post = Task { await flights.track { await self.holdUntilOpen(latch) } }
        await waitUntil { !flights.isEmpty }
        Task {
            try? await Task.sleep(for: .milliseconds(100))
            latch.open()
        }

        await flights.settle(within: .seconds(5))

        XCTAssertTrue(latch.isOpen, "le retrait ne part qu'après la réponse du POST en vol")
        XCTAssertTrue(flights.isEmpty)
        await post.value
    }

    func test_settle_givesUpAfterItsLimit() async {
        let flights = PushRegistrationsInFlight()
        let latch = Latch()
        let post = Task { await flights.track { await self.holdUntilOpen(latch) } }
        await waitUntil { !flights.isEmpty }

        await flights.settle(within: .milliseconds(100))

        XCTAssertFalse(flights.isEmpty, "un réseau lent ne retient jamais la sortie au-delà de la limite")
        latch.open()
        await post.value
    }

    func test_track_whenTheRegistrationFails_stillEndsTheFlight() async {
        let flights = PushRegistrationsInFlight()

        do {
            try await flights.track { throw MeeshyError.network(.timeout) }
            XCTFail("l'échec du POST remonte à l'appelant")
        } catch {}

        XCTAssertTrue(flights.isEmpty)
    }

    func test_settle_withNothingInFlight_returnsAtOnce() async {
        let flights = PushRegistrationsInFlight()
        let started = ContinuousClock.now

        await flights.settle(within: .seconds(5))

        XCTAssertLessThan(ContinuousClock.now - started, .seconds(1))
    }
}
