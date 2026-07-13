import Foundation

// MARK: - Login

public struct LoginRequest: Encodable {
    public let username: String
    public let password: String
    public let rememberDevice: Bool

    public init(username: String, password: String, rememberDevice: Bool = true) {
        self.username = username
        self.password = password
        self.rememberDevice = rememberDevice
    }
}

public struct LoginResponseData: Decodable, Sendable {
    public let user: MeeshyUser?
    public let token: String?
    public let sessionToken: String?
    public let expiresIn: Int?
    public let requires2FA: Bool?
    public let twoFactorToken: String?
}

// MARK: - Register

public struct RegisterRequest: Encodable, Sendable {
    public let username: String
    public let password: String
    public let firstName: String
    public let lastName: String
    public let email: String
    public let phoneNumber: String?
    public let phoneCountryCode: String?
    public let systemLanguage: String
    public let regionalLanguage: String

    public init(
        username: String,
        password: String,
        firstName: String,
        lastName: String,
        email: String,
        phoneNumber: String? = nil,
        phoneCountryCode: String? = nil,
        systemLanguage: String = "fr",
        regionalLanguage: String = "fr"
    ) {
        self.username = username
        self.password = password
        self.firstName = firstName
        self.lastName = lastName
        self.email = email
        self.phoneNumber = phoneNumber
        self.phoneCountryCode = phoneCountryCode
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
    }
}

// MARK: - Magic Link

public struct MagicLinkRequest: Encodable {
    public let email: String
    public let deviceFingerprint: String?

    public init(email: String, deviceFingerprint: String? = nil) {
        self.email = email
        self.deviceFingerprint = deviceFingerprint
    }
}

public struct MagicLinkResponse: Decodable {
    public let success: Bool
    public let message: String?
    public let expiresInSeconds: Int?
    public let error: String?
}

public struct MagicLinkValidateRequest: Encodable {
    public let token: String

    public init(token: String) {
        self.token = token
    }
}

// MARK: - Forgot Password

public struct ForgotPasswordRequest: Encodable {
    public let email: String

    public init(email: String) {
        self.email = email
    }
}

public struct ResetPasswordRequest: Encodable {
    public let token: String
    public let newPassword: String

    public init(token: String, newPassword: String) {
        self.token = token
        self.newPassword = newPassword
    }
}

// MARK: - Phone Verification

public struct SendPhoneCodeRequest: Encodable {
    public let phoneNumber: String

    public init(phoneNumber: String) {
        self.phoneNumber = phoneNumber
    }
}

public struct VerifyPhoneRequest: Encodable {
    public let phoneNumber: String
    public let code: String

    public init(phoneNumber: String, code: String) {
        self.phoneNumber = phoneNumber
        self.code = code
    }
}

public struct VerifyPhoneResponse: Decodable {
    public let verified: Bool?
    public let phoneTransferToken: String?
}

// MARK: - Email Verification

public struct VerifyEmailRequest: Encodable {
    public let code: String

    public init(code: String) {
        self.code = code
    }
}

public struct VerifyEmailCodeRequest: Encodable {
    public let code: String
    public let email: String

    public init(code: String, email: String) {
        self.code = code
        self.email = email
    }
}

public struct ResendVerificationRequest: Encodable {
    public let email: String

    public init(email: String) {
        self.email = email
    }
}


// MARK: - Availability Check

public struct AvailabilityResponse: Decodable {
    public let usernameAvailable: Bool?
    public let emailAvailable: Bool?
    public let phoneNumberAvailable: Bool?
    public let phoneNumberValid: Bool?
    public let suggestions: [String]?

    public var available: Bool {
        usernameAvailable ?? emailAvailable ?? phoneNumberAvailable ?? false
    }
}

// MARK: - Phone Ownership Check (récupération de compte)

public struct PhoneOwnerMaskedInfo: Decodable, Sendable, Equatable {
    public let displayName: String?
    public let username: String?
    public let email: String?
}

/// Réponse de `/auth/phone-transfer/check`. Quand `recoverySuggested` est vrai,
/// le numéro appartient à un compte dormant dont l'identité déclarée matche —
/// le client oriente alors vers la récupération de compte plutôt que la
/// création d'un doublon.
public struct PhoneOwnershipResponse: Decodable, Sendable, Equatable {
    public let exists: Bool
    public let maskedInfo: PhoneOwnerMaskedInfo?
    public let dormant: Bool?
    public let dormantSince: String?
    /// "exact" | "similar" | "different" | nil
    public let nameSimilarity: String?
    public let recoverySuggested: Bool?
}

// MARK: - Refresh Token

public struct RefreshTokenRequest: Encodable {
    public let token: String
    public let sessionToken: String?

    public init(token: String, sessionToken: String? = nil) {
        self.token = token
        self.sessionToken = sessionToken
    }
}

// MARK: - User Model

public struct MeeshyUser: Codable, Identifiable, Sendable {
    public let id: String
    public let username: String
    public let email: String?
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let bio: String?
    public let avatar: String?
    public let avatarThumbHash: String?
    public let banner: String?
    public let bannerThumbHash: String?
    public let role: String?
    public let systemLanguage: String?
    public let regionalLanguage: String?
    public let isOnline: Bool?
    public let lastActiveAt: String?
    public let createdAt: String?
    public let updatedAt: String?
    public let blockedUserIds: [String]?

    // Account status
    public let isActive: Bool?
    public let deactivatedAt: String?
    public let isAnonymous: Bool?
    public let isMeeshyer: Bool?
    public let phoneNumber: String?
    public let emailVerifiedAt: String?
    public let phoneVerifiedAt: String?

    // Translation preferences (from GET /users/:id)
    public let customDestinationLanguage: String?
    public let autoTranslateEnabled: Bool?

    /// Locale appareil propagée par le client (iOS `Locale.current.identifier`,
    /// web `Accept-Language`) et persistée serveur dans `User.deviceLocale`.
    ///
    /// 4e priorité Prisme Linguistique (`packages/shared/utils/conversation-helpers.ts`
    /// → `resolveUserLanguagesOrdered`). Optionnel — `nil` = client legacy
    /// n'ayant pas encore envoyé `X-Device-Locale`, l'app retombe alors sur les
    /// 3 préférences in-app + fallback `"fr"`.
    public let deviceLocale: String?

    // Profile enrichment
    public let timezone: String?
    public let registrationCountry: String?
    public let profileCompletionRate: Int?
    public let signalIdentityKeyPublic: String?

    // Voice profile (from GET /users/:id). Optional — rollout-safe: older
    // responses omit these fields, which decode to `nil` via synthesized Codable.
    public let voicePublic: Bool?
    public let voiceSampleUrl: String?
    public let voiceSampleDurationMs: Int?
    public let voiceQuality: Double?

    public init(
        id: String, username: String, email: String? = nil,
        firstName: String? = nil, lastName: String? = nil,
        displayName: String? = nil, bio: String? = nil,
        avatar: String? = nil, avatarThumbHash: String? = nil, banner: String? = nil, bannerThumbHash: String? = nil, role: String? = nil,
        systemLanguage: String? = nil, regionalLanguage: String? = nil,
        isOnline: Bool? = nil, lastActiveAt: String? = nil,
        createdAt: String? = nil, updatedAt: String? = nil,
        blockedUserIds: [String]? = nil,
        isActive: Bool? = nil, deactivatedAt: String? = nil,
        isAnonymous: Bool? = nil, isMeeshyer: Bool? = nil,
        phoneNumber: String? = nil,
        emailVerifiedAt: String? = nil, phoneVerifiedAt: String? = nil,
        customDestinationLanguage: String? = nil,
        autoTranslateEnabled: Bool? = nil,
        deviceLocale: String? = nil,
        timezone: String? = nil,
        registrationCountry: String? = nil,
        profileCompletionRate: Int? = nil,
        signalIdentityKeyPublic: String? = nil,
        voicePublic: Bool? = nil,
        voiceSampleUrl: String? = nil,
        voiceSampleDurationMs: Int? = nil,
        voiceQuality: Double? = nil
    ) {
        self.id = id
        self.username = username
        self.email = email
        self.firstName = firstName
        self.lastName = lastName
        self.displayName = displayName
        self.bio = bio
        self.avatar = avatar
        self.avatarThumbHash = avatarThumbHash
        self.banner = banner
        self.bannerThumbHash = bannerThumbHash
        self.role = role
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.blockedUserIds = blockedUserIds
        self.isActive = isActive
        self.deactivatedAt = deactivatedAt
        self.isAnonymous = isAnonymous
        self.isMeeshyer = isMeeshyer
        self.phoneNumber = phoneNumber
        self.emailVerifiedAt = emailVerifiedAt
        self.phoneVerifiedAt = phoneVerifiedAt
        self.customDestinationLanguage = customDestinationLanguage
        self.autoTranslateEnabled = autoTranslateEnabled
        self.deviceLocale = deviceLocale
        self.timezone = timezone
        self.registrationCountry = registrationCountry
        self.profileCompletionRate = profileCompletionRate
        self.signalIdentityKeyPublic = signalIdentityKeyPublic
        self.voicePublic = voicePublic
        self.voiceSampleUrl = voiceSampleUrl
        self.voiceSampleDurationMs = voiceSampleDurationMs
        self.voiceQuality = voiceQuality
    }

    /// Returns a new MeeshyUser with the specified profile fields replaced.
    /// `nil` arguments preserve the existing value (no erase) — matching the
    /// PATCH-style API contract used by the profile mutation endpoints.
    /// All other fields are carried over from `self`.
    public func withProfileChanges(
        displayName: String? = nil,
        bio: String? = nil,
        avatar: String? = nil,
        avatarThumbHash: String? = nil,
        banner: String? = nil,
        bannerThumbHash: String? = nil
    ) -> MeeshyUser {
        MeeshyUser(
            id: id, username: username, email: email,
            firstName: firstName, lastName: lastName,
            displayName: displayName ?? self.displayName,
            bio: bio ?? self.bio,
            avatar: avatar ?? self.avatar,
            avatarThumbHash: avatarThumbHash ?? self.avatarThumbHash,
            banner: banner ?? self.banner,
            bannerThumbHash: bannerThumbHash ?? self.bannerThumbHash,
            role: role,
            systemLanguage: systemLanguage, regionalLanguage: regionalLanguage,
            isOnline: isOnline, lastActiveAt: lastActiveAt,
            createdAt: createdAt, updatedAt: updatedAt,
            blockedUserIds: blockedUserIds,
            isActive: isActive, deactivatedAt: deactivatedAt,
            isAnonymous: isAnonymous, isMeeshyer: isMeeshyer,
            phoneNumber: phoneNumber,
            emailVerifiedAt: emailVerifiedAt, phoneVerifiedAt: phoneVerifiedAt,
            customDestinationLanguage: customDestinationLanguage,
            autoTranslateEnabled: autoTranslateEnabled,
            deviceLocale: deviceLocale,
            timezone: timezone,
            registrationCountry: registrationCountry,
            profileCompletionRate: profileCompletionRate,
            signalIdentityKeyPublic: signalIdentityKeyPublic,
            voicePublic: voicePublic,
            voiceSampleUrl: voiceSampleUrl,
            voiceSampleDurationMs: voiceSampleDurationMs,
            voiceQuality: voiceQuality
        )
    }

    /// Ordered list of preferred content languages for the Prisme Linguistique.
    /// Resolution order (extended 2026-05-26):
    /// 1. `systemLanguage`             — primary in-app preference
    /// 2. `regionalLanguage`           — secondary in-app preference
    /// 3. `customDestinationLanguage`  — per-conversation override
    /// 4. `deviceLocale`               — OS-level locale (4th priority)
    /// 5. `"fr"`                       — ultimate fallback when everything is `nil`
    ///
    /// System / regional / custom languages preserve their original casing so
    /// downstream consumers that match against language tags case-sensitively
    /// keep working. `deviceLocale` is normalised via `normalizeLanguageCode`
    /// because it arrives as `"fr_FR"` / `"zh-Hant-HK"` and needs to collapse
    /// to ISO 639-1 for NLLB-200 matching. Dedup is case-insensitive so a
    /// device locale that resolves to an already-listed code is dropped.
    public var preferredContentLanguages: [String] {
        var preferred: [String] = []
        let appendIfDistinct: (String?) -> Void = { code in
            guard let code, !code.isEmpty else { return }
            if preferred.contains(where: { $0.caseInsensitiveCompare(code) == .orderedSame }) {
                return
            }
            preferred.append(code)
        }
        appendIfDistinct(systemLanguage)
        appendIfDistinct(regionalLanguage)
        appendIfDistinct(customDestinationLanguage)
        appendIfDistinct(Self.normalizeLanguageCode(deviceLocale))
        if preferred.isEmpty {
            preferred.append("fr")
        }
        return preferred
    }

    /// Normalise un identifier de langue vers un code supporté par Meeshy.
    ///
    /// Préserve les codes supportés tels quels — y compris les codes ISO 639-3
    /// des langues sans équivalent 639-1 (`"bas"`, `"dua"`, `"ewo"`), qui NE
    /// doivent jamais être tronqués à 2 lettres (`"bas"` → `"ba"` = Bachkir,
    /// langue sans rapport, casserait la résolution du Prisme Linguistique).
    /// Un ISO 639-3 sans entrée Meeshy est réduit à son préfixe 2-lettres
    /// uniquement si ce préfixe est lui-même supporté (`"eng"` → `"en"`) ;
    /// sinon il est rejeté (`nil`) plutôt que corrompu (`"spa"` → `"sp"` ≠ `"es"`).
    ///
    /// Miroir Swift de `normalizeLanguageCode` :
    /// - `packages/shared/utils/language-normalize.ts` (source de vérité TS)
    /// - `ConversationLanguagePreferences.normalize` (app iOS)
    ///
    /// Toute évolution de la logique de normalisation DOIT toucher les trois
    /// sites pour préserver la symétrie cross-platform.
    public static func normalizeLanguageCode(_ input: String?) -> String? {
        guard let raw = input?.trimmingCharacters(in: .whitespacesAndNewlines),
              raw.count >= 2 else { return nil }
        let primary = raw
            .split(whereSeparator: { $0 == "-" || $0 == "_" })
            .first?
            .lowercased() ?? ""
        guard primary.count >= 2,
              primary.allSatisfy({ $0.isLetter && $0.isASCII }) else {
            return nil
        }

        // Un code supporté (2 ou 3 lettres, ex. "bas") est renvoyé tel quel.
        if LanguageData.supportedCodeSet.contains(primary) {
            return primary
        }

        // ISO 639-3 sans entrée Meeshy : réduction 2-lettres si supportée.
        if primary.count > 2 {
            let twoLetter = String(primary.prefix(2))
            return LanguageData.supportedCodeSet.contains(twoLetter) ? twoLetter : nil
        }

        // Code 2-lettres inconnu : conservé (comportement historique).
        return primary
    }
}

// MARK: - /auth/me Response

public struct MeResponseData: Decodable {
    public let user: MeeshyUser
}

// MARK: - Saved Account (multi-account support)

public struct SavedAccount: Codable, Identifiable, Sendable {
    public let id: String         // userId
    public let username: String
    public let displayName: String?
    public let avatarURL: String?
    public let lastActiveAt: Date

    public var shortName: String { displayName ?? username }

    public init(id: String, username: String, displayName: String?, avatarURL: String?, lastActiveAt: Date) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.lastActiveAt = lastActiveAt
    }
}

// MARK: - CacheIdentifiable Conformance

extension MeeshyUser: CacheIdentifiable {}
