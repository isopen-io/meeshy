import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StorySlideRendererFontTests: XCTestCase {
    func test_compositeFont_customFontFamily_isHonored() {
        let text = StoryTextObject(id: "t1", text: "Hi", fontFamily: "Georgia")

        let font = StorySlideRenderer.compositeFont(for: text, fontSize: 24)

        XCTAssertEqual(font.familyName, "Georgia",
                       "the low-fidelity composite must honour a custom font, not silently fall back to system")
    }

    func test_compositeFont_typewriterStyle_resolvesMonospacedFont_notBoldSystemFallback() {
        let text = StoryTextObject(id: "t1", text: "Hi", textStyle: "typewriter")

        let font = StorySlideRenderer.compositeFont(for: text, fontSize: 24)

        XCTAssertTrue(font.fontDescriptor.symbolicTraits.contains(.traitMonoSpace),
                     "typewriter must resolve to a monospaced font — pre-fix it always fell back to bold system")
    }

    func test_compositeFont_systemFamilyNoOverride_matchesResolverDirectly() {
        let text = StoryTextObject(id: "t1", text: "Hi")

        let font = StorySlideRenderer.compositeFont(for: text, fontSize: 24)

        XCTAssertEqual(font, StoryTextFontResolver.resolveFont(forTextObject: text, size: 24),
                       "no drift from the canvas's own font resolution for the default case")
    }
}
