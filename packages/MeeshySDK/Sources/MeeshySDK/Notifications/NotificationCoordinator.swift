import Foundation
import Combine
import UserNotifications
import os

private let logger = Logger(subsystem: "me.meeshy.sdk", category: "notification-coordinator")

/// Sink that receives notification data for home/lock-screen widgets.
///
/// Kept as a protocol so the SDK does not link against WidgetKit — the app target
/// is free to publish to an App Group container / reload timelines.
@MainActor
public protocol NotificationWidgetSink: AnyObject {
    /// Publish the full conversation list (already sorted by the caller) to the widget store.
    func publishConversations(_ conversations: [MeeshyConversation])

    /// Publish only a total unread count — used for notification-only refreshes.
    func publishUnreadCount(_ count: Int)

    /// Publish favorite contacts (pinned direct conversations) to the widget store.
    func publishFavoriteContacts(_ conversations: [MeeshyConversation])

    /// Reload widget timelines. Called whenever the coordinator broadcasts a change.
    func reloadTimelines()

    /// appgroup-01 — wipe de logout : purge les clés widget ET les dossiers de
    /// staging de l'App Group, puis recharge les timelines. Le contenu du
    /// compte sortant ne doit ni rester affiché sur l'écran d'accueil ni être
    /// rejoué (partages différés, blobs NSE, mark-read) sous le compte suivant.
    func wipeAll()
}

/// Single source of truth that keeps the iOS badge, the home/lock widgets and the
/// in-app notification bell aligned.
///
/// The coordinator subscribes to socket events globally (not scoped to any view)
/// so counters stay correct even while the user is deep inside another screen.
///
/// Writes to the system badge go through a single choke point — no other class
/// should call `UNUserNotificationCenter.setBadgeCount` directly.
@MainActor
public final class NotificationCoordinator: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public static let shared = NotificationCoordinator()

    // MARK: - Published State

    /// Total of unread messages across every conversation. Drives the app icon badge
    /// and the widget's unread count.
    @Published public private(set) var conversationUnreadTotal: Int = 0

    /// Per-conversation unread counts (kept in sync via socket events).
    @Published public private(set) var conversationUnreadCounts: [String: Int] = [:]

    /// Count of unread in-app notifications (friend requests, mentions, reactions, …).
    /// Drives the in-app notification bell indicator only.
    @Published public private(set) var inAppNotificationUnread: Int = 0

    /// True once `start()` has wired up the socket subscriptions.
    @Published public private(set) var isRunning = false

    /// Value written to both the iOS badge and the widget unread counter.
    public var badgeTotal: Int { conversationUnreadTotal }

    // MARK: - Collaborators

    public weak var widgetSink: NotificationWidgetSink?
    private let badgeWriter: NotificationBadgeWriting
    private let appGroupDefaults: UserDefaults?
    /// Resolves the current user's id so the read-status reset only fires for
    /// OUR own reads. Injectable for tests; defaults to the auth singleton.
    private let currentUserIdProvider: @MainActor () -> String?

    /// Whether the app-icon badge is allowed to display a non-zero count.
    /// Mirrors the user's `notificationBadgeEnabled` preference so disabling the
    /// "Badges" toggle actually clears the icon badge. The widget/app-group
    /// counter is intentionally NOT gated (it's a distinct surface).
    private let badgeEnabledProvider: @MainActor () -> Bool

    /// Publisher des changements du toggle « Badges ». Injectable pour les
    /// tests ; `nil` → observation par défaut de
    /// `UserPreferencesManager.shared.$notification` au `start()`.
    private let badgeEnabledChanges: AnyPublisher<Bool, Never>?

    /// Conversation actuellement OUVERTE à l'écran. Le gateway émet
    /// `conversation:unread-updated` à TOUS les destinataires — y compris
    /// celui qui est en train de lire — et la push silencieuse fait de même :
    /// sans ce gate, le badge d'icône et le widget gonflent pour la
    /// conversation affichée, jusqu'à un `read-status:updated` qui peut ne
    /// jamais venir (lecture exacte scrollée dans l'historique). Miroir du
    /// gate `ConversationSyncEngine.handleUnreadUpdated`. Injectable pour les
    /// tests ; défaut = la conversation active du socket messages (posée par
    /// `NotificationToastManager.onConversationOpened`, nettoyée à la
    /// fermeture).
    private let openConversationIdProvider: @MainActor () -> String?

    /// Ids of conversations the user has muted. Muted conversations still show
    /// their unread badge on their own row, but MUST NOT nag the app-icon badge
    /// or the widget unread counter — the whole point of muting is to silence
    /// that aggregate. Kept in sync from every `registerConversations` /
    /// `reconcileConversationUnreads` snapshot (which carry `userState.isMuted`).
    private var mutedConversationIds: Set<String> = []

    private var cancellables = Set<AnyCancellable>()
    private var debounceTask: Task<Void, Never>?

    /// Vrai dès qu'une donnée de compteur d'origine serveur a été appliquée
    /// (snapshot `registerConversations` / `reconcileConversationUnreads`, ou
    /// delta socket `applyConversationUnread`). Tant que c'est faux — réveil
    /// background à froid : le process vient d'être relancé par une push
    /// silencieuse et le coordinateur est TOTALEMENT VIDE — `syncNow()` ne
    /// doit RIEN écrire : `badgeTotal == 0` écraserait l'`aps.badge` que la
    /// push vient de poser et le miroir App Group que la NSE vient d'écrire.
    private var hasAuthoritativeSnapshot = false

    // MARK: - Init

    public init(
        badgeWriter: NotificationBadgeWriting = SystemNotificationBadgeWriter(),
        appGroupSuiteName: String = "group.me.meeshy.apps",
        currentUserIdProvider: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
        badgeEnabledProvider: @escaping @MainActor () -> Bool = { UserPreferencesManager.shared.notification.notificationBadgeEnabled },
        badgeEnabledChanges: AnyPublisher<Bool, Never>? = nil,
        openConversationIdProvider: @escaping @MainActor () -> String? = { MessageSocketManager.shared.activeConversationId }
    ) {
        self.badgeWriter = badgeWriter
        self.appGroupDefaults = UserDefaults(suiteName: appGroupSuiteName)
        self.currentUserIdProvider = currentUserIdProvider
        self.badgeEnabledProvider = badgeEnabledProvider
        self.badgeEnabledChanges = badgeEnabledChanges
        self.openConversationIdProvider = openConversationIdProvider
    }

    // MARK: - Lifecycle

    /// Wire up socket subscriptions. Idempotent — calling it more than once is a no-op.
    public func start() {
        guard !isRunning else { return }
        subscribeToSocketEvents()
        subscribeToBadgePreference()
        isRunning = true
        logger.info("NotificationCoordinator started")
    }

    /// Basculer le toggle « Badges » réécrit l'icône immédiatement — sans ça,
    /// un badge résiduel reste affiché jusqu'au prochain event socket ou
    /// passage en background.
    private func subscribeToBadgePreference() {
        let changes = badgeEnabledChanges
            ?? UserPreferencesManager.shared.$notification
                .map(\.notificationBadgeEnabled)
                .removeDuplicates()
                .dropFirst()
                .eraseToAnyPublisher()
        changes
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.scheduleSync()
            }
            .store(in: &cancellables)
    }

    /// Tear down state on logout. Clears badge and cached counts.
    public func reset() {
        cancellables.removeAll()
        debounceTask?.cancel()
        debounceTask = nil
        conversationUnreadCounts = [:]
        mutedConversationIds = []
        conversationUnreadTotal = 0
        inAppNotificationUnread = 0
        let writer = badgeWriter
        Task { await writer.setBadgeCount(0) }
        // appgroup-01 — wipe App Group complet (clés widget + dossiers de
        // staging) au lieu du simple unread_count=0 : le contenu du compte
        // sortant ne doit ni rester affiché sur l'écran d'accueil ni être
        // rejoué sous le compte suivant. reset() n'est appelé en prod que sur
        // les chemins de logout, AVANT le flip isAuthenticated.
        appGroupDefaults?.set(0, forKey: Self.unreadCountKey)
        widgetSink?.wipeAll()
        widgetSink?.reloadTimelines()
        isRunning = false
        logger.info("NotificationCoordinator reset")
    }

    // MARK: - Public API
    //
    // Source-of-truth design (resolves the previous double-path issue):
    //
    //   applyConversationUnread(_:_:)  ← socket `conversation:unread-updated`
    //      AUTHORITATIVE. Server-driven, instant, always wins.
    //
    //   markConversationRead(_:)       ← user opens the thread
    //      Optimistic local write. Also authoritative vs. seeding.
    //
    //   registerConversations(_:)      ← VM snapshot (cache / REST)
    //      NON-authoritative. Seeds counts for conversations the coordinator
    //      has never seen and pushes the widget display list. It must never
    //      override a count already owned by the socket path — otherwise a
    //      stale cache snapshot could regress the badge right after a socket
    //      event landed.
    //
    //   reconcileConversationUnreads(_:) ← explicit post-reconnect / full-sync resync
    //      AUTHORITATIVE. Forcibly overwrites tracked counts. Use only when
    //      the caller guarantees the snapshot reflects the server's truth.

    /// Seed tracked unread counts from a VM/cache snapshot and push the widget
    /// display data. Counts that the coordinator already tracks are **not**
    /// overwritten — the socket path owns them.
    ///
    /// Safe to call on every conversation list mutation: it's idempotent for
    /// known conversations and only mutates state for newly-seen ones.
    public func registerConversations(_ conversations: [MeeshyConversation]) {
        hasAuthoritativeSnapshot = true
        var didChange = false
        for c in conversations where conversationUnreadCounts[c.id] == nil {
            conversationUnreadCounts[c.id] = c.userState.unreadCount
            didChange = true
        }
        // Mute state can flip on any snapshot (the user muted/unmuted a thread),
        // so refresh it for EVERY conversation here, not just newly-seen ones.
        if applyMuteState(from: conversations) { didChange = true }
        if didChange {
            recomputeTotal()
        }
        widgetSink?.publishConversations(conversations)
        widgetSink?.publishFavoriteContacts(conversations)
        scheduleSync()
    }

    /// Forcibly re-seed every count from the given snapshot — destructive for
    /// tracked keys. Intended for post-reconnect resync or a completed full sync
    /// where the caller has authoritative data.
    public func reconcileConversationUnreads(_ conversations: [MeeshyConversation]) {
        hasAuthoritativeSnapshot = true
        var counts: [String: Int] = [:]
        for c in conversations {
            counts[c.id] = c.userState.unreadCount
        }
        conversationUnreadCounts = counts
        mutedConversationIds = Set(conversations.filter { $0.userState.isMuted }.map(\.id))
        recomputeTotal()
        widgetSink?.publishConversations(conversations)
        widgetSink?.publishFavoriteContacts(conversations)
        scheduleSync()
    }

    /// Alias for `reconcileConversationUnreads` kept for API clarity when the
    /// caller wants "full replacement" semantics (e.g. VM full-sync completion).
    public func replaceConversations(_ conversations: [MeeshyConversation]) {
        reconcileConversationUnreads(conversations)
    }

    /// Forget a conversation entirely (user was removed from a group, conv deleted).
    public func removeConversation(_ conversationId: String) {
        guard conversationUnreadCounts.removeValue(forKey: conversationId) != nil else { return }
        mutedConversationIds.remove(conversationId)
        recomputeTotal()
        scheduleSync()
    }

    /// Apply a single conversation unread-count update (from the
    /// `conversation:unread-updated` socket event or the silent push).
    /// The count of the conversation currently OPEN on screen is clamped to 0:
    /// the user is looking at it, it can never be "unread" on the app icon.
    public func applyConversationUnread(conversationId: String, unreadCount: Int) {
        hasAuthoritativeSnapshot = true
        let isOpen = conversationId == openConversationIdProvider()
        let clamped = isOpen ? 0 : max(unreadCount, 0)
        if conversationUnreadCounts[conversationId] == clamped { return }
        conversationUnreadCounts[conversationId] = clamped
        recomputeTotal()
        scheduleSync()
    }

    /// Mark a conversation as fully read locally — called when the user opens it.
    public func markConversationRead(_ conversationId: String) {
        guard let existing = conversationUnreadCounts[conversationId], existing > 0 else { return }
        conversationUnreadCounts[conversationId] = 0
        recomputeTotal()
        scheduleSync()
    }

    /// U2 — reset a conversation's badge when THIS user reads it. The gateway
    /// broadcasts `conversation:unread-updated` to every recipient regardless of
    /// who has the conversation open (so the badge climbs while the user reads),
    /// and the mark-read route emits only `read-status:updated`, never an
    /// unread-updated=0. So the coordinator must zero the count on the read
    /// event. CRITICAL gate (mirrors ConversationSyncEngine.handleReadStatusUpdated):
    /// only on `type == "read"` by the current user — a `"received"` event means
    /// "the message reached this device", NOT "the user opened the conversation",
    /// and wiping on it would re-introduce the unread-badge flicker.
    public func handleReadStatusUpdated(_ event: ReadStatusUpdateEvent) {
        let me = currentUserIdProvider()
        let eventUser = event.userId ?? event.participantId
        guard event.type == "read", eventUser == me else { return }
        markConversationRead(event.conversationId)
    }

    /// Apply the `notification:counts` event from the gateway — mirrors the API bell count.
    public func applyInAppNotificationCounts(total: Int, unread: Int) {
        inAppNotificationUnread = max(unread, 0)
    }

    /// Set the in-app notification unread count directly (e.g. after a REST refresh).
    public func setInAppNotificationUnread(_ count: Int) {
        inAppNotificationUnread = max(count, 0)
    }

    /// Optimistic increment after receiving a `notification:new` socket event, before
    /// the server's `notification:counts` arrives.
    public func incrementInAppNotificationUnread() {
        inAppNotificationUnread += 1
    }

    /// Optimistic decrement after the user marks a single notification read.
    public func decrementInAppNotificationUnread() {
        inAppNotificationUnread = max(0, inAppNotificationUnread - 1)
    }

    // MARK: - Private

    private func subscribeToSocketEvents() {
        let socket = MessageSocketManager.shared

        socket.unreadUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyConversationUnread(
                    conversationId: event.conversationId,
                    unreadCount: event.unreadCount
                )
            }
            .store(in: &cancellables)

        socket.notificationCounts
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyInAppNotificationCounts(total: event.total, unread: event.unread)
            }
            .store(in: &cancellables)

        socket.readStatusUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleReadStatusUpdated(event)
            }
            .store(in: &cancellables)
    }

    /// Refreshes `mutedConversationIds` from a snapshot. Returns `true` if the
    /// muted set actually changed (so the caller knows to recompute the total).
    private func applyMuteState(from conversations: [MeeshyConversation]) -> Bool {
        var changed = false
        for c in conversations {
            if c.userState.isMuted {
                changed = mutedConversationIds.insert(c.id).inserted || changed
            } else if mutedConversationIds.remove(c.id) != nil {
                changed = true
            }
        }
        return changed
    }

    private func recomputeTotal() {
        let total = Self.unmutedTotal(counts: conversationUnreadCounts, mutedIds: mutedConversationIds)
        if total != conversationUnreadTotal {
            conversationUnreadTotal = total
        }
    }

    /// The app-icon / widget badge total: unread summed over UNMUTED
    /// conversations only. Muted threads keep their per-row badge but never
    /// inflate the aggregate the user muted them to silence. Pure + testable.
    static func unmutedTotal(counts: [String: Int], mutedIds: Set<String>) -> Int {
        counts.reduce(0) { $0 + (mutedIds.contains($1.key) ? 0 : $1.value) }
    }

    /// Debounce badge + widget writes so rapid socket bursts don't hammer the system.
    private func scheduleSync() {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled, let self else { return }
            await self.syncNow()
        }
    }

    /// Immediately push badge + widget updates. Exposed for tests and scene-phase callbacks.
    public func syncNow() async {
        // Réveil background à froid : rien n'a été hydraté, ne rien écraser
        // (préserve aps.badge et le miroir App Group posés par la push/NSE).
        guard hasAuthoritativeSnapshot else { return }
        let count = badgeTotal
        // La pref « Badges » ne gate QUE l'icône d'app ; le widget/app-group
        // (surface distincte) conserve le vrai total.
        let badgeCount = badgeEnabledProvider() ? count : 0
        await badgeWriter.setBadgeCount(badgeCount)
        appGroupDefaults?.set(count, forKey: Self.unreadCountKey)
        widgetSink?.publishUnreadCount(count)
        widgetSink?.reloadTimelines()
    }

    // MARK: - Constants

    static let unreadCountKey = "unread_count"
}

// MARK: - Badge Writer Abstraction

/// Abstracts `UNUserNotificationCenter.setBadgeCount` so tests can assert without
/// touching the system framework.
public protocol NotificationBadgeWriting: Sendable {
    func setBadgeCount(_ count: Int) async
}

public struct SystemNotificationBadgeWriter: NotificationBadgeWriting {
    public init() {}
    public func setBadgeCount(_ count: Int) async {
        try? await UNUserNotificationCenter.current().setBadgeCount(max(count, 0))
    }
}
