//
//  BackendAudioService.swift
//  Meeshy
//
//  Service for backend audio processing: transcription, translation, TTS with voice cloning
//  Communicates with the translator service (FastAPI on port 8000)
//
//  Pipeline: Audio -> Transcription -> Translation -> TTS (with voice cloning)
//

import Foundation
import AVFoundation
import os.log

// MARK: - Backend Audio Service

/// Service that communicates with the backend translator for audio processing
/// Provides: transcription, translation, TTS with voice cloning
actor BackendAudioService {

    // MARK: - Singleton

    static let shared = BackendAudioService()

    // MARK: - Types

    struct ProcessedVoiceMessage {
        let originalText: String
        let originalLanguage: VoiceTranslationLanguage
        let translatedText: String
        let targetLanguage: VoiceTranslationLanguage
        let audioURL: URL?
        let audioData: Data?
        let processingTime: TimeInterval
        let usedVoiceCloning: Bool
    }

    struct TranscriptionResult {
        let text: String
        let language: VoiceTranslationLanguage
        let confidence: Float
        let duration: TimeInterval
    }

    struct TTSResult {
        let audioURL: URL
        let audioData: Data
        let duration: TimeInterval
        let usedVoiceCloning: Bool
    }

    enum BackendAudioError: Error, LocalizedError {
        case networkError(String)
        case transcriptionFailed(String)
        case translationFailed(String)
        case ttsFailed(String)
        case voiceRegistrationFailed(String)
        case invalidResponse
        case audioFileTooLarge
        case serviceUnavailable
        case invalidAudioFormat

        var errorDescription: String? {
            switch self {
            case .networkError(let msg): return "Network error: \(msg)"
            case .transcriptionFailed(let msg): return "Transcription failed: \(msg)"
            case .translationFailed(let msg): return "Translation failed: \(msg)"
            case .ttsFailed(let msg): return "TTS failed: \(msg)"
            case .voiceRegistrationFailed(let msg): return "Voice registration failed: \(msg)"
            case .invalidResponse: return "Invalid response from server"
            case .audioFileTooLarge: return "Audio file is too large"
            case .serviceUnavailable: return "Audio service is unavailable"
            case .invalidAudioFormat: return "Invalid audio format"
            }
        }
    }

    // MARK: - Properties

    private let session: URLSession
    private let decoder: JSONDecoder
    private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Meeshy", category: "BackendAudioService")

    // Cache for voice embeddings
    private var voiceEmbeddingCache: [String: String] = [:] // userId -> embeddingId

    // MARK: - Initialization

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = AudioAPIConfiguration.processingTimeout
        config.timeoutIntervalForResource = AudioAPIConfiguration.processingTimeout * 2
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase
    }

    // MARK: - Base URL

    private var baseURL: String {
        AudioAPIConfiguration.translatorBaseURL
    }

    // MARK: - Transcription

    /// Transcribe audio file to text using backend Whisper
    func transcribe(
        audioURL: URL,
        language: VoiceTranslationLanguage? = nil,
        model: String = "large-v3"
    ) async throws -> TranscriptionResult {
        let startTime = CFAbsoluteTimeGetCurrent()

        logger.info("[Transcription] Starting for: \(audioURL.lastPathComponent)")

        // Validate file size
        let fileSize = try FileManager.default.attributesOfItem(atPath: audioURL.path)[.size] as? Int ?? 0
        guard fileSize <= AudioAPIConfiguration.maxAudioFileSize else {
            throw BackendAudioError.audioFileTooLarge
        }

        // Build multipart request
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: URL(string: "\(baseURL)/v1/audio/transcriptions")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AudioAPIConfiguration.processingTimeout

        // Build body
        var body = Data()

        // Add audio file
        let audioData = try Data(contentsOf: audioURL)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(audioURL.lastPathComponent)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)

        // Add model
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"model\"\r\n\r\n".data(using: .utf8)!)
        body.append(model.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add language if specified
        if let lang = language {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"language\"\r\n\r\n".data(using: .utf8)!)
            body.append(lang.rawValue.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        // Execute request
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendAudioError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown error"
            logger.error("[Transcription] Failed with status \(httpResponse.statusCode): \(errorMsg)")
            throw BackendAudioError.transcriptionFailed("HTTP \(httpResponse.statusCode)")
        }

        // Decode response
        let transcriptionResponse = try decoder.decode(TranscriptionResponse.self, from: data)

        let processingTime = CFAbsoluteTimeGetCurrent() - startTime
        let detectedLanguage = VoiceTranslationLanguage(rawValue: transcriptionResponse.language) ?? .english

        logger.info("[Transcription] Success in \(String(format: "%.0fms", processingTime * 1000)): '\(transcriptionResponse.text.prefix(50))...'")

        return TranscriptionResult(
            text: transcriptionResponse.text,
            language: detectedLanguage,
            confidence: transcriptionResponse.confidence ?? 1.0,
            duration: Double(transcriptionResponse.durationMs ?? 0) / 1000.0
        )
    }

    // MARK: - Translation

    /// Translate text using backend translation service
    func translate(
        text: String,
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage,
        modelType: String = "basic"
    ) async throws -> AudioTranslationResponse {
        let startTime = CFAbsoluteTimeGetCurrent()

        logger.info("[Translation] '\(text.prefix(30))...' (\(sourceLanguage.rawValue) -> \(targetLanguage.rawValue))")

        var request = URLRequest(url: URL(string: "\(baseURL)/translate")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15 // Basic model is fast

        let translationRequest = AudioTranslationRequest(
            text: text,
            sourceLanguage: sourceLanguage.rawValue,
            targetLanguage: targetLanguage.rawValue,
            modelType: modelType
        )

        request.httpBody = try JSONEncoder().encode(translationRequest)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendAudioError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown error"
            logger.error("[Translation] Failed with status \(httpResponse.statusCode): \(errorMsg)")
            throw BackendAudioError.translationFailed("HTTP \(httpResponse.statusCode)")
        }

        let translationResponse = try decoder.decode(AudioTranslationResponse.self, from: data)

        let processingTime = CFAbsoluteTimeGetCurrent() - startTime
        logger.info("[Translation] Success in \(String(format: "%.0fms", processingTime * 1000)): '\(translationResponse.translatedText.prefix(50))...'")

        return translationResponse
    }

    // MARK: - Text-to-Speech

    /// Generate speech from text with optional voice cloning
    func synthesize(
        text: String,
        language: VoiceTranslationLanguage,
        voiceId: String? = nil
    ) async throws -> TTSResult {
        let startTime = CFAbsoluteTimeGetCurrent()

        logger.info("[TTS] Generating speech for: '\(text.prefix(30))...' in \(language.rawValue)")

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: URL(string: "\(baseURL)/v1/tts")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AudioAPIConfiguration.processingTimeout

        var body = Data()

        // Add text
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"text\"\r\n\r\n".data(using: .utf8)!)
        body.append(text.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add language
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"language\"\r\n\r\n".data(using: .utf8)!)
        body.append(language.rawValue.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add voice_id if provided (for voice cloning)
        if let voiceId = voiceId {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"voice_id\"\r\n\r\n".data(using: .utf8)!)
            body.append(voiceId.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendAudioError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown error"
            logger.error("[TTS] Failed with status \(httpResponse.statusCode): \(errorMsg)")
            throw BackendAudioError.ttsFailed("HTTP \(httpResponse.statusCode)")
        }

        // Check if response is audio data (binary)
        let contentType = httpResponse.value(forHTTPHeaderField: "Content-Type") ?? ""
        guard contentType.contains("audio") else {
            // Might be JSON with audio_url
            if let ttsResponse = try? decoder.decode(TTSResponse.self, from: data),
               let audioUrlString = ttsResponse.audioUrl,
               let audioUrl = URL(string: "\(baseURL)\(audioUrlString)") {
                // Download the audio file
                let audioData = try await downloadAudioFile(from: audioUrl)
                let savedURL = try saveAudioData(audioData, filename: "tts_\(UUID().uuidString).mp3")

                let processingTime = CFAbsoluteTimeGetCurrent() - startTime
                logger.info("[TTS] Success (URL) in \(String(format: "%.0fms", processingTime * 1000))")

                return TTSResult(
                    audioURL: savedURL,
                    audioData: audioData,
                    duration: Double(ttsResponse.durationMs ?? 0) / 1000.0,
                    usedVoiceCloning: voiceId != nil
                )
            }
            throw BackendAudioError.ttsFailed("Unexpected response format")
        }

        // Save audio data directly
        let savedURL = try saveAudioData(data, filename: "tts_\(UUID().uuidString).mp3")

        let processingTime = CFAbsoluteTimeGetCurrent() - startTime
        logger.info("[TTS] Success (binary) in \(String(format: "%.0fms", processingTime * 1000))")

        return TTSResult(
            audioURL: savedURL,
            audioData: data,
            duration: estimateAudioDuration(data),
            usedVoiceCloning: voiceId != nil
        )
    }

    // MARK: - Voice Registration

    /// Register user's voice for cloning
    func registerVoice(
        audioURL: URL,
        userId: String
    ) async throws -> VoiceRegistrationResponse {
        let startTime = CFAbsoluteTimeGetCurrent()

        logger.info("[VoiceRegistration] Registering voice for user: \(userId)")

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: URL(string: "\(baseURL)/v1/register-voice")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AudioAPIConfiguration.processingTimeout

        var body = Data()

        // Add audio file
        let audioData = try Data(contentsOf: audioURL)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"voice_sample.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)

        // Add user_id
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"user_id\"\r\n\r\n".data(using: .utf8)!)
        body.append(userId.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendAudioError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown error"
            logger.error("[VoiceRegistration] Failed with status \(httpResponse.statusCode): \(errorMsg)")
            throw BackendAudioError.voiceRegistrationFailed("HTTP \(httpResponse.statusCode)")
        }

        let registrationResponse = try decoder.decode(VoiceRegistrationResponse.self, from: data)

        // Cache the voice embedding ID
        voiceEmbeddingCache[userId] = registrationResponse.voiceEmbeddingId

        let processingTime = CFAbsoluteTimeGetCurrent() - startTime
        logger.info("[VoiceRegistration] Success in \(String(format: "%.0fms", processingTime * 1000)): \(registrationResponse.status)")

        return registrationResponse
    }

    /// Get cached voice embedding ID for a user
    func getVoiceEmbeddingId(for userId: String) -> String? {
        voiceEmbeddingCache[userId]
    }

    // MARK: - Complete Voice Message Pipeline

    /// Process voice message through complete pipeline:
    /// Audio -> Transcription -> Translation -> TTS (with voice cloning)
    func processVoiceMessage(
        audioURL: URL,
        userId: String,
        targetLanguage: VoiceTranslationLanguage,
        conversationId: String? = nil,
        enableVoiceCloning: Bool = true
    ) async throws -> ProcessedVoiceMessage {
        let startTime = CFAbsoluteTimeGetCurrent()

        logger.info("[VoicePipeline] Starting full pipeline to \(targetLanguage.rawValue)")

        // Option 1: Use backend's complete pipeline endpoint
        if let result = try? await processVoiceMessageViaBackendPipeline(
            audioURL: audioURL,
            userId: userId,
            targetLanguage: targetLanguage,
            conversationId: conversationId,
            enableVoiceCloning: enableVoiceCloning
        ) {
            return result
        }

        // Option 2: Call individual endpoints (fallback)
        logger.info("[VoicePipeline] Falling back to individual endpoints")

        // Step 1: Transcribe
        let transcription = try await transcribe(audioURL: audioURL)

        // Step 2: Translate
        let translation = try await translate(
            text: transcription.text,
            from: transcription.language,
            to: targetLanguage
        )

        // Step 3: TTS with voice cloning
        var ttsResult: TTSResult?
        if enableVoiceCloning {
            let voiceId = voiceEmbeddingCache[userId]
            ttsResult = try? await synthesize(
                text: translation.translatedText,
                language: targetLanguage,
                voiceId: voiceId
            )
        }

        // Fallback to TTS without cloning
        if ttsResult == nil {
            ttsResult = try? await synthesize(
                text: translation.translatedText,
                language: targetLanguage,
                voiceId: nil
            )
        }

        let processingTime = CFAbsoluteTimeGetCurrent() - startTime
        logger.info("[VoicePipeline] Complete in \(String(format: "%.0fms", processingTime * 1000))")

        return ProcessedVoiceMessage(
            originalText: transcription.text,
            originalLanguage: transcription.language,
            translatedText: translation.translatedText,
            targetLanguage: targetLanguage,
            audioURL: ttsResult?.audioURL,
            audioData: ttsResult?.audioData,
            processingTime: processingTime,
            usedVoiceCloning: ttsResult?.usedVoiceCloning ?? false
        )
    }

    /// Use backend's complete pipeline endpoint
    private func processVoiceMessageViaBackendPipeline(
        audioURL: URL,
        userId: String,
        targetLanguage: VoiceTranslationLanguage,
        conversationId: String?,
        enableVoiceCloning: Bool
    ) async throws -> ProcessedVoiceMessage {
        let startTime = CFAbsoluteTimeGetCurrent()

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: URL(string: "\(baseURL)/v1/voice-message")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AudioAPIConfiguration.processingTimeout * 2 // Longer timeout for full pipeline

        var body = Data()

        // Add audio file
        let audioData = try Data(contentsOf: audioURL)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"voice_message.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)

        // Add user_id
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"user_id\"\r\n\r\n".data(using: .utf8)!)
        body.append(userId.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add target_language
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"target_language\"\r\n\r\n".data(using: .utf8)!)
        body.append(targetLanguage.rawValue.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add generate_voice_clone
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"generate_voice_clone\"\r\n\r\n".data(using: .utf8)!)
        body.append((enableVoiceCloning ? "true" : "false").data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)

        // Add conversation_id if provided
        if let convId = conversationId {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"conversation_id\"\r\n\r\n".data(using: .utf8)!)
            body.append(convId.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw BackendAudioError.serviceUnavailable
        }

        let pipelineResponse = try decoder.decode(VoiceMessageResponse.self, from: data)

        // Download generated audio if available
        var audioURL: URL?
        var downloadedAudioData: Data?
        if let audioUrlString = pipelineResponse.audioUrl {
            let fullAudioURL = URL(string: "\(baseURL)\(audioUrlString)")!
            downloadedAudioData = try? await downloadAudioFile(from: fullAudioURL)
            if let audioData = downloadedAudioData {
                audioURL = try saveAudioData(audioData, filename: "pipeline_\(UUID().uuidString).mp3")
            }
        }

        let processingTime = CFAbsoluteTimeGetCurrent() - startTime
        let originalLanguage = VoiceTranslationLanguage(rawValue: pipelineResponse.originalLanguage) ?? .english

        return ProcessedVoiceMessage(
            originalText: pipelineResponse.originalText,
            originalLanguage: originalLanguage,
            translatedText: pipelineResponse.translatedText,
            targetLanguage: targetLanguage,
            audioURL: audioURL,
            audioData: downloadedAudioData,
            processingTime: processingTime,
            usedVoiceCloning: pipelineResponse.usedVoiceCloning ?? enableVoiceCloning
        )
    }

    // MARK: - Helper Methods

    /// Download audio file from URL
    private func downloadAudioFile(from url: URL) async throws -> Data {
        let (data, response) = try await session.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw BackendAudioError.networkError("Failed to download audio")
        }

        return data
    }

    /// Save audio data to temporary file
    private func saveAudioData(_ data: Data, filename: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try data.write(to: url)
        return url
    }

    /// Estimate audio duration from MP3 data
    private func estimateAudioDuration(_ data: Data) -> TimeInterval {
        // Rough estimate based on typical MP3 bitrate (128kbps)
        let bitrate = 128_000 // bits per second
        let bytes = data.count
        let bits = bytes * 8
        return TimeInterval(bits) / TimeInterval(bitrate)
    }

    // MARK: - Service Health

    /// Check if backend audio service is available
    func checkHealth() async -> Bool {
        do {
            var request = URLRequest(url: URL(string: "\(baseURL)/health")!)
            request.timeoutInterval = 5

            let (_, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                return false
            }

            return httpResponse.statusCode == 200
        } catch {
            logger.error("[Health] Backend audio service unavailable: \(error.localizedDescription)")
            return false
        }
    }

    /// Get audio service statistics
    func getStatistics() async throws -> AudioServiceStats {
        var request = URLRequest(url: URL(string: "\(baseURL)/v1/audio/stats")!)
        request.timeoutInterval = 5

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw BackendAudioError.serviceUnavailable
        }

        return try decoder.decode(AudioServiceStats.self, from: data)
    }
}
