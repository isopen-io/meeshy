import SwiftUI
import MeeshySDK

/// The main timeline: a fixed-viewport, center-playhead scrub strip.
///
/// The playhead is pinned to the viewport centre; dragging the filmstrip
/// scrubs, pinching zooms. Each `VideoSegment` renders as a thumbnail block
/// sized to its edited duration; in Pro mode blocks are selectable and
/// dividers mark the cuts.
///
/// **Tool overlays** (Mai 2026) : la timeline accueille désormais
/// directement les contrôles contextuels selon l'outil actif (`viewModel.panel`)
/// — fini la duplication d'une seconde timeline dans le panneau du bas :
/// - `.trim` → brackets in/out + zones dimmées sur les bords coupés.
/// - `.split` en Pro → ligne de coupe centrale + bouton tap inline.
/// - autres outils → pas d'overlay (timeline standard).
struct VideoEditorTimeline: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private let basePixelsPerSecond: CGFloat = 58
    private let trackHeight: CGFloat = 58
    private let minZoom: CGFloat = 0.5
    private let maxZoom: CGFloat = 5.0
    /// Largeur visuelle d'un bracket d'in/out (poignée draggable).
    private let bracketWidth: CGFloat = 14
    /// Hauteur de la bande waveform audio sous la filmstrip.
    private let waveformHeight: CGFloat = 16

    @State private var scrubAnchor: Double?
    @State private var zoomAnchor: CGFloat?
    @State private var lastSnapBoundary: Double?
    /// Anchor pris au touchDown d'un bracket. Stocké en TEMPS SOURCE
    /// (`settingInPoint` / `settingOutPoint` parlent source), distinct du
    /// scrub qui agit en temps edité.
    @State private var bracketAnchorSource: Double?

    private var accent: Color { Color(hex: viewModel.accentColor) }
    private var pixelsPerSecond: CGFloat { basePixelsPerSecond * viewModel.timelineZoom }
    private var isTrimActive: Bool { viewModel.panel.activeTool == .trim }
    private var isSplitActive: Bool { viewModel.panel.activeTool == .split && viewModel.mode.isPro }

    var body: some View {
        GeometryReader { geo in
            let viewport = geo.size.width
            let centerX = viewport / 2
            let duration = viewModel.editedDuration
            let leadingX = centerX - CGFloat(viewModel.playheadTime) * pixelsPerSecond

            ZStack(alignment: .topLeading) {
                theme.backgroundSecondary

                rulerLayer(leadingX: leadingX, duration: duration)

                segmentStrip(leadingX: leadingX)
                    .frame(height: trackHeight)
                    .offset(y: 22)

                if isTrimActive {
                    trimOverlay(leadingX: leadingX, duration: duration)
                        .offset(y: 22)
                        .transition(.opacity)
                }

                // Waveform audio sous la filmstrip. Suit la même géométrie
                // pixels-per-second + leadingX que les vignettes : un sample
                // au time `t` est rendu au x correspondant. Trim/split
                // affectent visuellement les segments mais pas les samples
                // (calculés sur la source — ce qui est la bonne sémantique
                // pour visualiser le bruit du clip d'origine au moment où
                // on choisit où couper).
                audioWaveformLayer(leadingX: leadingX, duration: duration)
                    .frame(height: waveformHeight)
                    .offset(y: 22 + trackHeight)
                    .allowsHitTesting(false)

                edgeFades(viewport: viewport)

                playhead(centerX: centerX, accentTint: isSplitActive)

                timeReadout(centerX: centerX, viewport: viewport)
            }
            .frame(width: viewport, height: trackHeight + 44 + waveformHeight)
            .contentShape(Rectangle())
            .gesture(scrubGesture(duration: duration))
            .simultaneousGesture(zoomGesture)
            .accessibilityElement()
            .accessibilityLabel("Timeline")
            .accessibilityValue(formatTime(viewModel.playheadTime))
        }
        .frame(height: trackHeight + 44 + waveformHeight)
        .animation(.easeInOut(duration: 0.15), value: isTrimActive)
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

    /// Center-pinned playhead. When `accentTint == true` (split tool actif
    /// en Pro), affiche un trait scissor pour signaler qu'un tap immédiat
    /// coupera la timeline ici.
    ///
    /// **Layout** — le playhead couvre **la filmstrip + la waveform**
    /// (y=22 → y=22+trackHeight+waveformHeight). La pastille circulaire est
    /// ancrée tout en haut de cette zone. Cela évite que le trait flotte
    /// au-dessus du ruler ou déborde sous la time readout après l'ajout
    /// de la waveform.
    private func playhead(centerX: CGFloat, accentTint: Bool) -> some View {
        let extent = trackHeight + waveformHeight
        return ZStack(alignment: .top) {
            Rectangle()
                .fill(accent)
                .frame(width: accentTint ? 2.5 : 2, height: extent)
                .shadow(color: accent.opacity(0.6), radius: 3)
            ZStack {
                Circle()
                    .fill(accent)
                    .frame(width: 12, height: 12)
                    .overlay(Circle().stroke(.white.opacity(0.85), lineWidth: 1.5))
                if accentTint {
                    Image(systemName: "scissors")
                        .font(.system(size: 7, weight: .black))
                        .foregroundStyle(.white)
                }
            }
            .offset(y: -2)
        }
        .frame(width: 16, height: extent)
        .position(x: centerX, y: 22 + extent / 2)
        .allowsHitTesting(false)
    }

    // MARK: - Trim overlay (in/out brackets + dimmed tails)

    /// Renders the trim handles **on the main timeline** while the Trim
    /// tool is active. The brackets are anchored to source `inPoint` /
    /// `outPoint` (which in Simple mode are also the first/last segment
    /// boundaries), and drag delta is converted via `pixelsPerSecond` —
    /// identical scale to the scrub gesture so 1 px = 1 px = 1 frame at the
    /// current zoom.
    ///
    /// In Pro mode with multiple segments, the global trim still acts on
    /// the **outer** in/out only (first segment.start, last segment.end).
    /// Per-segment trim lives in the Split tool (merge / remove segment).
    @ViewBuilder
    private func trimOverlay(leadingX: CGFloat, duration: Double) -> some View {
        // Source-time bounds → edited-time positions on the timeline.
        // The first segment's start and the last segment's end map
        // directly to the timeline's 0 and `duration` since
        // `playbackDuration` is computed from them.
        let leftEditedTime: Double = 0
        let rightEditedTime: Double = duration
        let leftX = leadingX + CGFloat(leftEditedTime) * pixelsPerSecond
        let rightX = leadingX + CGFloat(rightEditedTime) * pixelsPerSecond

        ZStack(alignment: .topLeading) {
            // Selected window outline.
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(accent, lineWidth: 2)
                .frame(width: max(0, rightX - leftX), height: trackHeight)
                .offset(x: leftX)
                .allowsHitTesting(false)

            // Left bracket — drag changes the source in-point.
            trimBracket(systemImage: "chevron.compact.left")
                .position(x: leftX, y: trackHeight / 2)
                .gesture(trimDrag(isLeft: true))

            // Right bracket — drag changes the source out-point.
            trimBracket(systemImage: "chevron.compact.right")
                .position(x: rightX, y: trackHeight / 2)
                .gesture(trimDrag(isLeft: false))
        }
    }

    private func trimBracket(systemImage: String) -> some View {
        RoundedRectangle(cornerRadius: 5, style: .continuous)
            .fill(accent)
            .frame(width: bracketWidth, height: trackHeight + 8)
            .overlay(
                Image(systemName: systemImage)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
            )
            .shadow(color: .black.opacity(0.35), radius: 3)
    }

    /// Drag gesture for an in/out bracket. The pixel delta is converted to
    /// a **source-time** delta via `pixelsPerSecond` (the scrub scale) ×
    /// the segment's speed factor, so the bracket sticks to the user's
    /// finger no matter the zoom or playback speed.
    private func trimDrag(isLeft: Bool) -> some Gesture {
        let doc = viewModel.document
        let segmentSpeed = isLeft
            ? (doc.segments.first?.speed ?? 1)
            : (doc.segments.last?.speed ?? 1)

        return DragGesture(minimumDistance: 1)
            .onChanged { value in
                if bracketAnchorSource == nil {
                    bracketAnchorSource = isLeft ? doc.inPoint : doc.outPoint
                    viewModel.pause()
                    HapticFeedback.light()
                }
                let anchor = bracketAnchorSource ?? 0
                // Drag → edited-time delta → source-time delta (× speed).
                let editedDelta = Double(value.translation.width / pixelsPerSecond)
                let sourceDelta = editedDelta * segmentSpeed
                let target = anchor + sourceDelta
                let updated = isLeft
                    ? doc.settingInPoint(target)
                    : doc.settingOutPoint(target)
                viewModel.preview(updated)
            }
            .onEnded { _ in
                bracketAnchorSource = nil
                viewModel.commitPreview()
                HapticFeedback.medium()
            }
    }

    // MARK: - Audio waveform layer

    /// Renders the waveform samples extracted by `VideoEditorViewModel`
    /// (cached via `WaveformCache`) as bars across the timeline span. The
    /// bars share the timeline's `pixelsPerSecond × leadingX` geometry so
    /// they stay aligned with the filmstrip thumbnails on the X axis no
    /// matter the zoom or scrub position.
    ///
    /// **Why SwiftUI `Canvas`** : 240 bars on screen is too many for
    /// `ForEach { Rectangle }` (each Rectangle is a separate view in the
    /// SwiftUI render graph). A single Canvas drawing pass is a flat
    /// CoreGraphics fill — 0 view churn, no allocations per frame.
    ///
    /// **Empty samples** : when the source has no audio track (silent
    /// video) `audioWaveform` stays `[]` and we render an empty View —
    /// no waveform band visible.
    @ViewBuilder
    private func audioWaveformLayer(leadingX: CGFloat, duration: Double) -> some View {
        let samples = viewModel.audioWaveform
        if samples.isEmpty {
            EmptyView()
        } else {
            Canvas { context, size in
                drawWaveform(
                    samples: samples,
                    context: context,
                    canvasSize: size,
                    leadingX: leadingX,
                    duration: duration
                )
            }
            .accessibilityHidden(true)
        }
    }

    /// Renders symmetric (top + bottom) bars into the canvas. Bar width =
    /// `pixelsPerSecond × (duration / sampleCount)`. We clip horizontally
    /// at the viewport edges via the canvas's natural bounds — bars beyond
    /// the visible viewport are still issued but Core Animation discards
    /// them outside the layer's frame.
    private func drawWaveform(samples: [Float],
                              context: GraphicsContext,
                              canvasSize: CGSize,
                              leadingX: CGFloat,
                              duration: Double) {
        guard duration > 0 else { return }
        let sampleCount = samples.count
        let totalWidth = CGFloat(duration) * pixelsPerSecond
        let barSpan = totalWidth / CGFloat(sampleCount)
        // Largeur visuelle d'une barre = 65 % du span pour laisser un peu
        // d'espace négatif entre les barres (sinon la bande devient un
        // bloc plein illisible).
        let barWidth = max(1, barSpan * 0.65)
        let centerY = canvasSize.height / 2
        let maxBarHeight = canvasSize.height * 0.9

        let accentUIColor = accent
        for (i, sample) in samples.enumerated() {
            let normalised = CGFloat(max(0, min(1, sample)))
            let height = max(1, normalised * maxBarHeight)
            let x = leadingX + CGFloat(i) * barSpan + (barSpan - barWidth) / 2
            // Skip bars hors viewport — Canvas clip déjà, mais éviter
            // d'allouer une `Rectangle()` payload chaque tick aide quand
            // le clip est très grand (zoom max + asset long).
            if x + barWidth < 0 || x > canvasSize.width { continue }
            let rect = CGRect(
                x: x,
                y: centerY - height / 2,
                width: barWidth,
                height: height
            )
            context.fill(
                Path(roundedRect: rect, cornerRadius: barWidth / 2),
                with: .color(accentUIColor.opacity(0.55))
            )
        }
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
