//
//  AudioEffectRegion.swift
//  Meeshy
//
//  Model for tracking audio effect segments on a timeline.
//  Each segment represents an effect applied during a specific time range.
//
//  iOS 16+
//

import Foundation
import SwiftUI

// MARK: - Effect Parameter Keyframe

/// Represents a parameter value at a specific time within a segment
struct EffectParameterKeyframe: Identifiable, Codable, Hashable {
    let id: UUID
    let parameterName: String
    var relativeTime: TimeInterval  // Time relative to segment start (0 = segment start)
    var value: Double               // Normalized value 0.0 to 1.0

    init(
        id: UUID = UUID(),
        parameterName: String,
        relativeTime: TimeInterval,
        value: Double
    ) {
        self.id = id
        self.parameterName = parameterName
        self.relativeTime = relativeTime
        self.value = max(0, min(1, value))  // Clamp to 0-1
    }
}

// MARK: - Effect Parameter Configuration

/// Configuration for a specific effect parameter with keyframes
struct EffectParameterConfig: Identifiable, Codable, Hashable {
    let id: UUID
    let parameterName: String
    let displayName: String
    let minValue: Double
    let maxValue: Double
    let defaultValue: Double
    var keyframes: [EffectParameterKeyframe]

    init(
        id: UUID = UUID(),
        parameterName: String,
        displayName: String,
        minValue: Double = 0,
        maxValue: Double = 1,
        defaultValue: Double = 0.5,
        keyframes: [EffectParameterKeyframe] = []
    ) {
        self.id = id
        self.parameterName = parameterName
        self.displayName = displayName
        self.minValue = minValue
        self.maxValue = maxValue
        self.defaultValue = defaultValue
        self.keyframes = keyframes
    }

    /// Get interpolated value at a relative time
    func valueAt(relativeTime: TimeInterval) -> Double {
        // If no keyframes, return default
        guard !keyframes.isEmpty else { return defaultValue }

        // Sort keyframes by time
        let sorted = keyframes.sorted { $0.relativeTime < $1.relativeTime }

        // If before first keyframe, return first value
        if relativeTime <= sorted.first!.relativeTime {
            return sorted.first!.value
        }

        // If after last keyframe, return last value
        if relativeTime >= sorted.last!.relativeTime {
            return sorted.last!.value
        }

        // Find surrounding keyframes and interpolate
        for i in 0..<(sorted.count - 1) {
            let current = sorted[i]
            let next = sorted[i + 1]

            if relativeTime >= current.relativeTime && relativeTime <= next.relativeTime {
                // Linear interpolation
                let t = (relativeTime - current.relativeTime) / (next.relativeTime - current.relativeTime)
                return current.value + (next.value - current.value) * t
            }
        }

        return defaultValue
    }

    /// Convert normalized value to actual parameter value
    func actualValue(at relativeTime: TimeInterval) -> Double {
        let normalized = valueAt(relativeTime: relativeTime)
        return minValue + normalized * (maxValue - minValue)
    }
}

// MARK: - Audio Effect Region

/// Represents an audio effect applied to a specific time region
/// This is the enhanced model used for multi-effect editing with AudioEffectType
struct AudioEffectRegion: Identifiable, Codable, Hashable {
    let id: UUID
    let effectType: AudioEffectType
    var startTime: TimeInterval
    var endTime: TimeInterval
    let createdAt: Date

    /// Parameter configurations with keyframes for this segment
    var parameterConfigs: [EffectParameterConfig]

    // MARK: - Computed Properties

    var duration: TimeInterval {
        endTime - startTime
    }

    /// Position as percentage of total duration (0-1)
    func startPosition(totalDuration: TimeInterval) -> Double {
        guard totalDuration > 0 else { return 0 }
        return startTime / totalDuration
    }

    func endPosition(totalDuration: TimeInterval) -> Double {
        guard totalDuration > 0 else { return 1 }
        return endTime / totalDuration
    }

    /// Get the effect definition from catalog
    var effectDefinition: AudioEffectDefinition? {
        AudioEffectsCatalog.shared.effect(for: effectType)
    }

    /// Check if this segment has parameter keyframes
    var hasParameterAnimation: Bool {
        parameterConfigs.contains { !$0.keyframes.isEmpty }
    }

    // MARK: - Init

    init(
        id: UUID = UUID(),
        effectType: AudioEffectType,
        startTime: TimeInterval,
        endTime: TimeInterval,
        createdAt: Date = Date(),
        parameterConfigs: [EffectParameterConfig] = []
    ) {
        self.id = id
        self.effectType = effectType
        self.startTime = startTime
        self.endTime = endTime
        self.createdAt = createdAt
        self.parameterConfigs = parameterConfigs.isEmpty ? Self.defaultParameters(for: effectType) : parameterConfigs
    }

    // MARK: - Parameter Access

    /// Get parameter value at a specific absolute time
    func parameterValue(name: String, at absoluteTime: TimeInterval) -> Double? {
        let relativeTime = absoluteTime - startTime
        guard relativeTime >= 0 && relativeTime <= duration else { return nil }

        return parameterConfigs.first { $0.parameterName == name }?.actualValue(at: relativeTime)
    }

    /// Get all parameter values at a specific absolute time
    func allParameterValues(at absoluteTime: TimeInterval) -> [String: Double] {
        let relativeTime = absoluteTime - startTime
        guard relativeTime >= 0 && relativeTime <= duration else { return [:] }

        var values: [String: Double] = [:]
        for config in parameterConfigs {
            values[config.parameterName] = config.actualValue(at: relativeTime)
        }
        return values
    }

    /// Add a keyframe to a parameter
    mutating func addKeyframe(parameterName: String, relativeTime: TimeInterval, value: Double) {
        guard let index = parameterConfigs.firstIndex(where: { $0.parameterName == parameterName }) else {
            return
        }

        let keyframe = EffectParameterKeyframe(
            parameterName: parameterName,
            relativeTime: relativeTime,
            value: value
        )
        parameterConfigs[index].keyframes.append(keyframe)
        parameterConfigs[index].keyframes.sort { $0.relativeTime < $1.relativeTime }
    }

    /// Remove a keyframe
    mutating func removeKeyframe(_ keyframeId: UUID, fromParameter parameterName: String) {
        guard let index = parameterConfigs.firstIndex(where: { $0.parameterName == parameterName }) else {
            return
        }
        parameterConfigs[index].keyframes.removeAll { $0.id == keyframeId }
    }

    // MARK: - Default Parameters

    /// Get default parameter configurations for an effect type
    static func defaultParameters(for effectType: AudioEffectType) -> [EffectParameterConfig] {
        switch effectType {
        case .normal:
            return []

        case .deep, .chipmunk, .babyVoice:
            return [
                EffectParameterConfig(
                    parameterName: "pitch",
                    displayName: "Hauteur",
                    minValue: effectType == .deep ? -1200 : 0,
                    maxValue: effectType == .deep ? 0 : 1200,
                    defaultValue: effectType == .deep ? -600 : (effectType == .chipmunk ? 1000 : 700)
                ),
                EffectParameterConfig(
                    parameterName: "rate",
                    displayName: "Vitesse",
                    minValue: 0.5,
                    maxValue: 2.0,
                    defaultValue: effectType == .babyVoice ? 0.95 : 1.0
                )
            ]

        case .robot, .vocoder:
            return [
                EffectParameterConfig(
                    parameterName: "wetDryMix",
                    displayName: "Intensité",
                    minValue: 0,
                    maxValue: 100,
                    defaultValue: effectType == .robot ? 30 : 50
                ),
                EffectParameterConfig(
                    parameterName: "pitch",
                    displayName: "Hauteur",
                    minValue: -500,
                    maxValue: 500,
                    defaultValue: effectType == .robot ? -100 : 0
                )
            ]

        case .demonic, .angel:
            return [
                EffectParameterConfig(
                    parameterName: "pitch",
                    displayName: "Hauteur",
                    minValue: -1200,
                    maxValue: 600,
                    defaultValue: effectType == .demonic ? -1000 : 300
                ),
                EffectParameterConfig(
                    parameterName: "reverbMix",
                    displayName: "Réverb",
                    minValue: 0,
                    maxValue: 100,
                    defaultValue: effectType == .demonic ? 40 : 60
                ),
                EffectParameterConfig(
                    parameterName: "distortion",
                    displayName: "Distorsion",
                    minValue: 0,
                    maxValue: 100,
                    defaultValue: effectType == .demonic ? 25 : 0
                )
            ]

        case .echo:
            return [
                EffectParameterConfig(
                    parameterName: "delayTime",
                    displayName: "Délai",
                    minValue: 0.05,
                    maxValue: 1.0,
                    defaultValue: 0.3
                ),
                EffectParameterConfig(
                    parameterName: "feedback",
                    displayName: "Feedback",
                    minValue: 0,
                    maxValue: 100,
                    defaultValue: 50
                ),
                EffectParameterConfig(
                    parameterName: "wetDryMix",
                    displayName: "Mix",
                    minValue: 0,
                    maxValue: 100,
                    defaultValue: 40
                )
            ]

        case .reverb, .stadium, .cave:
            return [
                EffectParameterConfig(
                    parameterName: "wetDryMix",
                    displayName: "Intensité",
                    minValue: 0,
                    maxValue: 100,
                    defaultValue: effectType == .reverb ? 50 : (effectType == .stadium ? 70 : 80)
                )
            ]

        case .telephone, .radio, .megaphone:
            return [
                EffectParameterConfig(
                    parameterName: "wetDryMix",
                    displayName: "Intensité",
                    minValue: 0,
                    maxValue: 50,
                    defaultValue: effectType == .telephone ? 15 : (effectType == .radio ? 10 : 20)
                )
            ]

        case .underwater:
            return [
                EffectParameterConfig(
                    parameterName: "cutoffFrequency",
                    displayName: "Profondeur",
                    minValue: 200,
                    maxValue: 2000,
                    defaultValue: 800
                ),
                EffectParameterConfig(
                    parameterName: "reverbMix",
                    displayName: "Réverb",
                    minValue: 0,
                    maxValue: 100,
                    defaultValue: 40
                )
            ]

        case .whisper:
            return [
                EffectParameterConfig(
                    parameterName: "highShelfGain",
                    displayName: "Intensité",
                    minValue: 0,
                    maxValue: 10,
                    defaultValue: 4
                ),
                EffectParameterConfig(
                    parameterName: "reverbMix",
                    displayName: "Ambiance",
                    minValue: 0,
                    maxValue: 60,
                    defaultValue: 30
                )
            ]

        case .alien:
            return [
                EffectParameterConfig(
                    parameterName: "pitch",
                    displayName: "Hauteur",
                    minValue: 0,
                    maxValue: 800,
                    defaultValue: 400
                ),
                EffectParameterConfig(
                    parameterName: "rate",
                    displayName: "Vitesse",
                    minValue: 0.8,
                    maxValue: 1.5,
                    defaultValue: 1.1
                ),
                EffectParameterConfig(
                    parameterName: "wetDryMix",
                    displayName: "Distorsion",
                    minValue: 0,
                    maxValue: 100,
                    defaultValue: 35
                )
            ]
        }
    }

    // MARK: - Validation

    /// Check if this segment overlaps with another
    func overlaps(with other: AudioEffectRegion) -> Bool {
        // Segments overlap if one starts before the other ends
        return startTime < other.endTime && endTime > other.startTime
    }

    /// Check if a time point is within this segment
    func contains(time: TimeInterval) -> Bool {
        time >= startTime && time <= endTime
    }
}

// MARK: - Audio Effect Timeline

/// Manages multiple effect segments on an audio timeline
@MainActor
final class AudioEffectTimeline: ObservableObject {

    // MARK: - Published Properties

    @Published private(set) var segments: [AudioEffectRegion] = []
    @Published private(set) var totalDuration: TimeInterval = 0
    @Published var selectedSegmentId: UUID?

    // MARK: - History for Undo

    private var history: [[AudioEffectRegion]] = []
    private let maxHistoryCount = 20

    // MARK: - Init

    init(duration: TimeInterval = 0) {
        self.totalDuration = duration
    }

    // MARK: - Duration Management

    /// Set the total duration (used when loading audio)
    func setDuration(_ duration: TimeInterval) {
        self.totalDuration = duration
    }

    // MARK: - Segment Management

    /// Add a new effect segment
    func addSegment(effectType: AudioEffectType, startTime: TimeInterval, endTime: TimeInterval) {
        saveToHistory()

        let segment = AudioEffectRegion(
            effectType: effectType,
            startTime: max(0, startTime),
            endTime: min(endTime, totalDuration)
        )

        segments.append(segment)
        segments.sort { $0.startTime < $1.startTime }

        mediaLogger.info("[EffectTimeline] Added segment: \(effectType.rawValue) from \(startTime) to \(endTime)")
    }

    /// Add a new effect segment with custom parameter configurations
    func addSegmentWithParameters(
        effectType: AudioEffectType,
        startTime: TimeInterval,
        endTime: TimeInterval,
        parameterConfigs: [EffectParameterConfig]
    ) {
        saveToHistory()

        let segment = AudioEffectRegion(
            effectType: effectType,
            startTime: max(0, startTime),
            endTime: min(endTime, totalDuration),
            parameterConfigs: parameterConfigs
        )

        segments.append(segment)
        segments.sort { $0.startTime < $1.startTime }

        let hasAnimation = parameterConfigs.contains { !$0.keyframes.isEmpty }
        mediaLogger.info("[EffectTimeline] Added segment with parameters: \(effectType.rawValue) from \(startTime) to \(endTime), animated: \(hasAnimation)")
    }

    /// Get the segment at a specific time (returns first match)
    func segmentAt(time: TimeInterval) -> AudioEffectRegion? {
        segments.first { $0.contains(time: time) }
    }

    /// Get all parameter values for an effect at a specific time
    func parameterValuesAt(time: TimeInterval) -> [String: Double] {
        guard let segment = segmentAt(time: time) else { return [:] }
        return segment.allParameterValues(at: time)
    }

    /// Add effect at current position with default duration
    func addEffectAtPosition(_ position: Double, effectType: AudioEffectType, defaultDuration: TimeInterval = 2.0) {
        let startTime = position * totalDuration
        let endTime = min(startTime + defaultDuration, totalDuration)
        addSegment(effectType: effectType, startTime: startTime, endTime: endTime)
    }

    /// Remove a segment by ID
    func removeSegment(_ id: UUID) {
        saveToHistory()
        segments.removeAll { $0.id == id }

        if selectedSegmentId == id {
            selectedSegmentId = nil
        }

        mediaLogger.info("[EffectTimeline] Removed segment: \(id)")
    }

    /// Update segment boundaries
    /// - Parameters:
    ///   - id: Segment ID to update
    ///   - startTime: New start time (optional)
    ///   - endTime: New end time (optional)
    ///   - saveHistory: Whether to save to undo history (default true, set false for live dragging)
    func updateSegment(_ id: UUID, startTime: TimeInterval? = nil, endTime: TimeInterval? = nil, saveHistory: Bool = false) {
        if saveHistory {
            saveToHistory()
        }

        guard let index = segments.firstIndex(where: { $0.id == id }) else { return }

        if let start = startTime {
            segments[index].startTime = max(0, start)
        }
        if let end = endTime {
            segments[index].endTime = min(end, totalDuration)
        }

        // Ensure valid range
        if segments[index].startTime >= segments[index].endTime {
            segments[index].endTime = segments[index].startTime + 0.5
        }

        segments.sort { $0.startTime < $1.startTime }

        // Force SwiftUI to update (segments is @Published)
        objectWillChange.send()
    }

    /// Get all effects active at a specific time
    func effectsAt(time: TimeInterval) -> [AudioEffectType] {
        segments
            .filter { $0.contains(time: time) }
            .map { $0.effectType }
    }

    /// Get segments within a time range
    func segments(in range: ClosedRange<TimeInterval>) -> [AudioEffectRegion] {
        segments.filter { segment in
            segment.startTime <= range.upperBound && segment.endTime >= range.lowerBound
        }
    }

    /// Clear all segments
    func clearAll() {
        saveToHistory()
        segments.removeAll()
        selectedSegmentId = nil
    }

    // MARK: - Undo Support

    private func saveToHistory() {
        history.append(segments)
        if history.count > maxHistoryCount {
            history.removeFirst()
        }
    }

    func undo() {
        guard let previous = history.popLast() else { return }
        segments = previous
    }

    var canUndo: Bool {
        !history.isEmpty
    }

    // MARK: - Serialization

    func exportSegments() -> Data? {
        try? JSONEncoder().encode(segments)
    }

    func importSegments(from data: Data) {
        guard let imported = try? JSONDecoder().decode([AudioEffectRegion].self, from: data) else { return }
        saveToHistory()
        segments = imported
    }

    // MARK: - Copy

    /// Create a deep copy of this timeline
    func copy() -> AudioEffectTimeline {
        let copy = AudioEffectTimeline(duration: totalDuration)
        copy.segments = segments
        copy.selectedSegmentId = selectedSegmentId
        return copy
    }
}

// MARK: - Effect Segment View

/// Visual representation of an effect segment on the timeline
struct EffectSegmentView: View {
    let segment: AudioEffectRegion
    let totalDuration: TimeInterval
    let totalWidth: CGFloat
    let isSelected: Bool
    let onTap: () -> Void
    let onStartTimeChange: (TimeInterval) -> Void
    let onEndTimeChange: (TimeInterval) -> Void

    // Track drag state
    @State private var isDraggingStart = false
    @State private var isDraggingEnd = false
    @State private var dragStartOffset: CGFloat = 0

    private var segmentWidth: CGFloat {
        CGFloat(segment.duration / totalDuration) * totalWidth
    }

    private var segmentOffset: CGFloat {
        CGFloat(segment.startTime / totalDuration) * totalWidth
    }

    private var effectColor: Color {
        segment.effectDefinition?.color ?? .gray
    }

    // Minimum width for the segment
    private let minimumWidth: CGFloat = 20
    private let handleWidth: CGFloat = 8

    var body: some View {
        ZStack(alignment: .leading) {
            // Main segment body
            RoundedRectangle(cornerRadius: 4)
                .fill(effectColor.opacity(isSelected ? 0.9 : 0.7))
                .overlay(
                    HStack(spacing: 4) {
                        if segmentWidth > 50 {
                            Image(systemName: segment.effectDefinition?.icon ?? "waveform")
                                .font(.system(size: 10))
                                .foregroundColor(.white)
                        }
                        if segmentWidth > 100 {
                            Text(segment.effectDefinition?.displayName ?? "")
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.white)
                                .lineLimit(1)
                        }
                    }
                    .padding(.horizontal, handleWidth + 4)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(isSelected ? Color.white : Color.clear, lineWidth: 2)
                )
                .contentShape(Rectangle())
                .onTapGesture(perform: onTap)

            // Left resize handle
            resizeHandle(isLeft: true)
                .offset(x: 0)
                .gesture(
                    DragGesture(minimumDistance: 1)
                        .onChanged { value in
                            if !isDraggingStart {
                                isDraggingStart = true
                                dragStartOffset = value.startLocation.x
                            }

                            // Calculate new start time based on drag
                            let deltaX = value.location.x - dragStartOffset
                            let deltaTime = (deltaX / totalWidth) * totalDuration
                            let newStartTime = max(0, segment.startTime + deltaTime)

                            // Ensure minimum duration
                            let minEndTime = newStartTime + (minimumWidth / totalWidth * totalDuration)
                            if segment.endTime > minEndTime {
                                onStartTimeChange(newStartTime)
                            }

                            UISelectionFeedbackGenerator().selectionChanged()
                        }
                        .onEnded { _ in
                            isDraggingStart = false
                            dragStartOffset = 0
                        }
                )

            // Right resize handle
            resizeHandle(isLeft: false)
                .offset(x: segmentWidth - handleWidth)
                .gesture(
                    DragGesture(minimumDistance: 1)
                        .onChanged { value in
                            if !isDraggingEnd {
                                isDraggingEnd = true
                                dragStartOffset = value.startLocation.x
                            }

                            // Calculate new end time based on drag
                            let deltaX = value.location.x - dragStartOffset
                            let deltaTime = (deltaX / totalWidth) * totalDuration
                            let newEndTime = min(totalDuration, segment.endTime + deltaTime)

                            // Ensure minimum duration
                            let maxStartTime = newEndTime - (minimumWidth / totalWidth * totalDuration)
                            if segment.startTime < maxStartTime {
                                onEndTimeChange(newEndTime)
                            }

                            UISelectionFeedbackGenerator().selectionChanged()
                        }
                        .onEnded { _ in
                            isDraggingEnd = false
                            dragStartOffset = 0
                        }
                )
        }
        .frame(width: max(minimumWidth, segmentWidth), height: 24)
        .offset(x: segmentOffset)
        .animation(.easeInOut(duration: 0.1), value: isSelected)
    }

    private func resizeHandle(isLeft: Bool) -> some View {
        ZStack {
            // Handle background
            Rectangle()
                .fill(effectColor.opacity(0.9))
                .frame(width: handleWidth)

            // Handle grip lines
            VStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 0.5)
                        .fill(Color.white.opacity(0.6))
                        .frame(width: 2, height: 4)
                }
            }
        }
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: isLeft ? 4 : 0,
                bottomLeadingRadius: isLeft ? 4 : 0,
                bottomTrailingRadius: isLeft ? 0 : 4,
                topTrailingRadius: isLeft ? 0 : 4
            )
        )
        .contentShape(Rectangle().size(width: handleWidth * 2, height: 24))
    }
}

// MARK: - Effect Segments Timeline View

/// Complete timeline view showing all effect segments
struct EffectsTimelineView: View {
    @ObservedObject var timeline: AudioEffectTimeline
    let height: CGFloat
    let onAddEffect: (Double) -> Void
    var onSegmentSelected: ((AudioEffectRegion) -> Void)?

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                // Background
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.white.opacity(0.05))

                // Time grid lines
                timeGridLines(width: geometry.size.width)

                // Effect segments
                ForEach(timeline.segments) { segment in
                    EffectSegmentView(
                        segment: segment,
                        totalDuration: timeline.totalDuration,
                        totalWidth: geometry.size.width,
                        isSelected: timeline.selectedSegmentId == segment.id,
                        onTap: {
                            timeline.selectedSegmentId = segment.id
                            onSegmentSelected?(segment)
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        },
                        onStartTimeChange: { newStartTime in
                            timeline.updateSegment(segment.id, startTime: newStartTime)
                        },
                        onEndTimeChange: { newEndTime in
                            timeline.updateSegment(segment.id, endTime: newEndTime)
                        }
                    )
                }

                // Add effect tap area (when no segment is at that position)
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        let position = location.x / geometry.size.width
                        // Check if tap is not on an existing segment
                        let time = position * timeline.totalDuration
                        if timeline.effectsAt(time: time).isEmpty {
                            onAddEffect(position)
                        }
                    }
            }
        }
        .frame(height: height)
    }

    private func timeGridLines(width: CGFloat) -> some View {
        let lineCount = max(1, Int(timeline.totalDuration / 5)) // Line every 5 seconds

        return ForEach(0..<lineCount, id: \.self) { index in
            let position = CGFloat(index + 1) / CGFloat(lineCount + 1) * width
            Rectangle()
                .fill(Color.white.opacity(0.1))
                .frame(width: 1)
                .offset(x: position)
        }
    }
}

// MARK: - Effect Segment Editor Sheet (DEPRECATED)

/// Bottom sheet for editing a selected effect segment
/// @available(*, deprecated, message: "Use AdvancedEffectEditorView instead")
struct EffectSegmentEditorSheet: View {
    @ObservedObject var timeline: AudioEffectTimeline
    let segment: AudioEffectRegion
    let onDismiss: () -> Void

    @State private var selectedEffectType: AudioEffectType
    @State private var showEffectPicker = false
    @State private var editedParameters: [EffectParameterConfig]
    @State private var selectedParameterIndex: Int? = nil
    @State private var showKeyframeEditor = false
    @State private var keyframeTime: TimeInterval = 0

    // Original values for cancel/revert
    private let originalStartTime: TimeInterval
    private let originalEndTime: TimeInterval
    private let originalEffectType: AudioEffectType
    private let originalParameters: [EffectParameterConfig]

    // Minimum segment duration
    private let minimumDuration: TimeInterval = 0.5

    // Real-time binding to segment start time
    private var currentStartTime: TimeInterval {
        timeline.segments.first(where: { $0.id == segment.id })?.startTime ?? segment.startTime
    }

    // Real-time binding to segment end time
    private var currentEndTime: TimeInterval {
        timeline.segments.first(where: { $0.id == segment.id })?.endTime ?? segment.endTime
    }

    init(timeline: AudioEffectTimeline, segment: AudioEffectRegion, onDismiss: @escaping () -> Void) {
        self.timeline = timeline
        self.segment = segment
        self.onDismiss = onDismiss

        // Store original values for cancel
        self.originalStartTime = segment.startTime
        self.originalEndTime = segment.endTime
        self.originalEffectType = segment.effectType
        self.originalParameters = segment.parameterConfigs

        self._selectedEffectType = State(initialValue: segment.effectType)
        self._editedParameters = State(initialValue: segment.parameterConfigs)
    }

    private var editedDuration: TimeInterval {
        max(0, currentEndTime - currentStartTime)
    }

    private var hasChanges: Bool {
        currentStartTime != originalStartTime ||
        currentEndTime != originalEndTime ||
        selectedEffectType != originalEffectType ||
        editedParameters != originalParameters
    }

    private var hasParameterAnimation: Bool {
        editedParameters.contains { !$0.keyframes.isEmpty }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Effect type selector
                    effectTypeSection

                    Divider()

                    // Time editing section
                    timeEditingSection

                    Divider()

                    // Duration display
                    durationSection

                    // Visual timeline preview
                    timelinePreviewSection

                    // Parameter configuration section (if effect has parameters)
                    if !editedParameters.isEmpty {
                        Divider()
                        parameterConfigurationSection
                    }

                    Spacer(minLength: 20)

                    // Delete button
                    deleteButton
                }
                .padding()
            }
            .navigationTitle("Éditer le segment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") {
                        // Revert to original values
                        if hasChanges {
                            timeline.updateSegment(segment.id, startTime: originalStartTime, endTime: originalEndTime)
                        }
                        onDismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        // Apply parameter changes if any
                        if editedParameters != originalParameters || selectedEffectType != originalEffectType {
                            applyChanges()
                        }
                        onDismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .sheet(isPresented: $showEffectPicker) {
            effectPickerSheet
        }
        .sheet(isPresented: $showKeyframeEditor) {
            keyframeEditorSheet
        }
        .onChange(of: selectedEffectType) { _, newType in
            // Update parameters when effect type changes
            if newType != segment.effectType {
                editedParameters = AudioEffectRegion.defaultParameters(for: newType)
            }
        }
    }

    // MARK: - Effect Type Section

    private var effectTypeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Type d'effet")
                .font(.headline)
                .foregroundColor(.primary)

            Button {
                showEffectPicker = true
            } label: {
                HStack(spacing: 12) {
                    // Effect icon
                    ZStack {
                        Circle()
                            .fill(segment.effectDefinition?.color.opacity(0.2) ?? Color.gray.opacity(0.2))
                            .frame(width: 44, height: 44)

                        Image(systemName: segment.effectDefinition?.icon ?? "waveform")
                            .font(.system(size: 20))
                            .foregroundColor(segment.effectDefinition?.color ?? .gray)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(AudioEffectsCatalog.shared.effect(for: selectedEffectType)?.displayName ?? "Normal")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.primary)

                        Text(AudioEffectsCatalog.shared.effect(for: selectedEffectType)?.description ?? "")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Time Editing Section

    private var timeEditingSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Position temporelle")
                .font(.headline)
                .foregroundColor(.primary)

            // Start time slider - updates timeline in real-time
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Début")
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    Spacer()

                    Text(formatTime(currentStartTime))
                        .font(.system(.body, design: .monospaced, weight: .medium))
                        .foregroundColor(.blue)
                }

                Slider(
                    value: Binding(
                        get: { currentStartTime },
                        set: { newValue in
                            // Update timeline directly for real-time sync
                            let clampedValue = max(0, min(newValue, currentEndTime - minimumDuration))
                            timeline.updateSegment(segment.id, startTime: clampedValue, endTime: nil)
                        }
                    ),
                    in: 0...max(0.1, currentEndTime - minimumDuration),
                    step: 0.1
                )
                .tint(.blue)

                // Fine adjustment buttons
                HStack(spacing: 12) {
                    fineAdjustButton(label: "-1s", adjustment: -1, isStart: true)
                    fineAdjustButton(label: "-0.1s", adjustment: -0.1, isStart: true)
                    Spacer()
                    fineAdjustButton(label: "+0.1s", adjustment: 0.1, isStart: true)
                    fineAdjustButton(label: "+1s", adjustment: 1, isStart: true)
                }
            }

            // End time slider - updates timeline in real-time
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Fin")
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    Spacer()

                    Text(formatTime(currentEndTime))
                        .font(.system(.body, design: .monospaced, weight: .medium))
                        .foregroundColor(.green)
                }

                Slider(
                    value: Binding(
                        get: { currentEndTime },
                        set: { newValue in
                            // Update timeline directly for real-time sync
                            let clampedValue = max(currentStartTime + minimumDuration, min(newValue, timeline.totalDuration))
                            timeline.updateSegment(segment.id, startTime: nil, endTime: clampedValue)
                        }
                    ),
                    in: (currentStartTime + minimumDuration)...max(currentStartTime + minimumDuration + 0.1, timeline.totalDuration),
                    step: 0.1
                )
                .tint(.green)

                // Fine adjustment buttons
                HStack(spacing: 12) {
                    fineAdjustButton(label: "-1s", adjustment: -1, isStart: false)
                    fineAdjustButton(label: "-0.1s", adjustment: -0.1, isStart: false)
                    Spacer()
                    fineAdjustButton(label: "+0.1s", adjustment: 0.1, isStart: false)
                    fineAdjustButton(label: "+1s", adjustment: 1, isStart: false)
                }
            }
        }
    }

    private func fineAdjustButton(label: String, adjustment: TimeInterval, isStart: Bool) -> some View {
        Button {
            if isStart {
                let newStart = max(0, min(currentStartTime + adjustment, currentEndTime - minimumDuration))
                timeline.updateSegment(segment.id, startTime: newStart, endTime: nil)
            } else {
                let newEnd = max(currentStartTime + minimumDuration, min(currentEndTime + adjustment, timeline.totalDuration))
                timeline.updateSegment(segment.id, startTime: nil, endTime: newEnd)
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(.systemGray5))
                .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Duration Section

    private var durationSection: some View {
        let originalDuration = originalEndTime - originalStartTime

        return HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Durée du segment")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Text(formatTime(editedDuration))
                    .font(.system(size: 20, weight: .semibold, design: .monospaced))
                    .foregroundColor(.primary)
            }

            Spacer()

            // Duration change indicator
            if abs(editedDuration - originalDuration) > 0.01 {
                let change = editedDuration - originalDuration
                HStack(spacing: 4) {
                    Image(systemName: change > 0 ? "arrow.up" : "arrow.down")
                        .font(.system(size: 12))
                    Text(formatTime(abs(change)))
                        .font(.system(size: 13, design: .monospaced))
                }
                .foregroundColor(change > 0 ? .green : .orange)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill((change > 0 ? Color.green : Color.orange).opacity(0.15))
                )
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    // MARK: - Timeline Preview Section

    private var timelinePreviewSection: some View {
        let originalDuration = originalEndTime - originalStartTime

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Aperçu sur la timeline")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()

                // Show "Synchronisé" indicator when real-time sync is active
                if hasChanges {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 6, height: 6)
                        Text("Synchronisé")
                            .font(.system(size: 10))
                            .foregroundColor(.green)
                    }
                }
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background track
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(.systemGray5))

                    // Original segment position (faded)
                    if hasChanges {
                        let originalStart = (originalStartTime / timeline.totalDuration) * geometry.size.width
                        let originalWidth = (originalDuration / timeline.totalDuration) * geometry.size.width

                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: max(8, originalWidth), height: 20)
                            .offset(x: originalStart)
                    }

                    // Current segment position (live updated)
                    let startX = (currentStartTime / timeline.totalDuration) * geometry.size.width
                    let width = (editedDuration / timeline.totalDuration) * geometry.size.width
                    let effectColor = segment.effectDefinition?.color ?? .gray

                    RoundedRectangle(cornerRadius: 4)
                        .fill(effectColor.opacity(0.8))
                        .frame(width: max(8, width), height: 20)
                        .offset(x: startX)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(effectColor, lineWidth: 2)
                                .frame(width: max(8, width), height: 20)
                                .offset(x: startX)
                        )
                        .animation(.easeOut(duration: 0.1), value: currentStartTime)
                        .animation(.easeOut(duration: 0.1), value: currentEndTime)
                }
            }
            .frame(height: 32)

            // Time labels
            HStack {
                Text("0:00")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
                Spacer()
                Text(formatTime(timeline.totalDuration))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
    }

    // MARK: - Parameter Configuration Section

    private var parameterConfigurationSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Paramètres de l'effet")
                    .font(.headline)
                    .foregroundColor(.primary)

                Spacer()

                if hasParameterAnimation {
                    Label("\(totalKeyframeCount) keyframes", systemImage: "diamond.fill")
                        .font(.caption)
                        .foregroundColor(.orange)
                }
            }

            ForEach(Array(editedParameters.enumerated()), id: \.element.id) { index, param in
                parameterRow(for: param, at: index)
            }

            // Add keyframe button
            Button {
                selectedParameterIndex = 0
                keyframeTime = editedDuration / 2
                showKeyframeEditor = true
            } label: {
                Label("Ajouter une animation", systemImage: "plus.diamond")
                    .font(.subheadline)
                    .foregroundColor(.orange)
            }
            .padding(.top, 8)
        }
    }

    private var totalKeyframeCount: Int {
        editedParameters.reduce(0) { $0 + $1.keyframes.count }
    }

    private func parameterRow(for param: EffectParameterConfig, at index: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(param.displayName)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()

                // Show value or "Animated" label
                if param.keyframes.isEmpty {
                    Text(formatParameterValue(param.defaultValue, for: param))
                        .font(.system(.body, design: .monospaced, weight: .medium))
                        .foregroundColor(.primary)
                } else {
                    HStack(spacing: 4) {
                        Image(systemName: "diamond.fill")
                            .font(.system(size: 10))
                        Text("\(param.keyframes.count) pts")
                    }
                    .font(.caption)
                    .foregroundColor(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.orange.opacity(0.15))
                    .cornerRadius(6)
                }
            }

            // Slider for default value (only if no keyframes)
            if param.keyframes.isEmpty {
                Slider(
                    value: Binding(
                        get: { normalizedValue(for: param) },
                        set: { updateParameterDefaultValue(at: index, normalized: $0) }
                    ),
                    in: 0...1,
                    step: 0.01
                )
                .tint(segment.effectDefinition?.color ?? .blue)

                // Min/Max labels
                HStack {
                    Text(formatParameterValue(param.minValue, for: param))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(formatParameterValue(param.maxValue, for: param))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(.secondary)
                }
            } else {
                // Keyframe timeline for this parameter
                keyframeTimeline(for: param, at: index)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .onTapGesture {
            if !param.keyframes.isEmpty {
                selectedParameterIndex = index
                keyframeTime = editedDuration / 2
                showKeyframeEditor = true
            }
        }
    }

    private func keyframeTimeline(for param: EffectParameterConfig, at paramIndex: Int) -> some View {
        VStack(spacing: 4) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background track
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray5))

                    // Interpolated value curve
                    Path { path in
                        let steps = 50
                        for i in 0...steps {
                            let t = Double(i) / Double(steps)
                            let relativeTime = t * editedDuration
                            let value = param.valueAt(relativeTime: relativeTime)
                            let x = t * geometry.size.width
                            let y = (1 - value) * geometry.size.height

                            if i == 0 {
                                path.move(to: CGPoint(x: x, y: y))
                            } else {
                                path.addLine(to: CGPoint(x: x, y: y))
                            }
                        }
                    }
                    .stroke(segment.effectDefinition?.color ?? .blue, lineWidth: 2)

                    // Keyframe diamonds
                    ForEach(param.keyframes) { keyframe in
                        let x = (keyframe.relativeTime / editedDuration) * geometry.size.width
                        let y = (1 - keyframe.value) * geometry.size.height

                        KeyframeDiamond(
                            isSelected: false,
                            onDelete: {
                                deleteKeyframe(keyframe.id, fromParameter: paramIndex)
                            }
                        )
                        .position(x: x, y: y)
                    }
                }
            }
            .frame(height: 60)

            // Time labels
            HStack {
                Text("0.0s")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(.secondary)
                Spacer()
                Text(String(format: "%.1fs", editedDuration))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(.secondary)
            }

            // Edit keyframes button
            Button {
                selectedParameterIndex = paramIndex
                showKeyframeEditor = true
            } label: {
                Label("Éditer les keyframes", systemImage: "pencil")
                    .font(.caption)
            }
        }
    }

    private func normalizedValue(for param: EffectParameterConfig) -> Double {
        (param.defaultValue - param.minValue) / (param.maxValue - param.minValue)
    }

    private func updateParameterDefaultValue(at index: Int, normalized: Double) {
        guard index < editedParameters.count else { return }
        let param = editedParameters[index]
        let actualValue = param.minValue + normalized * (param.maxValue - param.minValue)

        editedParameters[index] = EffectParameterConfig(
            id: param.id,
            parameterName: param.parameterName,
            displayName: param.displayName,
            minValue: param.minValue,
            maxValue: param.maxValue,
            defaultValue: actualValue,
            keyframes: param.keyframes
        )
    }

    private func deleteKeyframe(_ keyframeId: UUID, fromParameter paramIndex: Int) {
        guard paramIndex < editedParameters.count else { return }
        editedParameters[paramIndex].keyframes.removeAll { $0.id == keyframeId }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func formatParameterValue(_ value: Double, for param: EffectParameterConfig) -> String {
        if param.parameterName.contains("pitch") || param.parameterName.contains("Frequency") {
            return String(format: "%.0f", value)
        } else if param.parameterName.contains("rate") || param.parameterName.contains("Time") {
            return String(format: "%.2f", value)
        } else {
            return String(format: "%.0f%%", value)
        }
    }

    // MARK: - Keyframe Editor Sheet

    private var keyframeEditorSheet: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if let index = selectedParameterIndex, index < editedParameters.count {
                    let param = editedParameters[index]

                    // Parameter info
                    HStack {
                        Text(param.displayName)
                            .font(.headline)
                        Spacer()
                        Text("\(param.keyframes.count) keyframes")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)

                    // Time selector
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Position")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(String(format: "%.2fs", keyframeTime))
                                .font(.system(.body, design: .monospaced, weight: .medium))
                        }

                        Slider(
                            value: $keyframeTime,
                            in: 0...editedDuration,
                            step: 0.01
                        )
                        .tint(.orange)
                    }

                    // Value at selected time
                    let currentValue = param.valueAt(relativeTime: keyframeTime)
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Valeur")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(formatParameterValue(param.minValue + currentValue * (param.maxValue - param.minValue), for: param))
                                .font(.system(.body, design: .monospaced, weight: .medium))
                        }

                        // Show interpolated value indicator
                        Slider(value: .constant(currentValue), in: 0...1)
                            .disabled(true)
                            .tint(.gray)
                    }

                    // Add keyframe with custom value
                    addKeyframeSection(for: index, param: param)

                    // Existing keyframes list
                    if !param.keyframes.isEmpty {
                        existingKeyframesList(for: index, param: param)
                    }

                    Spacer()
                }
            }
            .padding()
            .navigationTitle("Animation du paramètre")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        showKeyframeEditor = false
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @State private var newKeyframeValue: Double = 0.5

    private func addKeyframeSection(for index: Int, param: EffectParameterConfig) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Ajouter un keyframe")
                .font(.subheadline)
                .foregroundColor(.secondary)

            HStack(spacing: 12) {
                // Value slider
                VStack(alignment: .leading, spacing: 4) {
                    Text("Nouvelle valeur")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Slider(value: $newKeyframeValue, in: 0...1, step: 0.01)
                        .tint(segment.effectDefinition?.color ?? .blue)

                    Text(formatParameterValue(param.minValue + newKeyframeValue * (param.maxValue - param.minValue), for: param))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(.primary)
                }

                // Add button
                Button {
                    addKeyframe(at: index, time: keyframeTime, value: newKeyframeValue)
                } label: {
                    Image(systemName: "plus.diamond.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                        .frame(width: 50, height: 50)
                        .background(Color.orange)
                        .cornerRadius(12)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func existingKeyframesList(for index: Int, param: EffectParameterConfig) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Keyframes existants")
                .font(.subheadline)
                .foregroundColor(.secondary)

            ForEach(param.keyframes.sorted { $0.relativeTime < $1.relativeTime }) { keyframe in
                HStack {
                    // Diamond icon
                    Image(systemName: "diamond.fill")
                        .font(.system(size: 12))
                        .foregroundColor(.orange)

                    // Time
                    Text(String(format: "%.2fs", keyframe.relativeTime))
                        .font(.system(.body, design: .monospaced))

                    Spacer()

                    // Value
                    let actualValue = param.minValue + keyframe.value * (param.maxValue - param.minValue)
                    Text(formatParameterValue(actualValue, for: param))
                        .font(.system(.body, design: .monospaced))
                        .foregroundColor(.secondary)

                    // Delete button
                    Button {
                        deleteKeyframe(keyframe.id, fromParameter: index)
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 14))
                            .foregroundColor(.red)
                    }
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .background(Color(.systemGray5))
                .cornerRadius(8)
            }
        }
    }

    private func addKeyframe(at paramIndex: Int, time: TimeInterval, value: Double) {
        guard paramIndex < editedParameters.count else { return }

        let keyframe = EffectParameterKeyframe(
            parameterName: editedParameters[paramIndex].parameterName,
            relativeTime: time,
            value: value
        )

        editedParameters[paramIndex].keyframes.append(keyframe)
        editedParameters[paramIndex].keyframes.sort { $0.relativeTime < $1.relativeTime }

        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    // MARK: - Delete Button

    private var deleteButton: some View {
        Button(role: .destructive) {
            timeline.removeSegment(segment.id)
            onDismiss()
        } label: {
            Label("Supprimer le segment", systemImage: "trash")
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.red.opacity(0.1))
                .foregroundColor(.red)
                .cornerRadius(12)
        }
    }

    // MARK: - Effect Picker Sheet

    private var effectPickerSheet: some View {
        NavigationStack {
            AudioEffectsGridView(selectedEffect: $selectedEffectType)
                .navigationTitle("Choisir un effet")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("OK") {
                            showEffectPicker = false
                        }
                    }
                }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Actions

    private func applyChanges() {
        // Time changes are already applied in real-time via updateSegment()
        // Only need to update effect type and parameters if changed
        timeline.removeSegment(segment.id)
        timeline.addSegmentWithParameters(
            effectType: selectedEffectType,
            startTime: currentStartTime,  // Use current (already synced) time
            endTime: currentEndTime,       // Use current (already synced) time
            parameterConfigs: editedParameters
        )
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    // MARK: - Helpers

    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        let milliseconds = Int((time - Double(Int(time))) * 100)
        return String(format: "%d:%02d.%02d", minutes, seconds, milliseconds)
    }
}

// MARK: - Keyframe Diamond View

/// Diamond-shaped keyframe indicator for animation timelines
struct KeyframeDiamond: View {
    let isSelected: Bool
    var onDelete: (() -> Void)?

    @State private var showDeleteConfirm = false

    var body: some View {
        ZStack {
            // Diamond shape
            Rectangle()
                .fill(isSelected ? Color.orange : Color.orange.opacity(0.8))
                .frame(width: 10, height: 10)
                .rotationEffect(.degrees(45))
                .shadow(color: .black.opacity(0.2), radius: 1, x: 0, y: 1)

            // Selection ring
            if isSelected {
                Rectangle()
                    .stroke(Color.white, lineWidth: 2)
                    .frame(width: 14, height: 14)
                    .rotationEffect(.degrees(45))
            }
        }
        .contentShape(Rectangle().size(width: 20, height: 20))
        .onLongPressGesture {
            if onDelete != nil {
                showDeleteConfirm = true
            }
        }
        .confirmationDialog("Supprimer ce keyframe?", isPresented: $showDeleteConfirm) {
            Button("Supprimer", role: .destructive) {
                onDelete?()
            }
            Button("Annuler", role: .cancel) {}
        }
    }
}

// MARK: - Add Effect Menu

/// Menu for selecting an effect to add at a position
struct AddEffectMenu: View {
    let position: Double
    let onSelectEffect: (AudioEffectType) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(AudioEffectCategory.allCases) { category in
                    let effects = AudioEffectsCatalog.shared.effects(in: category)
                    if !effects.isEmpty && category != .utility {
                        Section(category.localizedName) {
                            ForEach(effects) { effect in
                                Button {
                                    onSelectEffect(effect.type)
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: effect.icon)
                                            .font(.system(size: 20))
                                            .foregroundColor(effect.color)
                                            .frame(width: 32)

                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack {
                                                Text(effect.displayName)
                                                    .foregroundColor(.primary)
                                                if effect.isPremium {
                                                    Image(systemName: "star.fill")
                                                        .font(.system(size: 10))
                                                        .foregroundColor(.yellow)
                                                }
                                            }
                                            Text(effect.description)
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                                .lineLimit(1)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Ajouter un effet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler", action: onDismiss)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
