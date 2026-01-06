//
//  TranslationService.swift
//  Meeshy
//
//  Complete translation service with API integration
//  Supports EN, FR, RU, PT with 3-tier translation strategy
//  iOS 16+
//

import Foundation
import Combine

// MARK: - Translation Service Error

enum TranslationError: LocalizedError {
    case invalidText
    case unsupportedLanguage
    case networkError(Error)
    case apiError(String)
    case cacheError
    case noTranslationNeeded

    var errorDescription: String? {
        switch self {
        case .invalidText:
            return "Invalid text for translation"
        case .unsupportedLanguage:
            return "Unsupported language"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .apiError(let message):
            return "API error: \(message)"
        case .cacheError:
            return "Cache error"
        case .noTranslationNeeded:
            return "No translation needed"
        }
    }
}

// MARK: - Language

enum Language: String, CaseIterable, Codable {
    case english = "en"
    case french = "fr"
    case russian = "ru"
    case portuguese = "pt"
    case auto = "auto"

    var displayName: String {
        switch self {
        case .english: return "English"
        case .french: return "Français"
        case .russian: return "Русский"
        case .portuguese: return "Português"
        case .auto: return "Auto-detect"
        }
    }

    var nativeName: String {
        switch self {
        case .english: return "English"
        case .french: return "Français"
        case .russian: return "Русский"
        case .portuguese: return "Português"
        case .auto: return "Auto"
        }
    }

    var flagEmoji: String {
        switch self {
        case .english: return "🇬🇧"
        case .french: return "🇫🇷"
        case .russian: return "🇷🇺"
        case .portuguese: return "🇵🇹"
        case .auto: return "🌐"
        }
    }

    static var supportedLanguages: [Language] {
        [.english, .french, .russian, .portuguese]
    }
}

// MARK: - Translation Request

struct TranslationAPIRequest: Codable {
    let text: String
    let sourceLanguage: String
    let targetLanguage: String
    let modelType: String

    enum CodingKeys: String, CodingKey {
        case text
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
        case modelType = "model_type"
    }
}

// MARK: - Translation Response

struct TranslationAPIResponse: Codable {
    let originalText: String
    let translatedText: String
    let sourceLanguage: String
    let targetLanguage: String
    let modelUsed: String
    let confidenceScore: Double
    let processingTimeMs: Int
    let fromCache: Bool

    enum CodingKeys: String, CodingKey {
        case originalText = "original_text"
        case translatedText = "translated_text"
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
        case modelUsed = "model_used"
        case confidenceScore = "confidence_score"
        case processingTimeMs = "processing_time_ms"
        case fromCache = "from_cache"
    }
}

// MARK: - Translation Result

struct TranslationResult: Codable, Identifiable {
    let id: String
    let originalText: String
    let translatedText: String
    let sourceLanguage: Language
    let targetLanguage: Language
    let confidence: Double
    let provider: String
    let timestamp: Date
    let fromCache: Bool
    let processingTimeMs: Int

    init(
        id: String = UUID().uuidString,
        originalText: String,
        translatedText: String,
        sourceLanguage: Language,
        targetLanguage: Language,
        confidence: Double,
        provider: String,
        timestamp: Date = Date(),
        fromCache: Bool = false,
        processingTimeMs: Int = 0
    ) {
        self.id = id
        self.originalText = originalText
        self.translatedText = translatedText
        self.sourceLanguage = sourceLanguage
        self.targetLanguage = targetLanguage
        self.confidence = confidence
        self.provider = provider
        self.timestamp = timestamp
        self.fromCache = fromCache
        self.processingTimeMs = processingTimeMs
    }
}

// MARK: - Translation Language Detection Result

struct TranslationLanguageDetectionResult: Codable {
    let detectedLanguage: Language
    let confidence: Double
    let alternativeLanguages: [Language: Double]

    init(detectedLanguage: Language, confidence: Double, alternativeLanguages: [Language: Double] = [:]) {
        self.detectedLanguage = detectedLanguage
        self.confidence = confidence
        self.alternativeLanguages = alternativeLanguages
    }
}

// MARK: - Translation Service

@MainActor
final class TranslationService: ObservableObject {
    // MARK: - Published Properties

    @Published var isTranslating = false
    @Published var lastError: TranslationError?
    @Published var translationHistory: [TranslationResult] = []

    // MARK: - Properties

    private let translatorBaseURL: String
    private let session: URLSession
    private let cache: TranslationCache
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    // User preferences
    @Published var defaultQuality: TranslationQuality = .balanced
    @Published var autoTranslateEnabled: Bool = false
    @Published var preferredLanguage: Language = .english

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Singleton

    static let shared = TranslationService()

    // MARK: - Initialization

    private init() {
        // Translator service URL (localhost for development)
        self.translatorBaseURL = "http://localhost:8000"

        // Configure session
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData

        self.session = URLSession(configuration: configuration)
        self.cache = TranslationCache.shared

        // Setup encoder/decoder
        encoder.keyEncodingStrategy = .convertToSnakeCase
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        // Load user preferences
        loadPreferences()
    }

    // MARK: - Public Translation Methods

    /// Translate text with specified parameters
    func translate(
        text: String,
        from sourceLanguage: Language = .auto,
        to targetLanguage: Language,
        quality: TranslationQuality? = nil
    ) async throws -> TranslationResult {
        guard !text.isEmpty else {
            throw TranslationError.invalidText
        }

        // Check if translation is needed
        if sourceLanguage != .auto && sourceLanguage == targetLanguage {
            throw TranslationError.noTranslationNeeded
        }

        await MainActor.run {
            isTranslating = true
            lastError = nil
        }

        defer {
            Task { @MainActor in
                isTranslating = false
            }
        }

        // Check cache first
        if let cachedResult = await cache.get(
            text: text,
            sourceLanguage: sourceLanguage.rawValue,
            targetLanguage: targetLanguage.rawValue
        ) {
            let result = TranslationResult(
                originalText: text,
                translatedText: cachedResult.translatedText,
                sourceLanguage: Language(rawValue: cachedResult.sourceLanguage) ?? sourceLanguage,
                targetLanguage: targetLanguage,
                confidence: cachedResult.confidence,
                provider: cachedResult.provider,
                timestamp: cachedResult.timestamp,
                fromCache: true,
                processingTimeMs: 0
            )

            await addToHistory(result)
            return result
        }

        // Perform API translation
        let usedQuality = quality ?? defaultQuality
        let result = try await performTranslation(
            text: text,
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            quality: usedQuality
        )

        // Cache the result
        await cache.save(result)

        // Add to history
        await addToHistory(result)

        return result
    }

    /// Translate multiple messages in batch
    func translateBatch(
        messages: [(text: String, targetLanguage: Language)],
        quality: TranslationQuality? = nil
    ) async throws -> [TranslationResult] {
        var results: [TranslationResult] = []

        for (text, targetLanguage) in messages {
            do {
                let result = try await translate(
                    text: text,
                    to: targetLanguage,
                    quality: quality
                )
                results.append(result)
            } catch {
                // Continue with other translations even if one fails
                continue
            }
        }

        return results
    }

    /// Detect language of given text
    func detectLanguage(_ text: String) async throws -> TranslationLanguageDetectionResult {
        guard !text.isEmpty else {
            throw TranslationError.invalidText
        }

        // Use translation API with auto-detect to get language
        // Translate to a neutral language (English) to detect source
        let result = try await performTranslation(
            text: text,
            sourceLanguage: .auto,
            targetLanguage: .english,
            quality: .fast
        )

        return TranslationLanguageDetectionResult(
            detectedLanguage: result.sourceLanguage,
            confidence: result.confidence
        )
    }

    // MARK: - Private API Methods

    private func performTranslation(
        text: String,
        sourceLanguage: Language,
        targetLanguage: Language,
        quality: TranslationQuality
    ) async throws -> TranslationResult {
        let url = URL(string: "\(translatorBaseURL)/translate")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let apiRequest = TranslationAPIRequest(
            text: text,
            sourceLanguage: sourceLanguage.rawValue,
            targetLanguage: targetLanguage.rawValue,
            modelType: quality.rawValue
        )

        request.httpBody = try encoder.encode(apiRequest)

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw TranslationError.apiError("Invalid response")
            }

            guard httpResponse.statusCode == 200 else {
                throw TranslationError.apiError("HTTP \(httpResponse.statusCode)")
            }

            let apiResponse = try decoder.decode(TranslationAPIResponse.self, from: data)

            let detectedLanguage = Language(rawValue: apiResponse.sourceLanguage) ?? sourceLanguage

            return TranslationResult(
                originalText: apiResponse.originalText,
                translatedText: apiResponse.translatedText,
                sourceLanguage: detectedLanguage,
                targetLanguage: targetLanguage,
                confidence: apiResponse.confidenceScore,
                provider: apiResponse.modelUsed,
                fromCache: apiResponse.fromCache,
                processingTimeMs: apiResponse.processingTimeMs
            )

        } catch let error as TranslationError {
            await MainActor.run {
                lastError = error
            }
            throw error
        } catch {
            let translationError = TranslationError.networkError(error)
            await MainActor.run {
                lastError = translationError
            }
            throw translationError
        }
    }

    // MARK: - History Management

    private func addToHistory(_ result: TranslationResult) async {
        await MainActor.run {
            translationHistory.insert(result, at: 0)

            // Keep only last 100 translations
            if translationHistory.count > 100 {
                translationHistory = Array(translationHistory.prefix(100))
            }
        }
    }

    func clearHistory() {
        translationHistory.removeAll()
    }

    // MARK: - Preferences

    private func loadPreferences() {
        if let qualityRaw = UserDefaults.standard.string(forKey: "translationQuality"),
           let quality = TranslationQuality(rawValue: qualityRaw) {
            defaultQuality = quality
        }

        autoTranslateEnabled = UserDefaults.standard.bool(forKey: "autoTranslateEnabled")

        if let languageRaw = UserDefaults.standard.string(forKey: "preferredLanguage"),
           let language = Language(rawValue: languageRaw) {
            preferredLanguage = language
        }
    }

    func savePreferences() {
        UserDefaults.standard.set(defaultQuality.rawValue, forKey: "translationQuality")
        UserDefaults.standard.set(autoTranslateEnabled, forKey: "autoTranslateEnabled")
        UserDefaults.standard.set(preferredLanguage.rawValue, forKey: "preferredLanguage")
    }

    // MARK: - Health Check

    func checkServiceHealth() async -> Bool {
        let url = URL(string: "\(translatorBaseURL)/health")!

        do {
            let (_, response) = try await session.data(from: url)

            guard let httpResponse = response as? HTTPURLResponse else {
                return false
            }

            return httpResponse.statusCode == 200
        } catch {
            return false
        }
    }

    // MARK: - Statistics

    func getStatistics() -> TranslationStatistics {
        let totalTranslations = translationHistory.count
        let cachedTranslations = translationHistory.filter { $0.fromCache }.count
        let averageConfidence = translationHistory.isEmpty ? 0 : translationHistory.map { $0.confidence }.reduce(0, +) / Double(totalTranslations)
        let averageProcessingTime = translationHistory.isEmpty ? 0 : translationHistory.map { $0.processingTimeMs }.reduce(0, +) / totalTranslations

        var languagePairs: [String: Int] = [:]
        for translation in translationHistory {
            let pair = "\(translation.sourceLanguage.rawValue)-\(translation.targetLanguage.rawValue)"
            languagePairs[pair, default: 0] += 1
        }

        return TranslationStatistics(
            totalTranslations: totalTranslations,
            cachedTranslations: cachedTranslations,
            averageConfidence: averageConfidence,
            averageProcessingTimeMs: averageProcessingTime,
            languagePairs: languagePairs
        )
    }
}

// MARK: - Translation Statistics

struct TranslationStatistics {
    let totalTranslations: Int
    let cachedTranslations: Int
    let averageConfidence: Double
    let averageProcessingTimeMs: Int
    let languagePairs: [String: Int]

    var cacheHitRate: Double {
        guard totalTranslations > 0 else { return 0 }
        return Double(cachedTranslations) / Double(totalTranslations)
    }
}
