import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le contenu de la feuille qu'une rangée des Réglages a ouverte** (#18589).
/// Les feuilles ne changent pas : seule leur porte bouge. Une feuille n'hérite
/// pas des `EnvironmentObject` de son présentateur, d'où `authManager` remis à
/// celles qui le lisent (Sécurité, Changer de compte).
///
/// La feuille se déclare au registre des surfaces : une conversation ouverte
/// depuis une notification la referme, et « Réduire les animations » y vaut
/// (racine du mouvement) jusque dans les sous-écrans de Sécurité.
struct SettingsSheetContent: View {
    let sheet: SettingsSheet
    let authManager: AuthManager

    var body: some View {
        content.closesForConversationOpening(.sheet)
    }

    @ViewBuilder
    private var content: some View {
        switch sheet {
        case .privacy: PrivacySettingsView()
        case .security: SecurityView().environmentObject(authManager)
        case .blockedUsers: BlockedUsersView()
        case .notifications: NotificationSettingsView()
        case .voiceProfileManage(let opensWizardWhenEmpty):
            VoiceProfileManageView(accentColor: MeeshyColors.trackingAccentHex, opensWizardWhenEmpty: opensWizardWhenEmpty)
        case .voiceProfileWizard: VoiceProfileWizardView(accentColor: MeeshyColors.trackingAccentHex)
        case .mediaDownload: MediaDownloadSettingsView()
        case .storage: DataStorageView()
        case .dataExport: DataExportView()
        case .support: SupportView()
        case .about: AboutView()
        case .terms: TermsOfServiceView()
        case .privacyPolicy: PrivacyPolicyView()
        case .licenses: LicensesView()
        // « Changer de compte » GARDE les sessions : la feuille liste les
        // comptes de l'appareil, un compte gardé s'ouvre sans mot de passe (#8286).
        case .accountSwitcher: AccountSwitcherSheet().environmentObject(authManager)
        case .deleteAccount: DeleteAccountView()
        }
    }
}
