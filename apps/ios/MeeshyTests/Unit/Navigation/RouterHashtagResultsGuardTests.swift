import XCTest
@testable import Meeshy

final class RouterHashtagResultsGuardTests: XCTestCase {
    private func sourceWithoutComments(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    }

    func test_route_hasHashtagResultsCase() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Navigation/Router.swift")
        XCTAssertTrue(source.contains("case hashtagResults(tag: String)"))
    }

    func test_rootView_rendersHashtagResultsView_forHashtagResultsRoute() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/RootView.swift")
        XCTAssertTrue(source.contains("case .hashtagResults(let tag):"))
        XCTAssertTrue(source.contains("HashtagResultsView(tag: tag)"))
    }
}
