import SwiftUI

/// Bande de forme d'onde, partagée par les pistes audio et vidéo.
///
/// Extraite de `AudioClipBar`, où elle était dessinée en ligne. La dupliquer
/// dans `VideoClipBar` aurait laissé les deux tracés diverger au premier
/// ajustement — un seul rendu pour les deux barres.
struct WaveformStrip: View {

    let samples: [Float]
    let tint: Color

    var body: some View {
        GeometryReader { geo in
            // Aucun échantillon → on ne dessine rien. La version précédente
            // partait de `max(samples.count, 1)` puis déréférençait
            // `samples[0]` : tout clip dont la forme d'onde n'était pas encore
            // extraite plantait sur « Index out of range ».
            if !samples.isEmpty {
                let stepX = geo.size.width / CGFloat(samples.count)
                let heights = Self.barHeights(samples: samples,
                                              availableHeight: geo.size.height)
                HStack(alignment: .center, spacing: 1) {
                    ForEach(samples.indices, id: \.self) { i in
                        Capsule()
                            .fill(tint)
                            .frame(width: max(1, stepX - 1), height: heights[i])
                    }
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
        }
        .padding(.horizontal, 3)
        .drawingGroup()   // bake Metal : pas de re-tracé quand les props ne bougent pas
        .accessibilityHidden(true)
    }

    /// Hauteur en points de chaque barre.
    ///
    /// C'est LE point unique où l'échelle décibel entre en jeu : les valeurs
    /// stockées restent des RMS linéaires, et `displayHeight` les rend
    /// lisibles. Le plancher à 2 pt garde un trait visible sur le silence, pour
    /// qu'une piste muette se distingue d'une piste pas encore analysée.
    nonisolated static func barHeights(samples: [Float],
                                       availableHeight: CGFloat) -> [CGFloat] {
        let usable = max(0, availableHeight - 6)
        return samples.map { sample in
            max(2, CGFloat(AudioWaveform.displayHeight(rms: sample)) * usable)
        }
    }
}
