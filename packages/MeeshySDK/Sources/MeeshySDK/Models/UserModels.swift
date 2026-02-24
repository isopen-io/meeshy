import Foundation

public struct UpdateProfileRequest: Encodable {
    public var firstName: String?
    public var lastName: String?
    public var displayName: String?
    public var bio: String?
    public var systemLanguage: String?
    public var regionalLanguage: String?
    public var email: String?
    public var phoneNumber: String?
    public var customDestinationLanguage: String?

    public init(firstName: String? = nil, lastName: String? = nil, displayName: String? = nil,
                bio: String? = nil, systemLanguage: String? = nil, regionalLanguage: String? = nil,
                email: String? = nil, phoneNumber: String? = nil, customDestinationLanguage: String? = nil) {
        self.firstName = firstName; self.lastName = lastName; self.displayName = displayName
        self.bio = bio; self.systemLanguage = systemLanguage; self.regionalLanguage = regionalLanguage
        self.email = email; self.phoneNumber = phoneNumber; self.customDestinationLanguage = customDestinationLanguage
    }
}

public struct UpdateProfileResponse: Decodable {
    public let user: MeeshyUser
}
