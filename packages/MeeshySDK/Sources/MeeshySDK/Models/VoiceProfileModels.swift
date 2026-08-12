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

// MARK: - Voice Profile — Gateway wire format (`GET /voice/profile`)

/// Réponse brute de `GET /voice/profile` (schema `VoiceProfileDetails`,
/// `services/gateway/src/routes/voice-profile.ts`). Le gateway modélise UN
/// profil unique (créé via `/register`, recalibré via `PUT /:profileId`) — pas
/// de collection d'échantillons. Les noms de champs diffèrent du domaine iOS
/// (`qualityScore` 0-100, `audioCount`, `audioDurationMs`, `version`,
/// `needsCalibration`), d'où le mapping `toDomain()` vers `VoiceProfile`.
/// Quand aucun profil n'existe, le gateway renvoie quand même un objet avec
/// `exists: false` (jamais 404) — le mapping le convertit en `nil` côté app.
public struct VoiceProfileDetails: Decodable, Sendable {
    public let profileId: String?
    public let userId: String
    public let exists: Bool
    public let qualityScore: Double
    public let audioDurationMs: Int
    public let audioCount: Int
    public let version: Int
    public let createdAt: Date?
    public let updatedAt: Date?
    public let expiresAt: Date?
    public let needsCalibration: Bool

    enum CodingKeys: String, CodingKey {
        case profileId, userId, exists, qualityScore, audioDurationMs, audioCount, version, createdAt, updatedAt, expiresAt, needsCalibration
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        profileId = try c.decodeIfPresent(String.self, forKey: .profileId)
        userId = try c.decodeIfPresent(String.self, forKey: .userId) ?? ""
        exists = try c.decodeIfPresent(Bool.self, forKey: .exists) ?? (try c.decodeIfPresent(String.self, forKey: .profileId) != nil)
        qualityScore = try c.decodeIfPresent(Double.self, forKey: .qualityScore) ?? 0
        audioDurationMs = try c.decodeIfPresent(Int.self, forKey: .audioDurationMs) ?? 0
        audioCount = try c.decodeIfPresent(Int.self, forKey: .audioCount) ?? 0
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 0
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        needsCalibration = try c.decodeIfPresent(Bool.self, forKey: .needsCalibration) ?? false
    }

    /// Mappe la forme gateway vers le modèle domaine iOS. Retourne `nil`
    /// quand aucun profil n'existe (`exists == false`), pour que les vues
    /// (`if let profile`) affichent l'état vide. `qualityScore` est déjà sur une
    /// échelle 0-1 dans les données réelles (ex. `0.5`, malgré le « 0-100 » du
    /// schema OpenAPI) — l'UI le multiplie par 100 pour l'affichage `%`, donc on
    /// le passe tel quel, en tolérant une valeur 0-100 héritée (division si
    /// > 1). Le statut est dérivé (`needsCalibration` → `.expired`, sinon
    /// `.ready`) faute d'enum côté gateway. `audioCount` alimente `sampleCount`,
    /// `audioDurationMs` la durée.
    public func toDomain() -> VoiceProfile? {
        guard exists else { return nil }
        let status: VoiceProfileStatus = needsCalibration ? .expired : .ready
        let normalizedQuality: Double? = qualityScore <= 0 ? nil
            : (qualityScore > 1 ? qualityScore / 100.0 : qualityScore)
        return VoiceProfile(
            id: profileId ?? "",
            userId: userId,
            status: status,
            sampleCount: audioCount,
            totalDurationMs: audioDurationMs,
            quality: normalizedQuality,
            createdAt: createdAt ?? Date(timeIntervalSince1970: 0),
            updatedAt: updatedAt ?? Date(timeIntervalSince1970: 0),
            lastUsedAt: nil
        )
    }
}

/// Réponse de `POST /voice/profile/register` — création du profil à partir
/// d'un audio (≥ 10 s). `qualityScore` 0-100. `needsCalibration` invite à
/// enrichir via `PUT /:profileId`.
public struct VoiceProfileRegisterResponse: Decodable, Sendable {
    public let profileId: String
    public let qualityScore: Double
    public let audioDurationMs: Int
    public let needsCalibration: Bool
    public let expiresAt: Date?

    enum CodingKeys: String, CodingKey {
        case profileId, qualityScore, audioDurationMs, needsCalibration, expiresAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        profileId = try c.decodeIfPresent(String.self, forKey: .profileId) ?? ""
        qualityScore = try c.decodeIfPresent(Double.self, forKey: .qualityScore) ?? 0
        audioDurationMs = try c.decodeIfPresent(Int.self, forKey: .audioDurationMs) ?? 0
        needsCalibration = try c.decodeIfPresent(Bool.self, forKey: .needsCalibration) ?? false
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
    }
}

/// Corps de `POST /voice/profile/register` et `PUT /voice/profile/:profileId`
/// (mode JSON base64). `audioFormat` ∈ {wav, mp3, ogg, webm, m4a}.
public struct VoiceProfileAudioRequest: Encodable {
    public let audioData: String
    public let audioFormat: String

    public init(audioData: Data, audioFormat: String) {
        self.audioData = audioData.base64EncodedString()
        self.audioFormat = audioFormat
    }
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
