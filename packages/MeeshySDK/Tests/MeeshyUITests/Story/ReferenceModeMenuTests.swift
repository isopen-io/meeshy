import Testing
@testable import MeeshyUI
@testable import MeeshySDK

struct ReferenceModeMenuTests {

    @Test func test_symbolName_isDistinctPerMode() {
        let symbols = PostReferenceDisplay.allCases.map(\.symbolName)
        #expect(Set(symbols).count == symbols.count)
    }

    @Test func test_declarableModes_excludeInline() {
        // Le menu du chip ne propose QUE ce que le client peut déclarer.
        #expect(PostReferenceDisplay.declarable == [.pinned, .note, .silent])
    }

    @Test func test_menuLabel_isNeverEmpty() {
        for mode in PostReferenceDisplay.allCases {
            #expect(!mode.menuLabel.isEmpty)
        }
    }
}
