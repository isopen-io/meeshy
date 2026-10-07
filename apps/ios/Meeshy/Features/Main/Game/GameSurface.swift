import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA SURFACE COMMUNE DU JEU (#9383) — la carte teintée de l'écran Progression
/// (`ProgressionCard`), une puce, un bouton d'action. Des vues FEUILLES : aucune
/// n'observe de singleton, le thème se lit par une propriété calculée (Zero
/// Unnecessary Re-render).
struct GameCard<Content: View>: View {
    var tint: Color = MeeshyColors.brandPrimary
    var anchor: GameAnchor?
    var title: String?
    @ViewBuilder let content: () -> Content

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ProgressionCard(tint: tint) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                if let title {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                }
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .modifier(GameAnchorModifier(anchor: anchor))
    }
}

private struct GameAnchorModifier: ViewModifier {
    let anchor: GameAnchor?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let anchor {
            content.id(anchor)
        } else {
            content
        }
    }
}

/// UNE PASTILLE TIENT SUR UNE LIGNE, ET N'ÉLARGIT JAMAIS LA PAGE (#9564). Une rangée trop longue passe à la ligne
/// ENTRE les pastilles (`FlowLayout`), jamais dans une pastille. Une pastille plus longue que sa rangée entière
/// RÉTRÉCIT (jusqu'à 70 %) puis se tronque en dernier recours : elle ne garde pas sa largeur de force — un
/// `fixedSize()` ici poussait la carte, puis la page, au-delà de l'écran.
struct GameChip: View {
    /// Jusqu'où une pastille rétrécit avant de se tronquer.
    static let minimumScale: CGFloat = 0.7

    let text: String
    var tint: Color = MeeshyColors.brandPrimary

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundColor(ThemeManager.shared.textPrimary)
            .lineLimit(1)
            .minimumScaleFactor(GameChip.minimumScale)
            .truncationMode(.tail)
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(Capsule().fill(tint.opacity(0.2)))
    }
}

/// Le bouton d'un geste du jeu : il RESTE pendant le geste, avec son état dit (un
/// indicateur d'activité) — le faire disparaître au tap donnerait l'impression
/// d'un échec. Désactivé, il se tait en disant pourquoi (l'hôte pose la phrase) ;
/// il ne reste jamais grisé sans explication.
struct GameActionButton: View {
    let title: String
    var busyTitle: String?
    var busy = false
    var disabled = false
    var tint: Color = MeeshyColors.warning
    var identifier: String
    let action: () -> Void

    /// L'encre est SOMBRE sur l'ambre, dans les deux thèmes : un texte clair sur
    /// #FBBF24 tombe à 1,6:1 en thème clair — sous le seuil de lisibilité.
    private static let ink = MeeshyColors.indigo950

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                if busy {
                    ProgressView().tint(Self.ink)
                }
                Text(busy ? (busyTitle ?? title) : title)
                    .multilineTextAlignment(.center)
            }
            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
            .foregroundColor(Self.ink)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(tint))
        }
        .buttonStyle(.plain)
        .disabled(disabled || busy)
        .opacity(disabled || busy ? 0.7 : 1)
        .accessibilityIdentifier(identifier)
    }
}

/// Une ligne d'erreur, sous l'action qu'on peut retenter.
struct GameErrorLine: View {
    let message: String?
    var identifier: String

    var body: some View {
        if let message {
            HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .accessibilityHidden(true)
                Text(message)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            .foregroundColor(MeeshyColors.error)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(identifier)
        }
    }
}

/// Une phrase d'aide discrète sous un contrôle.
struct GameNote: View {
    let text: String
    var tone: Color?

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            .foregroundColor(tone ?? theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}
