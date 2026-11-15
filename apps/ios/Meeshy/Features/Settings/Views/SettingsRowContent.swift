import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce qu'une rangée qui ouvre une feuille montre et annonce** (#18589) :
/// icône, titre, teinte, nom et indice VoiceOver, et la feuille qu'elle ouvre.
/// Les interrupteurs, les menus, la Boutique et les boutons du pied se
/// dessinent eux-mêmes : pour eux, `nil`.
struct SettingsRowContent: Equatable {
    let icon: String
    let title: String
    let color: String
    let accessibilityLabel: String
    let hint: String
    let sheet: SettingsSheet

    static func of(_ destination: SettingsDestination, voice: VoiceSetupState) -> SettingsRowContent? {
        if destination == .voiceProfile { return voiceProfile(voice) }
        return account(destination) ?? annex(destination)
    }

    /// UNE rangée pour la voix : sans consentement vocal aucun profil ne peut
    /// exister, elle crée donc dans l'assistant ; sinon elle ouvre la gestion,
    /// qui propose l'assistant si elle ne trouve aucun profil. C'est la même
    /// loi que celle des indicateurs (`VoiceSetupDestination`).
    static func voiceProfile(_ state: VoiceSetupState) -> SettingsRowContent {
        switch VoiceSetupDestination.resolve(.voice, state: state) {
        case .createProfile:
            let title = String(localized: "settings.voice.create", bundle: .main)
            return SettingsRowContent(icon: "plus.circle.fill", title: title, color: MeeshyColors.successHex, accessibilityLabel: title,
                                      hint: String(localized: "settings.voice.create.hint", bundle: .main), sheet: .voiceProfileWizard)
        case .manageProfile, .transcription:
            let title = String(localized: "settings.voice.manage", bundle: .main)
            return SettingsRowContent(icon: "waveform.circle.fill", title: title, color: MeeshyColors.trackingAccentHex, accessibilityLabel: title,
                                      hint: String(localized: "settings.voice.manage.hint", bundle: .main),
                                      sheet: .voiceProfileManage(opensWizardWhenEmpty: false))
        }
    }

    private static func account(_ destination: SettingsDestination) -> SettingsRowContent? {
        switch destination {
        case .privacy:
            return SettingsRowContent(icon: "lock.fill", title: String(localized: "settings.privacy.title", bundle: .main), color: MeeshyColors.brandPrimaryHex,
                                      accessibilityLabel: String(localized: "settings.privacy.a11y", bundle: .main),
                                      hint: String(localized: "settings.privacy.hint", bundle: .main), sheet: .privacy)
        case .security:
            return SettingsRowContent(icon: "shield.fill", title: String(localized: "settings.security.title", bundle: .main), color: MeeshyColors.infoHex,
                                      accessibilityLabel: String(localized: "settings.security.a11y", bundle: .main),
                                      hint: String(localized: "settings.security.hint", bundle: .main), sheet: .security)
        case .blockedUsers:
            let title = String(localized: "settings.blocked_users", bundle: .main)
            return SettingsRowContent(icon: "lock.shield", title: title, color: MeeshyColors.errorHex, accessibilityLabel: title,
                                      hint: String(localized: "settings.blocked_users.hint", bundle: .main), sheet: .blockedUsers)
        case .notifications:
            let title = String(localized: "settings.notifications.title", bundle: .main)
            return SettingsRowContent(icon: "bell.badge.fill", title: title, color: MeeshyColors.errorHex, accessibilityLabel: title,
                                      hint: String(localized: "settings.notifications.open.hint",
                                                   defaultValue: "Sons, vibrations et ce qui vous est notifié", bundle: .main),
                                      sheet: .notifications)
        case .mediaDownload:
            return SettingsRowContent(icon: "arrow.down.circle.fill", title: String(localized: "settings.media.download.title", bundle: .main),
                                      color: MeeshyColors.warningHex, accessibilityLabel: String(localized: "settings.media.download.a11y", bundle: .main),
                                      hint: String(localized: "settings.media.download.hint", bundle: .main), sheet: .mediaDownload)
        default:
            return nil
        }
    }

    private static func annex(_ destination: SettingsDestination) -> SettingsRowContent? {
        switch destination {
        case .storage:
            return plain(icon: "internaldrive.fill", title: String(localized: "settings.storage", bundle: .main), color: MeeshyColors.warningHex,
                         hint: String(localized: "settings.storage.hint", bundle: .main), sheet: .storage)
        case .exportData:
            return plain(icon: "square.and.arrow.up.fill", title: String(localized: "settings.export_data", bundle: .main), color: MeeshyColors.warningHex,
                         hint: String(localized: "settings.export_data.hint", bundle: .main), sheet: .dataExport)
        case .helpCenter:
            return plain(icon: "lifepreserver.fill", title: String(localized: "settings.help_center", bundle: .main), color: MeeshyColors.successHex,
                         hint: String(localized: "settings.help_center.hint", bundle: .main), sheet: .support)
        case .about:
            return plain(icon: "info.circle.fill", title: String(localized: "settings.about.meeshy", bundle: .main), color: MeeshyColors.infoHex,
                         hint: String(localized: "settings.about.hint", bundle: .main), sheet: .about)
        case .terms:
            return plain(icon: "doc.text.fill", title: String(localized: "settings.terms", bundle: .main), color: MeeshyColors.infoHex,
                         hint: String(localized: "settings.terms.hint", bundle: .main), sheet: .terms)
        case .privacyPolicy:
            return plain(icon: "hand.raised.fill", title: String(localized: "settings.privacy_policy", bundle: .main), color: MeeshyColors.infoHex,
                         hint: String(localized: "settings.privacy_policy.hint", bundle: .main), sheet: .privacyPolicy)
        case .licenses:
            return plain(icon: "checkmark.seal.fill", title: String(localized: "settings.licenses", bundle: .main), color: MeeshyColors.infoHex,
                         hint: String(localized: "settings.licenses.hint", bundle: .main), sheet: .licenses)
        default:
            return nil
        }
    }

    private static func plain(icon: String, title: String, color: String, hint: String, sheet: SettingsSheet) -> SettingsRowContent {
        SettingsRowContent(icon: icon, title: title, color: color, accessibilityLabel: title, hint: hint, sheet: sheet)
    }
}
