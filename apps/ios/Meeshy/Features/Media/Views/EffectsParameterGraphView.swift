//
//  EffectsParameterGraphView.swift
//  Meeshy
//
//  Advanced parameter evolution graphs for audio effects:
//  - Full timeline view of all effects with parameter curves
//  - Individual segment parameter editing with keyframes
//  - Real-time parameter value display
//  - Bezier curve interpolation for smooth parameter changes
//
//  Uses Core Animation and Metal for smooth rendering
//
//  iOS 16+
//

import SwiftUI
import Charts

// MARK: - Effects Overview Graph

/// Shows all effects and their parameter evolution over the entire timeline
struct EffectsOverviewGraphView: View {
    @ObservedObject var timeline: AudioEffectTimeline
    let duration: TimeInterval
    let currentTime: TimeInterval
    let onSegmentSelected: ((AudioEffectRegion) -> Void)?

    @State private var selectedParameter: String?
    @State private var zoomScale: CGFloat = 1.0
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView

            // Main graph area
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(spacing: 0) {
                    // Time ruler
                    timeRuler
                        .frame(height: 24)

                    // Effects lanes
                    effectsLanesView
                        .frame(minHeight: 200)

                    // Parameter curves (if parameter selected)
                    if selectedParameter != nil {
                        parameterCurvesView
                            .frame(height: 120)
                    }
                }
                .frame(width: max(UIScreen.main.bounds.width - 32, duration * 50 * zoomScale))
            }

            // Legend
            legendView
        }
        .background(Color.black.opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Header

    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Graphe des Effets")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)

                Text("\(timeline.segments.count) segment\(timeline.segments.count > 1 ? "s" : "") • \(formatDuration(duration))")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.6))
            }

            Spacer()

            // Zoom controls
            HStack(spacing: 8) {
                Button {
                    withAnimation { zoomScale = max(0.5, zoomScale - 0.25) }
                } label: {
                    Image(systemName: "minus.magnifyingglass")
                        .foregroundColor(.white.opacity(0.7))
                }

                Text("\(Int(zoomScale * 100))%")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.white.opacity(0.5))

                Button {
                    withAnimation { zoomScale = min(3.0, zoomScale + 0.25) }
                } label: {
                    Image(systemName: "plus.magnifyingglass")
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.1))
            .clipShape(Capsule())
        }
        .padding()
    }

    // MARK: - Time Ruler

    private var timeRuler: some View {
        GeometryReader { geometry in
            let tickInterval: TimeInterval = duration > 60 ? 10 : (duration > 30 ? 5 : 2)
            let tickCount = Int(duration / tickInterval)

            ZStack(alignment: .leading) {
                // Background
                Rectangle()
                    .fill(Color.white.opacity(0.05))

                // Ticks
                ForEach(0...tickCount, id: \.self) { index in
                    let time = TimeInterval(index) * tickInterval
                    let x = (time / duration) * geometry.size.width

                    VStack(spacing: 1) {
                        Rectangle()
                            .fill(Color.white.opacity(0.3))
                            .frame(width: 1, height: index % 2 == 0 ? 10 : 6)

                        if index % 2 == 0 {
                            Text(formatTime(time))
                                .font(.system(size: 8, design: .monospaced))
                                .foregroundColor(.white.opacity(0.5))
                        }
                    }
                    .offset(x: x)
                }

                // Current time indicator
                Rectangle()
                    .fill(Color.yellow)
                    .frame(width: 2, height: 24)
                    .offset(x: (currentTime / duration) * geometry.size.width)
            }
        }
    }

    // MARK: - Effects Lanes

    private var effectsLanesView: some View {
        GeometryReader { geometry in
            let laneHeight: CGFloat = 50
            let effectTypes = uniqueEffectTypes()

            VStack(spacing: 0) {
                ForEach(Array(effectTypes.enumerated()), id: \.element) { index, effectType in
                    effectLane(
                        effectType: effectType,
                        laneIndex: index,
                        totalWidth: geometry.size.width,
                        laneHeight: laneHeight
                    )
                }

                Spacer()
            }
        }
    }

    private func effectLane(
        effectType: AudioEffectType,
        laneIndex: Int,
        totalWidth: CGFloat,
        laneHeight: CGFloat
    ) -> some View {
        let segments = timeline.segments.filter { $0.effectType == effectType }
        let definition = AudioEffectsCatalog.shared.effect(for: effectType)
        let color = definition?.color ?? .gray

        return HStack(spacing: 0) {
            // Lane label
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)

                Text(definition?.displayName ?? effectType.rawValue)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.8))
            }
            .frame(width: 100, alignment: .leading)
            .padding(.leading, 8)

            // Segments on this lane
            ZStack(alignment: .leading) {
                // Lane background
                Rectangle()
                    .fill(Color.white.opacity(laneIndex % 2 == 0 ? 0.03 : 0.05))

                // Segment blocks
                ForEach(segments) { segment in
                    effectSegmentBlock(
                        segment: segment,
                        totalWidth: totalWidth - 100,
                        laneHeight: laneHeight - 8,
                        color: color
                    )
                }
            }
        }
        .frame(height: laneHeight)
    }

    private func effectSegmentBlock(
        segment: AudioEffectRegion,
        totalWidth: CGFloat,
        laneHeight: CGFloat,
        color: Color
    ) -> some View {
        let startX = (segment.startTime / duration) * totalWidth
        let width = ((segment.endTime - segment.startTime) / duration) * totalWidth
        let isSelected = timeline.selectedSegmentId == segment.id
        let hasKeyframes = segment.hasParameterAnimation

        return ZStack {
            // Main block
            RoundedRectangle(cornerRadius: 6)
                .fill(color.opacity(isSelected ? 0.8 : 0.5))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(isSelected ? Color.white : Color.clear, lineWidth: 2)
                )

            // Parameter curve preview
            if hasKeyframes {
                parameterMiniCurve(segment: segment, width: width, height: laneHeight - 12)
                    .padding(6)
            }

            // Keyframe indicators
            if hasKeyframes {
                keyframeIndicators(segment: segment, width: width)
            }
        }
        .frame(width: max(20, width), height: laneHeight)
        .offset(x: startX)
        .onTapGesture {
            timeline.selectedSegmentId = segment.id
            onSegmentSelected?(segment)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    private func parameterMiniCurve(segment: AudioEffectRegion, width: CGFloat, height: CGFloat) -> some View {
        Canvas { context, size in
            guard let firstParam = segment.parameterConfigs.first(where: { !$0.keyframes.isEmpty }) else {
                return
            }

            var path = Path()
            let steps = max(10, Int(width / 2))

            for i in 0...steps {
                let t = Double(i) / Double(steps)
                let relativeTime = t * segment.duration
                let value = firstParam.valueAt(relativeTime: relativeTime)
                let x = t * size.width
                let y = (1 - value) * size.height

                if i == 0 {
                    path.move(to: CGPoint(x: x, y: y))
                } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }

            context.stroke(path, with: .color(.white.opacity(0.8)), lineWidth: 1.5)
        }
    }

    private func keyframeIndicators(segment: AudioEffectRegion, width: CGFloat) -> some View {
        let allKeyframes = segment.parameterConfigs.flatMap { config in
            config.keyframes.map { ($0.relativeTime, config.parameterName) }
        }

        return ZStack {
            ForEach(allKeyframes, id: \.0) { relativeTime, _ in
                let x = (relativeTime / segment.duration) * width

                Diamond()
                    .fill(Color.orange)
                    .frame(width: 6, height: 6)
                    .offset(x: x - width / 2, y: 0)
            }
        }
    }

    // MARK: - Parameter Curves

    private var parameterCurvesView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Courbes de paramètres")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.7))
                .padding(.horizontal)

            GeometryReader { geometry in
                parameterCurvesCanvas(width: geometry.size.width, height: geometry.size.height)
            }
        }
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.03))
    }

    private func parameterCurvesCanvas(width: CGFloat, height: CGFloat) -> some View {
        Canvas { context, size in
            // Draw curves for each segment's parameters
            for segment in timeline.segments {
                let startX = (segment.startTime / duration) * size.width
                let segmentWidth = (segment.duration / duration) * size.width
                let color = segment.effectDefinition?.color ?? .gray

                for (paramIndex, param) in segment.parameterConfigs.enumerated() where !param.keyframes.isEmpty {
                    var path = Path()
                    let steps = max(20, Int(segmentWidth / 3))

                    for i in 0...steps {
                        let t = Double(i) / Double(steps)
                        let relativeTime = t * segment.duration
                        let value = param.valueAt(relativeTime: relativeTime)
                        let x = startX + t * segmentWidth
                        let y = (1 - value) * size.height * 0.8 + size.height * 0.1

                        if i == 0 {
                            path.move(to: CGPoint(x: x, y: y))
                        } else {
                            path.addLine(to: CGPoint(x: x, y: y))
                        }
                    }

                    // Use different opacity for different parameters
                    let opacity = 0.9 - Double(paramIndex) * 0.2
                    context.stroke(path, with: .color(color.opacity(opacity)), lineWidth: 2)

                    // Draw keyframe diamonds
                    for keyframe in param.keyframes {
                        let x = startX + (keyframe.relativeTime / segment.duration) * segmentWidth
                        let y = (1 - keyframe.value) * size.height * 0.8 + size.height * 0.1

                        let diamondRect = CGRect(x: x - 5, y: y - 5, width: 10, height: 10)
                        let diamondPath = Diamond().path(in: diamondRect)
                        context.fill(diamondPath, with: .color(.orange))
                        context.stroke(diamondPath, with: .color(.white), lineWidth: 1)
                    }
                }
            }
        }
    }

    // MARK: - Legend

    private var legendView: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(uniqueEffectTypes(), id: \.self) { effectType in
                    let definition = AudioEffectsCatalog.shared.effect(for: effectType)
                    let count = timeline.segments.filter { $0.effectType == effectType }.count

                    HStack(spacing: 6) {
                        Circle()
                            .fill(definition?.color ?? .gray)
                            .frame(width: 10, height: 10)

                        Text(definition?.displayName ?? effectType.rawValue)
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.8))

                        Text("(\(count))")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.5))
                    }
                }

                // Keyframe indicator legend
                HStack(spacing: 4) {
                    Diamond()
                        .fill(Color.orange)
                        .frame(width: 8, height: 8)

                    Text("Keyframe")
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
            .padding(.horizontal)
        }
        .frame(height: 36)
        .background(Color.white.opacity(0.05))
    }

    // MARK: - Helpers

    private func uniqueEffectTypes() -> [AudioEffectType] {
        var seen = Set<AudioEffectType>()
        return timeline.segments.compactMap { segment in
            if seen.contains(segment.effectType) {
                return nil
            }
            seen.insert(segment.effectType)
            return segment.effectType
        }
    }

    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        if duration < 60 {
            return String(format: "%.1fs", duration)
        }
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Diamond Shape

struct Diamond: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.closeSubpath()
        return path
    }
}

// MARK: - Segment Parameter Detail View

/// Detailed parameter editing view for a single segment
/// Supports multi-curve display: tap a parameter to toggle its visibility
struct SegmentParameterDetailView: View {
    let segment: AudioEffectRegion
    @Binding var parameterConfigs: [EffectParameterConfig]
    let onUpdate: () -> Void

    /// Set of visible parameter indices (allows multiple curves simultaneously)
    @State private var visibleParamIndices: Set<Int> = [0]
    /// Currently selected parameter for keyframe editing
    @State private var editingParamIndex: Int = 0
    @State private var isAddingKeyframe = false
    @State private var newKeyframeTime: TimeInterval = 0
    @State private var newKeyframeValue: Double = 0.5

    /// The parameter currently being edited (for keyframe operations)
    private var editingParam: EffectParameterConfig? {
        guard editingParamIndex < parameterConfigs.count else { return nil }
        return parameterConfigs[editingParamIndex]
    }

    /// All visible parameters
    private var visibleParams: [(index: Int, config: EffectParameterConfig)] {
        visibleParamIndices.compactMap { index in
            guard index < parameterConfigs.count else { return nil }
            return (index, parameterConfigs[index])
        }.sorted { $0.index < $1.index }
    }

    /// Colors for different parameter curves
    private let parameterColors: [Color] = [
        .yellow, .cyan, .pink, .green, .orange, .purple, .mint, .indigo
    ]

    private func colorForParam(at index: Int) -> Color {
        parameterColors[index % parameterColors.count]
    }

    var body: some View {
        VStack(spacing: 16) {
            // Parameter selector (tap to toggle visibility)
            parameterSelector

            // Multi-curve graph (shows all visible parameters)
            if !visibleParams.isEmpty {
                multiCurveGraph
            }

            // Keyframe list for editing param
            if let param = editingParam, !param.keyframes.isEmpty {
                keyframeList(param: param)
            }

            // Add keyframe button
            addKeyframeSection
        }
        .padding()
        .background(Color.black.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Parameter Selector (Toggle Visibility)

    private var parameterSelector: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tap pour afficher/masquer • Double-tap pour éditer")
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.5))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(parameterConfigs.enumerated()), id: \.element.id) { index, param in
                        let isVisible = visibleParamIndices.contains(index)
                        let isEditing = editingParamIndex == index
                        let color = colorForParam(at: index)

                        Button {
                            // Single tap: toggle visibility
                            withAnimation(.spring(response: 0.3)) {
                                if visibleParamIndices.contains(index) {
                                    // Don't allow removing the last visible param
                                    if visibleParamIndices.count > 1 {
                                        visibleParamIndices.remove(index)
                                    }
                                } else {
                                    visibleParamIndices.insert(index)
                                }
                            }
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        } label: {
                            HStack(spacing: 6) {
                                // Visibility indicator
                                Circle()
                                    .fill(isVisible ? color : Color.clear)
                                    .overlay(
                                        Circle().stroke(color, lineWidth: 2)
                                    )
                                    .frame(width: 10, height: 10)

                                Text(param.displayName)
                                    .font(.system(size: 13, weight: isEditing ? .bold : (isVisible ? .semibold : .regular)))

                                if !param.keyframes.isEmpty {
                                    HStack(spacing: 2) {
                                        Diamond()
                                            .fill(Color.orange)
                                            .frame(width: 6, height: 6)

                                        Text("\(param.keyframes.count)")
                                            .font(.system(size: 10))
                                    }
                                }

                                // Editing indicator
                                if isEditing {
                                    Image(systemName: "pencil.circle.fill")
                                        .font(.system(size: 12))
                                        .foregroundColor(.orange)
                                }
                            }
                            .foregroundColor(isVisible ? .white : .white.opacity(0.4))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(isEditing ? color.opacity(0.5) :
                                          (isVisible ? color.opacity(0.25) : Color.white.opacity(0.08)))
                            )
                            .overlay(
                                Capsule()
                                    .stroke(isEditing ? color : Color.clear, lineWidth: 2)
                            )
                        }
                        .simultaneousGesture(
                            TapGesture(count: 2).onEnded {
                                // Double tap: set as editing parameter
                                withAnimation(.spring(response: 0.3)) {
                                    editingParamIndex = index
                                    // Also make sure it's visible
                                    visibleParamIndices.insert(index)
                                }
                                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            }
                        )
                    }
                }
            }
        }
    }

    // MARK: - Multi-Curve Graph

    private var multiCurveGraph: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Legend showing visible parameters
            HStack(spacing: 12) {
                ForEach(visibleParams, id: \.index) { index, param in
                    HStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(colorForParam(at: index))
                            .frame(width: 16, height: 3)

                        Text(param.displayName)
                            .font(.system(size: 10, weight: editingParamIndex == index ? .bold : .medium))
                            .foregroundColor(editingParamIndex == index ? .white : .white.opacity(0.7))
                    }
                    .onTapGesture {
                        editingParamIndex = index
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
                }
            }
            .padding(.horizontal, 4)

            // Graph canvas with all visible curves
            GeometryReader { geometry in
                ZStack {
                    // Grid
                    gridBackground(size: geometry.size)

                    // Draw curves for all visible parameters
                    ForEach(visibleParams, id: \.index) { index, param in
                        multiParameterCurve(
                            param: param,
                            size: geometry.size,
                            color: colorForParam(at: index),
                            isEditing: editingParamIndex == index
                        )
                    }

                    // Draw keyframes only for the editing parameter
                    if let param = editingParam {
                        keyframePoints(param: param, size: geometry.size)
                    }
                }
            }
            .frame(height: 150)
            .background(Color.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Time labels
            HStack {
                Text("0s")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.white.opacity(0.5))

                Spacer()

                Text(String(format: "%.1fs", segment.duration))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }

    /// Draws a single parameter curve (used in multi-curve view)
    private func multiParameterCurve(param: EffectParameterConfig, size: CGSize, color: Color, isEditing: Bool) -> some View {
        Canvas { context, canvasSize in
            var path = Path()
            let steps = 100

            for i in 0...steps {
                let t = Double(i) / Double(steps)
                let relativeTime = t * segment.duration
                let value = param.valueAt(relativeTime: relativeTime)
                let x = t * canvasSize.width
                let y = (1 - value) * canvasSize.height

                if i == 0 {
                    path.move(to: CGPoint(x: x, y: y))
                } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }

            // Editing curve is thicker and fully opaque
            let lineWidth: CGFloat = isEditing ? 3 : 2
            let opacity: Double = isEditing ? 1.0 : 0.6
            context.stroke(path, with: .color(color.opacity(opacity)), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
        }
    }

    // MARK: - Grid Background

    private func gridBackground(size: CGSize) -> some View {
        Canvas { context, canvasSize in
            // Horizontal lines
            for i in 0...4 {
                let y = canvasSize.height * CGFloat(i) / 4
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: canvasSize.width, y: y))
                context.stroke(path, with: .color(.white.opacity(0.1)), lineWidth: 1)
            }

            // Vertical lines
            for i in 0...10 {
                let x = canvasSize.width * CGFloat(i) / 10
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: canvasSize.height))
                context.stroke(path, with: .color(.white.opacity(0.05)), lineWidth: 1)
            }
        }
    }

    // MARK: - Keyframe Points

    private func keyframePoints(param: EffectParameterConfig, size: CGSize) -> some View {
        ForEach(param.keyframes) { keyframe in
            let x = (keyframe.relativeTime / segment.duration) * size.width
            let y = (1 - keyframe.value) * size.height

            ZStack {
                // Glow
                Circle()
                    .fill(Color.orange.opacity(0.3))
                    .frame(width: 20, height: 20)

                // Diamond
                Diamond()
                    .fill(Color.orange)
                    .frame(width: 12, height: 12)
                    .overlay(
                        Diamond()
                            .stroke(Color.white, lineWidth: 2)
                    )
            }
            .position(x: x, y: y)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        updateKeyframe(
                            keyframeId: keyframe.id,
                            paramIndex: editingParamIndex,
                            newTime: Double(value.location.x / size.width) * segment.duration,
                            newValue: 1.0 - Double(value.location.y / size.height)
                        )
                    }
            )
        }
    }

    // MARK: - Keyframe List

    private func keyframeList(param: EffectParameterConfig) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Keyframes")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.7))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(param.keyframes.sorted { $0.relativeTime < $1.relativeTime }) { keyframe in
                        keyframeChip(keyframe: keyframe, param: param)
                    }
                }
            }
        }
    }

    private func keyframeChip(keyframe: EffectParameterKeyframe, param: EffectParameterConfig) -> some View {
        let actualValue = param.minValue + keyframe.value * (param.maxValue - param.minValue)

        return HStack(spacing: 8) {
            Diamond()
                .fill(Color.orange)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text(String(format: "%.2fs", keyframe.relativeTime))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.white)

                Text(formatParamValue(actualValue, param: param))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.white.opacity(0.6))
            }

            Button {
                removeKeyframe(keyframe.id, paramIndex: editingParamIndex)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Add Keyframe

    private var addKeyframeSection: some View {
        VStack(spacing: 12) {
            if isAddingKeyframe {
                // Time slider
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Position")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.7))

                        Spacer()

                        Text(String(format: "%.2fs", newKeyframeTime))
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(.orange)
                    }

                    Slider(value: $newKeyframeTime, in: 0...segment.duration, step: 0.01)
                        .tint(.orange)
                }

                // Value slider
                if let param = editingParam {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text("Valeur")
                                .font(.system(size: 12))
                                .foregroundColor(.white.opacity(0.7))

                            Spacer()

                            let actualValue = param.minValue + newKeyframeValue * (param.maxValue - param.minValue)
                            Text(formatParamValue(actualValue, param: param))
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundColor(.orange)
                        }

                        Slider(value: $newKeyframeValue, in: 0...1, step: 0.01)
                            .tint(segment.effectDefinition?.color ?? .blue)
                    }
                }

                // Confirm/Cancel
                HStack(spacing: 12) {
                    Button {
                        isAddingKeyframe = false
                    } label: {
                        Text("Annuler")
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.7))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(Color.white.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }

                    Button {
                        addKeyframe()
                        isAddingKeyframe = false
                    } label: {
                        HStack(spacing: 6) {
                            Diamond()
                                .fill(Color.white)
                                .frame(width: 10, height: 10)
                            Text("Ajouter")
                                .font(.system(size: 14, weight: .medium))
                        }
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.orange)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            } else {
                Button {
                    newKeyframeTime = segment.duration / 2
                    newKeyframeValue = 0.5
                    isAddingKeyframe = true
                } label: {
                    HStack(spacing: 8) {
                        Diamond()
                            .fill(Color.orange)
                            .frame(width: 12, height: 12)
                        Text("Ajouter un keyframe")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(.orange)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.orange.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }

    // MARK: - Actions

    private func addKeyframe() {
        guard editingParamIndex < parameterConfigs.count else { return }

        let keyframe = EffectParameterKeyframe(
            parameterName: parameterConfigs[editingParamIndex].parameterName,
            relativeTime: newKeyframeTime,
            value: newKeyframeValue
        )

        parameterConfigs[editingParamIndex].keyframes.append(keyframe)
        parameterConfigs[editingParamIndex].keyframes.sort { $0.relativeTime < $1.relativeTime }
        onUpdate()

        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    private func updateKeyframe(keyframeId: UUID, paramIndex: Int, newTime: TimeInterval, newValue: Double) {
        guard paramIndex < parameterConfigs.count else { return }

        if let kfIndex = parameterConfigs[paramIndex].keyframes.firstIndex(where: { $0.id == keyframeId }) {
            parameterConfigs[paramIndex].keyframes[kfIndex].relativeTime = max(0, min(newTime, segment.duration))
            parameterConfigs[paramIndex].keyframes[kfIndex].value = max(0, min(newValue, 1))
            onUpdate()
        }
    }

    private func removeKeyframe(_ keyframeId: UUID, paramIndex: Int) {
        guard paramIndex < parameterConfigs.count else { return }
        parameterConfigs[paramIndex].keyframes.removeAll { $0.id == keyframeId }
        onUpdate()
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    // MARK: - Helpers

    private func formatParamValue(_ value: Double, param: EffectParameterConfig) -> String {
        if param.parameterName.contains("pitch") || param.parameterName.contains("Frequency") {
            return String(format: "%.0f", value)
        } else if param.parameterName.contains("rate") || param.parameterName.contains("Time") {
            return String(format: "%.2f", value)
        } else {
            return String(format: "%.0f%%", value)
        }
    }
}

// MARK: - Effects Count Button

/// Button that shows "N effets" and opens the graph view
struct EffectsCountButton: View {
    @ObservedObject var timeline: AudioEffectTimeline
    let duration: TimeInterval
    let currentTime: TimeInterval
    let onSegmentSelected: ((AudioEffectRegion) -> Void)?

    @State private var showGraphSheet = false

    var body: some View {
        Button {
            showGraphSheet = true
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "waveform.badge.plus")
                    .font(.system(size: 12))
                Text("\(timeline.segments.count) effet\(timeline.segments.count > 1 ? "s" : "")")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(.cyan)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.cyan.opacity(0.2)))
        }
        .sheet(isPresented: $showGraphSheet) {
            NavigationStack {
                EffectsOverviewGraphView(
                    timeline: timeline,
                    duration: duration,
                    currentTime: currentTime,
                    onSegmentSelected: onSegmentSelected
                )
                .navigationTitle("Graphe des Effets")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("OK") {
                            showGraphSheet = false
                        }
                    }
                }
            }
            .presentationDetents([.large])
        }
    }
}
