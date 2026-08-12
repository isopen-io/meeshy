import SwiftUI

public struct RulerView: View, Equatable {

    // MARK: - SOTA P7: Equatable (excludes closures — visual props only)
    public static func == (lhs: RulerView, rhs: RulerView) -> Bool {
        lhs.totalDuration == rhs.totalDuration
            && lhs.geometry == rhs.geometry
            && lhs.isDark == rhs.isDark
            && lhs.height == rhs.height
    }

    public let totalDuration: Float
    public let geometry: TimelineGeometry
    public let isDark: Bool
    public let height: CGFloat
    public let onTapTime: (Float) -> Void
    /// Called once when a drag on the ruler starts. Hosts wire this to
    /// `TimelineViewModel.beginScrub()` so continuous `onTapTime` callbacks
    /// seek with sub-50ms tolerance instead of freezing on GOP decompression.
    public let onScrubBegan: () -> Void
    /// Called once when the drag ends. Hosts wire this to
    /// `TimelineViewModel.endScrub()` so the release frame is re-seeked
    /// frame-accurately.
    public let onScrubEnded: () -> Void

    public init(
        totalDuration: Float,
        geometry: TimelineGeometry,
        isDark: Bool,
        height: CGFloat = 24,
        onTapTime: @escaping (Float) -> Void,
        onScrubBegan: @escaping () -> Void = {},
        onScrubEnded: @escaping () -> Void = {}
    ) {
        self.totalDuration = totalDuration
        self.geometry = geometry
        self.isDark = isDark
        self.height = height
        self.onTapTime = onTapTime
        self.onScrubBegan = onScrubBegan
        self.onScrubEnded = onScrubEnded
    }

    /// DragGesture has no `.onBegan` — synthesized from the first `.onChanged`
    /// of the current drag, mirroring `PlayheadView.dragInFlight`.
    @State private var dragInFlight: Bool = false

    /// Graduations candidates, de la plus fine à la plus grossière. Valeurs
    /// « rondes » au sens de l'horloge : 1-2-5 sous la seconde, puis les
    /// paliers que l'œil lit sans calculer (15 s, 30 s, la minute, ses
    /// multiples).
    public nonisolated static let tickLadder: [Double] = [
        0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900
    ]

    /// Écart minimal entre deux graduations pour que leurs libellés ne se
    /// chevauchent pas. Dérivé de la largeur d'un libellé (`labelHalfWidth`
    /// × 2 ≈ « 500ms »), plus une respiration.
    ///
    /// Constante DÉRIVÉE, pas choisie : c'est ce qui empêche la graduation de
    /// redevenir un réglage à la main qui dérive quand les bornes de zoom
    /// bougent.
    public nonisolated static var minLabelSpacing: CGFloat { labelHalfWidth * 2 + 8 }

    /// Plus fine graduation dont les libellés tiennent encore côte à côte.
    ///
    /// Remplace une table figée (`pps < 20 → 5 s`) écrite pour une plage de
    /// zoom qui allait de 25 % à 400 %. Élargie à 5 %–800 % le 2026-07-20, la
    /// table n'a pas suivi : à 5 %, une graduation toutes les 5 s tombait tous
    /// les 12,5 pt pour des libellés larges de ~24 pt, et la règle devenait
    /// une bouillie illisible — précisément au zoom censé « embrasser une
    /// timeline de plusieurs minutes d'un coup d'œil ».
    public static func tickInterval(for zoom: CGFloat) -> Double {
        let pps = Double(TimelineGeometry.basePixelsPerSecond * zoom)
        guard pps > 0 else { return tickLadder.last ?? 1 }
        let required = Double(minLabelSpacing) / pps
        return tickLadder.first { $0 >= required } ?? (tickLadder.last ?? 1)
    }

    public static func formatTick(_ seconds: Double) -> String {
        // The 0 mark always reads as "0s" to stay coherent with the
        // surrounding "2s / 4s / 6s" labels (mixing "0ms" with whole-second
        // siblings looked broken at low zooms).
        if seconds == 0 { return "0s" }
        if seconds < 1.0 {
            return "\(Int((seconds * 1000).rounded()))ms"
        } else if seconds < 60.0 {
            let rounded = (seconds * 10).rounded() / 10
            if rounded == rounded.rounded() {
                return "\(Int(rounded))s"
            }
            return String(format: "%.1fs", rounded)
        } else {
            let m = Int(seconds) / 60
            let s = Int(seconds) % 60
            return String(format: "%d:%02d", m, s)
        }
    }

    /// Approximate half-width of the widest tick label ("500ms" / "10s").
    /// The leftmost label is shifted right by this margin so it doesn't clip
    /// at the ruler's leading edge, while the tick line itself stays anchored
    /// to the correct time position so it remains aligned with clips below.
    public nonisolated static let labelHalfWidth: CGFloat = 14

    public var body: some View {
        let interval = Self.tickInterval(for: geometry.zoomScale)
        let count = max(1, Int((Double(totalDuration) / interval).rounded(.up)) + 1)

        ZStack(alignment: .leading) {
            Rectangle()
                .fill(isDark ? Color.black.opacity(0.4) : Color.white.opacity(0.7))
            ForEach(0..<count, id: \.self) { i in
                let t = Double(i) * interval
                let x = CGFloat(t) * geometry.pixelsPerSecond
                tick(lineX: x, labelX: max(x, Self.labelHalfWidth), label: Self.formatTick(t))
            }
        }
        .frame(height: height)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { v in
                    if !dragInFlight {
                        dragInFlight = true
                        onScrubBegan()
                    }
                    onTapTime(geometry.time(forX: max(0, v.location.x)))
                }
                .onEnded { _ in
                    if dragInFlight {
                        dragInFlight = false
                        onScrubEnded()
                    }
                }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "story.timeline.ruler.a11y", defaultValue: "Règle", bundle: .module))
    }

    /// `lineX` is the actual time anchor (kept aligned with clips below).
    /// `labelX` is shifted right when the time anchor would clip the caption.
    private func tick(lineX: CGFloat, labelX: CGFloat, label: String) -> some View {
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(isDark ? MeeshyColors.indigo300.opacity(0.7) : MeeshyColors.indigo700.opacity(0.6))
                .frame(width: 1, height: 6)
                .position(x: lineX, y: 3)
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo800)
                .lineLimit(1)
                .fixedSize()
                .position(x: labelX, y: height - 6)
        }
    }
}
