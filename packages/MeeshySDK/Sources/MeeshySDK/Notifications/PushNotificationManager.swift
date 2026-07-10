import Foundation
import Combine
import UserNotifications
import UIKit
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "push")

@MainActor
public final class PushNotificationManager: NSObject, ObservableObject {
    public static let shared = PushNotificationManager()

    @Published public var isAuthorized = false
    @Published public var deviceToken: String?

    /// Published notification payload when user taps a notification.
    /// The app layer observes this to perform navigation.
    @Published public var pendingNotificationPayload: NotificationPayload?

    /// Émet un conversationId chaque fois qu'une notification entrante
    /// (bannière au premier plan ou push silencieux) signale une activité de
    /// message. La liste de conversations s'y abonne pour remonter la ligne
    /// en tête en temps réel — y compris quand le message est arrivé via APNs
    /// alors que le websocket était déconnecté. Distinct de
    /// `pendingNotificationPayload`, qui porte une intention de navigation sur
    /// un tap explicite.
    public let messageNotificationReceived = PassthroughSubject<String, Never>()

    /// Keys exposed at type level so they can be reused by tests writing to
    /// the same UserDefaults suite without re-stringifying the namespace.
    static let persistedTokenKey = "com.meeshy.push.deviceToken"
    static let lastRegisteredTokenKey = "com.meeshy.push.lastRegisteredToken"
    static let lastRegisteredAtKey = "com.meeshy.push.lastRegisteredAt"

    /// Cooldown applique a l'enregistrement APNs sur le backend. Sans ce
    /// throttle, un cold start declenche typiquement DEUX POSTs successifs
    /// (re-register du token persiste + register du token natif fraichement
    /// recu par iOS), qui sont strictement identiques. Au-dela du cooldown
    /// on accepte de re-poster, car le serveur peut avoir perdu l'association
    /// (changement de compte sur le meme device, p.ex.).
    static let registrationCooldown: TimeInterval = 300

    /// Injectable so tests can supply an isolated suite instead of
    /// polluting `UserDefaults.standard` (a shared mutable singleton on
    /// iOS Simulator). The production shared instance still uses
    /// `.standard` via the convenience init.
    private let userDefaults: UserDefaults
    private let keychainStore: any KeychainStoring

    /// Token dont l'enregistrement réseau est EN COURS. Le cooldown persisté
    /// (`lastRegisteredAtKey`) n'est écrit qu'APRÈS le POST réussi : sur réseau
    /// lent (POST 9-14s), les 3 déclencheurs du cold start (callback APNs natif
    /// + `reRegisterTokenIfNeeded` au login, ×2 chemins) lisent tous
    /// `lastAt == nil` et postent en parallèle. Cette réservation en mémoire
    /// (sûre car @MainActor) coupe les doublons avant le réseau.
    private var inFlightTokenRegistration: String?

    override private convenience init() {
        self.init(userDefaults: .standard, keychainStore: KeychainManager.shared)
    }

    public init(userDefaults: UserDefaults, keychainStore: any KeychainStoring) {
        self.userDefaults = userDefaults
        self.keychainStore = keychainStore
        super.init()
        migrateDeviceTokenFromUserDefaultsIfNeeded()
        deviceToken = keychainStore.load(forKey: Self.persistedTokenKey, account: nil)
    }

    private func migrateDeviceTokenFromUserDefaultsIfNeeded() {
        if let legacyToken = userDefaults.string(forKey: Self.persistedTokenKey) {
            if keychainStore.load(forKey: Self.persistedTokenKey, account: nil) == nil {
                try? keychainStore.save(legacyToken, forKey: Self.persistedTokenKey, account: nil)
            }
            userDefaults.removeObject(forKey: Self.persistedTokenKey)
        }
        if let legacyLastRegistered = userDefaults.string(forKey: Self.lastRegisteredTokenKey) {
            if keychainStore.load(forKey: Self.lastRegisteredTokenKey, account: nil) == nil {
                try? keychainStore.save(legacyLastRegistered, forKey: Self.lastRegisteredTokenKey, account: nil)
            }
            userDefaults.removeObject(forKey: Self.lastRegisteredTokenKey)
        }
    }

    // MARK: - APNs Environment

    /// The APNs environment baked into this build. Mirrors the entitlement's
    /// `aps-environment` key — debug builds get sandbox tokens; release builds
    /// get production tokens. The gateway uses this to route to the correct
    /// Apple endpoint (api.sandbox.push.apple.com vs api.push.apple.com).
    /// Hard-coded at compile time so a release build cannot accidentally
    /// claim to be sandbox (or vice-versa) at runtime.
    public static let apnsEnvironment: String = {
        #if DEBUG
        return "development"
        #else
        return "production"
        #endif
    }()

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
        try? keychainStore.save(token, forKey: Self.persistedTokenKey, account: nil)
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
        keychainStore.delete(forKey: Self.persistedTokenKey, account: nil)
        keychainStore.delete(forKey: Self.lastRegisteredTokenKey, account: nil)
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

    // MARK: - Session quiesce (P1 — logout)

    /// Purge l'état session-bound : payload de navigation pending et
    /// deviceToken (en mémoire + Keychain). NE touche PAS `isAuthorized` —
    /// c'est la permission système iOS, device-level, persistante. La toucher
    /// au logout provoquerait un re-prompt utilisateur qu'iOS rate-limit.
    /// Le binding user↔token côté gateway est désinscrit via
    /// `unregisterDeviceToken()` (POST /auth/logout). Câblée depuis
    /// `AuthManager.logout()`.
    public func resetSession() {
        pendingNotificationPayload = nil
        deviceToken = nil
        keychainStore.delete(forKey: Self.persistedTokenKey, account: nil)
        keychainStore.delete(forKey: Self.lastRegisteredTokenKey, account: nil)
        userDefaults.removeObject(forKey: Self.lastRegisteredAtKey)
    }

    /// Émet le conversationId sur `messageNotificationReceived` quand une
    /// notification entrante dénote une activité de message — pour que la
    /// liste de conversations remonte la ligne. NE touche PAS
    /// `pendingNotificationPayload` : c'est un signal de tri, pas une
    /// intention de navigation. Accepte les deux formes de payload : push
    /// d'alerte (`type == "message"`) et push silencieux (présence d'un
    /// `messageId`).
    public func noteMessageActivity(userInfo: [AnyHashable: Any]) {
        guard let conversationId = userInfo["conversationId"] as? String,
              !conversationId.isEmpty else { return }
        let isMessage = (userInfo["type"] as? String) == "message"
            || (userInfo["messageId"] as? String)?.isEmpty == false
        guard isMessage else { return }
        messageNotificationReceived.send(conversationId)
    }

    // MARK: - Badge

    /// Reset the app badge count to zero.
    ///
    /// - Warning: Direct badge writes bypass `NotificationCoordinator`, which owns
    ///   the alignment between the app icon, widgets and the in-app bell. Prefer
    ///   `NotificationCoordinator.shared.reset()` — this method only remains for
    ///   legacy callers and will be removed.
    @available(*, deprecated, message: "Use NotificationCoordinator.shared.reset() so the widget / in-app bell stay aligned.")
    public func resetBadge() async {
        try? await UNUserNotificationCenter.current().setBadgeCount(0)
    }

    /// Update the app badge count to reflect total unread conversations.
    ///
    /// - Warning: Direct badge writes bypass `NotificationCoordinator`, which owns
    ///   the alignment between the app icon, widgets and the in-app bell. Prefer
    ///   pushing conversation state through `NotificationCoordinator.shared`.
    @available(*, deprecated, message: "Route through NotificationCoordinator.shared instead so widgets stay aligned.")
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

        // Idempotence: skip if the EXACT same token was registered in the
        // recent past. Cold start typically chains `reRegisterTokenIfNeeded`
        // (persisted token from previous session) with `registerDeviceToken`
        // (native callback firing right after) — both posted the same token
        // back-to-back, generating duplicate 10s+ POSTs in the slow-request log.
        let now = Date()
        let lastToken = keychainStore.load(forKey: Self.lastRegisteredTokenKey, account: nil)
        let lastAt = userDefaults.object(forKey: Self.lastRegisteredAtKey) as? Date
        if lastToken == token,
           let lastAt,
           now.timeIntervalSince(lastAt) < Self.registrationCooldown {
            logger.debug("Skipping token registration: same token registered \(Int(now.timeIntervalSince(lastAt)))s ago")
            return
        }

        // Réservation in-flight : empêche les appelants concurrents (callback
        // APNs + reRegisterTokenIfNeeded au login) de poster le MÊME token en
        // parallèle avant que le premier POST n'ait persisté son timestamp.
        guard inFlightTokenRegistration != token else {
            logger.debug("Skipping token registration: same token already in flight")
            return
        }
        inFlightTokenRegistration = token
        defer { inFlightTokenRegistration = nil }

        let request = RegisterDeviceTokenRequest(
            token: token,
            platform: "ios",
            type: "apns",
            apnsEnvironment: Self.apnsEnvironment
        )

        do {
            let _: APIResponse<RegisterDeviceTokenResponse> = try await APIClient.shared.post(
                endpoint: "/users/register-device-token",
                body: request
            )
            try? keychainStore.save(token, forKey: Self.lastRegisteredTokenKey, account: nil)
            userDefaults.set(now, forKey: Self.lastRegisteredAtKey)
            logger.info("Device token registered with backend (env=\(Self.apnsEnvironment))")
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
    public let senderDisplayName: String?
    public let senderAvatar: String?
    public let postId: String?
    public let postType: String?
    public let title: String?
    public let body: String?

    public init(userInfo: [AnyHashable: Any]) {
        self.type = userInfo["type"] as? String
        self.conversationId = userInfo["conversationId"] as? String
        self.messageId = userInfo["messageId"] as? String
        self.senderId = userInfo["senderId"] as? String
        self.senderUsername = userInfo["senderUsername"] as? String
        let rawDisplayName = userInfo["senderDisplayName"] as? String ?? ""
        self.senderDisplayName = rawDisplayName.isEmpty ? nil : rawDisplayName
        let rawAvatar = userInfo["senderAvatar"] as? String ?? ""
        self.senderAvatar = rawAvatar.isEmpty ? nil : rawAvatar
        let rawPostId = userInfo["postId"] as? String ?? ""
        self.postId = rawPostId.isEmpty ? nil : rawPostId
        let rawPostType = userInfo["postType"] as? String ?? ""
        self.postType = rawPostType.isEmpty ? nil : rawPostType

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
