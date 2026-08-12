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

    // MARK: - contentDerivedDuration inclut le foreground

    func test_contentDerivedDuration_includesForegroundVideo() {
        // Un foreground vidéo de 10 s (sans pin) → le slide couvre au moins 10 s,
        // sinon sa queue serait coupée. (Avant : computedTotalDuration ne regardait
        // que le bg media → 6 s → vidéo foreground coupée.)
        let fg = StoryMediaObject(kind: .video, aspectRatio: 1.78,
                                  isBackground: false, duration: 10.0)
        let s = StorySlide(id: "s1", effects: StoryEffects(mediaObjects: [fg]), duration: 6)
        XCTAssertEqual(s.contentDerivedDuration(), 10.0, accuracy: 0.001)
        XCTAssertEqual(s.computedTotalDuration(), 10.0, accuracy: 0.001)
    }

    /// La FENÊTRE foreground (`startTime + duration`) étend la slide, pas la seule
    /// `duration`. Vidéo fg décalée à 4 s, durée 5 s → fenêtre finit à 9 s → slide
    /// ≥ 9 s. (Avant : seule `duration=5` comptait → max(6, 5)=6 s → queue tronquée.)
    func test_contentDerivedDuration_includesForegroundWindowWithStartTime() {
        let fg = StoryMediaObject(kind: .video, aspectRatio: 1.78,
                                  isBackground: false, startTime: 4.0, duration: 5.0)
        let s = StorySlide(id: "s1", effects: StoryEffects(mediaObjects: [fg]), duration: 6)
        XCTAssertEqual(s.contentDerivedDuration(), 9.0, accuracy: 0.001)
        XCTAssertEqual(s.computedTotalDuration(), 9.0, accuracy: 0.001)
    }

    // MARK: - TimelineProject round-trip (pin seulement si surcharge explicite)

    func test_timelineApply_explicitOverride_pinsTimelineDuration() {
        // Projet durée 4 s ≠ contenu auto (6 s) → surcharge auteur → pin posé.
        var s = StorySlide(id: "s1", effects: StoryEffects(), duration: 6)
        TimelineProject(slideId: "s1", slideDuration: 4.0).apply(to: &s)
        XCTAssertEqual(s.effects.timelineDuration ?? -1, 4.0, accuracy: 0.001)
        XCTAssertEqual(s.computedTotalDuration(), 4.0, accuracy: 0.001)
    }

    func test_timelineApply_matchesContent_noSpuriousPin() {
        // Projet durée == contenu auto (6 s) → pas de surcharge → AUCUN pin (reste auto).
        var s = StorySlide(id: "s1", effects: StoryEffects(), duration: 6)
        TimelineProject(slideId: "s1", slideDuration: 6.0).apply(to: &s)
        XCTAssertNil(s.effects.timelineDuration)
        XCTAssertEqual(s.computedTotalDuration(), 6.0, accuracy: 0.001)
    }

    func test_timelineProjectInit_preservesExistingPin() {
        // Un slide déjà épinglé (3 s) ré-ouvert dans le timeline → la valeur épinglée
        // est rechargée (round-trip stable), pas le contenu auto.
        let s = StorySlide(id: "s1", effects: StoryEffects(timelineDuration: 3.0), duration: 6)
        XCTAssertEqual(TimelineProject(from: s).slideDuration, 3.0, accuracy: 0.001)
    }

    // MARK: - StoryEffects.contentDerivedDuration (extracted static core)

    func test_staticContentDerivedDuration_matchesSlideInstanceMethod() {
        // The extracted static function must compute the exact same result as
        // the StorySlide instance method it now delegates to — this is a pure
        // refactor, not a behavior change (design doc 2026-07-18).
        let media = [StoryMediaObject(kind: .video, aspectRatio: 1.78, isBackground: false, startTime: 2, duration: 5)]
        var effects = StoryEffects()
        effects.mediaObjects = media
        let s = StorySlide(id: "s1", effects: effects, duration: 6)

        let viaInstance = s.contentDerivedDuration()
        let viaStatic = StoryEffects.contentDerivedDuration(
            mediaObjects: media, audioPlayerObjects: nil, textObjects: []
        )
        XCTAssertEqual(viaInstance, viaStatic, accuracy: 0.001)
        XCTAssertEqual(viaStatic, 7.0, accuracy: 0.001) // window = 2 + 5 = 7 > 6s floor
    }
}
