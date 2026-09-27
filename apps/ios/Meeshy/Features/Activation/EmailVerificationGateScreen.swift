import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **La validation de l'e-mail, présentée par-dessus TOUT** (#8365) — y compris
/// par-dessus la feuille du composeur, du lien ou de l'invitation qui attend sa
/// réponse : une `.sheet` posée à la racine ne peut pas se présenter quand une
/// autre feuille l'est déjà, et la demande attendrait pour toujours. D'où
/// UIKit : le contrôleur le plus haut présente la feuille.
///
/// Balayer la feuille vaut « Plus tard » : la demande est tranchée `false`.
enum EmailVerificationGateScreen {
    @MainActor
    static func present(reason: EmailGateReason, email: String, settle: @escaping (Bool) -> Void) -> (() -> Void)? {
        guard let top = topMostController() else { return nil }
        let host = GateHostingController(rootView: EmailVerificationGateView(reason: reason, email: email, onSettle: settle))
        host.onSwipeDismiss = { settle(false) }
        host.modalPresentationStyle = .pageSheet
        host.sheetPresentationController?.detents = [.large()]
        top.present(host, animated: true)
        return { [weak host] in host?.presentingViewController?.dismiss(animated: true) }
    }

    @MainActor
    private static func topMostController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}

private final class GateHostingController: UIHostingController<EmailVerificationGateView>, UIAdaptivePresentationControllerDelegate {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    var onSwipeDismiss: (() -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()
        presentationController?.delegate = self
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        onSwipeDismiss?()
    }
}

/// La feuille « Validez votre adresse e-mail » : la phrase qui dit POURQUOI,
/// puis l'étape de l'adresse de « Validez votre compte » (#8239) — le code part
/// dès l'ouverture, sa saisie se fait SUR PLACE (`EmailCodeEntry`).
struct EmailVerificationGateView: View {
    let reason: EmailGateReason
    let email: String
    let onSettle: (Bool) -> Void
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(String(localized: "activation.gate.title", defaultValue: "Validez votre adresse e-mail", bundle: .main))
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .foregroundStyle(theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    Text(lead)
                        .font(.subheadline)
                        .foregroundStyle(theme.textSecondary)
                }
                ActivationEmailStep(email: email, sendsOnAppear: true) { onSettle(true) }
                Button {
                    onSettle(false)
                } label: {
                    Text(String(localized: "activation.later", defaultValue: "Plus tard", bundle: .main))
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(MeeshyColors.indigo400)
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
            }
            .padding(24)
            .iPadFormWidth()
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
    }

    private var lead: String {
        switch reason {
        case .publish:
            return String(localized: "activation.gate.publish", defaultValue: "Pour publier, validez votre adresse. Votre publication est conservée et partira dès le code validé.", bundle: .main)
        case .invite:
            return String(localized: "activation.gate.invite", defaultValue: "Pour inviter par e-mail, validez votre adresse. Votre invitation partira dès le code validé.", bundle: .main)
        case .link:
            return String(localized: "activation.gate.link", defaultValue: "Pour créer un lien, validez votre adresse. Votre lien sera créé dès le code validé.", bundle: .main)
        }
    }
}
