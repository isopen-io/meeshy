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
        XCTAssertEqual(PostVisibility.acquaintances.rawValue, "ACQUAINTANCES")
        XCTAssertEqual(PostVisibility.close.rawValue, "CLOSE")
        XCTAssertEqual(PostVisibility.blood.rawValue, "BLOOD")
    }

    func test_requiresUserSelection_onlyExceptAndOnly() {
        XCTAssertTrue(PostVisibility.except.requiresUserSelection)
        XCTAssertTrue(PostVisibility.only.requiresUserSelection)
        XCTAssertFalse(PostVisibility.public.requiresUserSelection)
        XCTAssertFalse(PostVisibility.community.requiresUserSelection)
        XCTAssertFalse(PostVisibility.friends.requiresUserSelection)
        XCTAssertFalse(PostVisibility.private.requiresUserSelection)
        for circle in [PostVisibility.acquaintances, .close, .blood] {
            XCTAssertFalse(circle.requiresUserSelection)
        }
    }

    /// #13939 : une audience SERVIE que ce client ne connaît pas se lit RESTREINTE, jamais publique. Le risque
    /// inverse (un ancien client qui affichait « Public » une audience de cercle) est celui que ce lot referme.
    func test_aServedAudience_isReadFailClosed() {
        XCTAssertEqual(PostVisibility(served: "CLOSE"), .close)
        XCTAssertEqual(PostVisibility(served: "blood"), .blood, "la casse ne décide pas de l'audience")
        XCTAssertEqual(PostVisibility(served: "ACQUAINTANCES"), .acquaintances)
        XCTAssertEqual(PostVisibility(served: "ATOM"), .private)
        XCTAssertEqual(PostVisibility(served: ""), .private)
    }

    func test_composerSelectableCases_climbTheCirclesFromPublicToBlood_thenTheNamedModes() {
        let cases = PostVisibility.composerSelectableCases
        XCTAssertEqual(cases, [.public, .community, .acquaintances, .friends, .close, .blood, .except, .only, .private])
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
        let fr = try XCTUnwrap(Bundle(path: try XCTUnwrap(Bundle.module.path(forResource: "fr", ofType: "lproj"))))
        XCTAssertEqual(PostVisibility.friends.label(in: de), "Freunde")
        XCTAssertEqual(
            [PostVisibility.acquaintances, .friends, .close, .blood].map { $0.label(in: fr) },
            ["Connaissances", "Amis", "Proches", "Sang"]
        )
    }
}
