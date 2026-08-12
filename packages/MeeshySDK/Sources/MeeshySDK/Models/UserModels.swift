import Foundation

public struct UpdateProfileRequest: Encodable {
    public var firstName: String?
    public var lastName: String?
    public var displayName: String?
    public var bio: String?
    public var systemLanguage: String?
    public var regionalLanguage: String?
    public var customDestinationLanguage: String?
    public var voicePublic: Bool?

    private static func validateLanguageCode(_ code: String?) -> String? {
        guard let code = code?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else {
            return nil
        }
        // Extract 2-letter base language code if it's formatted as "fr-FR" or similar
        let baseCode = String(code.split(separator: "-").first ?? "")
        guard !baseCode.isEmpty, LanguageData.info(for: baseCode) != nil else {
            return nil
        }
        return baseCode
    }

    public init(firstName: String? = nil, lastName: String? = nil, displayName: String? = nil,
                bio: String? = nil, systemLanguage: String? = nil, regionalLanguage: String? = nil,
                customDestinationLanguage: String? = nil, voicePublic: Bool? = nil) {
        self.firstName = firstName
        self.lastName = lastName
        self.displayName = displayName
        self.bio = bio
        self.systemLanguage = Self.validateLanguageCode(systemLanguage)
        self.regionalLanguage = Self.validateLanguageCode(regionalLanguage)
        // The gateway's `customDestinationLanguage` schema explicitly accepts an
        // empty string as "clear this field" (`z.union([z.literal(''), z.null(),
        // z.string().min(2).max(5)])` in packages/shared/utils/validation.ts) —
        // unlike systemLanguage/regionalLanguage, which require a real code with
        // no empty-string variant. Preserving that exact signal (instead of
        // collapsing it to nil via validateLanguageCode) is what lets a caller
        // distinguish "field untouched" (nil — omitted from the PATCH body) from
        // "field intentionally cleared" (empty string — sent verbatim).
        self.customDestinationLanguage = customDestinationLanguage == ""
            ? ""
            : Self.validateLanguageCode(customDestinationLanguage)
        self.voicePublic = voicePublic
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
