import XCTest
@testable import MeeshyUI

final class PostVisibilityTests: XCTestCase {
    func test_rawValues_matchBackendStrings() {
        XCTAssertEqual(PostVisibility.public.rawValue, "PUBLIC")
        XCTAssertEqual(PostVisibility.community.rawValue, "COMMUNITY")
        XCTAssertEqual(PostVisibility.friends.rawValue, "FRIENDS")
        XCTAssertEqual(PostVisibility.except.rawValue, "EXCEPT")
        XCTAssertEqual(PostVisibility.only.rawValue, "ONLY")
        XCTAssertEqual(PostVisibility.private.rawValue, "PRIVATE")
    }

    func test_requiresUserSelection_onlyExceptAndOnly() {
        XCTAssertTrue(PostVisibility.except.requiresUserSelection)
        XCTAssertTrue(PostVisibility.only.requiresUserSelection)
        XCTAssertFalse(PostVisibility.public.requiresUserSelection)
        XCTAssertFalse(PostVisibility.community.requiresUserSelection)
        XCTAssertFalse(PostVisibility.friends.requiresUserSelection)
        XCTAssertFalse(PostVisibility.private.requiresUserSelection)
    }

    func test_composerSelectableCases_excludesExceptAndOnly() {
        let cases = PostVisibility.composerSelectableCases
        XCTAssertEqual(cases, [.public, .community, .friends, .private])
        XCTAssertFalse(cases.contains(.except))
        XCTAssertFalse(cases.contains(.only))
    }

    func test_icon_nonEmptyForEveryCase() {
        for v in PostVisibility.allCases {
            XCTAssertFalse(v.icon.isEmpty)
        }
    }
}
