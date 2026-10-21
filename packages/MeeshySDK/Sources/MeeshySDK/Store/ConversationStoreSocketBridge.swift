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
/// - `conversation:restored`       → lecture bornée puis `ConversationStore.applyConversationRestored`
/// - `conversation:participant-left` / `-banned`, MOI pour sujet
///                                 → `ConversationStore.applyConversationDeleted`
/// - `user:preferences-updated` (conversation scope, versioned)
///                                 → `ConversationStore.applyRemote`
/// - `user:preferences-reordered`  → `ConversationStore.applyRemoteReorder`
/// - `user:updated`                → `ConversationStore.applyUserUpdated`
///   (profil public d'un contact : nom, avatar, bannière)
/// - `read-status:updated`         → `ConversationStore.applyReadReceipt`
/// - `conversation:unread-updated` → `ConversationStore.applyServerUnread`
///   (le SEUL fil qui porte le compteur de non-lus — #6997)
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
/// (publishers deliver on main via `MessageSocketManager.decode`); chaque
/// événement entre dans une file ordonnée (`OrderedEventLane`) dont le
/// consommateur unique l'applique au store, dans l'ordre d'arrivée.
@MainActor
public final class ConversationStoreSocketBridge {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public static let shared = ConversationStoreSocketBridge()

    private var cancellables = Set<AnyCancellable>()
    private var eventLane: OrderedEventLane?
    private var catchUpLane: OrderedEventLane?
    private let store: ConversationStore
    private let categoryStore: UserCategoryStore
    /// Resolves the signed-in user's id for the read-receipt identity gate.
    /// Injected for testability; production reads it from `AuthManager`.
    private let currentUserId: @Sendable @concurrent () async -> String?

    /// La lecture BORNÉE d'UNE conversation (#4389).
    ///
    /// `conversation:restored` dit qu'une ligne revient, sans la porter — sa
    /// charge est `{ userId, conversationId }`, miroir de la descendante. Il
    /// faut donc aller la chercher, et le geste est `GET /conversations/:id`,
    /// JAMAIS un rechargement de la liste : rejouer les pages écrase les
    /// écritures socket concurrentes et duplique une ligne à chaque frontière
    /// de page (la route paginant par offset sur `lastMessageAt` décroissant).
    /// C'est la règle que le web écrit noir sur blanc dans son `CLAUDE.md`, et
    /// elle vaut identiquement ici.
    ///
    /// Injectée pour que le bridge se teste sans réseau ; la production la
    /// branche sur `ConversationService.getById` projeté par
    /// `toConversation(currentUserId:)`. Rend `nil` quand la lecture échoue —
    /// une restauration ratée laisse la liste telle quelle, elle ne fabrique
    /// pas de ligne.
    private let fetchConversation: @Sendable @concurrent (_ conversationId: String, _ currentUserId: String) async -> MeeshyConversation?

    /// La conversation actuellement VISIBLE, lue au moment où un compteur
    /// arrive (#6997).
    ///
    /// C'est le gate de `handleUnreadUpdated` côté cache disque, et c'est
    /// volontairement LA MÊME valeur : le gateway diffuse le même `unreadCount`
    /// à tous les destinataires sans savoir qui regarde, et un compteur non nul
    /// sur la conversation qu'on lit est un mensonge visuel. Deux lectures de
    /// la même source ne peuvent pas diverger — deux gates dérivés séparément,
    /// si (c'est le défaut nommé par #6998).
    ///
    /// Injecté pour que le pont se teste sans le singleton du moteur.
    /// Multi-fenêtre : TOUTE conversation qu'une scène affiche, pas seulement la dernière ouverte.
    private let isConversationOpen: @Sendable (String) -> Bool

    public init(
        store: ConversationStore = .shared,
        categoryStore: UserCategoryStore = .shared,
        currentUserId: @escaping @Sendable () async -> String? = { AuthManager.shared.currentUser?.id },
        fetchConversation: @escaping @Sendable (_ conversationId: String, _ currentUserId: String) async -> MeeshyConversation? = { conversationId, me in
            guard let api = try? await ConversationService.shared.getById(conversationId) else { return nil }
            return api.toConversation(currentUserId: me)
        },
        isConversationOpen: @escaping @Sendable (String) -> Bool = { ConversationSyncEngine.shared.isConversationOpen($0) }
    ) {
        self.store = store
        self.categoryStore = categoryStore
        self.currentUserId = currentUserId
        self.fetchConversation = fetchConversation
        self.isConversationOpen = isConversationOpen
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
            conversationRestored: socket.conversationRestored.eraseToAnyPublisher(),
            participantLeft: socket.participantSelfLeft.eraseToAnyPublisher(),
            participantBanned: socket.participantBanned.eraseToAnyPublisher(),
            userPreferencesUpdated: socket.userPreferencesConversationUpdated.eraseToAnyPublisher(),
            userPreferencesReordered: socket.userPreferencesReordered.eraseToAnyPublisher(),
            userUpdated: socket.userUpdated.eraseToAnyPublisher(),
            readStatusUpdated: socket.readStatusUpdated.eraseToAnyPublisher(),
            unreadUpdated: socket.unreadUpdated.eraseToAnyPublisher(),
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
        conversationRestored: AnyPublisher<ConversationRestoredSocketEvent, Never> = Empty().eraseToAnyPublisher(),
        participantLeft: AnyPublisher<ParticipantLeftEvent, Never> = Empty().eraseToAnyPublisher(),
        participantBanned: AnyPublisher<ParticipantBannedEvent, Never> = Empty().eraseToAnyPublisher(),
        userPreferencesUpdated: AnyPublisher<UserPreferencesConversationUpdatedSocketEvent, Never>,
        userPreferencesReordered: AnyPublisher<UserPreferencesReorderedSocketEvent, Never>,
        userUpdated: AnyPublisher<UserUpdatedEvent, Never> = Empty().eraseToAnyPublisher(),
        readStatusUpdated: AnyPublisher<ReadStatusUpdateEvent, Never>,
        unreadUpdated: AnyPublisher<UnreadUpdateEvent, Never> = Empty().eraseToAnyPublisher(),
        categoryCreated: AnyPublisher<CategorySocketEvent, Never>,
        categoryUpdated: AnyPublisher<CategorySocketEvent, Never>,
        categoryDeleted: AnyPublisher<CategoryDeletedSocketEvent, Never>,
        categoriesReordered: AnyPublisher<CategoriesReorderedSocketEvent, Never>,
        didReconnect: AnyPublisher<Void, Never> = Empty().eraseToAnyPublisher(),
        onReadingModePreferenceChanged: (@Sendable (_ conversationId: String, _ readingMode: String) -> Void)? = nil
    ) {
        cancellables.removeAll()
        let events = OrderedEventLane()
        let catchUp = OrderedEventLane()
        events.store(in: &cancellables)
        catchUp.store(in: &cancellables)
        eventLane = events
        catchUpLane = catchUp
        let feeds = ConversationStoreSocketFeeds(
            conversationUpdated: conversationUpdated,
            conversationDeleted: conversationDeleted,
            conversationRestored: conversationRestored,
            participantLeft: participantLeft,
            participantBanned: participantBanned,
            userPreferencesUpdated: userPreferencesUpdated,
            userPreferencesReordered: userPreferencesReordered,
            userUpdated: userUpdated,
            readStatusUpdated: readStatusUpdated,
            unreadUpdated: unreadUpdated,
            categoryCreated: categoryCreated,
            categoryUpdated: categoryUpdated,
            categoryDeleted: categoryDeleted,
            categoriesReordered: categoriesReordered,
            didReconnect: didReconnect
        )
        wireConversationEvents(feeds, on: events)
        wireMembershipEvents(feeds, on: events)
        wirePreferenceEvents(feeds, on: events, onReadingModePreferenceChanged: onReadingModePreferenceChanged)
        wireReadEvents(feeds, on: events)
        wireCategoryEvents(feeds, on: events)
        wireCatchUp(feeds, on: catchUp)
    }

    /// Barrière des tests : rend la main quand tout ce qui a été reçu avant
    /// l'appel est appliqué.
    func awaitPendingEvents() async {
        await eventLane?.barrier()
        await catchUpLane?.barrier()
    }

    // UN SEUL consommateur sérialisé pour tout ce qui mute le store (#11047) :
    // `conversation:restored` attend sa lecture réseau, et un
    // `conversation:deleted` arrivé ENSUITE s'appliquait avant elle — la
    // conversation supprimée en dernier réapparaissait.
    private func wireConversationEvents(_ feeds: ConversationStoreSocketFeeds, on lane: OrderedEventLane) {
        let store = self.store
        let currentUserId = self.currentUserId
        let fetch = self.fetchConversation

        // Le lecteur est résolu DANS la tâche : `currentUserId` est
        // asynchrone, et c'est lui qui décide si l'auteur du dernier
        // message se dit « Toi » (#6921).
        feeds.conversationUpdated
            .relay(through: lane) { event in
                let reader = await currentUserId()
                await store.applyConversationUpdated(Self.mapConversationUpdated(event, readerId: reader))
            }
            .store(in: &cancellables)

        feeds.conversationDeleted
            .relay(through: lane) { event in
                await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: event.conversationId))
            }
            .store(in: &cancellables)

        // La MONTANTE du couple (#4389). Le gate d'identité est celui des
        // autres broadcasts personnels : un payload au `userId` vide — la
        // fenêtre où l'auth n'est pas encore résolue — ne doit ramener aucune
        // ligne au hasard.
        feeds.conversationRestored
            .relay(through: lane) { event in
                guard let myId = await currentUserId(), !myId.isEmpty, event.userId == myId else { return }
                guard let conversation = await fetch(event.conversationId, myId) else { return }
                await store.applyConversationRestored(conversation)
            }
            .store(in: &cancellables)

        feeds.userUpdated
            .relay(through: lane) { event in await store.applyUserUpdated(event) }
            .store(in: &cancellables)
    }

    // Quitter, être retiré, être banni : trois manières de perdre une
    // appartenance, et pour le store elles disent la même chose que
    // `conversation:deleted` — cette conversation n'est plus à moi. Ces deux
    // broadcasts atteignent AUSSI les pairs : le départ d'un pair ne retire
    // rien de ma liste, d'où le gate d'identité. `names(_:)` et non
    // `userId == me` : une identité iOS est un `User.id` pour un compte et un
    // `Participant.id` pour un visiteur de lien partagé. Sans gate sur
    // `didEndMembership` : un ban qui suit un départ non synchronisé porte
    // `membershipEnded: false`, et c'est le cas où la ligne fantôme est encore là.
    private func wireMembershipEvents(_ feeds: ConversationStoreSocketFeeds, on lane: OrderedEventLane) {
        let store = self.store
        let currentUserId = self.currentUserId

        feeds.participantLeft
            .relay(through: lane) { event in
                guard let me = await currentUserId(), event.names(me) else { return }
                await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: event.conversationId))
            }
            .store(in: &cancellables)

        feeds.participantBanned
            .relay(through: lane) { event in
                guard let me = await currentUserId(), event.names(me) else { return }
                await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: event.conversationId))
            }
            .store(in: &cancellables)
    }

    // G-124 — `readingMode` n'est PAS un champ de `userState` : préférence de
    // LECTURE, pas d'organisation. Le rappel reste un `sink` synchrone, posé à
    // côté du relais du store. `reset == true` porte `preferences == nil` —
    // rien à relayer, l'app garde sa valeur locale.
    private func wirePreferenceEvents(
        _ feeds: ConversationStoreSocketFeeds,
        on lane: OrderedEventLane,
        onReadingModePreferenceChanged: (@Sendable (_ conversationId: String, _ readingMode: String) -> Void)?
    ) {
        let store = self.store

        feeds.userPreferencesUpdated
            .relay(through: lane) { event in await store.applyRemote(Self.mapPreferences(event)) }
            .store(in: &cancellables)

        feeds.userPreferencesUpdated
            .sink { event in
                guard let readingMode = event.preferences?.readingMode else { return }
                onReadingModePreferenceChanged?(event.conversationId, readingMode)
            }
            .store(in: &cancellables)

        feeds.userPreferencesReordered
            .map { @Sendable event in event.updates.map { (convId: $0.conversationId, orderInCategory: $0.orderInCategory) } }
            .relay(through: lane) { updates in await store.applyRemoteReorder(updates) }
            .store(in: &cancellables)
    }

    private func wireReadEvents(_ feeds: ConversationStoreSocketFeeds, on lane: OrderedEventLane) {
        let store = self.store
        let currentUserId = self.currentUserId
        let isConversationOpen = self.isConversationOpen

        // Only a 'read' advances the read cursor; 'received' is delivery and
        // must NOT touch unread state. The frontier and its count travel
        // together — require both so a partial/legacy payload can never coerce
        // the badge to a bogus 0. Le broadcast atteint aussi les pairs (pour
        // les coches) : gate d'identité en plus, seuls les appareils de
        // l'acteur avancent le curseur. Le `lastReadAt` monotone du store
        // écarte tout ce qui n'est pas strictement plus récent.
        feeds.readStatusUpdated
            .relay(through: lane) { event in
                guard event.type == "read",
                      let lastReadAt = event.lastReadAt,
                      let unreadCount = event.unreadCount else { return }
                guard let me = await currentUserId(), event.userId == me else { return }
                await store.applyReadReceipt(ReadStatusEvent(
                    conversationId: event.conversationId,
                    unreadCount: unreadCount,
                    lastReadAt: lastReadAt
                ))
            }
            .store(in: &cancellables)

        // Le SEUL fil qui porte le compteur de non-lus (#6997), sans gate
        // d'identité : le gateway l'adresse à chaque destinataire avec SON
        // compte. Le gate qui compte est « la conversation OUVERTE reste à
        // zéro » : lu à l'ARRIVÉE de l'événement par le `map`, jamais à
        // l'application ni capturé à l'abonnement — l'écran visible change à
        // chaque navigation.
        feeds.unreadUpdated
            .map { @Sendable event in
                ConversationUnreadEvent(
                    conversationId: event.conversationId,
                    unreadCount: isConversationOpen(event.conversationId) ? 0 : event.unreadCount
                )
            }
            .relay(through: lane) { served in await store.applyServerUnread(served) }
            .store(in: &cancellables)
    }

    private func wireCategoryEvents(_ feeds: ConversationStoreSocketFeeds, on lane: OrderedEventLane) {
        let categoryStore = self.categoryStore

        feeds.categoryCreated
            .relay(through: lane) { event in await categoryStore.applyRemote(.created(event.category)) }
            .store(in: &cancellables)

        feeds.categoryUpdated
            .relay(through: lane) { event in await categoryStore.applyRemote(.updated(event.category)) }
            .store(in: &cancellables)

        feeds.categoryDeleted
            .relay(through: lane) { event in await categoryStore.applyRemote(.deleted(id: event.categoryId)) }
            .store(in: &cancellables)

        feeds.categoriesReordered
            .map { @Sendable event in event.updates.map { (id: $0.categoryId, order: $0.order) } }
            .relay(through: lane) { updates in await categoryStore.applyRemote(.reordered(updates: updates)) }
            .store(in: &cancellables)
    }

    // Les rattrapages réseau ont leur file : un `flushOutbox` ou une
    // hydratation lents ne retiennent aucun événement.
    private func wireCatchUp(_ feeds: ConversationStoreSocketFeeds, on lane: OrderedEventLane) {
        let store = self.store
        let categoryStore = self.categoryStore

        feeds.didReconnect
            .relay(through: lane) { _ in
                await store.flushOutbox()
                do {
                    try await categoryStore.hydrate()
                } catch {
                    // Les catégories restent celles du dernier chargement.
                    Logger.socket.error("Category store hydration failed after socket event: \(error.localizedDescription, privacy: .public)")
                }
            }
            .store(in: &cancellables)
    }

    /// Drop all subscriptions (e.g. on logout).
    public func deactivate() {
        cancellables.removeAll()
        eventLane = nil
        catchUpLane = nil
    }

    /// Map a `conversation:updated` socket event onto the store's input value
    /// type. Pure + `nonisolated` so the sink can build it before hopping to
    /// the store actor.
    nonisolated static func mapConversationUpdated(
        _ event: ConversationUpdatedEvent,
        readerId: String? = nil
    ) -> ConversationUpdatedStoreEvent {
        ConversationUpdatedStoreEvent(
            conversationId: event.conversationId,
            lastMessageAt: event.lastMessageAt,
            lastMessage: event.lastMessage,
            lastMessagePreview: event.lastMessagePreview,
            // #6921 — décodé ET mappé. Le champ voisin `location` porte la
            // leçon juste en dessous : un champ décodé et non mappé est aussi
            // inerte qu'un champ absent du fil. `lastMessageSenderName` l'était
            // doublement — ni décodé, ni mappé.
            lastMessageSenderName: event.lastMessageSenderName,
            senderId: event.senderId,
            senderUserId: event.messageSenderUserId,
            readerId: readerId,
            youLabel: ConversationListAuthor.readerLabel,
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
            autoTranslateEnabled: event.autoTranslateEnabled,
            // #7548 — le sous-groupe média et la nature voyagent jusqu'au store :
            // décodés sans être mappés, ils seraient aussi inertes qu'absents.
            // Un message PROTÉGÉ arrive sans pièce jointe mais avec ses
            // drapeaux : le groupe existe dès qu'UNE de ses clés est là.
            media: mediaGroup(of: event),
            nature: event.lastMessageNature,
            lastReaction: event.lastReaction,
            activeCall: event.activeCall,
            listRankAt: event.listRankAt
        )
    }

    nonisolated static func mediaGroup(of event: ConversationUpdatedEvent) -> LastMessageMediaGroup? {
        guard event.lastMessageAttachments != nil || event.lastMessageAttachmentCount != nil
                || event.lastMessageIsBlurred != nil || event.lastMessageIsViewOnce != nil
                || event.lastMessageExpiresAt != nil
        else { return nil }
        return LastMessageMediaGroup(
            attachments: event.lastMessageAttachments ?? [],
            attachmentCount: event.lastMessageAttachmentCount,
            isBlurred: event.lastMessageIsBlurred ?? false,
            isViewOnce: event.lastMessageIsViewOnce ?? false,
            expiresAt: event.lastMessageExpiresAt
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
                    clearHistoryBefore: p.clearHistoryBefore,
                    appearance: p.appearance
                )
            }
        )
    }
}
