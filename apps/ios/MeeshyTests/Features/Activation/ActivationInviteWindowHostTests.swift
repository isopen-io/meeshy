import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// La VRAIE fenêtre de l'invitation, sur la scène de l'app hôte (#14046) : une
/// présentation plein écran (le composer) est déjà là, et l'invitation se pose
/// quand même PAR-DESSUS, au fond plein ; « Plus tard » retire la feuille et sa
/// fenêtre, et la fenêtre principale redevient la fenêtre clé. Avec
/// `MEESHY_RECETTE_DIR`, chaque étape est capturée en PNG.
@MainActor
final class ActivationInviteWindowHostTests: XCTestCase {

    private final class FreshDayStore: ActivationInviteDayStoring {
        func wasShownToday(now: Date) -> Bool { false }
        func markShown(now: Date) {}
    }

    private func foregroundScene() throws -> (UIWindowScene, UIWindow) {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        guard let scene, let main = scene.windows.first(where: { $0.windowLevel == .normal && !$0.isHidden }),
              main.rootViewController != nil else {
            throw XCTSkip("aucune scène au premier plan dans l'app hôte")
        }
        return (scene, main)
    }

    private func topmost(_ controller: UIViewController) -> UIViewController {
        controller.presentedViewController.map(topmost) ?? controller
    }

    private func settle(until condition: () -> Bool) {
        let deadline = Date().addingTimeInterval(5)
        while !condition() && Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }
    }

    private func makeComposerStandIn() -> UIViewController {
        let composer = UIViewController()
        composer.view.backgroundColor = .black
        composer.modalPresentationStyle = .fullScreen
        let close = UIButton(type: .system)
        close.setTitle("✕", for: .normal)
        close.tintColor = .white
        close.translatesAutoresizingMaskIntoConstraints = false
        composer.view.addSubview(close)
        NSLayoutConstraint.activate([
            close.leadingAnchor.constraint(equalTo: composer.view.safeAreaLayoutGuide.leadingAnchor, constant: 8),
            close.topAnchor.constraint(equalTo: composer.view.safeAreaLayoutGuide.topAnchor, constant: 8),
            close.widthAnchor.constraint(equalToConstant: 48),
            close.heightAnchor.constraint(equalToConstant: 48),
        ])
        return composer
    }

    private func invitedModel() -> ActivationInviteViewModel {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let model = ActivationInviteViewModel(store: FreshDayStore(), now: { now })
        let deadline = ISO8601DateFormatter().string(from: now.addingTimeInterval(19 * 86_400))
        model.userChanged(MeeshyUser(id: "u1", username: "amina", email: "amina@example.test",
                                     activation: UserActivation(phase: .invite, deadline: deadline, missing: [.email, .phone])))
        return model
    }

    private func capture(_ scene: UIWindowScene, _ name: String) {
        guard let directory = ProcessInfo.processInfo.environment["MEESHY_RECETTE_DIR"] else { return }
        let bounds = scene.screen.bounds
        let image = UIGraphicsImageRenderer(bounds: bounds).image { _ in
            scene.windows
                .filter { !$0.isHidden }
                .sorted { $0.windowLevel < $1.windowLevel }
                .forEach { $0.drawHierarchy(in: $0.frame, afterScreenUpdates: true) }
        }
        try? image.pngData()?.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png"))
    }

    private func overlay(in scene: UIWindowScene) -> UIWindow? {
        scene.windows.first { $0.windowLevel == ActivationInvitePresentation.windowLevel && !$0.isHidden }
    }

    private func touchedView(at point: CGPoint, in scene: UIWindowScene) -> UIView? {
        scene.windows
            .filter { !$0.isHidden && $0.isUserInteractionEnabled }
            .sorted { $0.windowLevel > $1.windowLevel }
            .lazy
            .compactMap { $0.hitTest($0.convert(point, from: nil), with: nil) }
            .first
    }

    func test_show_overAFullScreenComposer_leavesItsCloseButtonVisibleAndTouchable() throws {
        let (scene, main) = try foregroundScene()
        let composer = makeComposerStandIn()
        topmost(main.rootViewController!).present(composer, animated: false)
        settle { composer.view.window != nil && !composer.isBeingPresented }
        defer {
            composer.dismiss(animated: false)
            settle { composer.view.window == nil }
        }
        composer.view.layoutIfNeeded()
        let close = try XCTUnwrap(composer.view.subviews.compactMap { $0 as? UIButton }.first)
        let closeCenter = close.convert(CGPoint(x: close.bounds.midX, y: close.bounds.midY), to: nil)

        let host = ActivationInviteWindowHost()
        XCTAssertTrue(host.show(invitedModel()) {})
        defer {
            host.hide()
            settle { self.overlay(in: scene) == nil }
        }
        settle { self.overlay(in: scene)?.rootViewController?.presentedViewController?.isBeingPresented == false }
        let window = try XCTUnwrap(overlay(in: scene))
        let sheet = try XCTUnwrap(window.rootViewController?.presentedViewController)
        let card = sheet.presentationController?.presentedView ?? sheet.view!
        let cardFrame = card.convert(card.bounds, to: nil)
        capture(scene, "5-invite-leaves-the-close-button")

        XCTAssertFalse(cardFrame.contains(closeCenter), "l'invitation recouvre le ✕ du composer : \(cardFrame) ∋ \(closeCenter)")
        XCTAssertTrue(touchedView(at: closeCenter, in: scene) === close, "le ✕ du composer ne reçoit pas le toucher")
        let insideCard = CGPoint(x: cardFrame.midX, y: cardFrame.maxY - 20)
        XCTAssertTrue(touchedView(at: insideCard, in: scene)?.isDescendant(of: card) == true, "la carte reçoit ses propres touchers")
    }

    func test_show_overAFullScreenComposer_putsAnOpaqueSheetAboveIt_andLaterRemovesItsWindow() throws {
        let (scene, main) = try foregroundScene()
        let theme = ThemeManager.shared
        let originalMode = theme.mode
        defer { theme.mode = originalMode }

        for mode in [ThemeMode.light, .dark] {
            theme.mode = mode
            let composer = makeComposerStandIn()
            topmost(main.rootViewController!).present(composer, animated: false)
            settle { composer.view.window != nil && !composer.isBeingPresented }
            capture(scene, "1-composer-\(mode.rawValue)")

            let host = ActivationInviteWindowHost()
            XCTAssertTrue(host.show(invitedModel()) {})
            settle { self.overlay(in: scene)?.rootViewController?.presentedViewController?.isBeingPresented == false }

            let window = try XCTUnwrap(overlay(in: scene), "\(mode)")
            XCTAssertGreaterThan(window.windowLevel, main.windowLevel)
            XCTAssertTrue(window.isKeyWindow)
            let sheet = try XCTUnwrap(window.rootViewController?.presentedViewController)
            var alpha: CGFloat = 0
            sheet.view.backgroundColor?.getRed(nil, green: nil, blue: nil, alpha: &alpha)
            XCTAssertEqual(alpha, 1, "\(mode)")
            XCTAssertTrue(composer.view.window === main, "le composer reste monté dessous")
            capture(scene, "2-invite-over-composer-\(mode.rawValue)")

            host.hide()
            settle { self.overlay(in: scene) == nil }
            XCTAssertNil(overlay(in: scene), "\(mode)")
            XCTAssertTrue(main.isKeyWindow)
            capture(scene, "3-after-later-\(mode.rawValue)")

            composer.dismiss(animated: false)
            settle { composer.view.window == nil }

            let overRoot = ActivationInviteWindowHost()
            XCTAssertTrue(overRoot.show(invitedModel()) {})
            settle { self.overlay(in: scene)?.rootViewController?.presentedViewController?.isBeingPresented == false }
            XCTAssertNotNil(overlay(in: scene), "\(mode)")
            capture(scene, "4-invite-over-root-\(mode.rawValue)")
            overRoot.hide()
            settle { self.overlay(in: scene) == nil }
            XCTAssertNil(overlay(in: scene), "\(mode)")
        }
    }
}
