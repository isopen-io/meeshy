import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **Le lien de réinitialisation reçu par e-mail s'ouvre dans l'app** (#10868).
///
/// `DeepLinkRouter.handle(url:)` le remet ici, et « Nouveau mot de passe » se
/// présente au-dessus de ce qui est DÉJÀ présenté : le cas nominal est la
/// feuille « Mot de passe oublié » encore ouverte quand on revient de Mail, et
/// une feuille posée à la racine y serait refusée sans bruit. L'écran vérifie le
/// jeton et réclame le code de double authentification si le compte l'exige
/// (#10867). Connecté ou non : un jeton désigne son compte, pas la session.
///
/// Un lien mort ou désactivé par trop de codes faux propose « Demander un
/// nouveau lien » : l'écran cède la place à « Mot de passe oublié ».
@MainActor
final class PasswordResetLinkPresenter: ObservableObject {
    nonisolated deinit {}

    static let shared = PasswordResetLinkPresenter()

    enum Stage: Equatable {
        case newPassword(token: String)
        case requestNewLink
    }

    @Published private(set) var stage: Stage?

    private let presentsUI: Bool
    private weak var host: UIViewController?

    init(presentsUI: Bool = true) {
        self.presentsUI = presentsUI
    }

    func present(token: String) {
        show(.newPassword(token: token))
    }

    func requestNewLink() {
        show(.requestNewLink)
    }

    func dismiss() {
        stage = nil
        guard presentsUI else { return }
        host?.dismiss(animated: true)
        host = nil
    }

    private func show(_ next: Stage) {
        stage = next
        guard presentsUI else { return }
        let previous = host
        host = nil
        guard let previous, previous.presentingViewController != nil else {
            presentOnTop(next)
            return
        }
        previous.dismiss(animated: true) { [weak self] in self?.presentOnTop(next) }
    }

    private func presentOnTop(_ stage: Stage) {
        guard self.stage == stage, let top = Self.topViewController() else { return }
        let controller = UIHostingController(rootView: content(for: stage))
        host = controller
        top.present(controller, animated: true)
    }

    @ViewBuilder
    private func content(for stage: Stage) -> some View {
        switch stage {
        case .newPassword(let token):
            MeeshyNewPasswordView(
                resetToken: token,
                onRequestNewLink: { [weak self] in self?.requestNewLink() },
                onSignIn: { [weak self] in self?.dismiss() }
            )
        case .requestNewLink:
            MeeshyForgotPasswordView()
        }
    }

    private static func topViewController() -> UIViewController? {
        // Le résolveur UNIQUE de la scène active (`DeviceLayout`) : `connectedScenes` est un ensemble non ordonné,
        // `.first` y désigne une scène d'arrière-plan sous multi-fenêtre — la feuille partirait sur une fenêtre cachée.
        var top = DeviceLayout.activeWindow?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}
