import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// C9 Inc.2 — capture des étapes d'annulation (VM). Le trigger débouncé est
/// testé indirectement (pattern E1) ; ici on pinne le CŒUR : dédup des
/// snapshots identiques, étapes sur changements réels, seed, exclusion dessin.
@MainActor
final class StoryComposerHistoryTests: XCTestCase {

    func test_pushHistorySnapshot_dedupsUnchangedSlides() {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        vm.pushHistorySnapshot()
        vm.pushHistorySnapshot()
        XCTAssertFalse(vm.canUndoGlobal,
                       "des cycles sans mutation ne doivent pas créer d'étapes d'annulation")
    }

    func test_pushHistorySnapshot_capturesDistinctStates() {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        _ = vm.addText()
        vm.pushHistorySnapshot()
        XCTAssertTrue(vm.canUndoGlobal, "une mutation réelle crée une étape")
        XCTAssertFalse(vm.canRedoGlobal)
    }

    func test_seedHistory_resetsTrajectory() {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        _ = vm.addText()
        vm.pushHistorySnapshot()
        XCTAssertTrue(vm.canUndoGlobal)
        vm.seedHistory()
        XCTAssertFalse(vm.canUndoGlobal,
                       "le re-seed (reprise de brouillon) repart d'une trajectoire vierge")
    }

    func test_pushHistorySnapshot_skippedWhileDrawing() {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        vm.enterDrawingEditingMode()
        _ = vm.addText()
        vm.pushHistorySnapshot()
        XCTAssertFalse(vm.canUndoGlobal,
                       "pendant le dessin actif, l'UX undo dédiée prime — pas de capture globale")
        vm.exitDrawingEditingMode()
        vm.pushHistorySnapshot()
        XCTAssertTrue(vm.canUndoGlobal, "la sortie du dessin capture le résultat")
    }

    // MARK: - Inc.3 — restauration

    func test_undoGlobal_restoresPreviousState_andRedoReapplies() throws {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        let text = try XCTUnwrap(vm.addText())
        vm.pushHistorySnapshot()
        vm.deleteElement(id: text.id)
        vm.pushHistorySnapshot()
        XCTAssertTrue(vm.currentEffects.textObjects.isEmpty)

        XCTAssertTrue(vm.undoGlobal())
        XCTAssertEqual(vm.currentEffects.textObjects.first?.id, text.id,
                       "l'undo ramène le texte supprimé")
        XCTAssertTrue(vm.canRedoGlobal)

        XCTAssertTrue(vm.redoGlobal())
        XCTAssertTrue(vm.currentEffects.textObjects.isEmpty,
                      "le redo ré-applique la suppression")
    }

    func test_undoGlobal_restoresRetiredMediaBitmap() {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        var effects = vm.currentEffects
        effects.mediaObjects = [StoryMediaObject(id: "m1", mediaType: "image",
                                                 aspectRatio: 1.0, zIndex: 1)]
        vm.currentEffects = effects
        vm.loadedImages["m1"] = UIImage()
        vm.pushHistorySnapshot()

        vm.deleteElement(id: "m1")
        vm.pushHistorySnapshot()
        XCTAssertNil(vm.loadedImages["m1"], "le bitmap part en staging à la suppression")

        XCTAssertTrue(vm.undoGlobal())
        XCTAssertNotNil(vm.loadedImages["m1"],
                        "purge paresseuse : l'undo restaure la référence ET son bitmap")
    }

    func test_undoGlobal_rehydratesZOrderFromRestoredObjects() throws {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        let a = try XCTUnwrap(vm.addText())
        let b = try XCTUnwrap(vm.addText())
        vm.bringToFront(id: a.id)
        vm.pushHistorySnapshot()
        let promotedZ = vm.zIndex(for: a.id)

        vm.deleteElement(id: a.id)
        vm.pushHistorySnapshot()
        XCTAssertTrue(vm.undoGlobal())

        XCTAssertEqual(vm.zIndex(for: a.id), promotedZ,
                       "le z-order VM se réhydrate depuis les champs persistés restaurés")
        XCTAssertGreaterThan(vm.zIndex(for: a.id), vm.zIndex(for: b.id))
    }

    func test_encodeHistorySnapshot_isDeterministic() {
        let slides = [StorySlide()]
        let a = StoryComposerViewModel.encodeHistorySnapshot(slides)
        let b = StoryComposerViewModel.encodeHistorySnapshot(slides)
        XCTAssertNotNil(a)
        XCTAssertEqual(a, b, "octets stables exigés par la dédup (.sortedKeys)")
    }
}
