//
//  AudioTranslationService.swift
//  Meeshy
//
//  Service for managing audio message translations with voice cloning
//  Determines which audio version to display and handles translation requests
//
//  Flow:
//  1. User sees audio message
//  2. Service checks if translation needed based on user's language
//  3. Returns appropriate audio URL (original or translated)
//  4. Requests translation if needed and supported
//

import Foundation
import AVFoundation
import os.log

// MARK: - Audio Translation Service

@MainActor
final class AudioTranslationService: ObservableObject {

    // MARK: - Singleton

    static let shared = AudioTranslationService()

    // MARK: - Published State

    @Published private(set) var isProcessing: Bool = false
    @Published private(set) var currentProgress: AudioProcessingProgress?
    @Published private(set) var pendingTranslations: Set<String> = [] // messageId set

    // MARK: - Dependencies

    private let cloudService = CloudVoiceCloningService.shared
    private let cacheService = AudioCacheService.shared
    private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Meeshy", category: "AudioTranslationService")

    // MARK: - Supported Languages (XTTS-v2)

    /// Languages supported for voice cloning TTS
    nonisolated static let supportedLanguages: Set<String> = [
        "en", "es", "fr", "de", "it", "pt", "pl", "tr",
        "ru", "nl", "cs", "ar", "zh", "ja", "ko", "hu"
    ]

    /// Check if a language is supported for audio translation
    nonisolated static func isLanguageSupported(_ languageCode: String) -> Bool {
        let normalized = normalizeLanguageCode(languageCode)
        return supportedLanguages.contains(normalized)
    }

    /// Normalize language code (e.g., "en-US" -> "en")
    nonisolated static func normalizeLanguageCode(_ code: String) -> String {
        let parts = code.split(separator: "-")
        return String(parts.first ?? Substring(code)).lowercased()
    }

    // MARK: - Configuration

    private let maxAudioDuration: TimeInterval = 120    // 2 minutes max

    // MARK: - Initialization

    private init() {}

    // MARK: - Audio Resolution

    /// Result of resolving which audio to play for a message
    struct AudioResolution {
        let audioURL: URL?
        let audioData: Data?
        let isOriginal: Bool
        let language: String
        let translatedText: String?
        let needsTranslation: Bool
        let translationSupported: Bool
        let voiceCloned: Bool
        let similarityScore: Float?

        /// The audio is available to play
        var isAvailable: Bool {
            audioURL != nil || audioData != nil
        }

        /// Status message for UI
        var statusMessage: String? {
            if !translationSupported {
                return "Traduction audio non disponible pour cette langue"
            }
            if needsTranslation {
                return "Traduction en cours..."
            }
            if !isOriginal && voiceCloned {
                return "Audio traduit avec voix clonée"
            }
            return nil
        }
    }

    /// Resolve which audio version to play for a message
    /// - Parameters:
    ///   - message: The audio message
    ///   - userLanguage: User's preferred language code
    /// - Returns: AudioResolution with the appropriate audio to play
    func resolveAudioForMessage(
        _ message: Message,
        userLanguage: String
    ) async -> AudioResolution {

        let userLang = Self.normalizeLanguageCode(userLanguage)
        let originalLang = Self.normalizeLanguageCode(message.originalLanguage)

        logger.debug("[AudioTranslation] Resolving audio for message \(message.id), user=\(userLang), original=\(originalLang)")

        // Case 1: User speaks the original language - return original audio
        if userLang == originalLang {
            logger.debug("[AudioTranslation] User language matches original, returning original audio")
            return AudioResolution(
                audioURL: getOriginalAudioURL(from: message),
                audioData: nil,
                isOriginal: true,
                language: originalLang,
                translatedText: nil,
                needsTranslation: false,
                translationSupported: true,
                voiceCloned: false,
                similarityScore: nil
            )
        }

        // Case 2: Check if translation already exists in message
        if let existingTranslation = message.audioTranslations?.first(where: {
            Self.normalizeLanguageCode($0.targetLanguage) == userLang
        }) {
            logger.debug("[AudioTranslation] Found existing translation for \(userLang)")
            return AudioResolution(
                audioURL: URL(string: existingTranslation.fileUrl),
                audioData: nil,
                isOriginal: false,
                language: userLang,
                translatedText: existingTranslation.translatedText,
                needsTranslation: false,
                translationSupported: true,
                voiceCloned: existingTranslation.voiceCloned,
                similarityScore: existingTranslation.similarityScore.map { Float($0) }
            )
        }

        // Get first audio attachment for cache lookup
        let audioAttachment = message.attachments?.first(where: { $0.isAudio })

        // Case 3: Check cache
        if let attachmentId = audioAttachment?.id,
           let cachedTranslation = await cacheService.getCachedAudioTranslation(
            attachmentId: attachmentId,
            targetLanguage: userLang
        ) {
            logger.debug("[AudioTranslation] Found cached translation for \(userLang)")
            return AudioResolution(
                audioURL: URL(string: cachedTranslation.fileUrl),
                audioData: nil,
                isOriginal: false,
                language: userLang,
                translatedText: cachedTranslation.translatedText,
                needsTranslation: false,
                translationSupported: true,
                voiceCloned: cachedTranslation.voiceCloned,
                similarityScore: cachedTranslation.similarityScore.map { Float($0) }
            )
        }

        // Case 4: Check if user's language is supported for TTS
        if !Self.isLanguageSupported(userLang) {
            logger.info("[AudioTranslation] Language \(userLang) not supported for audio TTS")
            // Return original audio with flag that translation is not supported
            return AudioResolution(
                audioURL: getOriginalAudioURL(from: message),
                audioData: nil,
                isOriginal: true,
                language: originalLang,
                translatedText: message.translations?.first(where: {
                    Self.normalizeLanguageCode($0.targetLanguage) == userLang
                })?.translatedContent,
                needsTranslation: false,
                translationSupported: false,
                voiceCloned: false,
                similarityScore: nil
            )
        }

        // Case 5: Translation needed and supported - return original but flag for translation
        logger.info("[AudioTranslation] Translation needed for \(userLang), will request")
        return AudioResolution(
            audioURL: getOriginalAudioURL(from: message),
            audioData: nil,
            isOriginal: true,
            language: originalLang,
            translatedText: nil,
            needsTranslation: true,
            translationSupported: true,
            voiceCloned: false,
            similarityScore: nil
        )
    }

    // MARK: - Translation Request

    /// Request audio translation for a message
    /// - Parameters:
    ///   - message: The audio message to translate
    ///   - targetLanguage: Target language code
    ///   - userId: User ID for voice cloning (sender's ID)
    /// - Returns: The audio translation result
    func requestTranslation(
        for message: Message,
        targetLanguage: String,
        userId: String? = nil
    ) async throws -> AudioTranslation {

        let targetLang = Self.normalizeLanguageCode(targetLanguage)

        // Check if already translating this message
        guard !pendingTranslations.contains(message.id) else {
            logger.debug("[AudioTranslation] Translation already pending for \(message.id)")
            throw AudioTranslationError.translationInProgress
        }

        // Validate language support
        guard Self.isLanguageSupported(targetLang) else {
            throw AudioTranslationError.unsupportedLanguage(targetLang)
        }

        // Get original audio URL
        guard let originalAudioURL = getOriginalAudioURL(from: message) else {
            throw AudioTranslationError.noOriginalAudio
        }

        // Mark as pending
        pendingTranslations.insert(message.id)
        isProcessing = true
        currentProgress = .translating

        defer {
            pendingTranslations.remove(message.id)
            isProcessing = pendingTranslations.isEmpty ? false : true
            if !isProcessing {
                currentProgress = nil
            }
        }

        logger.info("[AudioTranslation] Requesting translation for message \(message.id) to \(targetLang)")

        do {
            // Download original audio to temp file if needed
            currentProgress = .downloading(0)
            let localAudioURL = try await ensureLocalAudio(from: originalAudioURL)
            currentProgress = .translating

            // Get sender ID for voice cloning
            let senderId = userId ?? message.senderId ?? "anonymous"

            // Call cloud service for translation
            currentProgress = .generatingAudio
            let result = try await cloudService.translateAudio(
                audioURL: localAudioURL,
                sourceLanguage: message.originalLanguage,
                targetLanguage: targetLang,
                userId: senderId,
                enableVoiceCloning: true
            )

            // Get audio attachment for ID
            guard let audioAttachment = message.attachments?.first(where: { $0.isAudio }) else {
                throw AudioTranslationError.translationFailed("No audio attachment found")
            }

            // Create AttachmentTranslation from result
            let audioURLString = result.audioURL?.absoluteString ?? ""
            let translation = AttachmentTranslation(
                id: UUID().uuidString,
                attachmentId: audioAttachment.id,
                sourceLanguage: message.originalLanguage,
                targetLanguage: targetLang,
                fileUrl: audioURLString,
                fileName: result.audioURL?.lastPathComponent ?? "translated_audio.m4a",
                fileSize: 0, // Will be updated when file is downloaded
                duration: Int(result.duration * 1000), // Convert seconds to milliseconds
                voiceCloned: result.voiceCloned,
                voiceProfileId: nil,
                similarityScore: result.similarityScore.map { Double($0) },
                transcribedText: result.originalText, // Original transcribed text
                translatedText: result.translatedText,
                confidenceScore: nil,
                processingTimeMs: result.processingTimeMs,
                cached: false,
                createdAt: Date()
            )

            // Cache the result
            await cacheService.cacheAudioTranslation(translation, attachmentId: audioAttachment.id)

            currentProgress = .complete
            logger.info("[AudioTranslation] Translation complete for \(message.id), voice_cloned=\(result.voiceCloned)")

            return translation

        } catch {
            logger.error("[AudioTranslation] Translation failed for \(message.id): \(error.localizedDescription)")
            throw AudioTranslationError.translationFailed(error.localizedDescription)
        }
    }

    // MARK: - Automatic Translation on Display

    /// Automatically request translation if needed when displaying a message
    /// Returns the audio URL to play (original or translated)
    func getAudioToPlay(
        for message: Message,
        userLanguage: String
    ) async -> (url: URL?, translation: AudioTranslation?) {

        let resolution = await resolveAudioForMessage(message, userLanguage: userLanguage)

        // If translation needed and supported, request it
        if resolution.needsTranslation && resolution.translationSupported {
            do {
                let translation = try await requestTranslation(
                    for: message,
                    targetLanguage: userLanguage,
                    userId: message.senderId
                )
                return (URL(string: translation.fileUrl), translation)
            } catch {
                // Fallback to original on error
                logger.error("[AudioTranslation] Auto-translation failed: \(error.localizedDescription)")
                return (resolution.audioURL, nil)
            }
        }

        return (resolution.audioURL, nil)
    }

    // MARK: - Batch Translation

    /// Prefetch translations for multiple messages
    func prefetchTranslations(
        for messages: [Message],
        targetLanguage: String
    ) async {
        let targetLang = Self.normalizeLanguageCode(targetLanguage)

        // Filter to audio messages that need translation
        let needsTranslation = messages.filter { message in
            guard message.messageType == .audio else { return false }
            let originalLang = Self.normalizeLanguageCode(message.originalLanguage)

            // Skip if same language
            if originalLang == targetLang { return false }

            // Skip if already has translation
            if message.audioTranslations?.contains(where: {
                Self.normalizeLanguageCode($0.targetLanguage) == targetLang
            }) == true {
                return false
            }

            // Skip if language not supported
            if !Self.isLanguageSupported(targetLang) { return false }

            // Skip if already pending
            if pendingTranslations.contains(message.id) { return false }

            return true
        }

        guard !needsTranslation.isEmpty else { return }

        logger.info("[AudioTranslation] Prefetching \(needsTranslation.count) translations")

        // Translate in parallel with limited concurrency
        await withTaskGroup(of: Void.self) { group in
            for message in needsTranslation.prefix(3) { // Limit to 3 concurrent
                group.addTask {
                    do {
                        _ = try await self.requestTranslation(
                            for: message,
                            targetLanguage: targetLang,
                            userId: message.senderId
                        )
                    } catch {
                        // Silent failure for prefetch
                        self.logger.debug("[AudioTranslation] Prefetch failed for \(message.id)")
                    }
                }
            }
        }
    }

    // MARK: - Helper Methods

    /// Get the original audio URL from a message
    private func getOriginalAudioURL(from message: Message) -> URL? {
        // Check attachments for audio file
        if let attachment = message.attachments?.first(where: { $0.isAudio }) {
            return URL(string: attachment.fileUrl)
        }
        return nil
    }

    /// Ensure audio is available locally (download if remote)
    private func ensureLocalAudio(from url: URL) async throws -> URL {
        // If already local, return as-is
        if url.isFileURL {
            return url
        }

        // Download to temp file
        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AudioTranslationError.downloadFailed("HTTP error")
        }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("audio_\(UUID().uuidString).m4a")

        try data.write(to: tempURL)

        return tempURL
    }

    /// Get audio duration
    private func getAudioDuration(_ url: URL) async throws -> TimeInterval {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        return CMTimeGetSeconds(duration)
    }

    // MARK: - Cache Management

    /// Clear cached translations for a message
    func clearCache(for messageId: String) async {
        logger.debug("[AudioTranslation] Cache cleared for \(messageId)")
    }

    /// Clear all audio translation cache
    func clearAllCache() async {
        await cacheService.clearAudioTranslationCache()
        logger.info("[Cache] Audio translation cache cleared")
    }

    /// Get cache statistics
    func getCacheStats() async -> AudioCacheStats {
        await cacheService.getStats()
    }

    // MARK: - Language Support Info

    /// Get display information about supported languages
    static func getSupportedLanguagesInfo() -> [(code: String, name: String, flag: String)] {
        return [
            ("en", "English", "🇺🇸"),
            ("es", "Español", "🇪🇸"),
            ("fr", "Français", "🇫🇷"),
            ("de", "Deutsch", "🇩🇪"),
            ("it", "Italiano", "🇮🇹"),
            ("pt", "Português", "🇧🇷"),
            ("pl", "Polski", "🇵🇱"),
            ("tr", "Türkçe", "🇹🇷"),
            ("ru", "Русский", "🇷🇺"),
            ("nl", "Nederlands", "🇳🇱"),
            ("cs", "Čeština", "🇨🇿"),
            ("ar", "العربية", "🇸🇦"),
            ("zh", "中文", "🇨🇳"),
            ("ja", "日本語", "🇯🇵"),
            ("ko", "한국어", "🇰🇷"),
            ("hu", "Magyar", "🇭🇺")
        ]
    }
}

// MARK: - Progress States

enum AudioProcessingProgress: Equatable {
    case uploading(Double)              // 0-1
    case transcribing
    case translating
    case generatingAudio
    case downloading(Double)            // 0-1
    case complete

    var description: String {
        switch self {
        case .uploading(let progress):
            return "Envoi... \(Int(progress * 100))%"
        case .transcribing:
            return "Transcription en cours..."
        case .translating:
            return "Traduction..."
        case .generatingAudio:
            return "Génération audio..."
        case .downloading(let progress):
            return "Téléchargement... \(Int(progress * 100))%"
        case .complete:
            return "Terminé"
        }
    }

    var icon: String {
        switch self {
        case .uploading: return "arrow.up.circle"
        case .transcribing: return "waveform"
        case .translating: return "text.bubble"
        case .generatingAudio: return "speaker.wave.3"
        case .downloading: return "arrow.down.circle"
        case .complete: return "checkmark.circle"
        }
    }

    var isIndeterminate: Bool {
        switch self {
        case .uploading, .downloading:
            return false
        default:
            return true
        }
    }
}

// MARK: - Errors

enum AudioTranslationError: LocalizedError {
    case audioTooLong(maxSeconds: TimeInterval)
    case unsupportedLanguage(String)
    case noOriginalAudio
    case translationInProgress
    case transcriptionFailed(String)
    case translationFailed(String)
    case voiceCloningFailed(String)
    case noVoiceProfile
    case downloadFailed(String)
    case networkError(String)
    case messageNotFound(String)

    var errorDescription: String? {
        switch self {
        case .audioTooLong(let max):
            return "Audio trop long. Maximum \(Int(max)) secondes autorisées."
        case .unsupportedLanguage(let lang):
            return "La langue '\(lang)' n'est pas supportée pour la traduction audio."
        case .noOriginalAudio:
            return "Aucun audio original trouvé pour ce message."
        case .translationInProgress:
            return "Une traduction est déjà en cours pour ce message."
        case .transcriptionFailed(let reason):
            return "Échec de transcription: \(reason)"
        case .translationFailed(let reason):
            return "Échec de traduction: \(reason)"
        case .voiceCloningFailed(let reason):
            return "Échec du clonage vocal: \(reason)"
        case .noVoiceProfile:
            return "L'expéditeur n'a pas de profil vocal pour le clonage."
        case .downloadFailed(let reason):
            return "Échec du téléchargement: \(reason)"
        case .networkError(let reason):
            return "Erreur réseau: \(reason)"
        case .messageNotFound(let id):
            return "Message '\(id)' introuvable."
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .audioTooLong:
            return "Essayez d'enregistrer un message plus court."
        case .unsupportedLanguage:
            return "Choisissez une autre langue cible."
        case .noOriginalAudio:
            return "Le message ne contient pas de fichier audio."
        case .translationInProgress:
            return "Veuillez patienter..."
        case .transcriptionFailed:
            return "Parlez clairement et évitez le bruit de fond."
        case .translationFailed, .voiceCloningFailed:
            return "Réessayez dans un instant."
        case .noVoiceProfile:
            return "L'audio sera généré avec une voix par défaut."
        case .downloadFailed, .networkError:
            return "Vérifiez votre connexion internet et réessayez."
        case .messageNotFound:
            return "Le message a peut-être été supprimé."
        }
    }
}

// MARK: - Audio Playback Info

/// Complete info for playing an audio message
struct AudioPlaybackInfo {
    /// URL to play (original or translated)
    let playbackURL: URL?

    /// Whether this is the translated version
    let isTranslated: Bool

    /// Target language of translation (if translated)
    let translationLanguage: String?

    /// Whether voice was cloned
    let voiceCloned: Bool

    /// Transcription/translation text to display
    let displayText: String?

    /// Original attachment metadata (duration, etc.)
    let attachment: MessageAttachment?

    /// Translation quality score (0-1)
    let similarityScore: Float?

    /// Whether translation is in progress
    let isLoading: Bool

    /// Whether translation is supported for user's language
    let translationSupported: Bool

    /// Duration in seconds (from attachment)
    var durationSeconds: Double {
        guard let ms = attachment?.duration else { return 0 }
        return Double(ms) / 1000.0
    }

    /// Status badge text for UI
    var statusBadge: String? {
        if isLoading {
            return "Traduction..."
        }
        if isTranslated && voiceCloned {
            return "Traduit"
        }
        if !translationSupported && translationLanguage != nil {
            return "Original"
        }
        return nil
    }

    /// Status badge icon
    var statusIcon: String? {
        if isLoading {
            return "arrow.triangle.2.circlepath"
        }
        if isTranslated && voiceCloned {
            return "person.wave.2"
        }
        if !translationSupported {
            return "globe"
        }
        return nil
    }
}

// MARK: - AudioTranslationService + Playback

extension AudioTranslationService {

    /// Get complete playback info for an audio message
    /// This is the main entry point for UI components
    func getPlaybackInfo(
        for message: Message,
        userLanguage: String
    ) async -> AudioPlaybackInfo {

        let resolution = await resolveAudioForMessage(message, userLanguage: userLanguage)
        let attachment = message.attachments?.first(where: { $0.isAudio })

        // If translation needed, try to get it
        if resolution.needsTranslation && resolution.translationSupported {
            // Return loading state, then fetch
            return AudioPlaybackInfo(
                playbackURL: resolution.audioURL,
                isTranslated: false,
                translationLanguage: userLanguage,
                voiceCloned: false,
                displayText: message.audioTranscription?.text,
                attachment: attachment,
                similarityScore: nil,
                isLoading: true,
                translationSupported: true
            )
        }

        return AudioPlaybackInfo(
            playbackURL: resolution.audioURL,
            isTranslated: !resolution.isOriginal,
            translationLanguage: resolution.isOriginal ? nil : Self.normalizeLanguageCode(userLanguage),
            voiceCloned: resolution.voiceCloned,
            displayText: resolution.translatedText ?? message.audioTranscription?.text,
            attachment: attachment,
            similarityScore: resolution.similarityScore,
            isLoading: false,
            translationSupported: resolution.translationSupported
        )
    }

    /// Get playback info and automatically request translation if needed
    /// Returns updated info once translation is complete
    func getPlaybackInfoWithAutoTranslation(
        for message: Message,
        userLanguage: String
    ) async -> AudioPlaybackInfo {

        let resolution = await resolveAudioForMessage(message, userLanguage: userLanguage)
        let attachment = message.attachments?.first(where: { $0.isAudio })

        // If translation needed and supported, request it
        if resolution.needsTranslation && resolution.translationSupported {
            do {
                let translation = try await requestTranslation(
                    for: message,
                    targetLanguage: userLanguage,
                    userId: message.senderId
                )

                return AudioPlaybackInfo(
                    playbackURL: URL(string: translation.fileUrl),
                    isTranslated: true,
                    translationLanguage: Self.normalizeLanguageCode(userLanguage),
                    voiceCloned: translation.voiceCloned,
                    displayText: translation.translatedText,
                    attachment: attachment,
                    similarityScore: translation.similarityScore.map { Float($0) },
                    isLoading: false,
                    translationSupported: true
                )
            } catch {
                // Fallback to original on error
                logger.error("[AudioPlayback] Translation failed: \(error.localizedDescription)")
            }
        }

        return AudioPlaybackInfo(
            playbackURL: resolution.audioURL,
            isTranslated: !resolution.isOriginal,
            translationLanguage: resolution.isOriginal ? nil : Self.normalizeLanguageCode(userLanguage),
            voiceCloned: resolution.voiceCloned,
            displayText: resolution.translatedText ?? message.audioTranscription?.text,
            attachment: attachment,
            similarityScore: resolution.similarityScore,
            isLoading: false,
            translationSupported: resolution.translationSupported
        )
    }
}

// MARK: - Message Audio Helpers

extension Message {

    /// Get the best audio URL for a given user language using AudioTranslationService
    /// Returns original if user speaks the original language or no translation available
    func bestAudioURLForUser(_ userLanguage: String) -> URL? {
        let userLang = AudioTranslationService.normalizeLanguageCode(userLanguage)
        let originalLang = AudioTranslationService.normalizeLanguageCode(originalLanguage)

        // If user speaks original language, return original
        if userLang == originalLang {
            if let attachment = attachments?.first(where: { $0.isAudio }) {
                return URL(string: attachment.fileUrl)
            }
            return nil
        }

        // Check for existing audio translation
        if let translation = audioTranslations?.first(where: {
            AudioTranslationService.normalizeLanguageCode($0.targetLanguage) == userLang
        }) {
            return URL(string: translation.fileUrl)
        }

        // Fallback to original
        if let attachment = attachments?.first(where: { $0.isAudio }) {
            return URL(string: attachment.fileUrl)
        }
        return nil
    }

    /// Check if audio translation is needed for user's language (using AudioTranslationService)
    func needsAudioTranslationFor(_ userLanguage: String) -> Bool {
        let userLang = AudioTranslationService.normalizeLanguageCode(userLanguage)
        let originalLang = AudioTranslationService.normalizeLanguageCode(originalLanguage)

        // No translation needed if same language
        if userLang == originalLang { return false }

        // No translation needed if already has one
        if hasAudioTranslation(for: userLang) { return false }

        // Check if language is supported
        return AudioTranslationService.isLanguageSupported(userLang)
    }

    /// Get transcription or translated text for display
    func displayTranscriptionText(for userLanguage: String) -> String? {
        let userLang = AudioTranslationService.normalizeLanguageCode(userLanguage)
        let originalLang = AudioTranslationService.normalizeLanguageCode(originalLanguage)

        // If same language, return original transcription
        if userLang == originalLang {
            return audioTranscription?.text
        }

        // Check for audio translation text
        if let audioTranslation = audioTranslations?.first(where: {
            AudioTranslationService.normalizeLanguageCode($0.targetLanguage) == userLang
        }) {
            return audioTranslation.translatedText
        }

        // Check for text translation
        if let textTranslation = translations?.first(where: {
            AudioTranslationService.normalizeLanguageCode($0.targetLanguage) == userLang
        }) {
            return textTranslation.translatedContent
        }

        // Fallback to original
        return audioTranscription?.text
    }
}
