//
//  TranscriptionCache.swift
//  Meeshy
//
//  Cache for audio transcriptions to avoid re-transcribing the same files
//

import Foundation
import Speech

// MARK: - Transcription Cache

/// Caches audio transcriptions keyed by file URL
actor TranscriptionCache {

    static let shared = TranscriptionCache()

    // MARK: - Types

    struct CachedTranscription: Codable {
        let text: String
        let languageCode: String
        let timestamp: Date
        let duration: TimeInterval
    }

    // MARK: - Properties

    private var memoryCache: [String: CachedTranscription] = [:]
    private let fileManager = FileManager.default
    private let cacheDirectory: URL

    // MARK: - Init

    private init() {
        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDirectory = caches.appendingPathComponent("TranscriptionCache", isDirectory: true)

        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Cache Key

    private func cacheKey(for url: URL) -> String {
        // Use file hash or path as key
        let path = url.absoluteString
        return path.data(using: .utf8)?.base64EncodedString() ?? path
    }

    // MARK: - Get

    func get(for url: URL) -> CachedTranscription? {
        let key = cacheKey(for: url)

        // Check memory first
        if let cached = memoryCache[key] {
            return cached
        }

        // Check disk
        let fileURL = cacheDirectory.appendingPathComponent("\(key).json")
        guard let data = try? Data(contentsOf: fileURL),
              let cached = try? JSONDecoder().decode(CachedTranscription.self, from: data) else {
            return nil
        }

        // Populate memory cache
        memoryCache[key] = cached
        return cached
    }

    // MARK: - Set

    func set(_ transcription: CachedTranscription, for url: URL) {
        let key = cacheKey(for: url)

        // Save to memory
        memoryCache[key] = transcription

        // Save to disk
        let fileURL = cacheDirectory.appendingPathComponent("\(key).json")
        if let data = try? JSONEncoder().encode(transcription) {
            try? data.write(to: fileURL)
        }
    }

    // MARK: - Remove

    func remove(for url: URL) {
        let key = cacheKey(for: url)
        memoryCache.removeValue(forKey: key)

        let fileURL = cacheDirectory.appendingPathComponent("\(key).json")
        try? fileManager.removeItem(at: fileURL)
    }

    // MARK: - Clear

    func clearAll() {
        memoryCache.removeAll()
        try? fileManager.removeItem(at: cacheDirectory)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }
}

// MARK: - Simple Transcription Service

/// Simple transcription service using native Speech framework
@MainActor
final class SimpleTranscriptionService: ObservableObject {

    @Published private(set) var isTranscribing = false
    @Published private(set) var transcription: String?
    @Published private(set) var error: String?
    @Published private(set) var requiresSettings = false

    private var currentTask: Task<Void, Never>?

    /// Transcribe audio file with caching
    func transcribe(url: URL) async {
        // Check cache first
        if let cached = await TranscriptionCache.shared.get(for: url) {
            transcription = cached.text
            return
        }

        // Start transcription
        isTranscribing = true
        error = nil
        requiresSettings = false

        do {
            let text = try await performTranscription(url: url)
            transcription = text

            // Cache result
            let cached = TranscriptionCache.CachedTranscription(
                text: text,
                languageCode: Locale.current.language.languageCode?.identifier ?? "en",
                timestamp: Date(),
                duration: 0
            )
            await TranscriptionCache.shared.set(cached, for: url)

        } catch let transcriptionError as TranscriptionError {
            self.error = transcriptionError.errorDescription
            self.requiresSettings = transcriptionError.requiresSettings
        } catch {
            self.error = error.localizedDescription
            self.requiresSettings = false
        }

        isTranscribing = false
    }

    /// Cancel ongoing transcription
    func cancel() {
        currentTask?.cancel()
        currentTask = nil
        isTranscribing = false
    }

    // MARK: - Private

    private func performTranscription(url: URL) async throws -> String {
        // Request authorization
        let status = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }

        guard status == .authorized else {
            throw TranscriptionError.notAuthorized
        }

        // Get recognizer for current locale
        guard let recognizer = SFSpeechRecognizer() else {
            throw TranscriptionError.notAvailable
        }

        guard recognizer.isAvailable else {
            throw TranscriptionError.siriDisabled
        }

        // Create request
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false

        // Prefer on-device recognition
        if #available(iOS 16, *) {
            if recognizer.supportsOnDeviceRecognition {
                request.requiresOnDeviceRecognition = true
            }
            request.addsPunctuation = true
        }

        // Perform recognition
        return try await withCheckedThrowingContinuation { continuation in
            var hasResumed = false

            recognizer.recognitionTask(with: request) { result, error in
                guard !hasResumed else { return }

                if let error = error {
                    hasResumed = true
                    // Check if it's a Siri/Dictation disabled error
                    // Error code 1101 (kAFAssistantErrorDomain) means Siri & Dictation is disabled
                    let nsError = error as NSError
                    let errorMessage = error.localizedDescription.lowercased()

                    if nsError.code == 1101 ||
                       errorMessage.contains("siri") ||
                       errorMessage.contains("dictation") ||
                       errorMessage.contains("localspeechrecognition") {
                        continuation.resume(throwing: TranscriptionError.siriDisabled)
                    } else {
                        continuation.resume(throwing: TranscriptionError.failed(error.localizedDescription))
                    }
                    return
                }

                if let result = result, result.isFinal {
                    hasResumed = true
                    continuation.resume(returning: result.bestTranscription.formattedString)
                }
            }
        }
    }
}

// MARK: - Transcription Error

enum TranscriptionError: LocalizedError {
    case notAuthorized
    case notAvailable
    case siriDisabled
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .notAuthorized:
            return "L'autorisation de reconnaissance vocale est requise. Allez dans Réglages > Meeshy pour l'activer."
        case .notAvailable:
            return "La reconnaissance vocale n'est pas disponible. Vérifiez que Siri & Dictée sont activés dans Réglages > Siri & Recherche."
        case .siriDisabled:
            return "Siri et Dictée sont désactivés. Activez Siri dans Réglages > Siri & Recherche pour utiliser la transcription."
        case .failed(let message):
            return message
        }
    }

    var requiresSettings: Bool {
        switch self {
        case .notAuthorized, .notAvailable, .siriDisabled:
            return true
        case .failed:
            return false
        }
    }
}
