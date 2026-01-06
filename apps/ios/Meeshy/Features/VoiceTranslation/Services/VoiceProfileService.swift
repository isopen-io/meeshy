//
//  VoiceProfileService.swift
//  Meeshy
//
//  Service for managing user voice profiles
//  Voice profiles improve over time with more audio samples
//

import Foundation
import os.log
import Combine

// MARK: - Voice Profile Service

/// Service for managing user voice profiles
/// Handles: profile creation, improvement, and settings
@MainActor
final class VoiceProfileService: ObservableObject {

    // MARK: - Singleton

    static let shared = VoiceProfileService()

    // MARK: - State

    @Published private(set) var currentProfile: VoiceProfile?
    @Published private(set) var profileStats: VoiceProfileStats?
    @Published private(set) var recommendations: [VoiceProfileRecommendation] = []
    @Published private(set) var isLoading = false
    @Published private(set) var lastError: VoiceProfileError?

    // MARK: - Dependencies

    private let cacheService = AudioCacheService.shared
    private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Meeshy", category: "VoiceProfileService")

    // MARK: - Constants

    private let minSamplesForGoodQuality = 5
    private let minSecondsForGoodQuality: Double = 30
    private let optimalSecondsForBestQuality: Double = 180 // 3 minutes

    // MARK: - Init

    private init() {}

    // MARK: - Load Profile

    /// Load the current user's voice profile
    func loadProfile() async throws {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        logger.info("[VoiceProfile] Loading profile...")

        // Check cache first
        if let userId = AuthService.shared.currentUserId,
           let cached = await cacheService.getCachedVoiceProfile(userId: userId) {
            currentProfile = cached
            logger.info("[VoiceProfile] Loaded from cache")
        }

        // Fetch from server
        let response: VoiceProfileResponse = try await APIService.shared.get(
            endpoint: "/api/voice/profile"
        )

        currentProfile = response.profile
        profileStats = response.stats
        recommendations = response.recommendations

        // Update cache
        if let profile = response.profile {
            await cacheService.cacheVoiceProfile(profile)
        }

        logger.info("[VoiceProfile] Loaded - quality: \(self.profileQualityLevel.displayName)")
    }

    // MARK: - Create Profile

    /// Create initial voice profile from audio sample
    /// - Parameters:
    ///   - audioURL: URL to audio file (10-30 seconds recommended)
    ///   - language: Language spoken in the sample
    /// - Returns: Created voice profile
    func createProfile(
        audioURL: URL,
        language: String
    ) async throws -> VoiceProfile {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        logger.info("[VoiceProfile] Creating profile with \(language) sample")

        let response: VoiceProfileResponse = try await APIService.shared.uploadMultipart(
            endpoint: "/api/voice/profile",
            file: audioURL,
            fileKey: "audioSample",
            parameters: ["language": language]
        )

        guard let profile = response.profile else {
            let error = VoiceProfileError.creationFailed("No profile returned")
            lastError = error
            throw error
        }

        currentProfile = profile
        profileStats = response.stats
        recommendations = response.recommendations

        await cacheService.cacheVoiceProfile(profile)

        logger.info("[VoiceProfile] Created with quality score: \(profile.qualityScore)")

        return profile
    }

    // MARK: - Add Sample

    /// Add audio sample to improve voice profile
    /// Each sample improves the voice cloning quality
    /// - Parameters:
    ///   - audioURL: URL to audio file
    ///   - language: Language spoken in the sample
    /// - Returns: Response with updated profile and improvement metrics
    func addSample(
        audioURL: URL,
        language: String
    ) async throws -> AddVoiceSampleResponse {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        logger.info("[VoiceProfile] Adding sample in \(language)")

        let response: AddVoiceSampleResponse = try await APIService.shared.uploadMultipart(
            endpoint: "/api/voice/profile/samples",
            file: audioURL,
            fileKey: "audioSample",
            parameters: ["language": language]
        )

        currentProfile = response.profile
        recommendations = response.recommendations

        // Invalidate old cache and store new
        await cacheService.invalidateVoiceProfile(userId: response.profile.userId)
        await cacheService.cacheVoiceProfile(response.profile)

        logger.info("[VoiceProfile] Sample added - improvement: +\(String(format: "%.1f%%", response.qualityImprovement * 100))")

        return response
    }

    // MARK: - Update Settings

    /// Update voice profile settings
    /// - Parameters:
    ///   - isActive: Enable/disable voice cloning
    ///   - preferredLanguages: Languages the user speaks
    func updateSettings(
        isActive: Bool? = nil,
        preferredLanguages: [String]? = nil
    ) async throws {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        let request = VoiceProfileSettingsRequest(
            isActive: isActive,
            preferredLanguages: preferredLanguages
        )

        let response: VoiceProfileResponse = try await APIService.shared.put(
            endpoint: "/api/voice/profile/settings",
            body: request
        )

        currentProfile = response.profile

        if let profile = response.profile {
            await cacheService.cacheVoiceProfile(profile)
        }

        logger.info("[VoiceProfile] Settings updated")
    }

    // MARK: - Toggle Voice Cloning

    /// Quick toggle for voice cloning on/off
    func toggleVoiceCloning() async throws {
        guard let profile = currentProfile else {
            throw VoiceProfileError.noProfile
        }

        try await updateSettings(isActive: !profile.isActive)
    }

    // MARK: - Delete Profile

    /// Delete the user's voice profile
    func deleteProfile() async throws {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        logger.info("[VoiceProfile] Deleting profile")

        try await APIService.shared.delete(endpoint: "/api/voice/profile")

        if let userId = currentProfile?.userId {
            await cacheService.invalidateVoiceProfile(userId: userId)
        }

        currentProfile = nil
        profileStats = nil
        recommendations = []

        logger.info("[VoiceProfile] Deleted")
    }

    // MARK: - Quality Helpers

    /// Current quality level of the voice profile
    var profileQualityLevel: ProfileQualityLevel {
        guard let profile = currentProfile else { return .none }
        return profile.qualityLevel
    }

    /// Whether the profile can be improved with more samples
    var canImprove: Bool {
        guard let profile = currentProfile else { return true }
        return profile.canImprove
    }

    /// Progress towards good quality (0-1)
    var progressToGood: Double {
        guard let profile = currentProfile else { return 0 }
        return profile.progressToGood
    }

    /// Progress towards excellent quality (0-1)
    var progressToExcellent: Double {
        guard let profile = currentProfile else { return 0 }
        return profile.progressToExcellent
    }

    /// Whether voice cloning is enabled and available
    var isVoiceCloningEnabled: Bool {
        guard let profile = currentProfile else { return false }
        return profile.isActive && profile.qualityLevel >= .basic
    }

    /// Human-readable status of voice cloning
    var voiceCloningStatus: String {
        guard let profile = currentProfile else {
            return "No voice profile. Record audio to enable voice cloning."
        }

        if !profile.isActive {
            return "Voice cloning is disabled in settings."
        }

        switch profile.qualityLevel {
        case .none:
            return "Record audio to create your voice profile."
        case .basic:
            return "Voice cloning available. Add more samples to improve quality."
        case .good:
            return "Good voice cloning quality. Add more samples for best results."
        case .excellent:
            return "Excellent voice cloning quality!"
        }
    }

    // MARK: - Sample Recommendations

    /// Get recommendation for next action
    var nextAction: String? {
        if currentProfile == nil {
            return "Record your first audio message to create a voice profile."
        }

        if let firstRecommendation = recommendations.first {
            return firstRecommendation.message
        }

        return nil
    }

    /// Recommended audio duration for next sample
    var recommendedSampleDuration: TimeInterval {
        guard let profile = currentProfile else {
            return 15 // First sample should be 15 seconds
        }

        // Longer samples are better for improvement
        if profile.totalAudioSeconds < 30 {
            return 20
        } else if profile.totalAudioSeconds < 60 {
            return 30
        } else {
            return 15 // Once we have enough, shorter samples are fine
        }
    }
}

// MARK: - Errors

enum VoiceProfileError: LocalizedError {
    case creationFailed(String)
    case updateFailed(String)
    case noProfile
    case audioTooShort
    case audioTooLong
    case networkError(String)

    var errorDescription: String? {
        switch self {
        case .creationFailed(let reason):
            return "Failed to create voice profile: \(reason)"
        case .updateFailed(let reason):
            return "Failed to update voice profile: \(reason)"
        case .noProfile:
            return "No voice profile exists. Record audio to create one."
        case .audioTooShort:
            return "Audio sample is too short. Please record at least 5 seconds."
        case .audioTooLong:
            return "Audio sample is too long. Maximum 60 seconds."
        case .networkError(let reason):
            return "Network error: \(reason)"
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .creationFailed:
            return "Try recording a clear audio sample with minimal background noise."
        case .updateFailed:
            return "Check your internet connection and try again."
        case .noProfile:
            return "Send an audio message to automatically create your voice profile."
        case .audioTooShort:
            return "Record a longer sample (10-30 seconds recommended)."
        case .audioTooLong:
            return "Record a shorter sample (up to 60 seconds)."
        case .networkError:
            return "Check your internet connection and try again."
        }
    }
}

// MARK: - Auth Service Stub (Reference)

/// Stub for auth service - replace with actual implementation
private enum AuthService {
    static let shared = AuthServiceShared()

    class AuthServiceShared {
        var currentUserId: String? {
            // Get from actual auth service
            UserDefaults.standard.string(forKey: "currentUserId")
        }
    }
}
