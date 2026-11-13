import SwiftUI
import MeeshyUI

// L'habillage d'une vignette d'appel, partagé par la tuile de groupe, ma
// vignette d'appel entrant et la vignette du duo établi : sa plaque de nom et
// la teinte de son liseré.

/// La plaque de nom d'une vignette d'appel : la tuile de groupe et ma
/// vignette d'appel entrant portent la même (vue finale, P17 et P11).
struct CallTileNameplate: View {
    let title: String
    var isMicMuted = false
    var isScreenSharing = false
    var isReconnecting = false

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            if isMicMuted {
                Image(systemName: "mic.slash.fill")
                    .foregroundStyle(MeeshyColors.error)
            }
            if isScreenSharing {
                Image(systemName: "rectangle.on.rectangle")
            }
            if isReconnecting {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .foregroundStyle(MeeshyColors.warning)
            }
            Text(title)
                .lineLimit(1)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(Color.white)
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, MeeshySpacing.xs)
        .callChromeGlass(in: Capsule())
    }
}

/// U2.5 — la puce de verre de l'écran partagé mis à la une, en haut à gauche de la scène :
/// « Écran de X », puis le facteur de zoom (« · 2× »). Décorative : la vignette porte déjà
/// « Écran de X » à VoiceOver ; elle ne prend aucun toucher, le pincement la traverse.
struct CallScreenShareChip: View {
    let text: String

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "rectangle.on.rectangle")
            Text(text)
                .lineLimit(1)
        }
        .font(.caption.weight(.semibold).monospacedDigit())
        .foregroundStyle(Color.white)
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.vertical, MeeshySpacing.xs)
        .callChromeGlass(in: Capsule())
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Loi 4 — la teinte du liseré d'une vignette : la couleur de la personne,
/// par la fonction partagée ; un trait neutre quand aucun identifiant ne la
/// fonde.
extension CallSelfTileStroke {
    @MainActor static func color(forKey key: String?) -> Color {
        guard let key else { return Color.white.opacity(MeeshyOpacity.medium) }
        return Color(hex: CallSpeakerColor.hex(for: key))
    }
}

/// Loi 4 · 11 — la découpe et le liseré de ma vignette du duo. Rangée par une échelle
/// (`CallSelfTileStow`), elle garde les coins et le trait d'une petite vignette : les deux sont
/// contre-mis à l'échelle de son rangement.
struct CallSelfTileOutline: ViewModifier {
    let color: Color
    let lineWidth: CGFloat
    let stowFactor: CGFloat

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: CallSelfTileScale.counterScaled(MeeshyRadius.smPlus, by: stowFactor))
        return content
            .clipShape(shape)
            .overlay(shape.stroke(color, lineWidth: CallSelfTileScale.counterScaled(lineWidth, by: stowFactor)))
    }
}
