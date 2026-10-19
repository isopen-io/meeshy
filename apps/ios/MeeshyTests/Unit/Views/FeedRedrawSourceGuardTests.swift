import XCTest
@testable import Meeshy

@MainActor
final class FeedRedrawSourceGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = MyStoriesSourceCorpus.appRoot().appendingPathComponent(relativePath)
        return MyStoriesSourceCorpus.strippingComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_storyViewModel_publishesNoCoverTick() throws {
        let directory = MyStoriesSourceCorpus.appRoot()
            .appendingPathComponent("Meeshy/Features/Main/ViewModels")
        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasPrefix("StoryViewModel") && $0.hasSuffix(".swift") }
        XCTAssertFalse(files.isEmpty)

        for file in files {
            let text = try source("Meeshy/Features/Main/ViewModels/\(file)")
            XCTAssertFalse(text.contains("receiverCoverRenderTick"), "\(file) republie encore le VM pour une cover")
        }
    }

    func test_trays_refreshCoversThroughTheirOwnSignal() throws {
        let tray = try source("Meeshy/Features/Main/Views/StoryTrayView.swift")

        XCTAssertGreaterThanOrEqual(tray.components(separatedBy: "StoryCoverRefresh(signal: viewModel.coverRenders)").count - 1, 2)
    }

    func test_trays_doNotFilterStoryGroupsInBody() throws {
        let tray = try source("Meeshy/Features/Main/Views/StoryTrayView.swift")

        XCTAssertFalse(tray.contains("storyGroups.filter"))
        XCTAssertFalse(tray.contains("storyGroups.first"))
    }

    func test_feedPostRow_observesNeitherStoryNorStatusViewModel() throws {
        let row = try source("Meeshy/Features/Main/Views/FeedPostRow.swift")

        XCTAssertFalse(row.contains("var storyViewModel: StoryViewModel"))
        XCTAssertFalse(row.contains("var statusViewModel: StatusViewModel"))
        XCTAssertFalse(row.contains("var storyViewerCoordinator"))
    }

    func test_feedView_mountsFeedPostRowEquatable() throws {
        let feed = try source("Meeshy/Features/Main/Views/FeedView.swift")
        let start = try XCTUnwrap(feed.range(of: "FeedPostRow("))
        let window = String(feed[start.upperBound...].prefix(600))

        XCTAssertTrue(window.contains(".equatable()"))
    }
}
