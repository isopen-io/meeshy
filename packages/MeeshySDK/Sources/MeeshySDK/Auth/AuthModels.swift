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

public struct LoginResponseData: Decodable {
    public let user: MeeshyUser
    public let token: String
    public let sessionToken: String?
    public let expiresIn: Int?
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

// MARK: - Refresh Token

public struct RefreshTokenRequest: Encodable {
    public let token: String

    public init(token: String) {
        self.token = token
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
    public let banner: String?
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

    // Profile enrichment
    public let timezone: String?
    public let registrationCountry: String?
    public let profileCompletionRate: Int?
    public let signalIdentityKeyPublic: String?

    public init(
        id: String, username: String, email: String? = nil,
        firstName: String? = nil, lastName: String? = nil,
        displayName: String? = nil, bio: String? = nil,
        avatar: String? = nil, banner: String? = nil, role: String? = nil,
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
        timezone: String? = nil,
        registrationCountry: String? = nil,
        profileCompletionRate: Int? = nil,
        signalIdentityKeyPublic: String? = nil
    ) {
        self.id = id
        self.username = username
        self.email = email
        self.firstName = firstName
        self.lastName = lastName
        self.displayName = displayName
        self.bio = bio
        self.avatar = avatar
        self.banner = banner
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
        self.timezone = timezone
        self.registrationCountry = registrationCountry
        self.profileCompletionRate = profileCompletionRate
        self.signalIdentityKeyPublic = signalIdentityKeyPublic
    }

    /// Ordered list of preferred content languages for the Prisme Linguistique.
    /// Prisme Linguistique resolution order: customDestinationLanguage → systemLanguage → regionalLanguage → "fr"
    /// Device locale (Locale.current) is NEVER included — it is the UI language, not content.
    public var preferredContentLanguages: [String] {
        var preferred: [String] = []
        if let custom = customDestinationLanguage {
            preferred.append(custom)
        }
        if let sys = systemLanguage, !preferred.contains(where: { $0.caseInsensitiveCompare(sys) == .orderedSame }) {
            preferred.append(sys)
        }
        if let reg = regionalLanguage, !preferred.contains(where: { $0.caseInsensitiveCompare(reg) == .orderedSame }) {
            preferred.append(reg)
        }
        if preferred.isEmpty {
            preferred.append("fr")
        }
        return preferred
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
