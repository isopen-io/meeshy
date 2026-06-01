import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Régression 2026-06-01 : le contrôle « Fond du texte » (TextEditToolOptions /
/// TextBackgroundStylePicker) écrit `backgroundStyle = .solid(hex:)` AVEC
/// `textBg = nil`. Le composite ThumbHash (`StorySlideRenderer`) lisait seulement
/// le champ legacy `textBg` → le fond du texte (la boîte) était absent du hash et
/// du composite, alors que le canvas (`StoryTextLayer`) l'affiche via
/// `resolvedBackgroundStyle`. Source de vérité unique = `resolvedBackgroundStyle`.
@MainActor
final class StorySlideRendererTextBackgroundTests: XCTestCase {

    func test_solidBackgroundStyle_withNilLegacyTextBg_returnsColor() {
        let t = StoryTextObject(id: "1", text: "Bonjour",
                                textColor: "FFFFFF", textBg: nil,
                                backgroundStyle: .solid(hex: "000000"))
        let c = StorySlideRenderer.compositeBackgroundColor(for: t)
        XCTAssertNotNil(c, "le fond solide moderne (backgroundStyle) doit être rendu dans le composite")
        XCTAssertEqual(c?.cgColor.alpha ?? 0, 1, accuracy: 0.01, "solide = opaque, parité canvas")
    }

    func test_legacyTextBg_stillRendered() {
        let t = StoryTextObject(id: "2", text: "x", textBg: "FF0000")
        XCTAssertNotNil(StorySlideRenderer.compositeBackgroundColor(for: t),
                        "le champ legacy textBg reste rendu (rétrocompat)")
    }

    func test_noBackground_returnsNil() {
        let t = StoryTextObject(id: "3", text: "x")
        XCTAssertNil(StorySlideRenderer.compositeBackgroundColor(for: t))
    }

    func test_glassBackground_returnsTranslucent() {
        let t = StoryTextObject(id: "4", text: "x", backgroundStyle: .glass(radius: 24))
        let c = StorySlideRenderer.compositeBackgroundColor(for: t)
        XCTAssertNotNil(c)
        XCTAssertLessThan(c?.cgColor.alpha ?? 1, 1, "le glass est approximé translucide")
    }
}
