import Foundation
import Combine
import UserNotifications
import UIKit
import os

private let logger = Logger(subsystem: "com.meeshy.app", category: "push")

@MainActor
public final class PushNotificationManager: NSObject, ObservableObject {
    public static let shared = PushNotificationManager()

    @Published public var isAuthorized = false
    @Published public var deviceToken: String?

    /// Published notification payload when user taps a notification.
    /// The app layer observes this to perform navigation.
    @Published public var pendingNotificationPayload: NotificationPayload?

    private static let persistedTokenKey = "com.meeshy.push.deviceToken"

    private override init() {
        super.init()
        deviceToken = UserDefaults.standard.string(forKey: Self.persistedTokenKey)
    }

    // MARK: - Permission

    /// Request notification permission and register for remote notifications. Returns true if granted.
    public func requestPermission() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            isAuthorized = granted
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
                logger.info("Push permission granted, registering for remote notifications")
            } else {
                logger.info("Push permission denied by user")
            }
            return granted
        } catch {
            logger.error("Push permission request failed: \(error.localizedDescription)")
            isAuthorized = false
            return false
        }
    }

    /// Check current authorization status without prompting.
    public func checkAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized
            || settings.authorizationStatus == .provisional
    }

    // MARK: - Device Token

    /// Convert raw APNs token Data to hex string, persist locally, and send to backend.
    public func registerDeviceToken(_ tokenData: Data) {
        let token = tokenData.map { String(format: "%02.2hhx", $0) }.joined()
        self.deviceToken = token
        UserDefaults.standard.set(token, forKey: Self.persistedTokenKey)
        logger.info("APNs device token received (\(token.prefix(8))...)")

        Task {
            await sendTokenToBackend(token: token)
        }
    }

    /// Re-register the persisted device token with the backend after login.
    /// Call this when the user authenticates so the backend associates the token with their account.
    public func reRegisterTokenIfNeeded() {
        guard let token = deviceToken else {
            logger.info("No persisted device token to re-register")
            return
        }
        logger.info("Re-registering persisted device token with backend")
        Task {
            await sendTokenToBackend(token: token)
        }
    }

    /// Handle APNs registration failure.
    public func handleRegistrationError(_ error: Error) {
        logger.error("APNs registration failed: \(error.localizedDescription)")
    }

    /// Unregister the current device token from the backend (e.g. on logout).
    public func unregisterDeviceToken() async {
        guard let token = deviceToken else { return }

        let body = UnregisterDeviceTokenRequest(token: token)
        do {
            let _: APIResponse<[String: String]> = try await APIClient.shared.request(
                endpoint: "/users/register-device-token",
                method: "DELETE",
                body: try JSONEncoder().encode(body)
            )
            logger.info("Device token unregistered from backend")
        } catch {
            logger.error("Failed to unregister device token: \(error.localizedDescription)")
        }

        deviceToken = nil
        UserDefaults.standard.removeObject(forKey: Self.persistedTokenKey)
    }

    // MARK: - Notification Handling

    /// Parse and handle an incoming notification payload (from tap or silent push).
    /// Sets `pendingNotificationPayload` which the app layer observes for navigation.
    public func handleNotification(userInfo: [AnyHashable: Any]) {
        let payload = NotificationPayload(userInfo: userInfo)
        logger.info("Notification received: type=\(payload.type ?? "unknown"), conversationId=\(payload.conversationId ?? "none")")
        pendingNotificationPayload = payload
    }

    /// Clear the pending notification after the app has navigated.
    public func clearPendingNotification() {
        pendingNotificationPayload = nil
    }

    // MARK: - Badge

    /// Reset the app badge count to zero.
    public func resetBadge() async {
        try? await UNUserNotificationCenter.current().setBadgeCount(0)
    }

    /// Update the app badge count to reflect total unread conversations.
    public func updateBadge(totalUnread: Int) async {
        let count = max(totalUnread, 0)
        try? await UNUserNotificationCenter.current().setBadgeCount(count)
    }

    // MARK: - Private

    private func sendTokenToBackend(token: String) async {
        guard APIClient.shared.authToken != nil else {
            logger.info("Skipping token registration: user not authenticated")
            return
        }

        let request = RegisterDeviceTokenRequest(
            token: token,
            platform: "ios",
            type: "apns"
        )

        do {
            let _: APIResponse<RegisterDeviceTokenResponse> = try await APIClient.shared.post(
                endpoint: "/users/register-device-token",
                body: request
            )
            logger.info("Device token registered with backend")
        } catch {
            logger.error("Failed to register device token: \(error.localizedDescription)")
        }
    }
}

// MARK: - Notification Payload

public struct NotificationPayload {
    public let type: String?
    public let conversationId: String?
    public let messageId: String?
    public let senderId: String?
    public let senderUsername: String?
    public let title: String?
    public let body: String?

    public init(userInfo: [AnyHashable: Any]) {
        self.type = userInfo["type"] as? String
        self.conversationId = userInfo["conversationId"] as? String
        self.messageId = userInfo["messageId"] as? String
        self.senderId = userInfo["senderId"] as? String
        self.senderUsername = userInfo["senderUsername"] as? String

        if let aps = userInfo["aps"] as? [String: Any],
           let alert = aps["alert"] as? [String: Any] {
            self.title = alert["title"] as? String
            self.body = alert["body"] as? String
        } else {
            self.title = nil
            self.body = nil
        }
    }
}
