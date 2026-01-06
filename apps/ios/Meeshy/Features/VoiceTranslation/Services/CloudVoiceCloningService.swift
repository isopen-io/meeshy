//
//  CloudVoiceCloningService.swift
//  Meeshy
//
//  Cloud-based voice cloning service for high-quality voice translation
//  Handles voice profile management, translation, and voice analysis via API
//
//  Features:
//  - Voice profile creation and improvement
//  - Audio translation with voice cloning
//  - Voice characteristics analysis
//  - Voice similarity comparison
//
//  iOS 16+
//

import Foundation
import AVFoundation
import os.log

// MARK: - Cloud Voice Cloning Service

/// Cloud-based voice cloning service for high-quality translations
/// Handles network requests to voice processing backend
@MainActor
final class CloudVoiceCloningService: ObservableObject {

    // MARK: - Singleton

    static let shared = CloudVoiceCloningService()

    // MARK: - Published State

    @Published private(set) var isAvailable: Bool = false
    @Published private(set) var isProcessing: Bool = false
    @Published private(set) var lastError: String?
    @Published private(set) var voiceProfileStatus: VoiceProfileStatus = .none

    // MARK: - Types

    enum VoiceProfileStatus: Equatable {
        case none
        case basic(score: Float)
        case good(score: Float)
        case veryGood(score: Float)
        case excellent(score: Float)

        var displayName: String {
            switch self {
            case .none: return "Non configuré"
            case .basic: return "Basique"
            case .good: return "Bon"
            case .veryGood: return "Très bon"
            case .excellent: return "Excellent"
            }
        }

        var score: Float {
            switch self {
            case .none: return 0
            case .basic(let s), .good(let s), .veryGood(let s), .excellent(let s): return s
            }
        }
    }

    // MARK: - Response Models

    struct TranslateResponse: Codable {
        let originalText: String
        let translatedText: String
        let sourceLanguage: String
        let targetLanguage: String
        let voiceCloned: Bool
        let similarityScore: Float?
        let durationSeconds: Float
        let processingTimeMs: Int
        let audioBase64: String?

        enum CodingKeys: String, CodingKey {
            case originalText = "original_text"
            case translatedText = "translated_text"
            case sourceLanguage = "source_language"
            case targetLanguage = "target_language"
            case voiceCloned = "voice_cloned"
            case similarityScore = "similarity_score"
            case durationSeconds = "duration_seconds"
            case processingTimeMs = "processing_time_ms"
            case audioBase64 = "audio_base64"
        }
    }

    struct VoiceProfileResponse: Codable {
        let userId: String
        let qualityScore: Float
        let qualityLevel: String
        let totalAudioSeconds: Float
        let sampleCount: Int
        let supportedLanguages: [String]
        let createdAt: String?
        let updatedAt: String?
        let recommendations: [String]

        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case qualityScore = "quality_score"
            case qualityLevel = "quality_level"
            case totalAudioSeconds = "total_audio_seconds"
            case sampleCount = "sample_count"
            case supportedLanguages = "supported_languages"
            case createdAt = "created_at"
            case updatedAt = "updated_at"
            case recommendations
        }
    }

    struct VoiceAnalysisResponse: Codable {
        let pitchHz: Float
        let pitchVariability: Float
        let voiceType: String
        let brightness: Float
        let energy: Float
        let durationSeconds: Float
        let speechRate: Float?
        let classification: String?

        enum CodingKeys: String, CodingKey {
            case pitchHz = "pitch_hz"
            case pitchVariability = "pitch_variability"
            case voiceType = "voice_type"
            case brightness
            case energy
            case durationSeconds = "duration_seconds"
            case speechRate = "speech_rate"
            case classification
        }
    }

    struct VoiceComparisonResponse: Codable {
        let overallSimilarity: Float
        let pitchSimilarity: Float
        let timbreSimilarity: Float
        let energySimilarity: Float
        let mfccSimilarity: Float?
        let qualityAssessment: String
        let original: VoiceCharacteristics
        let cloned: VoiceCharacteristics

        struct VoiceCharacteristics: Codable {
            let pitchHz: Float
            let voiceType: String

            enum CodingKeys: String, CodingKey {
                case pitchHz = "pitch_hz"
                case voiceType = "voice_type"
            }
        }

        enum CodingKeys: String, CodingKey {
            case overallSimilarity = "overall_similarity"
            case pitchSimilarity = "pitch_similarity"
            case timbreSimilarity = "timbre_similarity"
            case energySimilarity = "energy_similarity"
            case mfccSimilarity = "mfcc_similarity"
            case qualityAssessment = "quality_assessment"
            case original
            case cloned
        }
    }

    struct SupportedLanguagesResponse: Codable {
        let supportedLanguages: [String: String]
        let defaultLanguage: String

        enum CodingKeys: String, CodingKey {
            case supportedLanguages = "supported_languages"
            case defaultLanguage = "default_language"
        }
    }

    struct HealthResponse: Codable {
        let status: String
        let version: String
        let services: [String: Bool]
        let uptimeSeconds: Int

        enum CodingKeys: String, CodingKey {
            case status
            case version
            case services
            case uptimeSeconds = "uptime_seconds"
        }
    }

    // MARK: - Result Types

    struct TranslationResult {
        let originalText: String
        let translatedText: String
        let sourceLanguage: String
        let targetLanguage: String
        let audioURL: URL?
        let audioData: Data?
        let duration: TimeInterval
        let processingTimeMs: Int
        let voiceCloned: Bool
        let similarityScore: Float?
    }

    struct VoiceAnalysis {
        let pitchHz: Float
        let pitchVariability: Float
        let voiceType: String
        let brightness: Float
        let energy: Float
        let duration: TimeInterval
    }

    struct VoiceComparison {
        let overallSimilarity: Float
        let pitchSimilarity: Float
        let timbreSimilarity: Float
        let qualityAssessment: String
        let originalVoiceType: String
        let clonedVoiceType: String
    }

    // MARK: - Private Properties

    private let logger = mediaLogger
    private let session: URLSession
    private var currentUserId: String?

    // MARK: - Configuration

    private var baseURL: String {
        // Use translator service URL (port 8000)
        AudioAPIConfiguration.translatorBaseURL
    }

    private let timeout: TimeInterval = 120 // 2 minutes for voice processing

    // MARK: - Initialization

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout * 2
        self.session = URLSession(configuration: config)

        Task {
            await checkAvailability()
        }
    }

    // MARK: - Availability Check

    /// Check if cloud voice cloning service is available
    func checkAvailability() async {
        logger.info("[CloudVoice] Checking availability at \(baseURL)")

        guard let url = URL(string: "\(baseURL)/api/v1/health") else {
            isAvailable = false
            return
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.timeoutInterval = 10

            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                isAvailable = false
                return
            }

            let healthResponse = try JSONDecoder().decode(HealthResponse.self, from: data)

            // Check if voice_cloning service is available
            isAvailable = healthResponse.services["voice_cloning"] ?? false

            if isAvailable {
                logger.info("[CloudVoice] Service available - version \(healthResponse.version)")
            } else {
                logger.warn("[CloudVoice] Service degraded - voice cloning not available")
            }

        } catch {
            logger.error("[CloudVoice] Health check failed: \(error.localizedDescription)")
            isAvailable = false
        }
    }

    // MARK: - Voice Translation (Full Pipeline)

    /// Translate audio with voice cloning
    /// - Parameters:
    ///   - audioURL: Source audio file URL
    ///   - sourceLanguage: Source language code (optional, auto-detect)
    ///   - targetLanguage: Target language code
    ///   - userId: User ID for voice profile
    ///   - enableVoiceCloning: Use voice cloning (default: true)
    /// - Returns: Translation result with cloned audio
    func translateAudio(
        audioURL: URL,
        sourceLanguage: String? = nil,
        targetLanguage: String,
        userId: String,
        enableVoiceCloning: Bool = true
    ) async throws -> TranslationResult {

        logger.info("[CloudVoice] Translating audio to \(targetLanguage) for user \(userId)")
        isProcessing = true
        lastError = nil

        defer { isProcessing = false }

        // Read audio data
        let audioData = try Data(contentsOf: audioURL)

        // Build multipart form data
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        // Add audio file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"audio.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)

        // Add form fields
        let fields: [(String, String)] = [
            ("target_language", targetLanguage),
            ("source_language", sourceLanguage ?? ""),
            ("enable_voice_cloning", enableVoiceCloning ? "true" : "false"),
            ("model", "fast"),
            ("output_format", "wav"),
            ("speed", "1.0"),
            ("user_id", userId)
        ]

        for (name, value) in fields where !value.isEmpty {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        // Create request
        guard let url = URL(string: "\(baseURL)/api/v1/voice/translate") else {
            throw CloudVoiceCloningError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = timeout

        // Add auth if available
        if let token = AuthenticationManager.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Execute request
        let startTime = Date()
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw CloudVoiceCloningError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
            logger.error("[CloudVoice] Translation failed: \(httpResponse.statusCode) - \(errorMessage)")
            lastError = errorMessage
            throw CloudVoiceCloningError.serverError(httpResponse.statusCode, errorMessage)
        }

        // Parse response
        let decoder = JSONDecoder()
        let translateResponse = try decoder.decode(TranslateResponse.self, from: data)

        // Decode audio if present
        var resultAudioData: Data? = nil
        var resultAudioURL: URL? = nil

        if let audioBase64 = translateResponse.audioBase64,
           let decoded = Data(base64Encoded: audioBase64) {
            resultAudioData = decoded

            // Save to temp file
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("cloned_\(UUID().uuidString).wav")
            try decoded.write(to: tempURL)
            resultAudioURL = tempURL
        }

        let processingTime = Int(Date().timeIntervalSince(startTime) * 1000)

        logger.info("[CloudVoice] Translation complete in \(processingTime)ms, voice_cloned=\(translateResponse.voiceCloned)")

        return TranslationResult(
            originalText: translateResponse.originalText,
            translatedText: translateResponse.translatedText,
            sourceLanguage: translateResponse.sourceLanguage,
            targetLanguage: translateResponse.targetLanguage,
            audioURL: resultAudioURL,
            audioData: resultAudioData,
            duration: TimeInterval(translateResponse.durationSeconds),
            processingTimeMs: translateResponse.processingTimeMs,
            voiceCloned: translateResponse.voiceCloned,
            similarityScore: translateResponse.similarityScore
        )
    }

    /// Translate audio and get binary WAV response directly
    func translateAudioBinary(
        audioURL: URL,
        sourceLanguage: String? = nil,
        targetLanguage: String,
        userId: String,
        enableVoiceCloning: Bool = true
    ) async throws -> (audioData: Data, headers: [String: String]) {

        logger.info("[CloudVoice] Translating audio (binary) to \(targetLanguage)")
        isProcessing = true
        lastError = nil

        defer { isProcessing = false }

        let audioData = try Data(contentsOf: audioURL)

        // Build multipart
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"audio.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)

        for (name, value) in [
            ("target_language", targetLanguage),
            ("source_language", sourceLanguage ?? ""),
            ("enable_voice_cloning", enableVoiceCloning ? "true" : "false"),
            ("user_id", userId)
        ] where !value.isEmpty {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        guard let url = URL(string: "\(baseURL)/api/v1/voice/translate/audio") else {
            throw CloudVoiceCloningError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = timeout

        if let token = AuthenticationManager.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw CloudVoiceCloningError.invalidResponse
        }

        // Extract headers
        var headers: [String: String] = [:]
        for (key, value) in httpResponse.allHeaderFields {
            if let keyStr = key as? String, let valueStr = value as? String {
                headers[keyStr] = valueStr
            }
        }

        return (data, headers)
    }

    // MARK: - Voice Profile Management

    /// Create or update voice profile with audio sample
    func registerVoice(
        audioURL: URL,
        userId: String,
        language: String = "en"
    ) async throws -> VoiceProfileResponse {

        logger.info("[CloudVoice] Registering voice for user \(userId)")
        isProcessing = true
        lastError = nil

        defer { isProcessing = false }

        let audioData = try Data(contentsOf: audioURL)

        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"voice_sample.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)

        for (name, value) in [("language", language), ("user_id", userId)] {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        guard let url = URL(string: "\(baseURL)/api/v1/voice/profile") else {
            throw CloudVoiceCloningError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60

        if let token = AuthenticationManager.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw CloudVoiceCloningError.serverError((response as? HTTPURLResponse)?.statusCode ?? 500, errorMessage)
        }

        let profileResponse = try JSONDecoder().decode(VoiceProfileResponse.self, from: data)

        // Update status
        updateVoiceProfileStatus(from: profileResponse)
        currentUserId = userId

        logger.info("[CloudVoice] Voice registered: quality=\(profileResponse.qualityScore), samples=\(profileResponse.sampleCount)")

        return profileResponse
    }

    /// Get voice profile for user
    func getVoiceProfile(userId: String) async throws -> VoiceProfileResponse {
        guard let url = URL(string: "\(baseURL)/api/v1/voice/profile?user_id=\(userId)") else {
            throw CloudVoiceCloningError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        if let token = AuthenticationManager.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw CloudVoiceCloningError.profileNotFound
        }

        let profileResponse = try JSONDecoder().decode(VoiceProfileResponse.self, from: data)
        updateVoiceProfileStatus(from: profileResponse)
        currentUserId = userId

        return profileResponse
    }

    /// Delete voice profile
    func deleteVoiceProfile(userId: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/v1/voice/profile?user_id=\(userId)") else {
            throw CloudVoiceCloningError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"

        if let token = AuthenticationManager.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (_, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw CloudVoiceCloningError.invalidResponse
        }

        voiceProfileStatus = .none
        currentUserId = nil

        logger.info("[CloudVoice] Voice profile deleted for user \(userId)")
    }

    // MARK: - Voice Analysis

    /// Analyze voice characteristics
    func analyzeVoice(audioURL: URL) async throws -> VoiceAnalysis {
        logger.info("[CloudVoice] Analyzing voice...")
        isProcessing = true

        defer { isProcessing = false }

        let audioData = try Data(contentsOf: audioURL)

        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"audio.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        guard let url = URL(string: "\(baseURL)/api/v1/voice/analyze") else {
            throw CloudVoiceCloningError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw CloudVoiceCloningError.analysisUnavailable
        }

        let analysisResponse = try JSONDecoder().decode(VoiceAnalysisResponse.self, from: data)

        logger.info("[CloudVoice] Voice analyzed: \(analysisResponse.voiceType), pitch=\(analysisResponse.pitchHz)Hz")

        return VoiceAnalysis(
            pitchHz: analysisResponse.pitchHz,
            pitchVariability: analysisResponse.pitchVariability,
            voiceType: analysisResponse.voiceType,
            brightness: analysisResponse.brightness,
            energy: analysisResponse.energy,
            duration: TimeInterval(analysisResponse.durationSeconds)
        )
    }

    /// Compare original and cloned voices
    func compareVoices(originalURL: URL, clonedURL: URL) async throws -> VoiceComparison {
        logger.info("[CloudVoice] Comparing voices...")
        isProcessing = true

        defer { isProcessing = false }

        let originalData = try Data(contentsOf: originalURL)
        let clonedData = try Data(contentsOf: clonedURL)

        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        // Original audio
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"original\"; filename=\"original.wav\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        body.append(originalData)
        body.append("\r\n".data(using: .utf8)!)

        // Cloned audio
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"cloned\"; filename=\"cloned.wav\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        body.append(clonedData)
        body.append("\r\n".data(using: .utf8)!)

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        guard let url = URL(string: "\(baseURL)/api/v1/voice/compare") else {
            throw CloudVoiceCloningError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw CloudVoiceCloningError.comparisonFailed
        }

        let comparisonResponse = try JSONDecoder().decode(VoiceComparisonResponse.self, from: data)

        logger.info("[CloudVoice] Voice comparison: \(comparisonResponse.overallSimilarity * 100)% similarity")

        return VoiceComparison(
            overallSimilarity: comparisonResponse.overallSimilarity,
            pitchSimilarity: comparisonResponse.pitchSimilarity,
            timbreSimilarity: comparisonResponse.timbreSimilarity,
            qualityAssessment: comparisonResponse.qualityAssessment,
            originalVoiceType: comparisonResponse.original.voiceType,
            clonedVoiceType: comparisonResponse.cloned.voiceType
        )
    }

    // MARK: - Supported Languages

    /// Get list of supported languages for XTTS
    func getSupportedLanguages() async throws -> [String: String] {
        guard let url = URL(string: "\(baseURL)/api/v1/voice/languages") else {
            throw CloudVoiceCloningError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        let (data, _) = try await session.data(for: request)

        let response = try JSONDecoder().decode(SupportedLanguagesResponse.self, from: data)
        return response.supportedLanguages
    }

    // MARK: - Private Helpers

    private func updateVoiceProfileStatus(from profile: VoiceProfileResponse) {
        let score = profile.qualityScore

        if score < 0.5 {
            voiceProfileStatus = .basic(score: score)
        } else if score < 0.7 {
            voiceProfileStatus = .good(score: score)
        } else if score < 0.85 {
            voiceProfileStatus = .veryGood(score: score)
        } else {
            voiceProfileStatus = .excellent(score: score)
        }
    }
}

// MARK: - Errors

enum CloudVoiceCloningError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case serverError(Int, String)
    case profileNotFound
    case analysisUnavailable
    case comparisonFailed
    case networkUnavailable

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid API URL"
        case .invalidResponse:
            return "Invalid server response"
        case .serverError(let code, let message):
            return "Server error \(code): \(message)"
        case .profileNotFound:
            return "Voice profile not found"
        case .analysisUnavailable:
            return "Voice analysis service unavailable"
        case .comparisonFailed:
            return "Voice comparison failed"
        case .networkUnavailable:
            return "Network unavailable"
        }
    }
}
