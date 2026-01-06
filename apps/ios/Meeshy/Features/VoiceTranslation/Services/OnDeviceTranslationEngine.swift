//
//  OnDeviceTranslationEngine.swift
//  Meeshy
//
//  Unified on-device translation engine that intelligently routes translations
//  to the best available provider:
//  1. Apple Translation Framework (iOS 18+) - PRIMARY (high quality, on-device, ~50ms)
//  2. API Fallback (ml.meeshy.me) - Secondary (reliable, ~300ms latency)
//
//  Note: NLLB CoreML was removed due to autoregressive decoding issues.
//  Apple Translation is now the sole on-device provider.
//
//  Target: 100% on-device translation with <100ms latency (iOS 18+)
//

import Foundation

#if canImport(Translation)
import Translation
#endif

// MARK: - On-Device Translation Engine

/// Intelligent translation engine that orchestrates multiple on-device providers
/// Prioritizes 100% local translation with minimal latency
actor OnDeviceTranslationEngine {

    // MARK: - Types

    enum TranslationProvider: String, Codable {
        case appleTranslation = "apple_translation"     // iOS 17.4+ Apple Translation Framework
        case coreMLModel = "coreml_model"               // NLLB Core ML (bundled fallback)
        case apiBackend = "api_backend"                 // ml.meeshy.me fallback
        case cached = "cached"                          // From cache

        var isOnDevice: Bool {
            switch self {
            case .appleTranslation, .coreMLModel, .cached:
                return true
            case .apiBackend:
                return false
            }
        }

        var displayName: String {
            switch self {
            case .appleTranslation:
                return "Apple Neural Engine"
            case .coreMLModel:
                return "Core ML Model"
            case .apiBackend:
                return "Cloud API"
            case .cached:
                return "Cache"
            }
        }
    }

    struct TranslationResult {
        let sourceText: String
        let translatedText: String
        let sourceLanguage: VoiceTranslationLanguage
        let targetLanguage: VoiceTranslationLanguage
        let provider: TranslationProvider
        let confidence: Float
        let processingTime: TimeInterval
        let isOnDevice: Bool

        init(
            sourceText: String,
            translatedText: String,
            sourceLanguage: VoiceTranslationLanguage,
            targetLanguage: VoiceTranslationLanguage,
            provider: TranslationProvider,
            confidence: Float = 1.0,
            processingTime: TimeInterval = 0
        ) {
            self.sourceText = sourceText
            self.translatedText = translatedText
            self.sourceLanguage = sourceLanguage
            self.targetLanguage = targetLanguage
            self.provider = provider
            self.confidence = confidence
            self.processingTime = processingTime
            self.isOnDevice = provider.isOnDevice
        }
    }

    struct ProviderCapability {
        let provider: TranslationProvider
        let isAvailable: Bool
        let isInstalled: Bool  // For Apple Translation: models downloaded
        let estimatedLatency: TimeInterval
        let quality: Float  // 0-1 scale

        static func unavailable(_ provider: TranslationProvider) -> ProviderCapability {
            ProviderCapability(
                provider: provider,
                isAvailable: false,
                isInstalled: false,
                estimatedLatency: .infinity,
                quality: 0
            )
        }
    }

    // MARK: - Properties

    // Providers
    private let coreMLEngine = CoreMLTranslationEngine.shared

    // Cache
    private var translationCache: [String: TranslationResult] = [:]
    private let maxCacheSize = 1000
    private let cacheTTL: TimeInterval = 24 * 60 * 60 // 24 hours

    // Statistics
    private var stats = OnDeviceTranslationStatistics()

    // Configuration
    private var preferOnDevice = true
    private var fallbackToAPI = true

    // MARK: - Singleton

    static let shared = OnDeviceTranslationEngine()

    private init() {}

    // MARK: - Configuration

    /// Set whether to prefer on-device translation
    func setPreferOnDevice(_ prefer: Bool) {
        preferOnDevice = prefer
    }

    /// Set whether to allow API fallback
    func setAllowAPIFallback(_ allow: Bool) {
        fallbackToAPI = allow
    }

    // MARK: - Translation

    /// Translate text using the best available provider
    func translate(
        _ text: String,
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage
    ) async throws -> TranslationResult {
        guard !text.isEmpty else {
            throw TranslationEngineError.emptyText
        }

        // Same language - no translation needed
        guard source != target else {
            return TranslationResult(
                sourceText: text,
                translatedText: text,
                sourceLanguage: source,
                targetLanguage: target,
                provider: .cached
            )
        }

        stats.totalRequests += 1
        let startTime = CFAbsoluteTimeGetCurrent()

        // Check cache first
        let cacheKey = makeCacheKey(text: text, source: source, target: target)
        if let cached = translationCache[cacheKey] {
            stats.cacheHits += 1
            return cached
        }

        // Determine best provider
        let capabilities = await checkProviderCapabilities(source: source, target: target)
        let bestProvider = selectBestProvider(from: capabilities)

        // Perform translation with selected provider
        do {
            let result = try await performTranslation(
                text: text,
                from: source,
                to: target,
                using: bestProvider
            )

            // Cache result
            cacheResult(result, forKey: cacheKey)

            // Update statistics
            let processingTime = CFAbsoluteTimeGetCurrent() - startTime
            updateStats(provider: bestProvider, processingTime: processingTime, success: true)

            return TranslationResult(
                sourceText: result.sourceText,
                translatedText: result.translatedText,
                sourceLanguage: source,
                targetLanguage: target,
                provider: bestProvider,
                confidence: result.confidence,
                processingTime: processingTime
            )
        } catch {
            // Try fallback providers
            if let fallbackResult = try await tryFallbackProviders(
                text: text,
                from: source,
                to: target,
                excluding: bestProvider
            ) {
                let processingTime = CFAbsoluteTimeGetCurrent() - startTime
                updateStats(provider: fallbackResult.provider, processingTime: processingTime, success: true)
                cacheResult(fallbackResult, forKey: cacheKey)
                return fallbackResult
            }

            stats.errors += 1
            throw error
        }
    }

    /// Batch translate multiple texts
    func translateBatch(
        texts: [String],
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage
    ) async throws -> [TranslationResult] {
        var results: [TranslationResult] = []

        // Process in parallel with concurrency limit
        await withTaskGroup(of: TranslationResult?.self) { group in
            for text in texts {
                group.addTask {
                    try? await self.translate(text, from: source, to: target)
                }
            }

            for await result in group {
                if let result = result {
                    results.append(result)
                }
            }
        }

        return results
    }

    // MARK: - Provider Selection

    /// Check capabilities of all providers for a language pair
    /// Priority: Apple Translation (iOS 18+) > API
    func checkProviderCapabilities(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async -> [ProviderCapability] {
        var capabilities: [ProviderCapability] = []

        // 1. Apple Translation (iOS 18+) - Best quality and performance (~50ms, on-device)
        #if canImport(Translation)
        if #available(iOS 18.0, *) {
            let appleCapability = await checkAppleTranslationCapability(source: source, target: target)
            capabilities.append(appleCapability)
            print("📱 [TranslationEngine] Apple Translation: available=\(appleCapability.isAvailable), installed=\(appleCapability.isInstalled)")
        }
        #endif

        // 2. API fallback (reliable, ~300ms latency)
        if fallbackToAPI {
            let apiCapability = ProviderCapability(
                provider: .apiBackend,
                isAvailable: isLanguageSupportedByAPI(source) && isLanguageSupportedByAPI(target),
                isInstalled: true,
                estimatedLatency: 0.3,
                quality: 0.90
            )
            capabilities.append(apiCapability)
        }

        // Note: CoreML NLLB removed due to autoregressive decoding issues
        // Apple Translation is the sole on-device provider

        return capabilities
    }

    #if canImport(Translation)
    @available(iOS 18.0, *)
    private func checkAppleTranslationCapability(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async -> ProviderCapability {
        let bridge = await AppleTranslationBridge.shared
        let status = await bridge.checkAvailability(from: source, to: target)

        switch status {
        case .installed:
            return ProviderCapability(
                provider: .appleTranslation,
                isAvailable: true,
                isInstalled: true,
                estimatedLatency: 0.05, // ~50ms on Neural Engine
                quality: 0.98  // Apple Translation is highest quality
            )
        case .supported:
            // Models need download - but we still want to try Apple Translation
            // because it will trigger the download prompt
            return ProviderCapability(
                provider: .appleTranslation,
                isAvailable: true,
                isInstalled: true, // Mark as installed so it gets selected
                estimatedLatency: 5.0, // Download may take time
                quality: 0.98
            )
        case .unsupported:
            return ProviderCapability.unavailable(.appleTranslation)
        @unknown default:
            return ProviderCapability.unavailable(.appleTranslation)
        }
    }
    #endif

    private func checkCoreMLCapability(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async -> ProviderCapability {
        let isAvailable = await coreMLEngine.isModelAvailable(source: source, target: target)
        let isLoaded = await coreMLEngine.isModelLoaded(source: source, target: target)
        let isBundled = await coreMLEngine.isBundledNLLBAvailable()

        // NLLB bundled model gets highest quality score
        let quality: Float = isBundled ? 0.96 : 0.88

        return ProviderCapability(
            provider: .coreMLModel,
            isAvailable: isAvailable || isBundled,  // Available if bundled NLLB exists
            isInstalled: isAvailable || isBundled,
            estimatedLatency: isLoaded ? 0.08 : 0.15, // Faster if already loaded
            quality: quality
        )
    }

    /// Select the best provider based on capabilities
    private func selectBestProvider(from capabilities: [ProviderCapability]) -> TranslationProvider {
        // Priority:
        // 1. Apple Translation (on-device, installed) - best quality
        // 2. Apple Translation (needs download) - will trigger download
        // 3. API fallback

        // Filter to available and installed providers, prioritize by quality
        let readyProviders = capabilities.filter { $0.isAvailable && $0.isInstalled }

        if let best = readyProviders.max(by: { $0.quality < $1.quality }) {
            print("✅ [TranslationEngine] Selected provider: \(best.provider.displayName)")
            return best.provider
        }

        // Check if Apple Translation is available but needs download
        let needsDownload = capabilities.filter { $0.isAvailable && !$0.isInstalled && $0.provider == .appleTranslation }
        if let provider = needsDownload.first {
            print("⚠️ [TranslationEngine] Apple Translation needs download")
            return provider.provider
        }

        // Fall back to API
        if fallbackToAPI {
            print("🌐 [TranslationEngine] Falling back to API")
            return .apiBackend
        }

        // No provider available - will fail
        print("❌ [TranslationEngine] No provider available")
        return .apiBackend
    }

    // MARK: - Translation Execution

    private func performTranslation(
        text: String,
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage,
        using provider: TranslationProvider
    ) async throws -> TranslationResult {
        switch provider {
        case .appleTranslation:
            if #available(iOS 18.0, *) {
                return try await translateWithApple(text: text, from: source, to: target)
            } else {
                // Apple Translation requires iOS 18+, fallback to API
                return try await translateWithAPI(text: text, from: source, to: target)
            }

        case .coreMLModel:
            return try await translateWithCoreML(text: text, from: source, to: target)

        case .apiBackend:
            return try await translateWithAPI(text: text, from: source, to: target)

        case .cached:
            throw TranslationEngineError.noProviderAvailable
        }
    }

    #if canImport(Translation)
    @available(iOS 18.0, *)
    private func translateWithApple(
        text: String,
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage
    ) async throws -> TranslationResult {
        let bridge = await AppleTranslationBridge.shared
        let result = try await bridge.translate(text, from: source, to: target)

        return TranslationResult(
            sourceText: text,
            translatedText: result.targetText,
            sourceLanguage: source,
            targetLanguage: target,
            provider: .appleTranslation,
            confidence: 0.98,  // Apple Translation is highest quality
            processingTime: result.processingTime
        )
    }
    #else
    private func translateWithApple(
        text: String,
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage
    ) async throws -> TranslationResult {
        throw TranslationEngineError.providerNotAvailable(.appleTranslation)
    }
    #endif

    private func translateWithCoreML(
        text: String,
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage
    ) async throws -> TranslationResult {
        let result = try await coreMLEngine.translate(text, from: source, to: target)

        return TranslationResult(
            sourceText: text,
            translatedText: result.targetText,
            sourceLanguage: source,
            targetLanguage: target,
            provider: .coreMLModel,
            confidence: result.confidence,
            processingTime: result.processingTime
        )
    }

    private func translateWithAPI(
        text: String,
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage
    ) async throws -> TranslationResult {
        guard let sourceCode = mapToAPILanguage(source),
              let targetCode = mapToAPILanguage(target) else {
            throw TranslationEngineError.languagePairNotSupported
        }

        let startTime = CFAbsoluteTimeGetCurrent()
        let translatedText = try await performMLAPITranslation(
            text: text,
            sourceLanguage: sourceCode,
            targetLanguage: targetCode
        )

        return TranslationResult(
            sourceText: text,
            translatedText: translatedText,
            sourceLanguage: source,
            targetLanguage: target,
            provider: .apiBackend,
            confidence: 0.85,
            processingTime: CFAbsoluteTimeGetCurrent() - startTime
        )
    }

    /// Try fallback providers in order
    /// Priority: Apple Translation (iOS 18+) > API
    private func tryFallbackProviders(
        text: String,
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage,
        excluding: TranslationProvider
    ) async throws -> TranslationResult? {
        // Prioritize Apple Translation, then API
        let fallbackOrder: [TranslationProvider] = [.appleTranslation, .apiBackend]

        for provider in fallbackOrder where provider != excluding {
            do {
                if provider == .apiBackend && !fallbackToAPI {
                    continue
                }

                print("🔄 [Translation] Trying fallback: \(provider.displayName)")
                return try await performTranslation(
                    text: text,
                    from: source,
                    to: target,
                    using: provider
                )
            } catch {
                print("⚠️ [Translation] Fallback provider \(provider) failed: \(error)")
                continue // Try next provider
            }
        }

        return nil
    }

    // MARK: - API Translation

    private func mapToAPILanguage(_ language: VoiceTranslationLanguage) -> String? {
        // Supported by ml.meeshy.me: fr, en, es, de, pt, zh, ja, ar
        switch language {
        case .english: return "en"
        case .french: return "fr"
        case .portuguese: return "pt"
        case .spanish: return "es"
        case .german: return "de"
        case .chinese: return "zh"
        case .japanese: return "ja"
        case .arabic: return "ar"
        case .russian, .italian, .korean, .dutch:
            return nil // Not supported by API
        }
    }

    private func isLanguageSupportedByAPI(_ language: VoiceTranslationLanguage) -> Bool {
        mapToAPILanguage(language) != nil
    }

    private func performMLAPITranslation(
        text: String,
        sourceLanguage: String,
        targetLanguage: String
    ) async throws -> String {
        guard let url = URL(string: "https://ml.meeshy.me/translate") else {
            throw TranslationEngineError.networkError("Invalid URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15  // Basic model responds in ~1s

        // Use "basic" model - it's fast (~1s) vs "medium" (~50s)
        let body: [String: Any] = [
            "text": text,
            "source_language": sourceLanguage,
            "target_language": targetLanguage,
            "model_type": "basic"
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw TranslationEngineError.networkError("API error")
        }

        var translatedText: String?

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            translatedText = json["translated_text"] as? String
                ?? json["translation"] as? String
                ?? json["result"] as? String
                ?? json["text"] as? String
        }

        if translatedText == nil {
            translatedText = String(data: data, encoding: .utf8)
        }

        guard let result = translatedText, !result.isEmpty else {
            throw TranslationEngineError.invalidResponse
        }

        return cleanupPunctuation(result)
    }

    private func cleanupPunctuation(_ text: String) -> String {
        var result = text

        let punctuationMarks = [".", ",", "!", "?", ":", ";", ")", "]", "}"]
        for mark in punctuationMarks {
            result = result.replacingOccurrences(of: " \(mark)", with: mark)
        }

        let openingBrackets = ["(", "[", "{"]
        for bracket in openingBrackets {
            result = result.replacingOccurrences(of: "\(bracket) ", with: bracket)
        }

        while result.contains("  ") {
            result = result.replacingOccurrences(of: "  ", with: " ")
        }

        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Cache Management

    private func makeCacheKey(text: String, source: VoiceTranslationLanguage, target: VoiceTranslationLanguage) -> String {
        let normalizedText = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        return "\(source.rawValue):\(target.rawValue):\(normalizedText.hashValue)"
    }

    private func cacheResult(_ result: TranslationResult, forKey key: String) {
        if translationCache.count >= maxCacheSize {
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

    // MARK: - Statistics

    private func updateStats(provider: TranslationProvider, processingTime: TimeInterval, success: Bool) {
        stats.providerUsage[provider, default: 0] += 1

        if provider.isOnDevice {
            stats.onDeviceTranslations += 1
        }

        stats.totalProcessingTime += processingTime

        if !success {
            stats.errors += 1
        }
    }

    func getStatistics() -> OnDeviceTranslationStatistics {
        stats
    }

    func resetStatistics() {
        stats = OnDeviceTranslationStatistics()
    }

    // MARK: - Model Management

    /// Prepare language pair for optimal performance
    /// Uses Apple Translation (iOS 18+) or API fallback (iOS < 18)
    func prepareLanguagePair(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async throws {
        print("📱 [Translation] Preparing translation for \(source.rawValue) → \(target.rawValue)")

        #if canImport(Translation)
        if #available(iOS 18.0, *) {
            // Apple Translation (iOS 18+) - on-device, high quality
            do {
                try await AppleTranslationBridge.shared.prepareLanguagePair(source: source, target: target)
                print("✅ [Translation] Apple Translation ready")
                return
            } catch {
                print("⚠️ [Translation] Apple Translation prep failed: \(error), will use API fallback")
            }
        }
        #endif

        // iOS < 18 or Apple Translation not available
        if isLanguageSupportedByAPI(source) && isLanguageSupportedByAPI(target) {
            print("🌐 [Translation] Will use API fallback")
        } else {
            print("❌ [Translation] Language pair not supported")
            throw TranslationEngineError.languagePairNotSupported
        }
    }

    /// Get available translation capabilities for a language pair
    func getCapabilitySummary(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async -> String {
        let capabilities = await checkProviderCapabilities(source: source, target: target)

        var summary: [String] = []
        for cap in capabilities where cap.isAvailable {
            let status = cap.isInstalled ? "Ready" : "Needs Download"
            summary.append("\(cap.provider.displayName): \(status)")
        }

        return summary.isEmpty ? "No translation available" : summary.joined(separator: " | ")
    }
}

// MARK: - On-Device Translation Statistics

/// Statistics specific to the on-device translation engine
struct OnDeviceTranslationStatistics {
    var totalRequests: Int = 0
    var onDeviceTranslations: Int = 0
    var cacheHits: Int = 0
    var errors: Int = 0
    var totalProcessingTime: TimeInterval = 0
    var providerUsage: [OnDeviceTranslationEngine.TranslationProvider: Int] = [:]

    var onDeviceRate: Double {
        guard totalRequests > 0 else { return 0 }
        return Double(onDeviceTranslations) / Double(totalRequests)
    }

    var cacheHitRate: Double {
        guard totalRequests > 0 else { return 0 }
        return Double(cacheHits) / Double(totalRequests)
    }

    var averageProcessingTime: TimeInterval {
        guard totalRequests > 0 else { return 0 }
        return totalProcessingTime / Double(totalRequests)
    }

    var formattedSummary: String {
        """
        Total: \(totalRequests) | On-Device: \(Int(onDeviceRate * 100))% | \
        Cache: \(Int(cacheHitRate * 100))% | Avg: \(String(format: "%.0fms", averageProcessingTime * 1000))
        """
    }
}

// MARK: - Errors

enum TranslationEngineError: Error, LocalizedError {
    case emptyText
    case languagePairNotSupported
    case noProviderAvailable
    case providerNotAvailable(OnDeviceTranslationEngine.TranslationProvider)
    case translationFailed(String)
    case networkError(String)
    case invalidResponse
    case modelNotLoaded

    var errorDescription: String? {
        switch self {
        case .emptyText:
            return "Text to translate is empty"
        case .languagePairNotSupported:
            return "This language pair is not supported"
        case .noProviderAvailable:
            return "No translation provider available"
        case .providerNotAvailable(let provider):
            return "\(provider.displayName) is not available"
        case .translationFailed(let message):
            return "Translation failed: \(message)"
        case .networkError(let message):
            return "Network error: \(message)"
        case .invalidResponse:
            return "Invalid response from translation service"
        case .modelNotLoaded:
            return "Translation model not loaded"
        }
    }
}
