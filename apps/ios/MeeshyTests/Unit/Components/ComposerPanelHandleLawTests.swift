import XCTest
@testable import Meeshy

/// Loi de la poignée du panneau de pièces jointes : tirer vers le haut ouvre la
/// photothèque complète (picker système, onglets Photos / Albums), tirer vers le
/// bas referme le panneau. Miroir de `MessageOverlayDragLawTests` — même
/// grammaire de seuil + vélocité projetée.
final class ComposerPanelHandleLawTests: XCTestCase {

    private func outcome(_ translation: CGFloat, _ predicted: CGFloat) -> ComposerPanelHandleOutcome {
        ComposerPanelHandleLaw.outcome(translation: translation, predicted: predicted)
    }

    // MARK: - Swipe up → photothèque complète

    func test_outcome_swipeUpBeyondThreshold_opensFullLibrary() {
        XCTAssertEqual(outcome(-44, -44), .openFullLibrary)
        XCTAssertEqual(outcome(-120, -120), .openFullLibrary)
    }

    /// Le flick court doit aboutir : sur une poignée de 4 pt, exiger 44 pt de
    /// course franche rendrait le raccourci pénible.
    func test_outcome_shortFlickUpWithVelocity_opensFullLibrary() {
        XCTAssertEqual(outcome(-12, -88), .openFullLibrary)
        XCTAssertEqual(outcome(-20, -200), .openFullLibrary)
    }

    func test_outcome_weakSwipeUp_isIgnored() {
        XCTAssertEqual(outcome(-20, -30), .ignore)
        XCTAssertEqual(outcome(-43.9, -43.9), .ignore)
    }

    // MARK: - Swipe down → fermeture

    func test_outcome_swipeDownBeyondThreshold_closesPanel() {
        XCTAssertEqual(outcome(44, 44), .closePanel)
        XCTAssertEqual(outcome(120, 120), .closePanel)
    }

    func test_outcome_shortFlickDownWithVelocity_closesPanel() {
        XCTAssertEqual(outcome(12, 88), .closePanel)
    }

    // MARK: - Plages disjointes

    /// La vélocité ne compte que dans le sens du drag : un doigt qui descend ne
    /// doit jamais ouvrir la photothèque parce que la projection part vers le
    /// haut.
    func test_outcome_velocityAgainstDragDirection_isIgnored() {
        XCTAssertEqual(outcome(10, -200), .ignore)
        XCTAssertEqual(outcome(-10, 200), .ignore)
    }

    /// Monter franchement puis relâcher vers le bas garde la règle de position :
    /// pour annuler, on redescend sous le seuil AVANT de relâcher.
    func test_outcome_dragUpBeyondThresholdThenFlingDown_stillOpensLibrary() {
        XCTAssertEqual(outcome(-100, 200), .openFullLibrary)
    }

    func test_outcome_noMovement_isIgnored() {
        XCTAssertEqual(outcome(0, 0), .ignore)
    }

    // MARK: - Câblage

    /// Le raccourci n'a de sens que si la poignée route vers le MÊME point
    /// d'entrée que la tuile « + » du strip — sinon on obtient deux chemins
    /// divergents vers la photothèque, dont un seul préserve la sélection.
    func test_grabHandle_routesToTheSameFullLibraryEntryPoint() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let src = try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Attachments.swift"),
            encoding: .utf8
        )
        XCTAssertEqual(
            src.components(separatedBy: "openFullPhotoLibrary(preselecting:").count - 1, 3,
            "La photothèque complète doit avoir exactement 3 appelants : tuile « + », geste de la poignée, action VoiceOver"
        )
        XCTAssertTrue(
            src.contains("ComposerPanelHandleLaw.outcome"),
            "Le geste doit déléguer la décision à la loi pure, pas réimplémenter des seuils"
        )
        XCTAssertTrue(
            src.contains(".highPriorityGesture(mediaPanelHandleDrag)"),
            "Sans highPriority, le DragGesture global d'expandedComposer gagne l'arbitrage et le swipe-up n'arrive jamais"
        )
    }
}
