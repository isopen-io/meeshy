import Foundation

// MARK: - Voice Profile Consent

public struct VoiceConsentStatus: Decodable {
    public let hasConsent: Bool
    public let consentedAt: Date?
    public let ageVerified: Bool
    public let ageVerifiedAt: Date?
    public let voiceCloningEnabled: Bool
    public let voiceCloningEnabledAt: Date?
}

public struct VoiceConsentRequest: Encodable {
    public let consentGiven: Bool
    public let ageVerification: Bool
    public let birthDate: String?

    public init(consentGiven: Bool, ageVerification: Bool, birthDate: String? = nil) {
        self.consentGiven = consentGiven
        self.ageVerification = ageVerification
        self.birthDate = birthDate
    }
}

public struct VoiceConsentResponse: Decodable {
    public let success: Bool
    public let consentedAt: Date?
}

// MARK: - Voice Profile

public struct VoiceProfile: Identifiable, Decodable {
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

public enum VoiceProfileStatus: String, Decodable, CaseIterable {
    case pending
    case processing
    case ready
    case failed
    case expired
}

// MARK: - Voice Sample

public struct VoiceSample: Identifiable, Decodable {
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

public struct VoiceSampleUploadResponse: Decodable {
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
