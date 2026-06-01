import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Le timeline est AUTORITAIRE sur la durée du slide (décision user 2026-06-01,
/// Option A : « la timeline EST la story avec la vision temporelle » — elle rogne le
/// média). `StorySlide.computedTotalDuration()` lit `effects.timelineDuration` EN
/// PRIORITÉ ; `nil` (vieilles stories, slide jamais édité) → fallback contenu, donc
/// ZÉRO régression sur l'existant.
final class StoryTimelineDurationTests: XCTestCase {

    private func slide(timelineDuration: Double? = nil,
                       textObjects: [StoryTextObject] = []) -> StorySlide {
        let effects = StoryEffects(textObjects: textObjects, timelineDuration: timelineDuration)
        return StorySlide(id: "s1", effects: effects, duration: 6)
    }

    /// 42 mots > seuil 30 → contenu dérivé = 6 + (42-30)/6 = 8.0 s.
    private func longText() -> StoryTextObject {
        let words = Array(repeating: "mot", count: 42).joined(separator: " ")
        return StoryTextObject(id: "t1", text: words)
    }

    func test_timelineDuration_overridesStaticDefault() {
        XCTAssertEqual(slide(timelineDuration: 4.0).computedTotalDuration(), 4.0, accuracy: 0.001)
    }

    func test_timelineDuration_trimsLongerContent() {
        // Texte long (contenu → 8 s) mais timeline configuré court à 3 s → 3 s (rognage).
        let s = slide(timelineDuration: 3.0, textObjects: [longText()])
        XCTAssertEqual(s.computedTotalDuration(), 3.0, accuracy: 0.001)
    }

    func test_nilTimelineDuration_fallsBackToStaticDefault() {
        XCTAssertEqual(slide().computedTotalDuration(), 6.0, accuracy: 0.001)
    }

    func test_nilTimelineDuration_fallsBackToLongTextContent() {
        XCTAssertEqual(slide(textObjects: [longText()]).computedTotalDuration(), 8.0, accuracy: 0.001)
    }

    func test_zeroTimelineDuration_ignored_fallsBackToContent() {
        // Garde `pinned > 0` : 0 = pas d'autorité → contenu (6 s).
        XCTAssertEqual(slide(timelineDuration: 0).computedTotalDuration(), 6.0, accuracy: 0.001)
    }
}
