import Foundation
import Combine
import UserNotifications

@MainActor
public final class PushNotificationManager: NSObject, ObservableObject {
    public static let shared = PushNotificationManager()

    @Published public var isAuthorized = false
    @Published public var deviceToken: String?

    private override init() {
        super.init()
    }

    // MARK: - Permission

    /// Request notification permission. Returns true if granted.
    public func requestPermission() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            isAuthorized = granted
            if granted {
                await registerForRemoteNotifications()
            }
            return granted
        } catch {
            isAuthorized = false
            return false
        }
    }

    /// Check current authorization status without prompting.
    public func checkAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
    }

    // MARK: - Device Token

    /// Convert raw APNs token Data to hex string and send to backend.
    public func registerDeviceToken(_ tokenData: Data) {
        let token = tokenData.map { String(format: "%02.2hhx", $0) }.joined()
        self.deviceToken = token

        Task {
            await sendTokenToBackend(token: token)
        }
    }

    /// Send the device token to the Meeshy backend.
    private func sendTokenToBackend(token: String) async {
        let request = RegisterDeviceTokenRequest(
            token: token,
            platform: "ios",
            type: "apns"
        )

        do {
            let _: APIResponse<[String: Bool]> = try await APIClient.shared.post(
                endpoint: "/notifications/device-token",
                body: request
            )
        } catch {
            print("[PushNotifications] Failed to register device token: \(error)")
        }
    }

    // MARK: - Notification Handling

    /// Handle incoming notification payload.
    public func handleNotification(userInfo: [AnyHashable: Any]) {
        // Extract notification type and route accordingly
        if let type = userInfo["type"] as? String {
            print("[PushNotifications] Received notification type: \(type)")
        }
    }

    // MARK: - Badge

    /// Reset the app badge count.
    public func resetBadge() async {
        try? await UNUserNotificationCenter.current().setBadgeCount(0)
    }

    // MARK: - Private

    @MainActor
    private func registerForRemoteNotifications() async {
        // Must be called from app delegate or scene delegate context
        // The app should call UIApplication.shared.registerForRemoteNotifications()
        // after this manager grants permission
    }
}
