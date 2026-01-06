//
//  SentimentAnalyzer.swift
//  Meeshy
//
//  Thread-safe sentiment analysis service with caching
//  Uses Apple's NaturalLanguage framework for on-device analysis
//  iOS 13+
//
//  ARCHITECTURE:
//  - Actor-based for thread safety (no freezing main thread)
//  - LRU cache with TTL to avoid recalculation
//  - Async/await API for non-blocking usage
//  - Batch processing support
//

import Foundation
import NaturalLanguage

// MARK: - Sentiment Category

/// Sentiment categories derived from analysis scores
public enum SentimentCategory: String, Codable, Sendable, CaseIterable {
    case veryPositive = "very_positive"
    case positive = "positive"
    case neutral = "neutral"
    case negative = "negative"
    case veryNegative = "very_negative"
    case unknown = "unknown"

    /// Categorizes a sentiment score (-1.0 to 1.0) into a category
    public static func from(score: Double) -> SentimentCategory {
        switch score {
        case 0.5...1.0:
            return .veryPositive
        case 0.15..<0.5:
            return .positive
        case -0.15..<0.15:
            return .neutral
        case -0.5..<(-0.15):
            return .negative
        case -1.0..<(-0.5):
            return .veryNegative
        default:
            return .unknown
        }
    }

    /// Human-readable display name
    public var displayName: String {
        switch self {
        case .veryPositive: return "Very Positive"
        case .positive: return "Positive"
        case .neutral: return "Neutral"
        case .negative: return "Negative"
        case .veryNegative: return "Very Negative"
        case .unknown: return "Unknown"
        }
    }

    /// Emoji representation
    public var emoji: String {
        switch self {
        case .veryPositive: return "😄"
        case .positive: return "🙂"
        case .neutral: return "😐"
        case .negative: return "😕"
        case .veryNegative: return "😠"
        case .unknown: return "❓"
        }
    }

    /// SF Symbol icon name
    public var iconName: String {
        switch self {
        case .veryPositive: return "face.smiling.fill"
        case .positive: return "face.smiling"
        case .neutral: return "minus.circle"
        case .negative: return "cloud"
        case .veryNegative: return "cloud.rain"
        case .unknown: return "questionmark.circle"
        }
    }

    /// Color name for UI
    public var colorName: String {
        switch self {
        case .veryPositive: return "green"
        case .positive: return "teal"
        case .neutral: return "gray"
        case .negative: return "orange"
        case .veryNegative: return "red"
        case .unknown: return "gray"
        }
    }
}

// MARK: - Sentiment Result

/// Complete sentiment analysis result
public struct SentimentResult: Codable, Sendable, Hashable {
    /// Raw sentiment score from -1.0 (negative) to 1.0 (positive)
    public let score: Double

    /// Categorized sentiment
    public let category: SentimentCategory

    /// Detected language (if available)
    public let detectedLanguage: String?

    /// Whether the language is supported for sentiment analysis
    public let isLanguageSupported: Bool

    /// Timestamp of analysis
    public let analyzedAt: Date

    public init(
        score: Double,
        category: SentimentCategory,
        detectedLanguage: String? = nil,
        isLanguageSupported: Bool = true,
        analyzedAt: Date = Date()
    ) {
        self.score = score
        self.category = category
        self.detectedLanguage = detectedLanguage
        self.isLanguageSupported = isLanguageSupported
        self.analyzedAt = analyzedAt
    }

    /// Default neutral result for empty/invalid text
    public static let neutral = SentimentResult(
        score: 0.0,
        category: .neutral,
        detectedLanguage: nil,
        isLanguageSupported: true
    )
}

// MARK: - Sentiment Cache Configuration

/// Cache configuration specifically for sentiment analysis
public extension CacheConfiguration {
    /// Long-lived cache for sentiment (sentiment doesn't change for same text)
    static let sentiment = CacheConfiguration(
        maxItems: 2000,      // Cache up to 2000 message sentiments
        defaultTTL: 86400,   // 24 hours (text content rarely changes)
        autoPurge: true,
        purgeInterval: 3600  // Purge every hour
    )
}

// MARK: - Sentiment Analyzer Actor

/// Thread-safe sentiment analyzer with caching
/// Uses Apple's NaturalLanguage framework for on-device analysis
@available(iOS 13.0, *)
public actor SentimentAnalyzer {

    // MARK: - Singleton

    /// Shared instance for app-wide usage
    public static let shared = SentimentAnalyzer()

    // MARK: - Properties

    /// Cache for sentiment results (messageId -> result)
    private let cache: InMemoryCache<String, SentimentResult>

    /// NLTagger instance (reused for efficiency)
    private let tagger: NLTagger

    /// Supported languages for sentiment analysis
    private static let supportedLanguages: Set<NLLanguage> = [
        .english, .french, .german, .spanish,
        .italian, .portuguese, .simplifiedChinese
    ]

    // MARK: - Statistics

    private(set) var totalAnalyses: Int = 0
    private(set) var cacheHits: Int = 0
    private(set) var cacheMisses: Int = 0

    // MARK: - Initialization

    public init(configuration: CacheConfiguration = .sentiment) {
        self.cache = InMemoryCache<String, SentimentResult>(configuration: configuration)
        self.tagger = NLTagger(tagSchemes: [.sentimentScore, .language])

        sentimentLogger.info("SentimentAnalyzer initialized", [
            "maxCacheItems": configuration.maxItems,
            "cacheTTL": configuration.defaultTTL
        ])
    }

    // MARK: - Public API

    /// Analyze sentiment of a message
    /// - Parameters:
    ///   - messageId: Unique message identifier for caching
    ///   - content: Text content to analyze
    ///   - forceRefresh: If true, bypasses cache
    /// - Returns: Sentiment analysis result
    public func analyze(
        messageId: String,
        content: String,
        forceRefresh: Bool = false
    ) async -> SentimentResult {
        totalAnalyses += 1

        // Check cache first (unless force refresh)
        if !forceRefresh, let cached = await cache.get(messageId) {
            cacheHits += 1
            sentimentLogger.trace("Sentiment cache hit", [
                "messageId": messageId,
                "category": cached.category.rawValue,
                "score": cached.score
            ])
            return cached
        }

        cacheMisses += 1

        // Perform analysis
        let result = performAnalysis(content: content)

        // Cache result
        await cache.set(result, forKey: messageId)

        // Log the analysis
        sentimentLogger.debug("Sentiment analyzed", [
            "messageId": messageId,
            "content_preview": String(content.prefix(50)),
            "score": result.score,
            "category": result.category.rawValue,
            "language": result.detectedLanguage ?? "unknown",
            "isSupported": result.isLanguageSupported
        ])

        return result
    }

    /// Analyze sentiment without caching (for preview/one-off analysis)
    /// - Parameter content: Text content to analyze
    /// - Returns: Sentiment analysis result
    public func analyzeText(_ content: String) -> SentimentResult {
        return performAnalysis(content: content)
    }

    /// Batch analyze multiple messages efficiently
    /// - Parameters:
    ///   - messages: Array of (messageId, content) tuples
    ///   - forceRefresh: If true, bypasses cache for all messages
    /// - Returns: Dictionary mapping messageId to result
    public func analyzeBatch(
        messages: [(messageId: String, content: String)],
        forceRefresh: Bool = false
    ) async -> [String: SentimentResult] {
        var results: [String: SentimentResult] = [:]

        for (messageId, content) in messages {
            let result = await analyze(
                messageId: messageId,
                content: content,
                forceRefresh: forceRefresh
            )
            results[messageId] = result
        }

        sentimentLogger.info("Batch sentiment analysis completed", [
            "count": messages.count,
            "cacheHits": cacheHits,
            "cacheMisses": cacheMisses
        ])

        return results
    }

    /// Get cached sentiment for a message (if available)
    /// - Parameter messageId: Message identifier
    /// - Returns: Cached result or nil
    public func getCached(messageId: String) async -> SentimentResult? {
        return await cache.get(messageId)
    }

    /// Check if sentiment is cached for a message
    /// - Parameter messageId: Message identifier
    /// - Returns: True if cached
    public func isCached(messageId: String) async -> Bool {
        return await cache.contains(messageId)
    }

    /// Invalidate cache for a specific message
    /// - Parameter messageId: Message identifier
    public func invalidate(messageId: String) async {
        await cache.remove(messageId)
        sentimentLogger.trace("Sentiment cache invalidated", ["messageId": messageId])
    }

    /// Clear all cached sentiments
    public func clearCache() async {
        await cache.clear()
        sentimentLogger.info("Sentiment cache cleared")
    }

    /// Get cache statistics
    public func getStatistics() async -> SentimentStatistics {
        let cacheStats = await cache.statistics
        return SentimentStatistics(
            totalAnalyses: totalAnalyses,
            cacheHits: cacheHits,
            cacheMisses: cacheMisses,
            hitRate: totalAnalyses > 0 ? Double(cacheHits) / Double(totalAnalyses) : 0,
            cachedItems: cacheStats.count,
            maxCacheItems: cacheStats.maxItems
        )
    }

    // MARK: - Private Methods

    /// Perform actual sentiment analysis
    private func performAnalysis(content: String) -> SentimentResult {
        // Handle empty/whitespace-only content
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedContent.isEmpty else {
            return .neutral
        }

        // Set text on tagger
        tagger.string = trimmedContent

        // Detect language
        let detectedLanguage = tagger.dominantLanguage
        let languageCode = detectedLanguage?.rawValue

        // Check if sentiment analysis is supported for this language
        let isSupported: Bool
        if let lang = detectedLanguage {
            let availableSchemes = NLTagger.availableTagSchemes(for: .paragraph, language: lang)
            isSupported = availableSchemes.contains(.sentimentScore)
        } else {
            isSupported = false
        }

        // Get sentiment score
        let (sentiment, _) = tagger.tag(
            at: trimmedContent.startIndex,
            unit: .paragraph,
            scheme: .sentimentScore
        )

        let score = Double(sentiment?.rawValue ?? "0") ?? 0.0
        let category = SentimentCategory.from(score: score)

        return SentimentResult(
            score: score,
            category: category,
            detectedLanguage: languageCode,
            isLanguageSupported: isSupported
        )
    }

    /// Check if a language is supported for sentiment analysis
    public static func isLanguageSupported(_ language: NLLanguage) -> Bool {
        let availableSchemes = NLTagger.availableTagSchemes(for: .paragraph, language: language)
        return availableSchemes.contains(.sentimentScore)
    }
}

// MARK: - Statistics

/// Statistics for sentiment analysis service
public struct SentimentStatistics: Sendable {
    public let totalAnalyses: Int
    public let cacheHits: Int
    public let cacheMisses: Int
    public let hitRate: Double
    public let cachedItems: Int
    public let maxCacheItems: Int

    public var hitRatePercentage: String {
        String(format: "%.1f%%", hitRate * 100)
    }
}

// MARK: - Message Extension

/// Extension to easily get sentiment for a Message
@available(iOS 13.0, *)
extension Message {

    /// Analyze sentiment for this message
    /// - Parameter forceRefresh: If true, bypasses cache
    /// - Returns: Sentiment analysis result
    func analyzeSentiment(forceRefresh: Bool = false) async -> SentimentResult {
        // Only analyze text messages with content
        guard messageType == .text, !content.isEmpty else {
            return .neutral
        }

        return await SentimentAnalyzer.shared.analyze(
            messageId: id,
            content: content,
            forceRefresh: forceRefresh
        )
    }

    /// Get cached sentiment (if available)
    var cachedSentiment: SentimentResult? {
        get async {
            return await SentimentAnalyzer.shared.getCached(messageId: id)
        }
    }
}
