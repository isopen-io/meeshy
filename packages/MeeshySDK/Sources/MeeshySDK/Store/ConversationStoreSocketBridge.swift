import Foundation
import os
import Combine

/// Bridges real-time socket broadcasts to the conversation/category stores.
///
/// Subscribes to `MessageSocketManager` publishers and routes each event to
/// the matching store mutator. Mapping socket payload → store input lives
/// here so the stores stay transport-agnostic and the socket layer stays
/// store-agnostic.
///
/// Scope — the broadcasts routed to the store:
/// - `conversation:updated`        → `ConversationStore.applyConversationUpdated`
///   (bump-to-top on new message + metadata changes: title, avatar, …)
/// - `conversation:deleted`        → `ConversationStore.applyConversationDeleted`
/// - `conversation:participant-left` / `-banned`, MOI pour sujet
///                                 → `ConversationStore.applyConversationDeleted`
/// - `user:preferences-updated` (conversation scope, versioned)
///                                 → `ConversationStore.applyRemote`
/// - `user:preferences-reordered`  → `ConversationStore.applyRemoteReorder`
/// - `user:updated`                → `ConversationStore.applyUserUpdated`
///   (profil public d'un contact : nom, avatar, bannière)
/// - `read-status:updated`         → `ConversationStore.applyReadReceipt`
/// - `user:updated`                → `ConversationStore.applyUserUpdated`
///   (profil public d'un CONTACT : nom, avatar, bannière — seule la ligne
///   d'une conversation directe avec lui bouge)
/// - `category:created/updated/deleted` + `categories:reordered`
///                                 → `UserCategoryStore.applyRemote`
///
/// `read-status:updated` mutates the CURRENT user's own state (multi-device
/// read sync). It is applied only when (a) `type == "read"` — a `received`
/// delivery never advances a read cursor — (b) both `lastReadAt` and
/// `unreadCount` are present (they travel together; the gateway omits them on
/// non-`read` broadcasts), and (c) `event.userId == currentUserId`, since the
/// same broadcast also reaches peers (for checkmarks) and a peer reading must
/// not move our cursor. The store's monotone `lastReadAt` guard then drops any
/// receipt not strictly newer than the local cursor.
///
/// `@MainActor`: subscriptions and `cancellables` live on the main thread
/// (publishers deliver on main via `MessageSocketManager.decode`); each sink
/// hops to the target actor via `Task { await … }`.
@MainActor
public final class ConversationStoreSocketBridge {
    public static let shared = ConversationStoreSocketBridge()

    private var cancellables = Set<AnyCancellable>()
    private let store: ConversationStore
    private let categoryStore: UserCategoryStore
    /// Resolves the signed-in user's id for the read-receipt identity gate.
    /// Injected for testability; production reads it from `AuthManager`.
    private let currentUserId: @Sendable () async -> String?

    public init(
        store: ConversationStore = .shared,
        categoryStore: UserCategoryStore = .shared,
        currentUserId: @escaping @Sendable () async -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.store = store
        self.categoryStore = categoryStore
        self.currentUserId = currentUserId
    }

    /// Wire the shared socket manager's broadcasts to the stores.
    ///
    /// `onReadingModePreferenceChanged` — G-124, volet « préférence serveur »
    /// de P7. `MeeshySDK` ne connaît pas `ReadingModePreference` (type
    /// app-level, `ReadingModeOrchestrator.swift`) ni le magasin scopé qui le
    /// persiste (`LentilleScopedReadingModePreferenceStore`) : ce callback est
    /// le seul point où le SDK expose la valeur BRUTE reçue
    /// (`Preferences.readingMode`, raw `auto|focal|script|resume|riviere`)
    /// sans lui-même écrire quoi que ce soit — l'app décide où/si elle
    /// persiste. `nil` (défaut) préserve le comportement d'avant ce lot pour
    /// tout appelant qui ne branche rien.
    public func activate(
        socket: MessageSocketManager = .shared,
        onReadingModePreferenceChanged: (@Sendable (_ conversationId: String, _ readingMode: String) -> Void)? = nil
    ) {
        activate(
            conversationUpdated: socket.conversationUpdated.eraseToAnyPublisher(),
            conversationDeleted: socket.conversationDeleted.eraseToAnyPublisher(),
            participantLeft: socket.participantSelfLeft.eraseToAnyPublisher(),
            participantBanned: socket.participantBanned.eraseToAnyPublisher(),
            userPreferencesUpdated: socket.userPreferencesConversationUpdated.eraseToAnyPublisher(),
            userPreferencesReordered: socket.userPreferencesReordered.eraseToAnyPublisher(),
            userUpdated: socket.userUpdated.eraseToAnyPublisher(),
            readStatusUpdated: socket.readStatusUpdated.eraseToAnyPublisher(),
            categoryCreated: socket.categoryCreated.eraseToAnyPublisher(),
            categoryUpdated: socket.categoryUpdated.eraseToAnyPublisher(),
            categoryDeleted: socket.categoryDeleted.eraseToAnyPublisher(),
            categoriesReordered: socket.categoriesReordered.eraseToAnyPublisher(),
            didReconnect: socket.didReconnect.eraseToAnyPublisher(),
            onReadingModePreferenceChanged: onReadingModePreferenceChanged
        )
    }

    /// Publisher-injected variant (testable without a live socket). Idempotent:
    /// drops any prior subscriptions before re-wiring.
    func activate(
        conversationUpdated: AnyPublisher<ConversationUpdatedEvent, Never>,
        conversationDeleted: AnyPublisher<ConversationDeletedSocketEvent, Never>,
        participantLeft: AnyPublisher<ParticipantLeftEvent, Never> = Empty().eraseToAnyPublisher(),
        participantBanned: AnyPublisher<ParticipantBannedEvent, Never> = Empty().eraseToAnyPublisher(),
        userPreferencesUpdated: AnyPublisher<UserPreferencesConversationUpdatedSocketEvent, Never>,
        userPreferencesReordered: AnyPublisher<UserPreferencesReorderedSocketEvent, Never>,
        userUpdated: AnyPublisher<UserUpdatedEvent, Never> = Empty().eraseToAnyPublisher(),
        readStatusUpdated: AnyPublisher<ReadStatusUpdateEvent, Never>,
        categoryCreated: AnyPublisher<CategorySocketEvent, Never>,
        categoryUpdated: AnyPublisher<CategorySocketEvent, Never>,
        categoryDeleted: AnyPublisher<CategoryDeletedSocketEvent, Never>,
        categoriesReordered: AnyPublisher<CategoriesReorderedSocketEvent, Never>,
        didReconnect: AnyPublisher<Void, Never> = Empty().eraseToAnyPublisher(),
        onReadingModePreferenceChanged: (@Sendable (_ conversationId: String, _ readingMode: String) -> Void)? = nil
    ) {
        cancellables.removeAll()
        let store = self.store
        let categoryStore = self.categoryStore
        let currentUserId = self.currentUserId

        conversationUpdated.sink { event in
            Task { await store.applyConversationUpdated(Self.mapConversationUpdated(event)) }
        }.store(in: &cancellables)

        conversationDeleted.sink { event in
            Task { await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: event.conversationId)) }
        }.store(in: &cancellables)

        // Quitter, être retiré, être banni : trois manières de perdre une
        // appartenance, et pour le store elles disent la même chose que
        // `conversation:deleted` — cette conversation n'est plus à moi.
        // `GET /conversations` filtre sur `participants.some({ userId,
        // isActive: true })`, donc la ligne a disparu côté serveur ; la garder
        // en RAM laissait son non-lu peser sur l'agrégat inter-conversations.
        //
        // Le gate d'identité est le même que celui de `readStatusUpdated`
        // ci-dessous, et pour la même raison : ces deux broadcasts atteignent
        // AUSSI les pairs (l'effectif, les coches), et le départ d'un pair ne
        // retire évidemment rien de ma liste. `me.isEmpty` écarte la fenêtre
        // où l'auth n'est pas encore résolue, sans quoi un payload au `userId`
        // vide retirerait une ligne au hasard.
        participantLeft.sink { event in
            Task {
                // `names(_:)` et non `userId == me` : une identité iOS est un
                // `User.id` pour un compte et un `Participant.id` pour un
                // visiteur de lien partagé. L'événement porte les deux faces —
                // ne comparer qu'à l'une rate systématiquement l'autre.
                guard let me = await currentUserId(), event.names(me) else { return }
                await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: event.conversationId))
            }
        }.store(in: &cancellables)

        // Sans gate sur `didEndMembership` : ce drapeau protège un COMPTEUR, et
        // il n'y a pas de compteur à protéger sur une ligne qui s'en va. Un ban
        // qui suit un départ non synchronisé porte précisément
        // `membershipEnded: false`, et c'est le cas où la ligne fantôme est
        // encore là. `applyConversationDeleted` est déjà un no-op sur une
        // conversation inconnue.
        participantBanned.sink { event in
            Task {
                guard let me = await currentUserId(), event.names(me) else { return }
                await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: event.conversationId))
            }
        }.store(in: &cancellables)

        userPreferencesUpdated.sink { event in
            let remote = Self.mapPreferences(event)
            Task { await store.applyRemote(remote) }
            // G-124 — volet séparé de `applyRemote` ci-dessus : `readingMode`
            // n'est PAS un champ de `userState`/`RemotePreferencesPayload`
            // (préférence de LECTURE, pas d'organisation), donc pas question
            // de le glisser dans `mapPreferences`. `reset == true` porte
            // `preferences == nil` — rien à relayer, l'app garde sa valeur
            // locale (même posture que le reste de ce sink sur un reset).
            if let readingMode = event.preferences?.readingMode {
                onReadingModePreferenceChanged?(event.conversationId, readingMode)
            }
        }.store(in: &cancellables)

        readStatusUpdated.sink { event in
            // Only a 'read' advances the read cursor; 'received' is delivery
            // and must NOT touch unread state (mirrors ConversationSyncEngine's
            // type gate). The frontier and its count travel together — require
            // both so a partial/legacy payload can never coerce the badge to a
            // bogus 0. The broadcast also reaches peers (for checkmarks), so we
            // additionally gate on identity: only the actor's own devices may
            // advance the cursor. The store's monotone `lastReadAt` guard then
            // drops anything not strictly newer than the local cursor.
            //
            // Le serveur a depuis resserré l'ADRESSAGE de son côté : la copie
            // de l'éventail ne porte plus ces deux champs, seule celle envoyée
            // à la room personnelle de l'acteur les porte. Les deux gardes
            // ci-dessous restent nécessaires — un pair reçoit toujours
            // l'événement (les coches en dépendent), il n'en reçoit plus
            // l'arriéré — et elles sont ce qui rend la bascule serveur
            // indolore : ce qui disparaît du payload d'un pair est exactement
            // ce que ce `guard` jetait déjà.
            guard event.type == "read",
                  let lastReadAt = event.lastReadAt,
                  let unreadCount = event.unreadCount else { return }
            Task {
                guard let me = await currentUserId(), event.userId == me else { return }
                await store.applyReadReceipt(ReadStatusEvent(
                    conversationId: event.conversationId,
                    unreadCount: unreadCount,
                    lastReadAt: lastReadAt
                ))
            }
        }.store(in: &cancellables)

        userPreferencesReordered.sink { event in
            let updates = event.updates.map { (convId: $0.conversationId, orderInCategory: $0.orderInCategory) }
            Task { await store.applyRemoteReorder(updates) }
        }.store(in: &cancellables)

        userUpdated.sink { event in
            Task { await store.applyUserUpdated(event) }
        }.store(in: &cancellables)

        categoryCreated.sink { event in
            Task { await categoryStore.applyRemote(.created(event.category)) }
        }.store(in: &cancellables)

        categoryUpdated.sink { event in
            Task { await categoryStore.applyRemote(.updated(event.category)) }
        }.store(in: &cancellables)

        categoryDeleted.sink { event in
            Task { await categoryStore.applyRemote(.deleted(id: event.categoryId)) }
        }.store(in: &cancellables)

        categoriesReordered.sink { event in
            let updates = event.updates.map { (id: $0.categoryId, order: $0.order) }
            Task { await categoryStore.applyRemote(.reordered(updates: updates)) }
        }.store(in: &cancellables)

        didReconnect.sink {
            Task { await store.flushOutbox() }
            Task {
                do {
                    try await categoryStore.hydrate()
                } catch {
                    // Les catégories restent celles du dernier chargement.
                    Logger.socket.error("Category store hydration failed after socket event: \(error.localizedDescription, privacy: .public)")
                }
            }
        }.store(in: &cancellables)
    }

    /// Drop all subscriptions (e.g. on logout).
    public func deactivate() {
        cancellables.removeAll()
    }

    /// Map a `conversation:updated` socket event onto the store's input value
    /// type. Pure + `nonisolated` so the sink can build it before hopping to
    /// the store actor.
    nonisolated static func mapConversationUpdated(
        _ event: ConversationUpdatedEvent
    ) -> ConversationUpdatedStoreEvent {
        ConversationUpdatedStoreEvent(
            conversationId: event.conversationId,
            lastMessageAt: event.lastMessageAt,
            lastMessage: event.lastMessage,
            lastMessagePreview: event.lastMessagePreview,
            lastMessageTranslations: event.lastMessageTranslations,
            lastMessageOriginalLanguage: event.lastMessageOriginalLanguage,
            // Décodée par `ConversationUpdatedEvent` depuis le cycle 50, mais
            // jamais transmise : ce mapping manuel est le point exact où
            // l'épingle se perdait. Un champ décodé et non mappé est aussi
            // inerte qu'un champ absent du fil — cf. le témoin du drapeau
            // `previewRecalculated` juste au-dessus, posé pour cette raison.
            location: event.location,
            previewRecalculated: event.previewRecalculated,
            title: event.title,
            avatar: event.avatar,
            description: event.description,
            banner: event.banner,
            isAnnouncementChannel: event.isAnnouncementChannel,
            defaultWriteRole: event.defaultWriteRole,
            slowModeSeconds: event.slowModeSeconds,
            autoTranslateEnabled: event.autoTranslateEnabled
        )
    }

    /// Map the conversation-scope socket payload onto the store's input value
    /// type. Pure + `nonisolated` so the sink can build it before hopping to
    /// the store actor. `preferences == nil` (a reset/DELETE) is preserved —
    /// `applyRemote` restores defaults in that case.
    nonisolated static func mapPreferences(
        _ event: UserPreferencesConversationUpdatedSocketEvent
    ) -> UserPreferencesUpdatedRemote {
        UserPreferencesUpdatedRemote(
            userId: event.userId,
            conversationId: event.conversationId,
            version: event.version,
            reset: event.reset,
            preferences: event.preferences.map { p in
                RemotePreferencesPayload(
                    isPinned: p.isPinned,
                    isMuted: p.isMuted,
                    mentionsOnly: p.mentionsOnly,
                    isArchived: p.isArchived,
                    tags: p.tags,
                    categoryId: p.categoryId,
                    orderInCategory: p.orderInCategory,
                    customName: p.customName,
                    reaction: p.reaction,
                    deletedForUserAt: p.deletedForUserAt,
                    clearHistoryBefore: p.clearHistoryBefore
                )
            }
        )
    }
}
