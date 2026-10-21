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

    func test_composerSelectableCases_includesExceptAndOnly() {
        let cases = PostVisibility.composerSelectableCases
        XCTAssertEqual(cases, [.public, .community, .friends, .except, .only, .private])
        XCTAssertTrue(cases.contains(.except))
        XCTAssertTrue(cases.contains(.only))
    }

    func test_identifiable_idIsRawValue() {
        XCTAssertEqual(PostVisibility.only.id, "ONLY")
        XCTAssertEqual(PostVisibility.except.id, "EXCEPT")
    }

    func test_icon_nonEmptyForEveryCase() {
        for v in PostVisibility.allCases {
            XCTAssertFalse(v.icon.isEmpty)
        }
    }
}

extension PostVisibilityTests {
    @MainActor
    func test_label_resolvesFromTheMeeshyUICatalog_inEveryLocale() throws {
        for code in ["fr", "en", "de", "es", "pt-BR", "it", "ar"] {
            let path = try XCTUnwrap(Bundle.module.path(forResource: code, ofType: "lproj"), code)
            let bundle = try XCTUnwrap(Bundle(path: path), code)
            for visibility in PostVisibility.allCases {
                let label = visibility.label(in: bundle)
                XCTAssertFalse(label.isEmpty, "\(visibility) \(code)")
                XCTAssertFalse(label.hasPrefix("post.visibility."), "\(visibility) \(code)")
            }
        }
        let en = try XCTUnwrap(Bundle(path: try XCTUnwrap(Bundle.module.path(forResource: "en", ofType: "lproj"))))
        let de = try XCTUnwrap(Bundle(path: try XCTUnwrap(Bundle.module.path(forResource: "de", ofType: "lproj"))))
        XCTAssertEqual(PostVisibility.private.label(in: en), "Private")
        XCTAssertEqual(PostVisibility.friends.label(in: de), "Kontakte")
    }
}
