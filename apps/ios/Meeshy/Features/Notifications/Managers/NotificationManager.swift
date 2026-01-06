//
//  NotificationManager.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import Foundation
import UserNotifications
import UIKit

#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

@MainActor
final class NotificationManager: NSObject, ObservableObject {
    static let shared = NotificationManager()

    @Published var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published var deviceToken: String?
    @Published var fcmToken: String?
    @Published var unreadCount: Int = 0

    private let notificationCenter = UNUserNotificationCenter.current()

    private override init() {
        super.init()
        notificationCenter.delegate = self
        setupNotificationCategories()
    }

    // MARK: - Authorization

    func requestAuthorization() async throws {
        let options: UNAuthorizationOptions = [.alert, .badge, .sound, .criticalAlert, .providesAppNotificationSettings]
        let granted = try await notificationCenter.requestAuthorization(options: options)

        if granted {
            await MainActor.run {
                registerForPushNotifications()
            }
        }

        await updateAuthorizationStatus()
    }

    func updateAuthorizationStatus() async {
        let settings = await notificationCenter.notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }

    func registerForPushNotifications() {
        #if !targetEnvironment(simulator)
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
        #endif
    }

    // MARK: - Device Token

    func setDeviceToken(_ token: Data) {
        let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
        deviceToken = tokenString

        #if canImport(FirebaseMessaging)
        // Set APNS token in Firebase - this enables FCM to work on iOS
        Messaging.messaging().apnsToken = token
        #endif

        // Send APNS token to backend as fallback (FCM token is sent via MessagingDelegate)
        Task {
            await sendDeviceTokenToServer(tokenString)
        }

        logger.info("APNS device token set: \(tokenString.prefix(20))...")
    }

    /// Refresh and send FCM token to backend (call after login)
    func refreshFCMToken() async {
        if let token = await FirebaseConfiguration.getFCMToken() {
            await MainActor.run {
                self.fcmToken = token
            }

            // Send to backend
            await sendFCMTokenToServer(token)
        }
    }

    /// Send FCM token to backend
    private func sendFCMTokenToServer(_ token: String) async {
        logger.info("Sending FCM token to server: \(token.prefix(20))...")

        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/users/device-token") else {
                logger.error("Invalid URL for FCM token registration")
                return
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            // Add authentication header
            if let authToken = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
            } else if let sessionToken = await MainActor.run(body: { AuthenticationManager.shared.sessionToken }) {
                request.setValue("\(sessionToken)", forHTTPHeaderField: "X-Session-Token")
            } else {
                logger.warn("No auth token available for FCM token registration")
                return
            }

            // Body: fcmToken for Firebase Cloud Messaging
            let body: [String: Any] = [
                "fcmToken": token,
                "platform": "ios"
            ]

            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                switch httpResponse.statusCode {
                case 200, 201:
                    logger.info("FCM token registered successfully with server")
                case 401:
                    logger.warn("FCM token registration failed: authentication required")
                case 400:
                    logger.error("FCM token registration failed: invalid request")
                default:
                    logger.error("FCM token registration failed: HTTP \(httpResponse.statusCode)")
                }
            }
        } catch {
            logger.error("Error registering FCM token: \(error.localizedDescription)")
        }
    }

    /// Sends device token to server for push notification registration
    private func sendDeviceTokenToServer(_ token: String) async {
        logger.info("Registering device token: \(token.prefix(20))...")

        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/users/device-token") else {
                logger.error("Invalid URL for device token registration")
                return
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            // Add authentication header
            if let authToken = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
            } else if let sessionToken = await MainActor.run(body: { AuthenticationManager.shared.sessionToken }) {
                request.setValue("\(sessionToken)", forHTTPHeaderField: "X-Session-Token")
            } else {
                logger.warn("No auth token available for device token registration")
                return
            }

            // Body: apnsToken for iOS native push notifications
            let body: [String: Any] = [
                "apnsToken": token,
                "platform": "ios"
            ]

            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                switch httpResponse.statusCode {
                case 200, 201:
                    logger.info("✅ Device token registered successfully")
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let responseData = json["data"] as? [String: Any] {
                        logger.debug("Server response: \(responseData)")
                    }
                case 401:
                    logger.warn("Device token registration failed: authentication required")
                case 400:
                    logger.error("Device token registration failed: invalid request")
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        logger.error("Server error: \(json)")
                    }
                default:
                    logger.error("Device token registration failed: HTTP \(httpResponse.statusCode)")
                }
            }
        } catch {
            logger.error("Error registering device token: \(error.localizedDescription)")
        }
    }

    // MARK: - Notification Categories & Actions

    private func setupNotificationCategories() {
        // Reply action with text input
        let replyAction = UNTextInputNotificationAction(
            identifier: NotificationAction.reply.rawValue,
            title: "Reply",
            options: [],
            textInputButtonTitle: "Send",
            textInputPlaceholder: "Type a message..."
        )

        // Mark as read action
        let markReadAction = UNNotificationAction(
            identifier: NotificationAction.markAsRead.rawValue,
            title: "Mark as Read",
            options: []
        )

        // Call back action
        let callBackAction = UNNotificationAction(
            identifier: NotificationAction.callBack.rawValue,
            title: "Call Back",
            options: [.foreground]
        )

        // Dismiss action
        let dismissAction = UNNotificationAction(
            identifier: NotificationAction.dismiss.rawValue,
            title: "Dismiss",
            options: [.destructive]
        )

        // Message category
        let messageCategory = UNNotificationCategory(
            identifier: NotificationCategory.message.rawValue,
            actions: [replyAction, markReadAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        // Call category
        let callCategory = UNNotificationCategory(
            identifier: NotificationCategory.call.rawValue,
            actions: [callBackAction, dismissAction],
            intentIdentifiers: [],
            options: []
        )

        // Mention category
        let mentionCategory = UNNotificationCategory(
            identifier: NotificationCategory.mention.rawValue,
            actions: [replyAction, markReadAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        // System category
        let systemCategory = UNNotificationCategory(
            identifier: NotificationCategory.system.rawValue,
            actions: [dismissAction],
            intentIdentifiers: [],
            options: []
        )

        notificationCenter.setNotificationCategories([
            messageCategory,
            callCategory,
            mentionCategory,
            systemCategory
        ])
    }

    // MARK: - Local Notifications

    func scheduleLocalNotification(
        title: String,
        body: String,
        category: NotificationCategory,
        data: [String: Any] = [:],
        delay: TimeInterval = 0
    ) async throws {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = category.rawValue

        if let badge = data["badge"] as? Int {
            content.badge = NSNumber(value: badge)
        }

        content.userInfo = data

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, delay), repeats: false)
        let identifier = UUID().uuidString
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)

        try await notificationCenter.add(request)
    }

    // MARK: - Handle Remote Notification

    func handleRemoteNotification(_ userInfo: [AnyHashable: Any]) async {
        print("Received remote notification: \(userInfo)")

        // Extract notification data
        guard let aps = userInfo["aps"] as? [String: Any] else { return }

        let title = (aps["alert"] as? [String: Any])?["title"] as? String ?? ""
        let body = (aps["alert"] as? [String: Any])?["body"] as? String ?? ""
        let category = userInfo["category"] as? String ?? ""

        // Update badge
        if let badge = aps["badge"] as? Int {
            unreadCount = badge
            await updateBadgeCount(badge)
        }

        // Handle different notification types
        if let notificationType = userInfo["type"] as? String {
            await routeNotification(type: notificationType, data: userInfo)
        }
    }

    private func routeNotification(type: String, data: [AnyHashable: Any]) async {
        switch type {
        case "message":
            // Handle new message
            NotificationCenter.default.post(name: .didReceiveMessage, object: nil, userInfo: data as? [String: Any])
        case "call":
            // Handle incoming call
            NotificationCenter.default.post(name: .didReceiveCall, object: nil, userInfo: data as? [String: Any])
        case "mention":
            // Handle mention
            NotificationCenter.default.post(name: .didReceiveMention, object: nil, userInfo: data as? [String: Any])
        default:
            break
        }
    }

    // MARK: - Badge Management

    func updateBadgeCount(_ count: Int) async {
        await MainActor.run {
            UIApplication.shared.applicationIconBadgeNumber = count
            unreadCount = count
        }
    }

    func clearBadge() async {
        await updateBadgeCount(0)
    }

    // MARK: - Notification Settings

    func openNotificationSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }

    // MARK: - Clear Notifications

    func clearAllNotifications() {
        notificationCenter.removeAllDeliveredNotifications()
        notificationCenter.removeAllPendingNotificationRequests()
    }

    func clearNotification(withIdentifier identifier: String) {
        notificationCenter.removeDeliveredNotifications(withIdentifiers: [identifier])
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationManager: UNUserNotificationCenterDelegate {
    // Called when notification is received while app is in foreground
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let userInfo = notification.request.content.userInfo
        print("Will present notification: \(userInfo)")

        // Show banner, sound, and badge
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .badge, .list])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    // Called when user interacts with notification
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping @Sendable () -> Void
    ) {
        // Extract needed values from notification
        let actionIdentifier = response.actionIdentifier
        let textResponse = (response as? UNTextInputNotificationResponse)?.userText

        // Extract specific values needed from userInfo to avoid data races
        let userInfoDict = response.notification.request.content.userInfo
        let conversationId = userInfoDict["conversationId"] as? String
        let callId = userInfoDict["callId"] as? String
        let notificationId = userInfoDict["notificationId"] as? String
        let userId = userInfoDict["userId"] as? String

        // Use MainActor isolated task
        Task { @MainActor [weak self] in
            guard let self = self else {
                completionHandler()
                return
            }

            // Process notification action on MainActor
            await self.handleNotificationActionSafe(
                actionIdentifier: actionIdentifier,
                conversationId: conversationId,
                callId: callId,
                notificationId: notificationId,
                userId: userId,
                textResponse: textResponse
            )
            completionHandler()
        }
    }

    private func handleNotificationActionSafe(
        actionIdentifier: String,
        conversationId: String?,
        callId: String?,
        notificationId: String?,
        userId: String?,
        textResponse: String?
    ) async {
        switch actionIdentifier {
        case UNNotificationDefaultActionIdentifier:
            // User tapped on notification
            await handleNotificationTap(conversationId: conversationId, callId: callId)

        case NotificationAction.reply.rawValue:
            // User replied to message
            if let text = textResponse, let conversationId = conversationId {
                await handleReply(text: text, conversationId: conversationId)
            }

        case NotificationAction.markAsRead.rawValue:
            // Mark message as read
            if let notificationId = notificationId {
                await handleMarkAsRead(notificationId: notificationId)
            }

        case NotificationAction.callBack.rawValue:
            // User wants to call back
            if let userId = userId {
                await handleCallBack(userId: userId)
            }

        case NotificationAction.dismiss.rawValue:
            // User dismissed notification
            break

        default:
            break
        }
    }

    private func handleNotificationTap(conversationId: String?, callId: String?) async {
        // Deep link to the appropriate screen
        if let conversationId = conversationId {
            NotificationCenter.default.post(
                name: .openConversation,
                object: nil,
                userInfo: ["conversationId": conversationId]
            )
        } else if let callId = callId {
            NotificationCenter.default.post(
                name: .openCall,
                object: nil,
                userInfo: ["callId": callId]
            )
        }
    }

    private func handleReply(text: String, conversationId: String) async {
        // Send reply message
        NotificationCenter.default.post(
            name: .sendQuickReply,
            object: nil,
            userInfo: [
                "conversationId": conversationId,
                "text": text
            ]
        )
    }

    private func handleMarkAsRead(notificationId: String) async {
        // Mark notification as read
        NotificationCenter.default.post(
            name: .markNotificationAsRead,
            object: nil,
            userInfo: ["notificationId": notificationId]
        )
    }

    private func handleCallBack(userId: String) async {
        // Initiate call back
        NotificationCenter.default.post(
            name: .initiateCall,
            object: nil,
            userInfo: ["userId": userId]
        )
    }

    // Called when notification settings are opened
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        openSettingsFor notification: UNNotification?
    ) {
        // User opened notification settings
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .openNotificationSettings, object: nil)
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let didReceiveMessage = Notification.Name("didReceiveMessage")
    static let didReceiveCall = Notification.Name("didReceiveCall")
    static let didReceiveMention = Notification.Name("didReceiveMention")
    static let openConversation = Notification.Name("openConversation")
    static let openCall = Notification.Name("openCall")
    static let sendQuickReply = Notification.Name("sendQuickReply")
    static let markNotificationAsRead = Notification.Name("markNotificationAsRead")
    static let initiateCall = Notification.Name("initiateCall")
    static let openNotificationSettings = Notification.Name("openNotificationSettings")
}
