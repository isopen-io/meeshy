//
//  AudioStreamManager.swift
//  Meeshy
//
//  Manages audio streams for voice translation
//  Handles microphone input, audio routing, and buffer management
//

import Foundation
import AVFoundation
import Combine

// MARK: - Audio Stream Manager

/// Manages audio capture and routing for voice translation
actor AudioStreamManager {

    // MARK: - Types

    enum AudioSource {
        case microphone
        case file(URL)
        case webrtc // From WebRTC call
    }

    enum AudioState: Equatable {
        case idle
        case capturing
        case paused
        case error(String)

        static func == (lhs: AudioState, rhs: AudioState) -> Bool {
            switch (lhs, rhs) {
            case (.idle, .idle): return true
            case (.capturing, .capturing): return true
            case (.paused, .paused): return true
            case (.error(let a), .error(let b)): return a == b
            default: return false
            }
        }
    }

    struct AudioConfiguration {
        var sampleRate: Double = 16000.0 // Optimal for speech recognition
        var channelCount: AVAudioChannelCount = 1 // Mono for speech
        var bufferSize: AVAudioFrameCount = 1024
        var enableEchoCancellation: Bool = true
        var enableNoiseSuppression: Bool = true
    }

    // MARK: - Properties

    private var audioEngine: AVAudioEngine?
    private var inputNode: AVAudioInputNode?
    private var mixerNode: AVAudioMixerNode?

    private(set) var state: AudioState = .idle
    private(set) var configuration: AudioConfiguration

    // Audio level monitoring
    private(set) var currentAudioLevel: Float = 0
    private var audioLevelCallback: ((Float) -> Void)?

    // Buffer callback for processing
    private var bufferCallback: ((AVAudioPCMBuffer, AVAudioTime) -> Void)?

    // Voice Activity Detection
    private var vadThreshold: Float = -50.0 // dB
    private(set) var isSpeechDetected: Bool = false
    private var silenceTimer: Timer?
    private var silenceDuration: TimeInterval = 0
    private let maxSilenceDuration: TimeInterval = 1.5 // End of utterance detection

    // MARK: - Initialization

    init(configuration: AudioConfiguration = AudioConfiguration()) {
        self.configuration = configuration
    }

    // MARK: - Setup

    /// Configure audio session for voice translation
    func setupAudioSession() async throws {
        let session = AVAudioSession.sharedInstance()

        // Configure for voice chat with echo cancellation
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [
                .defaultToSpeaker,
                .allowBluetooth,
                .allowBluetoothA2DP,
                .mixWithOthers
            ]
        )

        // Set preferred sample rate
        try session.setPreferredSampleRate(configuration.sampleRate)

        // Set preferred buffer duration for low latency
        try session.setPreferredIOBufferDuration(0.005) // 5ms

        // Activate session
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        // Setup audio engine
        audioEngine = AVAudioEngine()
        inputNode = audioEngine?.inputNode
    }

    // MARK: - Capture Control

    /// Start capturing audio from microphone
    func startCapture(
        bufferCallback: @escaping (AVAudioPCMBuffer, AVAudioTime) -> Void,
        audioLevelCallback: ((Float) -> Void)? = nil
    ) async throws {
        guard state != .capturing else { return }

        self.bufferCallback = bufferCallback
        self.audioLevelCallback = audioLevelCallback

        try await setupAudioSession()

        guard let audioEngine = audioEngine,
              let inputNode = inputNode else {
            throw AudioError.engineNotInitialized
        }

        // Get the native format
        let nativeFormat = inputNode.outputFormat(forBus: 0)

        // Create format for speech recognition (16kHz mono)
        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: configuration.sampleRate,
            channels: configuration.channelCount,
            interleaved: false
        ) else {
            throw AudioError.invalidFormat
        }

        // Install tap on input node
        if nativeFormat.sampleRate != configuration.sampleRate {
            // Need format conversion
            mixerNode = AVAudioMixerNode()
            audioEngine.attach(mixerNode!)

            audioEngine.connect(inputNode, to: mixerNode!, format: nativeFormat)

            mixerNode!.installTap(
                onBus: 0,
                bufferSize: configuration.bufferSize,
                format: targetFormat
            ) { [weak self] buffer, time in
                Task {
                    await self?.processBuffer(buffer, time: time)
                }
            }
        } else {
            inputNode.installTap(
                onBus: 0,
                bufferSize: configuration.bufferSize,
                format: nativeFormat
            ) { [weak self] buffer, time in
                Task {
                    await self?.processBuffer(buffer, time: time)
                }
            }
        }

        audioEngine.prepare()
        try audioEngine.start()

        state = .capturing
    }

    /// Stop capturing audio
    func stopCapture() {
        inputNode?.removeTap(onBus: 0)
        mixerNode?.removeTap(onBus: 0)
        audioEngine?.stop()

        silenceTimer?.invalidate()
        silenceTimer = nil

        state = .idle
        currentAudioLevel = 0
        isSpeechDetected = false
    }

    /// Pause audio capture
    func pauseCapture() {
        audioEngine?.pause()
        state = .paused
    }

    /// Resume audio capture
    func resumeCapture() throws {
        try audioEngine?.start()
        state = .capturing
    }

    // MARK: - Audio Processing

    private func processBuffer(_ buffer: AVAudioPCMBuffer, time: AVAudioTime) {
        // Calculate audio level
        let level = calculateAudioLevel(buffer)
        currentAudioLevel = level
        audioLevelCallback?(level)

        // Voice Activity Detection
        updateVAD(level: level)

        // Forward buffer for processing
        bufferCallback?(buffer, time)
    }

    private func calculateAudioLevel(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData else { return -160 }

        let channelDataValue = channelData.pointee
        let frameLength = Int(buffer.frameLength)

        var sum: Float = 0
        for i in 0..<frameLength {
            let sample = channelDataValue[i]
            sum += sample * sample
        }

        let rms = sqrt(sum / Float(frameLength))
        let db = 20 * log10(max(rms, 0.000001))

        return db
    }

    private func updateVAD(level: Float) {
        let wasSpeaking = isSpeechDetected

        if level > vadThreshold {
            isSpeechDetected = true
            silenceDuration = 0
            silenceTimer?.invalidate()
            silenceTimer = nil
        } else if wasSpeaking {
            // Start or continue silence timer
            silenceDuration += Double(configuration.bufferSize) / configuration.sampleRate

            if silenceDuration >= maxSilenceDuration {
                isSpeechDetected = false
            }
        }
    }

    // MARK: - Audio File Processing

    /// Read audio from a file and process it
    func processAudioFile(
        at url: URL,
        chunkCallback: @escaping (AVAudioPCMBuffer) -> Void,
        progressCallback: ((Double) -> Void)? = nil
    ) async throws {
        let file = try AVAudioFile(forReading: url)

        let fileFormat = file.processingFormat
        let totalFrames = AVAudioFrameCount(file.length)
        var processedFrames: AVAudioFrameCount = 0

        // Create buffer for reading
        let bufferSize: AVAudioFrameCount = 4096
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: fileFormat,
            frameCapacity: bufferSize
        ) else {
            throw AudioError.bufferCreationFailed
        }

        // Read and process in chunks
        while file.framePosition < file.length {
            try file.read(into: buffer)

            // Convert to target format if needed
            let processedBuffer: AVAudioPCMBuffer
            if fileFormat.sampleRate != configuration.sampleRate {
                processedBuffer = try convertBuffer(buffer, to: configuration.sampleRate)
            } else {
                processedBuffer = buffer
            }

            chunkCallback(processedBuffer)

            processedFrames += buffer.frameLength
            let progress = Double(processedFrames) / Double(totalFrames)
            progressCallback?(progress)
        }
    }

    /// Convert audio buffer to target sample rate
    private func convertBuffer(
        _ buffer: AVAudioPCMBuffer,
        to targetSampleRate: Double
    ) throws -> AVAudioPCMBuffer {
        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: targetSampleRate,
            channels: configuration.channelCount,
            interleaved: false
        ) else {
            throw AudioError.invalidFormat
        }

        guard let converter = AVAudioConverter(
            from: buffer.format,
            to: targetFormat
        ) else {
            throw AudioError.converterCreationFailed
        }

        let ratio = targetSampleRate / buffer.format.sampleRate
        let targetFrameCount = AVAudioFrameCount(Double(buffer.frameLength) * ratio)

        guard let convertedBuffer = AVAudioPCMBuffer(
            pcmFormat: targetFormat,
            frameCapacity: targetFrameCount
        ) else {
            throw AudioError.bufferCreationFailed
        }

        var error: NSError?
        let status = converter.convert(to: convertedBuffer, error: &error) { _, outStatus in
            outStatus.pointee = .haveData
            return buffer
        }

        if status == .error, let error = error {
            throw error
        }

        return convertedBuffer
    }

    // MARK: - Utility

    /// Get current audio format
    func getCurrentFormat() -> AVAudioFormat? {
        inputNode?.outputFormat(forBus: 0)
    }

    /// Check if audio input is available
    static func isAudioInputAvailable() -> Bool {
        AVAudioSession.sharedInstance().isInputAvailable
    }

    /// Request microphone permission
    static func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    // MARK: - Cleanup

    func cleanup() {
        stopCapture()
        audioEngine = nil
        inputNode = nil
        mixerNode = nil
        bufferCallback = nil
        audioLevelCallback = nil
    }
}

// MARK: - Audio Error

enum AudioError: Error, LocalizedError {
    case engineNotInitialized
    case invalidFormat
    case bufferCreationFailed
    case converterCreationFailed
    case fileReadError
    case permissionDenied

    var errorDescription: String? {
        switch self {
        case .engineNotInitialized:
            return "Audio engine not initialized"
        case .invalidFormat:
            return "Invalid audio format"
        case .bufferCreationFailed:
            return "Failed to create audio buffer"
        case .converterCreationFailed:
            return "Failed to create audio converter"
        case .fileReadError:
            return "Failed to read audio file"
        case .permissionDenied:
            return "Microphone permission denied"
        }
    }
}

// MARK: - Audio Level Visualization Helper

extension AudioStreamManager {

    /// Normalize audio level for visualization (0.0 to 1.0)
    static func normalizeAudioLevel(_ db: Float) -> Float {
        // Map -60dB to 0dB range to 0.0 to 1.0
        let minDb: Float = -60
        let maxDb: Float = 0

        let normalized = (db - minDb) / (maxDb - minDb)
        return max(0, min(1, normalized))
    }

    /// Get audio level as waveform bars (for visualization)
    func getWaveformBars(count: Int = 10) -> [Float] {
        let normalized = Self.normalizeAudioLevel(currentAudioLevel)

        // Create variation for visual effect
        return (0..<count).map { i in
            let variation = Float.random(in: 0.7...1.0)
            return normalized * variation
        }
    }
}

// MARK: - WebRTC Integration

extension AudioStreamManager {

    /// Configure for WebRTC call integration
    func configureForWebRTC() async throws {
        let session = AVAudioSession.sharedInstance()

        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [
                .allowBluetooth,
                .allowBluetoothA2DP,
                .defaultToSpeaker
            ]
        )

        try session.setActive(true)

        // WebRTC will handle its own audio routing
        // We just need to tap into it for translation
    }

    /// Tap into WebRTC audio stream
    /// Note: This requires integration with WebRTCManager
    func tapWebRTCAudio(
        audioTrack: Any, // RTCAudioTrack when WebRTC is integrated
        callback: @escaping (AVAudioPCMBuffer) -> Void
    ) {
        // This will be implemented when integrating with WebRTCManager
        // WebRTC provides audio samples that we can process for translation
    }
}
