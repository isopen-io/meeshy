import Foundation

public struct RegisterDeviceTokenRequest: Encodable {
    public let token: String
    public let platform: String
    public let type: String

    public init(token: String, platform: String = "ios", type: String = "apns") {
        self.token = token; self.platform = platform; self.type = type
    }
}

public struct UnregisterDeviceTokenRequest: Encodable {
    public let token: String

    public init(token: String) {
        self.token = token
    }
}

public struct RegisterDeviceTokenResponse: Decodable {
    public let id: String?
    public let type: String?
    public let platform: String?
    public let deviceName: String?
    public let isNew: Bool?
    public let message: String?
}

public struct NotificationPreferences: Codable {
    public var pushEnabled: Bool
    public var messageNotifications: Bool
    public var socialNotifications: Bool
    public var soundEnabled: Bool

    public init(pushEnabled: Bool = true, messageNotifications: Bool = true,
                socialNotifications: Bool = true, soundEnabled: Bool = true) {
        self.pushEnabled = pushEnabled; self.messageNotifications = messageNotifications
        self.socialNotifications = socialNotifications; self.soundEnabled = soundEnabled
    }
}
