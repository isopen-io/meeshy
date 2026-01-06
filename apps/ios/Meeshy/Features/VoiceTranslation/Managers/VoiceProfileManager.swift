//
//  VoiceProfileManager.swift
//  Meeshy
//
//  Manages user voice profiles and preferences for TTS
//  Supports Personal Voice setup and voice customization
//

import Foundation
import AVFoundation
import SwiftUI

// MARK: - Voice Profile Manager

@MainActor
final class VoiceProfileManager: ObservableObject {

    // MARK: - Published Properties

    @Published private(set) var availableVoices: [SpeechSynthesisService.VoiceInfo] = []
    @Published private(set) var voicesByLanguage: [VoiceTranslationLanguage: [SpeechSynthesisService.VoiceInfo]] = [:]
    @Published private(set) var selectedVoices: [VoiceTranslationLanguage: SpeechSynthesisService.VoiceInfo] = [:]

    // Personal Voice (iOS)
    @Published private(set) var hasPersonalVoice: Bool = false
    @Published private(set) var personalVoiceAuthorized: Bool = false
    @Published private(set) var isCheckingPersonalVoice: Bool = false

    // Backend Voice Cloning
    @Published private(set) var hasBackendVoiceRegistered: Bool = false
    @Published private(set) var backendVoiceQuality: Float = 0
    @Published private(set) var isRegisteringBackendVoice: Bool = false
    @Published private(set) var backendVoiceError: String?

    // User preferences
    @Published var preferredQuality: SpeechSynthesisService.VoiceQuality = .premium
    @Published var preferredGender: SpeechSynthesisService.VoiceInfo.Gender?
    @Published var speechRate: Float = AVSpeechUtteranceDefaultSpeechRate
    @Published var speechPitch: Float = 1.0

    // MARK: - Properties

    private let speechService: SpeechSynthesisService
    private let userDefaults = UserDefaults.standard

    // MARK: - Singleton

    static let shared = VoiceProfileManager()

    // MARK: - Initialization

    private init() {
        speechService = SpeechSynthesisService()
        loadPreferences()

        Task {
            await refreshVoices()
        }
    }

    // MARK: - Voice Discovery

    /// Refresh available voices
    func refreshVoices() async {
        await speechService.loadAvailableVoices()
        let voices = await speechService.availableVoices

        availableVoices = voices

        // Group by language
        var grouped: [VoiceTranslationLanguage: [SpeechSynthesisService.VoiceInfo]] = [:]
        for voice in voices {
            grouped[voice.language, default: []].append(voice)
        }
        voicesByLanguage = grouped

        // Check Personal Voice
        await checkPersonalVoice()

        // Load selected voices
        loadSelectedVoices()
    }

    // MARK: - Personal Voice

    /// Check Personal Voice availability and authorization
    func checkPersonalVoice() async {
        isCheckingPersonalVoice = true
        defer { isCheckingPersonalVoice = false }

        await speechService.checkPersonalVoiceAccess()
        personalVoiceAuthorized = await speechService.hasPersonalVoiceAccess

        let personalVoices = await speechService.personalVoices
        hasPersonalVoice = !personalVoices.isEmpty
    }

    /// Request Personal Voice authorization
    func requestPersonalVoiceAuthorization() async -> Bool {
        let authorized = await speechService.requestPersonalVoiceAccess()
        personalVoiceAuthorized = authorized
        await checkPersonalVoice()
        return authorized
    }

    /// Open Personal Voice settings
    func openPersonalVoiceSettings() {
        if let url = URL(string: "App-prefs:ACCESSIBILITY&path=SPEECH") {
            UIApplication.shared.open(url)
        }
    }

    // MARK: - Backend Voice Cloning

    /// Register user's voice with backend for voice cloning
    /// - Parameters:
    ///   - audioURL: URL to audio file containing user's voice sample
    ///   - userId: User identifier for the voice profile
    /// - Returns: True if registration was successful
    @discardableResult
    func registerVoiceWithBackend(audioURL: URL, userId: String) async -> Bool {
        guard !isRegisteringBackendVoice else {
            backendVoiceError = "Voice registration already in progress"
            return false
        }

        isRegisteringBackendVoice = true
        backendVoiceError = nil

        defer { isRegisteringBackendVoice = false }

        do {
            let response = try await BackendAudioService.shared.registerVoice(
                audioURL: audioURL,
                userId: userId
            )

            // Update state based on response
            hasBackendVoiceRegistered = response.status == "registered" || response.status == "updated"
            backendVoiceQuality = response.qualityScore ?? 0

            // Save registration status
            saveBackendVoiceRegistration(userId: userId, embeddingId: response.voiceEmbeddingId)

            return hasBackendVoiceRegistered

        } catch {
            backendVoiceError = error.localizedDescription
            return false
        }
    }

    /// Check if user has a registered voice on the backend
    /// - Parameter userId: User identifier to check
    func checkBackendVoiceRegistration(userId: String) async {
        // Load from local storage first
        if let embeddingId = loadBackendVoiceRegistration(userId: userId) {
            hasBackendVoiceRegistered = true
            // Try to verify with backend if available
            do {
                let isHealthy = try await BackendAudioService.shared.checkHealth()
                if !isHealthy {
                    // Backend unavailable, trust local state
                    return
                }
                // Backend is available, voice embedding is registered
            } catch {
                // Backend check failed, trust local state
            }
        } else {
            hasBackendVoiceRegistered = false
            backendVoiceQuality = 0
        }
    }

    /// Clear backend voice registration
    func clearBackendVoiceRegistration(userId: String) {
        hasBackendVoiceRegistered = false
        backendVoiceQuality = 0
        backendVoiceError = nil
        userDefaults.removeObject(forKey: "backendVoiceEmbedding_\(userId)")
    }

    /// Get stored voice embedding ID for user
    func getBackendVoiceEmbeddingId(userId: String) -> String? {
        loadBackendVoiceRegistration(userId: userId)
    }

    // MARK: - Backend Voice Persistence

    private func saveBackendVoiceRegistration(userId: String, embeddingId: String) {
        userDefaults.set(embeddingId, forKey: "backendVoiceEmbedding_\(userId)")
    }

    private func loadBackendVoiceRegistration(userId: String) -> String? {
        userDefaults.string(forKey: "backendVoiceEmbedding_\(userId)")
    }

    // MARK: - Voice Selection

    /// Get voices for a language
    func getVoices(for language: VoiceTranslationLanguage) -> [SpeechSynthesisService.VoiceInfo] {
        voicesByLanguage[language] ?? []
    }

    /// Get filtered voices based on preferences
    func getFilteredVoices(
        for language: VoiceTranslationLanguage,
        quality: SpeechSynthesisService.VoiceQuality? = nil,
        gender: SpeechSynthesisService.VoiceInfo.Gender? = nil
    ) -> [SpeechSynthesisService.VoiceInfo] {
        var voices = getVoices(for: language)

        if let quality = quality {
            voices = voices.filter { $0.quality == quality }
        }

        if let gender = gender {
            voices = voices.filter { $0.gender == gender }
        }

        return voices
    }

    /// Select voice for a language
    func selectVoice(_ voice: SpeechSynthesisService.VoiceInfo, for language: VoiceTranslationLanguage) {
        selectedVoices[language] = voice
        saveSelectedVoices()

        Task {
            await speechService.selectVoice(voice, for: language)
        }
    }

    /// Get selected voice for language
    func getSelectedVoice(for language: VoiceTranslationLanguage) -> SpeechSynthesisService.VoiceInfo? {
        if let selected = selectedVoices[language] {
            return selected
        }

        // Auto-select best voice based on preferences
        return autoSelectVoice(for: language)
    }

    /// Auto-select best voice based on user preferences
    private func autoSelectVoice(for language: VoiceTranslationLanguage) -> SpeechSynthesisService.VoiceInfo? {
        let voices = getVoices(for: language)

        // Priority: Personal Voice (if authorized) > Preferred Quality + Gender > Any Premium > Any

        // Check Personal Voice first
        if personalVoiceAuthorized, let personal = voices.first(where: { $0.isPersonalVoice }) {
            return personal
        }

        // Check preferred quality and gender
        if let preferred = voices.first(where: {
            $0.quality == preferredQuality && (preferredGender == nil || $0.gender == preferredGender)
        }) {
            return preferred
        }

        // Check just preferred quality
        if let qualityMatch = voices.first(where: { $0.quality == preferredQuality }) {
            return qualityMatch
        }

        // Fallback to premium > enhanced > standard
        for quality in [SpeechSynthesisService.VoiceQuality.premium, .enhanced, .standard] {
            if let voice = voices.first(where: { $0.quality == quality }) {
                return voice
            }
        }

        return voices.first
    }

    // MARK: - Preview

    /// Preview a voice with sample text
    func previewVoice(_ voice: SpeechSynthesisService.VoiceInfo) async {
        let sampleText = getSampleText(for: voice.language)

        let config = SpeechSynthesisService.SpeechConfiguration(
            rate: speechRate,
            pitch: speechPitch
        )

        await speechService.speak(sampleText, voice: voice, configuration: config)
    }

    /// Stop any ongoing preview
    func stopPreview() async {
        await speechService.stop()
    }

    /// Get sample text for a language
    private func getSampleText(for language: VoiceTranslationLanguage) -> String {
        switch language {
        case .english:
            return "Hello! This is a preview of the selected voice."
        case .french:
            return "Bonjour ! Ceci est un aperçu de la voix sélectionnée."
        case .spanish:
            return "¡Hola! Esta es una vista previa de la voz seleccionada."
        case .german:
            return "Hallo! Dies ist eine Vorschau der ausgewählten Stimme."
        case .chinese:
            return "你好！这是所选语音的预览。"
        case .japanese:
            return "こんにちは！これは選択した音声のプレビューです。"
        case .russian:
            return "Привет! Это предварительный просмотр выбранного голоса."
        case .portuguese:
            return "Olá! Esta é uma prévia da voz selecionada."
        case .italian:
            return "Ciao! Questa è un'anteprima della voce selezionata."
        case .korean:
            return "안녕하세요! 선택한 음성의 미리보기입니다."
        case .arabic:
            return "مرحبًا! هذه معاينة للصوت المحدد."
        case .dutch:
            return "Hallo! Dit is een voorbeeld van de geselecteerde stem."
        }
    }

    // MARK: - Persistence

    private func loadPreferences() {
        if let qualityRaw = userDefaults.string(forKey: "preferredVoiceQuality"),
           let quality = SpeechSynthesisService.VoiceQuality(rawValue: qualityRaw) {
            preferredQuality = quality
        }

        if let genderRaw = userDefaults.string(forKey: "preferredVoiceGender"),
           let gender = SpeechSynthesisService.VoiceInfo.Gender(rawValue: genderRaw) {
            preferredGender = gender
        }

        speechRate = userDefaults.float(forKey: "speechRate")
        if speechRate == 0 { speechRate = AVSpeechUtteranceDefaultSpeechRate }

        speechPitch = userDefaults.float(forKey: "speechPitch")
        if speechPitch == 0 { speechPitch = 1.0 }
    }

    func savePreferences() {
        userDefaults.set(preferredQuality.rawValue, forKey: "preferredVoiceQuality")
        if let gender = preferredGender {
            userDefaults.set(gender.rawValue, forKey: "preferredVoiceGender")
        }
        userDefaults.set(speechRate, forKey: "speechRate")
        userDefaults.set(speechPitch, forKey: "speechPitch")
    }

    private func loadSelectedVoices() {
        guard let dict = userDefaults.dictionary(forKey: "selectedVoicesPerLanguage") as? [String: String] else {
            return
        }

        for (langRaw, voiceId) in dict {
            if let lang = VoiceTranslationLanguage(rawValue: langRaw),
               let voice = availableVoices.first(where: { $0.id == voiceId }) {
                selectedVoices[lang] = voice
            }
        }
    }

    private func saveSelectedVoices() {
        var dict: [String: String] = [:]
        for (lang, voice) in selectedVoices {
            dict[lang.rawValue] = voice.id
        }
        userDefaults.set(dict, forKey: "selectedVoicesPerLanguage")
    }

    // MARK: - Speech Configuration

    /// Get current speech configuration
    var currentConfiguration: SpeechSynthesisService.SpeechConfiguration {
        SpeechSynthesisService.SpeechConfiguration(
            rate: speechRate,
            pitch: speechPitch
        )
    }

    /// Reset to default settings
    func resetToDefaults() {
        preferredQuality = .premium
        preferredGender = nil
        speechRate = AVSpeechUtteranceDefaultSpeechRate
        speechPitch = 1.0
        selectedVoices.removeAll()

        savePreferences()
        saveSelectedVoices()
    }
}

// MARK: - Voice Statistics

extension VoiceProfileManager {

    struct VoiceStatistics {
        let totalVoices: Int
        let premiumVoices: Int
        let enhancedVoices: Int
        let standardVoices: Int
        let personalVoices: Int
        let languagesCovered: Int
    }

    var statistics: VoiceStatistics {
        VoiceStatistics(
            totalVoices: availableVoices.count,
            premiumVoices: availableVoices.filter { $0.quality == .premium }.count,
            enhancedVoices: availableVoices.filter { $0.quality == .enhanced }.count,
            standardVoices: availableVoices.filter { $0.quality == .standard }.count,
            personalVoices: availableVoices.filter { $0.isPersonalVoice }.count,
            languagesCovered: voicesByLanguage.keys.count
        )
    }
}
