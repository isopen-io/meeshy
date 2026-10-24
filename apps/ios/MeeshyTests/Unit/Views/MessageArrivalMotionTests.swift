import XCTest
@testable import Meeshy

/// #11223 — décision porteur 2026-10-24 : seul le DERNIER message arrivé s'anime
/// à son entrée dans le fil. Un lot chargé d'un coup (premier rendu, pagination,
/// rattrapage de reconnexion) apparaît sans animation, et « Réduire les
/// animations » coupe tout. Même énoncé que le web (`lib/view/arrival-motion.ts`).
final class MessageArrivalMotionTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func ago(_ seconds: TimeInterval) -> Date {
        now.addingTimeInterval(-seconds)
    }

    /// Le fil du plus récent au plus ancien, comme `MessageListSnapshotPrep.messageItems`.
    private let history = ["c", "b", "a"]

    private func dates(_ pairs: [String: TimeInterval]) -> (String) -> Date? {
        let base: [String: TimeInterval] = ["a": 600, "b": 500, "c": 400]
        let all = base.merging(pairs) { _, new in new }
        return { key in all[key].map { self.ago($0) } }
    }

    private func animated(
        previous: Set<String>,
        newestFirst: [String],
        createdAt: (String) -> Date?,
        reduceMotion: Bool = false
    ) -> String? {
        MessageArrivalMotion.animated(
            previous: previous,
            newestFirst: newestFirst,
            createdAt: createdAt,
            now: now,
            reduceMotion: reduceMotion
        )
    }

    // MARK: - La règle

    func test_animated_oneRealtimeArrival_animatesIt() {
        XCTAssertEqual(
            animated(previous: Set(history), newestFirst: ["d"] + history, createdAt: dates(["d": 1])),
            "d"
        )
    }

    func test_animated_fiveArrivalsAtOnce_animatesOnlyTheNewest() {
        let burst = ["h", "g", "f", "e", "d"]
        let createdAt = dates(["d": 3, "e": 3, "f": 2, "g": 2, "h": 1])
        XCTAssertEqual(animated(previous: Set(history), newestFirst: burst + history, createdAt: createdAt), "h")
    }

    func test_animated_olderPagePrepended_animatesNothing() {
        let createdAt = dates(["x": 9_000, "y": 8_000])
        XCTAssertNil(animated(previous: Set(history), newestFirst: history + ["y", "x"], createdAt: createdAt))
    }

    func test_animated_firstRender_animatesNothing() {
        XCTAssertNil(animated(previous: [], newestFirst: ["d"] + history, createdAt: dates(["d": 1])))
    }

    func test_animated_reduceMotion_animatesNothing() {
        XCTAssertNil(animated(
            previous: Set(history),
            newestFirst: ["d"] + history,
            createdAt: dates(["d": 1]),
            reduceMotion: true
        ))
    }

    func test_animated_reconnectCatchUp_animatesNothing() {
        let createdAt = dates(["d": 300, "e": 200])
        XCTAssertNil(animated(previous: Set(history), newestFirst: ["e", "d"] + history, createdAt: createdAt))
    }

    func test_animated_nothingNew_animatesNothing() {
        XCTAssertNil(animated(previous: Set(history), newestFirst: history, createdAt: dates([:])))
    }

    // MARK: - La cause

    func test_cause_namesEachOfTheFourCauses() {
        let previous = Set(history)
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: [], newestFirst: history, createdAt: dates([:]), now: now),
            .firstRender
        )
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: ["d"] + history, createdAt: dates(["d": 1]), now: now),
            .realtime
        )
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: history + ["x"], createdAt: dates(["x": 9_000]), now: now),
            .pagination
        )
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: ["d"] + history, createdAt: dates(["d": 3_600]), now: now),
            .catchUp
        )
    }

    func test_cause_nothingNew_isNil() {
        XCTAssertNil(MessageArrivalMotion.cause(previous: Set(history), newestFirst: history, createdAt: dates([:]), now: now))
    }

    func test_cause_freshnessWindowInclusiveAtItsEdge() {
        let previous = Set(history)
        let window = MessageArrivalMotion.freshnessWindow
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: ["d"] + history, createdAt: dates(["d": window]), now: now),
            .realtime
        )
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: previous, newestFirst: ["d"] + history, createdAt: dates(["d": window + 1]), now: now),
            .catchUp
        )
    }

    func test_cause_deviceClockBehindServer_futureDateStaysRealtime() {
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: Set(history), newestFirst: ["d"] + history, createdAt: dates(["d": -5]), now: now),
            .realtime
        )
    }

    func test_cause_newestWithoutKnownDate_isCatchUp() {
        XCTAssertEqual(
            MessageArrivalMotion.cause(previous: Set(history), newestFirst: ["d"] + history, createdAt: { _ in nil }, now: now),
            .catchUp
        )
    }

    // MARK: - La cellule réalisée tard

    func test_playsOnDisplay_withinTheWindow_plays_beyond_doesNot() {
        let armedAt = now
        XCTAssertTrue(MessageArrivalMotion.playsOnDisplay(armedAt: armedAt, now: armedAt.addingTimeInterval(0.2)))
        XCTAssertFalse(MessageArrivalMotion.playsOnDisplay(
            armedAt: armedAt,
            now: armedAt.addingTimeInterval(MessageArrivalMotion.displayWindow + 0.1)
        ))
    }
}
