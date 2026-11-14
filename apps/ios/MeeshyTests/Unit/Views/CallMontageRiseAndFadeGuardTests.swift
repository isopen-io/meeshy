import XCTest
@testable import Meeshy

/// #17811 — C1.12 : le Montage (barre et carrousel) monte depuis le bas et y
/// redescend, en transformation + opacité ; « Réduire les animations » le remplace par
/// le fondu court de la couche. Effets garde le fondu de la couche : la loi 17 l'excepte
/// (« Effets emprunte au composer », loi 9). C1.4 : la rangée d'ambiances s'estompe à
/// ses deux bords, avec le même masque que les rangées de l'appel.
@MainActor
final class CallMontageRiseAndFadeGuardTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_risesFromBottom_montageWithMotion_rises() {
        XCTAssertTrue(CallModeChromeMotion.risesFromBottom(.montage, reduceMotion: false))
    }

    func test_risesFromBottom_montageUnderReduceMotion_onlyFades() {
        XCTAssertFalse(CallModeChromeMotion.risesFromBottom(.montage, reduceMotion: true))
    }

    func test_risesFromBottom_effects_keepsTheLayerFade() {
        XCTAssertFalse(CallModeChromeMotion.risesFromBottom(.effects, reduceMotion: false))
        XCTAssertFalse(CallModeChromeMotion.risesFromBottom(.effects, reduceMotion: true))
    }

    func test_modeControls_followTheRule_andTheLayerKeepsItsFade() throws {
        let mode = try code("Meeshy/Features/Call/Views/CallView+Mode.swift")
        let from = try XCTUnwrap(mode.range(of: "VStack(spacing: MeeshySpacing.mdPlus) {"))
        let tail = String(mode[from.upperBound...])
        let end = try XCTUnwrap(tail.range(of: "CallModeRecordingOverlay"))
        let controls = String(tail[..<end.lowerBound])
        XCTAssertTrue(
            controls.contains(".transition(CallModeChromeMotion.risesFromBottom(mode, reduceMotion: reduceMotion) ? .move(edge: .bottom).combined(with: .opacity) : .identity)"),
            "La pile des commandes du Montage monte du bas et y redescend ; ailleurs, la couche seule fond"
        )
        let after = String(tail[end.upperBound...])
        let label = try XCTUnwrap(after.range(of: ".accessibilityLabel(CallModeCopy.title(mode))"))
        XCTAssertTrue(String(after[..<label.lowerBound]).contains(".transition(.opacity)"), "La couche du mode garde son fondu")
    }

    func test_moodChips_rowFadesAtBothEdges() throws {
        let chips = try code("Meeshy/Features/Call/Views/CallFrameMoodChips.swift")
        let scroll = try XCTUnwrap(chips.range(of: "ScrollView(.horizontal, showsIndicators: false) {"))
        let after = String(chips[scroll.upperBound...])
        let mask = try XCTUnwrap(
            after.range(of: ".mask { ScrollEdgeFadeMask(axis: .horizontal, start: true, end: true) }"),
            "Une rangée qui défile s'efface en fondu à ses deux bords"
        )
        let disabled = try XCTUnwrap(after.range(of: ".disabled(!isEnabled)"))
        XCTAssertLessThan(mask.lowerBound, disabled.lowerBound, "Le masque se pose sur la ScrollView elle-même, pas sur une puce")
    }
}
