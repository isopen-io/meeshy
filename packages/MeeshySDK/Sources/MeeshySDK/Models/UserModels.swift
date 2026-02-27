import Foundation

public struct UpdateProfileRequest: Encodable {
    public var firstName: String?
    public var lastName: String?
    public var displayName: String?
    public var bio: String?
    public var systemLanguage: String?
    public var regionalLanguage: String?
    public var customDestinationLanguage: String?

    public init(firstName: String? = nil, lastName: String? = nil, displayName: String? = nil,
                bio: String? = nil, systemLanguage: String? = nil, regionalLanguage: String? = nil,
                customDestinationLanguage: String? = nil) {
        self.firstName = firstName; self.lastName = lastName; self.displayName = displayName
        self.bio = bio; self.systemLanguage = systemLanguage; self.regionalLanguage = regionalLanguage
        self.customDestinationLanguage = customDestinationLanguage
    }
}

public struct UpdateProfileResponse: Decodable {
    public let user: MeeshyUser
}

// MARK: - Contact Change

public struct ChangeEmailRequest: Encodable {
    public let newEmail: String
    public init(newEmail: String) { self.newEmail = newEmail }
}

public struct ChangeEmailResponse: Decodable {
    public let message: String
    public let pendingEmail: String
}

public struct VerifyEmailChangeRequest: Encodable {
    public let token: String
    public init(token: String) { self.token = token }
}

public struct VerifyEmailChangeResponse: Decodable {
    public let message: String
    public let newEmail: String
}

public struct ChangePhoneRequest: Encodable {
    public let newPhoneNumber: String
    public init(newPhoneNumber: String) { self.newPhoneNumber = newPhoneNumber }
}

public struct ChangePhoneResponse: Decodable {
    public let message: String
    public let pendingPhoneNumber: String
}

public struct VerifyPhoneChangeRequest: Encodable {
    public let code: String
    public init(code: String) { self.code = code }
}

public struct VerifyPhoneChangeResponse: Decodable {
    public let message: String
    public let newPhoneNumber: String
}
