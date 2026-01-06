//
//  CallTranslationService.swift
//  Meeshy
//
//  Real-time voice translation service for WebRTC calls
//  Integrates STT, Translation, and TTS for live call translation
//

import Foundation
import AVFoundation
import Combine

#if canImport(WebRTC)
import WebRTC
#endif

// MARK: - Call Translation Service

/// Service for real-time voice translation during WebRTC calls
@MainActor
final class CallTranslationService: ObservableObject {

    // MARK: - Singleton

    static let shared = CallTranslationService()

    // MARK: - Types

    enum TranslationMode {
        /// Translate incoming audio (what the other person says)
        case incoming
        /// Translate outgoing audio (what you say)
        case outgoing
        /// Translate both directions (duplex)
        case duplex
    }

    struct CallTranslationConfig {
        var sourceLanguage: VoiceTranslationLanguage
        var targetLanguage: VoiceTranslationLanguage
        var mode: TranslationMode = .incoming
        var enableTTS: Bool = true
        var usePersonalVoice: Bool = false
        var showCaptions: Bool = true
        var autoDetectLanguage: Bool = false

        /// Speech rate for TTS output
        var speechRate: Float = AVSpeechUtteranceDefaultSpeechRate

        /// Volume for TTS output (relative to call volume)
        var ttsVolume: Float = 0.8
    }

    struct TranslationCaption: Identifiable {
        let id = UUID()
        let originalText: String
        let translatedText: String
        let sourceLanguage: VoiceTranslationLanguage
        let targetLanguage: VoiceTranslationLanguage
        let timestamp: Date
        let isFromMe: Bool
        let confidence: Float

        var isRecent: Bool {
            Date().timeIntervalSince(timestamp) < 10 // 10 seconds
        }
    }

    enum CallTranslationState {
        case idle
        case starting
        case active
        case paused
        case stopping
        case error(Error)
    }

    // MARK: - Published Properties

    @Published private(set) var state: CallTranslationState = .idle
    @Published private(set) var isTranslationActive: Bool = false
    @Published private(set) var captions: [TranslationCaption] = []
    @Published private(set) var currentCaption: TranslationCaption?
    @Published private(set) var isSpeaking: Bool = false
    @Published private(set) var isProcessing: Bool = false

    @Published var config: CallTranslationConfig = CallTranslationConfig(
        sourceLanguage: .english,
        targetLanguage: .french
    )

    // Statistics
    @Published private(set) var totalTranslations: Int = 0
    @Published private(set) var averageLatency: TimeInterval = 0

    // MARK: - Private Properties

    /// Speech recognition for incoming audio (what the other person says)
    private var incomingSpeechRecognition: SpeechRecognitionService?
    /// Speech recognition for outgoing audio (what you say) - used in duplex mode
    private var outgoingSpeechRecognition: SpeechRecognitionService?
    /// Legacy property for backward compatibility
    private var speechRecognitionService: SpeechRecognitionService? {
        get { incomingSpeechRecognition }
        set { incomingSpeechRecognition = newValue }
    }

    private var translationService: OnDeviceTranslationService?
    private var speechSynthesisService: SpeechSynthesisService?

    private var audioTapInstalled = false
    private var isListeningToRemoteAudio = false
    private var isListeningToLocalAudio = false

    private var translationDebounceTask: Task<Void, Never>?
    private var outgoingDebounceTask: Task<Void, Never>?
    private var pendingText: String = ""
    private var pendingOutgoingText: String = ""
    private var latencies: [TimeInterval] = []

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    private init() {
        translationService = OnDeviceTranslationService()
        speechSynthesisService = SpeechSynthesisService()
    }

    // MARK: - Public API

    /// Start translation for the current call
    func startTranslation(with config: CallTranslationConfig) async throws {
        guard case .idle = state else {
            throw CallTranslationError.alreadyActive
        }

        self.config = config
        state = .starting

        // Initialize speech recognition based on mode
        switch config.mode {
        case .incoming:
            // Only recognize incoming audio (what they say)
            try await setupIncomingRecognition()

        case .outgoing:
            // Only recognize outgoing audio (what you say)
            try await setupOutgoingRecognition()

        case .duplex:
            // Recognize both directions
            try await setupIncomingRecognition()
            try await setupOutgoingRecognition()
        }

        // Configure audio session for mixed mode (call + TTS)
        try? await speechSynthesisService?.configureMixedAudioSession()

        // Start listening based on mode
        do {
            if config.mode == .incoming || config.mode == .duplex {
                try await startListeningToRemoteAudio()
            }
            if config.mode == .outgoing || config.mode == .duplex {
                try await startListeningToLocalAudio()
            }
            state = .active
            isTranslationActive = true
        } catch {
            state = .error(error)
            throw error
        }
    }

    /// Setup recognition for incoming audio (what the other person says)
    private func setupIncomingRecognition() async throws {
        incomingSpeechRecognition = SpeechRecognitionService(
            language: config.sourceLanguage,
            requiresOnDevice: true,
            addsPunctuation: true
        )

        await incomingSpeechRecognition?.setCallbacks(
            onPartialResult: { [weak self] segment in
                Task { @MainActor in
                    self?.handlePartialTranscription(segment)
                }
            },
            onFinalResult: { [weak self] segment in
                Task { @MainActor in
                    self?.handleFinalTranscription(segment, isFromMe: false)
                }
            },
            onStateChange: nil,
            onError: { [weak self] error in
                Task { @MainActor in
                    self?.handleError(error)
                }
            }
        )
    }

    /// Setup recognition for outgoing audio (what you say)
    private func setupOutgoingRecognition() async throws {
        // For outgoing, we translate from target language to source language
        // (the reverse of incoming)
        outgoingSpeechRecognition = SpeechRecognitionService(
            language: config.targetLanguage,
            requiresOnDevice: true,
            addsPunctuation: true
        )

        await outgoingSpeechRecognition?.setCallbacks(
            onPartialResult: { [weak self] segment in
                Task { @MainActor in
                    self?.handleOutgoingPartialTranscription(segment)
                }
            },
            onFinalResult: { [weak self] segment in
                Task { @MainActor in
                    self?.handleFinalTranscription(segment, isFromMe: true)
                }
            },
            onStateChange: nil,
            onError: { [weak self] error in
                Task { @MainActor in
                    self?.handleError(error)
                }
            }
        )
    }

    /// Start listening to local audio (your voice) for outgoing translation
    private func startListeningToLocalAudio() async throws {
        guard !isListeningToLocalAudio else { return }

        try await outgoingSpeechRecognition?.startListening()
        isListeningToLocalAudio = true
    }

    private func stopListeningToLocalAudio() async {
        await outgoingSpeechRecognition?.stopListening()
        isListeningToLocalAudio = false
    }

    private func handleOutgoingPartialTranscription(_ segment: TranscriptionSegment) {
        // Could update UI with partial outgoing transcription
        isProcessing = true
    }

    /// Stop translation
    func stopTranslation() async {
        state = .stopping

        // Stop both recognition services
        await incomingSpeechRecognition?.stopListening()
        await outgoingSpeechRecognition?.stopListening()
        await speechSynthesisService?.stop()

        stopListeningToRemoteAudio()
        await stopListeningToLocalAudio()

        // Cancel debounce tasks
        translationDebounceTask?.cancel()
        outgoingDebounceTask?.cancel()

        // Clean up
        incomingSpeechRecognition = nil
        outgoingSpeechRecognition = nil

        state = .idle
        isTranslationActive = false
        isProcessing = false
        isSpeaking = false
    }

    /// Pause translation (during speaking)
    func pauseTranslation() async {
        guard case .active = state else { return }

        state = .paused
        await incomingSpeechRecognition?.stopListening()
        await outgoingSpeechRecognition?.stopListening()
    }

    /// Resume translation
    func resumeTranslation() async throws {
        guard case .paused = state else { return }

        if config.mode == .incoming || config.mode == .duplex {
            try await incomingSpeechRecognition?.startListening()
        }
        if config.mode == .outgoing || config.mode == .duplex {
            try await outgoingSpeechRecognition?.startListening()
        }
        state = .active
    }

    /// Toggle translation on/off
    func toggleTranslation() async throws {
        if isTranslationActive {
            await stopTranslation()
        } else {
            try await startTranslation(with: config)
        }
    }

    /// Swap source and target languages
    func swapLanguages() {
        let temp = config.sourceLanguage
        config.sourceLanguage = config.targetLanguage
        config.targetLanguage = temp

        // Reinitialize if active
        if isTranslationActive {
            Task {
                await stopTranslation()
                try? await startTranslation(with: config)
            }
        }
    }

    /// Clear all captions
    func clearCaptions() {
        captions.removeAll()
        currentCaption = nil
    }

    /// Speak a specific translation manually
    func speakTranslation(_ text: String) async {
        guard let service = speechSynthesisService else { return }

        isSpeaking = true

        let config = SpeechSynthesisService.SpeechConfiguration(
            rate: self.config.speechRate,
            volume: self.config.ttsVolume
        )

        if self.config.usePersonalVoice {
            try? await service.speakWithPersonalVoice(text, configuration: config)
        } else {
            await service.speak(text, language: self.config.targetLanguage, configuration: config)
        }

        // Wait for completion
        while await service.isSpeaking {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }

        isSpeaking = false
    }

    // MARK: - Audio Tap Integration

    /// Start listening to remote audio from WebRTC
    private func startListeningToRemoteAudio() async throws {
        guard !isListeningToRemoteAudio else { return }

        // Check if WebRTC is connected
        let webrtcManager = WebRTCManager.shared
        guard webrtcManager.isConnected else {
            throw CallTranslationError.callNotConnected
        }

        // Configure audio session for duplex mode if needed
        if config.mode == .duplex {
            try await configureDuplexAudioSession()
        }

        // For now, we'll use the speech recognition service directly
        // In a production implementation, we would tap into the WebRTC audio stream
        // and feed it to the speech recognizer

        // Start speech recognition (it will use the device microphone)
        // TODO: In production, tap into the remote audio track instead
        try await speechRecognitionService?.startListening()

        isListeningToRemoteAudio = true
    }

    private func stopListeningToRemoteAudio() {
        isListeningToRemoteAudio = false
    }

    /// Configure audio session for duplex translation
    /// This allows simultaneous listening and speaking
    private func configureDuplexAudioSession() async throws {
        let audioSession = AVAudioSession.sharedInstance()

        do {
            // Use playAndRecord with voice chat mode for best duplex experience
            try audioSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [
                    .allowBluetooth,
                    .allowBluetoothA2DP,
                    .defaultToSpeaker,
                    .mixWithOthers,
                    .duckOthers
                ]
            )

            // Lower the TTS volume when in duplex mode to not interfere with recognition
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        } catch {
            print("Failed to configure duplex audio session: \(error)")
            throw CallTranslationError.audioTapFailed
        }
    }

    // MARK: - Transcription Handlers

    private func handlePartialTranscription(_ segment: TranscriptionSegment) {
        isProcessing = true
        // Update current caption with partial text
        // (shown in real-time as user speaks)
    }

    private func handleFinalTranscription(_ segment: TranscriptionSegment, isFromMe: Bool) {
        let text = segment.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            isProcessing = false
            return
        }

        // Debounce to avoid translating fragments
        translationDebounceTask?.cancel()
        pendingText = text

        translationDebounceTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000) // 300ms

            if !Task.isCancelled {
                await translateAndSpeak(pendingText, isFromMe: isFromMe, confidence: segment.confidence)
            }
        }
    }

    // MARK: - Translation

    private func translateAndSpeak(_ text: String, isFromMe: Bool, confidence: Float) async {
        guard !text.isEmpty else {
            isProcessing = false
            return
        }

        let startTime = Date()

        // Determine translation direction based on who is speaking
        let fromLang: VoiceTranslationLanguage
        let toLang: VoiceTranslationLanguage

        if isFromMe {
            // Outgoing: translate what I say in my language to their language
            fromLang = config.targetLanguage // I speak in "target" language (e.g., French)
            toLang = config.sourceLanguage   // Translate to "source" language (e.g., English)
        } else {
            // Incoming: translate what they say in their language to my language
            fromLang = config.sourceLanguage // They speak in "source" language (e.g., English)
            toLang = config.targetLanguage   // Translate to "target" language (e.g., French)
        }

        do {
            // Translate
            let result = try await translationService?.translate(
                text,
                from: fromLang,
                to: toLang
            )

            guard let translatedText = result?.translatedText else {
                isProcessing = false
                return
            }

            let latency = Date().timeIntervalSince(startTime)
            updateLatencyStats(latency)

            // Create caption
            let caption = TranslationCaption(
                originalText: text,
                translatedText: translatedText,
                sourceLanguage: fromLang,
                targetLanguage: toLang,
                timestamp: Date(),
                isFromMe: isFromMe,
                confidence: confidence
            )

            currentCaption = caption
            captions.insert(caption, at: 0)
            totalTranslations += 1

            // Limit caption history
            if captions.count > 50 {
                captions = Array(captions.prefix(50))
            }

            // Speak translated text based on mode
            if config.enableTTS {
                if isFromMe {
                    // For outgoing: speak translation in their language
                    // (so they hear the translation of what I said)
                    await speakTranslation(translatedText)
                } else {
                    // For incoming: speak translation in my language
                    // (so I hear the translation of what they said)
                    await speakTranslation(translatedText)
                }
            }

            isProcessing = false

        } catch {
            handleError(error)
            isProcessing = false
        }
    }

    private func updateLatencyStats(_ latency: TimeInterval) {
        latencies.append(latency)
        if latencies.count > 20 {
            latencies.removeFirst()
        }
        averageLatency = latencies.reduce(0, +) / Double(latencies.count)
    }

    // MARK: - Error Handling

    private func handleError(_ error: Error) {
        state = .error(error)
        print("CallTranslationService error: \(error.localizedDescription)")
    }

    // MARK: - Cleanup

    func cleanup() async {
        await stopTranslation()
        captions.removeAll()
        currentCaption = nil
        translationService = nil
        speechSynthesisService = nil
        incomingSpeechRecognition = nil
        outgoingSpeechRecognition = nil
        cancellables.removeAll()
        totalTranslations = 0
        averageLatency = 0
        latencies.removeAll()
        pendingText = ""
        pendingOutgoingText = ""
    }
}

// MARK: - Call Translation Errors

enum CallTranslationError: Error, LocalizedError {
    case alreadyActive
    case notActive
    case callNotConnected
    case audioTapFailed
    case translationFailed
    case ttsFailed

    var errorDescription: String? {
        switch self {
        case .alreadyActive:
            return "Translation is already active"
        case .notActive:
            return "Translation is not active"
        case .callNotConnected:
            return "Call is not connected"
        case .audioTapFailed:
            return "Failed to tap into call audio"
        case .translationFailed:
            return "Translation failed"
        case .ttsFailed:
            return "Text-to-speech failed"
        }
    }
}

// MARK: - Quick Access Extension

extension CallTranslationService {

    /// Quick start translation with default settings
    func quickStart(
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async throws {
        let config = CallTranslationConfig(
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            mode: .incoming,
            enableTTS: true
        )
        try await startTranslation(with: config)
    }

    /// Get recent captions (last 10 seconds)
    var recentCaptions: [TranslationCaption] {
        captions.filter { $0.isRecent }
    }

    /// Export captions as text
    func exportCaptionsAsText() -> String {
        var text = "Call Translation Transcript\n"
        text += "===========================\n"
        text += "Languages: \(config.sourceLanguage.nativeName) -> \(config.targetLanguage.nativeName)\n\n"

        for caption in captions.reversed() {
            let time = caption.timestamp.formatted(date: .omitted, time: .shortened)
            let speaker = caption.isFromMe ? "Me" : "Them"
            text += "[\(time)] \(speaker):\n"
            text += "  Original: \(caption.originalText)\n"
            text += "  Translation: \(caption.translatedText)\n\n"
        }

        return text
    }
}
