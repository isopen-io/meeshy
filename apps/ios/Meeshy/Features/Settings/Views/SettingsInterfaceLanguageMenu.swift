import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le menu de la langue de l'interface** — « Automatique » suit la langue
/// principale du compte, les autres langues se nomment DANS leur langue. Le
/// choix revient à l'écran, qui l'enregistre et prévient du relancement.
struct SettingsInterfaceLanguageMenu: View {
    let choice: String?
    let onSelect: (String?) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Menu {
            Button { onSelect(nil) } label: {
                Label(Self.automaticLabel, systemImage: choice == nil ? "checkmark" : "")
            }
            ForEach(UILanguageOverride.selectableCodes, id: \.self) { code in
                Button { onSelect(code) } label: {
                    Label(Self.label(code), systemImage: choice == code ? "checkmark" : "")
                }
            }
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Text(currentLabel)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                Image(systemName: "chevron.up.chevron.down")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
            }
        }
        .accessibilityLabel(String(localized: "settings.interface_language", defaultValue: "Langue de l'interface", bundle: .main))
        .accessibilityValue(currentLabel)
    }

    private var currentLabel: String { choice.map(Self.label) ?? Self.automaticLabel }

    private static var automaticLabel: String {
        String(localized: "settings.interface_language.automatic", defaultValue: "Automatique", bundle: .main)
    }

    /// Un utilisateur qui cherche l'arabe reconnaît « العربية », pas « Arabe ».
    private static func label(_ code: String) -> String {
        Locale(identifier: code).localizedString(forIdentifier: code)?.capitalized ?? code
    }
}
