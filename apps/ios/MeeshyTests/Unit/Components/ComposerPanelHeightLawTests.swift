import XCTest
import UIKit
@testable import Meeshy

/// Hauteur du panneau (+) du composeur (#8869).
///
/// Le panneau remplace le clavier : il prend la DERNIÈRE hauteur de clavier
/// connue. Deux défauts s'y cumulaient — une trame de fin dégénérée (rectangle
/// nul, clavier flottant) était lue comme un clavier de la hauteur de la
/// fenêtre, et rien ne bornait le panneau : le composeur montait alors sous la
/// barre d'état.
final class ComposerPanelHeightLawTests: XCTestCase {

    private let window: CGFloat = 874

    // MARK: - Lecture d'une trame de clavier

    func test_keyboardHeight_dockedKeyboard_isItsVisiblePortion() {
        let frame = CGRect(x: 0, y: window - 336, width: 402, height: 336)
        XCTAssertEqual(ComposerPanelHeightLaw.keyboardHeight(endFrame: frame, windowHeight: window), 336)
    }

    func test_keyboardHeight_frameBelowTheWindow_isZero() {
        let frame = CGRect(x: 0, y: window, width: 402, height: 336)
        XCTAssertEqual(ComposerPanelHeightLaw.keyboardHeight(endFrame: frame, windowHeight: window), 0)
    }

    /// Le défaut : `window - endFrame.origin.y` rendait 874 pour un rectangle
    /// nul, et le panneau s'ouvrait à la hauteur de l'écran.
    func test_keyboardHeight_zeroFrame_isNotAMeasurement() {
        XCTAssertNil(ComposerPanelHeightLaw.keyboardHeight(endFrame: .zero, windowHeight: window))
    }

    /// Un clavier flottant (ou détaché) ne touche pas le bas de la fenêtre : il
    /// ne libère aucune hauteur que le panneau pourrait reprendre.
    func test_keyboardHeight_floatingKeyboard_isNotAMeasurement() {
        let frame = CGRect(x: 40, y: 300, width: 320, height: 250)
        XCTAssertNil(ComposerPanelHeightLaw.keyboardHeight(endFrame: frame, windowHeight: window))
    }

    // MARK: - Hauteur au repos

    private func resting(keyboard: CGFloat, floor: CGFloat = 324, top: CGFloat = 62, bottom: CGFloat = 34) -> CGFloat {
        ComposerPanelHeightLaw.restingHeight(
            lastKeyboardHeight: keyboard,
            contentFloor: floor,
            windowHeight: window,
            safeAreaTop: top,
            safeAreaBottom: bottom
        )
    }

    func test_restingHeight_nominalKeyboard_matchesTheKeyboard() {
        XCTAssertEqual(resting(keyboard: 336), 336)
    }

    func test_restingHeight_shortKeyboard_keepsTheContentFloor() {
        XCTAssertEqual(resting(keyboard: 260), 324)
    }

    /// Une hauteur périmée de la taille de l'écran ne doit jamais pousser le
    /// composeur sous la barre d'état : il reste la place de sa barre d'outils,
    /// de sa ligne de saisie et d'un bandeau de conversation.
    func test_restingHeight_staleFullScreenHeight_leavesTheComposerOnScreen() {
        let height = resting(keyboard: window)
        XCTAssertLessThanOrEqual(height, window * ComposerPanelHeightLaw.maxWindowRatio)
        XCTAssertLessThanOrEqual(
            height + ComposerPanelHeightLaw.composerChromeReserve,
            window - 62 - 34
        )
    }

    /// Écran court (iPhone en paysage) : le plafond l'emporte sur le plancher
    /// de contenu — un panneau qui masque le composeur n'est pas un panneau.
    func test_restingHeight_shortWindow_ceilingWinsOverTheFloor() {
        let height = ComposerPanelHeightLaw.restingHeight(
            lastKeyboardHeight: 209,
            contentFloor: 324,
            windowHeight: 402,
            safeAreaTop: 0,
            safeAreaBottom: 21
        )
        XCTAssertLessThan(height, 324)
        XCTAssertGreaterThan(height, 0)
    }

    // MARK: - L'observateur de clavier

    /// Le chemin réel : une notification de trame NULLE ne doit pas devenir la
    /// « dernière hauteur de clavier connue ».
    @MainActor
    func test_keyboardObserver_zeroEndFrame_keepsTheLastKnownHeight() {
        let observer = KeyboardObserver()
        let before = observer.lastKnownHeight
        NotificationCenter.default.post(
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil,
            userInfo: [
                UIResponder.keyboardFrameEndUserInfoKey: CGRect.zero,
                UIResponder.keyboardAnimationDurationUserInfoKey: 0.25
            ]
        )
        RunLoop.main.run(until: Date().addingTimeInterval(0.1))
        XCTAssertEqual(observer.lastKnownHeight, before)
        XCTAssertFalse(observer.isVisible)
    }

    // MARK: - Câblage

    func test_attachmentPanelHeight_derivesTheRestingHeightFromTheLaw() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let src = try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(src.contains("ComposerPanelHeightLaw.restingHeight"))
    }
}
