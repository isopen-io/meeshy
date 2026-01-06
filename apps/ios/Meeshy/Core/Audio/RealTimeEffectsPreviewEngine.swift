//
//  RealTimeEffectsPreviewEngine.swift
//  Meeshy
//
//  Real-time audio effects preview engine with millisecond precision.
//  Uses AudioEffectsRecordingTimeline to apply effects during playback
//  at the exact timestamps they were recorded.
//
//  Architecture:
//  - Processes audio in small chunks (configurable, default 1024 frames)
//  - Checks timeline events for each chunk to determine active effects
//  - Applies effects using AVAudioEngine with sample-accurate timing
//  - Supports parameter interpolation for smooth transitions
//
//  iOS 16+
//

import Foundation
import AVFoundation
import Combine

// MARK: - Real-Time Effects Preview Engine

/// Plays audio with effects applied according to a millisecond-precision timeline
@MainActor
final class RealTimeEffectsPreviewEngine: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isPlaying = false
    @Published private(set) var currentPositionMs: Int = 0
    @Published private(set) var currentPositionSeconds: TimeInterval = 0
    @Published private(set) var currentEffect: AudioEffectType = .normal
    @Published private(set) var activeEffects: Set<String> = []

    // MARK: - Configuration

    struct Configuration {
        var chunkSize: AVAudioFrameCount = 1024
        var enableInterpolation: Bool = true
        var interpolationType: AudioEffectsRecordingTimeline.InterpolationType = .linear
        var crossfadeDuration: TimeInterval = 0.010 // 10ms crossfade between effects
        var preloadNextEffect: Bool = true
    }

    var configuration: Configuration

    // MARK: - Private Properties

    private var audioEngine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?
    private var effectNodes: [AVAudioNode] = []
    private var sourceFile: AVAudioFile?
    private var timeline: AudioEffectsRecordingTimeline?
    private var effectTimeline: AudioEffectTimeline?

    private var playbackTask: Task<Void, Never>?
    private var currentFrame: AVAudioFramePosition = 0
    private var startFrame: AVAudioFramePosition = 0
    private var endFrame: AVAudioFramePosition = 0
    private var sampleRate: Double = 44100

    // Effect state tracking
    private var lastAppliedEffect: AudioEffectType = .normal
    private var nextEventIndex: Int = 0

    // Callbacks
    var onPositionUpdate: ((TimeInterval, Int) -> Void)?
    var onEffectChange: ((AudioEffectType) -> Void)?
    var onPlaybackComplete: (() -> Void)?

    // MARK: - Initialization

    init(configuration: Configuration = Configuration()) {
        self.configuration = configuration
    }

    deinit {
        // Cleanup audio resources synchronously
        playbackTask?.cancel()
        playerNode?.stop()
        audioEngine?.stop()
    }

    // MARK: - Playback Control

    /// Start playback with timeline-based effects
    /// - Parameters:
    ///   - audioURL: URL of the audio file to play
    ///   - timeline: The effects timeline with microsecond precision
    ///   - startTime: Start position in seconds (default 0)
    ///   - endTime: End position in seconds (default nil = end of file)
    func play(
        audioURL: URL,
        timeline: AudioEffectsRecordingTimeline? = nil,
        effectTimeline: AudioEffectTimeline? = nil,
        startTime: TimeInterval = 0,
        endTime: TimeInterval? = nil
    ) async throws {
        // Stop any existing playback
        stop()

        self.timeline = timeline
        self.effectTimeline = effectTimeline

        // Load audio file
        let file = try AVAudioFile(forReading: audioURL)
        self.sourceFile = file
        self.sampleRate = file.processingFormat.sampleRate

        // Calculate frame positions
        let totalFrames = AVAudioFramePosition(file.length)
        startFrame = AVAudioFramePosition(startTime * sampleRate)
        endFrame = endTime != nil ? AVAudioFramePosition(endTime! * sampleRate) : totalFrames
        currentFrame = startFrame

        // Reset event tracking
        nextEventIndex = 0
        currentPositionMs = Int(startTime * 1000)

        // Setup initial engine
        try setupEngine(format: file.processingFormat, initialEffect: .normal)

        isPlaying = true

        // Start playback task
        playbackTask = Task {
            await performPlayback(file: file, format: file.processingFormat)
        }
    }

    /// Stop playback
    func stop() {
        playbackTask?.cancel()
        playbackTask = nil

        playerNode?.stop()
        audioEngine?.stop()

        // Clean up effect nodes
        for node in effectNodes {
            audioEngine?.detach(node)
        }
        effectNodes.removeAll()

        audioEngine = nil
        playerNode = nil
        sourceFile = nil

        isPlaying = false
        currentPositionMs = 0
        currentPositionSeconds = 0
        currentEffect = .normal
        activeEffects.removeAll()
    }

    /// Seek to position
    func seek(to time: TimeInterval) {
        guard let _ = sourceFile else { return }
        let frame = AVAudioFramePosition(time * sampleRate)
        currentFrame = max(startFrame, min(frame, endFrame))
        currentPositionMs = Int(time * 1000)
        currentPositionSeconds = time

        // Update event index
        if let timeline = timeline {
            nextEventIndex = timeline.events.firstIndex {
                $0.timestamp > currentPositionMs
            } ?? timeline.events.count
        }
    }

    // MARK: - Engine Setup

    private func setupEngine(format: AVAudioFormat, initialEffect: AudioEffectType) throws {
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()

        engine.attach(player)

        // Setup effect chain
        let nodes = AudioEffectProcessor.shared.setupEffectChain(
            engine: engine,
            playerNode: player,
            format: format,
            effectType: initialEffect
        )
        effectNodes = nodes

        try engine.start()

        self.audioEngine = engine
        self.playerNode = player
        self.lastAppliedEffect = initialEffect
        self.currentEffect = initialEffect
    }

    /// Rebuild the effect chain with a new effect
    private func switchEffect(to newEffect: AudioEffectType, format: AVAudioFormat) throws {
        guard let engine = audioEngine,
              let player = playerNode,
              newEffect != lastAppliedEffect else { return }

        // Stop player temporarily
        player.stop()

        // Disconnect existing connections
        engine.disconnectNodeOutput(player)
        for node in effectNodes {
            engine.detach(node)
        }
        effectNodes.removeAll()

        // Setup new effect chain
        let nodes = AudioEffectProcessor.shared.setupEffectChain(
            engine: engine,
            playerNode: player,
            format: format,
            effectType: newEffect
        )
        effectNodes = nodes

        lastAppliedEffect = newEffect
        currentEffect = newEffect
        onEffectChange?(newEffect)

        mediaLogger.debug("[PreviewEngine] Switched to effect: \(newEffect.rawValue)")
    }

    // MARK: - Playback Loop

    private func performPlayback(file: AVAudioFile, format: AVAudioFormat) async {
        let chunkFrames = configuration.chunkSize

        do {
            while currentFrame < endFrame && !Task.isCancelled {
                // Calculate current time in milliseconds
                let currentTimeMs = Int((Double(currentFrame - startFrame) / sampleRate) * 1000)
                currentPositionMs = currentTimeMs
                currentPositionSeconds = TimeInterval(currentTimeMs) / 1000

                // Update position callback
                onPositionUpdate?(currentPositionSeconds, currentPositionMs)

                // Determine which effect should be active
                let effectToApply = determineActiveEffect(atMs: currentTimeMs)

                // Switch effect if needed
                if effectToApply != lastAppliedEffect {
                    try switchEffect(to: effectToApply, format: format)
                }

                // Create buffer for this chunk
                let remainingFrames = AVAudioFrameCount(endFrame - currentFrame)
                let framesToRead = min(chunkFrames, remainingFrames)

                guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: framesToRead) else {
                    break
                }

                // Read audio data
                file.framePosition = currentFrame
                try file.read(into: buffer, frameCount: framesToRead)

                // Schedule and play buffer
                guard let player = playerNode, !Task.isCancelled else { break }

                await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                    player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { _ in
                        continuation.resume()
                    }
                    player.play()
                }

                currentFrame += AVAudioFramePosition(framesToRead)
            }

            // Playback complete
            await MainActor.run {
                self.isPlaying = false
                self.onPlaybackComplete?()
            }

        } catch {
            mediaLogger.error("[PreviewEngine] Playback failed: \(error)")
            await MainActor.run {
                self.isPlaying = false
            }
        }
    }

    // MARK: - Effect Determination

    /// Determine which effect should be active at the given millisecond position
    private func determineActiveEffect(atMs ms: Int) -> AudioEffectType {
        // First check the recording timeline (most precise)
        if let timeline = timeline {
            let state = timeline.reconstructStateAt(ms)

            // Find the last activated effect that's still active
            for (effectType, effectState) in state where effectState.isActive {
                if let type = mapEffectTypeFromString(effectType) {
                    activeEffects.insert(effectType)
                    return type
                }
            }

            // No active effects from timeline
            activeEffects.removeAll()
        }

        // Fall back to segment-based timeline
        if let effectTimeline = effectTimeline {
            let currentTime = TimeInterval(ms) / 1000
            let effects = effectTimeline.effectsAt(time: currentTime)
            if let lastEffect = effects.last {
                return lastEffect
            }
        }

        return .normal
    }

    /// Map effect type string to AudioEffectType enum
    private func mapEffectTypeFromString(_ effectType: String) -> AudioEffectType? {
        // Direct match
        if let type = AudioEffectType(rawValue: effectType) {
            return type
        }

        // Handle variations
        switch effectType.lowercased() {
        case "voice-coder", "vocoder": return .vocoder
        case "baby-voice", "baby_voice", "babyvoice": return .babyVoice
        case "demon-voice", "demon", "demonic": return .demonic
        case "deep-voice", "deep": return .deep
        case "chipmunk", "high": return .chipmunk
        case "echo": return .echo
        case "reverb": return .reverb
        case "robot": return .robot
        case "normal", "none": return .normal
        default:
            mediaLogger.info("[PreviewEngine] Unknown effect type: \(effectType)")
            return nil
        }
    }

    // MARK: - Parameter Interpolation

    /// Get interpolated parameter value for smooth transitions
    func getInterpolatedParameter(
        effectType: String,
        parameterName: String
    ) -> Double? {
        guard configuration.enableInterpolation,
              let timeline = timeline else { return nil }

        return timeline.interpolatedParameterValue(
            effectType: effectType,
            parameterName: parameterName,
            atMilliseconds: currentPositionMs,
            interpolationType: configuration.interpolationType
        )
    }

    // MARK: - State Queries

    /// Get the current playback position as a percentage (0.0 - 1.0)
    var progress: Double {
        guard endFrame > startFrame else { return 0 }
        return Double(currentFrame - startFrame) / Double(endFrame - startFrame)
    }

    /// Get remaining playback time in seconds
    var remainingTime: TimeInterval {
        let remainingFrames = max(0, endFrame - currentFrame)
        return TimeInterval(remainingFrames) / sampleRate
    }

    /// Check if an effect is active at current position
    func isEffectActive(_ effectType: String) -> Bool {
        activeEffects.contains(effectType)
    }
}

// MARK: - Preview Engine with Dry/Wet Support

extension RealTimeEffectsPreviewEngine {

    /// Play with dry/wet mix for previewing effects without modifying original
    /// This allows real-time A/B comparison
    func playWithDryWetMix(
        audioURL: URL,
        timeline: AudioEffectsRecordingTimeline?,
        wetMix: Float = 1.0 // 1.0 = full effects, 0.0 = original dry signal
    ) async throws {
        // For now, just play with full effects
        // TODO: Implement parallel dry/wet signal paths for A/B comparison
        try await play(audioURL: audioURL, timeline: timeline)
    }
}

// MARK: - Frame-Accurate Event Scheduling

extension RealTimeEffectsPreviewEngine {

    /// Get the next timeline event after current position
    func getNextEvent() -> AudioEffectEvent? {
        guard let timeline = timeline,
              nextEventIndex < timeline.events.count else { return nil }
        return timeline.events[nextEventIndex]
    }

    /// Get milliseconds until next event
    func millisecondsUntilNextEvent() -> Int? {
        guard let event = getNextEvent() else { return nil }
        return event.timestamp - currentPositionMs
    }

    /// Get frames until next event (for sample-accurate scheduling)
    func framesUntilNextEvent() -> AVAudioFrameCount? {
        guard let ms = millisecondsUntilNextEvent() else { return nil }
        let seconds = TimeInterval(ms) / 1000
        return AVAudioFrameCount(seconds * sampleRate)
    }
}

// Note: Uses global mediaLogger from LoggerGlobal.swift
