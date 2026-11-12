import XCTest
@testable import Meeshy

/// #17811 — C1.12 : le Montage (barre et carrousel) monte depuis le bas et y
/// redescend, en transformation + opacité ; « Réduire les animations » le remplace par
/// un fondu court. C1.4 : la rangée d'ambiances s'estompe à ses deux bords, avec le
/// même masque que les rangées de l'appel.
final class CallMontageRiseAndFadeGuardTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_modeControls_riseFromTheBottom_andFadeUnderReduceMotion() throws {
        let mode = try code("Meeshy/Features/Call/Views/CallView+Mode.swift")
        let from = try XCTUnwrap(mode.range(of: "VStack(spacing: MeeshySpacing.mdPlus) {"))
        let tail = String(mode[from.upperBound...])
        let end = try XCTUnwrap(tail.range(of: "CallModeRecordingOverlay"))
        let controls = String(tail[..<end.lowerBound])
        XCTAssertTrue(
            controls.contains(".transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))"),
            "La barre et le carrousel du mode montent du bas et y redescendent ; fondu seul sous Réduire les animations"
        )
    }

    func test_moodChips_rowFadesAtBothEdges() throws {
        let chips = try code("Meeshy/Features/Call/Views/CallFrameMoodChips.swift")
        XCTAssertTrue(
            chips.contains(".mask { ScrollEdgeFadeMask(axis: .horizontal, start: true, end: true) }"),
            "Une rangée qui défile s'efface en fondu à ses deux bords"
        )
    }
}
