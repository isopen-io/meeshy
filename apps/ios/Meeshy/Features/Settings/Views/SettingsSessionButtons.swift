import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les gestes de session des réglages
//
// Sortis de `SettingsView.swift` (seuil de découpe de 1000 lignes) : deux boutons
// sans état propre — l'écran garde ses présentations et passe le geste.

/// **Changer de compte sans rien perdre (#8286).**
///
/// Deux gestes distincts : celui-ci GARDE les sessions et ouvre la liste
/// des comptes de l'appareil (`AccountSwitcherSheet`) ; « Déconnexion »,
/// juste dessous, ferme celle du compte actuel. D'où un habit neutre, et non
/// celui de la destruction : rien n'est perdu.
struct SettingsSwitchAccountButton: View {
    let isDisabled: Bool
    let action: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack {
                Image(systemName: "person.2.arrow.trianglehead.counterclockwise")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                Text(String(localized: "settings.switchAccount.title",
                            defaultValue: "Changer de compte", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            }
            .foregroundColor(theme.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(theme.textMuted.opacity(MeeshyOpacity.medium), lineWidth: 1)
                    )
            )
        }
        .disabled(isDisabled)
        .accessibilityHint(String(localized: "settings.switchAccount.message",
                                  defaultValue: "Passez d’un compte à l’autre sans vous déconnecter.",
                                  bundle: .main))
    }
}

/// « Déconnexion » : ferme la session du compte actuel, après confirmation.
struct SettingsLogoutButton: View {
    let isDisabled: Bool
    let action: () -> Void

    var body: some View {
        Button {
            HapticFeedback.heavy()
            action()
        } label: {
            // Note: le label reste statique — l'overlay sur SettingsView
            // gère le visual feedback pendant l'await. Le `.disabled`
            // ci-dessous empêche le double-tap.
            HStack {
                Image(systemName: "rectangle.portrait.and.arrow.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                Text(String(localized: "settings.logout.title", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(MeeshyColors.error.opacity(MeeshyOpacity.subtle))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(MeeshyColors.error.opacity(MeeshyOpacity.medium), lineWidth: 1)
                    )
            )
        }
        .disabled(isDisabled)
        .accessibilityLabel(String(localized: "settings.logout.a11y", bundle: .main))
        .accessibilityHint(String(localized: "settings.logout.hint", bundle: .main))
    }
}
