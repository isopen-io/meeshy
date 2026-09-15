import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La bande d'onde du plein écran audio, en type NOMINAL.**
///
/// Extraite d'`AudioFullscreenView` le 2026-09-13, pour deux raisons qui
/// tombaient ensemble :
///
/// 1. **Le porteur demande d'y glisser** — « glisser vers la gauche fais
///    avancer, glisser vers la droite fais reculer ; visuellement on voit le
///    recul sur la waveform ». La bande ne répondait qu'au `onTapGesture` : on
///    pouvait sauter à un point, jamais parcourir.
/// 2. **Le fichier hôte était hors budget** (1262 lignes > 1200) et figurait
///    dans `legacyOverBudget`, où « ajouter est interdit : on extrait d'abord,
///    on ajoute ensuite ». La règle du dépôt commandait donc l'ordre : cette
///    extraction n'est pas un détour vers le geste, elle en est la condition.
///
/// Le glissement est PROGRESSIF au sens de la directive du 2026-08-30 :
/// `AVAudioPlayer.currentTime` est un déplacement à coût nul, donc l'écoute
/// suit le doigt image par image, et relâcher ne fait que conclure. Un
/// `DragGesture(minimumDistance: 0)` couvre le tap ET le parcours : un tap est
/// un glissement de longueur nulle, et le distinguer aurait demandé deux
/// gestes concurrents pour un seul geste utilisateur.
struct AudioFullscreenWaveform: View {

    /// Les amplitudes analysées. Vide ⇒ la bande se peint depuis son motif de
    /// repli : une bande d'onde absente ne doit pas laisser un vide qui
    /// ressemble à un défaut de chargement.
    let samples: [Float]
    /// Position de lecture, 0…1. Colore les barres franchies et pose la tête.
    let progress: Double
    let accent: Color
    /// Reçoit la fraction visée. L'hôte décide ce qu'il en fait — la bande ne
    /// connaît aucun player.
    let onSeek: (Double) -> Void

    private static let barWidth: CGFloat = 3
    private static let spacing: CGFloat = 2
    private static let height: CGFloat = 80

    var body: some View {
        GeometryReader { geo in
            let barCount = samples.isEmpty ? 80 : samples.count
            let totalWidth = CGFloat(barCount) * (Self.barWidth + Self.spacing) - Self.spacing
            let needsScroll = totalWidth > geo.size.width
            let playheadBarIndex = max(0, min(barCount - 1, Int(progress * Double(barCount))))

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    bars(geo: geo, barCount: barCount, needsScroll: needsScroll,
                         playheadBarIndex: playheadBarIndex)
                        .contentShape(Rectangle())
                        .gesture(seekGesture(contentWidth: needsScroll ? totalWidth : geo.size.width))
                }
                .adaptiveOnChange(of: playheadBarIndex) { _, newIdx in
                    guard needsScroll else { return }
                    withAnimation(.linear(duration: 0.2)) {
                        proxy.scrollTo("bar-\(newIdx)", anchor: .center)
                    }
                }
            }
        }
        .frame(height: Self.height)
    }

    /// **Le doigt emmène l'écoute avec lui.**
    ///
    /// `onChanged` déplace RÉELLEMENT la lecture, il ne se contente pas de
    /// bouger un curseur : c'est ce que « on voit le recul sur la waveform »
    /// demande, et ce que la directive « gestes progressifs et annulables »
    /// impose — un `onEnded` seul y est nommément interdit.
    ///
    /// Une seule haptique, à la levée : en émettre une par image de geste
    /// ferait vibrer l'appareil en continu.
    private func seekGesture(contentWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard contentWidth > 0 else { return }
                onSeek(max(0, min(1, value.location.x / contentWidth)))
            }
            .onEnded { _ in HapticFeedback.light() }
    }

    @ViewBuilder
    private func bars(geo: GeometryProxy, barCount: Int,
                      needsScroll: Bool, playheadBarIndex: Int) -> some View {
        HStack(spacing: Self.spacing) {
            ForEach(0..<barCount, id: \.self) { i in
                let isPlayed = Double(i) / Double(barCount) <= progress
                let sample = samples.isEmpty ? Self.fallbackHeight(index: i) : CGFloat(samples[i])
                let barHeight = max(3, sample * geo.size.height * 0.9)
                let computedWidth = needsScroll
                    ? Self.barWidth
                    : max(2, (geo.size.width - Self.spacing * CGFloat(barCount - 1)) / CGFloat(barCount))

                RoundedRectangle(cornerRadius: 1.5)
                    .fill(isPlayed ? accent : Color.white.opacity(0.15))
                    .frame(width: computedWidth, height: barHeight)
                    .overlay(
                        needsScroll && i == playheadBarIndex
                            ? RoundedRectangle(cornerRadius: 1.5)
                                .fill(Color.white)
                                .frame(width: 2, height: geo.size.height * 0.95)
                            : nil
                    )
                    .id("bar-\(i)")
            }
        }
        .frame(height: geo.size.height, alignment: .center)
    }

    /// Motif de repli quand l'analyse n'a rien rendu — déterministe par index,
    /// pour qu'une même piste peigne toujours la même silhouette.
    /// `static` : la loi ne dépend d'aucune instance, et un test peut la lire.
    static func fallbackHeight(index: Int) -> CGFloat {
        let seed = Double(index * 7 + 3)
        let value = 0.2 + abs(sin(seed) * 0.4 + cos(seed * 0.5) * 0.3)
        return CGFloat(min(1.0, value))
    }
}
