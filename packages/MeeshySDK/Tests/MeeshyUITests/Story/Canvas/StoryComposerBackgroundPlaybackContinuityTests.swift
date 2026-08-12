import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Contrat de continuité du média de FOND pendant l'édition (user 2026-07-30) :
///
/// « Si une vidéo ou un son joue en arrière-plan, il ne faut recommencer la
///   lecture QUE si on ajoute ou supprime un objet du canvas — jamais quand on
///   bouge ou qu'on édite un objet existant. »
///
/// Le levier est `currentSlideKey` : `ReaderAudioMixer.play(originHost:slideKey:)`
/// reprend le transport à clé égale, et RE-PLANIFIE toute la passe (donc repart
/// de zéro) à clé neuve. La clé était indexée sur `slideContentRevision`, un
/// compteur incrémenté à CHAQUE réassignation de `slide` — donc à chaque lettre
/// tapée dans un texte. Elle l'est désormais sur `slideAudioRevision`, qui ne
/// bouge qu'avec la COMPOSITION de la slide.
@MainActor
final class StoryComposerBackgroundPlaybackContinuityTests: XCTestCase {

    // MARK: - Empreinte structurelle (règle pure)

    func test_structureFingerprint_isStable_whenTextContentChanges() {
        let before = Fixtures.slide(texts: [Fixtures.text(id: "t1", text: "H")])
        var after = before
        after.effects.textObjects[0].text = "He"

        XCTAssertEqual(StoryCanvasUIView.structureFingerprint(of: before),
                       StoryCanvasUIView.structureFingerprint(of: after),
                       "Taper une lettre ne change pas la composition de la slide")
    }

    func test_structureFingerprint_isStable_whenObjectMoves() {
        let before = Fixtures.slide(texts: [Fixtures.text(id: "t1")])
        var after = before
        after.effects.textObjects[0].x = 0.2
        after.effects.textObjects[0].y = 0.9
        after.effects.textObjects[0].scale = 2.0
        after.effects.textObjects[0].rotation = 45

        XCTAssertEqual(StoryCanvasUIView.structureFingerprint(of: before),
                       StoryCanvasUIView.structureFingerprint(of: after),
                       "Déplacer / redimensionner / tourner un objet n'est pas une mutation de composition")
    }

    func test_structureFingerprint_isStable_whenZOrderChanges() {
        let before = Fixtures.slide(texts: [Fixtures.text(id: "t1"), Fixtures.text(id: "t2")])
        var after = before
        // `bringForegroundToFront` réordonne le tableau ET réécrit les zIndex.
        after.effects.textObjects.reverse()
        after.effects.textObjects[0].zIndex = 9

        XCTAssertEqual(StoryCanvasUIView.structureFingerprint(of: before),
                       StoryCanvasUIView.structureFingerprint(of: after),
                       "L'empreinte est triée : remonter un élément au premier plan ne relance pas le son")
    }

    func test_structureFingerprint_changesWhenObjectAdded() {
        let before = Fixtures.slide(texts: [Fixtures.text(id: "t1")])
        var after = before
        after.effects.textObjects.append(Fixtures.text(id: "t2"))

        XCTAssertNotEqual(StoryCanvasUIView.structureFingerprint(of: before),
                          StoryCanvasUIView.structureFingerprint(of: after))
    }

    func test_structureFingerprint_changesWhenObjectRemoved() {
        let before = Fixtures.slide(texts: [Fixtures.text(id: "t1"), Fixtures.text(id: "t2")])
        var after = before
        after.effects.textObjects.removeLast()

        XCTAssertNotEqual(StoryCanvasUIView.structureFingerprint(of: before),
                          StoryCanvasUIView.structureFingerprint(of: after))
    }

    func test_structureFingerprint_changesWhenAudioBecomesBackground() {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [StoryAudioPlayerObject(id: "a1", isBackground: false)]
        let before = StorySlide(id: "s", effects: effects, duration: 5)
        var after = before
        after.effects.audioPlayerObjects?[0].isBackground = true

        XCTAssertNotEqual(StoryCanvasUIView.structureFingerprint(of: before),
                          StoryCanvasUIView.structureFingerprint(of: after),
                          "Basculer un clip en fond change réellement la composition sonore")
    }

    func test_structureFingerprint_isStable_whenAudioVolumeChanges() {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [StoryAudioPlayerObject(id: "a1", volume: 0.4, isBackground: true)]
        let before = StorySlide(id: "s", effects: effects, duration: 5)
        var after = before
        after.effects.audioPlayerObjects?[0].volume = 0.9

        XCTAssertEqual(StoryCanvasUIView.structureFingerprint(of: before),
                       StoryCanvasUIView.structureFingerprint(of: after),
                       "Le volume est une VALEUR : le curseur ne doit pas rembobiner la musique")
    }

    // MARK: - Clé de slide vue du canvas

    func test_slideKey_survivesKeystrokes() {
        let canvas = makeCanvas(slide: Fixtures.slide(texts: [Fixtures.text(id: "t1", text: "H")]))
        let keyBefore = canvas.currentSlideKey

        for text in ["He", "Hel", "Hell", "Hello"] {
            var next = canvas.slide
            next.effects.textObjects[0].text = text
            canvas.slide = next
        }

        XCTAssertEqual(canvas.currentSlideKey, keyBefore,
                       "5 frappes = 5 didSet, mais AUCUNE re-planification audio")
        XCTAssertEqual(canvas.slideContentRevision, 4,
                       "Le compteur de didSet, lui, suit bien les réassignations")
    }

    func test_slideKey_survivesDragAndResize() {
        let canvas = makeCanvas(slide: Fixtures.slide(texts: [Fixtures.text(id: "t1")]))
        let keyBefore = canvas.currentSlideKey

        var next = canvas.slide
        next.effects.textObjects[0].x = 0.1
        next.effects.textObjects[0].scale = 3.0
        canvas.slide = next

        XCTAssertEqual(canvas.currentSlideKey, keyBefore)
    }

    func test_slideKey_changesWhenObjectIsAdded() {
        let canvas = makeCanvas(slide: Fixtures.slide(texts: [Fixtures.text(id: "t1")]))
        let keyBefore = canvas.currentSlideKey

        var next = canvas.slide
        next.effects.textObjects.append(Fixtures.text(id: "t2"))
        canvas.slide = next

        XCTAssertNotEqual(canvas.currentSlideKey, keyBefore)
    }

    func test_slideKey_changesWhenObjectIsRemoved() {
        let canvas = makeCanvas(slide: Fixtures.slide(texts: [Fixtures.text(id: "t1"),
                                                              Fixtures.text(id: "t2")]))
        let keyBefore = canvas.currentSlideKey

        var next = canvas.slide
        next.effects.textObjects.removeLast()
        canvas.slide = next

        XCTAssertNotEqual(canvas.currentSlideKey, keyBefore)
    }

    /// Le seed du fingerprint à l'`init` est ce qui empêche la PREMIÈRE frappe
    /// de compter comme un changement de composition (empreinte vide → réelle).
    func test_firstMutationAfterInit_doesNotBumpAudioRevision() {
        let canvas = makeCanvas(slide: Fixtures.slide(texts: [Fixtures.text(id: "t1", text: "H")]))
        XCTAssertEqual(canvas.slideAudioRevision, 0)

        var next = canvas.slide
        next.effects.textObjects[0].text = "Ha"
        canvas.slide = next

        XCTAssertEqual(canvas.slideAudioRevision, 0,
                       "L'empreinte est semée à l'init — la première frappe ne relance rien")
    }

    // MARK: - Points de reset autorisés : l'outil timeline

    func test_enteringTimelinePreview_thenLeaving_liftsTheAudioGate() {
        let canvas = makeCanvas(slide: Fixtures.slide(texts: [Fixtures.text(id: "t1")]))
        canvas.lastAudioConfigRevision = canvas.slideAudioRevision

        canvas.setTimelinePreview(seconds: 1.0)

        XCTAssertNil(canvas.lastAudioConfigRevision,
                     "Ouvrir l'outil timeline est un point de reset : la garde tombe pour que la fermeture re-planifie")
        XCTAssertFalse(canvas._readerAudioMixerForTesting.hasStartedPlayback,
                       "Le mixer canvas est ARRÊTÉ pendant la preview — l'engine timeline possède le son")
    }

    // MARK: - Helpers

    private func makeCanvas(slide: StorySlide) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        return view
    }

    private enum Fixtures {
        static func text(id: String, text: String = "Hello") -> StoryTextObject {
            StoryTextObject(id: id, text: text, x: 0.5, y: 0.5, fontSize: 32.0)
        }

        static func slide(texts: [StoryTextObject]) -> StorySlide {
            var effects = StoryEffects()
            effects.textObjects = texts
            return StorySlide(id: "slide-continuity", effects: effects, duration: 5, order: 0)
        }
    }
}
