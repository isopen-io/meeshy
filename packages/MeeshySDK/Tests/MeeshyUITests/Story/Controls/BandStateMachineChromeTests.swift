import XCTest
@testable import MeeshyUI

/// T1 — le drapeau de chrome absorbé par `BandStateMachine`.
///
/// Bug terrain 2026-07-31 : le composer pouvait afficher un écran NU (ni
/// « Fermer » ni « Publier », aucune poignée) parce que la visibilité du chrome
/// vivait dans un `@State` de la vue pendant que l'ouverture des panneaux vivait
/// dans la machine — deux vérités qui ne se parlaient pas. Le drapeau vit
/// désormais ICI, et l'invariant
///
///     INV-1 : isChromeHidden == true  ⟹  state == .hidden
///
/// est fermé par construction sur TOUTES les mutations publiques : l'état
/// « chrome masqué + panneau ouvert » devient inexprimable.
final class BandStateMachineChromeTests: XCTestCase {

    // MARK: - Drapeau nu

    func test_isChromeHidden_initialState_isFalse() {
        XCTAssertFalse(BandStateMachine().isChromeHidden)
    }

    func test_hideChrome_whenBandHidden_hidesChrome() {
        var sut = BandStateMachine()
        sut.hideChrome()
        XCTAssertTrue(sut.isChromeHidden)
        XCTAssertEqual(sut.state, .hidden)
    }

    func test_hideChrome_whenToolPanelOpen_isIgnored() {
        var sut = BandStateMachine()
        sut.tapFAB(.media)
        sut.hideChrome()
        XCTAssertFalse(sut.isChromeHidden,
                       "INV-1 : masquer le chrome pendant qu'un panneau est ouvert est inexprimable.")
        XCTAssertEqual(sut.state, .toolPanel(.media))
    }

    func test_showChrome_afterHide_restoresChrome() {
        var sut = BandStateMachine()
        sut.hideChrome()
        sut.showChrome()
        XCTAssertFalse(sut.isChromeHidden)
    }

    func test_toggleChrome_twice_returnsToVisible() {
        var sut = BandStateMachine()
        sut.toggleChrome()
        XCTAssertTrue(sut.isChromeHidden)
        sut.toggleChrome()
        XCTAssertFalse(sut.isChromeHidden, "Le masquage volontaire (D4) est strictement réversible.")
    }

    // MARK: - Toute ouverture de panneau efface le masquage

    func test_tapFAB_whileChromeHidden_restoresChrome() {
        var sut = BandStateMachine()
        sut.hideChrome()
        sut.tapFAB(.media)
        XCTAssertFalse(sut.isChromeHidden)
        XCTAssertEqual(sut.state, .toolPanel(.media))
    }

    func test_tapTile_whileChromeHidden_restoresChrome() {
        var sut = BandStateMachine()
        sut.hideChrome()
        sut.tapTile(.text)
        XCTAssertFalse(sut.isChromeHidden)
        XCTAssertEqual(sut.state, .toolPanel(.text))
    }

    func test_swipeUpOnFAB_whileChromeHidden_restoresChrome() {
        var sut = BandStateMachine()
        sut.hideChrome()
        sut.swipeUpOnFAB(.son)
        XCTAssertFalse(sut.isChromeHidden)
        XCTAssertEqual(sut.state, .toolPanel(.audio))
    }

    func test_openFormatPanel_whileChromeHidden_restoresChrome() {
        var sut = BandStateMachine()
        sut.hideChrome()
        sut.openFormatPanel(.text, id: "txt-1")
        XCTAssertFalse(sut.isChromeHidden)
        XCTAssertEqual(sut.state, .formatPanel(.text, elementId: "txt-1"))
    }

    // MARK: - Toute sortie de panneau rend le chrome

    func test_closeAnyPanel_fromToolPanel_leavesChromeVisible() {
        var sut = BandStateMachine()
        sut.tapFAB(.text)
        sut.closeAnyPanel()
        XCTAssertEqual(sut.state, .hidden)
        XCTAssertFalse(sut.isChromeHidden)
    }

    func test_closeAnyPanel_whileChromeHiddenAndBandHidden_restoresChrome() {
        var sut = BandStateMachine()
        sut.hideChrome()
        sut.closeAnyPanel()
        XCTAssertFalse(
            sut.isChromeHidden,
            """
            Les overrides ViewModel (timeline, dessin) ouvrent un panneau EFFECTIF \
            sans faire transiter la machine : sortir de ce panneau doit rendre le \
            chrome même quand l'état brut était déjà .hidden, sinon l'écran nu du \
            rapport terrain se rejoue depuis la tuile Timeline du picker vierge.
            """
        )
    }

    func test_backFromToolPanel_afterChromeToggleAttempt_leavesChromeVisible() {
        var sut = BandStateMachine()
        sut.tapFAB(.text)
        sut.hideChrome()             // ignoré par INV-1
        sut.backFromToolPanel()
        XCTAssertEqual(sut.state, .hidden)
        XCTAssertFalse(sut.isChromeHidden, "Séquence exacte du rapport terrain : « Retour » ne laisse plus l'écran nu.")
    }

    func test_closeFormatPanel_leavesChromeVisible() {
        var sut = BandStateMachine()
        sut.openFormatPanel(.media, id: "med-1")
        sut.closeFormatPanel()
        XCTAssertEqual(sut.state, .hidden)
        XCTAssertFalse(sut.isChromeHidden)
    }

    func test_reset_restoresChrome() {
        var sut = BandStateMachine()
        sut.hideChrome()
        sut.reset()
        XCTAssertEqual(sut.state, .hidden)
        XCTAssertFalse(sut.isChromeHidden, "Un changement de slide efface tout, y compris un masquage volontaire.")
    }

    func test_swipeDownOnBand_delegatesToCloseAnyPanel_leavingChromeVisible() {
        var sut = BandStateMachine()
        sut.tapFAB(.texture)
        sut.swipeDownOnBand()
        XCTAssertEqual(sut.state, .hidden)
        XCTAssertFalse(sut.isChromeHidden)
    }

    // MARK: - Invariant exhaustif

    func test_everyTransition_neverLeavesChromeHiddenWithOpenPanel() {
        let starts: [(String, () -> BandStateMachine)] = [
            ("neuve", { BandStateMachine() }),
            ("chrome masqué", {
                var m = BandStateMachine(); m.hideChrome(); return m
            }),
            ("panneau média", {
                var m = BandStateMachine(); m.tapFAB(.media); return m
            }),
            ("panneau timeline", {
                var m = BandStateMachine(); m.tapTile(.timeline); return m
            }),
            ("panneau de format", {
                var m = BandStateMachine(); m.openFormatPanel(.text, id: "t"); return m
            }),
        ]
        let mutations: [(String, (inout BandStateMachine) -> Void)] = [
            ("hideChrome", { $0.hideChrome() }),
            ("showChrome", { $0.showChrome() }),
            ("toggleChrome", { $0.toggleChrome() }),
            ("tapFAB(.drawing)", { $0.tapFAB(.drawing) }),
            ("tapFAB(.media)", { $0.tapFAB(.media) }),
            ("swipeUpOnFAB(.texture)", { $0.swipeUpOnFAB(.texture) }),
            ("tapTile(.text)", { $0.tapTile(.text) }),
            ("openFormatPanel", { $0.openFormatPanel(.media, id: "m") }),
            ("closeAnyPanel", { $0.closeAnyPanel() }),
            ("swipeDownOnBand", { $0.swipeDownOnBand() }),
            ("backFromToolPanel", { $0.backFromToolPanel() }),
            ("closeFormatPanel", { $0.closeFormatPanel() }),
            ("reset", { $0.reset() }),
        ]

        for (startName, makeStart) in starts {
            for (mutationName, mutate) in mutations {
                var sut = makeStart()
                mutate(&sut)
                XCTAssertFalse(
                    sut.isChromeHidden && sut.state != .hidden,
                    "INV-1 violé : \(startName) → \(mutationName) laisse le chrome masqué avec \(sut.state)."
                )
            }
        }
    }
}
