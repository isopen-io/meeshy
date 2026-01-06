//
//  AppleTranslationBridge.swift
//  Meeshy
//
//  Bridge to use Apple's Translation Framework (iOS 18+)
//  Enables 100% on-device translation using Apple's Neural Engine
//
//  TranslationSession API is iOS 18+ only (programmatic, no UI)
//  iOS 17.4 only has .translationPresentation() which shows a system UI
//

import Foundation
import SwiftUI

#if canImport(Translation)
import Translation
#endif

// MARK: - Apple Translation Bridge

/// Simple bridge for Apple's Translation API (iOS 18+)
/// Uses TranslationSession for programmatic on-device translation
@available(iOS 18.0, *)
@MainActor
final class AppleTranslationBridge: ObservableObject {

    // MARK: - Types

    struct TranslationResult {
        let sourceText: String
        let targetText: String
        let sourceLanguage: Locale.Language
        let targetLanguage: Locale.Language
        let processingTime: TimeInterval
        let isOnDevice: Bool
    }

    enum TranslationError: Error, LocalizedError {
        case notAvailable
        case configurationError
        case translationFailed(String)
        case languagePairNotSupported
        case downloadRequired
        case sessionExpired

        var errorDescription: String? {
            switch self {
            case .notAvailable:
                return "Translation is not available"
            case .configurationError:
                return "Translation configuration error"
            case .translationFailed(let message):
                return "Translation failed: \(message)"
            case .languagePairNotSupported:
                return "This language pair is not supported for on-device translation"
            case .downloadRequired:
                return "Language models need to be downloaded"
            case .sessionExpired:
                return "Translation session expired"
            }
        }
    }

    // MARK: - Properties

    @Published private(set) var isReady = false
    @Published private(set) var downloadProgress: Double = 0

    // MARK: - Singleton

    static let shared = AppleTranslationBridge()

    private init() {}

    // MARK: - Language Availability

    #if canImport(Translation)
    /// Check if a language pair is available for on-device translation
    func checkAvailability(
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage
    ) async -> LanguageAvailability.Status {
        let sourceLocale = Locale.Language(identifier: source.localeIdentifier)
        let targetLocale = Locale.Language(identifier: target.localeIdentifier)

        let availability = LanguageAvailability()
        return await availability.status(from: sourceLocale, to: targetLocale)
    }

    /// Check if translation can proceed immediately (models installed)
    func isReadyForTranslation(
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage
    ) async -> Bool {
        let status = await checkAvailability(from: source, to: target)
        return status == .installed
    }

    /// Get all supported language pairs
    func getSupportedLanguages() async -> [(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage, status: LanguageAvailability.Status)] {
        var pairs: [(VoiceTranslationLanguage, VoiceTranslationLanguage, LanguageAvailability.Status)] = []

        for source in VoiceTranslationLanguage.allCases {
            for target in VoiceTranslationLanguage.allCases where source != target {
                let status = await checkAvailability(from: source, to: target)
                if status != .unsupported {
                    pairs.append((source, target, status))
                }
            }
        }

        return pairs
    }
    #endif

    // MARK: - Translation

    /// Translate text using Apple's on-device Translation framework
    /// Uses TranslationSession directly (iOS 18+)
    func translate(
        _ text: String,
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async throws -> TranslationResult {
        #if canImport(Translation)
        let startTime = CFAbsoluteTimeGetCurrent()

        let sourceLocale = Locale.Language(identifier: sourceLanguage.localeIdentifier)
        let targetLocale = Locale.Language(identifier: targetLanguage.localeIdentifier)

        // Check availability first
        let availability = LanguageAvailability()
        let status = await availability.status(from: sourceLocale, to: targetLocale)

        switch status {
        case .unsupported:
            print("❌ [AppleTranslation] Language pair not supported: \(sourceLanguage.rawValue) → \(targetLanguage.rawValue)")
            throw TranslationError.languagePairNotSupported
        case .supported:
            // Models need to be downloaded - try anyway, system will prompt download
            print("⚠️ [AppleTranslation] Models need download for: \(sourceLanguage.rawValue) → \(targetLanguage.rawValue)")
            print("   → Attempting translation anyway (will trigger download prompt)")
            // Don't throw - let it try and trigger the download UI
        case .installed:
            // Ready to translate
            print("✅ [AppleTranslation] Models ready for: \(sourceLanguage.rawValue) → \(targetLanguage.rawValue)")
        @unknown default:
            throw TranslationError.notAvailable
        }

        // Create configuration and translate
        let configuration = TranslationSession.Configuration(
            source: sourceLocale,
            target: targetLocale
        )

        // Use TranslationSession directly
        do {
            let translatedText = try await performDirectTranslation(
                text: text,
                configuration: configuration
            )

            let processingTime = CFAbsoluteTimeGetCurrent() - startTime

            print("✅ [AppleTranslation] Translated in \(String(format: "%.0fms", processingTime * 1000))")
            print("   Input: '\(text.prefix(50))...'")
            print("   Output: '\(translatedText.prefix(50))...'")

            return TranslationResult(
                sourceText: text,
                targetText: translatedText,
                sourceLanguage: sourceLocale,
                targetLanguage: targetLocale,
                processingTime: processingTime,
                isOnDevice: true
            )
        } catch {
            let errorMessage = error.localizedDescription.lowercased()
            print("❌ [AppleTranslation] Translation failed: \(error)")

            // Check if models need to be downloaded
            if errorMessage.contains("download") || errorMessage.contains("install") ||
               errorMessage.contains("unavailable") || status == .supported {
                print("⚠️ [AppleTranslation] Models need to be downloaded from Settings")
                print("   → Go to: Settings > General > Language & Region > Translation Languages")
                throw TranslationError.downloadRequired
            }

            throw TranslationError.translationFailed(error.localizedDescription)
        }
        #else
        throw TranslationError.notAvailable
        #endif
    }

    #if canImport(Translation)
    /// Perform translation using TranslationSession via a minimal SwiftUI bridge
    /// This is needed because TranslationSession requires .translationTask modifier
    private func performDirectTranslation(
        text: String,
        configuration: TranslationSession.Configuration
    ) async throws -> String {
        // Use a continuation to bridge the async callback pattern
        return try await withCheckedThrowingContinuation { continuation in
            // Create a minimal SwiftUI view to host the translation task
            let bridgeView = DirectTranslationBridgeView(
                sourceText: text,
                configuration: configuration
            ) { result in
                switch result {
                case .success(let translatedText):
                    continuation.resume(returning: translatedText)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }

            // Host the view briefly
            let hostingController = UIHostingController(rootView: bridgeView)
            hostingController.view.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
            hostingController.view.isHidden = true
            hostingController.view.alpha = 0

            // Add to window hierarchy temporarily
            DispatchQueue.main.async {
                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                   let window = windowScene.windows.first {
                    window.addSubview(hostingController.view)

                    // Cleanup after a reasonable timeout
                    DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
                        hostingController.view.removeFromSuperview()
                    }
                }
            }
        }
    }
    #endif

    /// Batch translate multiple texts
    func translateBatch(
        texts: [String],
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async throws -> [TranslationResult] {
        var results: [TranslationResult] = []

        for text in texts {
            let result = try await translate(text, from: sourceLanguage, to: targetLanguage)
            results.append(result)
        }

        return results
    }

    // MARK: - Language Pair Preparation

    #if canImport(Translation)
    /// Prepare a language pair for translation (triggers download if needed)
    func prepareLanguagePair(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async throws {
        let status = await checkAvailability(from: source, to: target)

        switch status {
        case .installed:
            // Already ready
            isReady = true
            print("✅ [AppleTranslation] Language pair ready: \(source.rawValue) → \(target.rawValue)")
        case .supported:
            // Need to trigger download via UI
            // The system will show a download prompt when translation is attempted
            isReady = false
            print("⚠️ [AppleTranslation] Language pair needs download: \(source.rawValue) → \(target.rawValue)")
        case .unsupported:
            throw TranslationError.languagePairNotSupported
        @unknown default:
            throw TranslationError.notAvailable
        }
    }
    #endif

    // MARK: - Statistics

    struct TranslationStats {
        let availablePairs: Int
        let installedPairs: Int
        let supportedPairs: Int
    }

    func getStatistics() async -> TranslationStats {
        #if canImport(Translation)
        let pairs = await getSupportedLanguages()
        let installed = pairs.filter { $0.status == .installed }.count
        let supported = pairs.filter { $0.status == .supported }.count

        return TranslationStats(
            availablePairs: pairs.count,
            installedPairs: installed,
            supportedPairs: supported
        )
        #else
        return TranslationStats(availablePairs: 0, installedPairs: 0, supportedPairs: 0)
        #endif
    }
}

// MARK: - Direct Translation Bridge View

#if canImport(Translation)
@available(iOS 18.0, *)
private struct DirectTranslationBridgeView: View {
    let sourceText: String
    let configuration: TranslationSession.Configuration
    let onComplete: (Result<String, Error>) -> Void

    @State private var triggerConfiguration: TranslationSession.Configuration?
    @State private var hasCompleted = false

    var body: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .onAppear {
                // Trigger translation task
                triggerConfiguration = configuration
            }
            .translationTask(triggerConfiguration) { session in
                guard !hasCompleted else { return }

                Task { @MainActor in
                    do {
                        let response = try await session.translate(sourceText)
                        hasCompleted = true
                        onComplete(.success(response.targetText))
                    } catch {
                        hasCompleted = true
                        onComplete(.failure(error))
                    }
                }
            }
    }
}
#endif

// MARK: - Supported Languages Check

@available(iOS 18.0, *)
extension AppleTranslationBridge {
    /// Apple Translation supports approximately 18 languages (EU + major)
    /// This is a quick check before attempting translation
    static let supportedLanguages: Set<String> = [
        "en", "fr", "es", "de", "pt", "it",
        "zh", "ja", "ko", "ar", "ru",
        "nl", "pl", "tr", "uk", "vi",
        "th", "id"
    ]

    /// Quick check if a language might be supported by Apple Translation
    func mightBeSupported(_ language: VoiceTranslationLanguage) -> Bool {
        let code = String(language.localeIdentifier.prefix(2))
        return Self.supportedLanguages.contains(code)
    }
}
