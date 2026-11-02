import XCTest
@testable import MeeshySDK

/// #11288 — d'où reprend un fichier lisible : de la fin d'une tête que le
/// serveur a servie par plage, du début sinon, et nulle part s'il est entier.
final class ProgressiveMediaDownloadContinuationTests: XCTestCase {

    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ProgressiveMediaDownloadContinuationTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    private func download() throws -> ProgressiveMediaDownload {
        try ProgressiveMediaDownload(stagingFile: tempDir.appendingPathComponent(UUID().uuidString))
    }

    func test_freshDownload_startsFromTheFirstByte() throws {
        XCTAssertEqual(try download().prepareContinuation(), .resume(from: 0))
    }

    func test_rangedHead_resumesWhereItStopped_andKeepsItsBytes() throws {
        let head = try download()
        head.respond(expectedBytes: 10, mimeType: "video/mp4", resumable: true)
        try head.append(Data([1, 2, 3, 4]))
        head.closeWriting()

        XCTAssertEqual(try head.prepareContinuation(), .resume(from: 4))
        try head.append(Data([5, 6]))
        XCTAssertEqual(try head.read(offset: 0, length: 6), Data([1, 2, 3, 4, 5, 6]))
    }

    func test_headThatIsTheWholeFile_needsNoContinuation() throws {
        let head = try download()
        head.respond(expectedBytes: 3, mimeType: "video/mp4", resumable: true)
        try head.append(Data([1, 2, 3]))
        head.closeWriting()

        XCTAssertEqual(try head.prepareContinuation(), .complete)
    }

    func test_partialWithoutRange_startsOver_fromAnEmptyFile() throws {
        let partial = try download()
        partial.respond(expectedBytes: 10, mimeType: "video/mp4", resumable: false)
        try partial.append(Data([9, 9, 9]))
        partial.closeWriting()

        XCTAssertEqual(try partial.prepareContinuation(), .resume(from: 0))
        XCTAssertEqual(partial.snapshot.file.availableBytes, 0)
        XCTAssertFalse(partial.snapshot.hasResponded)
        try partial.append(Data([1]))
        XCTAssertEqual(try partial.read(offset: 0, length: 4), Data([1]))
    }
}
