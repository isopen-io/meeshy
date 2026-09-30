import SwiftUI
import MeeshyUI

// MARK: - Call Type Badge

/// Pastille "type d'appel" (audio/vidéo) partagée par `CallView` et
/// `IncomingCallView` — même glyphe + capsule indigo, seul le libellé
/// localisé (et sa longueur) varie selon l'écran appelant.
struct CallTypeBadgeView: View {
    let isVideo: Bool
    let label: String

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: isVideo ? "video.fill" : "phone.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .accessibilityHidden(true)
            Text(label)
                .font(.caption2.weight(.semibold))
        }
        .foregroundColor(MeeshyColors.indigo400)
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.xsPlus)
        .background(
            Capsule()
                .fill(MeeshyColors.indigo400.opacity(MeeshyOpacity.light))
                .overlay(
                    Capsule()
                        .stroke(MeeshyColors.indigo400.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.hairline)
                )
        )
    }
}
