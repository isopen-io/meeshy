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

    func test_encodeHistorySnapshot_isDeterministic() {
        let slides = [StorySlide()]
        let a = StoryComposerViewModel.encodeHistorySnapshot(slides)
        let b = StoryComposerViewModel.encodeHistorySnapshot(slides)
        XCTAssertNotNil(a)
        XCTAssertEqual(a, b, "octets stables exigés par la dédup (.sortedKeys)")
    }
}
