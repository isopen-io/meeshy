//
//  SpeechRecognitionService.swift
//  Meeshy
//
//  On-device speech recognition service for real-time and recorded audio
//

import Foundation
import Speech
import AVFoundation
import Combine

// MARK: - Speech Recognition Service

/// Service for on-device speech recognition
/// Supports both real-time streaming and recorded audio file transcription
actor SpeechRecognitionService {

    // MARK: - Properties

    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var audioEngine: AVAudioEngine?

    private let language: VoiceTranslationLanguage
    private var startTime: Date?

    // State
    private(set) var state: RecognitionState = .idle
    private(set) var currentTranscription: String = ""
    private(set) var segments: [TranscriptionSegment] = []

    // Callbacks
    private var onPartialResult: ((TranscriptionSegment) -> Void)?
    private var onFinalResult: ((TranscriptionSegment) -> Void)?
    private var onStateChange: ((RecognitionState) -> Void)?
    private var onError: ((RecognitionError) -> Void)?

    // Configuration
    private let requiresOnDevice: Bool
    private let addsPunctuation: Bool

    // MARK: - Initialization

    init(
        language: VoiceTranslationLanguage,
        requiresOnDevice: Bool = true,
        addsPunctuation: Bool = true
    ) {
        self.language = language
        self.requiresOnDevice = requiresOnDevice
        self.addsPunctuation = addsPunctuation

        self.speechRecognizer = SFSpeechRecognizer(locale: language.locale)
    }

    // MARK: - Authorization

    /// Check if speech recognition is authorized
    static func checkAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    /// Request speech recognition authorization
    static func requestAuthorization() async -> Bool {
        let status = await checkAuthorization()
        return status == .authorized
    }

    // MARK: - Availability Check

    /// Check if on-device recognition is available for current language
    func isOnDeviceAvailable() -> Bool {
        guard let recognizer = speechRecognizer else { return false }
        return recognizer.supportsOnDeviceRecognition
    }

    /// Check if recognizer is available at all
    func isAvailable() -> Bool {
        guard let recognizer = speechRecognizer else { return false }
        return recognizer.isAvailable
    }

    // MARK: - Callbacks Setup

    func setCallbacks(
        onPartialResult: @escaping (TranscriptionSegment) -> Void,
        onFinalResult: @escaping (TranscriptionSegment) -> Void,
        onStateChange: ((RecognitionState) -> Void)? = nil,
        onError: ((RecognitionError) -> Void)? = nil
    ) {
        self.onPartialResult = onPartialResult
        self.onFinalResult = onFinalResult
        self.onStateChange = onStateChange
        self.onError = onError
    }

    // MARK: - Real-Time Recognition (Streaming)

    /// Start real-time speech recognition from microphone
    func startListening() async throws {
        guard state.canStart else {
            throw RecognitionError.recognitionFailed("Recognition already in progress")
        }

        // Check authorization
        let status = await Self.checkAuthorization()
        guard status == .authorized else {
            throw RecognitionError.notAuthorized
        }

        // Check availability
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            throw RecognitionError.notAvailable
        }

        // Check on-device support if required
        if requiresOnDevice && !recognizer.supportsOnDeviceRecognition {
            throw RecognitionError.noOnDeviceSupport
        }

        updateState(.starting)

        do {
            try await setupAudioSession()
            try await startRecognition()
            updateState(.listening)
        } catch {
            updateState(.error(.audioSessionError(error.localizedDescription)))
            throw error
        }
    }

    /// Stop real-time recognition
    func stopListening() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()

        audioEngine = nil
        recognitionRequest = nil
        recognitionTask = nil

        updateState(.stopped)
    }

    /// Pause recognition temporarily
    func pause() {
        guard state == .listening else { return }
        audioEngine?.pause()
        updateState(.paused)
    }

    /// Resume recognition after pause
    func resume() throws {
        guard state == .paused else { return }
        try audioEngine?.start()
        updateState(.listening)
    }

    // MARK: - Audio File Transcription

    /// Transcribe a recorded audio file
    /// - Parameters:
    ///   - url: URL of the audio file
    ///   - progressCallback: Optional callback for progress updates (0.0 to 1.0)
    /// - Returns: Array of transcription segments
    func transcribeAudioFile(
        at url: URL,
        progressCallback: ((Double) -> Void)? = nil
    ) async throws -> [TranscriptionSegment] {

        // Check authorization
        let status = await Self.checkAuthorization()
        guard status == .authorized else {
            throw RecognitionError.notAuthorized
        }

        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            throw RecognitionError.notAvailable
        }

        updateState(.processing)
        startTime = Date()

        // Create recognition request for audio file
        let request = SFSpeechURLRecognitionRequest(url: url)

        // Configure for on-device if available
        if recognizer.supportsOnDeviceRecognition && requiresOnDevice {
            request.requiresOnDeviceRecognition = true
        }

        request.shouldReportPartialResults = true

        if #available(iOS 16, *) {
            request.addsPunctuation = addsPunctuation
        }

        var transcriptionSegments: [TranscriptionSegment] = []

        return try await withCheckedThrowingContinuation { continuation in
            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self = self else { return }

                if let error = error {
                    Task {
                        await self.updateState(.error(.recognitionFailed(error.localizedDescription)))
                    }
                    continuation.resume(throwing: RecognitionError.recognitionFailed(error.localizedDescription))
                    return
                }

                guard let result = result else { return }

                let segment = TranscriptionSegment(
                    text: result.bestTranscription.formattedString,
                    language: self.language,
                    confidence: self.calculateConfidence(from: result),
                    isFinal: result.isFinal,
                    offsetFromStart: Date().timeIntervalSince(self.startTime ?? Date())
                )

                if result.isFinal {
                    transcriptionSegments.append(segment)
                    Task {
                        await self.updateState(.stopped)
                    }
                    continuation.resume(returning: transcriptionSegments)
                } else {
                    // Report progress based on partial results
                    progressCallback?(0.5) // Approximate progress

                    Task {
                        await self.handlePartialResult(segment)
                    }
                }
            }
        }
    }

    /// Transcribe audio data directly (for voice messages)
    /// - Parameters:
    ///   - audioData: Raw audio data
    ///   - format: Audio format description
    /// - Returns: Transcription result
    func transcribeAudioData(
        _ audioData: Data,
        format: AVAudioFormat
    ) async throws -> TranscriptionSegment {

        // Write to temporary file
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("wav")

        try audioData.write(to: tempURL)

        defer {
            try? FileManager.default.removeItem(at: tempURL)
        }

        let segments = try await transcribeAudioFile(at: tempURL)

        // Combine all segments into one
        let fullText = segments.map { $0.text }.joined(separator: " ")
        let avgConfidence = segments.isEmpty ? 0 : segments.map { $0.confidence }.reduce(0, +) / Float(segments.count)

        return TranscriptionSegment(
            text: fullText,
            language: language,
            confidence: avgConfidence,
            isFinal: true
        )
    }

    // MARK: - Private Methods

    private func setupAudioSession() async throws {
        let audioSession = AVAudioSession.sharedInstance()

        try audioSession.setCategory(
            .playAndRecord,
            mode: .measurement,
            options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
        )

        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private func startRecognition() async throws {
        audioEngine = AVAudioEngine()

        guard let audioEngine = audioEngine else {
            throw RecognitionError.audioSessionError("Failed to create audio engine")
        }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()

        guard let recognitionRequest = recognitionRequest,
              let recognizer = speechRecognizer else {
            throw RecognitionError.notAvailable
        }

        // Configure request
        recognitionRequest.shouldReportPartialResults = true

        if recognizer.supportsOnDeviceRecognition && requiresOnDevice {
            recognitionRequest.requiresOnDeviceRecognition = true
        }

        if #available(iOS 16, *) {
            recognitionRequest.addsPunctuation = addsPunctuation
        }

        // Set task hint for better accuracy
        recognitionRequest.taskHint = .dictation

        startTime = Date()

        // Setup audio tap
        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        // Start audio engine
        audioEngine.prepare()
        try audioEngine.start()

        // Start recognition task
        recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            Task {
                await self.handleRecognitionResult(result: result, error: error)
            }
        }
    }

    private func handleRecognitionResult(result: SFSpeechRecognitionResult?, error: Error?) {
        if let error = error {
            // Check if it's just a cancellation
            if (error as NSError).code == 1 || (error as NSError).code == 216 {
                // User cancelled or no speech detected - not a real error
                return
            }

            updateState(.error(.recognitionFailed(error.localizedDescription)))
            onError?(.recognitionFailed(error.localizedDescription))
            return
        }

        guard let result = result else { return }

        let segment = TranscriptionSegment(
            text: result.bestTranscription.formattedString,
            language: language,
            confidence: calculateConfidence(from: result),
            isFinal: result.isFinal,
            offsetFromStart: Date().timeIntervalSince(startTime ?? Date())
        )

        currentTranscription = segment.text

        if result.isFinal {
            segments.append(segment)
            onFinalResult?(segment)
        } else {
            onPartialResult?(segment)
        }
    }

    private func handlePartialResult(_ segment: TranscriptionSegment) {
        currentTranscription = segment.text
        onPartialResult?(segment)
    }

    private func calculateConfidence(from result: SFSpeechRecognitionResult) -> Float {
        let segments = result.bestTranscription.segments
        guard !segments.isEmpty else { return 0 }

        let totalConfidence = segments.reduce(0.0) { $0 + $1.confidence }
        return totalConfidence / Float(segments.count)
    }

    private func updateState(_ newState: RecognitionState) {
        state = newState
        onStateChange?(newState)
    }

    // MARK: - Cleanup

    func cleanup() {
        stopListening()
        speechRecognizer = nil
        segments.removeAll()
        currentTranscription = ""
    }
}

// MARK: - Batch Transcription

extension SpeechRecognitionService {

    /// Transcribe multiple audio files in batch
    /// - Parameters:
    ///   - urls: Array of audio file URLs
    ///   - progressCallback: Progress callback (file index, total files, file progress)
    /// - Returns: Dictionary mapping URL to transcription segments
    func transcribeBatch(
        urls: [URL],
        progressCallback: ((Int, Int, Double) -> Void)? = nil
    ) async throws -> [URL: [TranscriptionSegment]] {

        var results: [URL: [TranscriptionSegment]] = [:]

        for (index, url) in urls.enumerated() {
            do {
                let segments = try await transcribeAudioFile(at: url) { progress in
                    progressCallback?(index, urls.count, progress)
                }
                results[url] = segments
            } catch {
                // Log error but continue with other files
                print("Failed to transcribe \(url): \(error)")
                results[url] = []
            }
        }

        return results
    }
}

// MARK: - Voice Message Helper

extension SpeechRecognitionService {

    /// Convenience method for transcribing voice messages
    /// - Parameters:
    ///   - messageURL: URL of the voice message
    ///   - autoDetectLanguage: Whether to auto-detect language (uses NLLanguageRecognizer first)
    /// - Returns: Transcription result with detected language
    func transcribeVoiceMessage(
        at messageURL: URL
    ) async throws -> (text: String, language: VoiceTranslationLanguage, confidence: Float) {

        let segments = try await transcribeAudioFile(at: messageURL)

        let fullText = segments.map { $0.text }.joined(separator: " ")
        let avgConfidence = segments.isEmpty ? 0 : segments.map { $0.confidence }.reduce(0, +) / Float(segments.count)

        return (fullText, language, avgConfidence)
    }
}

// MARK: - Language Detection Helper

extension SpeechRecognitionService {

    /// Try to detect the language of an audio file
    /// Uses a short sample to determine the language before full transcription
    static func detectLanguage(in audioURL: URL) async -> VoiceTranslationLanguage? {
        // Try each supported language and see which one gives best confidence
        var bestMatch: (language: VoiceTranslationLanguage, confidence: Float) = (.english, 0)

        // Try major languages first
        let priorityLanguages: [VoiceTranslationLanguage] = [
            .english, .french, .spanish, .german, .chinese, .japanese
        ]

        for lang in priorityLanguages {
            do {
                let service = SpeechRecognitionService(language: lang, requiresOnDevice: true)
                let segments = try await service.transcribeAudioFile(at: audioURL)

                if let segment = segments.first, segment.confidence > bestMatch.confidence {
                    bestMatch = (lang, segment.confidence)
                }
            } catch {
                continue
            }
        }

        return bestMatch.confidence > 0.5 ? bestMatch.language : nil
    }
}
