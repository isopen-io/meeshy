import Foundation

// MARK: - Notification Delivery

public struct NotificationDelivery: Codable, Sendable, Equatable {
    public let emailSent: Bool
    public let pushSent: Bool
}
