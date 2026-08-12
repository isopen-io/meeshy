import SwiftUI

/// Visual echoes of a looping background clip, drawn after the real
/// (interactive) clip bar to fill the lane up to `slideDuration`. Purely
/// decorative — no gestures, no selection, no trim handles — so the first
/// iteration (the actual `VideoClipBar`/`AudioClipBar`) remains the only
/// editable segment. Mirrors what `AVPlayerLooper` already does at playback
/// time (`StoryBackgroundLayer`) — without this, a 1s looping background on a
/// 6s slide rendered as a single 1s bar followed by 5s of visually empty
/// track, reading as "the background disappears" (user report 2026-07-17).
public struct LoopRepeatOverlay: View {
    public let nativeDuration: Float
    public let clipStartTime: Float
    public let slideDuration: Float
    public let tint: Color
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat

    public init(
        nativeDuration: Float,
        clipStartTime: Float,
        slideDuration: Float,
        tint: Color,
        geometry: TimelineGeometry,
        laneHeight: CGFloat
    ) {
        self.nativeDuration = nativeDuration
        self.clipStartTime = clipStartTime
        self.slideDuration = slideDuration
        self.tint = tint
        self.geometry = geometry
        self.laneHeight = laneHeight
    }

    /// Start times of each REPEATED tile, excluding the first/real segment
    /// (which is already covered by the interactive clip bar). Pure & static
    /// so the tiling math is unit-testable without hosting the View.
    public nonisolated static func repeatStartTimes(
        nativeDuration: Float,
        clipStartTime: Float,
        slideDuration: Float
    ) -> [Float] {
        guard nativeDuration > 0.05 else { return [] }
        var result: [Float] = []
        var t = clipStartTime + nativeDuration
        while t < slideDuration - 0.05 {
            result.append(t)
            t += nativeDuration
        }
        return result
    }

    public var body: some View {
        let starts = Self.repeatStartTimes(
            nativeDuration: nativeDuration,
            clipStartTime: clipStartTime,
            slideDuration: slideDuration
        )
        ForEach(Array(starts.enumerated()), id: \.offset) { _, tileStart in
            let tileDuration = min(nativeDuration, slideDuration - tileStart)
            let tileWidth = geometry.width(for: tileDuration)
            ZStack {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(tint.opacity(0.28))
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .foregroundStyle(tint.opacity(0.55))
                if tileWidth >= 20 {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(tint.opacity(0.65))
                }
            }
            .frame(width: max(0, tileWidth), height: laneHeight - 4)
            .offset(x: geometry.x(for: tileStart))
            .allowsHitTesting(false)
        }
        .accessibilityHidden(true)
    }
}
