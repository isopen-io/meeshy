//
//  AudioEffectsTimelineTracker.swift
//  Meeshy
//
//  Event-based audio effects timeline tracking system.
//  Tracks effect activations, deactivations, and parameter changes during recording.
//  Compatible with the webapp frontend format.
//
//  Architecture (matching web frontend):
//  - Original audio is NEVER modified
//  - Effects are tracked as timestamped events (activate/deactivate/update)
//  - Timeline is sent to server with original audio
//  - Effects are applied at playback time using the timeline
//  - Millisecond precision matching webapp format
//
//  iOS 16+
//

import Foundation
import AVFoundation

// MARK: - Audio Effect Action

/// Action types for audio effect events
enum AudioEffectAction: String, Codable {
    case activate = "activate"
    case deactivate = "deactivate"
    case update = "update"
}

// MARK: - Audio Effect Event

/// Represents a single audio effect event during recording
struct AudioEffectEvent: Identifiable, Codable, Hashable {
    let id: UUID
    /// Timestamp in milliseconds since recording start
    let timestamp: Int
    /// Type of effect (matches AudioEffectType)
    let effectType: String
    /// Action performed
    let action: AudioEffectAction
    /// Effect parameters at this event (for activate/update)
    let params: [String: AnyCodable]?

    /// Timestamp in seconds
    var timestampSeconds: TimeInterval {
        TimeInterval(timestamp) / 1000.0
    }

    init(
        id: UUID = UUID(),
        timestamp: Int,
        effectType: String,
        action: AudioEffectAction,
        params: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.timestamp = timestamp
        self.effectType = effectType
        self.action = action
        self.params = params
    }

    // MARK: - Codable
    // Don't encode id (not needed by webapp)

    enum CodingKeys: String, CodingKey {
        case timestamp
        case effectType
        case action
        case params
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = UUID()  // Generate new ID when decoding (webapp doesn't send id)
        self.timestamp = try container.decode(Int.self, forKey: .timestamp)
        self.effectType = try container.decode(String.self, forKey: .effectType)
        self.action = try container.decode(AudioEffectAction.self, forKey: .action)
        self.params = try container.decodeIfPresent([String: AnyCodable].self, forKey: .params)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(timestamp, forKey: .timestamp)
        try container.encode(effectType, forKey: .effectType)
        try container.encode(action, forKey: .action)
        try container.encodeIfPresent(params, forKey: .params)
    }
}

// MARK: - Audio Effects Recording Timeline

/// Complete timeline of audio effects for a recording
/// This format matches the webapp's AudioEffectsTimeline type
struct AudioEffectsRecordingTimeline: Codable {
    /// Version of the timeline format
    let version: String
    /// ISO 8601 timestamp when recording started
    let createdAt: String
    /// Total duration in milliseconds
    let duration: Int
    /// Audio sample rate in Hz
    let sampleRate: Int
    /// Number of audio channels
    let channels: Int
    /// Chronological list of effect events
    let events: [AudioEffectEvent]
    /// Optional metadata
    let metadata: TimelineMetadata?

    /// Duration in seconds
    var durationSeconds: TimeInterval {
        TimeInterval(duration) / 1000.0
    }

    struct TimelineMetadata: Codable {
        let totalEffectsUsed: Int?
        let totalParameterChanges: Int?
        let finalActiveEffects: [String]?
        let tags: [String]?
    }

    /// Current timeline version
    static let currentVersion = "1.0"

    /// Create an empty timeline
    static func empty(sampleRate: Int = 48000, channels: Int = 1) -> AudioEffectsRecordingTimeline {
        AudioEffectsRecordingTimeline(
            version: currentVersion,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            duration: 0,
            sampleRate: sampleRate,
            channels: channels,
            events: [],
            metadata: nil
        )
    }
}

// MARK: - Audio Effects Timeline Tracker

/// Tracks audio effect events during recording
/// Similar to the webapp's useAudioEffectsTimeline hook
@MainActor
final class AudioEffectsTimelineTracker: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isTracking = false
    @Published private(set) var events: [AudioEffectEvent] = []
    @Published private(set) var activeEffects: Set<String> = []

    // MARK: - Private Properties

    private var startTime: Date?
    private var sampleRate: Int = 48000
    private var channels: Int = 1

    // MARK: - Initialization

    init() {}

    // MARK: - Computed Properties

    /// Current timestamp in milliseconds since tracking started
    var currentTimestamp: Int {
        guard isTracking, let startTime = startTime else { return 0 }
        return Int(Date().timeIntervalSince(startTime) * 1000)
    }

    /// Number of events recorded
    var totalEvents: Int {
        events.count
    }

    /// Check if an effect is currently active
    func isEffectActive(_ effectType: String) -> Bool {
        activeEffects.contains(effectType)
    }

    // MARK: - Tracking Control

    /// Start tracking a new recording session
    /// - Parameters:
    ///   - sampleRate: Audio sample rate in Hz
    ///   - channels: Number of audio channels
    ///   - initialEffects: Effects that are already active when recording starts
    func startTracking(
        sampleRate: Int = 48000,
        channels: Int = 1,
        initialEffects: [(effectType: String, params: [String: Any]?)] = []
    ) {
        if isTracking {
            mediaLogger.info("[EffectTracker] Already tracking, stopping previous session")
            _ = stopTracking()
        }

        startTime = Date()
        self.sampleRate = sampleRate
        self.channels = channels
        events = []
        activeEffects.removeAll()
        isTracking = true

        // Record initial effects at timestamp 0
        for effect in initialEffects {
            let event = AudioEffectEvent(
                timestamp: 0,
                effectType: effect.effectType,
                action: .activate,
                params: effect.params?.mapValues { AnyCodable($0) }
            )
            events.append(event)
            activeEffects.insert(effect.effectType)

            mediaLogger.debug("[EffectTracker] Initial effect recorded: \(effect.effectType)")
        }

        mediaLogger.info("[EffectTracker] Tracking started with \(initialEffects.count) initial effects")
    }

    /// Stop tracking and return the complete timeline
    func stopTracking() -> AudioEffectsRecordingTimeline? {
        guard isTracking, let startTime = startTime else {
            mediaLogger.info("[EffectTracker] Cannot stop: not tracking")
            return nil
        }

        let durationMs = currentTimestamp

        // Auto-close any active effects at the end
        let stillActive = Array(activeEffects)
        for effectType in stillActive {
            let event = AudioEffectEvent(
                timestamp: durationMs,
                effectType: effectType,
                action: .deactivate,
                params: nil
            )
            events.append(event)

            mediaLogger.debug("[EffectTracker] Auto-deactivated effect: \(effectType)")
        }

        // Calculate metadata
        let uniqueEffects = Set(events.map { $0.effectType })
        let parameterChanges = events.filter { $0.action == .update }.count

        let timeline = AudioEffectsRecordingTimeline(
            version: AudioEffectsRecordingTimeline.currentVersion,
            createdAt: ISO8601DateFormatter().string(from: startTime),
            duration: durationMs,
            sampleRate: sampleRate,
            channels: channels,
            events: events,
            metadata: AudioEffectsRecordingTimeline.TimelineMetadata(
                totalEffectsUsed: uniqueEffects.count,
                totalParameterChanges: parameterChanges,
                finalActiveEffects: [],
                tags: nil
            )
        )

        mediaLogger.info("[EffectTracker] Tracking stopped. Duration: \(durationMs)ms, Events: \(events.count)")

        // Reset state
        isTracking = false
        self.startTime = nil
        events = []
        activeEffects.removeAll()

        return timeline
    }

    /// Reset the tracker without returning a timeline
    func reset() {
        isTracking = false
        startTime = nil
        events = []
        activeEffects.removeAll()

        mediaLogger.debug("[EffectTracker] Reset")
    }

    // MARK: - Event Recording

    /// Record an effect activation
    /// - Parameters:
    ///   - effectType: The effect type identifier
    ///   - params: Initial parameters (usually zero/default values)
    func recordActivation(_ effectType: String, params: [String: Any]? = nil) {
        guard isTracking else {
            mediaLogger.info("[EffectTracker] Cannot record: not tracking")
            return
        }

        if activeEffects.contains(effectType) {
            mediaLogger.info("[EffectTracker] Effect already active: \(effectType)")
            return
        }

        let ms = currentTimestamp
        let event = AudioEffectEvent(
            timestamp: ms,
            effectType: effectType,
            action: .activate,
            params: params?.mapValues { AnyCodable($0) }
        )

        events.append(event)
        activeEffects.insert(effectType)

        mediaLogger.debug("[EffectTracker] Effect activated: \(effectType) at \(ms)ms")
    }

    /// Record an effect deactivation
    /// - Parameter effectType: The effect type identifier
    func recordDeactivation(_ effectType: String) {
        guard isTracking else {
            mediaLogger.info("[EffectTracker] Cannot record: not tracking")
            return
        }

        guard activeEffects.contains(effectType) else {
            mediaLogger.info("[EffectTracker] Effect not active: \(effectType)")
            return
        }

        let ms = currentTimestamp
        let event = AudioEffectEvent(
            timestamp: ms,
            effectType: effectType,
            action: .deactivate,
            params: nil
        )

        events.append(event)
        activeEffects.remove(effectType)

        mediaLogger.debug("[EffectTracker] Effect deactivated: \(effectType) at \(ms)ms")
    }

    /// Record a parameter update for an active effect
    /// - Parameters:
    ///   - effectType: The effect type identifier
    ///   - params: Updated parameters
    func recordUpdate(_ effectType: String, params: [String: Any]) {
        guard isTracking else {
            mediaLogger.info("[EffectTracker] Cannot record: not tracking")
            return
        }

        guard activeEffects.contains(effectType) else {
            mediaLogger.info("[EffectTracker] Cannot update inactive effect: \(effectType)")
            return
        }

        let ms = currentTimestamp
        let event = AudioEffectEvent(
            timestamp: ms,
            effectType: effectType,
            action: .update,
            params: params.mapValues { AnyCodable($0) }
        )

        events.append(event)

        mediaLogger.debug("[EffectTracker] Effect updated: \(effectType) at \(ms)ms")
    }

    // MARK: - Timeline Access

    /// Get the current timeline without stopping tracking
    func getCurrentTimeline() -> AudioEffectsRecordingTimeline? {
        guard isTracking, let startTime = startTime else {
            return nil
        }

        let durationMs = currentTimestamp
        let uniqueEffects = Set(events.map { $0.effectType })
        let parameterChanges = events.filter { $0.action == .update }.count

        return AudioEffectsRecordingTimeline(
            version: AudioEffectsRecordingTimeline.currentVersion,
            createdAt: ISO8601DateFormatter().string(from: startTime),
            duration: durationMs,
            sampleRate: sampleRate,
            channels: channels,
            events: events,
            metadata: AudioEffectsRecordingTimeline.TimelineMetadata(
                totalEffectsUsed: uniqueEffects.count,
                totalParameterChanges: parameterChanges,
                finalActiveEffects: Array(activeEffects),
                tags: nil
            )
        )
    }

    // MARK: - Parameter Graphing

    /// Get parameter values over time for visualization
    /// Returns data points for graphing effect parameters
    func getParameterGraph(
        for effectType: String,
        parameterName: String,
        resolution: Int = 100
    ) -> [ParameterGraphPoint] {
        guard !events.isEmpty else { return [] }

        let relevantEvents = events.filter { $0.effectType == effectType }
        guard !relevantEvents.isEmpty else { return [] }

        var points: [ParameterGraphPoint] = []
        var currentValue: Double = 0
        var isActive = false

        // Find the time range
        let maxTime = events.map { $0.timestamp }.max() ?? 0
        guard maxTime > 0 else { return [] }

        let stepSize = maxTime / resolution

        for step in 0...resolution {
            let targetTime = step * stepSize

            // Find all events up to this time for this effect
            for event in relevantEvents where event.timestamp <= targetTime {
                switch event.action {
                case .activate:
                    isActive = true
                    if let value = event.params?[parameterName]?.value as? Double {
                        currentValue = value
                    } else if let value = event.params?[parameterName]?.value as? Int {
                        currentValue = Double(value)
                    } else if let value = event.params?[parameterName]?.value as? Float {
                        currentValue = Double(value)
                    }
                case .deactivate:
                    isActive = false
                    currentValue = 0
                case .update:
                    if let value = event.params?[parameterName]?.value as? Double {
                        currentValue = value
                    } else if let value = event.params?[parameterName]?.value as? Int {
                        currentValue = Double(value)
                    } else if let value = event.params?[parameterName]?.value as? Float {
                        currentValue = Double(value)
                    }
                }
            }

            points.append(ParameterGraphPoint(
                timestamp: targetTime,
                value: isActive ? currentValue : 0,
                isActive: isActive
            ))
        }

        return points
    }

    /// Get all parameter changes for an effect type
    func getParameterChanges(for effectType: String) -> [(timestamp: Int, params: [String: Any])] {
        events
            .filter { $0.effectType == effectType && ($0.action == .activate || $0.action == .update) }
            .compactMap { event -> (Int, [String: Any])? in
                guard let params = event.params else { return nil }
                return (event.timestamp, params.mapValues { $0.value })
            }
    }
}

// MARK: - Parameter Graph Point

/// A single point in a parameter graph for visualization
struct ParameterGraphPoint: Identifiable {
    let id = UUID()
    let timestamp: Int  // milliseconds
    let value: Double
    let isActive: Bool

    var timestampSeconds: TimeInterval {
        TimeInterval(timestamp) / 1000.0
    }
}

// MARK: - Timeline Reconstruction

extension AudioEffectsRecordingTimeline {

    /// Reconstruct the state of all effects at a given timestamp (milliseconds)
    /// - Parameter targetTimestamp: Target timestamp in milliseconds
    /// - Returns: Dictionary of effect type to (isActive, params)
    func reconstructStateAt(_ targetTimestamp: Int) -> [String: (isActive: Bool, params: [String: Any]?)] {
        var state: [String: (isActive: Bool, params: [String: Any]?)] = [:]

        for event in events where event.timestamp <= targetTimestamp {
            switch event.action {
            case .activate:
                let params = event.params?.mapValues { $0.value }
                state[event.effectType] = (isActive: true, params: params)

            case .deactivate:
                state[event.effectType] = (isActive: false, params: nil)

            case .update:
                if var current = state[event.effectType], current.isActive {
                    var mergedParams = current.params ?? [:]
                    if let newParams = event.params {
                        for (key, value) in newParams {
                            mergedParams[key] = value.value
                        }
                    }
                    state[event.effectType] = (isActive: true, params: mergedParams)
                }
            }
        }

        return state
    }

    /// Reconstruct effect state at a specific time in seconds
    /// - Parameter timeSeconds: Target time in seconds
    /// - Returns: Dictionary of effect type to (isActive, params)
    func reconstructStateAtSeconds(_ timeSeconds: TimeInterval) -> [String: (isActive: Bool, params: [String: Any]?)] {
        reconstructStateAt(Int(timeSeconds * 1000))
    }

    /// Get all effects that were active at any point during the recording
    var allUsedEffects: [String] {
        Array(Set(events.filter { $0.action == .activate }.map { $0.effectType }))
    }

    // MARK: - Parameter Graphs for Visualization

    /// Generate parameter graph data for visualization
    /// - Parameters:
    ///   - effectType: The effect type to graph
    ///   - parameterName: The parameter to graph
    ///   - resolution: Number of data points (default 200 for smooth curves)
    /// - Returns: Array of graph points for rendering
    func generateParameterGraph(
        effectType: String,
        parameterName: String,
        resolution: Int = 200
    ) -> [ParameterGraphPoint] {
        guard duration > 0 else { return [] }

        let relevantEvents = events.filter { $0.effectType == effectType }
        guard !relevantEvents.isEmpty else { return [] }

        var points: [ParameterGraphPoint] = []
        let stepSize = duration / resolution

        for step in 0...resolution {
            let targetMs = step * stepSize
            let state = reconstructStateAt(targetMs)

            if let effectState = state[effectType], effectState.isActive {
                var value: Double = 0
                if let params = effectState.params,
                   let paramValue = params[parameterName] {
                    if let d = paramValue as? Double {
                        value = d
                    } else if let f = paramValue as? Float {
                        value = Double(f)
                    } else if let i = paramValue as? Int {
                        value = Double(i)
                    }
                }
                points.append(ParameterGraphPoint(
                    timestamp: targetMs,
                    value: value,
                    isActive: true
                ))
            } else {
                points.append(ParameterGraphPoint(
                    timestamp: targetMs,
                    value: 0,
                    isActive: false
                ))
            }
        }

        return points
    }

    /// Generate graphs for all parameters of an effect
    /// - Parameter effectType: The effect type
    /// - Returns: Dictionary of parameter name to graph points
    func generateAllParameterGraphs(for effectType: String) -> [String: [ParameterGraphPoint]] {
        var graphs: [String: [ParameterGraphPoint]] = [:]

        // Collect all parameter names used by this effect
        var parameterNames: Set<String> = []
        for event in events where event.effectType == effectType {
            if let params = event.params {
                parameterNames.formUnion(params.keys)
            }
        }

        // Generate graph for each parameter
        for paramName in parameterNames {
            graphs[paramName] = generateParameterGraph(
                effectType: effectType,
                parameterName: paramName
            )
        }

        return graphs
    }

    /// Get effect segments with their parameter configurations for timeline display
    /// Each segment includes all parameter values at activation and updates
    func getSegmentsWithConfigurations() -> [EffectSegmentWithConfig] {
        var segments: [EffectSegmentWithConfig] = []
        var activeSegments: [String: (startMs: Int, params: [String: Any])] = [:]

        for event in events {
            switch event.action {
            case .activate:
                let params = event.params?.mapValues { $0.value } ?? [:]
                activeSegments[event.effectType] = (event.timestamp, params)

            case .update:
                if var active = activeSegments[event.effectType] {
                    if let newParams = event.params {
                        for (key, value) in newParams {
                            active.params[key] = value.value
                        }
                    }
                    activeSegments[event.effectType] = active
                }

            case .deactivate:
                if let active = activeSegments[event.effectType] {
                    segments.append(EffectSegmentWithConfig(
                        effectType: event.effectType,
                        startMs: active.startMs,
                        endMs: event.timestamp,
                        parameters: active.params,
                        color: colorFor(effectType: event.effectType),
                        icon: iconFor(effectType: event.effectType)
                    ))
                    activeSegments.removeValue(forKey: event.effectType)
                }
            }
        }

        return segments.sorted { $0.startMs < $1.startMs }
    }

    /// Convert to the display-friendly AudioEffectsTimeline format
    func toDisplayTimeline() -> AudioEffectsTimeline {
        var segments: [AudioEffectSegment] = []
        var effectStartTimes: [String: Int] = [:]
        var appliedEffectsMap: [String: (duration: TimeInterval, count: Int)] = [:]

        for event in events {
            switch event.action {
            case .activate:
                effectStartTimes[event.effectType] = event.timestamp

            case .deactivate:
                if let startTime = effectStartTimes[event.effectType] {
                    let startSeconds = TimeInterval(startTime) / 1000.0
                    let endSeconds = TimeInterval(event.timestamp) / 1000.0

                    segments.append(AudioEffectSegment(
                        effectId: event.effectType,
                        startTime: startSeconds,
                        endTime: endSeconds,
                        effectName: event.effectType
                    ))

                    // Update applied effects stats
                    var current = appliedEffectsMap[event.effectType] ?? (duration: 0, count: 0)
                    current.duration += (endSeconds - startSeconds)
                    current.count += 1
                    appliedEffectsMap[event.effectType] = current

                    effectStartTimes.removeValue(forKey: event.effectType)
                }

            case .update:
                break // Updates don't create segments
            }
        }

        // Convert to applied effects
        let appliedEffects = appliedEffectsMap.map { effectType, stats in
            AudioEffectsTimeline.AppliedEffect(
                id: effectType,
                name: effectType,
                icon: iconFor(effectType: effectType),
                color: colorFor(effectType: effectType),
                totalDuration: stats.duration,
                segmentCount: stats.count
            )
        }

        return AudioEffectsTimeline(
            segments: segments,
            configurations: [],
            appliedEffects: appliedEffects
        )
    }

    private func iconFor(effectType: String) -> String {
        switch effectType {
        case "voice-coder": return "music.mic"
        case "baby-voice": return "face.smiling"
        case "demon-voice": return "flame"
        case "back-sound": return "speaker.wave.2"
        default: return "waveform"
        }
    }

    private func colorFor(effectType: String) -> String {
        switch effectType {
        case "voice-coder": return "#6366f1"
        case "baby-voice": return "#ec4899"
        case "demon-voice": return "#dc2626"
        case "back-sound": return "#22c55e"
        default: return "#8b5cf6"
        }
    }
}

// MARK: - JSON Serialization

extension AudioEffectsRecordingTimeline {
    /// Convert to JSON for storage in attachment metadata
    func toJSON() -> [String: Any]? {
        guard let data = try? JSONEncoder().encode(self),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json
    }

    /// Create from JSON dictionary
    static func fromJSON(_ json: [String: Any]) -> AudioEffectsRecordingTimeline? {
        guard let data = try? JSONSerialization.data(withJSONObject: json) else {
            return nil
        }
        return try? JSONDecoder().decode(AudioEffectsRecordingTimeline.self, from: data)
    }
}

// MARK: - Effect Segment With Configuration

/// Effect segment with full parameter configuration for timeline visualization
/// Displays parameter graphs within the segment
struct EffectSegmentWithConfig: Identifiable {
    let id = UUID()
    let effectType: String
    let startMs: Int      // milliseconds
    let endMs: Int        // milliseconds
    let parameters: [String: Any]
    let color: String
    let icon: String

    var startSeconds: TimeInterval {
        TimeInterval(startMs) / 1000.0
    }

    var endSeconds: TimeInterval {
        TimeInterval(endMs) / 1000.0
    }

    var durationSeconds: TimeInterval {
        endSeconds - startSeconds
    }

    var durationMs: Int {
        endMs - startMs
    }

    /// Get a specific parameter value
    func getParameter<T>(_ name: String) -> T? {
        parameters[name] as? T
    }

    /// Get all parameter names
    var parameterNames: [String] {
        Array(parameters.keys).sorted()
    }
}

// MARK: - Real-Time Effects Playback Support

extension AudioEffectsRecordingTimeline {

    /// Get the next event after a given timestamp (milliseconds)
    /// Used for real-time playback synchronization
    func getNextEvent(after milliseconds: Int) -> AudioEffectEvent? {
        events.first { $0.timestamp > milliseconds }
    }

    /// Get all events within a time range (milliseconds)
    func getEvents(from startMs: Int, to endMs: Int) -> [AudioEffectEvent] {
        events.filter { $0.timestamp >= startMs && $0.timestamp < endMs }
    }

    /// Calculate the audio frame position for a millisecond timestamp
    /// Used for sample-accurate effect application
    func audioFramePosition(for milliseconds: Int) -> Int64 {
        let seconds = TimeInterval(milliseconds) / 1000.0
        return Int64(seconds * Double(sampleRate))
    }

    /// Convert audio frame position to milliseconds
    func millisecondsForFrame(_ frame: Int64) -> Int {
        let seconds = Double(frame) / Double(sampleRate)
        return Int(seconds * 1000.0)
    }
}

// MARK: - Interpolation for Smooth Parameter Transitions

extension AudioEffectsRecordingTimeline {

    /// Get interpolated parameter value at exact millisecond position
    /// Provides smooth transitions between parameter updates
    func interpolatedParameterValue(
        effectType: String,
        parameterName: String,
        atMilliseconds targetMs: Int,
        interpolationType: InterpolationType = .linear
    ) -> Double? {
        let effectEvents = events.filter { $0.effectType == effectType }

        // Find surrounding events with this parameter
        var previousEvent: (timestamp: Int, value: Double)?
        var nextEvent: (timestamp: Int, value: Double)?

        for event in effectEvents {
            if let params = event.params,
               let value = extractDouble(from: params[parameterName]?.value) {
                if event.timestamp <= targetMs {
                    previousEvent = (event.timestamp, value)
                } else if nextEvent == nil {
                    nextEvent = (event.timestamp, value)
                    break
                }
            }
        }

        guard let prev = previousEvent else { return nil }

        // If no next event, return the previous value (step function)
        guard let next = nextEvent else { return prev.value }

        // Interpolate between previous and next
        let progress = Double(targetMs - prev.timestamp) / Double(next.timestamp - prev.timestamp)

        switch interpolationType {
        case .step:
            return prev.value
        case .linear:
            return prev.value + (next.value - prev.value) * progress
        case .easeInOut:
            let easedProgress = easeInOutCubic(progress)
            return prev.value + (next.value - prev.value) * easedProgress
        }
    }

    private func extractDouble(from value: Any?) -> Double? {
        if let d = value as? Double { return d }
        if let f = value as? Float { return Double(f) }
        if let i = value as? Int { return Double(i) }
        return nil
    }

    private func easeInOutCubic(_ t: Double) -> Double {
        t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
    }

    enum InterpolationType {
        case step       // No interpolation, immediate changes
        case linear     // Linear interpolation
        case easeInOut  // Smooth cubic ease in/out
    }
}
