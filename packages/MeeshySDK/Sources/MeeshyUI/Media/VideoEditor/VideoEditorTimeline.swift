import SwiftUI
import MeeshySDK

/// The main timeline: a fixed-viewport, center-playhead scrub strip.
///
/// The playhead is pinned to the viewport centre; dragging the filmstrip
/// scrubs, pinching zooms. Each `VideoSegment` renders as a thumbnail block
/// sized to its edited duration; in Pro mode blocks are selectable and
/// dividers mark the cuts.
struct VideoEditorTimeline: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private let basePixelsPerSecond: CGFloat = 58
    private let trackHeight: CGFloat = 58
    private let minZoom: CGFloat = 0.5
    private let maxZoom: CGFloat = 5.0

    @State private var scrubAnchor: Double?
    @State private var zoomAnchor: CGFloat?
    @State private var lastSnapBoundary: Double?

    private var accent: Color { Color(hex: viewModel.accentColor) }
    private var pixelsPerSecond: CGFloat { basePixelsPerSecond * viewModel.timelineZoom }

    var body: some View {
        GeometryReader { geo in
            let viewport = geo.size.width
            let centerX = viewport / 2
            let duration = viewModel.editedDuration
            let contentWidth = CGFloat(duration) * pixelsPerSecond
            let leadingX = centerX - CGFloat(viewModel.playheadTime) * pixelsPerSecond

            ZStack(alignment: .topLeading) {
                theme.backgroundSecondary

                rulerLayer(leadingX: leadingX, duration: duration)

                segmentStrip(leadingX: leadingX)
                    .frame(height: trackHeight)
                    .offset(y: 22)

                edgeFades(viewport: viewport)

                playhead(centerX: centerX)

                timeReadout(centerX: centerX, viewport: viewport)
            }
            .frame(width: viewport, height: trackHeight + 44)
            .contentShape(Rectangle())
            .gesture(scrubGesture(duration: duration))
            .simultaneousGesture(zoomGesture)
            .accessibilityElement()
            .accessibilityLabel("Timeline")
            .accessibilityValue(formatTime(viewModel.playheadTime))
        }
        .frame(height: trackHeight + 44)
    }

    // MARK: - Segment strip

    private func segmentStrip(leadingX: CGFloat) -> some View {
        let starts = viewModel.document.segmentEditedStarts
        return HStack(spacing: 0) {
            ForEach(Array(viewModel.document.segments.enumerated()), id: \.element.id) { index, segment in
                segmentBlock(segment, index: index, isFirst: index == 0)
            }
        }
        .offset(x: leadingX)
        .animation(.easeInOut(duration: 0.2), value: starts.count)
    }

    private func segmentBlock(_ segment: VideoSegment, index: Int, isFirst: Bool) -> some View {
        let width = max(8, CGFloat(segment.playbackDuration) * pixelsPerSecond)
        let isSelected = viewModel.mode.isPro && viewModel.selectedSegmentID == segment.id
        let count = min(48, max(1, Int(width / 46)))

        return ZStack(alignment: .topLeading) {
            HStack(spacing: 0) {
                ForEach(0..<count, id: \.self) { slot in
                    thumbnail(for: segment, slot: slot, count: count)
                        .frame(width: width / CGFloat(count), height: trackHeight)
                        .clipped()
                }
            }
            .frame(width: width, height: trackHeight)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(
                        isSelected ? accent : Color.white.opacity(0.08),
                        lineWidth: isSelected ? 2 : 0.5
                    )
            )

            if segment.speed != 1 {
                speedBadge(segment.speed)
            }

            if !isFirst {
                Rectangle()
                    .fill(theme.backgroundSecondary)
                    .frame(width: viewModel.mode.isPro ? 3 : 1)
            }
        }
        .frame(width: width, height: trackHeight)
        .contentShape(Rectangle())
        .onTapGesture {
            guard viewModel.mode.isPro else { return }
            viewModel.selectedSegmentID = isSelected ? nil : segment.id
            HapticFeedback.light()
        }
    }

    private func thumbnail(for segment: VideoSegment, slot: Int, count: Int) -> some View {
        let strip = viewModel.filmstrip
        let placeholder = Color.black.opacity(0.6)
        return Group {
            if strip.isEmpty {
                placeholder
            } else {
                let duration = max(0.01, viewModel.document.sourceDuration)
                let time = segment.start + (Double(slot) + 0.5) / Double(count) * segment.sourceDuration
                let idx = min(strip.count - 1, max(0, Int(time / duration * Double(strip.count))))
                Image(uiImage: strip[idx])
                    .resizable()
                    .scaledToFill()
            }
        }
    }

    private func speedBadge(_ speed: Double) -> some View {
        Text(speedLabel(speed))
            .font(.system(size: 9, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Capsule().fill(accent))
            .padding(4)
    }

    // MARK: - Ruler

    private func rulerLayer(leadingX: CGFloat, duration: Double) -> some View {
        let step = tickStep(for: duration)
        let tickCount = max(1, Int(duration / step) + 1)
        return ZStack(alignment: .topLeading) {
            ForEach(0..<tickCount, id: \.self) { i in
                let time = Double(i) * step
                let x = leadingX + CGFloat(time) * pixelsPerSecond
                VStack(spacing: 2) {
                    Rectangle()
                        .fill(theme.textMuted.opacity(0.6))
                        .frame(width: 1, height: 6)
                    Text(formatTime(time))
                        .font(.system(size: 8, weight: .medium, design: .monospaced))
                        .foregroundStyle(theme.textMuted)
                }
                .offset(x: x - 12, y: 4)
            }
        }
        .frame(height: 22, alignment: .topLeading)
        .clipped()
    }

    // MARK: - Playhead

    private func playhead(centerX: CGFloat) -> some View {
        ZStack {
            Rectangle()
                .fill(accent)
                .frame(width: 2)
                .shadow(color: accent.opacity(0.6), radius: 3)
            VStack {
                Circle()
                    .fill(accent)
                    .frame(width: 11, height: 11)
                    .overlay(Circle().stroke(.white.opacity(0.85), lineWidth: 1.5))
                Spacer()
            }
        }
        .frame(width: 16)
        .position(x: centerX, y: (trackHeight + 44) / 2)
        .allowsHitTesting(false)
    }

    private func edgeFades(viewport: CGFloat) -> some View {
        HStack {
            LinearGradient(
                colors: [theme.backgroundSecondary, .clear],
                startPoint: .leading, endPoint: .trailing
            )
            .frame(width: 28)
            Spacer()
            LinearGradient(
                colors: [.clear, theme.backgroundSecondary],
                startPoint: .leading, endPoint: .trailing
            )
            .frame(width: 28)
        }
        .allowsHitTesting(false)
    }

    private func timeReadout(centerX: CGFloat, viewport: CGFloat) -> some View {
        HStack {
            Text(formatTime(viewModel.playheadTime))
                .foregroundStyle(theme.textPrimary)
            Text("/")
                .foregroundStyle(theme.textMuted)
            Text(formatTime(viewModel.editedDuration))
                .foregroundStyle(theme.textMuted)
        }
        .font(.system(size: 10, weight: .semibold, design: .monospaced))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Capsule().fill(theme.backgroundPrimary.opacity(0.8)))
        .position(x: centerX, y: trackHeight + 36)
        .allowsHitTesting(false)
    }

    // MARK: - Gestures

    private func scrubGesture(duration: Double) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                if scrubAnchor == nil {
                    scrubAnchor = viewModel.playheadTime
                    viewModel.beginScrub()
                }
                let anchor = scrubAnchor ?? viewModel.playheadTime
                let deltaTime = Double(-value.translation.width / pixelsPerSecond)
                var target = anchor + deltaTime
                target = applySnapping(to: target)
                viewModel.scrub(toFraction: target / max(0.05, duration))
            }
            .onEnded { _ in
                scrubAnchor = nil
                lastSnapBoundary = nil
                viewModel.endScrub()
            }
    }

    /// Magnetic snapping to segment cut points.
    private func applySnapping(to time: Double) -> Double {
        let boundaries = [0, viewModel.editedDuration] + viewModel.document.internalBoundaries
        let threshold = Double(10 / pixelsPerSecond)
        for boundary in boundaries where abs(boundary - time) < threshold {
            if lastSnapBoundary != boundary {
                lastSnapBoundary = boundary
                HapticFeedback.light()
            }
            return boundary
        }
        lastSnapBoundary = nil
        return time
    }

    private var zoomGesture: some Gesture {
        // MagnificationGesture (iOS 13+) au lieu de MagnifyGesture (iOS 17+).
        // `value` est directement le CGFloat (pas via .magnification).
        MagnificationGesture()
            .onChanged { value in
                let anchor = zoomAnchor ?? viewModel.timelineZoom
                if zoomAnchor == nil { zoomAnchor = anchor }
                let next = anchor * value
                viewModel.timelineZoom = min(maxZoom, max(minZoom, next))
            }
            .onEnded { _ in
                zoomAnchor = nil
                HapticFeedback.light()
            }
    }

    // MARK: - Helpers

    private func tickStep(for duration: Double) -> Double {
        let target = Double(80 / pixelsPerSecond)
        let candidates: [Double] = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
        return candidates.first { $0 >= target } ?? 600
    }

    private func speedLabel(_ speed: Double) -> String {
        if speed == speed.rounded() {
            return "\(Int(speed))×"
        }
        return String(format: "%.2g×", speed)
    }

    private func formatTime(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
