//
//  SpeechSynthesisService.swift
//  Meeshy
//
//  Advanced Text-to-Speech service with Personal Voice support (iOS 17+)
//  Supports multiple languages, voice quality levels, and speech customization
//

import Foundation
import AVFoundation
import Combine

// MARK: - Speech Synthesis Service

/// Advanced TTS service with Personal Voice and multi-language support
actor SpeechSynthesisService: NSObject {

    // MARK: - Types

    enum VoiceQuality: String, CaseIterable {
        case standard = "default"
        case enhanced = "enhanced"
        case premium = "premium"
        case personalVoice = "personal"

        var displayName: String {
            switch self {
            case .standard: return "Standard"
            case .enhanced: return "Enhanced"
            case .premium: return "Premium"
            case .personalVoice: return "Personal Voice"
            }
        }

        var avQuality: AVSpeechSynthesisVoiceQuality {
            switch self {
            case .standard: return .default
            case .enhanced: return .enhanced
            case .premium: return .premium
            case .personalVoice: return .premium
            }
        }
    }

    struct SpeechConfiguration {
        var rate: Float = AVSpeechUtteranceDefaultSpeechRate
        var pitch: Float = 1.0
        var volume: Float = 1.0
        var preDelay: TimeInterval = 0
        var postDelay: TimeInterval = 0

        static let normal = SpeechConfiguration()

        static let slow = SpeechConfiguration(
            rate: AVSpeechUtteranceDefaultSpeechRate * 0.7
        )

        static let fast = SpeechConfiguration(
            rate: AVSpeechUtteranceDefaultSpeechRate * 1.3
        )

        static let realTime = SpeechConfiguration(
            rate: AVSpeechUtteranceDefaultSpeechRate * 1.1,
            preDelay: 0,
            postDelay: 0.1
        )
    }

    struct VoiceInfo: Identifiable, Equatable {
        let id: String
        let name: String
        let language: VoiceTranslationLanguage
        let quality: VoiceQuality
        let isPersonalVoice: Bool
        let gender: Gender?

        enum Gender: String {
            case male
            case female
            case neutral
        }

        var displayName: String {
            if isPersonalVoice {
                return "🎤 Personal Voice"
            }
            let qualityBadge = quality == .premium ? "⭐ " : ""
            return "\(qualityBadge)\(name)"
        }
    }

    enum SpeechState {
        case idle
        case speaking
        case paused
        case cancelled
    }

    // MARK: - Properties

    private let synthesizer: AVSpeechSynthesizer
    private var currentUtterance: AVSpeechUtterance?
    private var speechDelegate: SpeechSynthesizerDelegate?

    private(set) var state: SpeechState = .idle
    private(set) var availableVoices: [VoiceInfo] = []
    private(set) var personalVoices: [VoiceInfo] = []
    private(set) var hasPersonalVoiceAccess: Bool = false

    // Selected voices per language
    private var selectedVoices: [VoiceTranslationLanguage: VoiceInfo] = [:]

    // Queue for sequential speech
    private var speechQueue: [AVSpeechUtterance] = []
    private var isProcessingQueue = false

    // Callbacks
    private var onSpeechStart: (() -> Void)?
    private var onSpeechFinish: (() -> Void)?
    private var onSpeechProgress: ((String, NSRange) -> Void)?
    private var onSpeechError: ((Error) -> Void)?

    // MARK: - Initialization

    override init() {
        self.synthesizer = AVSpeechSynthesizer()
        super.init()

        // Setup delegate
        speechDelegate = SpeechSynthesizerDelegate { [weak self] event in
            Task {
                await self?.handleDelegateEvent(event)
            }
        }
        synthesizer.delegate = speechDelegate

        // Load available voices
        Task {
            await loadAvailableVoices()
            await checkPersonalVoiceAccess()
        }
    }

    // MARK: - Voice Discovery

    /// Load all available voices on the device
    func loadAvailableVoices() async {
        var voices: [VoiceInfo] = []

        for voice in AVSpeechSynthesisVoice.speechVoices() {
            // Parse language from voice identifier
            guard let language = parseLanguage(from: voice.language) else { continue }

            let quality = mapQuality(voice.quality)
            let isPersonal = checkIfPersonalVoice(voice)

            let voiceInfo = VoiceInfo(
                id: voice.identifier,
                name: voice.name,
                language: language,
                quality: quality,
                isPersonalVoice: isPersonal,
                gender: detectGender(from: voice.name)
            )

            voices.append(voiceInfo)
        }

        // Sort by quality (premium first)
        availableVoices = voices.sorted { v1, v2 in
            if v1.language != v2.language {
                return v1.language.rawValue < v2.language.rawValue
            }
            if v1.quality != v2.quality {
                return qualityRank(v1.quality) > qualityRank(v2.quality)
            }
            return v1.name < v2.name
        }

        // Separate personal voices
        personalVoices = voices.filter { $0.isPersonalVoice }
    }

    private func parseLanguage(from identifier: String) -> VoiceTranslationLanguage? {
        let langCode = String(identifier.prefix(2))
        return VoiceTranslationLanguage(rawValue: langCode)
    }

    private func mapQuality(_ avQuality: AVSpeechSynthesisVoiceQuality) -> VoiceQuality {
        switch avQuality {
        case .premium: return .premium
        case .enhanced: return .enhanced
        default: return .standard
        }
    }

    private func checkIfPersonalVoice(_ voice: AVSpeechSynthesisVoice) -> Bool {
        if #available(iOS 17.0, *) {
            return voice.voiceTraits.contains(.isPersonalVoice)
        }
        return false
    }

    private func detectGender(from name: String) -> VoiceInfo.Gender? {
        let femaleNames = ["Samantha", "Siri", "Karen", "Moira", "Tessa", "Veena", "Victoria",
                          "Alice", "Amélie", "Audrey", "Aurelie", "Helena", "Marie", "Monica"]
        let maleNames = ["Alex", "Daniel", "Fred", "Tom", "Aaron", "Arthur", "Gordon", "Oliver"]

        if femaleNames.contains(where: { name.contains($0) }) {
            return .female
        } else if maleNames.contains(where: { name.contains($0) }) {
            return .male
        }
        return nil
    }

    private func qualityRank(_ quality: VoiceQuality) -> Int {
        switch quality {
        case .personalVoice: return 4
        case .premium: return 3
        case .enhanced: return 2
        case .standard: return 1
        }
    }

    // MARK: - Personal Voice (iOS 17+)

    /// Check if Personal Voice access is authorized
    func checkPersonalVoiceAccess() async {
        if #available(iOS 17.0, *) {
            let status = AVSpeechSynthesizer.personalVoiceAuthorizationStatus

            switch status {
            case .authorized:
                hasPersonalVoiceAccess = true
            case .notDetermined:
                hasPersonalVoiceAccess = false
            default:
                hasPersonalVoiceAccess = false
            }
        } else {
            hasPersonalVoiceAccess = false
        }
    }

    /// Request Personal Voice authorization
    func requestPersonalVoiceAccess() async -> Bool {
        if #available(iOS 17.0, *) {
            return await withCheckedContinuation { continuation in
                AVSpeechSynthesizer.requestPersonalVoiceAuthorization { status in
                    continuation.resume(returning: status == .authorized)
                }
            }
        }
        return false
    }

    /// Get Personal Voice instances
    func getPersonalVoices() -> [AVSpeechSynthesisVoice] {
        if #available(iOS 17.0, *) {
            return AVSpeechSynthesisVoice.speechVoices().filter {
                $0.voiceTraits.contains(.isPersonalVoice)
            }
        }
        return []
    }

    // MARK: - Voice Selection

    /// Get available voices for a language
    func getVoices(for language: VoiceTranslationLanguage) -> [VoiceInfo] {
        availableVoices.filter { $0.language == language }
    }

    /// Get best voice for a language
    func getBestVoice(for language: VoiceTranslationLanguage) -> VoiceInfo? {
        // Priority: Personal Voice > Premium > Enhanced > Standard
        let languageVoices = getVoices(for: language)

        // Check for personal voice first
        if hasPersonalVoiceAccess, let personal = languageVoices.first(where: { $0.isPersonalVoice }) {
            return personal
        }

        // Then premium
        if let premium = languageVoices.first(where: { $0.quality == .premium }) {
            return premium
        }

        // Then enhanced
        if let enhanced = languageVoices.first(where: { $0.quality == .enhanced }) {
            return enhanced
        }

        // Fallback to any
        return languageVoices.first
    }

    /// Select voice for a language
    func selectVoice(_ voice: VoiceInfo, for language: VoiceTranslationLanguage) {
        selectedVoices[language] = voice
        saveSelectedVoices()
    }

    /// Get currently selected voice for language
    func getSelectedVoice(for language: VoiceTranslationLanguage) -> VoiceInfo? {
        selectedVoices[language] ?? getBestVoice(for: language)
    }

    private func saveSelectedVoices() {
        var dict: [String: String] = [:]
        for (lang, voice) in selectedVoices {
            dict[lang.rawValue] = voice.id
        }
        UserDefaults.standard.set(dict, forKey: "selectedTTSVoices")
    }

    private func loadSelectedVoices() {
        guard let dict = UserDefaults.standard.dictionary(forKey: "selectedTTSVoices") as? [String: String] else {
            return
        }

        for (langRaw, voiceId) in dict {
            if let lang = VoiceTranslationLanguage(rawValue: langRaw),
               let voice = availableVoices.first(where: { $0.id == voiceId }) {
                selectedVoices[lang] = voice
            }
        }
    }

    // MARK: - Speech Synthesis

    /// Speak text in the specified language
    func speak(
        _ text: String,
        language: VoiceTranslationLanguage,
        configuration: SpeechConfiguration = .normal
    ) async {
        guard !text.isEmpty else { return }

        // Get the appropriate voice
        let voiceInfo = getSelectedVoice(for: language)
        let avVoice: AVSpeechSynthesisVoice?

        if let info = voiceInfo {
            avVoice = AVSpeechSynthesisVoice(identifier: info.id)
        } else {
            avVoice = AVSpeechSynthesisVoice(language: language.localeIdentifier)
        }

        // Create utterance
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = avVoice
        utterance.rate = configuration.rate
        utterance.pitchMultiplier = configuration.pitch
        utterance.volume = configuration.volume
        utterance.preUtteranceDelay = configuration.preDelay
        utterance.postUtteranceDelay = configuration.postDelay

        currentUtterance = utterance
        state = .speaking
        onSpeechStart?()

        synthesizer.speak(utterance)
    }

    /// Speak with a specific voice
    func speak(
        _ text: String,
        voice: VoiceInfo,
        configuration: SpeechConfiguration = .normal
    ) async {
        guard !text.isEmpty else { return }
        guard let avVoice = AVSpeechSynthesisVoice(identifier: voice.id) else { return }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = avVoice
        utterance.rate = configuration.rate
        utterance.pitchMultiplier = configuration.pitch
        utterance.volume = configuration.volume
        utterance.preUtteranceDelay = configuration.preDelay
        utterance.postUtteranceDelay = configuration.postDelay

        currentUtterance = utterance
        state = .speaking
        onSpeechStart?()

        synthesizer.speak(utterance)
    }

    /// Speak using Personal Voice (iOS 17+)
    func speakWithPersonalVoice(
        _ text: String,
        configuration: SpeechConfiguration = .normal
    ) async throws {
        guard hasPersonalVoiceAccess else {
            throw SpeechSynthesisError.personalVoiceNotAuthorized
        }

        guard let personalVoice = getPersonalVoices().first else {
            throw SpeechSynthesisError.noPersonalVoiceAvailable
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = personalVoice
        utterance.rate = configuration.rate
        utterance.pitchMultiplier = configuration.pitch
        utterance.volume = configuration.volume

        currentUtterance = utterance
        state = .speaking
        onSpeechStart?()

        synthesizer.speak(utterance)
    }

    // MARK: - Queue Management

    /// Add text to speech queue
    func enqueue(_ text: String, language: VoiceTranslationLanguage) {
        let voiceInfo = getSelectedVoice(for: language)
        let avVoice: AVSpeechSynthesisVoice?

        if let info = voiceInfo {
            avVoice = AVSpeechSynthesisVoice(identifier: info.id)
        } else {
            avVoice = AVSpeechSynthesisVoice(language: language.localeIdentifier)
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = avVoice

        speechQueue.append(utterance)

        if !isProcessingQueue {
            Task {
                await processQueue()
            }
        }
    }

    private func processQueue() async {
        isProcessingQueue = true

        while !speechQueue.isEmpty {
            let utterance = speechQueue.removeFirst()

            state = .speaking
            synthesizer.speak(utterance)

            // Wait for completion
            await waitForSpeechCompletion()
        }

        isProcessingQueue = false
    }

    private func waitForSpeechCompletion() async {
        await withCheckedContinuation { continuation in
            let originalCallback = onSpeechFinish
            onSpeechFinish = {
                originalCallback?()
                continuation.resume()
            }
        }
    }

    // MARK: - Playback Control

    /// Pause current speech
    func pause() {
        guard state == .speaking else { return }
        synthesizer.pauseSpeaking(at: .word)
        state = .paused
    }

    /// Resume paused speech
    func resume() {
        guard state == .paused else { return }
        synthesizer.continueSpeaking()
        state = .speaking
    }

    /// Stop all speech
    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        speechQueue.removeAll()
        state = .cancelled
        currentUtterance = nil
    }

    /// Check if currently speaking
    var isSpeaking: Bool {
        synthesizer.isSpeaking
    }

    // MARK: - Callbacks

    func setCallbacks(
        onStart: (() -> Void)? = nil,
        onFinish: (() -> Void)? = nil,
        onProgress: ((String, NSRange) -> Void)? = nil,
        onError: ((Error) -> Void)? = nil
    ) {
        onSpeechStart = onStart
        onSpeechFinish = onFinish
        onSpeechProgress = onProgress
        onSpeechError = onError
    }

    // MARK: - Delegate Events

    private func handleDelegateEvent(_ event: SpeechDelegateEvent) {
        switch event {
        case .didStart:
            state = .speaking
            onSpeechStart?()

        case .didFinish:
            state = .idle
            currentUtterance = nil
            onSpeechFinish?()

        case .didPause:
            state = .paused

        case .didContinue:
            state = .speaking

        case .didCancel:
            state = .cancelled
            currentUtterance = nil

        case .willSpeak(let range, let utterance):
            if let text = utterance.speechString as String? {
                onSpeechProgress?(text, range)
            }
        }
    }

    // MARK: - Audio Session

    /// Configure audio session for speech
    func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()

        try session.setCategory(
            .playback,
            mode: .spokenAudio,
            options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
        )

        try session.setActive(true)
    }

    /// Configure for mixed audio (speech + other audio)
    func configureMixedAudioSession() throws {
        let session = AVAudioSession.sharedInstance()

        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers]
        )

        try session.setActive(true)
    }

    // MARK: - Utilities

    /// Estimate speech duration for text
    func estimateDuration(for text: String, rate: Float = AVSpeechUtteranceDefaultSpeechRate) -> TimeInterval {
        // Average speaking rate: ~150 words per minute at default rate
        let wordsPerSecond = 2.5 * Double(rate / AVSpeechUtteranceDefaultSpeechRate)
        let wordCount = text.split(separator: " ").count
        return Double(wordCount) / wordsPerSecond
    }

    /// Get all supported languages
    static var supportedLanguages: [VoiceTranslationLanguage] {
        var languages = Set<VoiceTranslationLanguage>()

        for voice in AVSpeechSynthesisVoice.speechVoices() {
            let langCode = String(voice.language.prefix(2))
            if let lang = VoiceTranslationLanguage(rawValue: langCode) {
                languages.insert(lang)
            }
        }

        return Array(languages).sorted { $0.rawValue < $1.rawValue }
    }
}

// MARK: - Delegate Events

enum SpeechDelegateEvent {
    case didStart
    case didFinish
    case didPause
    case didContinue
    case didCancel
    case willSpeak(range: NSRange, utterance: AVSpeechUtterance)
}

// MARK: - Speech Synthesizer Delegate

private class SpeechSynthesizerDelegate: NSObject, AVSpeechSynthesizerDelegate {
    let eventHandler: (SpeechDelegateEvent) -> Void

    init(eventHandler: @escaping (SpeechDelegateEvent) -> Void) {
        self.eventHandler = eventHandler
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        eventHandler(.didStart)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        eventHandler(.didFinish)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didPause utterance: AVSpeechUtterance) {
        eventHandler(.didPause)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didContinue utterance: AVSpeechUtterance) {
        eventHandler(.didContinue)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        eventHandler(.didCancel)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString characterRange: NSRange, utterance: AVSpeechUtterance) {
        eventHandler(.willSpeak(range: characterRange, utterance: utterance))
    }
}

// MARK: - Errors

enum SpeechSynthesisError: Error, LocalizedError {
    case personalVoiceNotAuthorized
    case noPersonalVoiceAvailable
    case noVoiceAvailable
    case audioSessionError
    case speechFailed

    var errorDescription: String? {
        switch self {
        case .personalVoiceNotAuthorized:
            return "Personal Voice is not authorized. Please enable it in Settings."
        case .noPersonalVoiceAvailable:
            return "No Personal Voice is configured on this device."
        case .noVoiceAvailable:
            return "No voice available for this language."
        case .audioSessionError:
            return "Failed to configure audio session."
        case .speechFailed:
            return "Speech synthesis failed."
        }
    }
}
