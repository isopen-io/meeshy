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
        .background(.ultraThinMaterial, in: Capsule())
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
