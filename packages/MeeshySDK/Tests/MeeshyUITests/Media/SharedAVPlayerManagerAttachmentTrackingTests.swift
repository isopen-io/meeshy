import XCTest
@testable import MeeshyUI

/// Covers the P1 audit fix: `load(urlString:)` used to call `cleanup()`
/// internally, which reset `attachmentId` to `nil` — but every caller set
/// `manager.attachmentId` BEFORE calling `load()`, so the association was
/// silently wiped on every single load and `reportWatchProgress` never fired
/// (`guard let attId = attachmentId else { return }` always failed). The fix
/// makes `attachmentId` a parameter of `load(urlString:attachmentId:)`, applied
/// AFTER the internal `cleanup()` call.
final class SharedAVPlayerManagerAttachmentTrackingTests: XCTestCase {

    func test_load_setsAttachmentId_survivingInternalCleanup() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            // Simulate a stale value left over from a previous attachment —
            // proves `cleanup()` really does wipe it before the new value applies.
            m.attachmentId = "stale-id"

            m.load(urlString: "https://example.com/reel-a.mp4", attachmentId: "correct-id")

            XCTAssertEqual(m.attachmentId, "correct-id")
            m.stop()
        }
    }

    func test_load_withoutAttachmentId_defaultsNil() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            m.attachmentId = "stale-id"

            m.load(urlString: "https://example.com/reel-b.mp4")

            XCTAssertNil(m.attachmentId)
            m.stop()
        }
    }

    func test_load_sameActiveURL_isNoOp_doesNotOverwriteAttachmentId() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            m.load(urlString: "https://example.com/reel-c.mp4", attachmentId: "first-id")
            XCTAssertEqual(m.attachmentId, "first-id")

            // Re-driving the SAME url (e.g. a re-render calling `load` again while
            // still attached to this reel) must not tear down the association.
            m.load(urlString: "https://example.com/reel-c.mp4", attachmentId: "different-id")

            XCTAssertEqual(m.attachmentId, "first-id")
            m.stop()
        }
    }

    func test_stop_resetsAttachmentId() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.load(urlString: "https://example.com/reel-d.mp4", attachmentId: "some-id")
            XCTAssertEqual(m.attachmentId, "some-id")

            m.stop()

            XCTAssertNil(m.attachmentId)
        }
    }
}
