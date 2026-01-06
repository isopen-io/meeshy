//
//  AudioEndpoints.swift
//  Meeshy
//
//  API endpoints for audio processing (transcription, TTS, voice cloning)
//  Communicates with translator service at /v1/audio/*
//

import Foundation

// MARK: - Audio Endpoints

enum AudioEndpoints: APIEndpoint, Sendable {

    // MARK: - Transcription

    /// Transcribe audio file to text
    /// POST /v1/audio/transcriptions
    /// Body: multipart/form-data with "file" field
    case transcribe(model: String?, language: String?)

    // MARK: - Translation

    /// Translate text
    /// POST /translate
    case translate(request: AudioTranslationRequest)

    // MARK: - Text-to-Speech

    /// Synthesize speech from text with voice cloning
    /// POST /v1/audio/tts
    /// Body: multipart/form-data with text, language, optional user_id for voice cloning
    case synthesize(text: String, language: String, userId: String?)

    /// Synthesize with reference audio (one-shot cloning)
    /// POST /v1/audio/tts
    /// Body: multipart/form-data with text, language, reference_audio file
    case synthesizeWithReference(text: String, language: String)

    // MARK: - Voice Profile

    /// Create or improve voice profile
    /// POST /v1/audio/voice-profile
    /// Body: multipart/form-data with audio_file and user_id
    case createVoiceProfile(userId: String, language: String)

    /// Add sample to improve voice profile
    /// POST /v1/audio/voice-profile/{user_id}/samples
    case addVoiceSample(userId: String, language: String)

    /// Get voice profile
    /// GET /v1/audio/voice-profile/{user_id}
    case getVoiceProfile(userId: String)

    /// Delete voice profile
    /// DELETE /v1/audio/voice-profile/{user_id}
    case deleteVoiceProfile(userId: String)

    /// Update voice profile settings
    /// PUT /v1/audio/voice-profile/{user_id}/settings
    case updateVoiceProfileSettings(userId: String, isActive: Bool?, preferredLanguages: [String]?)

    // MARK: - Complete Pipeline

    /// Complete audio translation pipeline: transcribe -> translate -> TTS with cloning
    /// POST /v1/audio/translate
    /// Body: multipart/form-data with audio file and parameters
    case translateAudio(request: AudioTranslationPipelineRequest)

    // MARK: - Audio File Retrieval

    /// Get generated audio file
    /// GET /v1/audio/{filename}
    case getAudioFile(filename: String)

    // MARK: - Statistics

    /// Get audio service statistics
    /// GET /v1/audio/stats
    case getStats

    // MARK: - APIEndpoint Protocol

    var path: String {
        switch self {
        case .transcribe:
            return "/v1/audio/transcriptions"
        case .translate:
            return "/translate"
        case .synthesize, .synthesizeWithReference:
            return "/v1/audio/tts"
        case .createVoiceProfile:
            return "/v1/audio/voice-profile"
        case .addVoiceSample(let userId, _):
            return "/v1/audio/voice-profile/\(userId)/samples"
        case .getVoiceProfile(let userId):
            return "/v1/audio/voice-profile/\(userId)"
        case .deleteVoiceProfile(let userId):
            return "/v1/audio/voice-profile/\(userId)"
        case .updateVoiceProfileSettings(let userId, _, _):
            return "/v1/audio/voice-profile/\(userId)/settings"
        case .translateAudio:
            return "/v1/audio/translate"
        case .getAudioFile(let filename):
            return "/v1/audio/\(filename)"
        case .getStats:
            return "/v1/audio/stats"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .transcribe, .translate, .synthesize, .synthesizeWithReference,
             .createVoiceProfile, .addVoiceSample, .translateAudio:
            return .post
        case .getAudioFile, .getStats, .getVoiceProfile:
            return .get
        case .deleteVoiceProfile:
            return .delete
        case .updateVoiceProfileSettings:
            return .put
        }
    }

    var body: Encodable? {
        switch self {
        case .translate(let request):
            return request
        default:
            // Most endpoints use multipart/form-data, handled separately
            return nil
        }
    }

    var queryParameters: [String: Any]? {
        nil
    }

    var requiresAuth: Bool {
        // Audio endpoints use translator service which may have different auth
        // For now, we'll use API key or no auth
        switch self {
        case .getStats:
            return false
        default:
            return true
        }
    }

    // MARK: - Multipart Data Builders

    /// Get multipart parameters for transcription
    var transcriptionParams: (model: String?, language: String?)? {
        switch self {
        case .transcribe(let model, let language):
            return (model, language)
        default:
            return nil
        }
    }

    /// Get multipart parameters for TTS
    var ttsParams: (text: String, language: String, userId: String?)? {
        switch self {
            
        case .synthesize(let text, let language, let userId):
            return (text, language, userId)
        case .synthesizeWithReference(let text, let language):
            return (text, language, nil)
        default:
            return nil
        }
    }

    /// Get voice profile creation parameters
    var voiceProfileParams: (userId: String, language: String)? {
        switch self {
        case .createVoiceProfile(let userId, let language):
            return (userId, language)
        case .addVoiceSample(let userId, let language):
            return (userId, language)
        default:
            return nil
        }
    }

    /// Get audio translation request parameters
    var audioTranslationParams: AudioTranslationPipelineRequest? {
        switch self {
        case .translateAudio(let request):
            return request
        default:
            return nil
        }
    }
}

// MARK: - Request Models

/// Request for audio translation pipeline
struct AudioTranslationPipelineRequest: Codable {
    let messageId: String
    let sourceLanguage: String?
    let targetLanguage: String
    let userId: String?
    let enableVoiceCloning: Bool

    enum CodingKeys: String, CodingKey {
        case messageId = "message_id"
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
        case userId = "user_id"
        case enableVoiceCloning = "enable_voice_cloning"
    }
}

// MARK: - Audio API Configuration

struct AudioAPIConfiguration {
    /// Base URL for translator service (audio processing)
    /// Uses different port than main gateway
    static var translatorBaseURL: String {
        let config = EnvironmentConfig.shared
        // Translator service runs on port 8000
        let baseURL = config.activeURL
        if baseURL.contains(":3000") {
            return baseURL.replacingOccurrences(of: ":3000", with: ":8000")
        }
        // For production, assume translator is at same host with /translator path
        return baseURL + "/translator"
    }

    /// Timeout for audio processing (longer than normal API calls)
    static let processingTimeout: TimeInterval = 60.0

    /// Maximum audio file size for upload (50MB)
    static let maxAudioFileSize: Int = 50 * 1024 * 1024
}
