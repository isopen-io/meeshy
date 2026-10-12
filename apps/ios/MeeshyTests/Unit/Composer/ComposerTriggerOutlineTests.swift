import XCTest
@testable import Meeshy

/// **Le cadre de la case choisie entoure le flux, à l'extérieur, et bat en
/// rouge pendant la prise** (#10309, directive porteur 2026-10-12).
final class ComposerTriggerOutlineTests: XCTestCase {

    // MARK: - Hors du flux

    func test_outset_isTheStrokeAndItsGap_outsideTheCell() {
        XCTAssertGreaterThan(ComposerTriggerOutline.outset, ComposerTriggerOutline.lineWidth,
                             "le trait se pose à distance du bord, jamais sur le flux")
        XCTAssertEqual(ComposerTriggerOutline.outset, ComposerTriggerOutline.lineWidth + ComposerTriggerOutline.gap)
    }

    func test_cornerRadius_followsTheCellCorners_parallel() {
        XCTAssertEqual(ComposerTriggerOutline.cornerRadius(inner: 8), 8 + ComposerTriggerOutline.outset)
    }

    func test_outlineFitsBetweenTwoCells() {
        XCTAssertLessThan(ComposerTriggerOutline.outset, ComposerLookStripRule.spacing,
                          "le cadre de la choisie ne mord pas sur la case voisine")
    }

    // MARK: - Rouge et battant pendant la prise

    func test_tint_whileRecording_isRed() {
        XCTAssertEqual(ComposerTriggerOutline.tint(recording: true), .recording)
        XCTAssertEqual(ComposerTriggerOutline.tint(recording: false), .idle)
    }

    func test_pulses_onlyWhileRecording_andNeverUnderReduceMotion() {
        XCTAssertTrue(ComposerTriggerOutline.pulses(recording: true, reduceMotion: false))
        XCTAssertFalse(ComposerTriggerOutline.pulses(recording: true, reduceMotion: true), "Réduire les animations")
        XCTAssertFalse(ComposerTriggerOutline.pulses(recording: false, reduceMotion: false))
    }

    func test_opacity_fadesOutAndBackIn_neverToZero() {
        let periode = ComposerTriggerOutline.period
        XCTAssertEqual(ComposerTriggerOutline.opacity(elapsed: 0, pulses: true), 1, accuracy: 0.0001)
        XCTAssertEqual(ComposerTriggerOutline.opacity(elapsed: periode / 2, pulses: true),
                       ComposerTriggerOutline.faintest, accuracy: 0.0001)
        XCTAssertEqual(ComposerTriggerOutline.opacity(elapsed: periode, pulses: true), 1, accuracy: 0.0001)
        let pas = (0..<48).map { ComposerTriggerOutline.opacity(elapsed: periode * Double($0) / 24, pulses: true) }
        XCTAssertGreaterThan(pas.min() ?? 0, 0, "un cadre qui s'éteint ne dirait plus « ça enregistre »")
    }

    func test_opacity_withoutPulse_isSteady() {
        XCTAssertEqual(ComposerTriggerOutline.opacity(elapsed: ComposerTriggerOutline.period / 2, pulses: false), 1)
    }

    // MARK: - Le câblage

    func test_strip_drawsTheChosenOutlineOutside_neverInsideTheFeed() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertFalse(bande.contains(".strokeBorder(Color.white, lineWidth: 3)"), "plus de trait posé sur le flux")
        XCTAssertEqual(bande.components(separatedBy: "ComposerTriggerOutlineStyle(recording: recording").count - 1, 3,
                       "la case « Aucun » repliée, la miniature seule et la case choisie de la bande")
        let cadre = try Self.code("Meeshy/Features/Main/Composer/ComposerTriggerOutline.swift")
        XCTAssertTrue(cadre.contains(".padding(-ComposerTriggerOutline.outset)"), "le trait déborde de la case")
    }

    private static func code(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(relative)
        return try String(contentsOf: url, encoding: .utf8)
    }
}
