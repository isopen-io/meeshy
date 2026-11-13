import XCTest
import MeeshySDK
@testable import Meeshy

/// Le vent de la combustion d'un éphémère (#17938) : QUAND le capteur tourne,
/// et ce que ses lectures deviennent — sans CoreMotion.
@MainActor
final class EphemeralBurnWindSourceTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func test_wanted_lastMinuteOrBurning_isTrue() {
        XCTAssertTrue(EphemeralBurnWindPolicy.wanted(deadlines: ["a": now.addingTimeInterval(30)], burning: false, now: now))
        XCTAssertTrue(EphemeralBurnWindPolicy.wanted(deadlines: [:], burning: true, now: now))
        XCTAssertTrue(EphemeralBurnWindPolicy.wanted(deadlines: ["a": now.addingTimeInterval(60)], burning: false, now: now))
    }

    func test_wanted_farDeadlineAndNothingBurning_isFalse() {
        XCTAssertFalse(EphemeralBurnWindPolicy.wanted(deadlines: ["a": now.addingTimeInterval(61)], burning: false, now: now))
        XCTAssertFalse(EphemeralBurnWindPolicy.wanted(deadlines: [:], burning: false, now: now))
    }

    func test_sensorRuns_reduceMotion_neverRuns() {
        XCTAssertTrue(EphemeralBurnWindPolicy.sensorRuns(wanted: true, reduceMotion: false))
        XCTAssertFalse(EphemeralBurnWindPolicy.sensorRuns(wanted: true, reduceMotion: true))
        XCTAssertFalse(EphemeralBurnWindPolicy.sensorRuns(wanted: false, reduceMotion: false))
    }

    func test_smoothedLateral_isALowPass() {
        XCTAssertEqual(EphemeralBurnWindPolicy.smoothedLateral(previous: 0, sample: 1), 0.2, accuracy: 1e-9)
        XCTAssertEqual(EphemeralBurnWindPolicy.smoothedLateral(previous: 0.2, sample: 1), 0.36, accuracy: 1e-9)
    }

    func test_rollTurns_boundedHalfTurn() {
        XCTAssertEqual(EphemeralBurnWindPolicy.rollTurns(fromRadians: Double.pi), 0.5, accuracy: 1e-9)
        XCTAssertEqual(EphemeralBurnWindPolicy.rollTurns(fromRadians: -10), -0.5, accuracy: 1e-9)
    }

    func test_ingest_roll_writesRawWind() throws {
        let source = EphemeralBurnWindSource()
        source.ingest(rollRadians: 0.63, lateralG: 0)
        XCTAssertEqual(try XCTUnwrap(source.wind.raw), 0.4, accuracy: 0.01)
    }

    func test_ingest_tinyRoll_isDeadZone() {
        let source = EphemeralBurnWindSource()
        source.ingest(rollRadians: 0.02, lateralG: 0)
        XCTAssertNil(source.wind.raw)
    }

    func test_sync_notWanted_forgetsTheWind() {
        let source = EphemeralBurnWindSource()
        source.ingest(rollRadians: 0.63, lateralG: 0)
        XCTAssertNotNil(source.wind.raw)
        source.sync(wanted: false)
        XCTAssertNil(source.wind.raw)
    }
}
