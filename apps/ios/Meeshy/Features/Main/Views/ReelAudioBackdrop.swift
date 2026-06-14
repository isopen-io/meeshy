import SwiftUI
import MeeshyUI

/// Fond d'un réel AUDIO dans le feed : dégradé de la couleur d'accent +
/// waveform animée quand le réel est le plus centré. Pas de son dans le feed
/// (le son démarre dans le viewer plein écran au tap).
struct ReelAudioBackdrop: View, Equatable {
    let accentHex: String
    let isActive: Bool

    @State private var phase: CGFloat = 0

    static func == (lhs: ReelAudioBackdrop, rhs: ReelAudioBackdrop) -> Bool {
        lhs.accentHex == rhs.accentHex && lhs.isActive == rhs.isActive
    }

    private let bars = 28

    var body: some View {
        let accent = Color(hex: accentHex)
        ZStack {
            LinearGradient(
                colors: [accent.opacity(0.85), accent.opacity(0.45), accent.opacity(0.85)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            HStack(spacing: 4) {
                ForEach(0..<bars, id: \.self) { i in
                    Capsule()
                        .fill(Color.white.opacity(0.85))
                        .frame(width: 3, height: barHeight(i))
                }
            }
            .frame(maxHeight: 120)
            Image(systemName: "waveform")
                .font(.system(size: 44, weight: .semibold))
                .foregroundColor(.white.opacity(0.25))
        }
        .onAppear { if isActive { startAnimating() } }
        .adaptiveOnChange(of: isActive) { _, active in
            if active { startAnimating() }
        }
    }

    private func barHeight(_ i: Int) -> CGFloat {
        let base: CGFloat = 18
        guard isActive else { return base }
        let amp: CGFloat = 46
        return base + amp * abs(sin(phase + CGFloat(i) * 0.5))
    }

    private func startAnimating() {
        withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
            phase = .pi
        }
    }
}
