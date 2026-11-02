import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une section de l'écran des réglages** : son titre en capitales, teinté,
/// au-dessus d'une carte qui porte ses rangées. La teinte de la section colore
/// à la fois le titre, le fond et le contour de la carte.
struct SettingsSectionCard<Content: View>: View {
    let title: String
    let icon: String
    let color: String
    let content: Content

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                    /* L'ICÔNE EST DÉCORATIVE — relevé en revue
                       d'accessibilité : sans ce masque, VoiceOver
                       annonce le NOM DU SYMBOLE avant le titre, « waveform and
                       mic, PROFIL VOCAL », « externaldrive fill, DONNÉES ».
                       Une `Image(systemName:)` sans libellé prend le nom de
                       l'asset comme libellé par défaut ; le titre à côté dit
                       déjà tout ce que l'icône illustre. */
                    .accessibilityHidden(true)
                Text(title.uppercased())
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
            }
            .padding(.leading, MeeshySpacing.xs)

            VStack(spacing: 0) {
                content
            }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.surfaceGradient(tint: color))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(theme.border(tint: color), lineWidth: 1)
                    )
            )
        }
    }
}

/// **Une rangée de réglage** : la pastille d'icône teintée, le titre, puis ce
/// que la rangée porte à droite (bascule, valeur, chevron). VoiceOver lit la
/// rangée comme UN élément, sous son titre.
struct SettingsRowLabel<Trailing: View>: View {
    let icon: String
    let title: String
    let color: String
    let trailing: Trailing

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(Color(hex: color).opacity(MeeshyOpacity.light))
                )
                .accessibilityHidden(true)

            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            trailing
        }
        .padding(.horizontal, MeeshySpacing.md + 2)
        .padding(.vertical, MeeshySpacing.sm + 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}
