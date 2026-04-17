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
    ///
    /// Previously this handler fired `completionHandler(.newData)` synchronously
    /// before the async work finished, letting iOS freeze the process mid-flight
    /// and leaving caches + badges stale. We now guard the full flow under a
    /// `beginBackgroundTask` umbrella and only call the completion handler when
    /// every subtask is done (or the OS budget is exhausted). This also gives
    /// us a deterministic place to emit the delivery receipt (double-check
    /// cursor) so the sender sees their message as "received" even when the
    /// recipient never foregrounds the app.
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        let unreadTotal = userInfo["unreadCount"] as? Int
        let convId = userInfo["conversationId"] as? String
        let convUnread = userInfo["conversationUnread"] as? Int
        let messageId = userInfo["messageId"] as? String

        // Guard the entire async chain with a background task so iOS gives us
        // the full ~25s budget instead of suspending the process the moment
        // this delegate returns. We track both the task id and the completion
        // state in a small actor so the expiration handler and the happy
        // path can't race — whichever fires first wins.
        let state = SilentPushState(completionHandler: completionHandler)
        let taskId = UIApplication.shared.beginBackgroundTask(withName: "meeshy.silent-push") {
            Task { await state.expire() }
        }
        Task { await state.attach(taskId: taskId) }

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

            // Run the three subtasks in parallel: badge/widget sync, delivery
            // receipt emission, and message cache refresh. None of them throw
            // — they log and swallow internally — so the group cannot bubble
            // an error into the completion handler.
            await withTaskGroup(of: Void.self) { group in
                group.addTask {
                    await NotificationCoordinator.shared.syncNow()
                }
                if let convId {
                    group.addTask {
                        await PushDeliveryReceiptService.shared.ack(
                            conversationId: convId,
                            messageId: messageId
                        )
                    }
                    group.addTask {
                        await ConversationSyncEngine.shared.ensureMessages(for: convId)
                    }
                }
            }

            await state.finish()
        }
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

        let callbackAction = UNNotificationAction(
            identifier: MeeshyNotificationAction.callback.rawValue,
            title: String(localized: "notifications.action.callback", defaultValue: "Call back"),
            options: [.foreground]
        )

        let answerCallAction = UNNotificationAction(
            identifier: MeeshyNotificationAction.answerCall.rawValue,
            title: String(localized: "notifications.action.answer", defaultValue: "Answer"),
            options: [.foreground]
        )

        let declineCallAction = UNNotificationAction(
            identifier: MeeshyNotificationAction.declineCall.rawValue,
            title: String(localized: "notifications.action.declineCall", defaultValue: "Decline"),
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

        // Call category: distinct action set for incoming (ringing) vs missed/ended.
        // Incoming calls would normally use CallKit/PushKit VoIP; this category
        // covers the regular-APNs path (missed_call, call_ended, call_declined,
        // call_recording_ready) where quick callback is the natural action.
        let callCategory = UNNotificationCategory(
            identifier: MeeshyNotificationCategory.call.rawValue,
            actions: [callbackAction, answerCallAction, declineCallAction, viewAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            messageCategory,
            mentionCategory,
            friendRequestCategory,
            socialCategory,
            callCategory
        ])
    }
}

// MARK: - Notification Categories & Actions

// MARK: - Silent Push State

/// Tiny actor that makes sure `completionHandler(.newData)` is called
/// exactly once and that `endBackgroundTask` always fires, whether the
/// OS expiration handler or the happy path finishes first.
private actor SilentPushState {
    private var completionHandler: ((UIBackgroundFetchResult) -> Void)?
    private var taskId: UIBackgroundTaskIdentifier = .invalid
    private var didFinish = false

    init(completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        self.completionHandler = completionHandler
    }

    func attach(taskId: UIBackgroundTaskIdentifier) async {
        // Rare but possible: if the OS fired the expiration handler before
        // the attach task hop completed, `didFinish` is already true and
        // we'd leak the task id. End it immediately in that case.
        if didFinish {
            await MainActor.run {
                UIApplication.shared.endBackgroundTask(taskId)
            }
            return
        }
        self.taskId = taskId
    }

    func finish() async {
        guard !didFinish else { return }
        didFinish = true
        completionHandler?(.newData)
        completionHandler = nil
        await endTask()
    }

    func expire() async {
        guard !didFinish else { return }
        didFinish = true
        completionHandler?(.failed)
        completionHandler = nil
        await endTask()
    }

    private func endTask() async {
        guard taskId != .invalid else { return }
        let id = taskId
        taskId = .invalid
        await MainActor.run {
            UIApplication.shared.endBackgroundTask(id)
        }
    }
}

enum MeeshyNotificationCategory: String {
    case message = "MEESHY_MESSAGE"
    case mention = "MEESHY_MENTION"
    case friendRequest = "MEESHY_FRIEND_REQUEST"
    case social = "MEESHY_SOCIAL"
    case call = "MEESHY_CALL"
}

enum MeeshyNotificationAction: String {
    case reply = "MEESHY_ACTION_REPLY"
    case markRead = "MEESHY_ACTION_MARK_READ"
    case view = "MEESHY_ACTION_VIEW"
    case accept = "MEESHY_ACTION_ACCEPT"
    case decline = "MEESHY_ACTION_DECLINE"
    case callback = "MEESHY_ACTION_CALLBACK"
    case answerCall = "MEESHY_ACTION_ANSWER_CALL"
    case declineCall = "MEESHY_ACTION_DECLINE_CALL"
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
                 MeeshyNotificationAction.decline.rawValue,
                 MeeshyNotificationAction.callback.rawValue,
                 MeeshyNotificationAction.answerCall.rawValue:
                // All of these surface the app to the relevant screen — the
                // deep-link router decides the destination based on payload.type
                // (incoming_call opens the call UI, missed_call opens the thread).
                PushNotificationManager.shared.handleNotification(userInfo: userInfo)
            case MeeshyNotificationAction.declineCall.rawValue:
                // Silent decline — no navigation. The VoIP layer handles the
                // actual decline via CallKit; APNs declineCall is just
                // bookkeeping so we don't reopen the call screen.
                break
            default:
                PushNotificationManager.shared.handleNotification(userInfo: userInfo)
            }
        }

        completionHandler()
    }
}
