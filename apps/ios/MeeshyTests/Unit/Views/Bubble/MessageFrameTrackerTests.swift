import XCTest
@testable import Meeshy

@MainActor
final class MessageFrameTrackerTests: XCTestCase {

    private func makeTracker(maxEntries: Int = 200) -> MessageFrameTracker {
        MessageFrameTracker(maxEntries: maxEntries)
    }

    private func makeFrame(_ y: CGFloat) -> CGRect {
        CGRect(x: 0, y: y, width: 100, height: 50)
    }

    // MARK: - Basic update / lookup

    func test_update_merges_doesNotErase() {
        var tracker = makeTracker()
        tracker.update(["a": makeFrame(10)])
        tracker.update(["b": makeFrame(20)])

        XCTAssertEqual(tracker.frame(for: "a"), makeFrame(10))
        XCTAssertEqual(tracker.frame(for: "b"), makeFrame(20))
    }

    func test_frame_returnsCachedFrame() {
        var tracker = makeTracker()
        tracker.update(["msg1": makeFrame(100)])

        XCTAssertEqual(tracker.frame(for: "msg1"), makeFrame(100))
    }

    func test_frame_unknownId_returnsNil() {
        let tracker = makeTracker()
        XCTAssertNil(tracker.frame(for: "ghost"))
    }

    func test_update_doesNotResetExistingFrames() {
        var tracker = makeTracker()
        tracker.update(["a": makeFrame(10), "b": makeFrame(20)])
        tracker.update(["c": makeFrame(30)])

        XCTAssertEqual(tracker.frame(for: "a"), makeFrame(10),
                       "Existing entry must survive a partial update")
        XCTAssertEqual(tracker.frame(for: "b"), makeFrame(20))
        XCTAssertEqual(tracker.frame(for: "c"), makeFrame(30))
    }

    // MARK: - LRU eviction

    func test_update_evictsLRU_when200entriesExceeded() {
        var tracker = makeTracker(maxEntries: 3)
        tracker.update(["a": makeFrame(1)])
        tracker.update(["b": makeFrame(2)])
        tracker.update(["c": makeFrame(3)])
        tracker.update(["d": makeFrame(4)])

        XCTAssertNil(tracker.frame(for: "a"), "Oldest entry evicted")
        XCTAssertEqual(tracker.frame(for: "b"), makeFrame(2))
        XCTAssertEqual(tracker.frame(for: "c"), makeFrame(3))
        XCTAssertEqual(tracker.frame(for: "d"), makeFrame(4))
    }

    func test_update_mruReorderOnRepeatedAccess() {
        var tracker = makeTracker(maxEntries: 3)
        tracker.update(["a": makeFrame(1)])
        tracker.update(["b": makeFrame(2)])
        tracker.update(["c": makeFrame(3)])
        // Touch "a" → moves to MRU end. "b" is now LRU.
        tracker.update(["a": makeFrame(11)])
        // Adding "d" should evict "b", not "a".
        tracker.update(["d": makeFrame(4)])

        XCTAssertEqual(tracker.frame(for: "a"), makeFrame(11), "a moved to MRU end + value updated")
        XCTAssertNil(tracker.frame(for: "b"), "b evicted as LRU")
        XCTAssertEqual(tracker.frame(for: "c"), makeFrame(3))
        XCTAssertEqual(tracker.frame(for: "d"), makeFrame(4))
    }

    // MARK: - Removal

    func test_removeFrame_clearsBothDictAndAccessOrder() {
        var tracker = makeTracker()
        tracker.update(["a": makeFrame(1), "b": makeFrame(2)])
        tracker.removeFrame(for: "a")

        XCTAssertNil(tracker.frame(for: "a"))
        XCTAssertEqual(tracker.frame(for: "b"), makeFrame(2))
        XCTAssertFalse(tracker.accessOrder.contains("a"),
                       "LRU queue stays consistent after explicit removal")
    }
}
