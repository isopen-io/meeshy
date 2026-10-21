import SwiftUI
import MeeshySDK

/// Interactive waveform: scrub anywhere on the bars, and — when a selection is
/// supplied — drag the two edge handles. Pure presentation: it reports back via
/// callbacks and never touches the controller directly.
struct AudioEditorWaveform: View {

    struct Selection: Equatable {
        var start: Double   // fraction 0…1
        var end: Double     // fraction 0…1
        var isRemoval: Bool // true → the region is cut out (split)
    }

    let samples: [Float]
    let progress: Double
    let accent: Color
    let isDark: Bool
    let selection: Selection?
    let onScrub: (Double) -> Void
    let onScrubEnded: () -> Void
    let onSelectionStart: (Double) -> Void
    let onSelectionEnd: (Double) -> Void

    private let barGap: CGFloat = 2
    private let spaceName = "audioEditorWaveform"

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                bars(in: geo.size)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                onScrub(fraction(of: value.location.x, width: geo.size.width))
                            }
                            .onEnded { _ in onScrubEnded() }
                    )
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Self.playheadLabel)
                    .accessibilityValue(MeeshyAccessibleValue.percent(progress))
                    .accessibilityAdjustableAction { direction in
                        guard let target = scrubAdjustment(direction) else { return }
                        onScrub(target)
                        onScrubEnded()
                    }

                if let selection {
                    handle(at: selection.start, edge: .start, width: geo.size.width, height: geo.size.height,
                           isRemoval: selection.isRemoval,
                           onAdjust: { direction in
                               guard let target = selectionStartAdjustment(direction) else { return }
                               onSelectionStart(target)
                           }) { x in
                        onSelectionStart(fraction(of: x, width: geo.size.width))
                    }
                    handle(at: selection.end, edge: .end, width: geo.size.width, height: geo.size.height,
                           isRemoval: selection.isRemoval,
                           onAdjust: { direction in
                               guard let target = selectionEndAdjustment(direction) else { return }
                               onSelectionEnd(target)
                           }) { x in
                        onSelectionEnd(fraction(of: x, width: geo.size.width))
                    }
                }

                playhead(in: geo.size)
            }
            .coordinateSpace(name: spaceName)
        }
    }

    // MARK: Bars

    private func bars(in size: CGSize) -> some View {
        let values = samples.isEmpty ? Array(repeating: Float(0.18), count: 80) : samples
        let count = values.count
        let totalGap = barGap * CGFloat(max(0, count - 1))
        let barWidth = max(1, (size.width - totalGap) / CGFloat(count))

        return HStack(alignment: .center, spacing: barGap) {
            ForEach(Array(values.enumerated()), id: \.offset) { item in
                let fraction = count > 1 ? Double(item.offset) / Double(count - 1) : 0
                let height = max(3, CGFloat(item.element) * size.height * 0.92)
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(barColor(fraction: fraction))
                    .frame(width: barWidth, height: height)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .center)
    }

    private func barColor(fraction: Double) -> Color {
        let neutral = isDark ? Color.white.opacity(0.14) : Color.black.opacity(0.12)
        guard let selection else {
            return fraction <= progress ? accent : neutral
        }
        let inside = fraction >= selection.start && fraction <= selection.end
        if selection.isRemoval {
            return inside ? MeeshyColors.error.opacity(0.45) : (fraction <= progress ? accent : neutral)
        }
        if !inside {
            return isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.06)
        }
        return fraction <= progress ? accent : accent.opacity(0.32)
    }

    // MARK: Handle

    private func handle(at fraction: Double, edge: HandleEdge, width: CGFloat, height: CGFloat,
                        isRemoval: Bool,
                        onAdjust: @escaping (AccessibilityAdjustmentDirection) -> Void,
                        onMove: @escaping (CGFloat) -> Void) -> some View {
        let clamped = max(0, min(1, fraction))
        let x = clamped * width
        let tint = isRemoval ? MeeshyColors.error : accent
        return ZStack {
            Color.clear.frame(width: MeeshyControlSize.tapTarget, height: max(MeeshyControlSize.tapTarget, height))
            RoundedRectangle(cornerRadius: 2)
                .fill(tint)
                .frame(width: 3, height: height)
            Circle()
                .fill(tint)
                .frame(width: 14, height: 14)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.handleLabel(edge: edge, isRemoval: isRemoval))
        .accessibilityValue(MeeshyAccessibleValue.percent(clamped))
        .accessibilityAdjustableAction(onAdjust)
        .position(x: x, y: height / 2)
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .named(spaceName))
                .onChanged { value in onMove(value.location.x) }
        )
    }

    // MARK: Playhead

    private func playhead(in size: CGSize) -> some View {
        let x = max(0, min(1, progress)) * size.width
        return Rectangle()
            .fill(Color.white)
            .frame(width: 2, height: size.height)
            .shadow(color: .black.opacity(0.3), radius: 2)
            .offset(x: x - 1)
            .accessibilityHidden(true)
    }

    private func fraction(of x: CGFloat, width: CGFloat) -> Double {
        guard width > 0 else { return 0 }
        return Double(max(0, min(width, x)) / width)
    }
}
