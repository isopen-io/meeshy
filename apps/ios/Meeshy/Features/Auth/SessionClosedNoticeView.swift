import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que l'utilisateur lit quand le serveur a fermé sa session (#9612),
/// AVANT de se reconnecter : une déconnexion sans explication se vit comme une
/// panne, ou comme une intrusion.
///
/// La fermeture décidée par l'administration se dit « par l'équipe Meeshy » :
/// aucun administrateur n'est jamais nommé.
struct SessionClosedNoticeCopy: Equatable {
    let title: String
    /// Absent quand le titre et le bouton disent tout : l'expiration d'une
    /// session n'a rien à ajouter à « Votre session a expiré » + « Se reconnecter ».
    let message: String?
    let systemImage: String
    /// La fermeture appelle peut-être une question : on offre d'écrire à l'équipe.
    let offersContact: Bool

    static let supportAddress = "support@meeshy.me"

    init(reason: SessionRevocationReason) {
        switch reason {
        case .adminRevoke:
            title = String(localized: "sessionClosed.admin.title", defaultValue: "Session fermée par l'équipe Meeshy", bundle: .main)
            message = String(localized: "sessionClosed.admin.message", defaultValue: "Pour protéger votre compte.", bundle: .main)
            systemImage = "shield.lefthalf.filled"
            offersContact = true
        case .userRevoke:
            title = String(localized: "sessionClosed.userRevoke.title", defaultValue: "Cet appareil a été déconnecté", bundle: .main)
            message = String(localized: "sessionClosed.userRevoke.message", defaultValue: "Session fermée depuis un autre appareil. Pas vous ? Changez votre mot de passe.", bundle: .main)
            systemImage = "iphone.slash"
            offersContact = false
        case .passwordChanged:
            title = String(localized: "sessionClosed.password.title", defaultValue: "Votre mot de passe a changé", bundle: .main)
            message = String(localized: "sessionClosed.password.message", defaultValue: "Pas vous à l'origine du changement ? Réinitialisez-le tout de suite.", bundle: .main)
            systemImage = "key.fill"
            offersContact = true
        case .logoutAllDevices:
            title = String(localized: "sessionClosed.signedOut.title", defaultValue: "Vous avez été déconnecté", bundle: .main)
            message = String(localized: "sessionClosed.allSignedOut.message", defaultValue: "Toutes les sessions du compte sont fermées.", bundle: .main)
            systemImage = "rectangle.portrait.and.arrow.right"
            offersContact = false
        case .sessionExpired:
            title = String(localized: "sessionClosed.expired.title", defaultValue: "Votre session a expiré", bundle: .main)
            message = nil
            systemImage = "clock.arrow.circlepath"
            offersContact = false
        case .activationRequired:
            title = String(localized: "sessionClosed.activation.title", defaultValue: "Confirmez votre adresse e-mail", bundle: .main)
            message = String(localized: "sessionClosed.activation.message", defaultValue: "Reconnectez-vous puis saisissez le code reçu par e-mail.", bundle: .main)
            systemImage = "envelope.badge"
            offersContact = false
        case .logout, .unknown:
            title = String(localized: "sessionClosed.signedOut.title", defaultValue: "Vous avez été déconnecté", bundle: .main)
            message = nil
            systemImage = "rectangle.portrait.and.arrow.right"
            offersContact = false
        }
    }
}

struct SessionClosedNoticeView: View {
    let notice: SessionRevocationNotice
    let onContinue: () -> Void

    @Environment(\.openURL) private var openURL
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let copy = SessionClosedNoticeCopy(reason: notice.reason)
        ScrollView {
            VStack(spacing: MeeshySpacing.xl) {
                Image(systemName: copy.systemImage)
                    .font(MeeshyFont.relative(MeeshyFont.largeTitleSize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.indigo500)
                    .padding(.top, MeeshySpacing.xxxl)
                    .accessibilityHidden(true)

                Text(copy.title)
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                    .foregroundStyle(theme.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)

                if let message = copy.message {
                    Text(message)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
                        .foregroundStyle(theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button(action: onContinue) {
                    Text(String(localized: "sessionClosed.continue", defaultValue: "Se reconnecter", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(MeeshyColors.brandGradient))
                }

                if copy.offersContact, let mail = URL(string: "mailto:\(SessionClosedNoticeCopy.supportAddress)") {
                    Button {
                        openURL(mail)
                    } label: {
                        Text(String(localized: "sessionClosed.contact", defaultValue: "Écrire à l'équipe Meeshy", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                            .foregroundStyle(MeeshyColors.indigo500)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .accessibilityHint(SessionClosedNoticeCopy.supportAddress)
                }
            }
            .padding(.horizontal, MeeshySpacing.xxl)
            .padding(.bottom, MeeshySpacing.xxl)
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
    }
}
