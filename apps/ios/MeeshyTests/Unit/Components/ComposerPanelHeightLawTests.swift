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

    // MARK: - La hauteur qui soulève (#10544)

    /// Une trame nulle n'annonce rien : clavier levé, la hauteur est GARDÉE —
    /// retomber à zéro reposait le composeur sous un clavier encore là.
    func test_liftHeight_zeroFrame_keepsTheCurrentHeight() {
        XCTAssertEqual(ComposerPanelHeightLaw.liftHeight(endFrame: .zero, windowHeight: window, current: 336), 336)
        XCTAssertEqual(ComposerPanelHeightLaw.liftHeight(endFrame: .zero, windowHeight: window, current: 0), 0)
    }

    func test_liftHeight_dockedKeyboard_isItsVisiblePortion() {
        let frame = CGRect(x: 0, y: window - 336, width: 402, height: 336)
        XCTAssertEqual(ComposerPanelHeightLaw.liftHeight(endFrame: frame, windowHeight: window, current: 0), 336)
    }

    /// Un clavier flottant ne soulève rien, même si un clavier ancré le
    /// précédait ; un clavier sous la fenêtre non plus.
    func test_liftHeight_floatingOrHiddenKeyboard_liftsNothing() {
        let floating = CGRect(x: 40, y: 300, width: 320, height: 250)
        XCTAssertEqual(ComposerPanelHeightLaw.liftHeight(endFrame: floating, windowHeight: window, current: 336), 0)
        let hidden = CGRect(x: 0, y: window, width: 402, height: 336)
        XCTAssertEqual(ComposerPanelHeightLaw.liftHeight(endFrame: hidden, windowHeight: window, current: 336), 0)
    }

    private func postKeyboardFrame(_ frame: CGRect) {
        NotificationCenter.default.post(
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil,
            userInfo: [
                UIResponder.keyboardFrameEndUserInfoKey: frame,
                UIResponder.keyboardAnimationDurationUserInfoKey: 0.25
            ]
        )
        RunLoop.main.run(until: Date().addingTimeInterval(0.1))
    }

    /// Le chemin réel : clavier levé, une trame nulle ne le fait pas
    /// « disparaître » ; la fin du masquage, elle, remet tout à zéro.
    @MainActor
    func test_keyboardObserver_zeroFrameWhileRaised_keepsTheHeight_untilTheKeyboardHides() {
        let size = CGSize(width: 402, height: 874)
        let observer = KeyboardObserver(windowHeight: { size.height })
        postKeyboardFrame(CGRect(x: 0, y: size.height - 336, width: size.width, height: 336))
        XCTAssertEqual(observer.height, 336)

        postKeyboardFrame(.zero)
        XCTAssertEqual(observer.height, 336)
        XCTAssertTrue(observer.isVisible)

        NotificationCenter.default.post(name: UIResponder.keyboardDidHideNotification, object: nil)
        RunLoop.main.run(until: Date().addingTimeInterval(0.1))
        XCTAssertEqual(observer.height, 0)
        XCTAssertFalse(observer.isVisible)
    }

    /// Dépendance à l'ordre (cycle 8, une fois sur un grand lot) : le témoin ci-dessus lisait `DeviceLayout.windowSize`
    /// pour poser son clavier, l'observateur la RELISAIT à la réception — et entre les deux, la fenêtre clé d'un test
    /// précédent (402 × 800, cachée dans son `tearDown`) cédait la place à celle de l'app (874). Le clavier se lisait
    /// alors « flottant » (0) ou plafonné. L'observateur mesure désormais contre UNE hauteur, injectée ici.
    @MainActor
    func test_keyboardObserver_measuresAgainstItsWindowHeight_whicheverWindowIsKey() {
        let observer = KeyboardObserver(windowHeight: { 874 })
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let other = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: .zero)
        other.frame = CGRect(x: 0, y: 0, width: 402, height: 600)
        other.rootViewController = UIViewController()
        other.makeKeyAndVisible()
        defer { other.isHidden = true }
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))

        postKeyboardFrame(CGRect(x: 0, y: 874 - 336, width: 402, height: 336))

        XCTAssertEqual(observer.height, 336, "une autre fenêtre clé ne change pas la mesure du clavier")
    }

    // MARK: - Un écran, un observateur (#10544)

    /// La barre montée par un hôte qui observe déjà le clavier (le lecteur de
    /// stories) n'en crée pas un second.
    @MainActor
    func test_keyboardSource_withAHostObserver_createsNone() {
        let source = ComposerKeyboardSource()
        source.adopt(host: KeyboardObserver())
        XCTAssertFalse(source.ownsObserver)
    }

    @MainActor
    func test_keyboardSource_withoutAHost_ownsItsObserver() {
        let source = ComposerKeyboardSource()
        source.adopt(host: nil)
        XCTAssertTrue(source.ownsObserver)
    }

    func test_theBar_noLongerCreatesItsOwnObserverUnconditionally() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let src = try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar.swift"),
            encoding: .utf8
        )
        XCTAssertFalse(src.contains("= KeyboardObserver()"),
                       "chaque barre créait son observateur : deux par écran de story")
        XCTAssertTrue(src.contains("ownKeyboard.lastKnownHeight(host: hostKeyboard)"))
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
