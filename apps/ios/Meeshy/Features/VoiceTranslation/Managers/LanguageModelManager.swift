//
//  LanguageModelManager.swift
//  Meeshy
//
//  Manages language model downloads for on-device translation
//  Integrates with:
//  - iOS 18+ Apple Translation Framework models
//  - Core ML translation models (Helsinki-NLP/MarianMT)
//  - Speech recognition models
//

import Foundation
import Speech

#if canImport(Translation)
import Translation
#endif

// MARK: - Language Model Manager

/// Manages on-device language models for translation and speech recognition
/// Coordinates with OnDeviceTranslationEngine for model selection
@MainActor
final class LanguageModelManager: ObservableObject {

    // MARK: - Published Properties

    @Published private(set) var downloadedModels: [LanguageModelInfo] = []
    @Published private(set) var availableModels: [LanguageModelInfo] = []
    @Published private(set) var downloadingModels: Set<String> = []
    @Published private(set) var downloadProgress: [String: Double] = [:]
    @Published private(set) var totalStorageUsed: Int64 = 0
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Properties

    private let modelsDirectory: URL
    private let userDefaults = UserDefaults.standard
    private let coreMLEngine = CoreMLTranslationEngine.shared

    // MARK: - Singleton

    static let shared = LanguageModelManager()

    // MARK: - Initialization

    private init() {
        // Create models directory
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        modelsDirectory = appSupport.appendingPathComponent("LanguageModels", isDirectory: true)

        try? FileManager.default.createDirectory(at: modelsDirectory, withIntermediateDirectories: true)

        // Load saved state
        loadDownloadedModels()
    }

    // MARK: - Model Discovery

    /// Refresh available and downloaded models
    func refreshModels() async {
        isLoading = true
        defer { isLoading = false }

        await loadAvailableModels()
        loadDownloadedModels()
        calculateStorageUsed()
    }

    private func loadAvailableModels() async {
        var models: [LanguageModelInfo] = []

        // Check speech recognition models
        for language in VoiceTranslationLanguage.allCases {
            let speechModel = await checkSpeechRecognitionModel(for: language)
            models.append(speechModel)
        }

        // Check translation models (iOS 18+ Apple Translation)
        #if canImport(Translation)
        if #available(iOS 18.0, *) {
            let translationModels = await checkTranslationModels()
            models.append(contentsOf: translationModels)
        }
        #endif

        // Check Core ML translation models
        let coreMLModels = await checkCoreMLModels()
        models.append(contentsOf: coreMLModels)

        availableModels = models.sorted { $0.displayName < $1.displayName }
    }

    /// Check available Core ML translation models (NLLB 600M - multilingual)
    /// NLLB is a single 300MB model supporting all language pairs
    private func checkCoreMLModels() async -> [LanguageModelInfo] {
        var models: [LanguageModelInfo] = []

        // Check which Core ML models are downloaded
        let downloadedPairs = await coreMLEngine.getDownloadedModels()

        // Add downloaded models (NLLB 600M)
        for (source, target) in downloadedPairs {
            let model = LanguageModelInfo(
                id: "coreml-\(source.rawValue)-\(target.rawValue)",
                type: .coreMLTranslation,
                sourceLanguage: source,
                targetLanguage: target,
                displayName: "\(source.flagEmoji) → \(target.flagEmoji) NLLB",
                sizeBytes: 300_000_000, // NLLB 600M is ~300MB quantized
                isDownloaded: true,
                isAvailable: true,
                supportsOffline: true
            )
            models.append(model)
        }

        // NLLB 600M supports all 200 language pairs - list common ones
        // Since NLLB is multilingual, downloading once enables all pairs
        let supportedPairs: [(VoiceTranslationLanguage, VoiceTranslationLanguage)] = [
            (.english, .french), (.french, .english),
            (.english, .spanish), (.spanish, .english),
            (.english, .german), (.german, .english),
            (.english, .portuguese), (.portuguese, .english),
            (.english, .italian), (.italian, .english),
            (.english, .chinese), (.chinese, .english),
            (.english, .japanese), (.japanese, .english),
            (.english, .korean), (.korean, .english),
            (.english, .arabic), (.arabic, .english),
            (.english, .russian), (.russian, .english),
            (.english, .dutch), (.dutch, .english),
            (.french, .spanish), (.spanish, .french),
            (.french, .german), (.german, .french)
        ]

        for (source, target) in supportedPairs {
            let isDownloaded = downloadedPairs.contains { $0.0 == source && $0.1 == target }
            if !isDownloaded {
                let model = LanguageModelInfo(
                    id: "coreml-\(source.rawValue)-\(target.rawValue)",
                    type: .coreMLTranslation,
                    sourceLanguage: source,
                    targetLanguage: target,
                    displayName: "\(source.flagEmoji) → \(target.flagEmoji) NLLB",
                    sizeBytes: 300_000_000, // NLLB 600M multilingual
                    isDownloaded: false,
                    isAvailable: true, // Available for download
                    supportsOffline: true
                )
                models.append(model)
            }
        }

        return models
    }

    private func checkSpeechRecognitionModel(for language: VoiceTranslationLanguage) async -> LanguageModelInfo {
        let recognizer = SFSpeechRecognizer(locale: language.locale)
        let isAvailable = recognizer?.isAvailable ?? false
        let supportsOnDevice = recognizer?.supportsOnDeviceRecognition ?? false

        return LanguageModelInfo(
            id: "speech-\(language.rawValue)",
            type: .speechRecognition,
            sourceLanguage: language,
            targetLanguage: nil,
            displayName: "\(language.flagEmoji) \(language.nativeName) Speech",
            sizeBytes: estimatedSpeechModelSize(for: language),
            isDownloaded: supportsOnDevice,
            isAvailable: isAvailable,
            supportsOffline: supportsOnDevice
        )
    }

    #if canImport(Translation)
    @available(iOS 18.0, *)
    private func checkTranslationModels() async -> [LanguageModelInfo] {
        var models: [LanguageModelInfo] = []

        let availability = LanguageAvailability()

        // Check common language pairs
        let priorityPairs: [(VoiceTranslationLanguage, VoiceTranslationLanguage)] = [
            (.english, .french),
            (.english, .spanish),
            (.english, .german),
            (.english, .chinese),
            (.english, .japanese),
            (.french, .english),
            (.spanish, .english),
            (.german, .english),
            (.french, .spanish),
            (.french, .german)
        ]

        for (source, target) in priorityPairs {
            let sourceLang = Locale.Language(identifier: source.localeIdentifier)
            let targetLang = Locale.Language(identifier: target.localeIdentifier)

            let status = await availability.status(from: sourceLang, to: targetLang)

            let model = LanguageModelInfo(
                id: "translation-\(source.rawValue)-\(target.rawValue)",
                type: .translation,
                sourceLanguage: source,
                targetLanguage: target,
                displayName: "\(source.flagEmoji) → \(target.flagEmoji) Translation",
                sizeBytes: estimatedTranslationModelSize(source: source, target: target),
                isDownloaded: status == .installed,
                isAvailable: status != .unsupported,
                supportsOffline: status == .installed
            )

            models.append(model)
        }

        return models
    }
    #endif

    // MARK: - Download Management

    /// Download a language model
    func downloadModel(_ model: LanguageModelInfo) async throws {
        guard !downloadingModels.contains(model.id) else { return }

        downloadingModels.insert(model.id)
        downloadProgress[model.id] = 0

        defer {
            downloadingModels.remove(model.id)
            downloadProgress.removeValue(forKey: model.id)
        }

        switch model.type {
        case .speechRecognition:
            try await downloadSpeechRecognitionModel(for: model.sourceLanguage)

        case .translation:
            #if canImport(Translation)
            if #available(iOS 18.0, *) {
                guard let target = model.targetLanguage else {
                    throw LanguageModelError.invalidModel
                }
                try await downloadTranslationModel(source: model.sourceLanguage, target: target)
            } else {
                throw LanguageModelError.notSupported
            }
            #else
            throw LanguageModelError.notSupported
            #endif

        case .coreMLTranslation:
            guard let target = model.targetLanguage else {
                throw LanguageModelError.invalidModel
            }
            try await downloadCoreMLModel(source: model.sourceLanguage, target: target, modelId: model.id)
        }

        // Refresh models after download
        await refreshModels()
    }

    /// Download a Core ML translation model (NLLB 600M - Meta's multilingual model)
    private func downloadCoreMLModel(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage,
        modelId: String
    ) async throws {
        // Use NLLB 600M as the primary Core ML model (supports 200 languages)
        try await coreMLEngine.downloadModel(
            source: source,
            target: target,
            modelType: .nllb600M  // Meta's NLLB 600M - ~300MB quantized
        ) { [weak self] progress in
            Task { @MainActor in
                self?.downloadProgress[modelId] = progress
            }
        }
    }

    private func downloadSpeechRecognitionModel(for language: VoiceTranslationLanguage) async throws {
        // Speech recognition models are downloaded automatically by the system
        // when on-device recognition is first used
        // We can trigger a download by attempting to use on-device recognition

        let recognizer = SFSpeechRecognizer(locale: language.locale)

        guard recognizer?.isAvailable == true else {
            throw LanguageModelError.notAvailable
        }

        // The system handles the download automatically
        // Just verify it supports on-device
        if recognizer?.supportsOnDeviceRecognition != true {
            // Trigger download by creating a recognition request
            // Note: This might prompt the user
            throw LanguageModelError.downloadRequired
        }
    }

    #if canImport(Translation)
    @available(iOS 18.0, *)
    private func downloadTranslationModel(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async throws {
        let sourceLang = Locale.Language(identifier: source.localeIdentifier)
        let targetLang = Locale.Language(identifier: target.localeIdentifier)

        // Note: TranslationSession requires SwiftUI context (.translationTask modifier)
        // The system will automatically prompt for download when translation is first attempted
        // through the SwiftUI translation task modifier.
        // Here we just verify the language pair is supported.

        let availability = LanguageAvailability()
        let status = await availability.status(from: sourceLang, to: targetLang)

        switch status {
        case .installed:
            // Already downloaded
            return
        case .supported:
            // Supported but needs download - will be triggered by SwiftUI
            // Mark as needing download in our tracking
            throw LanguageModelError.downloadRequired
        case .unsupported:
            throw LanguageModelError.notAvailable
        @unknown default:
            throw LanguageModelError.notAvailable
        }
    }
    #endif

    /// Delete a downloaded model
    func deleteModel(_ model: LanguageModelInfo) async throws {
        // Note: Apple doesn't provide an API to delete system language models
        // We can only clear our tracking of downloaded models
        // The actual models are managed by the system

        var updated = downloadedModels
        updated.removeAll { $0.id == model.id }
        downloadedModels = updated

        saveDownloadedModels()
        calculateStorageUsed()
    }

    // MARK: - Storage

    private func loadDownloadedModels() {
        if let data = userDefaults.data(forKey: "downloadedLanguageModels"),
           let models = try? JSONDecoder().decode([LanguageModelInfo].self, from: data) {
            downloadedModels = models
        }
    }

    private func saveDownloadedModels() {
        if let data = try? JSONEncoder().encode(downloadedModels) {
            userDefaults.set(data, forKey: "downloadedLanguageModels")
        }
    }

    private func calculateStorageUsed() {
        // Calculate from tracked models
        let trackedStorage = downloadedModels.reduce(0) { $0 + $1.sizeBytes }

        // Add CoreML engine storage
        Task {
            let coreMLStorage = await coreMLEngine.getStorageUsed()
            await MainActor.run {
                self.totalStorageUsed = trackedStorage + coreMLStorage
            }
        }
    }

    // MARK: - Size Estimates

    private func estimatedSpeechModelSize(for language: VoiceTranslationLanguage) -> Int64 {
        // Approximate sizes based on typical Apple speech models
        switch language {
        case .english, .french, .spanish, .german:
            return 50_000_000 // ~50 MB
        case .chinese, .japanese:
            return 80_000_000 // ~80 MB
        default:
            return 40_000_000 // ~40 MB
        }
    }

    private func estimatedTranslationModelSize(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) -> Int64 {
        // Approximate sizes for translation model pairs
        let isAsianLanguage = [.chinese, .japanese, .korean].contains(source) ||
                              [.chinese, .japanese, .korean].contains(target)

        return isAsianLanguage ? 100_000_000 : 60_000_000 // 100MB or 60MB
    }

    // MARK: - Utilities

    /// Get formatted storage size
    var formattedStorageUsed: String {
        ByteCountFormatter.string(fromByteCount: totalStorageUsed, countStyle: .file)
    }

    /// Check if a specific language pair is ready for offline use
    func isReadyForOffline(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage) -> Bool {
        // Check speech recognition for source
        let speechReady = downloadedModels.contains { model in
            model.type == .speechRecognition &&
            model.sourceLanguage == source &&
            model.isDownloaded
        }

        // Check translation pair
        let translationReady = downloadedModels.contains { model in
            model.type == .translation &&
            model.sourceLanguage == source &&
            model.targetLanguage == target &&
            model.isDownloaded
        }

        return speechReady && translationReady
    }
}

// MARK: - Language Model Info

struct LanguageModelInfo: Identifiable, Codable, Equatable {
    let id: String
    let type: ModelType
    let sourceLanguage: VoiceTranslationLanguage
    let targetLanguage: VoiceTranslationLanguage?
    let displayName: String
    let sizeBytes: Int64
    var isDownloaded: Bool
    let isAvailable: Bool
    let supportsOffline: Bool

    var formattedSize: String {
        ByteCountFormatter.string(fromByteCount: sizeBytes, countStyle: .file)
    }

    /// Provider type for this model
    var providerName: String {
        switch type {
        case .speechRecognition:
            return "Apple Speech"
        case .translation:
            return "Apple Translation"
        case .coreMLTranslation:
            return "Core ML (Meta NLLB)"
        }
    }

    enum ModelType: String, Codable {
        case speechRecognition      // Apple SFSpeechRecognizer
        case translation            // Apple Translation (iOS 18+)
        case coreMLTranslation      // Core ML models (Meta NLLB 600M)
    }
}

// MARK: - Errors

enum LanguageModelError: Error, LocalizedError {
    case notAvailable
    case notSupported
    case downloadRequired
    case downloadFailed
    case invalidModel
    case storageError

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "This language is not available on your device"
        case .notSupported:
            return "This feature requires iOS 18 or later"
        case .downloadRequired:
            return "Language model download required"
        case .downloadFailed:
            return "Failed to download language model"
        case .invalidModel:
            return "Invalid model configuration"
        case .storageError:
            return "Storage error occurred"
        }
    }
}
