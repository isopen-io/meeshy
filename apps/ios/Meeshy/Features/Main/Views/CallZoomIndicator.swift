import SwiftUI

/// #8441 — la pastille de verre « 2× » posée au pied de sa propre image
/// pendant le pincement et une seconde après. Décorative : VoiceOver lit le
/// facteur sur l'élément ajustable (`CallCameraZoomAccessibilityElement`).
struct CallZoomIndicator: View, Equatable {
    let label: String

    var body: some View {
        Text(label)
            .font(.caption.weight(.semibold).monospacedDigit())
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Color.white.opacity(0.25), lineWidth: 0.5))
            .environment(\.colorScheme, .dark)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
