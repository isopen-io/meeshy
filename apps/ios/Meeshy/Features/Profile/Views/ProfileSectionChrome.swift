import SwiftUI
import MeeshySDK
import MeeshyUI

// Le chrome commun des sections de ma fiche : le titre, la carte et la pastille d'icône. Il vivait en fonctions privées
// de `ProfileView` ; les sections qui ont quitté la fiche pour leur fichier le partagent, pour qu'aucune ne recopie le
// dessin d'une autre.

/// Le titre d'une section : une icône et un mot, dans la couleur de la section.
struct ProfileSectionHeader: View {
    let icon: String
    let title: String
    /// La couleur sémantique de la section (un jeton `MeeshyColors`), jamais un hex recomposé ici.
    let color: Color

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundStyle(color)
                .accessibilityHidden(true)
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                .foregroundColor(color)
                .tracking(1.2)
        }
        .padding(.leading, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Le fond d'une carte de section, teinté par l'accent de la fiche.
struct ProfileSectionCard: View {
    let tintHex: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: tintHex))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: tintHex), lineWidth: 1)
            )
    }
}

/// La pastille carrée qui porte l'icône d'une rangée.
struct ProfileFieldIcon: View {
    let name: String
    /// L'accent de la fiche (hex), relayé sous son nom de règle : c'est l'accent du contexte, pas une couleur en dur.
    let accentColor: String

    var body: some View {
        Image(systemName: name)
            .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
            .foregroundStyle(Color(hex: accentColor))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm - 2)
                    .fill(Color(hex: accentColor).opacity(0.12))
            )
            .accessibilityHidden(true)
    }
}

/// Une rangée qui OUVRE quelque chose : icône, titre, chevron, au moins 44 pt de haut. Le toucher et l'indice VoiceOver
/// vont ensemble : une rangée qui a l'air de mener quelque part y mène.
struct ProfileNavigationRow: View {
    let icon: String
    let title: String
    /// Indice VoiceOver, seulement quand le titre ne dit pas déjà où la rangée mène (épure : un « Ouvre X » sous « X » est du bruit).
    let hint: String?
    let identifier: String
    let accentHex: String
    let action: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                ProfileFieldIcon(name: icon, accentColor: accentHex)
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                    .foregroundStyle(theme.textPrimary)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: MeeshySpacing.sm)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityHint(hint ?? "")
        .accessibilityIdentifier(identifier)
    }
}
