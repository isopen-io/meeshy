//
//  AdvancedWaveformEditor.swift
//  Meeshy
//
//  Advanced waveform editor with:
//  - Draggable effect zones (move entire effect)
//  - Resizable effect boundaries (start/end handles)
//  - Trim handles with visual spacing
//  - Playhead with precise seeking
//  - Visual grid overlay
//
//  iOS 16+
//

import SwiftUI
import AVFoundation

// MARK: - Advanced Waveform Editor

struct AdvancedWaveformEditor: View {
    // MARK: - Dependencies

    @ObservedObject var engine: PrecisionTimelineEngine
    let waveformSamples: [CGFloat]
    let onSeek: (Double) -> Void

    // MARK: - Configuration

    var trimHandleWidth: CGFloat = 16
    var trimHandleSpacing: CGFloat = 8
    var effectHandleSize: CGFloat = 24

    // MARK: - State

    @State private var isDraggingPlayhead = false
    @State private var isDraggingTrimStart = false
    @State private var isDraggingTrimEnd = false
    @State private var draggingEffectId: UUID?
    @State private var effectDragType: EffectDragType?
    @State private var showGrid = false
    @State private var trimStartInitial: Double = 0
    @State private var trimEndInitial: Double = 1

    enum EffectDragType {
        case move      // Dragging the effect zone to move it
        case startHandle  // Dragging start boundary
        case endHandle    // Dragging end boundary
    }

    // MARK: - Body

    var body: some View {
        GeometryReader { geometry in
            let totalWidth = geometry.size.width
            let height = geometry.size.height
            let waveformWidth = totalWidth - (trimHandleWidth * 2) - (trimHandleSpacing * 2)
            let waveformOffset = trimHandleWidth + trimHandleSpacing

            ZStack(alignment: .leading) {
                // Layer 1: Background
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(0.08))

                // Layer 2: Waveform area
                waveformArea(width: waveformWidth, height: height)
                    .offset(x: waveformOffset)

                // Layer 3: Grid overlay (always visible when enabled)
                if engine.gridConfig.isEnabled {
                    gridOverlay(width: waveformWidth, height: height, isDragging: showGrid)
                        .offset(x: waveformOffset)
                }

                // Layer 4: Trim overlay (dimmed regions)
                trimOverlay(waveformWidth: waveformWidth, height: height, offset: waveformOffset)

                // Layer 5: Tap gesture layer (only on waveform area, not on handles)
                Color.clear
                    .frame(width: waveformWidth, height: height)
                    .offset(x: waveformOffset)
                    .contentShape(Rectangle())
                    .gesture(tapGesture(waveformWidth: waveformWidth, offset: waveformOffset))

                // Layer 6: Effect zones with handles
                effectZones(waveformWidth: waveformWidth, height: height, offset: waveformOffset)

                // Layer 7: Playhead
                playhead(waveformWidth: waveformWidth, height: height, offset: waveformOffset)

                // Layer 8: Trim handles (on top for gesture priority)
                trimHandles(totalWidth: totalWidth, height: height)
            }
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    // MARK: - Trim Handles

    private func trimHandles(totalWidth: CGFloat, height: CGFloat) -> some View {
        let waveformWidth = totalWidth - (trimHandleWidth * 2) - (trimHandleSpacing * 2)
        let waveformStart = trimHandleWidth + trimHandleSpacing
        let handleWidth: CGFloat = 24

        // Calculate handle positions based on current trim values
        let leftHandleX = waveformStart + (engine.trimStartNormalized * waveformWidth)
        let rightHandleX = waveformStart + (engine.trimEndNormalized * waveformWidth)

        return ZStack(alignment: .leading) {
            // Left trim handle - moves with trim position
            MovableTrimHandle(
                isStart: true,
                time: engine.trimRange.start,
                isDragging: isDraggingTrimStart
            )
            .frame(width: handleWidth, height: height)
            .position(x: leftHandleX, y: height / 2)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        if !isDraggingTrimStart {
                            // Capture initial value at drag start
                            trimStartInitial = engine.trimStartNormalized
                            isDraggingTrimStart = true
                        }
                        showGrid = true

                        // Calculate delta from initial position, not current
                        // Use the captured initial value + translation delta
                        let deltaX = value.translation.width
                        let deltaNormalized = deltaX / waveformWidth
                        let newNormalized = trimStartInitial + deltaNormalized

                        // Clamp to valid range (min 5% gap from end)
                        let clamped = max(0, min(newNormalized, engine.trimEndNormalized - 0.05))
                        engine.setTrimStart(normalized: clamped)
                    }
                    .onEnded { _ in
                        isDraggingTrimStart = false
                        showGrid = false
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    }
            )

            // Right trim handle - moves with trim position
            MovableTrimHandle(
                isStart: false,
                time: engine.trimRange.end,
                isDragging: isDraggingTrimEnd
            )
            .frame(width: handleWidth, height: height)
            .position(x: rightHandleX, y: height / 2)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        if !isDraggingTrimEnd {
                            // Capture initial value at drag start
                            trimEndInitial = engine.trimEndNormalized
                            isDraggingTrimEnd = true
                        }
                        showGrid = true

                        // Calculate delta from initial position, not current
                        // Use the captured initial value + translation delta
                        let deltaX = value.translation.width
                        let deltaNormalized = deltaX / waveformWidth
                        let newNormalized = trimEndInitial + deltaNormalized

                        // Clamp to valid range (min 5% gap from start)
                        let clamped = max(engine.trimStartNormalized + 0.05, min(newNormalized, 1.0))
                        engine.setTrimEnd(normalized: clamped)
                    }
                    .onEnded { _ in
                        isDraggingTrimEnd = false
                        showGrid = false
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    }
            )
        }
    }

    // MARK: - Waveform Area

    private func waveformArea(width: CGFloat, height: CGFloat) -> some View {
        Canvas { context, size in
            let barWidth: CGFloat = 3
            let spacing: CGFloat = 2
            let totalBarSpace = barWidth + spacing
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
        .frame(width: width, height: height)
    }

    private func colorForPosition(_ position: Double) -> Color {
        // Outside trim range
        guard position >= engine.trimStartNormalized && position <= engine.trimEndNormalized else {
            return Color.white.opacity(0.15)
        }

        let time = PrecisionTime.fromNormalized(position, in: engine.totalDuration)

        // In effect segment
        if let segment = engine.segmentAt(time: time) {
            let effectColor = segment.effectDefinition?.color ?? .white
            if position <= engine.playheadNormalized {
                return effectColor.opacity(0.95)
            }
            return effectColor.opacity(0.5)
        }

        // Normal audio
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

    // MARK: - Grid Overlay

    private func gridOverlay(width: CGFloat, height: CGFloat, isDragging: Bool) -> some View {
        let gridMs = engine.gridConfig.gridResolutionMs
        let totalMs = engine.totalDuration.milliseconds
        guard totalMs > 0 && gridMs > 0 else {
            return AnyView(EmptyView())
        }
        let lineCount = totalMs / gridMs

        return AnyView(
            ZStack(alignment: .leading) {
                ForEach(0..<lineCount, id: \.self) { i in
                    let position = Double(i * gridMs) / Double(totalMs)
                    let x = position * width
                    let isMajor = (i % 5) == 0  // Every 5th line is major (500ms if 100ms grid)

                    Rectangle()
                        .fill(Color.yellow.opacity(isDragging ? (isMajor ? 0.4 : 0.2) : (isMajor ? 0.25 : 0.1)))
                        .frame(width: isMajor ? 2 : 1, height: height)
                        .offset(x: x)
                }
            }
            .allowsHitTesting(false)
            .animation(.easeOut(duration: 0.15), value: isDragging)
        )
    }

    // MARK: - Trim Overlay

    private func trimOverlay(waveformWidth: CGFloat, height: CGFloat, offset: CGFloat) -> some View {
        ZStack(alignment: .leading) {
            // Left trim area
            if engine.trimStartNormalized > 0 {
                Rectangle()
                    .fill(Color.black.opacity(0.6))
                    .frame(width: engine.trimStartNormalized * waveformWidth, height: height)
                    .offset(x: offset)
            }

            // Right trim area
            if engine.trimEndNormalized < 1 {
                Rectangle()
                    .fill(Color.black.opacity(0.6))
                    .frame(width: (1 - engine.trimEndNormalized) * waveformWidth, height: height)
                    .offset(x: offset + engine.trimEndNormalized * waveformWidth)
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - Effect Zones

    private func effectZones(waveformWidth: CGFloat, height: CGFloat, offset: CGFloat) -> some View {
        ForEach(engine.segments) { segment in
            let startX = segment.startNormalized(in: engine.totalDuration) * waveformWidth + offset
            let endX = segment.endNormalized(in: engine.totalDuration) * waveformWidth + offset
            let zoneWidth = max(20, endX - startX)
            let effectColor = segment.effectDefinition?.color ?? .gray
            let isSelected = engine.selectedSegmentId == segment.id
            let isDragging = draggingEffectId == segment.id

            // Use leading alignment for proper positioning from left edge
            ZStack(alignment: .topLeading) {
                // Effect zone background (draggable to move)
                // Position: left edge at startX, centered vertically
                EffectZoneView(
                    segment: segment,
                    width: zoneWidth,
                    height: height * 0.7,
                    isSelected: isSelected,
                    isDragging: isDragging && effectDragType == .move
                )
                .offset(x: startX, y: height * 0.15)
                .gesture(moveGesture(segment: segment, waveformWidth: waveformWidth, offset: offset))

                // Start handle - centered on startX
                EffectBoundaryHandle(
                    isStart: true,
                    color: effectColor,
                    isSelected: isSelected,
                    isDragging: isDragging && effectDragType == .startHandle
                )
                .frame(width: effectHandleSize, height: height)
                .offset(x: startX - effectHandleSize / 2, y: 0)
                .gesture(boundaryGesture(segment: segment, isStart: true, waveformWidth: waveformWidth, offset: offset))

                // End handle - centered on endX
                EffectBoundaryHandle(
                    isStart: false,
                    color: effectColor,
                    isSelected: isSelected,
                    isDragging: isDragging && effectDragType == .endHandle
                )
                .frame(width: effectHandleSize, height: height)
                .offset(x: endX - effectHandleSize / 2, y: 0)
                .gesture(boundaryGesture(segment: segment, isStart: false, waveformWidth: waveformWidth, offset: offset))
            }
        }
    }

    private func moveGesture(segment: PrecisionEffectSegment, waveformWidth: CGFloat, offset: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 5)
            .onChanged { value in
                draggingEffectId = segment.id
                effectDragType = .move
                showGrid = true
                engine.selectedSegmentId = segment.id

                let dragDelta = value.translation.width
                let timeDelta = (dragDelta / waveformWidth) * engine.totalDuration.seconds

                let newStart = max(0, segment.startTime.seconds + timeDelta)
                let duration = segment.duration.seconds
                let newEnd = min(newStart + duration, engine.totalDuration.seconds)

                engine.updateSegment(
                    segment.id,
                    start: PrecisionTime(seconds: newStart, sampleRate: engine.totalDuration.sampleRate),
                    end: PrecisionTime(seconds: newEnd, sampleRate: engine.totalDuration.sampleRate)
                )

                UISelectionFeedbackGenerator().selectionChanged()
            }
            .onEnded { _ in
                draggingEffectId = nil
                effectDragType = nil
                showGrid = false
                engine.updateSegment(segment.id, saveHistory: true)
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }
    }

    private func boundaryGesture(segment: PrecisionEffectSegment, isStart: Bool, waveformWidth: CGFloat, offset: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                draggingEffectId = segment.id
                effectDragType = isStart ? .startHandle : .endHandle
                showGrid = true
                engine.selectedSegmentId = segment.id

                let position = (value.location.x - offset) / waveformWidth
                let clampedPosition = max(0, min(1, position))
                let newTime = PrecisionTime.fromNormalized(clampedPosition, in: engine.totalDuration)

                if isStart {
                    engine.updateSegment(segment.id, start: newTime)
                } else {
                    engine.updateSegment(segment.id, end: newTime)
                }

                UISelectionFeedbackGenerator().selectionChanged()
            }
            .onEnded { _ in
                draggingEffectId = nil
                effectDragType = nil
                showGrid = false
                engine.updateSegment(segment.id, saveHistory: true)
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }
    }

    // MARK: - Playhead

    private func playhead(waveformWidth: CGFloat, height: CGFloat, offset: CGFloat) -> some View {
        let x = engine.playheadNormalized * waveformWidth + offset

        return ZStack {
            // Vertical line
            Rectangle()
                .fill(Color.white)
                .frame(width: isDraggingPlayhead ? 3 : 2, height: height)
                .shadow(color: .black.opacity(0.5), radius: 2)

            // Top triangle
            Triangle()
                .fill(Color.white)
                .frame(width: 14, height: 10)
                .rotationEffect(.degrees(180))
                .offset(y: -height / 2 + 5)

            // Bottom triangle
            Triangle()
                .fill(Color.white)
                .frame(width: 14, height: 10)
                .offset(y: height / 2 - 5)
        }
        .offset(x: x)
        .gesture(
            DragGesture(minimumDistance: 2)
                .onChanged { value in
                    isDraggingPlayhead = true
                    let position = (value.location.x - offset) / waveformWidth
                    let clamped = max(engine.trimStartNormalized, min(position, engine.trimEndNormalized))
                    engine.seekNormalized(clamped)
                }
                .onEnded { _ in
                    isDraggingPlayhead = false
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
        )
    }

    // MARK: - Tap Gesture

    private func tapGesture(waveformWidth: CGFloat, offset: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onEnded { value in
                guard !isDraggingPlayhead && draggingEffectId == nil else { return }

                let position = (value.location.x - offset) / waveformWidth

                if position >= engine.trimStartNormalized && position <= engine.trimEndNormalized {
                    engine.seekNormalized(position)
                    onSeek(position)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
    }
}

// MARK: - Trim Handle View

private struct TrimHandleView: View {
    let isStart: Bool
    let time: PrecisionTime
    let isDragging: Bool

    var body: some View {
        ZStack {
            // Background
            RoundedRectangle(cornerRadius: 8)
                .fill(isDragging ? Color.yellow : Color.yellow.opacity(0.8))

            // Grip lines
            VStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color.black.opacity(0.4))
                        .frame(width: 8, height: 2)
                }
            }

            // Time label at edge
            VStack {
                if isStart {
                    Spacer()
                }

                Text(time.shortFormatted)
                    .font(.system(size: 8, weight: .medium, design: .monospaced))
                    .foregroundColor(.black.opacity(0.7))
                    .padding(2)

                if !isStart {
                    Spacer()
                }
            }
        }
        .scaleEffect(isDragging ? 1.1 : 1.0)
        .animation(.easeOut(duration: 0.15), value: isDragging)
    }
}

// MARK: - Movable Trim Handle

private struct MovableTrimHandle: View {
    let isStart: Bool
    let time: PrecisionTime
    let isDragging: Bool

    var body: some View {
        VStack(spacing: 2) {
            // Time label on top - horizontal, no wrap
            Text(time.formatted)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(isDragging ? .yellow : .white)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(
                    Capsule()
                        .fill(Color.black.opacity(0.7))
                )

            // Vertical bar with grip
            ZStack {
                // Main bar
                RoundedRectangle(cornerRadius: 3)
                    .fill(
                        LinearGradient(
                            colors: [Color.yellow, Color.orange],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: isDragging ? 8 : 6)
                    .shadow(color: .yellow.opacity(isDragging ? 0.6 : 0.3), radius: isDragging ? 6 : 3)

                // Grip lines
                VStack(spacing: 6) {
                    ForEach(0..<4, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color.black.opacity(0.4))
                            .frame(width: 4, height: 2)
                    }
                }

                // Direction arrow
                VStack {
                    if isStart {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(.black.opacity(0.6))
                        Spacer()
                    } else {
                        Spacer()
                        Image(systemName: "chevron.left")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(.black.opacity(0.6))
                    }
                }
                .padding(.vertical, 8)
            }
        }
        .scaleEffect(isDragging ? 1.1 : 1.0)
        .animation(.spring(response: 0.15), value: isDragging)
        .contentShape(Rectangle())
    }
}

// MARK: - Effect Zone View

private struct EffectZoneView: View {
    let segment: PrecisionEffectSegment
    let width: CGFloat
    let height: CGFloat
    let isSelected: Bool
    let isDragging: Bool

    var body: some View {
        let effectColor = segment.effectDefinition?.color ?? .gray

        ZStack {
            // Background
            RoundedRectangle(cornerRadius: 8)
                .fill(effectColor.opacity(isSelected ? 0.4 : 0.25))

            // Border
            RoundedRectangle(cornerRadius: 8)
                .stroke(effectColor.opacity(isSelected ? 1 : 0.6), lineWidth: isSelected ? 2 : 1)

            // Label (draggable indicator)
            VStack(spacing: 2) {
                Image(systemName: segment.effectDefinition?.icon ?? "waveform")
                    .font(.system(size: 12))

                if width > 50 {
                    Text(segment.effectDefinition?.displayName ?? "")
                        .font(.system(size: 9, weight: .medium))
                        .lineLimit(1)
                }

                // Duration
                if width > 40 {
                    Text(segment.duration.formatted)
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            .foregroundColor(.white)
        }
        .frame(width: width, height: height)
        .scaleEffect(isDragging ? 1.02 : 1.0)
        .shadow(color: effectColor.opacity(isDragging ? 0.6 : 0), radius: 8)
        .animation(.easeOut(duration: 0.15), value: isDragging)
    }
}

// MARK: - Effect Boundary Handle

private struct EffectBoundaryHandle: View {
    let isStart: Bool
    let color: Color
    let isSelected: Bool
    let isDragging: Bool

    var body: some View {
        GeometryReader { geometry in
            let height = geometry.size.height

            ZStack {
                // Vertical line
                Rectangle()
                    .fill(color)
                    .frame(width: isDragging ? 4 : 2)
                    .shadow(color: color.opacity(0.6), radius: isDragging ? 6 : 2)

                // Top handle
                Circle()
                    .fill(color)
                    .frame(width: isDragging ? 20 : 16, height: isDragging ? 20 : 16)
                    .overlay(
                        Circle()
                            .stroke(Color.white, lineWidth: 2)
                    )
                    .overlay(
                        Image(systemName: isStart ? "chevron.left" : "chevron.right")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(.white)
                    )
                    .shadow(color: color.opacity(0.5), radius: 4)
                    .offset(y: -height / 2 + 12)

                // Bottom handle
                if isSelected {
                    Circle()
                        .fill(color)
                        .frame(width: 12, height: 12)
                        .overlay(
                            Circle()
                                .stroke(Color.white, lineWidth: 1.5)
                        )
                        .offset(y: height / 2 - 12)
                }
            }
            .frame(width: 24)
        }
        .contentShape(Rectangle())
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

// MARK: - Preview

#Preview("Advanced Waveform Editor") {
    ZStack {
        Color.black.ignoresSafeArea()

        let engine = PrecisionTimelineEngine()

        AdvancedWaveformEditor(
            engine: engine,
            waveformSamples: (0..<60).map { _ in CGFloat.random(in: 0.2...0.9) },
            onSeek: { _ in }
        )
        .frame(height: 140)
        .padding(20)
    }
}
