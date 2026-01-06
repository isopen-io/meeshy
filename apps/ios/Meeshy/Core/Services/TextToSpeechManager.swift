//
//  TextToSpeechManager.swift
//  Meeshy
//
//  Text-to-speech service using Apple's AVSpeechSynthesizer
//  iOS 16+
//
//  ARCHITECTURE:
//  - Singleton pattern for app-wide usage
//  - Uses AVSpeechSynthesizer for native TTS
//  - Supports multiple languages with automatic voice selection
//  - Rate/pitch/volume customization
//

import Foundation
import AVFoundation

// MARK: - TTS Configuration

/// Configuration for text-to-speech playback
public struct TTSConfiguration: Sendable {
    /// Speech rate (0.0 to 1.0, default 0.5)
    public let rate: Float

    /// Pitch multiplier (0.5 to 2.0, default 1.0)
    public let pitch: Float

    /// Volume (0.0 to 1.0, default 1.0)
    public let volume: Float

    /// Language code (e.g., "fr-FR", "en-US")
    public let languageCode: String?

    public init(
        rate: Float = 0.5,
        pitch: Float = 1.0,
        volume: Float = 1.0,
        languageCode: String? = nil
    ) {
        self.rate = min(max(rate, 0.0), 1.0)
        self.pitch = min(max(pitch, 0.5), 2.0)
        self.volume = min(max(volume, 0.0), 1.0)
        self.languageCode = languageCode
    }

    /// Default French configuration
    public static let french = TTSConfiguration(languageCode: "fr-FR")

    /// Default English configuration
    public static let english = TTSConfiguration(languageCode: "en-US")

    /// Default configuration with system language
    public static let `default` = TTSConfiguration()
}

// MARK: - TTS State

/// Current state of the text-to-speech engine
public enum TTSState: Sendable, Equatable {
    case idle
    case speaking
    case paused
}

// MARK: - TTS Delegate

/// Protocol for TTS event callbacks
public protocol TextToSpeechDelegate: AnyObject {
    func textToSpeechDidStart()
    func textToSpeechDidFinish()
    func textToSpeechDidPause()
    func textToSpeechDidContinue()
    func textToSpeechDidCancel()
    func textToSpeechDidFail(with error: Error)
}

// Extension with default implementations
public extension TextToSpeechDelegate {
    func textToSpeechDidStart() {}
    func textToSpeechDidFinish() {}
    func textToSpeechDidPause() {}
    func textToSpeechDidContinue() {}
    func textToSpeechDidCancel() {}
    func textToSpeechDidFail(with error: Error) {}
}

// MARK: - Text To Speech Manager

/// Manages text-to-speech functionality using AVSpeechSynthesizer
@MainActor
public final class TextToSpeechManager: NSObject, ObservableObject {

    // MARK: - Singleton

    /// Shared instance for app-wide usage
    public static let shared = TextToSpeechManager()

    // MARK: - Published Properties

    /// Current TTS state
    @Published public private(set) var state: TTSState = .idle

    /// Current progress (0.0 to 1.0)
    @Published public private(set) var progress: Double = 0.0

    /// Whether TTS is currently active
    @Published public private(set) var isActive: Bool = false

    // MARK: - Properties

    /// The speech synthesizer
    private let synthesizer = AVSpeechSynthesizer()

    /// Current configuration
    private var currentConfig: TTSConfiguration = .default

    /// Delegate for callbacks
    public weak var delegate: TextToSpeechDelegate?

    /// Current utterance being spoken
    private var currentUtterance: AVSpeechUtterance?

    /// Total character count for progress tracking
    private var totalCharacters: Int = 0

    /// Characters spoken so far
    private var spokenCharacters: Int = 0

    // MARK: - Initialization

    private override init() {
        super.init()
        synthesizer.delegate = self

        // Configure audio session for playback
        configureAudioSession()
    }

    // MARK: - Public API

    /// Speak text with optional configuration
    /// - Parameters:
    ///   - text: Text to speak
    ///   - config: TTS configuration (optional)
    public func speak(_ text: String, config: TTSConfiguration = .default) {
        // Stop any current speech
        stop()

        // Validate text
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        currentConfig = config
        totalCharacters = trimmedText.count
        spokenCharacters = 0
        progress = 0.0

        // Create utterance
        let utterance = AVSpeechUtterance(string: trimmedText)

        // Configure rate (AVSpeechUtteranceDefaultSpeechRate is about 0.5)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * config.rate * 2
        utterance.pitchMultiplier = config.pitch
        utterance.volume = config.volume

        // Select voice based on language
        if let languageCode = config.languageCode {
            utterance.voice = selectVoice(for: languageCode)
        } else {
            // Use default voice
            utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.identifier)
        }

        currentUtterance = utterance

        // Start speaking
        synthesizer.speak(utterance)

        state = .speaking
        isActive = true
    }

    /// Speak text in a specific language
    /// - Parameters:
    ///   - text: Text to speak
    ///   - language: Language code (e.g., "fr", "en", "es")
    public func speak(_ text: String, language: String) {
        let languageCode = mapLanguageCode(language)
        let config = TTSConfiguration(languageCode: languageCode)
        speak(text, config: config)
    }

    /// Stop speaking
    public func stop() {
        guard isActive else { return }

        synthesizer.stopSpeaking(at: .immediate)

        state = .idle
        isActive = false
        progress = 0.0
        currentUtterance = nil
    }

    /// Pause speaking
    public func pause() {
        guard state == .speaking else { return }

        synthesizer.pauseSpeaking(at: .word)
        state = .paused
    }

    /// Continue speaking after pause
    public func resume() {
        guard state == .paused else { return }

        synthesizer.continueSpeaking()
        state = .speaking
    }

    /// Toggle play/pause
    public func toggle() {
        switch state {
        case .speaking:
            pause()
        case .paused:
            resume()
        case .idle:
            break // Need text to speak
        }
    }

    /// Check if a language is supported
    /// - Parameter languageCode: Language code to check
    /// - Returns: True if supported
    public func isLanguageSupported(_ languageCode: String) -> Bool {
        let mappedCode = mapLanguageCode(languageCode)
        return AVSpeechSynthesisVoice.speechVoices().contains { voice in
            voice.language.starts(with: mappedCode.prefix(2))
        }
    }

    /// Get available voices for a language
    /// - Parameter languageCode: Language code
    /// - Returns: Array of available voices
    public func availableVoices(for languageCode: String) -> [AVSpeechSynthesisVoice] {
        let mappedCode = mapLanguageCode(languageCode)
        return AVSpeechSynthesisVoice.speechVoices().filter { voice in
            voice.language.starts(with: mappedCode.prefix(2))
        }
    }

    /// Get all supported languages
    public var supportedLanguages: [String] {
        var languages = Set<String>()
        for voice in AVSpeechSynthesisVoice.speechVoices() {
            let langCode = String(voice.language.prefix(2))
            languages.insert(langCode)
        }
        return Array(languages).sorted()
    }

    // MARK: - Private Methods

    /// Configure audio session for speech playback
    private func configureAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [.duckOthers])
            try audioSession.setActive(true)
        } catch {
            print("TextToSpeechManager: Failed to configure audio session: \(error)")
        }
    }

    /// Select best voice for a language
    private func selectVoice(for languageCode: String) -> AVSpeechSynthesisVoice? {
        let voices = availableVoices(for: languageCode)

        // Prefer enhanced/premium voices
        if let enhancedVoice = voices.first(where: { $0.quality == .enhanced }) {
            return enhancedVoice
        }

        // Fallback to any available voice
        return voices.first ?? AVSpeechSynthesisVoice(language: languageCode)
    }

    /// Map simple language codes to full locale codes
    private func mapLanguageCode(_ code: String) -> String {
        let lowercased = code.lowercased()

        // If already full code (e.g., "fr-FR"), return as-is
        if code.contains("-") {
            return code
        }

        // Map simple codes to full locale codes
        let mapping: [String: String] = [
            "fr": "fr-FR",
            "en": "en-US",
            "es": "es-ES",
            "de": "de-DE",
            "it": "it-IT",
            "pt": "pt-BR",
            "zh": "zh-CN",
            "ja": "ja-JP",
            "ko": "ko-KR",
            "ar": "ar-SA",
            "ru": "ru-RU",
            "nl": "nl-NL",
            "pl": "pl-PL",
            "tr": "tr-TR",
            "sv": "sv-SE",
            "da": "da-DK",
            "no": "nb-NO",
            "fi": "fi-FI"
        ]

        return mapping[lowercased] ?? "\(lowercased)-\(lowercased.uppercased())"
    }
}

// MARK: - AVSpeechSynthesizerDelegate

extension TextToSpeechManager: AVSpeechSynthesizerDelegate {

    public nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        Task { @MainActor in
            state = .speaking
            isActive = true
            delegate?.textToSpeechDidStart()
        }
    }

    public nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            state = .idle
            isActive = false
            progress = 1.0
            currentUtterance = nil
            delegate?.textToSpeechDidFinish()

            // Deactivate audio session
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    public nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didPause utterance: AVSpeechUtterance) {
        Task { @MainActor in
            state = .paused
            delegate?.textToSpeechDidPause()
        }
    }

    public nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didContinue utterance: AVSpeechUtterance) {
        Task { @MainActor in
            state = .speaking
            delegate?.textToSpeechDidContinue()
        }
    }

    public nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            state = .idle
            isActive = false
            progress = 0.0
            currentUtterance = nil
            delegate?.textToSpeechDidCancel()
        }
    }

    public nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        willSpeakRangeOfSpeechString characterRange: NSRange,
        utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in
            // Update progress
            spokenCharacters = characterRange.location + characterRange.length
            if totalCharacters > 0 {
                progress = Double(spokenCharacters) / Double(totalCharacters)
            }
        }
    }
}
