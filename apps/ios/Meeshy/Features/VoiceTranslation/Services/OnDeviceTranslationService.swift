//
//  OnDeviceTranslationService.swift
//  Meeshy
//
//  On-device translation service - Unified interface for translation
//
//  Uses the OnDeviceTranslationEngine which intelligently routes to:
//  1. NLLB CoreML (Meta's 600M model) - PRIMARY, bundled, 200 languages
//  2. Apple Translation Framework (iOS 18+) - Secondary option
//  3. API Fallback - Only when on-device is not available
//
//  Target: 100% on-device translation with <500ms latency
//

import Foundation
import NaturalLanguage

#if canImport(Translation)
import Translation
#endif

// MARK: - On-Device Translation Service

/// Service for on-device text translation
/// Delegates to OnDeviceTranslationEngine for intelligent provider routing
actor OnDeviceTranslationService {

    // MARK: - Types

    enum TranslationProvider: String {
        case appleOnDevice = "apple_on_device"
        case coreMLModel = "coreml_model"
        case apiBackend = "api_backend"
        case cached = "cached"

        init(from engineProvider: OnDeviceTranslationEngine.TranslationProvider) {
            switch engineProvider {
            case .appleTranslation:
                self = .appleOnDevice
            case .coreMLModel:
                self = .coreMLModel
            case .apiBackend:
                self = .apiBackend
            case .cached:
                self = .cached
            }
        }
    }

    struct OnDeviceTranslationResult {
        let originalText: String
        let translatedText: String
        let sourceLanguage: VoiceTranslationLanguage
        let targetLanguage: VoiceTranslationLanguage
        let confidence: Float
        let provider: TranslationProvider
        let processingTime: TimeInterval
        let isOnDevice: Bool

        init(
            originalText: String,
            translatedText: String,
            sourceLanguage: VoiceTranslationLanguage,
            targetLanguage: VoiceTranslationLanguage,
            confidence: Float = 1.0,
            provider: TranslationProvider,
            processingTime: TimeInterval = 0,
            isOnDevice: Bool = true
        ) {
            self.originalText = originalText
            self.translatedText = translatedText
            self.sourceLanguage = sourceLanguage
            self.targetLanguage = targetLanguage
            self.confidence = confidence
            self.provider = provider
            self.processingTime = processingTime
            self.isOnDevice = isOnDevice
        }

        init(from engineResult: OnDeviceTranslationEngine.TranslationResult) {
            self.originalText = engineResult.sourceText
            self.translatedText = engineResult.translatedText
            self.sourceLanguage = engineResult.sourceLanguage
            self.targetLanguage = engineResult.targetLanguage
            self.confidence = engineResult.confidence
            self.provider = TranslationProvider(from: engineResult.provider)
            self.processingTime = engineResult.processingTime
            self.isOnDevice = engineResult.isOnDevice
        }
    }

    // MARK: - Properties

    private let translationEngine = OnDeviceTranslationEngine.shared

    // Legacy cache for backward compatibility
    private var translationCache: [String: OnDeviceTranslationResult] = [:]
    private let maxCacheSize = 1000
    private let cacheTTL: TimeInterval = 24 * 60 * 60 // 24 hours

    // Download status for language pairs
    private var downloadedLanguages: Set<String> = []
    private var downloadProgress: [String: Double] = [:]

    // Statistics
    private var totalTranslations = 0
    private var onDeviceTranslations = 0
    private var cacheHits = 0

    // MARK: - Initialization

    init() {
        // Load downloaded languages from UserDefaults
        if let saved = UserDefaults.standard.stringArray(forKey: "downloadedTranslationLanguages") {
            downloadedLanguages = Set(saved)
        }
    }

    // MARK: - Public API

    /// Translate text using on-device translation when available
    /// Automatically selects the best provider: Apple Translation (iOS 18+) > Core ML > API
    func translate(
        _ text: String,
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async throws -> OnDeviceTranslationResult {
        guard !text.isEmpty else {
            throw OnDeviceTranslationError.emptyText
        }

        guard sourceLanguage != targetLanguage else {
            return OnDeviceTranslationResult(
                originalText: text,
                translatedText: text,
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage,
                provider: .cached,
                isOnDevice: true
            )
        }

        totalTranslations += 1

        // Check local cache first
        let cacheKey = makeCacheKey(text: text, source: sourceLanguage, target: targetLanguage)
        if let cached = translationCache[cacheKey] {
            cacheHits += 1
            return cached
        }

        // Use the unified translation engine
        // Priority: NLLB CoreML > Apple Translation > API
        print("📝 [Translation] Request: '\(text.prefix(50))...' (\(sourceLanguage.rawValue) → \(targetLanguage.rawValue))")

        do {
            let startTime = CFAbsoluteTimeGetCurrent()

            let engineResult = try await translationEngine.translate(
                text,
                from: sourceLanguage,
                to: targetLanguage
            )

            let result = OnDeviceTranslationResult(from: engineResult)
            let totalTime = CFAbsoluteTimeGetCurrent() - startTime

            // Track on-device usage
            if result.isOnDevice {
                onDeviceTranslations += 1
            }

            // Cache locally
            cacheResult(result, forKey: cacheKey)

            // Detailed logging
            print("✅ [Translation] Success!")
            print("   Provider: \(result.provider.rawValue)")
            print("   On-device: \(result.isOnDevice)")
            print("   Time: \(String(format: "%.0fms", totalTime * 1000))")
            print("   Input: '\(text.prefix(30))...'")
            print("   Output: '\(result.translatedText.prefix(30))...'")

            return result
        } catch {
            // Log the error
            print("❌ [Translation] Failed!")
            print("   Error: \(error.localizedDescription)")
            print("   Type: \(type(of: error))")

            // Remap errors to OnDeviceTranslationError for backward compatibility
            if let translationError = error as? TranslationEngineError {
                switch translationError {
                case .emptyText:
                    throw OnDeviceTranslationError.emptyText
                case .languagePairNotSupported:
                    throw OnDeviceTranslationError.languagePairNotSupported
                case .networkError(let msg):
                    throw OnDeviceTranslationError.networkError(msg)
                case .invalidResponse:
                    throw OnDeviceTranslationError.invalidResponse
                default:
                    throw OnDeviceTranslationError.translationFailed(error.localizedDescription)
                }
            }
            throw error
        }
    }

    /// Translate multiple texts in batch
    func translateBatch(
        texts: [String],
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async throws -> [OnDeviceTranslationResult] {
        // Use the engine's batch translation
        let engineResults = try await translationEngine.translateBatch(
            texts: texts,
            from: sourceLanguage,
            to: targetLanguage
        )

        return engineResults.map { OnDeviceTranslationResult(from: $0) }
    }

    // MARK: - Language Availability

    enum LanguageAvailabilityStatus {
        case installed          // Ready for on-device use
        case needsDownload      // Supported but needs model download
        case unsupported        // Not available
        case apiOnly            // Only available via API fallback
    }

    /// Check availability of translation for a language pair
    func checkLanguageAvailability(
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async -> LanguageAvailabilityStatus {
        let capabilities = await translationEngine.checkProviderCapabilities(
            source: sourceLanguage,
            target: targetLanguage
        )

        // Check for on-device providers first
        for cap in capabilities where cap.provider.isOnDevice {
            if cap.isInstalled {
                return .installed
            } else if cap.isAvailable {
                return .needsDownload
            }
        }

        // Check API availability
        if capabilities.contains(where: { $0.provider == .apiBackend && $0.isAvailable }) {
            return .apiOnly
        }

        return .unsupported
    }

    /// Get a human-readable summary of translation capabilities
    func getCapabilitySummary(
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async -> String {
        await translationEngine.getCapabilitySummary(source: sourceLanguage, target: targetLanguage)
    }

    /// Prepare a language pair for optimal performance (pre-load models)
    func prepareLanguagePair(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async throws {
        try await translationEngine.prepareLanguagePair(source: source, target: target)
    }

    /// Check if a language pair is available for translation (any provider)
    func isLanguagePairAvailable(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async -> Bool {
        let status = await checkLanguageAvailability(from: source, to: target)
        return status != .unsupported
    }

    /// Check if a language pair is downloaded for offline/on-device use
    func isLanguagePairDownloaded(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async -> Bool {
        let status = await checkLanguageAvailability(from: source, to: target)
        return status == .installed
    }

    /// Get download progress for a language pair
    func getDownloadProgress(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) -> Double {
        let pairKey = "\(source.rawValue)-\(target.rawValue)"
        return downloadProgress[pairKey] ?? 0
    }

    /// Get all available language pairs for translation
    func getAvailableLanguagePairs() async -> [(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage, status: LanguageAvailabilityStatus)] {
        var pairs: [(VoiceTranslationLanguage, VoiceTranslationLanguage, LanguageAvailabilityStatus)] = []

        for source in VoiceTranslationLanguage.allCases {
            for target in VoiceTranslationLanguage.allCases where source != target {
                let status = await checkLanguageAvailability(from: source, to: target)
                if status != .unsupported {
                    pairs.append((source, target, status))
                }
            }
        }

        return pairs
    }

    // MARK: - Cache Management

    private func makeCacheKey(
        text: String,
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) -> String {
        let normalizedText = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        return "\(source.rawValue):\(target.rawValue):\(normalizedText.hashValue)"
    }

    private func cacheResult(_ result: OnDeviceTranslationResult, forKey key: String) {
        // Evict oldest entries if cache is full
        if translationCache.count >= maxCacheSize {
            // Simple eviction: remove 10% of entries
            let keysToRemove = Array(translationCache.keys.prefix(maxCacheSize / 10))
            for key in keysToRemove {
                translationCache.removeValue(forKey: key)
            }
        }

        translationCache[key] = result
    }

    func clearCache() {
        translationCache.removeAll()
    }

    private func saveDownloadedLanguages() {
        UserDefaults.standard.set(Array(downloadedLanguages), forKey: "downloadedTranslationLanguages")
    }

    // MARK: - Statistics

    struct ServiceStatistics {
        let totalTranslations: Int
        let onDeviceTranslations: Int
        let cacheHits: Int
        let onDeviceRate: Double
        let cacheHitRate: Double
        let averageLatency: TimeInterval
        let providerUsage: [String: Int]

        var formattedSummary: String {
            """
            Total: \(totalTranslations) | On-Device: \(Int(onDeviceRate * 100))% | \
            Cache: \(Int(cacheHitRate * 100))% | Avg: \(String(format: "%.0fms", averageLatency * 1000))
            """
        }
    }

    func getStatistics() async -> ServiceStatistics {
        // Get engine statistics
        let engineStats = await translationEngine.getStatistics()

        // Combine local and engine stats
        let combinedTotal = totalTranslations
        let combinedOnDevice = onDeviceTranslations
        let combinedCache = cacheHits

        let onDeviceRate = combinedTotal > 0 ? Double(combinedOnDevice) / Double(combinedTotal) : engineStats.onDeviceRate
        let cacheHitRate = combinedTotal > 0 ? Double(combinedCache) / Double(combinedTotal) : engineStats.cacheHitRate

        // Convert provider usage to string keys
        var providerUsage: [String: Int] = [:]
        for (provider, count) in engineStats.providerUsage {
            providerUsage[provider.rawValue] = count
        }

        return ServiceStatistics(
            totalTranslations: max(combinedTotal, engineStats.totalRequests),
            onDeviceTranslations: combinedOnDevice,
            cacheHits: combinedCache,
            onDeviceRate: onDeviceRate,
            cacheHitRate: cacheHitRate,
            averageLatency: engineStats.averageProcessingTime,
            providerUsage: providerUsage
        )
    }

    /// Reset all statistics
    func resetStatistics() async {
        totalTranslations = 0
        onDeviceTranslations = 0
        cacheHits = 0
        await translationEngine.resetStatistics()
    }
}

// MARK: - Errors

enum OnDeviceTranslationError: Error, LocalizedError {
    case emptyText
    case languagePairNotSupported
    case downloadRequired
    case downloadFailed
    case translationFailed(String)
    case networkError(String)
    case invalidResponse
    case unknownError

    var errorDescription: String? {
        switch self {
        case .emptyText:
            return "Text to translate is empty"
        case .languagePairNotSupported:
            return "This language pair is not supported"
        case .downloadRequired:
            return "Language model download required"
        case .downloadFailed:
            return "Failed to download language model"
        case .translationFailed(let message):
            return "Translation failed: \(message)"
        case .networkError(let message):
            return "Network error: \(message)"
        case .invalidResponse:
            return "Invalid response from translation service"
        case .unknownError:
            return "An unknown error occurred"
        }
    }
}

// MARK: - Quality Settings
// Note: TranslationQuality is defined in MessageTranslation.swift
