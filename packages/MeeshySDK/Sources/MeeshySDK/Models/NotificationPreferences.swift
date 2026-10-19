import Foundation

// MARK: - Notification Preferences

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
