import SwiftUI
import MeeshyUI

/// Fond d'un réel AUDIO dans le feed : dégradé de la couleur d'accent +
/// waveform animée quand le réel est le plus centré. Pas de son dans le feed
/// (le son démarre dans le viewer plein écran au tap).
struct ReelAudioBackdrop: View, Equatable {
    let accentHex: String
    let isActive: Bool

    @State private var phase: CGFloat = 0

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)
    }

    static func == (lhs: ReelAudioBackdrop, rhs: ReelAudioBackdrop) -> Bool {
        lhs.accentHex == rhs.accentHex && lhs.isActive == rhs.isActive
    }

    var body: some View {
        let accent = Color(hex: accentHex)
        ZStack {
            LinearGradient(
                colors: [accent.opacity(0.85), accent.opacity(0.45), accent.opacity(0.85)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            ReelAudioWaveformBars(phase: phase, isActive: isActive)
                .fill(Color.white.opacity(0.85))
                .frame(maxHeight: 120)
            Image(systemName: "waveform")
                // doctrine 86i — glyphe décoratif borné, centré derrière le contenu du réel
                .font(.system(size: 44, weight: .semibold))
                .foregroundColor(.white.opacity(0.25))
        }
        .onAppear { if isActive { startAnimating() } }
        .adaptiveOnChange(of: isActive) { _, active in
            if active {
                startAnimating()
            } else {
                // Coupe la boucle repeatForever quand le réel perd l'élection
                // autoplay — les barres retombent sur leur profil statique mais
                // l'animation, elle, continuait de tourner à vide chaque frame.
                withTransaction(Transaction(animation: nil)) { phase = 0 }
            }
        }
        // Fond purement décoratif : le contenu sémantique du réel est porté par ReelFeedCard.
        .accessibilityDecorative()
    }

    private func startAnimating() {
        // Reduce Motion (système ou override in-app) : on fige la waveform sur son
        // profil statique (phase 0 → silhouette variée) plutôt qu'une boucle infinie.
        guard !reduceMotion else { return }
        // `|sin|` est de période π : une boucle LINÉAIRE de 0 à π, sans
        // aller-retour, reboucle sans couture — la vague défile.
        withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
            phase = .pi
        }
    }
}

/// Les barres de la waveform en UNE forme dont `phase` est animable (#9702).
///
/// Les hauteurs étaient calculées dans le corps de la vue : SwiftUI n'en
/// interpolait que le départ et l'arrivée, et `|sin(x + π)| == |sin(x)|` — les
/// barres ne bougeaient pas, pendant que la boucle `repeatForever` tournait.
/// Ici la phase passe par `animatableData` : chaque frame trace la courbe,
/// en un seul chemin que le GPU remplit.
struct ReelAudioWaveformBars: Shape {
    var phase: CGFloat
    let isActive: Bool

    nonisolated static let barCount = 28
    nonisolated static let barWidth: CGFloat = 3
    nonisolated static let barSpacing: CGFloat = 4
    nonisolated static let baseHeight: CGFloat = 18
    nonisolated static let amplitude: CGFloat = 46

    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }

    nonisolated static func barHeight(index: Int, phase: CGFloat, isActive: Bool) -> CGFloat {
        guard isActive else { return baseHeight }
        return baseHeight + amplitude * abs(sin(phase + CGFloat(index) * 0.5))
    }

    func path(in rect: CGRect) -> Path {
        let count = Self.barCount
        let totalWidth = CGFloat(count) * Self.barWidth + CGFloat(count - 1) * Self.barSpacing
        let originX = rect.midX - totalWidth / 2
        let corner = CGSize(width: Self.barWidth / 2, height: Self.barWidth / 2)
        var path = Path()
        for index in 0..<count {
            let height = Self.barHeight(index: index, phase: phase, isActive: isActive)
            let x = originX + CGFloat(index) * (Self.barWidth + Self.barSpacing)
            let bar = CGRect(x: x, y: rect.midY - height / 2, width: Self.barWidth, height: height)
            path.addRoundedRect(in: bar, cornerSize: corner)
        }
        return path
    }
}
