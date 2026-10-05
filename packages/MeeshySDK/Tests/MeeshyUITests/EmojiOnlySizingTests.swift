import XCTest
import SwiftUI
@testable import MeeshyUI

/// **Un message d'emojis seuls grossit selon leur nombre** (#9054) : la taille
/// d'un emoji dans le texte (17) ×4 jusqu'à deux, ×3 à trois, ×2 à quatre ;
/// au-delà, la bulle normale. Miroir web : `emojiOnlyOf`.
@MainActor
final class EmojiOnlySizingTests: XCTestCase {

    func test_analyze_oneOrTwoEmojis_areFourTimesTheInlineSize() {
        XCTAssertEqual(EmojiDetector.analyze("👍").fontSize, 68)
        XCTAssertEqual(EmojiDetector.analyze("👍🏽❤️").fontSize, 68)
    }

    func test_analyze_threeEmojis_areThreeTimesTheInlineSize() {
        XCTAssertEqual(EmojiDetector.analyze("🎉🎉🎉").fontSize, 51)
    }

    func test_analyze_fourEmojis_areTwiceTheInlineSize() {
        XCTAssertEqual(EmojiDetector.analyze("🎉🎉🎉🎉"), .quadruple)
        XCTAssertEqual(EmojiDetector.analyze("🎉🎉🎉🎉").fontSize, 34)
    }

    func test_analyze_fiveEmojis_isANormalBubble() {
        XCTAssertEqual(EmojiDetector.analyze("🎉🎉🎉🎉🎉"), .notEmojiOnly)
    }

    func test_analyze_mixedText_isANormalBubble() {
        XCTAssertEqual(EmojiDetector.analyze("ok 👍"), .notEmojiOnly)
    }
}

/// **La taille demandée est la taille PEINTE.** `MeeshyFont.relative` range
/// toute taille ≥ 31 pt sous `.largeTitle` (34 pt) : 90, 60 et 45 sortaient
/// tous à 34, et les multiples de #9054 l'auraient été aussi.
@MainActor
final class EmojiOnlyFontTests: XCTestCase {

    func test_emojiFont_keepsEachMultipleDistinct() {
        XCTAssertNotEqual(MeeshyFont.emoji(68), MeeshyFont.emoji(51))
        XCTAssertNotEqual(MeeshyFont.emoji(51), MeeshyFont.emoji(34))
        XCTAssertEqual(MeeshyFont.emoji(68), Font.system(size: 68))
    }
}
