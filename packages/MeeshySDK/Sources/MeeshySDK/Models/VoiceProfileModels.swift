import Foundation

// MARK: - Voice Profile Consent

/// Statut de consentement vocal — miroir du wire format gateway
/// `GET /voice-profile/consent` : le schema de réponse Fastify ne sérialise
/// QUE les trois timestamps ; les booléens sont dérivés côté client.
public struct VoiceConsentStatus: Decodable, Sendable {
    public let voiceRecordingConsentAt: Date?
    public let voiceCloningEnabledAt: Date?
    public let ageVerificationConsentAt: Date?

    public var hasConsent: Bool { voiceRecordingConsentAt != nil }
    public var consentedAt: Date? { voiceRecordingConsentAt }
    public var ageVerified: Bool { ageVerificationConsentAt != nil }
    public var ageVerifiedAt: Date? { ageVerificationConsentAt }
    public var voiceCloningEnabled: Bool { voiceCloningEnabledAt != nil }

    public init(
        voiceRecordingConsentAt: Date? = nil,
        voiceCloningEnabledAt: Date? = nil,
        ageVerificationConsentAt: Date? = nil
    ) {
        self.voiceRecordingConsentAt = voiceRecordingConsentAt
        self.voiceCloningEnabledAt = voiceCloningEnabledAt
        self.ageVerificationConsentAt = ageVerificationConsentAt
    }
}

/// Corps de `POST /voice-profile/consent` — wire format gateway
/// (`VoiceProfileConsentRequest`, `packages/shared/types/voice-api.ts`) :
/// `voiceRecordingConsent` est REQUIS ; `voiceCloningConsent` active en plus
/// la traduction vocale utilisant le profil (`voiceCloningEnabledAt`).
public struct VoiceConsentRequest: Encodable {
    public let voiceRecordingConsent: Bool
    public let voiceCloningConsent: Bool?
    public let birthDate: String?

    public init(voiceRecordingConsent: Bool, voiceCloningConsent: Bool? = nil, birthDate: String? = nil) {
        self.voiceRecordingConsent = voiceRecordingConsent
        self.voiceCloningConsent = voiceCloningConsent
        self.birthDate = birthDate
    }
}

/// Réponse de `POST /voice-profile/consent` — mêmes trois timestamps que le
/// statut (le `success` est porté par l'enveloppe `APIResponse`).
public struct VoiceConsentResponse: Decodable, Sendable {
    public let voiceRecordingConsentAt: Date?
    public let voiceCloningEnabledAt: Date?
    public let ageVerificationConsentAt: Date?

    public var consentedAt: Date? { voiceRecordingConsentAt }
}

// MARK: - Voice Profile

public struct VoiceProfile: Identifiable, Decodable, Sendable {
    public let id: String
    public let userId: String
    public let status: VoiceProfileStatus
    public let sampleCount: Int
    public let totalDurationMs: Int
    public let quality: Double?
    public let createdAt: Date
    public let updatedAt: Date
    public let lastUsedAt: Date?

    public var isReady: Bool {
        status == .ready
    }

    public var totalDurationSeconds: Int {
        totalDurationMs / 1000
    }
}

public enum VoiceProfileStatus: String, Decodable, CaseIterable, Sendable {
    case pending
    case processing
    case ready
    case failed
    case expired
}

// MARK: - Voice Sample

public struct VoiceSample: Identifiable, Decodable, Sendable {
    public let id: String
    public let profileId: String
    public let durationMs: Int
    public let fileUrl: String?
    public let status: String
    public let createdAt: Date

    public var durationSeconds: Int {
        durationMs / 1000
    }
}

// MARK: - Voice Profile Upload

public struct VoiceSampleUploadResponse: Decodable, Sendable {
    public let sampleId: String
    public let profileId: String
    public let durationMs: Int
    public let sampleCount: Int
}

// MARK: - Voice Profile Wizard State

public enum VoiceProfileWizardStep: Int, CaseIterable {
    case consent
    case ageVerification
    case recording
    case processing
    case complete
}

// MARK: - Voice Cloning Toggle

public struct VoiceCloningToggleRequest: Encodable {
    public let enabled: Bool

    public init(enabled: Bool) {
        self.enabled = enabled
    }
}

// MARK: - GDPR Delete

public struct VoiceProfileDeleteResponse: Decodable {
    public let deleted: Bool
    public let samplesDeleted: Int?
}
