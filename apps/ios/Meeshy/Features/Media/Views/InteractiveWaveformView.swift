//
//  InteractiveWaveformView.swift
//  Meeshy
//
//  Interactive waveform with:
//  - Click-to-seek playhead positioning
//  - Segment boundary cursors on waveform
//  - Real-time sync between waveform/timeline/editor
//  - Effect zones visualization
//
//  Uses Accelerate framework for optimized audio processing
//
//  iOS 16+
//

import SwiftUI
import AVFoundation
import Accelerate

// MARK: - Editor Waveform View

/// Advanced waveform for audio editor with segment cursors
struct EditorWaveformView: View {
    // MARK: - Bindings

    @Binding var playheadPosition: Double
    @Binding var trimStartPosition: Double
    @Binding var trimEndPosition: Double
    @ObservedObject var effectTimeline: AudioEffectTimeline

    // MARK: - Properties

    let waveformSamples: [CGFloat]
    let duration: TimeInterval
    let isPlaying: Bool
    let onSeek: (Double) -> Void
    let onSegmentUpdate: ((UUID, TimeInterval?, TimeInterval?) -> Void)?

    // MARK: - State

    @State private var isDraggingPlayhead = false
    @State private var activeSegmentDrag: SegmentDragState?
    @State private var showSegmentHandles = false
    @GestureState private var dragLocation: CGPoint?

    // MARK: - Drag State

    struct SegmentDragState {
        let segmentId: UUID
        let isStart: Bool
        var initialTime: TimeInterval
    }

    // MARK: - Body

    var body: some View {
        GeometryReader { geometry in
            let availableWidth = geometry.size.width
            let waveformHeight = geometry.size.height
            let handleSpace: CGFloat = 28 // Space below for resize handles

            VStack(spacing: 0) {
                // Waveform area - full height minus handle space
                ZStack(alignment: .leading) {
                    // Base waveform with effect zones
                    waveformCanvas(width: availableWidth, height: waveformHeight - handleSpace)

                    // Effect segment overlays - INSIDE waveform bounds
                    effectSegmentsOverlay(width: availableWidth, height: waveformHeight - handleSpace)

                    // Trim overlay (dimmed areas)
                    trimOverlay(width: availableWidth, height: waveformHeight - handleSpace)

                    // Playhead
                    playheadCursor(width: availableWidth, height: waveformHeight - handleSpace)

                    // Tap gesture for seeking
                    Color.clear
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    handleWaveformTap(at: value.location, width: availableWidth)
                                }
                        )
                        .allowsHitTesting(!isDraggingPlayhead && activeSegmentDrag == nil)
                }
                .frame(height: waveformHeight - handleSpace)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Space for segment resize handles BELOW waveform
                ZStack(alignment: .leading) {
                    segmentResizeHandles(width: availableWidth, handleHeight: handleSpace)
                }
                .frame(height: handleSpace)
            }
            .onAppear {
                showSegmentHandles = !effectTimeline.segments.isEmpty
            }
            .onChange(of: effectTimeline.segments.count) { _, count in
                showSegmentHandles = count > 0
            }
        }
    }

    // MARK: - Waveform Canvas

    private func waveformCanvas(width: CGFloat, height: CGFloat) -> some View {
        Canvas { context, size in
            let barWidth: CGFloat = 3
            let spacing: CGFloat = 2
            let totalBarSpace = barWidth + spacing
            let barCount = Int(size.width / totalBarSpace)
            let samples = resampleWaveform(to: barCount)

            for (index, sample) in samples.enumerated() {
                let x = CGFloat(index) * totalBarSpace + barWidth / 2
                let barHeight = max(4, sample * (size.height - 20))
                let y = (size.height - barHeight) / 2

                let position = Double(index) / Double(max(samples.count - 1, 1))
                let color = colorForPosition(position)

                let rect = CGRect(x: x, y: y, width: barWidth, height: barHeight)
                let path = RoundedRectangle(cornerRadius: 2).path(in: rect)
                context.fill(path, with: .color(color))
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.white.opacity(0.1))
        )
    }

    private func colorForPosition(_ position: Double) -> Color {
        // Check if in trim range
        guard position >= trimStartPosition && position <= trimEndPosition else {
            return Color.white.opacity(0.2)
        }

        // Check if in an effect segment
        let time = position * duration
        if let segment = effectTimeline.segmentAt(time: time) {
            let effectColor = segment.effectDefinition?.color ?? .white
            // Played = brighter
            if position <= playheadPosition {
                return effectColor.opacity(0.9)
            }
            return effectColor.opacity(0.6)
        }

        // Normal: played = yellow, not played = white
        if position <= playheadPosition {
            return .yellow
        }
        return .white.opacity(0.7)
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
            // Left trim area
            Rectangle()
                .fill(Color.black.opacity(0.6))
                .frame(width: max(0, trimStartPosition * width), height: height)

            // Right trim area
            Rectangle()
                .fill(Color.black.opacity(0.6))
                .frame(width: max(0, (1 - trimEndPosition) * width), height: height)
                .offset(x: trimEndPosition * width)
        }
    }

    // MARK: - Effect Segments Overlay (inside waveform bounds)

    private func effectSegmentsOverlay(width: CGFloat, height: CGFloat) -> some View {
        ForEach(effectTimeline.segments) { segment in
            let startX = (segment.startTime / duration) * width
            let endX = (segment.endTime / duration) * width
            let isSelected = effectTimeline.selectedSegmentId == segment.id
            let effectColor = segment.effectDefinition?.color ?? .gray
            let segmentWidth = max(10, endX - startX)

            // Segment zone - constrained to waveform bounds
            RoundedRectangle(cornerRadius: 4)
                .fill(effectColor.opacity(isSelected ? 0.4 : 0.25))
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(effectColor.opacity(isSelected ? 0.9 : 0.5), lineWidth: isSelected ? 2 : 1)
                )
                .frame(width: segmentWidth, height: height)
                .position(x: startX + segmentWidth / 2, y: height / 2)
                .gesture(segmentMoveGesture(segment: segment, width: width))
                .onTapGesture {
                    effectTimeline.selectedSegmentId = segment.id
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }

            // Effect icon label at top of segment
            if segmentWidth > 30 {
                HStack(spacing: 3) {
                    Image(systemName: segment.effectDefinition?.icon ?? "waveform")
                        .font(.system(size: 10, weight: .semibold))
                    if isSelected && segmentWidth > 60 {
                        Text(segment.effectDefinition?.displayName ?? "")
                            .font(.system(size: 9, weight: .medium))
                            .lineLimit(1)
                    }
                }
                .foregroundColor(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(effectColor.opacity(0.9))
                .clipShape(Capsule())
                .position(x: startX + segmentWidth / 2, y: 14)
            }

            // Vertical boundary lines inside waveform
            Rectangle()
                .fill(effectColor)
                .frame(width: isSelected ? 3 : 2, height: height)
                .position(x: startX, y: height / 2)

            Rectangle()
                .fill(effectColor)
                .frame(width: isSelected ? 3 : 2, height: height)
                .position(x: endX, y: height / 2)
        }
    }

    // MARK: - Segment Resize Handles (below waveform, arrows only when selected)

    private func segmentResizeHandles(width: CGFloat, handleHeight: CGFloat) -> some View {
        ForEach(effectTimeline.segments) { segment in
            let isSelected = effectTimeline.selectedSegmentId == segment.id

            // Only show resize handles for selected segment
            if isSelected {
                let startX = (segment.startTime / duration) * width
                let endX = (segment.endTime / duration) * width
                let effectColor = segment.effectDefinition?.color ?? .gray

                // Left resize handle (arrow left)
                resizeHandle(
                    isStart: true,
                    segment: segment,
                    xPosition: startX,
                    color: effectColor,
                    width: width,
                    handleHeight: handleHeight
                )

                // Right resize handle (arrow right)
                resizeHandle(
                    isStart: false,
                    segment: segment,
                    xPosition: endX,
                    color: effectColor,
                    width: width,
                    handleHeight: handleHeight
                )
            }
        }
    }

    private func resizeHandle(
        isStart: Bool,
        segment: AudioEffectRegion,
        xPosition: CGFloat,
        color: Color,
        width: CGFloat,
        handleHeight: CGFloat
    ) -> some View {
        ZStack {
            // Arrow button
            Circle()
                .fill(color)
                .frame(width: 24, height: 24)
                .overlay(
                    Image(systemName: isStart ? "arrow.left" : "arrow.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                )
                .overlay(
                    Circle()
                        .stroke(Color.white, lineWidth: 2)
                )
                .shadow(color: color.opacity(0.6), radius: 4)
        }
        .position(x: xPosition, y: handleHeight / 2)
        .contentShape(Rectangle().size(width: 44, height: handleHeight))
        .gesture(
            DragGesture(minimumDistance: 1)
                .onChanged { value in
                    handleSegmentCursorDrag(
                        segment: segment,
                        isStart: isStart,
                        location: value.location,
                        width: width
                    )
                }
                .onEnded { _ in
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                }
        )
    }

    // MARK: - Segment Move Gesture

    private func segmentMoveGesture(segment: AudioEffectRegion, width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                // Select the segment immediately
                if effectTimeline.selectedSegmentId != segment.id {
                    effectTimeline.selectedSegmentId = segment.id
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }

                // Calculate new position from absolute location
                let dragPosition = value.location.x / width
                let segmentDuration = segment.endTime - segment.startTime
                let segmentCenter = dragPosition * duration

                // Calculate new start/end centered on drag
                var newStart = segmentCenter - (segmentDuration / 2)
                var newEnd = segmentCenter + (segmentDuration / 2)

                // Clamp to valid range
                if newStart < 0 {
                    newStart = 0
                    newEnd = segmentDuration
                }
                if newEnd > duration {
                    newEnd = duration
                    newStart = max(0, duration - segmentDuration)
                }

                // Update segment position immediately
                onSegmentUpdate?(segment.id, newStart, newEnd)
            }
            .onEnded { _ in
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }
    }

    // MARK: - Playhead

    private func playheadCursor(width: CGFloat, height: CGFloat) -> some View {
        let xPosition = playheadPosition * width

        return ZStack {
            // Vertical line
            Rectangle()
                .fill(Color.white)
                .frame(width: 2, height: height)
                .shadow(color: .black.opacity(0.5), radius: 2)

            // Top indicator
            PlayheadTriangle()
                .fill(Color.white)
                .frame(width: 12, height: 8)
                .rotationEffect(.degrees(180))
                .offset(y: -height / 2 + 4)

            // Bottom indicator
            PlayheadTriangle()
                .fill(Color.white)
                .frame(width: 12, height: 8)
                .offset(y: height / 2 - 4)
        }
        .offset(x: xPosition)
        .contentShape(Rectangle().size(width: 30, height: height))
        .gesture(
            DragGesture(minimumDistance: 2)
                .onChanged { value in
                    isDraggingPlayhead = true
                    let newPosition = max(trimStartPosition, min(value.location.x / width, trimEndPosition))
                    playheadPosition = newPosition
                    onSeek(newPosition)
                }
                .onEnded { _ in
                    isDraggingPlayhead = false
                }
        )
    }

    // MARK: - Gestures

    private func handleWaveformTap(at location: CGPoint, width: CGFloat) {
        let position = max(0, min(location.x / width, 1.0))

        // If tap is within trim range, seek to that position
        if position >= trimStartPosition && position <= trimEndPosition {
            playheadPosition = position
            onSeek(position)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    private func handleSegmentCursorDrag(
        segment: AudioEffectRegion,
        isStart: Bool,
        location: CGPoint,
        width: CGFloat
    ) {
        // Select the segment first
        if effectTimeline.selectedSegmentId != segment.id {
            effectTimeline.selectedSegmentId = segment.id
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }

        let position = max(0, min(location.x / width, 1.0))
        let time = position * duration

        // Minimum segment duration (100ms)
        let minDuration: TimeInterval = 0.1

        if isStart {
            let maxStart = segment.endTime - minDuration
            let newStart = max(0, min(time, maxStart))
            onSegmentUpdate?(segment.id, newStart, nil)
        } else {
            let minEnd = segment.startTime + minDuration
            let newEnd = max(minEnd, min(time, duration))
            onSegmentUpdate?(segment.id, nil, newEnd)
        }
    }
}

// MARK: - Playhead Triangle Shape

struct PlayheadTriangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

// MARK: - Time Ruler View

struct TimeRulerView: View {
    let duration: TimeInterval
    let trimStart: Double
    let trimEnd: Double

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let tickCount = max(1, Int(duration / 5)) // Tick every 5 seconds

            ZStack(alignment: .leading) {
                // Tick marks
                ForEach(0...tickCount, id: \.self) { index in
                    let position = CGFloat(index) / CGFloat(tickCount) * width
                    let time = Double(index) / Double(tickCount) * duration
                    let isInRange = (Double(index) / Double(tickCount)) >= trimStart &&
                                   (Double(index) / Double(tickCount)) <= trimEnd

                    VStack(spacing: 2) {
                        Rectangle()
                            .fill(isInRange ? Color.white.opacity(0.5) : Color.white.opacity(0.2))
                            .frame(width: 1, height: index % 2 == 0 ? 8 : 4)

                        if index % 2 == 0 {
                            Text(formatTime(time))
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(isInRange ? .white.opacity(0.7) : .white.opacity(0.3))
                        }
                    }
                    .offset(x: position)
                }
            }
        }
        .frame(height: 24)
    }

    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Effect Segment Handle View

/// Draggable handle for segment boundaries
struct EffectSegmentHandle: View {
    let segment: AudioEffectRegion
    let isStart: Bool
    let totalDuration: TimeInterval
    let totalWidth: CGFloat
    let isSelected: Bool
    let onDrag: (TimeInterval) -> Void

    @GestureState private var isDragging = false

    private var xPosition: CGFloat {
        let time = isStart ? segment.startTime : segment.endTime
        return (time / totalDuration) * totalWidth
    }

    private var effectColor: Color {
        segment.effectDefinition?.color ?? .gray
    }

    var body: some View {
        ZStack {
            // Line
            Rectangle()
                .fill(effectColor)
                .frame(width: isDragging ? 4 : 2, height: .infinity)

            // Handle knob
            if isSelected {
                Circle()
                    .fill(effectColor)
                    .frame(width: 18, height: 18)
                    .overlay(
                        Image(systemName: "arrow.left.and.right")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.white)
                    )
                    .shadow(color: .black.opacity(0.3), radius: 3)
                    .offset(y: isStart ? -30 : 30)
            }
        }
        .offset(x: xPosition)
        .contentShape(Rectangle().size(width: 30, height: 100))
        .gesture(
            DragGesture()
                .updating($isDragging) { _, state, _ in
                    state = true
                }
                .onChanged { value in
                    let newPosition = value.location.x / totalWidth
                    let newTime = max(0, min(newPosition * totalDuration, totalDuration))
                    onDrag(newTime)
                }
        )
        .animation(.easeOut(duration: 0.15), value: isDragging)
    }
}
