import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class MessageTextRendererHashtagTests: XCTestCase {
    func test_parse_singleHashtag_producesHashtagLinkSegment() {
        let segments = MessageTextRenderer.parse("Belle journée #paris aujourd'hui")
        guard let found = segments.first(where: { if case .hashtagLink = $0 { return true }; return false }),
              case .hashtagLink(let display, let url, let tag) = found
        else { return XCTFail("no hashtagLink segment found in \(segments)") }
        XCTAssertEqual(display, "#paris")
        XCTAssertEqual(tag, "paris")
        XCTAssertEqual(url, URL(string: "https://meeshy.me/hashtag/paris"))
    }

    func test_parse_hashtagUrl_isLowercased() {
        let segments = MessageTextRenderer.parse("#Paris")
        guard let found = segments.first(where: { if case .hashtagLink = $0 { return true }; return false }),
              case .hashtagLink(_, let url, _) = found
        else { return XCTFail("no hashtagLink segment found in \(segments)") }
        XCTAssertEqual(url, URL(string: "https://meeshy.me/hashtag/paris"))
    }

    func test_parse_hashtagInsideWord_isNotMatched() {
        let segments = MessageTextRenderer.parse("C#paris")
        XCTAssertFalse(segments.contains { if case .hashtagLink = $0 { return true }; return false })
    }

    func test_render_withHashtagColor_doesNotCrash() {
        let result = MessageTextRenderer.render("#paris", color: .primary, hashtagColor: .green)
        XCTAssertNotNil(result)
    }

    func test_render_withoutHashtagColor_matchesNilParam() {
        let withDefault = MessageTextRenderer.render("#paris", color: .primary)
        let withExplicitNil = MessageTextRenderer.render("#paris", color: .primary, hashtagColor: nil)
        XCTAssertNotNil(withDefault)
        XCTAssertNotNil(withExplicitNil)
    }
}
