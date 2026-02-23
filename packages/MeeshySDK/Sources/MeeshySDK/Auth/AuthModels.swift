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

public struct RegisterRequest: Encodable {
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

// MARK: - Availability Check

public struct AvailabilityResponse: Decodable {
    public let available: Bool
    public let suggestions: [String]?
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
    public let role: String?
    public let systemLanguage: String?
    public let regionalLanguage: String?
    public let isOnline: Bool?
    public let lastActiveAt: String?
    public let createdAt: String?
    public let blockedUserIds: [String]?

    public init(
        id: String, username: String, email: String? = nil,
        firstName: String? = nil, lastName: String? = nil,
        displayName: String? = nil, bio: String? = nil,
        avatar: String? = nil, role: String? = nil,
        systemLanguage: String? = nil, regionalLanguage: String? = nil,
        isOnline: Bool? = nil, lastActiveAt: String? = nil,
        createdAt: String? = nil, blockedUserIds: [String]? = nil
    ) {
        self.id = id
        self.username = username
        self.email = email
        self.firstName = firstName
        self.lastName = lastName
        self.displayName = displayName
        self.bio = bio
        self.avatar = avatar
        self.role = role
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
        self.createdAt = createdAt
        self.blockedUserIds = blockedUserIds
    }
}

// MARK: - /auth/me Response

public struct MeResponseData: Decodable {
    public let user: MeeshyUser
}
