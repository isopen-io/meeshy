import SwiftUI
import MeeshyUI

// MARK: - Les barres de la bande d'enregistrement
//
// Extraites de `ConversationMediaViews.swift` au 261i (#4302), qui dépassait le
// budget de 800–1100 lignes de la directive 2026-08-28. Découpe PAR
// RESPONSABILITÉ, pas par tranche : les deux barres de la bande d'enregistrement
// vivent ensemble et ne servent qu'à ça — l'une anime une hauteur, l'autre suit
// le niveau réel du micro.
//
// Relocalisation PURE : aucune ligne de comportement n'a changé.

// MARK: - Animated Waveform Bar
struct AnimatedWaveformBar: View {
    let index: Int
    let isRecording: Bool
    @State private var barHeight: CGFloat = 8

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private let minHeight: CGFloat = 6
    private let maxHeight: CGFloat = 26

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color.white.opacity(0.9), Color.white.opacity(0.5)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: barHeight)
            .onAppear {
                guard isRecording else { return }
                startAnimating()
            }
            .onDisappear {
                withTransaction(Transaction(animation: nil)) {
                    barHeight = minHeight
                }
            }
            .adaptiveOnChange(of: isRecording) { _, recording in
                if recording {
                    startAnimating()
                } else {
                    withAnimation(.easeOut(duration: 0.3)) {
                        barHeight = minHeight
                    }
                }
            }
    }

    private func startAnimating() {
        // Second exemplaire de la forme d'onde d'enregistrement (l'autre est
        // `ComposerWaveformBar`) : même valeur de repos, par le même calcul, et
        // pour la même raison — un trait plat se lit « cassé ».
        guard !reduceMotion else {
            withTransaction(Transaction(animation: nil)) {
                barHeight = RestingWaveform.height(
                    index: index,
                    minHeight: minHeight,
                    maxHeight: maxHeight
                )
            }
            return
        }
        let randomDuration = Double.random(in: 0.3...0.6)
        let randomDelay = Double(index) * 0.04
        withAnimation(
            .easeInOut(duration: randomDuration)
                .repeatForever(autoreverses: true)
                .delay(randomDelay)
        ) {
            barHeight = CGFloat.random(in: (minHeight + 4)...maxHeight)
        }
    }
}

// MARK: - Audio Level Bar (real microphone levels)
struct AudioLevelBar: View {
    let level: CGFloat // 0-1 normalized
    let isRecording: Bool

    private let minHeight: CGFloat = 6
    private let maxHeight: CGFloat = 26

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color.white.opacity(0.9), Color.white.opacity(0.5)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: isRecording ? minHeight + (maxHeight - minHeight) * level : minHeight)
            .animation(.spring(response: 0.08, dampingFraction: 0.6), value: level)
    }
}
