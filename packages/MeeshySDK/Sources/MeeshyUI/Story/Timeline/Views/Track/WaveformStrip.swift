import SwiftUI
import MeeshySDK

/// Bande de forme d'onde, partagée par les pistes audio et vidéo.
///
/// Extraite de `AudioClipBar`, où elle était dessinée en ligne. La dupliquer
/// dans `VideoClipBar` aurait laissé les deux tracés diverger au premier
/// ajustement — un seul rendu pour les deux barres.
public struct WaveformStrip: View {

    let samples: [Float]
    let tint: Color
    /// Ce que `samples` EST : la mesure (décibels) ou le champ publié (linéaire).
    var reading: WaveformReading = .measured

    /// Public pour la frise de la scène (#14214) : la même onde que l'atelier.
    public init(samples: [Float], tint: Color, reading: WaveformReading = .measured) {
        self.samples = samples
        self.tint = tint
        self.reading = reading
    }

    /// La tranche de piste que la règle monte (#13597), posée par `TimelineScrubArea` dans l'espace
    /// `TimelineVisibleWindow.spaceName` ; `nil` hors de l'atelier : la bande entière, déjà bornée par l'écran.
    @Environment(\.timelineVisibleWindow) private var visibleWindow

    public var body: some View {
        GeometryReader { geo in
            // Aucun échantillon → on ne dessine rien. La version précédente
            // partait de `max(samples.count, 1)` puis déréférençait
            // `samples[0]` : tout clip dont la forme d'onde n'était pas encore
            // extraite plantait sur « Index out of range ».
            let minX = visibleWindow == nil ? 0 : geo.frame(in: .named(TimelineVisibleWindow.spaceName)).minX
            if !samples.isEmpty, let slice = Self.visibleSlice(width: geo.size.width, minX: minX, window: visibleWindow) {
                bars(width: geo.size.width, height: geo.size.height, slice: slice)
            }
        }
        .padding(.horizontal, 3)
        .accessibilityHidden(true)
    }

    /// UN calque de la largeur de la tranche, jamais de la piste : `.drawingGroup()` rastérisait toute la bande
    /// (360 000 pt pour 2 h au zoom 1), bien au-delà de la plus grande texture Metal.
    private func bars(width: CGFloat, height: CGFloat, slice: ClosedRange<CGFloat>) -> some View {
        let stepX = width / CGFloat(samples.count)
        let heights = Self.barHeights(samples: samples, availableHeight: height, reading: reading)
        let indices = Self.sampleIndices(count: samples.count, width: width, slice: slice)
        let barWidth = max(1, stepX - 1)
        return Canvas { context, size in
            for i in indices {
                let rect = CGRect(x: CGFloat(i) * stepX - slice.lowerBound,
                                  y: (size.height - heights[i]) / 2,
                                  width: barWidth,
                                  height: heights[i])
                context.fill(Path(roundedRect: rect, cornerRadius: min(barWidth, heights[i]) / 2), with: .color(tint))
            }
        }
        .frame(width: slice.upperBound - slice.lowerBound, height: height)
        .offset(x: slice.lowerBound)
        .frame(width: width, height: height, alignment: .leading)
    }

    /// La part de la bande à dessiner, dans SES coordonnées : l'intersection de la fenêtre de la règle (repérée dans
    /// l'espace de la piste) et de la bande posée à [minX]. `nil` : rien de visible.
    nonisolated static func visibleSlice(width: CGFloat, minX: CGFloat,
                                         window: ClosedRange<CGFloat>?) -> ClosedRange<CGFloat>? {
        guard width > 0 else { return nil }
        guard let window else { return 0...width }
        let lower = max(0, window.lowerBound - minX)
        let upper = min(width, window.upperBound - minX)
        return lower < upper ? lower...upper : nil
    }

    /// Les barres que la tranche recouvre — bornées par la tranche, jamais par la durée.
    nonisolated static func sampleIndices(count: Int, width: CGFloat, slice: ClosedRange<CGFloat>) -> Range<Int> {
        guard count > 0, width > 0 else { return 0..<0 }
        let step = width / CGFloat(count)
        let first = max(0, Int((slice.lowerBound / step).rounded(.down)))
        let last = min(count - 1, Int((slice.upperBound / step).rounded(.down)))
        return first <= last ? first..<(last + 1) : 0..<0
    }

    /// Hauteur en points de chaque barre.
    ///
    /// C'est LE point unique où l'échelle entre en jeu : la mesure (RMS
    /// linéaire) se lit en décibels, le champ publié (normalisé au pic) en
    /// linéaire — jamais l'une sur l'autre (#9886). Le plancher à 2 pt garde un trait visible sur le silence, pour
    /// qu'une piste muette se distingue d'une piste pas encore analysée.
    nonisolated static func barHeights(samples: [Float],
                                       availableHeight: CGFloat,
                                       reading: WaveformReading = .measured) -> [CGFloat] {
        let usable = max(0, availableHeight - 6)
        return samples.map { sample in
            max(2, CGFloat(reading.height(sample)) * usable)
        }
    }
}

/// La fenêtre de la piste que la règle monte, transmise aux bandes dessinées des clips (#13597) : même quantification
/// que `RulerView.visibleWindow`, donc elle ne change qu'au franchissement d'une tranche, jamais à chaque image.
public enum TimelineVisibleWindow {
    public nonisolated static let spaceName = "timeline-visible-window-space"
}

private struct TimelineVisibleWindowKey: EnvironmentKey {
    static let defaultValue: ClosedRange<CGFloat>? = nil
}

public extension EnvironmentValues {
    var timelineVisibleWindow: ClosedRange<CGFloat>? {
        get { self[TimelineVisibleWindowKey.self] }
        set { self[TimelineVisibleWindowKey.self] = newValue }
    }
}

extension View {
    /// Pose l'espace des pistes et la tranche que la règle monte (#13597) : les bandes des clips n'en dessinent pas plus.
    func timelineVisibleWindow(scrollX: CGFloat, viewportWidth: CGFloat) -> some View {
        coordinateSpace(name: TimelineVisibleWindow.spaceName)
            .environment(\.timelineVisibleWindow, RulerView.visibleWindow(scrollX: scrollX, viewportWidth: viewportWidth))
    }
}
