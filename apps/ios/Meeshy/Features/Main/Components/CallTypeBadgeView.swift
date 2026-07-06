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
        HStack(spacing: 6) {
            Image(systemName: isVideo ? "video.fill" : "phone.fill")
                .font(MeeshyFont.relative(12, weight: .semibold))
                .accessibilityHidden(true)
            Text(label)
                .font(.caption2.weight(.semibold))
        }
        .foregroundColor(MeeshyColors.indigo400)
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(MeeshyColors.indigo400.opacity(0.15))
                .overlay(
                    Capsule()
                        .stroke(MeeshyColors.indigo400.opacity(0.3), lineWidth: 0.5)
                )
        )
    }
}
