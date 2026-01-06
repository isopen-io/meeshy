//
//  PrecisionTimelineEngine.swift
//  Meeshy
//
//  Unified precision timeline engine for audio editing.
//  Single source of truth for all time-based operations.
//
//  Features:
//  - Sample-accurate positioning (0.023ms @ 44.1kHz)
//  - Unified time representation (no ms/seconds conversion errors)
//  - Snap-to-grid support for intuitive editing
//  - Automatic overlap detection and resolution
//  - Real-time playhead synchronization with AVAudioEngine
//
//  iOS 16+
//

import Foundation
import AVFoundation
import Combine

// MARK: - Precision Time

/// Sample-accurate time representation
/// All internal calculations use frames to avoid floating-point precision errors
struct PrecisionTime: Comparable, Hashable, Codable {
    /// Time in audio frames (sample-accurate)
    let frames: Int64
    /// Sample rate for conversion
    let sampleRate: Double

    // MARK: - Initialization

    init(frames: Int64, sampleRate: Double = 48000) {
        self.frames = frames
        self.sampleRate = sampleRate
    }

    init(seconds: TimeInterval, sampleRate: Double = 48000) {
        self.frames = Int64(seconds * sampleRate)
        self.sampleRate = sampleRate
    }

    init(milliseconds: Int, sampleRate: Double = 48000) {
        self.frames = Int64(Double(milliseconds) / 1000.0 * sampleRate)
        self.sampleRate = sampleRate
    }

    // MARK: - Conversions

    /// Time in seconds (for display/UI)
    var seconds: TimeInterval {
        Double(frames) / sampleRate
    }

    /// Time in milliseconds (for server/API)
    var milliseconds: Int {
        Int(seconds * 1000)
    }

    /// Normalized position (0-1) within a duration
    func normalized(in totalDuration: PrecisionTime) -> Double {
        guard totalDuration.frames > 0 else { return 0 }
        return Double(frames) / Double(totalDuration.frames)
    }

    // MARK: - Formatting

    /// Format as MM:SS.ms
    var formatted: String {
        let totalSeconds = Int(seconds)
        let minutes = totalSeconds / 60
        let secs = totalSeconds % 60
        let ms = Int((seconds - Double(totalSeconds)) * 100)

        if minutes > 0 {
            return String(format: "%d:%02d.%02d", minutes, secs, ms)
        }
        return String(format: "0:%02d.%02d", secs, ms)
    }

    /// Short format MM:SS
    var shortFormatted: String {
        let totalSeconds = Int(seconds)
        let minutes = totalSeconds / 60
        let secs = totalSeconds % 60
        return String(format: "%d:%02d", minutes, secs)
    }

    // MARK: - Operators

    static func + (lhs: PrecisionTime, rhs: PrecisionTime) -> PrecisionTime {
        PrecisionTime(frames: lhs.frames + rhs.frames, sampleRate: lhs.sampleRate)
    }

    static func - (lhs: PrecisionTime, rhs: PrecisionTime) -> PrecisionTime {
        PrecisionTime(frames: lhs.frames - rhs.frames, sampleRate: lhs.sampleRate)
    }

    static func < (lhs: PrecisionTime, rhs: PrecisionTime) -> Bool {
        lhs.frames < rhs.frames
    }

    static func == (lhs: PrecisionTime, rhs: PrecisionTime) -> Bool {
        lhs.frames == rhs.frames
    }

    // MARK: - Static

    static let zero = PrecisionTime(frames: 0)

    /// Create from normalized position (0-1) within a duration
    static func fromNormalized(_ position: Double, in duration: PrecisionTime) -> PrecisionTime {
        let clampedPosition = max(0, min(1, position))
        return PrecisionTime(frames: Int64(clampedPosition * Double(duration.frames)), sampleRate: duration.sampleRate)
    }
}

// MARK: - Precision Time Range

/// Sample-accurate time range
struct PrecisionTimeRange: Hashable, Codable {
    var start: PrecisionTime
    var end: PrecisionTime

    var duration: PrecisionTime {
        PrecisionTime(frames: max(0, end.frames - start.frames), sampleRate: start.sampleRate)
    }

    init(start: PrecisionTime, end: PrecisionTime) {
        self.start = start
        self.end = end
    }

    init(start: TimeInterval, end: TimeInterval, sampleRate: Double = 48000) {
        self.start = PrecisionTime(seconds: start, sampleRate: sampleRate)
        self.end = PrecisionTime(seconds: end, sampleRate: sampleRate)
    }

    /// Check if a time is within this range
    func contains(_ time: PrecisionTime) -> Bool {
        time.frames >= start.frames && time.frames < end.frames
    }

    /// Check if this range overlaps with another
    func overlaps(with other: PrecisionTimeRange) -> Bool {
        start.frames < other.end.frames && end.frames > other.start.frames
    }

    /// Get overlap region with another range
    func intersection(with other: PrecisionTimeRange) -> PrecisionTimeRange? {
        let overlapStart = max(start.frames, other.start.frames)
        let overlapEnd = min(end.frames, other.end.frames)

        guard overlapEnd > overlapStart else { return nil }

        return PrecisionTimeRange(
            start: PrecisionTime(frames: overlapStart, sampleRate: start.sampleRate),
            end: PrecisionTime(frames: overlapEnd, sampleRate: start.sampleRate)
        )
    }
}

// MARK: - Grid Snap Configuration

/// Configuration for snap-to-grid editing
struct GridSnapConfiguration {
    /// Grid resolution in milliseconds
    var gridResolutionMs: Int
    /// Whether snapping is enabled
    var isEnabled: Bool
    /// Snap threshold in pixels (how close to snap)
    var snapThresholdPixels: CGFloat
    /// Magnetic snap to segment boundaries
    var snapToSegments: Bool

    static let `default` = GridSnapConfiguration(
        gridResolutionMs: 100,
        isEnabled: true,
        snapThresholdPixels: 10,
        snapToSegments: true
    )

    static let fine = GridSnapConfiguration(
        gridResolutionMs: 50,
        isEnabled: true,
        snapThresholdPixels: 8,
        snapToSegments: true
    )

    static let disabled = GridSnapConfiguration(
        gridResolutionMs: 100,
        isEnabled: false,
        snapThresholdPixels: 0,
        snapToSegments: false
    )

    /// Snap a time to the nearest grid line
    func snap(_ time: PrecisionTime) -> PrecisionTime {
        guard isEnabled else { return time }

        let msValue = time.milliseconds
        let snappedMs = ((msValue + gridResolutionMs / 2) / gridResolutionMs) * gridResolutionMs
        return PrecisionTime(milliseconds: snappedMs, sampleRate: time.sampleRate)
    }
}

// MARK: - Precision Effect Segment

/// Sample-accurate effect segment
struct PrecisionEffectSegment: Identifiable, Hashable {
    let id: UUID
    let effectType: AudioEffectType
    var timeRange: PrecisionTimeRange
    var parameterConfigs: [EffectParameterConfig]
    let createdAt: Date

    // MARK: - Computed Properties

    var startTime: PrecisionTime { timeRange.start }
    var endTime: PrecisionTime { timeRange.end }
    var duration: PrecisionTime { timeRange.duration }

    /// Start position as normalized value (0-1)
    func startNormalized(in totalDuration: PrecisionTime) -> Double {
        startTime.normalized(in: totalDuration)
    }

    /// End position as normalized value (0-1)
    func endNormalized(in totalDuration: PrecisionTime) -> Double {
        endTime.normalized(in: totalDuration)
    }

    /// Effect definition from catalog
    var effectDefinition: AudioEffectDefinition? {
        AudioEffectsCatalog.shared.effect(for: effectType)
    }

    // MARK: - Initialization

    init(
        id: UUID = UUID(),
        effectType: AudioEffectType,
        timeRange: PrecisionTimeRange,
        parameterConfigs: [EffectParameterConfig] = [],
        createdAt: Date = Date()
    ) {
        self.id = id
        self.effectType = effectType
        self.timeRange = timeRange
        self.parameterConfigs = parameterConfigs.isEmpty
            ? AudioEffectRegion.defaultParameters(for: effectType)
            : parameterConfigs
        self.createdAt = createdAt
    }

    init(
        id: UUID = UUID(),
        effectType: AudioEffectType,
        startSeconds: TimeInterval,
        endSeconds: TimeInterval,
        sampleRate: Double = 48000,
        parameterConfigs: [EffectParameterConfig] = []
    ) {
        self.init(
            id: id,
            effectType: effectType,
            timeRange: PrecisionTimeRange(
                start: startSeconds,
                end: endSeconds,
                sampleRate: sampleRate
            ),
            parameterConfigs: parameterConfigs
        )
    }

    // MARK: - Validation

    /// Check if this segment overlaps with another
    func overlaps(with other: PrecisionEffectSegment) -> Bool {
        timeRange.overlaps(with: other.timeRange)
    }

    /// Check if a time is within this segment
    func contains(_ time: PrecisionTime) -> Bool {
        timeRange.contains(time)
    }

    // MARK: - Hashable

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: PrecisionEffectSegment, rhs: PrecisionEffectSegment) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Overlap Resolution Strategy

enum OverlapResolutionStrategy {
    /// Allow overlapping effects (combine/stack effects) - DEFAULT
    case allowOverlap
    /// Later segments take priority
    case laterWins
    /// Earlier segments take priority
    case earlierWins
    /// Trim overlapping segment to remove overlap
    case trim
    /// Split overlapping segment at overlap point
    case split
    /// Merge overlapping segments of same effect type
    case merge
}

// MARK: - Precision Timeline Engine

/// Unified engine for precision timeline management
@MainActor
final class PrecisionTimelineEngine: ObservableObject {

    // MARK: - Published State

    /// All effect segments (sorted by start time)
    @Published private(set) var segments: [PrecisionEffectSegment] = []

    /// Currently selected segment ID
    @Published var selectedSegmentId: UUID?

    /// Current playhead position
    @Published private(set) var playheadPosition: PrecisionTime = .zero

    /// Total duration of the audio
    @Published private(set) var totalDuration: PrecisionTime = .zero

    /// Trim range
    @Published var trimRange: PrecisionTimeRange = PrecisionTimeRange(start: .zero, end: .zero)

    /// Whether playback is active
    @Published private(set) var isPlaying: Bool = false

    /// Grid snap configuration
    @Published var gridConfig: GridSnapConfiguration = .default

    /// Overlap resolution strategy (allowOverlap by default to enable effect stacking)
    @Published var overlapStrategy: OverlapResolutionStrategy = .allowOverlap

    // MARK: - Private Properties

    private var sampleRate: Double = 48000
    private var history: [[PrecisionEffectSegment]] = []
    private let maxHistoryCount = 30

    // Playback synchronization
    private var playbackStartTime: Date?
    private var playbackStartPosition: PrecisionTime = .zero
    private var displayLink: CADisplayLink?
    private var playbackTimer: Timer?

    // Combine
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Computed Properties

    var selectedSegment: PrecisionEffectSegment? {
        guard let id = selectedSegmentId else { return nil }
        return segments.first { $0.id == id }
    }

    /// Playhead position as normalized value (0-1)
    var playheadNormalized: Double {
        playheadPosition.normalized(in: totalDuration)
    }

    /// Trim start as normalized value (0-1)
    var trimStartNormalized: Double {
        trimRange.start.normalized(in: totalDuration)
    }

    /// Trim end as normalized value (0-1)
    var trimEndNormalized: Double {
        trimRange.end.normalized(in: totalDuration)
    }

    /// Whether audio is trimmed
    var isTrimmed: Bool {
        trimRange.start.frames > 0 || trimRange.end.frames < totalDuration.frames
    }

    /// Can undo
    var canUndo: Bool { !history.isEmpty }

    // MARK: - Initialization

    init(sampleRate: Double = 48000) {
        self.sampleRate = sampleRate
    }

    // MARK: - Setup

    /// Initialize with audio file
    func setup(with audioFile: AVAudioFile) {
        sampleRate = audioFile.processingFormat.sampleRate
        let frames = audioFile.length

        // IMPORTANT: Use the audio file's sample rate for all times
        // Using .zero would use default 48000 Hz which causes duration calculation errors
        let zeroTime = PrecisionTime(frames: 0, sampleRate: sampleRate)

        totalDuration = PrecisionTime(frames: frames, sampleRate: sampleRate)
        trimRange = PrecisionTimeRange(start: zeroTime, end: totalDuration)
        playheadPosition = zeroTime
        segments = []
        history = []

        mediaLogger.info("[PrecisionTimeline] Setup with duration: \(totalDuration.formatted), sampleRate: \(sampleRate)")
    }

    /// Initialize with duration
    func setup(duration: TimeInterval, sampleRate: Double = 48000) {
        self.sampleRate = sampleRate

        // Use consistent sample rate for all times
        let zeroTime = PrecisionTime(frames: 0, sampleRate: sampleRate)

        totalDuration = PrecisionTime(seconds: duration, sampleRate: sampleRate)
        trimRange = PrecisionTimeRange(start: zeroTime, end: totalDuration)
        playheadPosition = zeroTime
        segments = []
        history = []
    }

    // MARK: - Segment Management

    /// Add a new effect segment
    @discardableResult
    func addSegment(
        effectType: AudioEffectType,
        start: PrecisionTime,
        end: PrecisionTime,
        parameterConfigs: [EffectParameterConfig] = []
    ) -> PrecisionEffectSegment {
        saveToHistory()

        // Apply grid snapping
        let snappedStart = gridConfig.snap(start)
        let snappedEnd = gridConfig.snap(end)

        // Clamp to valid range
        let clampedStart = PrecisionTime(
            frames: max(0, min(snappedStart.frames, totalDuration.frames)),
            sampleRate: sampleRate
        )
        let clampedEnd = PrecisionTime(
            frames: max(clampedStart.frames + Int64(sampleRate * 0.1), min(snappedEnd.frames, totalDuration.frames)),
            sampleRate: sampleRate
        )

        let segment = PrecisionEffectSegment(
            effectType: effectType,
            timeRange: PrecisionTimeRange(start: clampedStart, end: clampedEnd),
            parameterConfigs: parameterConfigs
        )

        segments.append(segment)

        // Resolve overlaps
        resolveOverlaps(for: segment.id)

        // Sort by start time
        segments.sort { $0.startTime < $1.startTime }

        mediaLogger.info("[PrecisionTimeline] Added segment: \(effectType.rawValue) at \(clampedStart.formatted) - \(clampedEnd.formatted)")

        return segment
    }

    /// Add segment at current playhead position
    @discardableResult
    func addSegmentAtPlayhead(
        effectType: AudioEffectType,
        duration: TimeInterval = 3.0
    ) -> PrecisionEffectSegment {
        let start = playheadPosition
        let end = PrecisionTime(
            frames: min(start.frames + Int64(duration * sampleRate), totalDuration.frames),
            sampleRate: sampleRate
        )

        return addSegment(effectType: effectType, start: start, end: end)
    }

    /// Remove a segment
    func removeSegment(_ id: UUID) {
        saveToHistory()
        segments.removeAll { $0.id == id }

        if selectedSegmentId == id {
            selectedSegmentId = nil
        }
    }

    /// Update segment time range
    func updateSegment(
        _ id: UUID,
        start: PrecisionTime? = nil,
        end: PrecisionTime? = nil,
        saveHistory: Bool = false
    ) {
        guard let index = segments.firstIndex(where: { $0.id == id }) else { return }

        if saveHistory {
            saveToHistory()
        }

        var segment = segments[index]

        if let newStart = start {
            let snapped = gridConfig.snap(newStart)
            let clamped = PrecisionTime(
                frames: max(0, min(snapped.frames, segment.endTime.frames - Int64(sampleRate * 0.1))),
                sampleRate: sampleRate
            )
            segment.timeRange.start = clamped
        }

        if let newEnd = end {
            let snapped = gridConfig.snap(newEnd)
            let clamped = PrecisionTime(
                frames: max(segment.startTime.frames + Int64(sampleRate * 0.1), min(snapped.frames, totalDuration.frames)),
                sampleRate: sampleRate
            )
            segment.timeRange.end = clamped
        }

        segments[index] = segment

        // Resolve overlaps if needed
        resolveOverlaps(for: id)

        // Re-sort
        segments.sort { $0.startTime < $1.startTime }

        // Force update
        objectWillChange.send()
    }

    /// Update segment with normalized positions
    func updateSegmentNormalized(
        _ id: UUID,
        startNormalized: Double? = nil,
        endNormalized: Double? = nil,
        saveHistory: Bool = false
    ) {
        let start = startNormalized.map { PrecisionTime.fromNormalized($0, in: totalDuration) }
        let end = endNormalized.map { PrecisionTime.fromNormalized($0, in: totalDuration) }

        updateSegment(id, start: start, end: end, saveHistory: saveHistory)
    }

    /// Clear all segments
    func clearAllSegments() {
        saveToHistory()
        segments = []
        selectedSegmentId = nil
    }

    // MARK: - Overlap Resolution

    private func resolveOverlaps(for newSegmentId: UUID) {
        // Allow overlapping effects - no resolution needed, effects can stack
        if overlapStrategy == .allowOverlap {
            return
        }

        guard let newIndex = segments.firstIndex(where: { $0.id == newSegmentId }) else { return }
        let newSegment = segments[newIndex]

        var indicesToRemove: [Int] = []
        var segmentsToAdd: [PrecisionEffectSegment] = []

        for (index, segment) in segments.enumerated() {
            guard segment.id != newSegmentId else { continue }
            guard newSegment.overlaps(with: segment) else { continue }

            switch overlapStrategy {
            case .allowOverlap:
                // Already handled above, but needed for exhaustive switch
                break

            case .laterWins:
                // New segment wins, trim or remove old segment
                if newSegment.startTime <= segment.startTime && newSegment.endTime >= segment.endTime {
                    // New segment completely covers old - remove old
                    indicesToRemove.append(index)
                } else if newSegment.startTime <= segment.startTime {
                    // Overlap at start - trim old segment start
                    var modified = segment
                    modified.timeRange.start = newSegment.endTime
                    if modified.duration.frames > Int64(sampleRate * 0.1) {
                        segments[index] = modified
                    } else {
                        indicesToRemove.append(index)
                    }
                } else if newSegment.endTime >= segment.endTime {
                    // Overlap at end - trim old segment end
                    var modified = segment
                    modified.timeRange.end = newSegment.startTime
                    if modified.duration.frames > Int64(sampleRate * 0.1) {
                        segments[index] = modified
                    } else {
                        indicesToRemove.append(index)
                    }
                } else {
                    // New segment is in middle - split old segment
                    var leftPart = segment
                    leftPart.timeRange.end = newSegment.startTime

                    var rightPart = segment
                    rightPart.timeRange.start = newSegment.endTime

                    if leftPart.duration.frames > Int64(sampleRate * 0.1) {
                        segments[index] = leftPart
                    } else {
                        indicesToRemove.append(index)
                    }

                    if rightPart.duration.frames > Int64(sampleRate * 0.1) {
                        let newRightPart = PrecisionEffectSegment(
                            effectType: segment.effectType,
                            timeRange: rightPart.timeRange,
                            parameterConfigs: segment.parameterConfigs
                        )
                        segmentsToAdd.append(newRightPart)
                    }
                }

            case .earlierWins:
                // Old segment wins, trim new segment
                if segment.startTime <= newSegment.startTime && segment.endTime >= newSegment.endTime {
                    // Old completely covers new - remove new
                    indicesToRemove.append(newIndex)
                    return
                }
                // Trim new segment around old segment
                var modified = segments[newIndex]
                if segment.endTime > modified.startTime && segment.startTime <= modified.startTime {
                    modified.timeRange.start = segment.endTime
                }
                if segment.startTime < modified.endTime && segment.endTime >= modified.endTime {
                    modified.timeRange.end = segment.startTime
                }
                segments[newIndex] = modified

            case .merge:
                // Merge if same effect type
                if segment.effectType == newSegment.effectType {
                    var merged = segments[newIndex]
                    merged.timeRange.start = PrecisionTime(
                        frames: min(segment.startTime.frames, newSegment.startTime.frames),
                        sampleRate: sampleRate
                    )
                    merged.timeRange.end = PrecisionTime(
                        frames: max(segment.endTime.frames, newSegment.endTime.frames),
                        sampleRate: sampleRate
                    )
                    segments[newIndex] = merged
                    indicesToRemove.append(index)
                }

            case .trim, .split:
                // Same as laterWins for now
                break
            }
        }

        // Remove marked segments (in reverse order to preserve indices)
        for index in indicesToRemove.sorted().reversed() {
            if index < segments.count {
                segments.remove(at: index)
            }
        }

        // Add split segments
        segments.append(contentsOf: segmentsToAdd)
    }

    // MARK: - Playhead Control

    /// Seek to a specific time
    func seek(to time: PrecisionTime) {
        let clamped = PrecisionTime(
            frames: max(trimRange.start.frames, min(time.frames, trimRange.end.frames)),
            sampleRate: sampleRate
        )
        playheadPosition = clamped
    }

    /// Seek to normalized position (0-1)
    func seekNormalized(_ position: Double) {
        let time = PrecisionTime.fromNormalized(position, in: totalDuration)
        seek(to: time)
    }

    /// Start playback timer
    func startPlayback(from position: PrecisionTime? = nil) {
        if let pos = position {
            playheadPosition = pos
        }

        playbackStartTime = Date()
        playbackStartPosition = playheadPosition
        isPlaying = true

        // Use high-frequency timer for smooth updates
        playbackTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updatePlayheadFromTimer()
            }
        }
    }

    /// Stop playback
    func stopPlayback() {
        isPlaying = false
        playbackTimer?.invalidate()
        playbackTimer = nil
        playbackStartTime = nil
    }

    /// Sync playhead with AVAudioPlayerNode (sample-accurate)
    func syncWithPlayer(nodeTime: AVAudioTime?, playerTime: AVAudioTime?, fileLength: Int64) {
        guard let playerTime = playerTime else { return }

        let currentFrame = playerTime.sampleTime
        let normalizedPosition = Double(currentFrame) / Double(fileLength)

        // Convert to timeline position accounting for trim
        let trimmedFrames = Int64(normalizedPosition * Double(trimRange.duration.frames))
        let absolutePosition = trimRange.start.frames + trimmedFrames

        playheadPosition = PrecisionTime(frames: absolutePosition, sampleRate: sampleRate)
    }

    private func updatePlayheadFromTimer() {
        guard isPlaying, let startTime = playbackStartTime else { return }

        let elapsed = Date().timeIntervalSince(startTime)
        let elapsedFrames = Int64(elapsed * sampleRate)
        let newPosition = PrecisionTime(
            frames: playbackStartPosition.frames + elapsedFrames,
            sampleRate: sampleRate
        )

        if newPosition.frames >= trimRange.end.frames {
            // Reached end, stop playback
            playheadPosition = trimRange.start
            stopPlayback()
        } else {
            playheadPosition = newPosition
        }
    }

    // MARK: - Trim Control

    /// Update trim start
    func setTrimStart(normalized: Double) {
        let newStart = PrecisionTime.fromNormalized(normalized, in: totalDuration)
        let minEnd = trimRange.end.frames - Int64(sampleRate * 0.5) // Min 0.5s duration
        let clamped = PrecisionTime(
            frames: max(0, min(newStart.frames, minEnd)),
            sampleRate: sampleRate
        )
        trimRange.start = clamped

        // Keep playhead in range
        if playheadPosition.frames < trimRange.start.frames {
            playheadPosition = trimRange.start
        }
    }

    /// Update trim end
    func setTrimEnd(normalized: Double) {
        let newEnd = PrecisionTime.fromNormalized(normalized, in: totalDuration)
        let minStart = trimRange.start.frames + Int64(sampleRate * 0.5) // Min 0.5s duration
        let clamped = PrecisionTime(
            frames: max(minStart, min(newEnd.frames, totalDuration.frames)),
            sampleRate: sampleRate
        )
        trimRange.end = clamped

        // Keep playhead in range
        if playheadPosition.frames > trimRange.end.frames {
            playheadPosition = trimRange.end
        }
    }

    // MARK: - Query

    /// Get effect at a specific time
    func effectAt(time: PrecisionTime) -> AudioEffectType? {
        // Return last matching segment (later segments have priority)
        for segment in segments.reversed() {
            if segment.contains(time) {
                return segment.effectType
            }
        }
        return nil
    }

    /// Get segment at a specific time
    func segmentAt(time: PrecisionTime) -> PrecisionEffectSegment? {
        for segment in segments.reversed() {
            if segment.contains(time) {
                return segment
            }
        }
        return nil
    }

    /// Get all effects active at a time
    func allEffectsAt(time: PrecisionTime) -> [AudioEffectType] {
        segments.filter { $0.contains(time) }.map { $0.effectType }
    }

    // MARK: - History

    private func saveToHistory() {
        history.append(segments)
        if history.count > maxHistoryCount {
            history.removeFirst()
        }
    }

    /// Undo last change
    func undo() {
        guard let previous = history.popLast() else { return }
        segments = previous
    }

    // MARK: - Export

    /// Convert to legacy AudioEffectTimeline
    func toLegacyTimeline() -> AudioEffectTimeline {
        let legacy = AudioEffectTimeline(duration: totalDuration.seconds)

        for segment in segments {
            legacy.addSegment(
                effectType: segment.effectType,
                startTime: segment.startTime.seconds,
                endTime: segment.endTime.seconds
            )
        }

        return legacy
    }

    /// Convert to recording timeline for server
    func toRecordingTimeline() -> AudioEffectsRecordingTimeline {
        var events: [AudioEffectEvent] = []

        for segment in segments {
            // Activate event
            events.append(AudioEffectEvent(
                timestamp: segment.startTime.milliseconds,
                effectType: segment.effectType.rawValue,
                action: .activate,
                params: nil
            ))

            // Deactivate event
            events.append(AudioEffectEvent(
                timestamp: segment.endTime.milliseconds,
                effectType: segment.effectType.rawValue,
                action: .deactivate,
                params: nil
            ))
        }

        // Sort by timestamp
        events.sort { $0.timestamp < $1.timestamp }

        return AudioEffectsRecordingTimeline(
            version: AudioEffectsRecordingTimeline.currentVersion,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            duration: totalDuration.milliseconds,
            sampleRate: Int(sampleRate),
            channels: 1,
            events: events,
            metadata: AudioEffectsRecordingTimeline.TimelineMetadata(
                totalEffectsUsed: Set(segments.map { $0.effectType }).count,
                totalParameterChanges: 0,
                finalActiveEffects: [],
                tags: nil
            )
        )
    }

    /// Import from legacy AudioEffectTimeline
    func importFromLegacy(_ legacy: AudioEffectTimeline) {
        segments = []

        for legacySegment in legacy.segments {
            let segment = PrecisionEffectSegment(
                effectType: legacySegment.effectType,
                startSeconds: legacySegment.startTime,
                endSeconds: legacySegment.endTime,
                sampleRate: sampleRate,
                parameterConfigs: legacySegment.parameterConfigs
            )
            segments.append(segment)
        }

        segments.sort { $0.startTime < $1.startTime }
    }
}
