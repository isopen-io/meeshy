import XCTest
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
