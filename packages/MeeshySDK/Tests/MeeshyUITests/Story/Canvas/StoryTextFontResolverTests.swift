import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTextFontResolverTests: XCTestCase {

    private func makeText(style: String, family: String = "system") -> StoryTextObject {
        // Ordre des arguments = ordre de déclaration de l'init : fontFamily avant textStyle.
        StoryTextObject(id: "t1", text: "Hello", fontFamily: family, textStyle: style)
    }

    func test_resolveFont_boldStyle_isHeaviestWeight() {
        let font = StoryTextFontResolver.resolveFont(forTextObject: makeText(style: "bold"), size: 40)
        XCTAssertEqual(font.pointSize, 40, accuracy: 0.01)
        let traits = font.fontDescriptor.object(forKey: .traits) as? [UIFontDescriptor.TraitKey: Any]
        let weight = traits?[.weight] as? CGFloat ?? 0
        XCTAssertEqual(weight, UIFont.Weight.black.rawValue, accuracy: 0.01)
    }

    func test_resolveFont_typewriterStyle_isMonospaced() {
        let font = StoryTextFontResolver.resolveFont(forTextObject: makeText(style: "typewriter"), size: 24)
        XCTAssertTrue(font.fontDescriptor.symbolicTraits.contains(.traitMonoSpace))
    }

    func test_resolveFont_unknownStyle_fallsBackToSystem() {
        let font = StoryTextFontResolver.resolveFont(forTextObject: makeText(style: "classic"), size: 18)
        XCTAssertEqual(font.pointSize, 18, accuracy: 0.01)
    }

    func test_resolveFont_weightOverride_overridesStyleDerivedWeight() {
        // Style "bold" derives .black; an explicit "thin" override must win.
        let text = StoryTextObject(id: "t1", text: "Hi", textStyle: "bold", fontWeight: "thin")
        let font = StoryTextFontResolver.resolveFont(forTextObject: text, size: 40)
        let traits = font.fontDescriptor.object(forKey: .traits) as? [UIFontDescriptor.TraitKey: Any]
        let weight = traits?[.weight] as? CGFloat ?? 0
        XCTAssertEqual(weight, UIFont.Weight.thin.rawValue, accuracy: 0.01)
    }

    func test_resolveFont_noWeightOverride_keepsStyleWeight() {
        // Without an override, "bold" stays .black (legacy behavior preserved).
        let font = StoryTextFontResolver.resolveFont(forTextObject: makeText(style: "bold"), size: 40)
        let traits = font.fontDescriptor.object(forKey: .traits) as? [UIFontDescriptor.TraitKey: Any]
        let weight = traits?[.weight] as? CGFloat ?? 0
        XCTAssertEqual(weight, UIFont.Weight.black.rawValue, accuracy: 0.01)
    }
}
