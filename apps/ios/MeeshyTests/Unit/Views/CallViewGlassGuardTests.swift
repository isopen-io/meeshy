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

    /// #8459 — UN seul bloc de verre réel : la pilule ; les actions du (…) s'y
    /// déploient, au-dessus de la rangée de base, sans second bloc.
    func test_actions_unfoldInsideTheSingleGlassBlock_aboveTheBaseRow() throws {
        let code = try callViewCode()
        let pill = try block("var callControlsPill: some View {", until: "private var pillHairline", in: code)
        XCTAssertEqual(pill.components(separatedBy: ".callControlsGlass(in:").count - 1, 1, "Un seul verre pour tout le bloc")
        let duo = try XCTUnwrap(pill.range(of: "duoActionRows(actions)"))
        let group = try XCTUnwrap(pill.range(of: "groupActionRows(actions)"))
        let base = try XCTUnwrap(pill.range(of: "baseRow"))
        let glass = try XCTUnwrap(pill.range(of: ".callControlsGlass(in:"))
        XCTAssertLessThan(duo.lowerBound, base.lowerBound)
        XCTAssertLessThan(group.lowerBound, base.lowerBound)
        XCTAssertLessThan(base.lowerBound, glass.lowerBound, "Le verre enveloppe les actions ET la rangée de base")
        XCTAssertFalse(code.contains("callLegibilityVeil"), "Plus de voile non vitré : le bloc est du verre")
        XCTAssertFalse(code.contains("actionRails"), "Les rails latéraux ont quitté l'écran d'appel")
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
    /// DANS le bloc.
    func test_actionRows_carryNoBackgroundOfTheirOwn() throws {
        let code = try callViewCode()
        let rows = try block("private func groupActionRows(", until: "func actionRow(", in: code)
        XCTAssertFalse(rows.contains("callChromeGlass"))
        let duo = try block("private func duoActionRows(", until: "func actionButton(", in: code)
        XCTAssertFalse(duo.contains("callChromeGlass"))
        XCTAssertFalse(code.contains("glassEffectID"), "Plus de morphing : les actions naissent dans le bloc qui grandit")
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
