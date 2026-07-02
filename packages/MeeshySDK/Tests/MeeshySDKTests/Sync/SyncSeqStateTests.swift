import XCTest
import Combine
@testable import MeeshySDK

/// SyncEngine A5 — état pur de suivi du `_seq` per-user (détection de gap
/// EXACTE, cœur du bénéfice multi-device).
final class SyncSeqStateTests: XCTestCase {

    func test_firstEvent_neverReportsGap() {
        let state = SyncSeqState()
        // Aucun `lastSeq` connu → le tout premier event ne peut pas être un trou.
        XCTAssertFalse(state.detectGap(next: 5))
    }

    func test_contiguousSeq_noGap() {
        var state = SyncSeqState()
        state.record(5)
        XCTAssertFalse(state.detectGap(next: 6), "seq+1 est contigu, pas un trou")
    }

    func test_jumpAheadIsGap() {
        var state = SyncSeqState()
        state.record(5)
        XCTAssertTrue(state.detectGap(next: 7), "un saut > lastSeq+1 = events manqués")
    }

    func test_duplicateOrReorderedSeq_isNotGap() {
        var state = SyncSeqState()
        state.record(5)
        // Un event à seq <= lastSeq (doublon socket, réordonnancement) n'est
        // pas un « trou en avant » — ne déclenche pas de resync.
        XCTAssertFalse(state.detectGap(next: 5))
        XCTAssertFalse(state.detectGap(next: 4))
    }

    func test_record_advancesLastSeq() {
        var state = SyncSeqState()
        XCTAssertNil(state.lastSeq)
        state.record(10)
        XCTAssertEqual(state.lastSeq, 10)
        state.record(11)
        XCTAssertEqual(state.lastSeq, 11)
    }
}

/// A5.2 — le tracker actor émet sur `gapDetected` UNIQUEMENT quand `observe`
/// rencontre un trou (un abonné app-side y branchera une resync des
/// notifications — câblage = A5.3).
final class SyncSeqTrackerGapHookTests: XCTestCase {

    func test_gapDetected_emitsOnlyOnGap_carriesGapSeq() async {
        let tracker = SyncSeqTracker()
        var received: [Int64] = []
        let cancellable = tracker.gapDetected.publisher.sink { received.append($0) }
        defer { cancellable.cancel() }

        _ = await tracker.observe(5)   // premier event — pas de gap
        _ = await tracker.observe(6)   // contigu — pas de gap
        _ = await tracker.observe(9)   // trou (7,8 manqués) — gap
        _ = await tracker.observe(10)  // contigu — pas de gap

        // Laisse le send Combine se poser.
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(received, [9], "gapDetected doit émettre une fois, avec le seq du trou")
    }

    func test_gapDetected_silentOnNilSeq() async {
        let tracker = SyncSeqTracker()
        var count = 0
        let cancellable = tracker.gapDetected.publisher.sink { _ in count += 1 }
        defer { cancellable.cancel() }

        _ = await tracker.observe(nil)   // gateway antérieur — no-op
        _ = await tracker.observe(nil)

        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(count, 0)
    }
}
