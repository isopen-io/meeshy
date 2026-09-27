import XCTest
@testable import Meeshy

/// #8432 — chaque bouton de l'écran d'appel est un bouton de VERRE, et les
/// actions du `(…)` montent AU-DESSUS de la pilule, en duo comme en groupe.
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

    /// Le glyphe porte son propre verre ; plus aucun disque plat.
    func test_pillGlyph_carriesItsOwnInteractiveGlass() throws {
        let glyph = try block("struct CallPillGlyph: View {", until: "struct CallPillButtonLabel", in: try callViewCode())
        XCTAssertTrue(glyph.contains(".modifier(CallButtonGlass(kind: kind))"))
        XCTAssertTrue(glyph.contains("CallGlassMorphModifier"), "Le verre du bouton porte son identité de morphing")
        XCTAssertFalse(glyph.contains("Circle().fill("), "Un disque plat sous le glyphe n'est pas du verre")
    }

    func test_buttonGlass_activeIsFilled_endIsRedProminent_restIsInteractive() throws {
        let glass = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallControlGlass.swift")
        )
        let modifier = try block("struct CallButtonGlass: ViewModifier {", until: "struct CallGlassMorphTag", in: glass)
        XCTAssertTrue(modifier.contains("adaptiveGlass(in: Circle(), interactive: true)"))
        XCTAssertTrue(modifier.contains("adaptiveGlassProminent(in: Circle(), tint: .white)"))
        XCTAssertTrue(modifier.contains("adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.error)"))
    }

    /// Pas de verre sur verre : la pilule et les actions ne posent qu'un voile.
    func test_pillAndActions_carryNoGroupGlassUnderTheirGlassButtons() throws {
        let pill = try block("var callControlsPill: some View {", until: "private var pillHairline", in: try callViewCode())
        XCTAssertFalse(pill.contains("callChromeGlass"))
        XCTAssertTrue(pill.contains("callLegibilityVeil"))
        let rows = try block("private func groupActionRows(", until: "func actionRow(", in: try callViewCode())
        XCTAssertFalse(rows.contains("callChromeGlass"))
        let duo = try block("private func duoActionRows(", until: "func actionButton(", in: try callViewCode())
        XCTAssertFalse(duo.contains("callChromeGlass"))
    }

    /// Les actions se posent AU-DESSUS de la pilule, en duo comme en groupe —
    /// et plus aucun rail latéral.
    func test_actions_stackAboveThePill_inDuoAndGroup() throws {
        let code = try callViewCode()
        let pill = try block("var callControlsPill: some View {", until: "private var controlsPill: some View {", in: code)
        let duo = try XCTUnwrap(pill.range(of: "duoActionRows(actions)"))
        let group = try XCTUnwrap(pill.range(of: "groupActionRows(actions)"))
        let base = try XCTUnwrap(pill.range(of: "controlsPill"))
        XCTAssertLessThan(duo.lowerBound, base.lowerBound)
        XCTAssertLessThan(group.lowerBound, base.lowerBound)
        XCTAssertFalse(code.contains("actionRails"), "Les rails latéraux ont quitté l'écran d'appel")
    }

    /// Sous iOS 26 les actions naissent du verre du `(…)`.
    func test_moreAndActions_shareTheGlassNamespace() throws {
        let code = try callViewCode()
        XCTAssertTrue(code.contains(".callGlassMorph(id: \"call.more\", in: callGlassNamespace)"))
        XCTAssertTrue(code.contains(".callGlassMorph(id: \"call.action.\\(action.rawValue)\", in: callGlassNamespace)"))
        XCTAssertTrue(code.contains("@Namespace var callGlassNamespace"))
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
