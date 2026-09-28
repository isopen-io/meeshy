import XCTest
@testable import Meeshy

/// #8459 — la pilule est UN bloc de verre réel (iOS 26), et les actions du
/// `(…)` s'y déploient au-dessus de la rangée de base, en duo comme en groupe.
/// #8435 — le bouton PiP quitte le plein écran par le même chemin que le glissé.
@MainActor
final class CallViewGlassGuardTests: XCTestCase {

    private func callViewCode() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
    }

    private func block(_ start: String, until end: String, in code: String) throws -> String {
        let from = try XCTUnwrap(code.range(of: start), "\(start) introuvable — la garde ne mesurerait rien")
        let to = try XCTUnwrap(code.range(of: end, range: from.upperBound ..< code.endIndex), "\(end) introuvable")
        return String(code[from.upperBound ..< to.lowerBound])
    }

    /// #8459 — un bouton de la pilule est un disque PLAT dans le bloc de
    /// verre : pas de verre sur verre, ni d'identité de morphing.
    func test_pillGlyph_isAFlatDiscInsideTheGlassBlock() throws {
        let glyph = try block("struct CallPillGlyph: View {", until: "struct CallPillButtonLabel", in: try callViewCode())
        XCTAssertTrue(glyph.contains(".background(Circle().fill(CallButtonFill.color(for: kind)))"))
        XCTAssertFalse(glyph.contains("CallButtonGlass"), "Un bouton de verre dans un bloc de verre, c'est du verre sur verre")
        XCTAssertFalse(glyph.contains("adaptiveGlass"))
    }

    func test_buttonFill_activeIsWhite_endIsRed_restIsTranslucent() throws {
        let glass = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallControlGlass.swift")
        )
        let fill = try block("enum CallButtonFill {", until: "\n}\n", in: glass)
        XCTAssertTrue(fill.contains("case .active: return .white"))
        XCTAssertTrue(fill.contains("case .destructive: return MeeshyColors.error"))
        XCTAssertTrue(fill.contains("Color.white.opacity("))
        XCTAssertFalse(glass.contains("struct CallButtonGlass"), "Le verre par bouton a quitté l'écran d'appel")
    }

    /// #8459 · #8550 — UN seul bloc de verre réel : la pilule ; les familles
    /// ET le sous-menu ouvert s'y déploient, au-dessus de la rangée de base,
    /// sans second bloc — en duo comme en groupe, par le MÊME chemin.
    func test_actions_unfoldInsideTheSingleGlassBlock_aboveTheBaseRow() throws {
        let code = try callViewCode()
        let pill = try block("var callControlsPill: some View {", until: "var pillHairline: some View", in: code)
        XCTAssertEqual(pill.components(separatedBy: ".callControlsGlass(in:").count - 1, 1, "Un seul verre pour tout le bloc")
        let panel = try XCTUnwrap(pill.range(of: "panelRows(panel)"))
        let families = try XCTUnwrap(pill.range(of: "familyRows(actions)"))
        let base = try XCTUnwrap(pill.range(of: "baseRow"))
        let glass = try XCTUnwrap(pill.range(of: ".callControlsGlass(in:"))
        XCTAssertLessThan(panel.lowerBound, families.lowerBound, "Le sous-menu s'ouvre AU-DESSUS des familles")
        XCTAssertLessThan(families.lowerBound, base.lowerBound)
        XCTAssertLessThan(base.lowerBound, glass.lowerBound, "Le verre enveloppe les rangées ET la rangée de base")
        XCTAssertFalse(pill.contains("isGroupStage ?"), "Duo et groupe partagent la même disposition")
        XCTAssertFalse(code.contains("callLegibilityVeil"), "Plus de voile non vitré : le bloc est du verre")
        XCTAssertFalse(code.contains("actionRails"), "Les rails latéraux ont quitté l'écran d'appel")
        XCTAssertFalse(code.contains("CallReactionPalette"), "La palette flottante a rejoint la pilule")
    }

    /// Le bloc de verre est un verre RÉEL sous iOS 26 (`adaptiveGlass`, qui
    /// porte le `glassEffect` et le repli matériau).
    func test_controlsGlass_isRealAdaptiveGlass() throws {
        let glass = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallControlGlass.swift")
        )
        let modifier = try block("func callControlsGlass<S: Shape>(in shape: S) -> some View {", until: "\n    }\n", in: glass)
        XCTAssertTrue(modifier.contains(".adaptiveGlass(in: shape)"))
    }

    /// Les rangées d'actions ne portent plus aucun fond propre : elles sont
    /// DANS le bloc, et elles défilent à l'horizontale.
    func test_actionRows_carryNoBackgroundOfTheirOwn() throws {
        let code = try callViewCode()
        let rows = try block("private func familyRows(", until: "func actionButton(", in: code)
        XCTAssertFalse(rows.contains("callChromeGlass"))
        XCTAssertTrue(rows.contains("CallPillRow("))
        XCTAssertFalse(code.contains("glassEffectID"), "Plus de morphing : les actions naissent dans le bloc qui grandit")
        let row = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallPillRow.swift")
        )
        XCTAssertTrue(row.contains("ScrollView(.horizontal, showsIndicators: false)"))
        XCTAssertTrue(row.contains("scrollTargetBehavior(.viewAligned)"))
        XCTAssertFalse(row.contains("adaptiveGlass"), "Une rangée dans le bloc de verre n'a pas de verre à elle")
        XCTAssertFalse(row.contains("callChromeGlass"))
    }

    /// Le bouton PiP quitte le plein écran (et retombe sur la pastille si
    /// AVKit refuse), exactement comme le glissé.
    func test_pipButton_andSwipe_leaveFullScreenThroughTheSameEntry() throws {
        let code = try callViewCode()
        let button = try block("func pictureInPictureActionButton(", until: "}\n}", in: code)
        XCTAssertTrue(button.contains("enterSystemPiP()"))
        XCTAssertFalse(button.contains("callManager.startSystemPiP()"), "Le bouton passe par enterSystemPiP et son repli")
        XCTAssertTrue(code.contains("case .systemPiP: enterSystemPiP()"))
        XCTAssertTrue(code.contains("CallPiPPolicy.shouldFallBackToPill("))
        XCTAssertTrue(code.contains("CallPiPPolicy.swipeDownOutcome("))
    }
}
