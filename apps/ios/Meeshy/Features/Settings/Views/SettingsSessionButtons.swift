import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les gestes de session des réglages
//
// Sortis de `SettingsView.swift` : les boutons du pied et le voile de
// déconnexion, sans état propre — l'écran garde ses présentations et passe le geste.

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

/// « Supprimer le compte », seul et en dernier (#18589) : un geste qu'on fait
/// une fois ne voisine pas avec les réglages de tous les jours. La feuille
/// qu'il ouvre demande encore la confirmation.
struct SettingsDeleteAccountButton: View {
    let isDisabled: Bool
    let action: () -> Void

    var body: some View {
        Button {
            HapticFeedback.heavy()
            action()
        } label: {
            HStack {
                Image(systemName: "person.crop.circle.badge.minus")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                Text(String(localized: "settings.delete_account", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            }
            .foregroundStyle(MeeshyColors.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(MeeshyColors.error.opacity(MeeshyOpacity.medium), lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        }
        .disabled(isDisabled)
        .accessibilityLabel(String(localized: "settings.delete_account", bundle: .main))
        .accessibilityHint(String(localized: "settings.delete_account.hint", bundle: .main))
    }
}

/// **Le voile « Déconnexion en cours »** pendant `await authManager.logout()`
/// (quiesce puis purge, 300 à 800 ms). L'alerte système ne porte pas de
/// progression sur son bouton : le voile la montre et absorbe les touchers,
/// pour qu'aucun n'ouvre une navigation orpheline pendant la purge. Son fondu
/// est porté par le conteneur, qui observe la valeur : posé sur la vue
/// insérée, il ne jouait jamais.
struct SettingsLogoutVeil: View {
    let isVisible: Bool

    var body: some View {
        ZStack {
            if isVisible {
                veil.transition(.opacity)
            }
        }
        .meeshyAnimation(.easeInOut(duration: MeeshyGlassRecipe.toneFadeDuration), reduced: MeeshyMotion.reducedFade, value: isVisible)
    }

    private var veil: some View {
        ZStack {
            Color.black.opacity(MeeshyOpacity.strong).ignoresSafeArea()
            VStack(spacing: MeeshySpacing.md + 2) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .controlSize(.large)
                    .tint(.white)
                Text(String(localized: "settings.logout.inprogress", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, MeeshySpacing.xxxl)
            .padding(.vertical, MeeshySpacing.xxl)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        }
        .accessibilityElement(children: .combine)
    }
}
