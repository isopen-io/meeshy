import XCTest
@testable import MeeshySDK

/// Pins the reconnection schedule that used to live inline in
/// `MessageSocketManager.scheduleReconnectWithBackoff`, where it was untestable
/// (private method, live socket, `Double.random` drawn inside) and consequently
/// wrong in two ways this suite locks down.
final class SocketReconnectBackoffTests: XCTestCase {

    // MARK: - The ceiling is a ceiling

    /// The old implementation capped the ladder BEFORE multiplying by jitter
    /// (`min(delay, 60) * 0.8...1.2`), so an upper jitter draw at the top rung
    /// produced 72s — while the comment directly above it asserted that capping
    /// first made exceeding 60s impossible. Jitter now applies first, cap last.
    func test_delayNeverExceedsCeiling_evenAtMaximumJitter() {
        var sut = SocketReconnectBackoff()

        // Climb well past the ceiling, always drawing the highest jitter.
        for _ in 0..<20 {
            let delay = sut.nextDelay(jitter: 1.2)
            XCTAssertLessThanOrEqual(
                delay, SocketReconnectBackoff.ceiling,
                "A jitter draw above 1.0 must never push the delay past the documented ceiling"
            )
        }
    }

    func test_delayIsNeverNegative_forDegenerateJitter() {
        var sut = SocketReconnectBackoff()
        XCTAssertGreaterThanOrEqual(sut.nextDelay(jitter: -5), 0)
    }

    // MARK: - The ladder climbs

    func test_ladderDoublesPerConsumedRung() {
        var sut = SocketReconnectBackoff()

        // jitter == 1 isolates the ladder from the spread.
        XCTAssertEqual(sut.nextDelay(jitter: 1), 1)
        XCTAssertEqual(sut.nextDelay(jitter: 1), 2)
        XCTAssertEqual(sut.nextDelay(jitter: 1), 4)
        XCTAssertEqual(sut.nextDelay(jitter: 1), 8)
    }

    func test_ladderSaturatesAtCeiling() {
        var sut = SocketReconnectBackoff()
        for _ in 0..<10 { _ = sut.nextDelay(jitter: 1) }
        XCTAssertEqual(sut.nextDelay(jitter: 1), SocketReconnectBackoff.ceiling)
        XCTAssertEqual(sut.nextDelay(jitter: 1), SocketReconnectBackoff.ceiling)
    }

    func test_attemptCountTracksConsumedRungs() {
        var sut = SocketReconnectBackoff()
        XCTAssertEqual(sut.attempt, 0)
        _ = sut.nextDelay(jitter: 1)
        _ = sut.nextDelay(jitter: 1)
        XCTAssertEqual(sut.attempt, 2)
    }

    // MARK: - A fresh positive signal resets it

    /// The core behavioural fix. The old ladder grew once per network *restore*
    /// and reset only on a successful connection, so a user crossing a handful
    /// of tunnels arrived at stable coverage with the next reconnect already
    /// deferred a full minute — backoff charged against the link instead of
    /// against the server.
    func test_resetReturnsToFloor_soNetworkRestoreIsNotPunished() {
        var sut = SocketReconnectBackoff()
        for _ in 0..<8 { _ = sut.nextDelay(jitter: 1) } // ladder saturated at the ceiling

        sut.reset()

        XCTAssertEqual(sut.attempt, 0)
        XCTAssertEqual(
            sut.nextDelay(jitter: 1), SocketReconnectBackoff.floor,
            "After a fresh positive signal the next attempt must start from the floor"
        )
    }

    // MARK: - Jitter

    func test_randomJitterStaysWithinTwentyPercent() {
        for _ in 0..<200 {
            let jitter = SocketReconnectBackoff.randomJitter()
            XCTAssertGreaterThanOrEqual(jitter, 0.8)
            XCTAssertLessThanOrEqual(jitter, 1.2)
        }
    }

    func test_jitterSpreadsAroundTheRung() {
        var low = SocketReconnectBackoff()
        var high = SocketReconnectBackoff()
        XCTAssertLessThan(low.nextDelay(jitter: 0.8), high.nextDelay(jitter: 1.2))
    }
}
