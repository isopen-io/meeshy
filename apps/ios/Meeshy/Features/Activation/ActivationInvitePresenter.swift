import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **« Validez votre compte » se pose PAR-DESSUS TOUT (#14046, directive porteur :
/// « il faut rendre la bannière opaque par-dessus tout »).**
///
/// L'invitation est une feuille (#8239) : elle ne recouvre aucun contrôle, on la
/// lit puis on la ferme. Posée par `.sheet` sur la racine, elle ne trouvait
/// nulle part où se présenter dès que la racine présentait déjà quelque chose —
/// composer, visionneuse, réels, une autre feuille : UIKit ne présente qu'un
/// contrôleur modal par présentateur, et le jour était consommé quand même.
/// Comme l'écran d'appel (#8725), elle vit dans SA fenêtre, posée sur la scène
/// au-dessus de la fenêtre principale et de tout ce qu'elle présente.
enum ActivationInvitePresentation {
    /// Au-dessus de la fenêtre principale et de ses présentations, SOUS l'écran
    /// d'appel : un appel qui sonne passe devant l'invitation.
    static let windowLevel = UIWindow.Level(rawValue: CallWindowPresentation.windowLevel.rawValue - 1)

    /// Le fond PLEIN de la feuille : rien de ce qu'elle recouvre ne se lit à
    /// travers, en clair comme en sombre.
    static func surface(isDark: Bool) -> UIColor {
        UIColor(MeeshyColors.backgroundPrimary(isDark: isDark))
    }
}

/// Ce que le présentateur demande à UIKit — une couture pour que le témoin joue
/// la montée et le retrait sans scène réelle.
@MainActor
protocol ActivationInviteWindowHosting: AnyObject {
    /// `false` quand aucune scène n'est au premier plan : la montée se rejoue à
    /// l'activation de la scène. `onDismissedByUser` : la feuille a été glissée
    /// vers le bas — la fenêtre est déjà retirée.
    func show(_ model: ActivationInviteViewModel, onDismissedByUser: @escaping () -> Void) -> Bool
    func hide()
}

/// Suit `ActivationInviteViewModel.isPresented` et monte / retire la fenêtre.
@MainActor
final class ActivationInvitePresenter {
    nonisolated deinit {}

    private let hosting: ActivationInviteWindowHosting
    private var isPending = false
    private(set) var isShowing = false

    init(hosting: ActivationInviteWindowHosting = ActivationInviteWindowHost()) {
        self.hosting = hosting
    }

    func apply(model: ActivationInviteViewModel, isPresented: Bool) {
        guard isPresented else {
            isPending = false
            guard isShowing else { return }
            isShowing = false
            hosting.hide()
            return
        }
        guard !isShowing else { return }
        isShowing = hosting.show(model) { [weak self, weak model] in
            self?.isShowing = false
            model?.dismiss()
        }
        isPending = !isShowing
    }

    func retryPendingShow(model: ActivationInviteViewModel) {
        guard isPending else { return }
        apply(model: model, isPresented: true)
    }
}

/// La fenêtre réelle. Créée à la montée, relâchée au retrait : hors invitation,
/// aucune vue ne reste en mémoire.
@MainActor
final class ActivationInviteWindowHost: NSObject, ActivationInviteWindowHosting, UIAdaptivePresentationControllerDelegate {
    nonisolated deinit {}

    private var window: UIWindow?
    private weak var previousKeyWindow: UIWindow?
    private var onDismissedByUser: (() -> Void)?

    func show(_ model: ActivationInviteViewModel, onDismissedByUser: @escaping () -> Void) -> Bool {
        guard window == nil else { return true }
        guard let scene = CallWindowScene.target(), scene.activationState == .foregroundActive else { return false }
        let main = scene.keyWindow ?? scene.windows.first
        previousKeyWindow = main
        // Le clavier de l'écran d'en dessous (composer, réponse) vit plus haut
        // que cette fenêtre : il recouvrirait la feuille.
        main?.endEditing(true)

        let overlay = UIWindow(windowScene: scene)
        overlay.windowLevel = ActivationInvitePresentation.windowLevel
        overlay.overrideUserInterfaceStyle = main?.overrideUserInterfaceStyle ?? .unspecified
        let presenter = UIViewController()
        presenter.view.backgroundColor = .clear
        overlay.rootViewController = presenter
        window = overlay
        self.onDismissedByUser = onDismissedByUser
        overlay.makeKeyAndVisible()

        let sheet = UIHostingController(rootView: ActivationInviteView(model: model))
        sheet.view.backgroundColor = ActivationInvitePresentation.surface(isDark: ThemeManager.shared.mode.isDark)
        // Carte centrée sur iPad, feuille basse sur iPhone (largeur compacte).
        sheet.modalPresentationStyle = .formSheet
        sheet.presentationController?.delegate = self
        presenter.present(sheet, animated: !UIAccessibility.isReduceMotionEnabled)
        return true
    }

    func hide() {
        guard let presenter = window?.rootViewController, presenter.presentedViewController != nil else {
            release()
            return
        }
        presenter.dismiss(animated: !UIAccessibility.isReduceMotionEnabled) { [weak self] in self?.release() }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        let dismissed = onDismissedByUser
        release()
        dismissed?()
    }

    private func release() {
        guard let overlay = window else { return }
        window = nil
        onDismissedByUser = nil
        overlay.isHidden = true
        overlay.rootViewController = nil
        let restoreKey = previousKeyWindow
        previousKeyWindow = nil
        restoreKey?.makeKey()
    }
}
