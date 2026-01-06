//
//  LanguageDetector.swift
//  Meeshy
//
//  Thread-safe language detection service with caching
//  Uses Apple's NaturalLanguage framework for on-device detection
//  iOS 12+
//
//  ARCHITECTURE:
//  - Actor-based for thread safety (no freezing main thread)
//  - LRU cache with TTL to avoid recalculation
//  - Async/await API for non-blocking usage
//  - Supports single and multi-language detection
//  - Optimized for real-time typing detection
//

import Foundation
import NaturalLanguage

// MARK: - Language Detection Result

/// Result of language detection for a text
public struct LanguageDetectionResult: Codable, Sendable, Hashable {
    /// Primary detected language code (e.g., "fr", "en", "es")
    public let primaryLanguage: String?

    /// Confidence score for primary language (0.0 to 1.0)
    public let confidence: Double

    /// Alternative language hypotheses with their confidence scores
    public let alternatives: [LanguageHypothesis]

    /// Whether the detection is reliable (confidence > threshold)
    public let isReliable: Bool

    /// Timestamp of detection
    public let detectedAt: Date

    /// Original text length (for reference)
    public let textLength: Int

    public init(
        primaryLanguage: String?,
        confidence: Double,
        alternatives: [LanguageHypothesis] = [],
        isReliable: Bool = true,
        detectedAt: Date = Date(),
        textLength: Int = 0
    ) {
        self.primaryLanguage = primaryLanguage
        self.confidence = confidence
        self.alternatives = alternatives
        self.isReliable = isReliable
        self.detectedAt = detectedAt
        self.textLength = textLength
    }

    /// Default unknown result
    public static let unknown = LanguageDetectionResult(
        primaryLanguage: nil,
        confidence: 0.0,
        alternatives: [],
        isReliable: false,
        textLength: 0
    )

    /// Display name for the primary language using current locale
    public var primaryLanguageDisplayName: String? {
        guard let code = primaryLanguage else { return nil }
        return Locale.current.localizedString(forLanguageCode: code)
    }

    /// Flag emoji for the primary language (best effort)
    public var primaryLanguageFlag: String {
        guard let code = primaryLanguage else { return "🌐" }
        return Self.flagEmoji(forLanguageCode: code)
    }

    /// Get flag emoji for a language code
    public static func flagEmoji(forLanguageCode code: String) -> String {
        // Map language codes to country codes for flag emojis
        let languageToCountry: [String: String] = [
            "en": "US", "fr": "FR", "de": "DE", "es": "ES", "it": "IT",
            "pt": "PT", "nl": "NL", "ru": "RU", "zh": "CN", "ja": "JP",
            "ko": "KR", "ar": "SA", "hi": "IN", "tr": "TR", "pl": "PL",
            "uk": "UA", "vi": "VN", "th": "TH", "id": "ID", "ms": "MY",
            "sv": "SE", "da": "DK", "no": "NO", "fi": "FI", "el": "GR",
            "he": "IL", "cs": "CZ", "ro": "RO", "hu": "HU", "sk": "SK",
            "bg": "BG", "hr": "HR", "sl": "SI", "sr": "RS", "ca": "ES",
            "eu": "ES", "gl": "ES"
        ]

        guard let countryCode = languageToCountry[code.lowercased().prefix(2).description] else {
            return "🌐"
        }

        // Convert country code to flag emoji
        let base: UInt32 = 127397
        var flag = ""
        for scalar in countryCode.uppercased().unicodeScalars {
            if let unicode = UnicodeScalar(base + scalar.value) {
                flag.append(Character(unicode))
            }
        }
        return flag.isEmpty ? "🌐" : flag
    }
}

// MARK: - Language Hypothesis

/// A language hypothesis with confidence score
public struct LanguageHypothesis: Codable, Sendable, Hashable {
    public let languageCode: String
    public let confidence: Double

    public init(languageCode: String, confidence: Double) {
        self.languageCode = languageCode
        self.confidence = confidence
    }

    /// Display name using current locale
    public var displayName: String? {
        Locale.current.localizedString(forLanguageCode: languageCode)
    }

    /// Flag emoji for this language
    public var flag: String {
        LanguageDetectionResult.flagEmoji(forLanguageCode: languageCode)
    }
}

// MARK: - Language Detection Configuration

/// Configuration for language detection behavior
public struct LanguageDetectionConfiguration: Sendable {
    /// Minimum text length for reliable detection
    public let minimumTextLength: Int

    /// Confidence threshold for considering detection reliable
    public let reliabilityThreshold: Double

    /// Maximum number of alternative hypotheses to return
    public let maxAlternatives: Int

    /// Language hints to improve detection accuracy
    public let languageHints: [NLLanguage]

    /// Languages to constrain detection to (empty = all)
    public let languageConstraints: [NLLanguage]

    public init(
        minimumTextLength: Int = 3,
        reliabilityThreshold: Double = 0.5,
        maxAlternatives: Int = 3,
        languageHints: [NLLanguage] = [],
        languageConstraints: [NLLanguage] = []
    ) {
        self.minimumTextLength = minimumTextLength
        self.reliabilityThreshold = reliabilityThreshold
        self.maxAlternatives = maxAlternatives
        self.languageHints = languageHints
        self.languageConstraints = languageConstraints
    }

    /// Default configuration for general use
    public static let `default` = LanguageDetectionConfiguration()

    /// Configuration optimized for real-time typing detection
    public static let realtime = LanguageDetectionConfiguration(
        minimumTextLength: 5,
        reliabilityThreshold: 0.6,
        maxAlternatives: 2,
        languageHints: [],
        languageConstraints: []
    )

    /// Configuration for Meeshy (French-first with common languages)
    public static let meeshy = LanguageDetectionConfiguration(
        minimumTextLength: 3,
        reliabilityThreshold: 0.5,
        maxAlternatives: 3,
        languageHints: [.french, .english],
        languageConstraints: []
    )
}

// MARK: - Cache Configuration Extension

public extension CacheConfiguration {
    /// Short-lived cache for language detection (text changes frequently during typing)
    static let languageDetection = CacheConfiguration(
        maxItems: 500,       // Smaller cache (temporary detections)
        defaultTTL: 300,     // 5 minutes (typing is ephemeral)
        autoPurge: true,
        purgeInterval: 60
    )
}

// MARK: - Language Detector Actor

/// Thread-safe language detector with caching
/// Uses Apple's NaturalLanguage framework for on-device detection
public actor LanguageDetector {

    // MARK: - Singleton

    /// Shared instance for app-wide usage
    public static let shared = LanguageDetector()

    // MARK: - Properties

    /// Cache for detection results (text hash -> result)
    private let cache: InMemoryCache<String, LanguageDetectionResult>

    /// Default configuration
    private let defaultConfiguration: LanguageDetectionConfiguration

    // MARK: - Statistics

    private(set) var totalDetections: Int = 0
    private(set) var cacheHits: Int = 0
    private(set) var cacheMisses: Int = 0

    // MARK: - Initialization

    public init(
        cacheConfiguration: CacheConfiguration = .languageDetection,
        detectionConfiguration: LanguageDetectionConfiguration = .meeshy
    ) {
        self.cache = InMemoryCache<String, LanguageDetectionResult>(configuration: cacheConfiguration)
        self.defaultConfiguration = detectionConfiguration

        languageLogger.info("LanguageDetector initialized", [
            "maxCacheItems": cacheConfiguration.maxItems,
            "cacheTTL": cacheConfiguration.defaultTTL,
            "reliabilityThreshold": detectionConfiguration.reliabilityThreshold
        ])
    }

    // MARK: - Public API

    /// Detect the primary language of a text
    /// - Parameters:
    ///   - text: Text to analyze
    ///   - configuration: Optional configuration override
    ///   - useCache: Whether to use caching (default: true)
    /// - Returns: Language detection result
    public func detect(
        _ text: String,
        configuration: LanguageDetectionConfiguration? = nil,
        useCache: Bool = true
    ) async -> LanguageDetectionResult {
        totalDetections += 1

        let config = configuration ?? defaultConfiguration
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)

        // Handle empty or too short text
        guard trimmedText.count >= config.minimumTextLength else {
            languageLogger.trace("Text too short for detection", [
                "length": trimmedText.count,
                "minimum": config.minimumTextLength
            ])
            return .unknown
        }

        // Generate cache key from text hash
        let cacheKey = generateCacheKey(trimmedText)

        // Check cache
        if useCache, let cached = await cache.get(cacheKey) {
            cacheHits += 1
            languageLogger.trace("Language cache hit", [
                "language": cached.primaryLanguage ?? "unknown",
                "confidence": cached.confidence
            ])
            return cached
        }

        cacheMisses += 1

        // Perform detection
        let result = performDetection(text: trimmedText, configuration: config)

        // Cache result
        if useCache {
            await cache.set(result, forKey: cacheKey)
        }

        // Log detection
        languageLogger.debug("Language detected", [
            "text_preview": String(trimmedText.prefix(30)),
            "language": result.primaryLanguage ?? "unknown",
            "confidence": String(format: "%.2f", result.confidence),
            "isReliable": result.isReliable,
            "alternatives": result.alternatives.count
        ])

        return result
    }

    /// Detect language with simple string result (convenience method)
    /// - Parameter text: Text to analyze
    /// - Returns: Language code or nil if not detected
    public func detectLanguageCode(_ text: String) async -> String? {
        let result = await detect(text)
        return result.isReliable ? result.primaryLanguage : nil
    }

    /// Detect language for real-time typing (optimized for speed)
    /// Uses shorter cache TTL and simpler detection
    /// - Parameter text: Current text being typed
    /// - Returns: Language detection result
    public func detectWhileTyping(_ text: String) async -> LanguageDetectionResult {
        return await detect(text, configuration: .realtime, useCache: true)
    }

    /// Batch detect languages for multiple texts
    /// - Parameter texts: Array of texts to analyze
    /// - Returns: Array of detection results (same order as input)
    public func detectBatch(_ texts: [String]) async -> [LanguageDetectionResult] {
        var results: [LanguageDetectionResult] = []
        results.reserveCapacity(texts.count)

        for text in texts {
            let result = await detect(text)
            results.append(result)
        }

        languageLogger.info("Batch language detection completed", [
            "count": texts.count,
            "cacheHits": cacheHits,
            "cacheMisses": cacheMisses
        ])

        return results
    }

    /// Check if a specific language is dominant in the text
    /// - Parameters:
    ///   - language: Language to check for
    ///   - text: Text to analyze
    ///   - minimumConfidence: Minimum confidence required (default: 0.5)
    /// - Returns: True if the language is dominant with sufficient confidence
    public func isLanguage(
        _ language: NLLanguage,
        in text: String,
        minimumConfidence: Double = 0.5
    ) async -> Bool {
        let result = await detect(text)
        guard let detected = result.primaryLanguage else { return false }
        return detected == language.rawValue && result.confidence >= minimumConfidence
    }

    /// Get supported languages for detection
    /// - Returns: Array of supported NLLanguage values
    public static var supportedLanguages: [NLLanguage] {
        // NaturalLanguage supports 50+ languages
        // Return the most common ones used in Meeshy
        return [
            .french, .english, .german, .spanish, .italian,
            .portuguese, .dutch, .russian, .simplifiedChinese, .japanese,
            .korean, .arabic, .hindi, .turkish, .polish,
            .ukrainian, .vietnamese, .thai, .indonesian
        ]
    }

    // MARK: - Cache Management

    /// Clear the language detection cache
    public func clearCache() async {
        await cache.clear()
        languageLogger.info("Language detection cache cleared")
    }

    /// Get cache statistics
    public func getStatistics() async -> LanguageDetectorStatistics {
        let cacheStats = await cache.statistics
        return LanguageDetectorStatistics(
            totalDetections: totalDetections,
            cacheHits: cacheHits,
            cacheMisses: cacheMisses,
            hitRate: totalDetections > 0 ? Double(cacheHits) / Double(totalDetections) : 0,
            cachedItems: cacheStats.count,
            maxCacheItems: cacheStats.maxItems
        )
    }

    // MARK: - Private Methods

    /// Generate a cache key from text
    private func generateCacheKey(_ text: String) -> String {
        // Use a hash of the text for efficient caching
        // Normalize by lowercasing to cache similar texts together
        let normalized = text.lowercased()
        return String(normalized.hashValue)
    }

    /// Perform actual language detection
    private func performDetection(
        text: String,
        configuration: LanguageDetectionConfiguration
    ) -> LanguageDetectionResult {
        let recognizer = NLLanguageRecognizer()

        // Apply language hints if provided
        if !configuration.languageHints.isEmpty {
            var hints: [NLLanguage: Double] = [:]
            for hint in configuration.languageHints {
                hints[hint] = 0.1 // Small boost for hinted languages
            }
            recognizer.languageHints = hints
        }

        // Apply language constraints if provided
        if !configuration.languageConstraints.isEmpty {
            recognizer.languageConstraints = configuration.languageConstraints
        }

        // Process the text
        recognizer.processString(text)

        // Get primary language
        let primaryLanguage = recognizer.dominantLanguage

        // Get hypotheses for alternatives
        let hypotheses = recognizer.languageHypotheses(withMaximum: configuration.maxAlternatives + 1)

        // Calculate confidence for primary language
        let primaryConfidence = primaryLanguage.flatMap { hypotheses[$0] } ?? 0.0

        // Build alternatives (excluding primary)
        let alternatives: [LanguageHypothesis] = hypotheses
            .filter { $0.key != primaryLanguage }
            .sorted { $0.value > $1.value }
            .prefix(configuration.maxAlternatives)
            .map { LanguageHypothesis(languageCode: $0.key.rawValue, confidence: $0.value) }

        // Determine reliability
        let isReliable = primaryConfidence >= configuration.reliabilityThreshold

        return LanguageDetectionResult(
            primaryLanguage: primaryLanguage?.rawValue,
            confidence: primaryConfidence,
            alternatives: alternatives,
            isReliable: isReliable,
            textLength: text.count
        )
    }
}

// MARK: - Statistics

/// Statistics for language detection service
public struct LanguageDetectorStatistics: Sendable {
    public let totalDetections: Int
    public let cacheHits: Int
    public let cacheMisses: Int
    public let hitRate: Double
    public let cachedItems: Int
    public let maxCacheItems: Int

    public var hitRatePercentage: String {
        String(format: "%.1f%%", hitRate * 100)
    }
}

// MARK: - String Extension

public extension String {
    /// Detect the language of this string
    /// - Returns: Language detection result
    func detectLanguage() async -> LanguageDetectionResult {
        await LanguageDetector.shared.detect(self)
    }

    /// Get the detected language code for this string
    /// - Returns: Language code or nil if not reliably detected
    var detectedLanguageCode: String? {
        get async {
            await LanguageDetector.shared.detectLanguageCode(self)
        }
    }
}
