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

    // MARK: - Purge des textes vides à la sortie d'édition (audit it.90)

    func test_exitTextEditing_emptyText_isPurged() throws {
        let vm = StoryComposerViewModel()
        let text = try XCTUnwrap(vm.addText())  // crée text:""
        vm.enterTextEditingMode(textId: text.id)  // la View le fait après addText
        XCTAssertEqual(vm.currentEffects.textObjects.count, 1)

        vm.exitTextEditingMode()

        XCTAssertTrue(vm.currentEffects.textObjects.isEmpty,
                      "un texte resté vide à la fermeture est un fantôme (badge, publish, traduction gateway) — purgé")
        XCTAssertNil(vm.currentEffects.textObjects.first(where: { $0.id == text.id }))
    }

    func test_exitTextEditing_whitespaceOnly_isPurged() throws {
        let vm = StoryComposerViewModel()
        let text = try XCTUnwrap(vm.addText())
        var effects = vm.currentEffects
        effects.textObjects[0].text = "   \n  "
        vm.currentEffects = effects
        vm.enterTextEditingMode(textId: text.id)

        vm.exitTextEditingMode()

        XCTAssertTrue(vm.currentEffects.textObjects.isEmpty)
    }

    func test_exitTextEditing_realContent_isKept() throws {
        let vm = StoryComposerViewModel()
        _ = try XCTUnwrap(vm.addText())
        var effects = vm.currentEffects
        effects.textObjects[0].text = "Bonjour"
        vm.currentEffects = effects

        vm.exitTextEditingMode()

        XCTAssertEqual(vm.currentEffects.textObjects.first?.text, "Bonjour")
    }

    func test_encodeHistorySnapshot_isDeterministic() {
        let slides = [StorySlide()]
        let a = StoryComposerViewModel.encodeHistorySnapshot(slides)
        let b = StoryComposerViewModel.encodeHistorySnapshot(slides)
        XCTAssertNotNil(a)
        XCTAssertEqual(a, b, "octets stables exigés par la dédup (.sortedKeys)")
    }
}
