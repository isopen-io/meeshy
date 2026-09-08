import SwiftUI
import MeeshySDK
import MeeshyUI

/// La porte du tableau de bord « Progression » (#5698) depuis le profil —
/// une rangée, la même surface que `SettingsView.settingsRow`, teintée de
/// l'ambre des badges. La navigation est INJECTÉE (`action`) : cette vue ne
/// connaît ni le routeur ni la route, le profil décide.
struct ProfileProgressionEntry: View {
    let action: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    private let tint = MeeshyColors.warning

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "trophy.fill")
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(tint)
                    .frame(width: 28, height: 28)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                            .fill(tint.opacity(0.12))
                    )
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "profile.progression.title", defaultValue: "Progression", bundle: .main))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text(String(localized: "profile.progression.subtitle", defaultValue: "Badges, niveau et série", bundle: .main))
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.md + 2)
            .padding(.vertical, MeeshySpacing.sm + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.surfaceGradient(tint: tint))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(theme.border(tint: tint), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "profile.progression.title", defaultValue: "Progression", bundle: .main))
        .accessibilityHint(String(localized: "profile.progression.hint", defaultValue: "Ouvre votre progression", bundle: .main))
    }
}
