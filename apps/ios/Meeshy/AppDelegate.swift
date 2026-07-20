import UIKit
@preconcurrency import UserNotifications
import FirebaseCore
import FirebaseCrashlytics
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
        // Configure Firebase synchronously before anything else so Crashlytics
        // installs its NSExceptionHandler and signal handlers BEFORE we wire
        // up our own. CrashDiagnosticsManager captures whatever handler is
        // currently installed as `previousExceptionHandler` and chains to it
        // — meaning any NSException that reaches us will also be forwarded
        // to Crashlytics. Returns a `CrashReporting` we hand to the manager
        // so MetricKit diagnostics also reach the Crashlytics dashboard
        // (those don't trigger the live signal handlers since they're
        // delivered at next launch from the OS).
        let crashReporter = Self.bootCrashReporting()

        // Install the crash & hang observer first so any crash that happens
        // during the rest of `didFinishLaunching` (or at any later point in
        // this session) is captured. MetricKit also delivers diagnostics
        // recorded during *previous* sessions here.
        //
        // P3 wire-up (Sprint 4):
        // - `MeeshyMetricsSubscriber.shared.register()` attaches to
        //   `MXMetricManager` so the `MXSignpostMetric` entries produced by
        //   `TimelineSignposter` are aggregated into the rolling 24h window.
        //   Without this call the docstring promise of "automatic
        //   aggregation" is vacuous: the signposts appear in Instruments
        //   but no payload ever lands. It is `@MainActor`-isolated and
        //   idempotent — safe to invoke alongside the crash observer install
        //   in the same MainActor hop.
        Task { @MainActor in
            CrashDiagnosticsManager.shared.install(crashReporter: crashReporter)
            MeeshyMetricsSubscriber.shared.register()
            AnalyticsManager.shared.syncCollectionState()
            // P1.5 — surface DependencyContainer boot diagnostics now that
            // the crash reporter is wired. The container no longer crashes
            // on a corrupted SQLite file but it does need to tell us when
            // it recovered, so the issue is investigated rather than
            // silently swept under the rug.
            Self.reportDependencyContainerDiagnostics(
                DependencyContainer.shared.initDiagnostics,
                reporter: crashReporter
            )
        }

        UNUserNotificationCenter.current().delegate = self
        registerNotificationCategories()
        BackgroundTaskManager.shared.registerTasks()

        // VoIP push registration MUST happen unconditionally, on every
        // process launch (including background launches iOS triggers to
        // deliver a VoIP push itself), per Apple's PushKit contract —
        // PKPushRegistry has to exist with its delegate wired before a VoIP
        // push can even reach `didReceiveIncomingPushWith`, let alone report
        // it to CallKit in time. This used to live ONLY inside a SwiftUI
        // `.task` gated on `authManager.isAuthenticated` (MeeshyApp.swift) —
        // on a fresh install (not yet logged in) the registry was never
        // created at all, and even once logged in, a `.task` isn't a
        // reliable place for launch-time OS contracts. `register()` is
        // idempotent (no-ops if already registered), so this is safe
        // alongside the existing call in MeeshyApp.swift's push bootstrap.
        Task { @MainActor in
            VoIPPushManager.shared.register()
        }

        // Masquer le spinner natif d'iOS pour les pull-to-refresh
        // SwiftUI `.refreshable`. `.tint(.clear)` au site d'utilisation
        // ne suffit pas sur iOS 17+ — l'UIRefreshControl sous-jacent
        // garde sa couleur systeme par defaut. En forcant tintColor
        // = .clear AU NIVEAU de l'appearance proxy, le ProgressView
        // natif est totalement invisible et seul notre `MeeshyPullIndicator`
        // brand est visible pendant le refresh.
        UIRefreshControl.appearance().tintColor = .clear

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
        // Sonnerie fantôme — le gateway envoie une push background `call_cancel`
        // quand l'appel se termine sans avoir été décroché : si CallKit sonne
        // encore pour ce callId (socket jamais monté, le fanout call:ended ne
        // nous a pas atteints), on coupe. Gardes FSM dans CallManager — un
        // cancel tardif ne touche jamais un appel décroché.
        if (userInfo["type"] as? String) == "call_cancel",
           let cancelCallId = userInfo["callId"] as? String, !cancelCallId.isEmpty {
            Logger.network.info("call_cancel silent push received (callId=\(cancelCallId, privacy: .public))")
            Task { @MainActor in
                CallManager.shared.endRingingFromCancellation(callId: cancelCallId)
                completionHandler(.noData)
            }
            return
        }

        // Multi-device : un autre appareil du compte a décroché — pendant
        // socketless de `call:already-answered` (voir sendCallCancellationPushes
        // côté gateway pour le rationale réseau). Le device qui a décroché
        // reçoit aussi cette push et l'ignore par garde FSM.
        if (userInfo["type"] as? String) == "call_answered_elsewhere",
           let answeredCallId = userInfo["callId"] as? String, !answeredCallId.isEmpty {
            Logger.network.info("call_answered_elsewhere silent push received (callId=\(answeredCallId, privacy: .public))")
            Task { @MainActor in
                CallManager.shared.endRingingAnsweredElsewhere(callId: answeredCallId)
                completionHandler(.noData)
            }
            return
        }

        let unreadTotal = userInfo["unreadCount"] as? Int
        let convId = userInfo["conversationId"] as? String
        let convUnread = userInfo["conversationUnread"] as? Int
        let messageId = userInfo["messageId"] as? String
        // Phase A real-time instrumentation — log the silent-push arrival
        // so we can correlate `perf:push.sendViaAPNS` (gateway side) with
        // the actual moment APN delivers it to the device, and measure the
        // background-task completion delta separately.
        let notifReceivedAt = Date()
        Logger.network.info("perf:ios.notif.silent-push messageId=\(messageId ?? "nil", privacy: .public) conversationId=\(convId ?? "nil", privacy: .public) unreadTotal=\(unreadTotal ?? -1, privacy: .public) appState=\(application.applicationState.rawValue, privacy: .public)")

        // Guard the entire async chain with a background task so iOS gives us
        // the full ~25s budget instead of suspending the process the moment
        // this delegate returns. We track both the task id and the completion
        // state in a small actor so the expiration handler and the happy
        // path can't race — whichever fires first wins.
        Task { @MainActor in
            PushNotificationManager.shared.noteMessageActivity(userInfo: userInfo)
            let state = SilentPushState(completionHandler: completionHandler)
            let taskId = UIApplication.shared.beginBackgroundTask(withName: "meeshy.silent-push") {
                Task { @MainActor in state.expire() }
            }
            state.attach(taskId: taskId)

            if let unreadTotal {
                NotificationCoordinator.shared.setInAppNotificationUnread(unreadTotal)
            }
            if let convId, let convUnread {
                NotificationCoordinator.shared.applyConversationUnread(
                    conversationId: convId,
                    unreadCount: convUnread
                )
            }

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
                        // A silent push is authoritative evidence a new
                        // message exists — bypass the cache TTL so a recently
                        // loaded (still `.fresh`) cache doesn't suppress the
                        // fetch and leave the conversation missing the message.
                        await ConversationSyncEngine.shared.ensureMessages(for: convId, force: true)
                    }
                }
            }

            let handledMs = Int(Date().timeIntervalSince(notifReceivedAt) * 1000)
            Logger.network.info("perf:ios.notif.silent-push.handled messageId=\(messageId ?? "nil", privacy: .public) conversationId=\(convId ?? "nil", privacy: .public) durationMs=\(handledMs, privacy: .public)")
            state.finish()
        }
    }

    // MARK: - Universal Links (cold launch)

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL,
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http" else { return false }

        // The Universal Link router is @MainActor, so the actual
        // pendingDeepLink mutation has to hop. We can still answer iOS
        // synchronously by parsing the URL ourselves first: if it isn't
        // a route we know, return `false` so iOS falls back to opening
        // the URL in Safari instead of silently swallowing it. Returning
        // `true` for an unrecognised URL would tell iOS we handled it
        // and the user would just see the app land on the home screen.
        let recognised = DeepLinkParser.isMeeshyDeepLink(url)
        if recognised {
            Task { @MainActor in
                _ = DeepLinkRouter.shared.handle(url: url)
            }
        }
        return recognised
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

        let commentAction = UNTextInputNotificationAction(
            identifier: MeeshyNotificationAction.comment.rawValue,
            title: String(localized: "notifications.action.comment", defaultValue: "Comment"),
            options: [],
            textInputButtonTitle: String(localized: "notifications.action.send", defaultValue: "Send"),
            textInputPlaceholder: String(localized: "notifications.action.commentPlaceholder", defaultValue: "Comment…")
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

        // R3 — social pushes whose type is commentable AND that carry a postId
        // (category set by the NSE, `NotificationPayloadHelpers.socialCategoryIdentifier`,
        // or pushed directly by the gateway). Adds the inline text action.
        let socialCommentableCategory = UNNotificationCategory(
            identifier: MeeshyNotificationCategory.socialCommentable.rawValue,
            actions: [commentAction, viewAction, markReadAction],
            intentIdentifiers: [],
            options: []
        )

        // G4d — call categories split by state so a terminated call never
        // shows an « Answer » button. Ringing normally goes through
        // CallKit/PushKit VoIP; MEESHY_CALL_INCOMING covers the regular-APNs
        // ringing path (China devices, no-voip-token fallback).
        let callIncomingCategory = UNNotificationCategory(
            identifier: MeeshyNotificationCategory.callIncoming.rawValue,
            actions: [answerCallAction, declineCallAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        let callMissedCategory = UNNotificationCategory(
            identifier: MeeshyNotificationCategory.callMissed.rawValue,
            actions: [callbackAction, viewAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        // Legacy MEESHY_CALL — kept registered for pushes categorized by a
        // stale NSE / gateway during the rollout window. Terminal-state action
        // set (no Answer): the historical bug was « Répondre » on missed calls.
        let legacyCallCategory = UNNotificationCategory(
            identifier: MeeshyNotificationCategory.call.rawValue,
            actions: [callbackAction, viewAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            messageCategory,
            mentionCategory,
            friendRequestCategory,
            socialCategory,
            socialCommentableCategory,
            callIncomingCategory,
            callMissedCategory,
            legacyCallCategory
        ])
    }

    // MARK: - Crash Reporting Bootstrap

    /// Configures Firebase + Crashlytics if a `GoogleService-Info.plist` is
    /// bundled with this build (production / staging schemes). Debug builds
    /// without the plist fall through to `NoOpCrashReporter` so the rest of
    /// the launch flow stays unchanged. Idempotent: safe to call multiple
    /// times — only the first call configures, subsequent calls return the
    /// already-active reporter.
    /// Forward the database init diagnostics to the crash reporter so the
    /// recovered-from-corruption / in-memory-fallback paths are visible in
    /// the dashboard. Silent recoveries used to leave no trace; this
    /// signal lets us notice when a fleet of users hits SQLITE_CORRUPT.
    private static func reportDependencyContainerDiagnostics(
        _ diagnostics: DatabaseInitDiagnostics,
        reporter: CrashReporting
    ) {
        guard diagnostics.recoveryAttempted || diagnostics.fellBackToInMemory else { return }
        let summary = diagnostics.fellBackToInMemory
            ? "DB init fell back to in-memory pool"
            : "DB recovered from corruption"
        reporter.log("[db-init] \(summary) — first-attempt-error=\(diagnostics.firstAttemptError ?? "nil") quarantined=\(diagnostics.quarantinedFilePath ?? "nil")")
    }

    private static func bootCrashReporting() -> CrashReporting {
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            Logger.crash.info("Firebase not configured (GoogleService-Info.plist missing); using NoOp reporter")
            return NoOpCrashReporter()
        }
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        let crashlytics = Crashlytics.crashlytics()
        #if DEBUG
        // Debug builds must not pollute the production Crashlytics dashboard.
        // Firebase is still configured (Analytics, Messaging work), but crash
        // collection is disabled so developer crashes stay local-only.
        crashlytics.setCrashlyticsCollectionEnabled(false)
        Logger.crash.info("Crashlytics collection disabled (DEBUG)")
        return NoOpCrashReporter()
        #else
        if let bundleVersion = Bundle.main.infoDictionary?["CFBundleVersion"] as? String {
            crashlytics.setCustomValue(bundleVersion, forKey: "build")
        }
        if let shortVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String {
            crashlytics.setCustomValue(shortVersion, forKey: "version")
        }
        Logger.crash.info("Crashlytics configured")
        return CrashlyticsReporter()
        #endif
    }
}

// MARK: - Notification Categories & Actions

// MARK: - Silent Push State

/// Tiny actor that makes sure `completionHandler(.newData)` is called
/// exactly once and that `endBackgroundTask` always fires, whether the
/// OS expiration handler or the happy path finishes first.
@MainActor
private final class SilentPushState {
    private var completionHandler: ((UIBackgroundFetchResult) -> Void)?
    private var taskId: UIBackgroundTaskIdentifier = .invalid
    private var didFinish = false

    init(completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        self.completionHandler = completionHandler
    }

    func attach(taskId: UIBackgroundTaskIdentifier) {
        if didFinish {
            UIApplication.shared.endBackgroundTask(taskId)
            return
        }
        self.taskId = taskId
    }

    func finish() {
        guard !didFinish else { return }
        didFinish = true
        completionHandler?(.newData)
        completionHandler = nil
        endTask()
    }

    func expire() {
        guard !didFinish else { return }
        didFinish = true
        completionHandler?(.failed)
        completionHandler = nil
        endTask()
    }

    private func endTask() {
        guard taskId != .invalid else { return }
        let id = taskId
        taskId = .invalid
        UIApplication.shared.endBackgroundTask(id)
    }
}

enum MeeshyNotificationCategory: String {
    case message = "MEESHY_MESSAGE"
    case mention = "MEESHY_MENTION"
    case friendRequest = "MEESHY_FRIEND_REQUEST"
    case social = "MEESHY_SOCIAL"
    case socialCommentable = "MEESHY_SOCIAL_COMMENTABLE"
    case callIncoming = "MEESHY_CALL_INCOMING"
    case callMissed = "MEESHY_CALL_MISSED"
    /// Legacy single call category — superseded by the incoming/missed split,
    /// kept for pushes categorized by a stale NSE during rollout.
    case call = "MEESHY_CALL"
}

enum MeeshyNotificationAction: String {
    case reply = "MEESHY_ACTION_REPLY"
    case markRead = "MEESHY_ACTION_MARK_READ"
    case view = "MEESHY_ACTION_VIEW"
    case comment = "MEESHY_ACTION_COMMENT"
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
    /// Policy (2026-05-24, simplified): the Socket.IO connection is the
    /// authoritative signal.
    /// - **Socket connected** → the in-app toast (driven by Socket.IO
    ///   `notification:new`) will fire. Suppress the iOS banner, list entry
    ///   and sound to avoid double-display. We keep `.badge` so the unread
    ///   counter on the app icon stays correct.
    /// - **Socket disconnected** → no in-app toast will fire. Show the full
    ///   system banner so the user is notified by *something*. This covers
    ///   both the foreground-but-offline case and the background case (iOS
    ///   tears the socket down ~30s after the app leaves the foreground, so
    ///   "socket connected" is effectively a proxy for "app is reading").
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let userInfo = notification.request.content.userInfo
        let convId = userInfo["conversationId"] as? String
        let messageId = userInfo["messageId"] as? String

        Task { @MainActor in
            PushNotificationManager.shared.noteMessageActivity(userInfo: userInfo)

            // Trigger real-time sync for foreground notifications so the DB
            // and cache stay fresh even when the socket is lagging or the
            // push arrived via a different path.
            if let convId {
                await withTaskGroup(of: Void.self) { group in
                    group.addTask {
                        // Foreground banner = a message just landed; force the
                        // fetch past the cache TTL so the open (or about-to-
                        // open) conversation reflects it even if the socket
                        // lagged or the push arrived via a different path.
                        await ConversationSyncEngine.shared.ensureMessages(for: convId, force: true)
                    }
                    group.addTask {
                        await PushDeliveryReceiptService.shared.ack(
                            conversationId: convId,
                            messageId: messageId
                        )
                    }
                }
            }
        }
        let type = userInfo["type"] as? String ?? "unknown"
        let conversationId = userInfo["conversationId"] as? String
        let postId = userInfo["postId"] as? String

        let socketConnected = MessageSocketManager.shared.isConnected
        logger.info("Foreground notification: type=\(type) conversation=\(conversationId ?? "-") postId=\(postId ?? "-") socketConnected=\(socketConnected)")

        if socketConnected {
            // Socket is alive → the in-app toast will fire from the matching
            // `notification:new` socket event. Suppress the native banner to
            // avoid double-display. Keep .badge so the app icon counter stays
            // correct.
            completionHandler([.badge])
            return
        }

        // Socket is down → no in-app toast will fire. Surface the full system
        // banner so the user is notified by *something*.
        completionHandler([.banner, .list, .sound, .badge])
    }

    /// Called when the user interacts with a notification (tap, action button, etc.).
    ///
    /// R1 — the actual work lives in `NotificationActionHandler` (injectable,
    /// unit-tested). The handler wraps itself in a `beginBackgroundTask` and
    /// `completionHandler()` fires AFTER the awaited work — previously it was
    /// called synchronously while the work ran in a detached Task, letting
    /// iOS suspend the process mid-send on background cold-launch.
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
            await NotificationActionHandler.shared.handle(
                actionIdentifier: actionIdentifier,
                userInfo: userInfo,
                replyText: replyText
            )
            completionHandler()
        }
    }
}


