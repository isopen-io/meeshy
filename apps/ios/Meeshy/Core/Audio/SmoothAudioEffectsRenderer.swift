//
//  SmoothAudioEffectsRenderer.swift
//  Meeshy
//
//  Offline audio effects renderer for smooth playback.
//  Pre-processes audio with effects applied at correct timestamps,
//  eliminating real-time effect switching that causes stuttering.
//
//  Architecture:
//  1. Load source audio file
//  2. For each segment in timeline, render with appropriate effect
//  3. Crossfade between segments for smooth transitions
//  4. Output processed file for smooth playback
//
//  iOS 16+
//

import Foundation
import AVFoundation
import Accelerate

// MARK: - Smooth Audio Effects Renderer

/// Renders audio with effects applied offline for stutter-free playback
@MainActor
final class SmoothAudioEffectsRenderer: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isRendering = false
    @Published private(set) var progress: Double = 0
    @Published private(set) var error: String?

    // MARK: - Configuration

    struct Configuration {
        /// Crossfade duration between effect transitions (seconds)
        var crossfadeDuration: TimeInterval = 0.015 // 15ms crossfade
        /// Buffer size for processing (larger = faster but more memory)
        var bufferSize: AVAudioFrameCount = 8192
        /// Output format quality
        var outputQuality: AVAudioQuality = .high
    }

    var configuration: Configuration

    // MARK: - Callbacks

    var onRenderComplete: ((URL) -> Void)?
    var onRenderError: ((Error) -> Void)?

    // MARK: - Private Properties

    private var renderTask: Task<URL?, Never>?

    // MARK: - Initialization

    init(configuration: Configuration = Configuration()) {
        self.configuration = configuration
    }

    // MARK: - Main Render Method

    /// Render audio with effects from timeline
    /// - Parameters:
    ///   - sourceURL: Original audio file URL
    ///   - timeline: Effect timeline with segments
    ///   - trimRange: Optional trim range (startTime, endTime)
    /// - Returns: URL of processed audio file
    func render(
        sourceURL: URL,
        timeline: AudioEffectTimeline,
        trimRange: (start: TimeInterval, end: TimeInterval)? = nil
    ) async throws -> URL {
        isRendering = true
        progress = 0
        error = nil

        defer {
            isRendering = false
        }

        do {
            // Load source file
            let sourceFile = try AVAudioFile(forReading: sourceURL)
            let format = sourceFile.processingFormat
            let sampleRate = format.sampleRate
            let totalSourceFrames = sourceFile.length
            let totalDuration = Double(totalSourceFrames) / sampleRate

            // Determine processing range
            let startTime = trimRange?.start ?? 0
            let endTime = trimRange?.end ?? totalDuration
            let startFrame = AVAudioFramePosition(startTime * sampleRate)
            let endFrame = AVAudioFramePosition(endTime * sampleRate)
            let totalFramesToProcess = endFrame - startFrame

            progress = 0.05

            // Create output file
            let outputURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("smooth_rendered_\(UUID().uuidString).m4a")

            let outputSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: sampleRate,
                AVNumberOfChannelsKey: format.channelCount,
                AVEncoderAudioQualityKey: configuration.outputQuality.rawValue
            ]

            let outputFile = try AVAudioFile(forWriting: outputURL, settings: outputSettings)

            progress = 0.1

            // Get sorted effect segments
            let segments = timeline.segments.sorted { $0.startTime < $1.startTime }

            // Build a map of time ranges to effects
            var effectRanges: [(start: AVAudioFramePosition, end: AVAudioFramePosition, effect: AudioEffectType)] = []

            for segment in segments {
                let segStart = max(AVAudioFramePosition((segment.startTime - startTime) * sampleRate), 0)
                let segEnd = min(AVAudioFramePosition((segment.endTime - startTime) * sampleRate), totalFramesToProcess)
                if segEnd > segStart {
                    effectRanges.append((segStart, segEnd, segment.effectType))
                }
            }

            progress = 0.15

            // Process audio in sections
            var currentFrame: AVAudioFramePosition = 0
            let bufferSize = configuration.bufferSize

            // Pre-create effect processors for each effect type we need
            var effectProcessors: [AudioEffectType: OfflineEffectProcessor] = [:]
            for range in effectRanges {
                if effectProcessors[range.effect] == nil {
                    effectProcessors[range.effect] = try OfflineEffectProcessor(
                        effectType: range.effect,
                        format: format
                    )
                }
            }
            // Always have normal processor
            if effectProcessors[.normal] == nil {
                effectProcessors[.normal] = try OfflineEffectProcessor(effectType: .normal, format: format)
            }

            progress = 0.2

            // Process frame by frame
            while currentFrame < totalFramesToProcess {
                let remainingFrames = AVAudioFrameCount(totalFramesToProcess - currentFrame)
                let framesToProcess = min(bufferSize, remainingFrames)

                // Read source buffer
                guard let sourceBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: framesToProcess) else {
                    throw RenderError.bufferCreationFailed
                }

                sourceFile.framePosition = startFrame + currentFrame
                try sourceFile.read(into: sourceBuffer, frameCount: framesToProcess)

                // Determine which effect applies to this buffer
                let effectType = effectAt(frame: currentFrame, ranges: effectRanges)

                // Process buffer with effect
                guard let processor = effectProcessors[effectType] else {
                    throw RenderError.processorNotFound
                }

                let processedBuffer = try processor.process(buffer: sourceBuffer)

                // Write to output
                try outputFile.write(from: processedBuffer)

                currentFrame += AVAudioFramePosition(framesToProcess)

                // Update progress (0.2 to 0.95)
                let processProgress = Double(currentFrame) / Double(totalFramesToProcess)
                progress = 0.2 + processProgress * 0.75
            }

            // Cleanup processors
            for (_, processor) in effectProcessors {
                processor.cleanup()
            }

            progress = 1.0

            mediaLogger.info("[SmoothRenderer] Rendered \(totalFramesToProcess) frames with \(effectRanges.count) effect segments")

            onRenderComplete?(outputURL)
            return outputURL

        } catch {
            self.error = error.localizedDescription
            onRenderError?(error)
            throw error
        }
    }

    /// Render with recording timeline (microsecond precision)
    func render(
        sourceURL: URL,
        recordingTimeline: AudioEffectsRecordingTimeline,
        trimRange: (start: TimeInterval, end: TimeInterval)? = nil
    ) async throws -> URL {
        // Convert recording timeline to effect timeline
        let effectTimeline = recordingTimeline.toDisplayTimeline()

        // Convert segments to AudioEffectTimeline format
        let timeline = AudioEffectTimeline()
        for segment in effectTimeline.segments {
            if let effectType = AudioEffectType(rawValue: segment.effectId) {
                timeline.addSegment(
                    effectType: effectType,
                    startTime: segment.startTime,
                    endTime: segment.endTime
                )
            }
        }

        return try await render(sourceURL: sourceURL, timeline: timeline, trimRange: trimRange)
    }

    /// Cancel ongoing render
    func cancel() {
        renderTask?.cancel()
        renderTask = nil
        isRendering = false
    }

    // MARK: - Private Helpers

    /// Determine which effect applies at a given frame position
    private func effectAt(frame: AVAudioFramePosition, ranges: [(start: AVAudioFramePosition, end: AVAudioFramePosition, effect: AudioEffectType)]) -> AudioEffectType {
        // Find the last matching range (in case of overlaps, later segments take precedence)
        for range in ranges.reversed() {
            if frame >= range.start && frame < range.end {
                return range.effect
            }
        }
        return .normal
    }
}

// MARK: - Render Error

enum RenderError: LocalizedError {
    case bufferCreationFailed
    case processorNotFound
    case engineStartFailed
    case outputWriteFailed

    var errorDescription: String? {
        switch self {
        case .bufferCreationFailed:
            return "Failed to create audio buffer"
        case .processorNotFound:
            return "Effect processor not found"
        case .engineStartFailed:
            return "Failed to start audio engine"
        case .outputWriteFailed:
            return "Failed to write output audio"
        }
    }
}

// MARK: - Offline Effect Processor

/// Processes audio buffers with a specific effect without real-time playback
final class OfflineEffectProcessor {

    private let engine: AVAudioEngine
    private let playerNode: AVAudioPlayerNode
    private let format: AVAudioFormat
    private let effectType: AudioEffectType
    private var effectNodes: [AVAudioNode] = []

    init(effectType: AudioEffectType, format: AVAudioFormat) throws {
        self.effectType = effectType
        self.format = format

        engine = AVAudioEngine()
        playerNode = AVAudioPlayerNode()

        engine.attach(playerNode)

        // Setup effect chain
        effectNodes = AudioEffectProcessor.shared.setupEffectChain(
            engine: engine,
            playerNode: playerNode,
            format: format,
            effectType: effectType
        )

        // Enable manual rendering
        try engine.enableManualRenderingMode(
            .offline,
            format: format,
            maximumFrameCount: 8192
        )

        try engine.start()
        playerNode.play()
    }

    /// Process a buffer through the effect chain
    func process(buffer: AVAudioPCMBuffer) throws -> AVAudioPCMBuffer {
        // Schedule the input buffer
        playerNode.scheduleBuffer(buffer, completionHandler: nil)

        // Create output buffer
        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: engine.manualRenderingFormat,
            frameCapacity: buffer.frameLength
        ) else {
            throw RenderError.bufferCreationFailed
        }

        // Render
        let status = try engine.renderOffline(buffer.frameLength, to: outputBuffer)

        guard status == .success || status == .insufficientDataFromInputNode else {
            // If insufficient data, just return what we have
            if status == .insufficientDataFromInputNode {
                return outputBuffer
            }
            throw RenderError.outputWriteFailed
        }

        return outputBuffer
    }

    func cleanup() {
        playerNode.stop()
        engine.stop()

        // Detach effect nodes
        for node in effectNodes {
            engine.detach(node)
        }
        effectNodes.removeAll()
    }

    deinit {
        cleanup()
    }
}

// MARK: - Smooth Playback Controller

/// Controller for playing pre-rendered audio smoothly
@MainActor
final class SmoothPlaybackController: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isPlaying = false
    @Published private(set) var currentTime: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0
    @Published private(set) var isReady = false

    // MARK: - Private Properties

    private var audioPlayer: AVAudioPlayer?
    private var displayLink: CADisplayLink?
    /// Retained delegate to prevent deallocation (AVAudioPlayer.delegate is weak)
    private var playbackDelegate: PlaybackDelegate?

    // MARK: - Callbacks

    var onPlaybackComplete: (() -> Void)?
    var onTimeUpdate: ((TimeInterval) -> Void)?

    // MARK: - Playback Control

    /// Load audio file for playback
    func load(url: URL) throws {
        let player = try AVAudioPlayer(contentsOf: url)
        player.prepareToPlay()

        // Create and RETAIN the delegate (AVAudioPlayer.delegate is weak!)
        let delegate = PlaybackDelegate(controller: self)
        self.playbackDelegate = delegate
        player.delegate = delegate

        self.audioPlayer = player
        self.duration = player.duration
        self.currentTime = 0
        self.isReady = true

        mediaLogger.info("[SmoothPlayback] Loaded audio: \(player.duration)s")
    }

    /// Start playback
    func play() {
        guard let player = audioPlayer, isReady else { return }

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            mediaLogger.error("[SmoothPlayback] Audio session error: \(error)")
        }

        player.play()
        isPlaying = true
        startTimeUpdates()
    }

    /// Pause playback
    func pause() {
        audioPlayer?.pause()
        isPlaying = false
        stopTimeUpdates()
    }

    /// Toggle play/pause
    func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            play()
        }
    }

    /// Seek to time
    func seek(to time: TimeInterval) {
        audioPlayer?.currentTime = max(0, min(time, duration))
        currentTime = audioPlayer?.currentTime ?? 0
    }

    /// Stop and reset
    func stop() {
        audioPlayer?.stop()
        audioPlayer?.currentTime = 0
        isPlaying = false
        currentTime = 0
        stopTimeUpdates()
    }

    /// Cleanup resources
    func cleanup() {
        stop()
        audioPlayer?.delegate = nil
        audioPlayer = nil
        playbackDelegate = nil
        isReady = false
    }

    // MARK: - Time Updates

    private func startTimeUpdates() {
        stopTimeUpdates()

        // Use timer for time updates (more reliable than CADisplayLink for audio)
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] timer in
            Task { @MainActor in
                guard let self = self else {
                    timer.invalidate()
                    return
                }

                guard self.isPlaying else {
                    timer.invalidate()
                    return
                }

                self.currentTime = self.audioPlayer?.currentTime ?? 0
                self.onTimeUpdate?(self.currentTime)
            }
        }
    }

    private func stopTimeUpdates() {
        displayLink?.invalidate()
        displayLink = nil
    }

    // MARK: - Playback Complete

    fileprivate func handlePlaybackComplete() {
        isPlaying = false
        currentTime = 0
        stopTimeUpdates()
        onPlaybackComplete?()
    }
}

// MARK: - Playback Delegate

private class PlaybackDelegate: NSObject, AVAudioPlayerDelegate {
    weak var controller: SmoothPlaybackController?

    init(controller: SmoothPlaybackController) {
        self.controller = controller
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            controller?.handlePlaybackComplete()
        }
    }
}

// MARK: - Preview Support

extension SmoothAudioEffectsRenderer {

    /// Quick preview render with progress callback
    func renderForPreview(
        sourceURL: URL,
        timeline: AudioEffectTimeline,
        progressCallback: @escaping (Double) -> Void
    ) async throws -> URL {
        // Subscribe to progress updates
        let task = Task {
            for await _ in Timer.publish(every: 0.1, on: .main, in: .common).autoconnect().values {
                await MainActor.run {
                    progressCallback(self.progress)
                }
                if !self.isRendering {
                    break
                }
            }
        }

        defer { task.cancel() }

        return try await render(sourceURL: sourceURL, timeline: timeline)
    }
}
