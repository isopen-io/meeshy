//
//  PrecisionWaveformView.swift
//  Meeshy
//
//  Modern waveform view with precision timeline integration.
//
//  Features:
//  - Sample-accurate playhead positioning
//  - Snap-to-grid editing for segments
//  - Smooth drag interactions with haptic feedback
//  - Visual grid overlay when editing
//  - Magnetic segment boundary snapping
//  - Real-time synchronization with PrecisionTimelineEngine
//
//  iOS 16+
//

import SwiftUI
import AVFoundation

// MARK: - Precision Waveform View

struct PrecisionWaveformView: View {
    // MARK: - Dependencies

    @ObservedObject var engine: PrecisionTimelineEngine
    let waveformSamples: [CGFloat]
    let onSeek: (Double) -> Void

    // MARK: - Configuration

    var showGrid: Bool = true
    var showSegmentHandles: Bool = true
    var enableHaptics: Bool = true

    // MARK: - State

    @State private var isDraggingPlayhead = false
    @State private var isDraggingSegment: UUID?
    @State private var dragType: SegmentDragType?
    @State private var showGridOverlay = false
    @State private var lastHapticPosition: Double = -1

    // MARK: - Computed

    private var barWidth: CGFloat { 3 }
    private var barSpacing: CGFloat { 2 }
    private var totalBarSpace: CGFloat { barWidth + barSpacing }

    // MARK: - Body

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height

            ZStack(alignment: .leading) {
                // Layer 1: Base waveform
                waveformCanvas(width: width, height: height)

                // Layer 2: Trim overlay (dimmed regions)
                trimOverlay(width: width, height: height)

                // Layer 3: Effect segment zones
                segmentZones(width: width, height: height)

                // Layer 4: Grid overlay (shown during drag)
                if showGridOverlay && engine.gridConfig.isEnabled {
                    gridOverlay(width: width, height: height)
                }

                // Layer 5: Segment cursors with handles
                if showSegmentHandles {
                    segmentCursors(width: width, height: height)
                }

                // Layer 6: Playhead
                playhead(width: width, height: height)

                // Layer 7: Interaction layer
                interactionLayer(width: width, height: height)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.white.opacity(0.08))
            )
        }
    }

    // MARK: - Waveform Canvas

    private func waveformCanvas(width: CGFloat, height: CGFloat) -> some View {
        Canvas { context, size in
            let barCount = Int(size.width / totalBarSpace)
            let samples = resampleWaveform(to: barCount)

            for (index, sample) in samples.enumerated() {
                let x = CGFloat(index) * totalBarSpace + barWidth / 2
                let barHeight = max(4, sample * (size.height - 16))
                let y = (size.height - barHeight) / 2

                let position = Double(index) / Double(max(1, barCount - 1))
                let color = colorForPosition(position)

                let rect = CGRect(x: x, y: y, width: barWidth, height: barHeight)
                let path = RoundedRectangle(cornerRadius: barWidth / 2).path(in: rect)
                context.fill(path, with: .color(color))
            }
        }
    }

    private func colorForPosition(_ position: Double) -> Color {
        // Outside trim range = very dim
        guard position >= engine.trimStartNormalized && position <= engine.trimEndNormalized else {
            return Color.white.opacity(0.15)
        }

        // Get time at this position
        let time = PrecisionTime.fromNormalized(position, in: engine.totalDuration)

        // Check if in an effect segment
        if let segment = engine.segmentAt(time: time) {
            let effectColor = segment.effectDefinition?.color ?? .white

            // Played portion = brighter
            if position <= engine.playheadNormalized {
                return effectColor.opacity(0.95)
            }
            return effectColor.opacity(0.55)
        }

        // Normal audio: played = accent, unplayed = neutral
        if position <= engine.playheadNormalized {
            return Color.yellow.opacity(0.9)
        }
        return Color.white.opacity(0.6)
    }

    private func resampleWaveform(to count: Int) -> [CGFloat] {
        guard !waveformSamples.isEmpty, count > 0 else {
            return Array(repeating: 0.3, count: count)
        }

        var result = [CGFloat](repeating: 0, count: count)
        let ratio = Float(waveformSamples.count) / Float(count)

        for i in 0..<count {
            let startIdx = Int(Float(i) * ratio)
            let endIdx = min(Int(Float(i + 1) * ratio), waveformSamples.count)

            if startIdx < endIdx {
                var sum: CGFloat = 0
                for j in startIdx..<endIdx {
                    sum += waveformSamples[j]
                }
                result[i] = sum / CGFloat(endIdx - startIdx)
            }
        }

        return result
    }

    // MARK: - Trim Overlay

    private func trimOverlay(width: CGFloat, height: CGFloat) -> some View {
        ZStack(alignment: .leading) {
            // Left trim region
            if engine.trimStartNormalized > 0 {
                Rectangle()
                    .fill(Color.black.opacity(0.5))
                    .frame(width: engine.trimStartNormalized * width)
            }

            // Right trim region
            if engine.trimEndNormalized < 1 {
                Rectangle()
                    .fill(Color.black.opacity(0.5))
                    .frame(width: (1 - engine.trimEndNormalized) * width)
                    .offset(x: engine.trimEndNormalized * width)
            }
        }
    }

    // MARK: - Segment Zones

    private func segmentZones(width: CGFloat, height: CGFloat) -> some View {
        ForEach(engine.segments) { segment in
            let startX = segment.startNormalized(in: engine.totalDuration) * width
            let endX = segment.endNormalized(in: engine.totalDuration) * width
            let zoneWidth = max(4, endX - startX)
            let effectColor = segment.effectDefinition?.color ?? .gray
            let isSelected = engine.selectedSegmentId == segment.id

            // Zone highlight
            RoundedRectangle(cornerRadius: 4)
                .fill(effectColor.opacity(isSelected ? 0.25 : 0.12))
                .frame(width: zoneWidth, height: height - 8)
                .offset(x: startX, y: 4)
        }
    }

    // MARK: - Grid Overlay

    private func gridOverlay(width: CGFloat, height: CGFloat) -> some View {
        let gridMs = engine.gridConfig.gridResolutionMs
        let totalMs = engine.totalDuration.milliseconds
        let lineCount = totalMs / gridMs

        return ZStack(alignment: .leading) {
            ForEach(0..<lineCount, id: \.self) { i in
                let position = Double(i * gridMs) / Double(totalMs)
                let x = position * width

                Rectangle()
                    .fill(Color.white.opacity(0.15))
                    .frame(width: 1, height: height)
                    .offset(x: x)
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - Segment Cursors

    private func segmentCursors(width: CGFloat, height: CGFloat) -> some View {
        ForEach(engine.segments) { segment in
            let startX = segment.startNormalized(in: engine.totalDuration) * width
            let endX = segment.endNormalized(in: engine.totalDuration) * width
            let effectColor = segment.effectDefinition?.color ?? .gray
            let isSelected = engine.selectedSegmentId == segment.id

            // Start cursor
            SegmentCursor(
                position: startX,
                height: height,
                color: effectColor,
                isSelected: isSelected,
                isStart: true,
                isDragging: isDraggingSegment == segment.id && dragType == .start
            )
            .gesture(segmentDragGesture(segment: segment, isStart: true, width: width))

            // End cursor
            SegmentCursor(
                position: endX,
                height: height,
                color: effectColor,
                isSelected: isSelected,
                isStart: false,
                isDragging: isDraggingSegment == segment.id && dragType == .end
            )
            .gesture(segmentDragGesture(segment: segment, isStart: false, width: width))

            // Segment label (centered above)
            if isSelected && (endX - startX) > 50 {
                SegmentLabel(segment: segment)
                    .offset(x: startX + (endX - startX) / 2 - 40, y: -height / 2 - 16)
            }
        }
    }

    // MARK: - Playhead

    private func playhead(width: CGFloat, height: CGFloat) -> some View {
        let x = engine.playheadNormalized * width

        return ZStack {
            // Vertical line
            Rectangle()
                .fill(Color.white)
                .frame(width: isDraggingPlayhead ? 3 : 2, height: height)
                .shadow(color: .black.opacity(0.4), radius: 2)

            // Top handle
            PlayheadHandle(isTop: true)
                .offset(y: -height / 2 + 6)

            // Bottom handle
            PlayheadHandle(isTop: false)
                .offset(y: height / 2 - 6)
        }
        .offset(x: x)
        .gesture(playheadDragGesture(width: width))
    }

    // MARK: - Interaction Layer

    private func interactionLayer(width: CGFloat, height: CGFloat) -> some View {
        Color.clear
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        guard !isDraggingPlayhead && isDraggingSegment == nil else { return }

                        let position = max(0, min(value.location.x / width, 1))

                        // Only seek within trim range
                        if position >= engine.trimStartNormalized && position <= engine.trimEndNormalized {
                            engine.seekNormalized(position)

                            if enableHaptics && abs(position - lastHapticPosition) > 0.02 {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                lastHapticPosition = position
                            }
                        }
                    }
                    .onEnded { _ in
                        lastHapticPosition = -1
                    }
            )
            .allowsHitTesting(!isDraggingPlayhead && isDraggingSegment == nil)
    }

    // MARK: - Gestures

    private func playheadDragGesture(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                isDraggingPlayhead = true

                let position = max(engine.trimStartNormalized, min(value.location.x / width, engine.trimEndNormalized))
                engine.seekNormalized(position)

                // Grid snap haptic
                if engine.gridConfig.isEnabled && enableHaptics {
                    let snappedTime = engine.gridConfig.snap(
                        PrecisionTime.fromNormalized(position, in: engine.totalDuration)
                    )
                    let snappedPos = snappedTime.normalized(in: engine.totalDuration)

                    if abs(snappedPos - position) < 0.005 && abs(snappedPos - lastHapticPosition) > 0.01 {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        lastHapticPosition = snappedPos
                    }
                }
            }
            .onEnded { _ in
                isDraggingPlayhead = false
                showGridOverlay = false
                lastHapticPosition = -1

                if enableHaptics {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                }
            }
    }

    private func segmentDragGesture(segment: PrecisionEffectSegment, isStart: Bool, width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                isDraggingSegment = segment.id
                dragType = isStart ? .start : .end
                showGridOverlay = true
                engine.selectedSegmentId = segment.id

                let position = max(0, min(value.location.x / width, 1))
                let newTime = PrecisionTime.fromNormalized(position, in: engine.totalDuration)

                if isStart {
                    engine.updateSegment(segment.id, start: newTime)
                } else {
                    engine.updateSegment(segment.id, end: newTime)
                }

                // Snap feedback
                if engine.gridConfig.isEnabled && enableHaptics {
                    let snappedTime = engine.gridConfig.snap(newTime)
                    if abs(snappedTime.frames - newTime.frames) < Int64(engine.gridConfig.gridResolutionMs) / 4 {
                        UISelectionFeedbackGenerator().selectionChanged()
                    }
                }
            }
            .onEnded { _ in
                // Save to history on drag end
                engine.updateSegment(segment.id, saveHistory: true)

                isDraggingSegment = nil
                dragType = nil
                showGridOverlay = false

                if enableHaptics {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                }
            }
    }
}

// MARK: - Segment Drag Type

private enum SegmentDragType {
    case start, end, move
}

// MARK: - Segment Cursor

private struct SegmentCursor: View {
    let position: CGFloat
    let height: CGFloat
    let color: Color
    let isSelected: Bool
    let isStart: Bool
    let isDragging: Bool

    var body: some View {
        ZStack {
            // Vertical line
            Rectangle()
                .fill(color)
                .frame(width: isDragging ? 4 : (isSelected ? 3 : 2), height: height)
                .shadow(color: color.opacity(0.6), radius: isDragging ? 6 : 3)

            // Handle circle
            VStack {
                handleCircle
                    .offset(y: -height / 2 - 14)

                Spacer()

                if isSelected {
                    handleCircle
                        .scaleEffect(0.75)
                        .offset(y: height / 2 + 10)
                }
            }
        }
        .frame(width: 28, height: height + 40)
        .offset(x: position - 14)
        .contentShape(Rectangle().size(width: 44, height: height + 60))
        .animation(.easeOut(duration: 0.15), value: isDragging)
    }

    private var handleCircle: some View {
        ZStack {
            Circle()
                .fill(color)
                .frame(width: isSelected ? 22 : 18, height: isSelected ? 22 : 18)
                .shadow(color: color.opacity(0.8), radius: isSelected ? 5 : 3)

            Circle()
                .stroke(Color.white, lineWidth: 2)
                .frame(width: isSelected ? 22 : 18, height: isSelected ? 22 : 18)

            Image(systemName: isStart ? "arrow.left" : "arrow.right")
                .font(.system(size: isSelected ? 10 : 8, weight: .bold))
                .foregroundColor(.white)
        }
    }
}

// MARK: - Segment Label

private struct SegmentLabel: View {
    let segment: PrecisionEffectSegment

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: segment.effectDefinition?.icon ?? "waveform")
                .font(.system(size: 10))

            Text(segment.effectDefinition?.displayName ?? "Effect")
                .font(.system(size: 10, weight: .medium))

            Text(segment.duration.formatted)
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(.white.opacity(0.8))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(segment.effectDefinition?.color ?? .gray)
        )
        .shadow(color: .black.opacity(0.3), radius: 3)
    }
}

// MARK: - Playhead Handle

private struct PlayheadHandle: View {
    let isTop: Bool

    var body: some View {
        Triangle()
            .fill(Color.white)
            .frame(width: 12, height: 8)
            .rotationEffect(.degrees(isTop ? 180 : 0))
            .shadow(color: .black.opacity(0.3), radius: 2)
    }
}

// MARK: - Triangle Shape

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

// MARK: - Precision Time Ruler

struct PrecisionTimeRuler: View {
    @ObservedObject var engine: PrecisionTimelineEngine

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let tickInterval = calculateTickInterval()
            let tickCount = Int(engine.totalDuration.seconds / tickInterval)

            ZStack(alignment: .leading) {
                ForEach(0...tickCount, id: \.self) { i in
                    let time = Double(i) * tickInterval
                    let position = time / engine.totalDuration.seconds
                    let x = position * width
                    let isInTrim = position >= engine.trimStartNormalized && position <= engine.trimEndNormalized
                    let isMajor = i % 2 == 0

                    VStack(spacing: 2) {
                        Rectangle()
                            .fill(isInTrim ? Color.white.opacity(0.5) : Color.white.opacity(0.2))
                            .frame(width: 1, height: isMajor ? 8 : 5)

                        if isMajor {
                            Text(formatTime(time))
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(isInTrim ? .white.opacity(0.7) : .white.opacity(0.3))
                        }
                    }
                    .offset(x: x)
                }
            }
        }
        .frame(height: 22)
    }

    private func calculateTickInterval() -> Double {
        let duration = engine.totalDuration.seconds
        if duration <= 10 { return 1 }
        if duration <= 30 { return 2 }
        if duration <= 60 { return 5 }
        if duration <= 180 { return 10 }
        return 30
    }

    private func formatTime(_ time: Double) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Segment Timeline Bar

struct PrecisionSegmentBar: View {
    @ObservedObject var engine: PrecisionTimelineEngine
    let height: CGFloat
    let onAddEffect: () -> Void
    let onSelectSegment: (UUID) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack {
                Text("Effets")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))

                if !engine.segments.isEmpty {
                    Text("(\(engine.segments.count))")
                        .font(.system(size: 11))
                        .foregroundColor(.yellow)
                }

                Spacer()

                if engine.canUndo {
                    Button {
                        engine.undo()
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }

                Button(action: onAddEffect) {
                    HStack(spacing: 4) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 14))
                        Text("Ajouter")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.yellow)
                }
            }

            // Timeline bar
            GeometryReader { geometry in
                let width = geometry.size.width

                ZStack(alignment: .leading) {
                    // Background
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.white.opacity(0.1))

                    // Segments
                    ForEach(engine.segments) { segment in
                        let startX = segment.startNormalized(in: engine.totalDuration) * width
                        let endX = segment.endNormalized(in: engine.totalDuration) * width
                        let segWidth = max(8, endX - startX)
                        let effectColor = segment.effectDefinition?.color ?? .gray
                        let isSelected = engine.selectedSegmentId == segment.id

                        RoundedRectangle(cornerRadius: 4)
                            .fill(effectColor.opacity(isSelected ? 0.9 : 0.7))
                            .frame(width: segWidth, height: height - 8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(isSelected ? Color.white : Color.clear, lineWidth: 2)
                            )
                            .overlay(
                                Group {
                                    if segWidth > 30 {
                                        Image(systemName: segment.effectDefinition?.icon ?? "waveform")
                                            .font(.system(size: 10))
                                            .foregroundColor(.white)
                                    }
                                }
                            )
                            .offset(x: startX, y: 4)
                            .onTapGesture {
                                onSelectSegment(segment.id)
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            }
                    }

                    // Playhead
                    if engine.isPlaying || engine.playheadNormalized > 0 {
                        Rectangle()
                            .fill(Color.white)
                            .frame(width: 2, height: height)
                            .offset(x: engine.playheadNormalized * width)
                    }
                }
            }
            .frame(height: height)

            // Legend chips
            if !engine.segments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(engine.segments) { segment in
                            SegmentChip(
                                segment: segment,
                                isSelected: engine.selectedSegmentId == segment.id,
                                onTap: { onSelectSegment(segment.id) }
                            )
                        }
                    }
                }
                .frame(height: 26)
            }
        }
    }
}

// MARK: - Segment Chip

private struct SegmentChip: View {
    let segment: PrecisionEffectSegment
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: segment.effectDefinition?.icon ?? "waveform")
                .font(.system(size: 10))

            Text(segment.effectDefinition?.displayName ?? "")
                .font(.system(size: 10, weight: .medium))

            Text(segment.duration.formatted)
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(.white.opacity(0.7))
        }
        .foregroundColor(isSelected ? .white : .white.opacity(0.8))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Capsule()
                .fill((segment.effectDefinition?.color ?? .gray).opacity(isSelected ? 0.9 : 0.5))
        )
        .onTapGesture(perform: onTap)
    }
}

// MARK: - Preview

#Preview("Precision Waveform") {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack(spacing: 20) {
            let engine = PrecisionTimelineEngine()

            PrecisionWaveformView(
                engine: engine,
                waveformSamples: (0..<60).map { _ in CGFloat.random(in: 0.2...0.9) },
                onSeek: { _ in }
            )
            .frame(height: 120)
            .padding(.horizontal, 20)

            PrecisionTimeRuler(engine: engine)
                .padding(.horizontal, 20)

            PrecisionSegmentBar(
                engine: engine,
                height: 28,
                onAddEffect: {},
                onSelectSegment: { _ in }
            )
            .padding(.horizontal, 20)
        }
        .onAppear {
            // Demo setup
        }
    }
}
