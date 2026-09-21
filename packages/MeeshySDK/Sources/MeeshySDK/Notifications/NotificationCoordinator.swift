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

    /// Nombre de CONVERSATIONS non lues, hors muettes et hors conversation
    /// affichée. Alimente le badge d'icône et le compteur du widget.
    ///
    /// **D-L1 (#7236) : on compte des conversations, jamais la somme de leurs
    /// messages.** Une conversation à douze messages non lus pèse UN — comme
    /// WhatsApp, et surtout comme l'`aps.badge` que le serveur pousse
    /// (`computeConversationUnreadBadge`, G3 #7218). Deux formules faisaient
    /// clignoter l'icône : le nombre arrivait par la push, puis le premier
    /// plan le remplaçait par un autre, plus grand, pour un état identique.
    ///
    /// **Projection du registre de lecture, plus une copie** (#6998). Ce
    /// coordinateur tenait sa propre carte `conversationId → Int` et sa propre
    /// formule de total — la cinquième copie du non-lu, et la deuxième des
    /// trois formules qui coexistaient (le moteur excluait la conversation
    /// ouverte, celle-ci les muettes, le ViewModel n'excluait rien). Le nombre
    /// vient désormais de `ConversationReadLedger.conversationUnreadTotal(excludingOpen:)`,
    /// qui est le seul à le calculer ; `@Published` reste pour les abonnés.
    @Published public private(set) var conversationUnreadTotal: Int = 0

    /// Per-conversation unread counts — projection du registre, jamais un
    /// magasin. Sert les surfaces qui rendent une LIGNE : une conversation
    /// muette garde sa pastille, seul le total la tait.
    public var conversationUnreadCounts: [String: Int] { ledger.counts() }

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

    /// **Le registre de lecture** — la source unique du non-lu de conversation
    /// (#6998). Injecté : la production partage `.shared` avec les autres
    /// surfaces (c'est tout l'intérêt), les tests en reçoivent un neuf pour ne
    /// pas hériter de l'état d'un voisin.
    ///
    /// L'état MUET y vit aussi, et le `Set` que ce coordinateur tenait a
    /// disparu avec : une conversation muette garde son compteur de LIGNE mais
    /// ne gonfle pas l'agrégat qu'on l'a mise en sourdine pour faire taire —
    /// c'est la borne `excludingMuted` du total, une seule fois pour toutes les
    /// surfaces.
    private let ledger: ConversationReadLedger

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
        openConversationIdProvider: @escaping @MainActor () -> String? = { MessageSocketManager.shared.activeConversationId },
        ledger: ConversationReadLedger = .shared
    ) {
        self.badgeWriter = badgeWriter
        self.appGroupDefaults = UserDefaults(suiteName: appGroupSuiteName)
        self.currentUserIdProvider = currentUserIdProvider
        self.badgeEnabledProvider = badgeEnabledProvider
        self.badgeEnabledChanges = badgeEnabledChanges
        self.openConversationIdProvider = openConversationIdProvider
        self.ledger = ledger
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
        ledger.reset()
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
        // `.cache` : ces lignes viennent d'une republication de liste, pas
        // d'une lecture serveur fraîche. Elles SÈMENT les conversations
        // inconnues, rafraîchissent l'état muet, et ne piétinent jamais un
        // compteur que le socket possède déjà — la sémantique historique de
        // cette méthode, désormais DÉCLARÉE au lieu d'être déduite du nom de
        // l'appelant.
        syncOpenConversation()
        ledger.apply(.snapshot(rows: conversations.map(ConversationReadRow.init), source: .cache))
        recomputeTotal()
        widgetSink?.publishConversations(conversations)
        widgetSink?.publishFavoriteContacts(conversations)
        scheduleSync()
    }

    /// Forcibly re-seed every count from the given snapshot — destructive for
    /// tracked keys. Intended for post-reconnect resync or a completed full sync
    /// where the caller has authoritative data.
    public func reconcileConversationUnreads(_ conversations: [MeeshyConversation]) {
        hasAuthoritativeSnapshot = true
        // `.server` : l'appelant GARANTIT que ces lignes viennent du serveur.
        // Elles écrasent les compteurs suivis ET retirent ce qu'elles ne
        // nomment plus — c'est la seule forme qui peut remettre le badge à
        // zéro après une lecture faite sur un AUTRE appareil pendant que
        // celui-ci dormait (aucun socket ne la rapporte).
        syncOpenConversation()
        ledger.apply(.snapshot(rows: conversations.map(ConversationReadRow.init), source: .server))
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
    ///
    /// Le `guard` sur ce que le registre RETIRE (et non sur ce qu'il contient)
    /// garde l'idempotence : oublier un id inconnu ne réveille aucun débounce,
    /// donc n'écrit ni le badge ni le widget.
    public func removeConversation(_ conversationId: String) {
        guard ledger.apply(.forget(conversationId: conversationId)) != nil else { return }
        recomputeTotal()
        scheduleSync()
    }

    /// Apply a single conversation unread-count update (from the
    /// `conversation:unread-updated` socket event or the silent push).
    /// The count of the conversation currently OPEN on screen is clamped to 0:
    /// the user is looking at it, it can never be "unread" on the app icon.
    public func applyConversationUnread(conversationId: String, unreadCount: Int) {
        hasAuthoritativeSnapshot = true
        // Le gate « conversation ouverte » n'est plus posé ICI : il vit dans le
        // registre, qui l'applique en RANG 1 à tout événement. Le coordinateur
        // ne fait que lui dire quelle conversation est visible.
        syncOpenConversation()
        let before = ledger.state(for: conversationId)?.unreadCount
        ledger.apply(.serverUnread(conversationId: conversationId, unreadCount: unreadCount))
        // Idempotence : un compteur identique ne réveille pas le débounce, donc
        // n'écrit ni le badge ni le widget.
        guard ledger.state(for: conversationId)?.unreadCount != before else { return }
        recomputeTotal()
        scheduleSync()
    }

    /// Mark a conversation as fully read locally — called when the user opens it.
    public func markConversationRead(_ conversationId: String) {
        guard let existing = ledger.state(for: conversationId)?.unreadCount, existing > 0 else { return }
        ledger.apply(.localMarkRead(conversationId: conversationId))
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

    /// Dit au registre quelle conversation est VISIBLE, et seulement quand ça
    /// change — une écriture par événement ferait battre le publisher du
    /// registre pour rien.
    ///
    /// Le coordinateur reste, pour l'instant, le seul à alimenter ce curseur,
    /// depuis son `openConversationIdProvider`. Unifier les TROIS producteurs
    /// de « conversation ouverte » (`ConversationSyncEngine`,
    /// `MessageSocketManager.activeConversationId`,
    /// `NotificationToastManager.onConversationOpened`) reste à faire — c'est
    /// la suite de #6998, et c'est ce qui fera du registre le seul à le SAVOIR
    /// autant qu'il en est déjà le seul à le STOCKER.
    private func syncOpenConversation() {
        let visible = openConversationIdProvider()
        guard ledger.openConversationId != visible else { return }
        ledger.apply(.localOpen(conversationId: visible))
    }

    /// Le badge d'icône et le widget comptent les AUTRES conversations, et
    /// jamais les muettes. **Une seule formule, et elle n'est plus ici** : elle
    /// est au registre, qui la sert à toutes les surfaces avec les bornes que
    /// chacune DÉCLARE.
    ///
    /// Ce qu'on compte ici, ce sont des CONVERSATIONS (D-L1, #7236) : la somme
    /// des messages reste au registre pour les surfaces qui la montrent, elle
    /// n'est simplement pas ce que l'icône dit.
    private func recomputeTotal() {
        let total = ledger.conversationUnreadTotal(excludingOpen: true)
        if total != conversationUnreadTotal {
            conversationUnreadTotal = total
        }
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
