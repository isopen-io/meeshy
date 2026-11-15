import XCTest
@testable import MeeshySDK

/// #11288 — le registre des TÊTES amorcées : une par clé, bornées, rendues
/// au transfert qui les reprend, oubliées à la purge.
final class ProgressiveHeadLedgerTests: XCTestCase {

    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ProgressiveHeadLedgerTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    private func download() throws -> ProgressiveMediaDownload {
        try ProgressiveMediaDownload(stagingFile: tempDir.appendingPathComponent(UUID().uuidString))
    }

    private func settled() -> Task<URLResponse?, Never> {
        Task { nil }
    }

    func test_begin_holdsTheKey_andTakeHandsTheHeadOver() throws {
        var ledger = ProgressiveHeadLedger(limit: 4)
        let head = try download()

        ledger.begin(fileKey: "a", download: head, response: settled())

        XCTAssertTrue(ledger.holds("a"))
        XCTAssertTrue(ledger.take("a")?.download === head)
        XCTAssertFalse(ledger.holds("a"), "une tête reprise n'appartient plus au registre")
        XCTAssertNil(ledger.take("a"))
    }

    func test_beyondItsLimit_theOldestHeadIsForgotten() throws {
        var ledger = ProgressiveHeadLedger(limit: 2)

        ledger.begin(fileKey: "a", download: try download(), response: settled())
        ledger.begin(fileKey: "b", download: try download(), response: settled())
        let dropped = ledger.begin(fileKey: "c", download: try download(), response: settled())

        XCTAssertEqual(dropped.count, 1)
        XCTAssertFalse(ledger.holds("a"))
        XCTAssertTrue(ledger.holds("b"))
        XCTAssertTrue(ledger.holds("c"))
    }

    func test_remove_forgetsTheHead_andHandsItBackToCancel() throws {
        var ledger = ProgressiveHeadLedger(limit: 4)
        ledger.begin(fileKey: "a", download: try download(), response: settled())
        ledger.begin(fileKey: "b", download: try download(), response: settled())

        XCTAssertEqual(ledger.remove(["a"]).count, 1)
        XCTAssertFalse(ledger.holds("a"))
        XCTAssertEqual(ledger.removeAll().count, 1)
        XCTAssertFalse(ledger.holds("b"))
    }

    func test_forget_dropsAHeadThatCannotBeResumed() throws {
        var ledger = ProgressiveHeadLedger(limit: 4)
        let head = try download()
        ledger.begin(fileKey: "a", download: head, response: settled())

        ledger.forget(fileKey: "a", download: head)

        XCTAssertFalse(ledger.holds("a"))
    }

    func test_forget_ignoresANewerHeadUnderTheSameKey() throws {
        var ledger = ProgressiveHeadLedger(limit: 4)
        let old = try download()
        ledger.begin(fileKey: "a", download: old, response: settled())
        _ = ledger.take("a")
        ledger.begin(fileKey: "a", download: try download(), response: settled())

        ledger.forget(fileKey: "a", download: old)

        XCTAssertTrue(ledger.holds("a"))
    }
}
