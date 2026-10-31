import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Clavier OU options, jamais les deux** (règle #6156, portée sur la scène
/// par #13839 L4) : toucher une famille remplace le clavier par ses choix, dans
/// un panneau de la hauteur du clavier — la scène ne bouge pas —, et toucher le
/// texte rend le clavier.
final class ComposerKeyboardOrOptionsTests: XCTestCase {

    func test_tapped_aFamilyWhileTyping_opensItsOptions() {
        XCTAssertEqual(ComposerKeyboardOrOptions.tapped(.color, in: .keyboard), .options(.color))
    }

    func test_tapped_anotherFamily_switchesTheOptions() {
        XCTAssertEqual(ComposerKeyboardOrOptions.tapped(.surface, in: .options(.color)), .options(.surface))
    }

    func test_tapped_theOpenFamily_givesTheKeyboardBack() {
        XCTAssertEqual(ComposerKeyboardOrOptions.tapped(.color, in: .options(.color)), .keyboard)
    }

    func test_textTouched_alwaysGivesTheKeyboardBack() {
        XCTAssertEqual(ComposerKeyboardOrOptions.textTouched(.options(.typography)), .keyboard)
        XCTAssertEqual(ComposerKeyboardOrOptions.textTouched(.keyboard), .keyboard)
    }

    // MARK: - La hauteur du panneau : celle du clavier

    func test_remembered_softwareKeyboard_isItsHeightWithoutTheBar() {
        let h = ComposerKeyboardOrOptions.rememberedKeyboardHeight(previous: 0, overlap: 380,
                                                                   accessoryHeight: 44, input: .keyboard)
        XCTAssertEqual(h, 336)
    }

    func test_remembered_hardwareKeyboard_onlyTheBar_keepsThePreviousHeight() {
        let h = ComposerKeyboardOrOptions.rememberedKeyboardHeight(previous: 300, overlap: 44,
                                                                   accessoryHeight: 44, input: .keyboard)
        XCTAssertEqual(h, 300, "un clavier matériel ne montre que la barre : rien à retenir")
    }

    func test_remembered_whileTheOptionsAreShown_isNotOverwrittenByThePanel() {
        let h = ComposerKeyboardOrOptions.rememberedKeyboardHeight(previous: 336, overlap: 500,
                                                                   accessoryHeight: 44, input: .options(.color))
        XCTAssertEqual(h, 336, "le panneau ne se mesure pas lui-même")
    }

    func test_remembered_floatingOrHiddenKeyboard_keepsThePreviousHeight() {
        XCTAssertEqual(ComposerKeyboardOrOptions.rememberedKeyboardHeight(previous: 320, overlap: 0,
                                                                          accessoryHeight: 44, input: .keyboard), 320)
    }

    func test_panelHeight_withoutAMeasure_usesTheFallback() {
        XCTAssertEqual(ComposerKeyboardOrOptions.panelHeight(remembered: 0),
                       ComposerKeyboardOrOptions.fallbackPanelHeight)
        XCTAssertEqual(ComposerKeyboardOrOptions.panelHeight(remembered: 336), 336)
    }

    // MARK: - La scène suit le clavier, dans SA durée

    func test_keyboardTop_dockedKeyboard_isWhereItBeginsInTheWindow() {
        let fenetre = CGRect(x: 0, y: 0, width: 402, height: 874)
        let clavier = CGRect(x: 0, y: 874 - 380, width: 402, height: 380)
        XCTAssertEqual(ComposerKeyboardMotion.keyboardTop(endFrame: clavier, windowFrame: fenetre), 494)
    }

    func test_keyboardTop_hiddenOrFloatingKeyboard_isNil() {
        let fenetre = CGRect(x: 0, y: 0, width: 1024, height: 1366)
        XCTAssertNil(ComposerKeyboardMotion.keyboardTop(endFrame: CGRect(x: 0, y: 1366, width: 1024, height: 380),
                                                       windowFrame: fenetre), "rangé sous l'écran")
        XCTAssertNil(ComposerKeyboardMotion.keyboardTop(endFrame: CGRect(x: 300, y: 600, width: 320, height: 250),
                                                       windowFrame: fenetre), "flottant : il ne soulève rien")
    }

    func test_timing_usesTheKeyboardDuration_orTheSystemDefault() {
        let t0 = Date(timeIntervalSince1970: 0)
        XCTAssertEqual(ComposerKeyboardMotion.timing(duration: 0.4, at: t0).duration, 0.4)
        XCTAssertEqual(ComposerKeyboardMotion.timing(duration: nil, at: t0).duration,
                       ComposerKeyboardMotion.fallbackDuration)
        XCTAssertEqual(ComposerKeyboardMotion.timing(duration: 0, at: t0).duration,
                       ComposerKeyboardMotion.fallbackDuration)
    }

    func test_drivesLift_onlyWhileTheKeyboardMoves() {
        let t0 = Date(timeIntervalSince1970: 100)
        let timing = ComposerKeyboardMotion.timing(duration: 0.25, at: t0)
        XCTAssertTrue(ComposerKeyboardMotion.drivesLift(timing, now: t0))
        XCTAssertTrue(ComposerKeyboardMotion.drivesLift(timing, now: t0.addingTimeInterval(0.2)))
        XCTAssertFalse(ComposerKeyboardMotion.drivesLift(timing, now: t0.addingTimeInterval(1)),
                       "une feuille ouverte après coup garde son propre ressort")
        XCTAssertFalse(ComposerKeyboardMotion.drivesLift(nil, now: t0))
    }

    // MARK: - La colonne droite se tait pendant la frappe (OK remplace ✕)

    func test_focus_typing_beatsTheSelection() {
        let focus = ComposerTrailingColumn.focus(railMode: .doors([]), objectIsEdited: true, typing: true)
        XCTAssertEqual(focus, .typing)
    }

    /// Le pied de la colonne GOUVERNE ce que la scène sert : pendant la frappe,
    /// ni ↶ ni ↷ ne restent au bord de la scène réduite (maquette, état 2).
    func test_servesHistory_typing_neitherUndoNorRedo() {
        XCTAssertFalse(ComposerTrailingColumn.servesHistory(.undo, for: .typing))
        XCTAssertFalse(ComposerTrailingColumn.servesHistory(.redo, for: .typing))
    }

    func test_servesHistory_objectOrScene_keepsUndoAndRedo() {
        XCTAssertTrue(ComposerTrailingColumn.servesHistory(.undo, for: .object))
        XCTAssertTrue(ComposerTrailingColumn.servesHistory(.redo, for: .scene(effects: [], open: nil)))
    }

    func test_options_typing_noGlyphColumnAndNoQuitButton() {
        XCTAssertEqual(ComposerTrailingColumn.options(for: .typing), [])
        XCTAssertEqual(ComposerTrailingColumn.foot(for: .typing, timeServed: true), [])
    }
}

/// **Le relais entre la barre, le panneau et le champ du canvas.**
@MainActor
final class ComposerKeyboardDockTests: XCTestCase {

    private func makeDock() -> (ComposerKeyboardDock, UIView, UIView) {
        let barre = UIView()
        let panneau = UIView()
        return (ComposerKeyboardDock(accessoryView: barre, panelView: panneau), barre, panneau)
    }

    func test_begin_postsTheBarAndTheSystemKeyboard() {
        let (dock, barre, _) = makeDock()
        dock.begin()
        XCTAssertTrue(dock.link.accessoryView === barre)
        XCTAssertNil(dock.link.inputView)
        XCTAssertEqual(dock.input, .keyboard)
    }

    func test_tap_aFamily_replacesTheKeyboardByThePanel() {
        let (dock, _, panneau) = makeDock()
        dock.begin()
        dock.tap(.typography)
        XCTAssertEqual(dock.input, .options(.typography))
        XCTAssertTrue(dock.link.inputView === panneau)
    }

    func test_touchingTheText_givesTheKeyboardBack() {
        let (dock, _, _) = makeDock()
        dock.begin()
        dock.tap(.color)
        dock.link.onEditorTouched?()
        XCTAssertEqual(dock.input, .keyboard)
        XCTAssertNil(dock.link.inputView)
    }

    func test_begin_afterOptions_startsAgainOnTheKeyboard() {
        let (dock, _, _) = makeDock()
        dock.begin()
        dock.tap(.surface)
        dock.begin()
        XCTAssertEqual(dock.input, .keyboard)
        XCTAssertNil(dock.link.inputView)
    }

    /// Le panneau prend la place EXACTE du clavier : ni la barre ni la scène
    /// ne bougent quand une famille remplace le clavier (maquette, état 2).
    func test_tap_givesThePanelTheRememberedKeyboardHeight() {
        let (dock, barre, panneau) = makeDock()
        barre.frame = CGRect(x: 0, y: 0, width: 402, height: 44)
        dock.begin()
        dock.keyboardFrameChanged(overlap: 380)
        dock.tap(.typography)
        XCTAssertEqual(panneau.frame.height, 336)
    }

    func test_keyboardFrameChanged_remembersTheSoftwareKeyboard() {
        let (dock, barre, _) = makeDock()
        barre.frame = CGRect(x: 0, y: 0, width: 402, height: 44)
        dock.begin()
        dock.keyboardFrameChanged(overlap: 380)
        XCTAssertEqual(dock.panelHeight, 336)
    }
}
