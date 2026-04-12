import UIKit
import UserNotifications
import MeeshySDK
import MeeshyUI
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "push")

class AppDelegate: NSObject, UIApplicationDelegate {

    // MARK: - Application Lifecycle

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        registerNotificationCategories()
        BackgroundTaskManager.shared.registerTasks()

        // NotificationCoordinator must be wired as early as possible so unread/badge
        // state stays aligned even if no view is yet in the hierarchy.
        // Accessing @MainActor state requires an explicit hop since the delegate
        // method's isolation is inferred from UIKit preconcurrency annotations.
        Task { @MainActor in
            NotificationCoordinator.shared.widgetSink = WidgetDataManager.shared
            NotificationCoordinator.shared.start()
        }

        return true
    }

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        OrientationManager.shared.orientationLock
    }

    // MARK: - Remote Notifications

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            PushNotificationManager.shared.registerDeviceToken(deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            PushNotificationManager.shared.handleRegistrationError(error)
        }
    }

    /// Silent / content-available push: refresh unread counts + widgets without UI.
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        let unreadTotal = userInfo["unreadCount"] as? Int
        let convId = userInfo["conversationId"] as? String
        let convUnread = userInfo["conversationUnread"] as? Int

        Task { @MainActor in
            if let unreadTotal {
                NotificationCoordinator.shared.setInAppNotificationUnread(unreadTotal)
            }
            if let convId, let convUnread {
                NotificationCoordinator.shared.applyConversationUnread(
                    conversationId: convId,
                    unreadCount: convUnread
                )
            }
            await NotificationCoordinator.shared.syncNow()
        }
        completionHandler(.newData)
    }

    // MARK: - Universal Links (cold launch)

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL else { return false }
        Task { @MainActor in
            let _ = DeepLinkRouter.shared.handle(url: url)
        }
        return true
    }

    // MARK: - Notification Categories

    /// Register interactive actions so notifications on the banner / lock screen /
    /// notification center expose quick replies and mark-as-read buttons.
    private func registerNotificationCategories() {
        let replyAction = UNTextInputNotificationAction(
            identifier: MeeshyNotificationAction.reply.rawValue,
            title: String(localized: "notifications.action.reply", defaultValue: "Reply"),
            options: [],
            textInputButtonTitle: String(localized: "notifications.action.send", defaultValue: "Send"),
            textInputPlaceholder: String(localized: "notifications.action.message", defaultValue: "Message…")
        )

        let markReadAction = UNNotificationAction(
            identifier: MeeshyNotificationAction.markRead.rawValue,
            title: String(localized: "notifications.action.markRead", defaultValue: "Mark as read"),
            options: []
        )

        let viewAction = UNNotificationAction(
            identifier: MeeshyNotificationAction.view.rawValue,
            title: String(localized: "notifications.action.view", defaultValue: "View"),
            options: [.foreground]
        )

        let acceptAction = UNNotificationAction(
            identifier: MeeshyNotificationAction.accept.rawValue,
            title: String(localized: "notifications.action.accept", defaultValue: "Accept"),
            options: []
        )

        let declineAction = UNNotificationAction(
            identifier: MeeshyNotificationAction.decline.rawValue,
            title: String(localized: "notifications.action.decline", defaultValue: "Decline"),
            options: [.destructive]
        )

        let messageCategory = UNNotificationCategory(
            identifier: MeeshyNotificationCategory.message.rawValue,
            actions: [replyAction, markReadAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        let mentionCategory = UNNotificationCategory(
            identifier: MeeshyNotificationCategory.mention.rawValue,
            actions: [replyAction, viewAction, markReadAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        let friendRequestCategory = UNNotificationCategory(
            identifier: MeeshyNotificationCategory.friendRequest.rawValue,
            actions: [acceptAction, declineAction, viewAction],
            intentIdentifiers: [],
            options: []
        )

        let socialCategory = UNNotificationCategory(
            identifier: MeeshyNotificationCategory.social.rawValue,
            actions: [viewAction, markReadAction],
            intentIdentifiers: [],
            options: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            messageCategory,
            mentionCategory,
            friendRequestCategory,
            socialCategory
        ])
    }
}

// MARK: - Notification Categories & Actions

enum MeeshyNotificationCategory: String {
    case message = "MEESHY_MESSAGE"
    case mention = "MEESHY_MENTION"
    case friendRequest = "MEESHY_FRIEND_REQUEST"
    case social = "MEESHY_SOCIAL"
}

enum MeeshyNotificationAction: String {
    case reply = "MEESHY_ACTION_REPLY"
    case markRead = "MEESHY_ACTION_MARK_READ"
    case view = "MEESHY_ACTION_VIEW"
    case accept = "MEESHY_ACTION_ACCEPT"
    case decline = "MEESHY_ACTION_DECLINE"
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: @preconcurrency UNUserNotificationCenterDelegate {

    /// Called when a notification arrives while the app is in the foreground.
    ///
    /// Policy:
    /// - If the user is currently viewing the referenced conversation, suppress the
    ///   system banner entirely — the conversation view already shows the message.
    /// - Otherwise, show the native banner AND list entry, mirroring iOS behaviour
    ///   elsewhere. The in-app toast still plays for cross-cutting events.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let userInfo = notification.request.content.userInfo
        let type = userInfo["type"] as? String ?? "unknown"
        let conversationId = userInfo["conversationId"] as? String
        let activeConversationId = NotificationManager.shared.activeConversationId

        logger.info("Foreground notification: type=\(type) conversation=\(conversationId ?? "-")")

        if let conversationId, conversationId == activeConversationId {
            completionHandler([.sound])
            return
        }

        completionHandler([.banner, .list, .sound, .badge])
    }

    /// Called when the user interacts with a notification (tap, action button, etc.).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let actionIdentifier = response.actionIdentifier
        let replyText = (response as? UNTextInputNotificationResponse)?.userText
        logger.info("Notification response: action=\(actionIdentifier)")

        Task { @MainActor in
            let payload = NotificationPayload(userInfo: userInfo)

            switch actionIdentifier {
            case UNNotificationDefaultActionIdentifier:
                PushNotificationManager.shared.handleNotification(userInfo: userInfo)
            case UNNotificationDismissActionIdentifier:
                // User swiped the banner away — nothing to navigate to.
                break
            case MeeshyNotificationAction.markRead.rawValue:
                if let conversationId = payload.conversationId {
                    NotificationCoordinator.shared.markConversationRead(conversationId)
                    NotificationCenter.default.post(
                        name: .conversationMarkedRead,
                        object: conversationId
                    )
                    try? await ConversationService.shared.markRead(
                        conversationId: conversationId
                    )
                }
            case MeeshyNotificationAction.reply.rawValue:
                if let replyText,
                   let conversationId = payload.conversationId {
                    let request = SendMessageRequest(
                        content: replyText,
                        replyToId: payload.messageId
                    )
                    _ = try? await MessageService.shared.send(
                        conversationId: conversationId,
                        request: request
                    )
                    NotificationCoordinator.shared.markConversationRead(conversationId)
                }
            case MeeshyNotificationAction.view.rawValue,
                 MeeshyNotificationAction.accept.rawValue,
                 MeeshyNotificationAction.decline.rawValue:
                PushNotificationManager.shared.handleNotification(userInfo: userInfo)
            default:
                PushNotificationManager.shared.handleNotification(userInfo: userInfo)
            }
        }

        completionHandler()
    }
}
