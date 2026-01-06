//
//  AudioEffectsTimelineView.swift
//  Meeshy
//
//  Display audio effects timeline with segments, parameter graphs, and effect tabs
//  Based on webapp: frontend/components/audio/SimpleAudioPlayer.tsx
//  iOS 16+
//
//  Data models are defined in: Core/Models/AudioEffectsModels.swift
//

import SwiftUI

// MARK: - AudioEffectsTimelineView

struct AudioEffectsTimelineView: View {
    let timeline: AudioEffectsTimeline
    let audioDuration: TimeInterval
    let currentTime: TimeInterval
    var onSeek: ((TimeInterval) -> Void)?

    /// Optional callback when user wants to edit a segment with advanced editor
    var onEditSegment: ((AudioEffectSegment) -> Void)?

    @State private var selectedTab: String = "overview"
    @State private var visibleParameters: Set<String> = []
    @State private var selectedSegmentForEdit: AudioEffectSegment?

    var body: some View {
        VStack(spacing: 0) {
            // Effect tabs
            effectTabs

            // Content based on selected tab
            TabView(selection: $selectedTab) {
                overviewTab
                    .tag("overview")

                ForEach(timeline.appliedEffects) { effect in
                    effectDetailTab(effect: effect)
                        .tag(effect.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
        }
    }

    // MARK: - Effect Tabs

    private var effectTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Overview tab
                tabButton(
                    id: "overview",
                    icon: "waveform.circle",
                    label: "Vue d'ensemble",
                    color: .meeshyPrimary
                )

                // Individual effect tabs
                ForEach(timeline.appliedEffects) { effect in
                    tabButton(
                        id: effect.id,
                        icon: effect.icon,
                        label: effect.name,
                        color: effect.swiftUIColor
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(Color(.systemGray6))
    }

    private func tabButton(id: String, icon: String, label: String, color: Color) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedTab = id
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))

                Text(label)
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(selectedTab == id ? .white : color)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(selectedTab == id ? color : color.opacity(0.15))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Overview Tab

    private var overviewTab: some View {
        VStack(spacing: 16) {
            // Timeline segments visualization
            timelineSegmentsView

            // Applied effects summary
            appliedEffectsSummary
        }
        .padding(16)
    }

    private var timelineSegmentsView: some View {
        let laneAssignments = computeLaneAssignments(for: timeline.segments)
        let laneCount = max(1, (laneAssignments.values.max() ?? 0) + 1)
        let laneHeight: CGFloat = 32
        let laneSpacing: CGFloat = 1
        let totalHeight = CGFloat(laneCount) * laneHeight + CGFloat(laneCount - 1) * laneSpacing + 16

        return VStack(alignment: .leading, spacing: 8) {
            Text("Timeline des effets")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)

            GeometryReader { geometry in
                ZStack(alignment: .topLeading) {
                    // Background tracks for each lane
                    ForEach(0..<laneCount, id: \.self) { lane in
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color(.systemGray5).opacity(0.5))
                            .frame(height: laneHeight)
                            .offset(y: CGFloat(lane) * (laneHeight + laneSpacing))
                    }

                    // Effect segments on their assigned lanes
                    ForEach(timeline.segments) { segment in
                        let lane = laneAssignments[segment.id] ?? 0
                        let startX = (segment.startTime / audioDuration) * geometry.size.width
                        let width = (segment.duration / audioDuration) * geometry.size.width
                        let effectColor = colorForEffect(segment.effectId)
                        let yOffset = CGFloat(lane) * (laneHeight + laneSpacing)

                        segmentView(
                            segment: segment,
                            color: effectColor,
                            width: max(8, width),
                            height: laneHeight,
                            startX: startX,
                            yOffset: yOffset
                        )
                    }

                    // Current time indicator (spans all lanes)
                    let playheadX = (currentTime / audioDuration) * geometry.size.width
                    Rectangle()
                        .fill(Color.meeshyPrimary)
                        .frame(width: 2, height: totalHeight)
                        .offset(x: playheadX - 1)
                        .shadow(color: .meeshyPrimary.opacity(0.5), radius: 4)
                }
            }
            .frame(height: totalHeight)
        }
    }

    private func segmentView(
        segment: AudioEffectSegment,
        color: Color,
        width: CGFloat,
        height: CGFloat,
        startX: CGFloat,
        yOffset: CGFloat
    ) -> some View {
        HStack(spacing: 4) {
            // Effect icon
            if let effect = timeline.appliedEffects.first(where: { $0.id == segment.effectId }) {
                Image(systemName: effect.icon)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white)
            }

            // Effect name (if enough width)
            if width > 60 {
                Text(segment.effectName)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            // Edit button (if enough width)
            if width > 40 && onEditSegment != nil {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.8))
            }
        }
        .padding(.horizontal, 6)
        .frame(width: width, height: height)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(
                    LinearGradient(
                        colors: [color, color.opacity(0.7)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(color.opacity(0.9), lineWidth: 1)
        )
        .shadow(color: color.opacity(0.3), radius: 2, y: 1)
        .offset(x: startX, y: yOffset)
        .onTapGesture {
            onSeek?(segment.startTime)
        }
        .onLongPressGesture {
            // Long press to edit
            onEditSegment?(segment)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
        .contextMenu {
            Button {
                onSeek?(segment.startTime)
            } label: {
                Label("Aller au début", systemImage: "play.circle")
            }

            if onEditSegment != nil {
                Button {
                    onEditSegment?(segment)
                } label: {
                    Label("Édition avancée", systemImage: "slider.horizontal.3")
                }
            }

            Button {
                onSeek?(segment.endTime)
            } label: {
                Label("Aller à la fin", systemImage: "forward.circle")
            }
        }
    }

    /// Compute lane assignments for segments to avoid overlaps
    private func computeLaneAssignments(for segments: [AudioEffectSegment]) -> [String: Int] {
        var assignments: [String: Int] = [:]
        var laneEndTimes: [Int: TimeInterval] = [:] // lane -> end time of last segment in that lane

        // Sort segments by start time
        let sortedSegments = segments.sorted { $0.startTime < $1.startTime }

        for segment in sortedSegments {
            // Find the first available lane where segment doesn't overlap
            var assignedLane = 0
            while true {
                let laneEndTime = laneEndTimes[assignedLane] ?? 0
                if segment.startTime >= laneEndTime {
                    // This lane is available
                    break
                }
                assignedLane += 1
            }

            // Assign segment to this lane
            assignments[segment.id] = assignedLane
            laneEndTimes[assignedLane] = segment.endTime
        }

        return assignments
    }

    private var appliedEffectsSummary: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Effets appliqués")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 12) {
                ForEach(timeline.appliedEffects) { effect in
                    effectSummaryCard(effect: effect)
                }
            }
        }
    }

    private func effectSummaryCard(effect: AudioEffectsTimeline.AppliedEffect) -> some View {
        HStack(spacing: 10) {
            // Effect icon
            ZStack {
                Circle()
                    .fill(effect.swiftUIColor.opacity(0.2))
                    .frame(width: 36, height: 36)

                Image(systemName: effect.icon)
                    .font(.system(size: 16))
                    .foregroundColor(effect.swiftUIColor)
            }

            // Effect info
            VStack(alignment: .leading, spacing: 2) {
                Text(effect.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.primary)

                Text(formatDuration(effect.totalDuration))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Segment count badge
            Text("\(effect.segmentCount)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(effect.swiftUIColor)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(effect.swiftUIColor.opacity(0.15))
                )
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(.systemGray5), lineWidth: 1)
        )
    }

    // MARK: - Effect Detail Tab

    private func effectDetailTab(effect: AudioEffectsTimeline.AppliedEffect) -> some View {
        VStack(spacing: 16) {
            // Effect header
            effectDetailHeader(effect: effect)

            // Parameter graphs
            parameterGraphsView(for: effect.id)

            // Segments list
            segmentsListView(for: effect.id)
        }
        .padding(16)
    }

    private func effectDetailHeader(effect: AudioEffectsTimeline.AppliedEffect) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(effect.swiftUIColor.opacity(0.2))
                    .frame(width: 48, height: 48)

                Image(systemName: effect.icon)
                    .font(.system(size: 22))
                    .foregroundColor(effect.swiftUIColor)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(effect.name)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.primary)

                Text("\(effect.segmentCount) segments - \(formatDuration(effect.totalDuration))")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
    }

    private func parameterGraphsView(for effectId: String) -> some View {
        let configs = timeline.configurations.filter { $0.effectId == effectId }
        let parameterNames = Set(configs.flatMap { $0.parameters.keys })

        return VStack(alignment: .leading, spacing: 12) {
            if !parameterNames.isEmpty {
                Text("Paramètres")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)

                // Parameter toggle buttons
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(parameterNames.sorted()), id: \.self) { name in
                            parameterToggleButton(name: name)
                        }
                    }
                }

                // Graph
                if !visibleParameters.isEmpty {
                    ParameterGraphView(
                        configurations: configs,
                        visibleParameters: visibleParameters,
                        duration: audioDuration,
                        currentTime: currentTime,
                        onSeek: onSeek
                    )
                    .frame(height: 120)
                }
            }
        }
    }

    private func parameterToggleButton(name: String) -> some View {
        let isVisible = visibleParameters.contains(name)
        let color = parameterColor(for: name)

        return Button {
            if isVisible {
                visibleParameters.remove(name)
            } else {
                visibleParameters.insert(name)
            }
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)

                Text(name.capitalized)
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(isVisible ? .white : .primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(isVisible ? color : Color(.systemGray5))
            )
        }
        .buttonStyle(.plain)
    }

    private func segmentsListView(for effectId: String) -> some View {
        let segments = timeline.segments.filter { $0.effectId == effectId }

        return VStack(alignment: .leading, spacing: 8) {
            Text("Segments")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)

            ForEach(segments) { segment in
                HStack {
                    Text(formatTime(segment.startTime))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)

                    Rectangle()
                        .fill(Color(.systemGray4))
                        .frame(width: 20, height: 1)

                    Text(formatTime(segment.endTime))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)

                    Spacer()

                    Text(formatDuration(segment.duration))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)

                    Button {
                        onSeek?(segment.startTime)
                    } label: {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.meeshyPrimary)
                    }
                }
                .padding(.vertical, 6)
            }
        }
    }

    // MARK: - Helpers

    private func colorForEffect(_ effectId: String) -> Color {
        timeline.appliedEffects.first { $0.id == effectId }?.swiftUIColor ?? .meeshyPrimary
    }

    private func parameterColor(for name: String) -> Color {
        let colors: [Color] = [.blue, .green, .orange, .purple, .red, .cyan]
        let index = abs(name.hashValue) % colors.count
        return colors[index]
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        if minutes > 0 {
            return String(format: "%d:%02d", minutes, secs)
        }
        return String(format: "%ds", secs)
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}

// MARK: - Parameter Graph View

struct ParameterGraphView: View {
    let configurations: [AudioEffectConfiguration]
    let visibleParameters: Set<String>
    let duration: TimeInterval
    let currentTime: TimeInterval
    var onSeek: ((TimeInterval) -> Void)?

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Grid lines
                gridLines(in: geometry.size)

                // Parameter curves
                ForEach(Array(visibleParameters.sorted()), id: \.self) { paramName in
                    parameterCurve(
                        for: paramName,
                        in: geometry.size
                    )
                }

                // Current time indicator
                let playheadX = CGFloat(currentTime / duration) * geometry.size.width
                Rectangle()
                    .fill(Color.meeshyPrimary)
                    .frame(width: 2, height: geometry.size.height)
                    .offset(x: playheadX - geometry.size.width / 2)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        let progress = value.location.x / geometry.size.width
                        let time = duration * Double(max(0, min(1, progress)))
                        onSeek?(time)
                    }
            )
        }
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }

    private func gridLines(in size: CGSize) -> some View {
        Canvas { context, size in
            // Horizontal lines
            for i in 0...4 {
                let y = size.height * CGFloat(i) / 4
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(path, with: .color(.gray.opacity(0.2)), lineWidth: 1)
            }

            // Vertical lines (time markers)
            let timeMarkers = 5
            for i in 0...timeMarkers {
                let x = size.width * CGFloat(i) / CGFloat(timeMarkers)
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                context.stroke(path, with: .color(.gray.opacity(0.2)), lineWidth: 1)
            }
        }
    }

    private func parameterCurve(for paramName: String, in size: CGSize) -> some View {
        let color = parameterColor(for: paramName)
        let sortedConfigs = configurations
            .filter { $0.parameters[paramName] != nil }
            .sorted { $0.time < $1.time }

        return Canvas { context, size in
            guard sortedConfigs.count >= 2 else { return }

            var path = Path()
            var started = false

            for config in sortedConfigs {
                guard let value = config.parameters[paramName] else { continue }

                let x = CGFloat(config.time / duration) * size.width
                let y = size.height * (1 - CGFloat(value)) // Invert Y

                if !started {
                    path.move(to: CGPoint(x: x, y: y))
                    started = true
                } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }

            // Draw curve
            context.stroke(
                path,
                with: .color(color),
                style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)
            )

            // Draw points
            for config in sortedConfigs {
                guard let value = config.parameters[paramName] else { continue }

                let x = CGFloat(config.time / duration) * size.width
                let y = size.height * (1 - CGFloat(value))

                let circle = Path(ellipseIn: CGRect(x: x - 4, y: y - 4, width: 8, height: 8))
                context.fill(circle, with: .color(color))
                context.stroke(circle, with: .color(.white), lineWidth: 1.5)
            }
        }
    }

    private func parameterColor(for name: String) -> Color {
        let colors: [Color] = [.blue, .green, .orange, .purple, .red, .cyan]
        let index = abs(name.hashValue) % colors.count
        return colors[index]
    }
}

// MARK: - Recording Timeline View (Microsecond Precision)

/// Enhanced timeline view for AudioEffectsRecordingTimeline with microsecond precision
struct RecordingTimelineView: View {
    let recordingTimeline: AudioEffectsRecordingTimeline
    let audioDuration: TimeInterval
    let currentTime: TimeInterval
    var onSeek: ((TimeInterval) -> Void)?

    @State private var selectedEffect: String?
    @State private var hoveredSegment: UUID?

    var body: some View {
        VStack(spacing: 16) {
            // Timeline header with stats
            timelineHeader

            // Main timeline visualization
            mainTimelineView

            // Effect segments with parameter graphs
            segmentGraphsView

            // Event log (collapsible)
            eventLogView
        }
        .padding(16)
    }

    // MARK: - Header

    private var timelineHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Effects Timeline")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.primary)

                HStack(spacing: 12) {
                    Label("\(recordingTimeline.events.count) events", systemImage: "list.bullet")
                    Label(formatDuration(recordingTimeline.durationSeconds), systemImage: "clock")
                    Label("\(recordingTimeline.allUsedEffects.count) effects", systemImage: "waveform")
                }
                .font(.system(size: 12))
                .foregroundColor(.secondary)
            }

            Spacer()

            // Precision indicator
            VStack(alignment: .trailing, spacing: 2) {
                Text("Precision")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.secondary)
                Text("\u{00B5}s")  // Greek letter mu for microseconds
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundColor(.green)
            }
        }
    }

    // MARK: - Main Timeline

    private var mainTimelineView: some View {
        let segments = recordingTimeline.getSegmentsWithConfigurations()
        let laneAssignments = computeRecordingLaneAssignments(for: segments)
        let laneCount = max(1, (laneAssignments.values.max() ?? 0) + 1)
        let laneHeight: CGFloat = 36
        let laneSpacing: CGFloat = 4
        let totalHeight = CGFloat(laneCount) * laneHeight + CGFloat(laneCount - 1) * laneSpacing + 12

        return VStack(alignment: .leading, spacing: 8) {
            Text("Timeline")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)

            GeometryReader { geometry in
                ZStack(alignment: .topLeading) {
                    // Background tracks for each lane
                    ForEach(0..<laneCount, id: \.self) { lane in
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color(.systemGray6).opacity(0.6))
                            .frame(height: laneHeight)
                            .offset(y: CGFloat(lane) * (laneHeight + laneSpacing))
                    }

                    // Effect segments on their assigned lanes
                    ForEach(segments) { segment in
                        let lane = laneAssignments[segment.id] ?? 0
                        let startX = (segment.startSeconds / audioDuration) * geometry.size.width
                        let width = (segment.durationSeconds / audioDuration) * geometry.size.width
                        let segmentColor = Color(hex: segment.color) ?? .meeshyPrimary
                        let yOffset = CGFloat(lane) * (laneHeight + laneSpacing)

                        segmentBlock(
                            segment: segment,
                            color: segmentColor,
                            x: startX,
                            width: width,
                            height: laneHeight,
                            yOffset: yOffset
                        )
                    }

                    // Current time playhead (spans all lanes)
                    let playheadX = (currentTime / audioDuration) * geometry.size.width
                    playheadIndicator(at: playheadX, height: totalHeight)
                }
            }
            .frame(height: totalHeight)
        }
    }

    /// Compute lane assignments for recording segments to avoid overlaps
    private func computeRecordingLaneAssignments(for segments: [EffectSegmentWithConfig]) -> [UUID: Int] {
        var assignments: [UUID: Int] = [:]
        var laneEndTimes: [Int: TimeInterval] = [:]

        let sortedSegments = segments.sorted { $0.startSeconds < $1.startSeconds }

        for segment in sortedSegments {
            var assignedLane = 0
            while true {
                let laneEndTime = laneEndTimes[assignedLane] ?? 0
                if segment.startSeconds >= laneEndTime {
                    break
                }
                assignedLane += 1
            }

            assignments[segment.id] = assignedLane
            laneEndTimes[assignedLane] = segment.endSeconds
        }

        return assignments
    }

    private func segmentBlock(
        segment: EffectSegmentWithConfig,
        color: Color,
        x: Double,
        width: Double,
        height: CGFloat,
        yOffset: CGFloat = 0
    ) -> some View {
        HStack(spacing: 4) {
            Image(systemName: segment.icon)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white)

            if width > 50 {
                Text(segment.effectType.capitalized)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(1)
            }
        }
        .frame(width: max(8, width), height: height)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(
                    LinearGradient(
                        colors: [color.opacity(0.9), color.opacity(0.7)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(color, lineWidth: hoveredSegment == segment.id ? 2 : 1)
        )
        .shadow(color: color.opacity(0.3), radius: 2, y: 1)
        .offset(x: x, y: yOffset)
        .onTapGesture {
            selectedEffect = segment.effectType
            onSeek?(segment.startSeconds)
        }
        .onHover { isHovered in
            hoveredSegment = isHovered ? segment.id : nil
        }
    }

    private func playheadIndicator(at x: Double, height: CGFloat) -> some View {
        ZStack {
            // Line
            Rectangle()
                .fill(Color.meeshyPrimary)
                .frame(width: 2, height: height)
                .offset(x: x - 1)

            // Top triangle
            Triangle()
                .fill(Color.meeshyPrimary)
                .frame(width: 10, height: 8)
                .rotationEffect(.degrees(180))
                .offset(x: x - 5, y: -height / 2 - 4)
        }
        .shadow(color: .meeshyPrimary.opacity(0.5), radius: 4)
    }

    // MARK: - Segment Graphs

    private var segmentGraphsView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Parameter Graphs")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)

            let usedEffects = recordingTimeline.allUsedEffects
            ForEach(usedEffects, id: \.self) { effectType in
                effectParameterGraph(for: effectType)
            }
        }
    }

    private func effectParameterGraph(for effectType: String) -> some View {
        let graphs = recordingTimeline.generateAllParameterGraphs(for: effectType)

        return VStack(alignment: .leading, spacing: 8) {
            // Effect header
            HStack {
                Image(systemName: iconFor(effectType: effectType))
                    .foregroundColor(colorFor(effectType: effectType))
                Text(effectType.capitalized)
                    .font(.system(size: 13, weight: .medium))
                Spacer()
            }

            // Parameter graphs
            if !graphs.isEmpty {
                GeometryReader { geometry in
                    ZStack {
                        // Background grid
                        graphGrid(size: geometry.size)

                        // Parameter curves
                        ForEach(Array(graphs.keys.sorted()), id: \.self) { paramName in
                            if let points = graphs[paramName], !points.isEmpty {
                                parameterCurvePath(
                                    points: points,
                                    paramName: paramName,
                                    size: geometry.size
                                )
                            }
                        }

                        // Playhead
                        let playheadX = (currentTime / audioDuration) * geometry.size.width
                        Rectangle()
                            .fill(Color.meeshyPrimary.opacity(0.8))
                            .frame(width: 1.5, height: geometry.size.height)
                            .offset(x: playheadX - geometry.size.width / 2)
                    }
                }
                .frame(height: 80)
                .background(Color(.systemGray6).opacity(0.5))
                .cornerRadius(8)

                // Parameter legend
                parameterLegend(paramNames: Array(graphs.keys.sorted()))
            } else {
                Text("No parameter changes")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(height: 40)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
        )
    }

    private func graphGrid(size: CGSize) -> some View {
        Canvas { context, size in
            // Horizontal lines at 25%, 50%, 75%
            for i in 1...3 {
                let y = size.height * CGFloat(i) / 4
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(path, with: .color(.gray.opacity(0.15)), lineWidth: 1)
            }
        }
    }

    private func parameterCurvePath(
        points: [ParameterGraphPoint],
        paramName: String,
        size: CGSize
    ) -> some View {
        let color = parameterColor(for: paramName)
        let durationMs = recordingTimeline.duration

        return Canvas { context, size in
            var path = Path()
            var started = false

            for point in points {
                let x = CGFloat(point.timestamp) / CGFloat(durationMs) * size.width
                let normalizedValue = min(1.0, max(0.0, point.value))
                let y = size.height * (1 - CGFloat(normalizedValue))

                if !started {
                    path.move(to: CGPoint(x: x, y: y))
                    started = true
                } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }

            // Stroke the curve
            context.stroke(
                path,
                with: .color(color),
                style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)
            )

            // Fill area under curve
            var fillPath = path
            if let lastPoint = points.last {
                let lastX = CGFloat(lastPoint.timestamp) / CGFloat(durationMs) * size.width
                fillPath.addLine(to: CGPoint(x: lastX, y: size.height))
            }
            if let firstPoint = points.first {
                let firstX = CGFloat(firstPoint.timestamp) / CGFloat(durationMs) * size.width
                fillPath.addLine(to: CGPoint(x: firstX, y: size.height))
            }
            fillPath.closeSubpath()

            context.fill(fillPath, with: .color(color.opacity(0.1)))
        }
    }

    private func parameterLegend(paramNames: [String]) -> some View {
        HStack(spacing: 12) {
            ForEach(paramNames, id: \.self) { name in
                HStack(spacing: 4) {
                    Circle()
                        .fill(parameterColor(for: name))
                        .frame(width: 8, height: 8)
                    Text(name.capitalized)
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    // MARK: - Event Log

    private var eventLogView: some View {
        DisclosureGroup {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    ForEach(recordingTimeline.events) { event in
                        eventRow(event: event)
                    }
                }
            }
            .frame(maxHeight: 200)
        } label: {
            HStack {
                Image(systemName: "list.bullet.rectangle")
                Text("Event Log (\(recordingTimeline.events.count))")
                    .font(.system(size: 14, weight: .medium))
            }
        }
    }

    private func eventRow(event: AudioEffectEvent) -> some View {
        HStack(spacing: 8) {
            // Timestamp
            Text(formatMilliseconds(event.timestamp))
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.secondary)
                .frame(width: 80, alignment: .trailing)

            // Action badge
            Text(event.action.rawValue.uppercased())
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(actionColor(event.action))
                )

            // Effect type
            Text(event.effectType)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.primary)

            Spacer()

            // Params indicator
            if event.params != nil {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color(.systemGray6).opacity(0.5))
        )
    }

    // MARK: - Helpers

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        let ms = Int((seconds.truncatingRemainder(dividingBy: 1)) * 1000)
        if minutes > 0 {
            return String(format: "%d:%02d.%03d", minutes, secs, ms)
        }
        return String(format: "%d.%03ds", secs, ms)
    }

    private func formatMilliseconds(_ ms: Int) -> String {
        let totalSeconds = ms / 1000
        let minutes = totalSeconds / 60
        let secs = totalSeconds % 60
        let millis = ms % 1000
        return String(format: "%d:%02d.%03d", minutes, secs, millis)
    }

    private func iconFor(effectType: String) -> String {
        switch effectType.lowercased() {
        case "vocoder", "voice-coder": return "pianokeys"
        case "baby_voice", "baby-voice", "babyvoice": return "face.smiling"
        case "demonic", "demon": return "flame.fill"
        case "echo": return "waveform.badge.plus"
        case "reverb": return "waveform.path"
        case "robot": return "cpu"
        case "deep": return "waveform.badge.minus"
        case "chipmunk": return "hare"
        default: return "waveform"
        }
    }

    private func colorFor(effectType: String) -> Color {
        switch effectType.lowercased() {
        case "vocoder", "voice-coder": return .purple
        case "baby_voice", "baby-voice", "babyvoice": return .pink
        case "demonic", "demon": return .red
        case "echo": return .blue
        case "reverb": return .teal
        case "robot": return .cyan
        case "deep": return .indigo
        case "chipmunk": return .orange
        default: return .meeshyPrimary
        }
    }

    private func parameterColor(for name: String) -> Color {
        let colors: [Color] = [.blue, .green, .orange, .purple, .red, .cyan, .pink, .yellow]
        let index = abs(name.hashValue) % colors.count
        return colors[index]
    }

    private func actionColor(_ action: AudioEffectAction) -> Color {
        switch action {
        case .activate: return .green
        case .deactivate: return .red
        case .update: return .orange
        }
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

#Preview("Audio Effects Timeline") {
    let sampleTimeline = AudioEffectsTimeline(
        segments: [
            AudioEffectSegment(effectId: "reverb", startTime: 0, endTime: 5, effectName: "Reverb"),
            AudioEffectSegment(effectId: "echo", startTime: 3, endTime: 8, effectName: "Echo"),
            AudioEffectSegment(effectId: "reverb", startTime: 10, endTime: 15, effectName: "Reverb"),
        ],
        configurations: [
            AudioEffectConfiguration(effectId: "reverb", effectName: "Reverb", time: 0, parameters: ["mix": 0.3, "decay": 0.5]),
            AudioEffectConfiguration(effectId: "reverb", effectName: "Reverb", time: 2, parameters: ["mix": 0.6, "decay": 0.7]),
            AudioEffectConfiguration(effectId: "reverb", effectName: "Reverb", time: 5, parameters: ["mix": 0.4, "decay": 0.5]),
            AudioEffectConfiguration(effectId: "echo", effectName: "Echo", time: 3, parameters: ["delay": 0.2, "feedback": 0.3]),
            AudioEffectConfiguration(effectId: "echo", effectName: "Echo", time: 6, parameters: ["delay": 0.4, "feedback": 0.5]),
        ],
        appliedEffects: [
            AudioEffectsTimeline.AppliedEffect(
                id: "reverb",
                name: "Reverb",
                icon: "waveform.path.ecg.rectangle",
                color: "#6366f1",
                totalDuration: 10,
                segmentCount: 2
            ),
            AudioEffectsTimeline.AppliedEffect(
                id: "echo",
                name: "Echo",
                icon: "speaker.wave.3",
                color: "#10b981",
                totalDuration: 5,
                segmentCount: 1
            ),
        ]
    )

    return AudioEffectsTimelineView(
        timeline: sampleTimeline,
        audioDuration: 20,
        currentTime: 7
    )
    .frame(height: 400)
    .padding()
}
