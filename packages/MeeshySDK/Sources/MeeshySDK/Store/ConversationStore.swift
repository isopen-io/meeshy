import Foundation
import Combine

// MARK: - Service protocols (testable seams)

/// Subset of `PreferenceServiceProviding` that `ConversationStore` needs.
/// Declared separately so tests can mock just these methods without
/// implementing the full PreferenceService surface.
public protocol ConversationPreferenceWriting: Sendable {
    /// Apply a partial update. Returns the server's authoritative state
    /// (including the new `version`) so the Store can replace its
    /// optimistic candidate.
    func updateConversationPreferences(
        conversationId: String,
        request: UpdateConversationPreferencesRequest
    ) async throws -> APIConversationPreferences

    /// Batch reorder (`POST /user-preferences/reorder`). Used by
    /// the Store's `reorderConversations` composite (drag-to-reorder).
    func reorderConversations(_ updates: [(convId: String, orderInCategory: Int)]) async throws
}

/// Read seam for cache hydration (`hydrateFromCache`). Default adapter reads
/// the cached conversation list (`CacheCoordinator.conversations`, key "list");
/// tests stub a `CacheResult` directly.
public protocol ConversationCacheReading: Sendable {
    func loadConversationList() async -> CacheResult<[MeeshyConversation]>
}

/// Subset of `ConversationServiceProviding` used by the Store.
public protocol ConversationLifecycleWriting: Sendable {
    func markRead(conversationId: String) async throws
    func markUnread(conversationId: String) async throws
    func deleteForMe(conversationId: String) async throws
    func leave(conversationId: String) async throws
}

/// Category-creation seam used by the Store's `createSectionAndAssign`
/// composite helper. Default adapter forwards to `UserCategoryStore.shared`;
/// tests inject a mock so the composite can be verified without I/O.
public protocol ConversationCategoryCreating: Sendable {
    func create(name: String, color: String?, icon: String?) async throws -> ConversationCategory
}

// MARK: - Subject registry (Combine bridge)

/// Combine `CurrentValueSubject`s aren't actor-safe to *create* lazily
/// from inside an actor (would require `Task { await … }` indirection).
/// This `@unchecked Sendable` registry wraps a lock so the actor can
/// hand out subjects synchronously to UI code calling `publisher(for:)`
/// from the main thread.
final class ConversationStoreSubjects: @unchecked Sendable {
    private let lock = NSLock()
    private var perConv: [String: CurrentValueSubject<MeeshyConversation, Never>] = [:]
    let list = CurrentValueSubject<[MeeshyConversation], Never>([])

    func subject(for id: String, initial: () -> MeeshyConversation?) -> CurrentValueSubject<MeeshyConversation, Never>? {
        lock.lock(); defer { lock.unlock() }
        if let s = perConv[id] { return s }
        guard let value = initial() else { return nil }
        let s = CurrentValueSubject<MeeshyConversation, Never>(value)
        perConv[id] = s
        return s
    }

    func send(_ conv: MeeshyConversation) {
        lock.lock(); defer { lock.unlock() }
        perConv[conv.id]?.send(conv)
    }

    func remove(_ id: String) {
        lock.lock(); defer { lock.unlock() }
        perConv.removeValue(forKey: id)
    }

    func removeAll() {
        lock.lock(); defer { lock.unlock() }
        perConv.removeAll()
        list.send([])
    }
}

// MARK: - Errors

public enum ConversationStoreError: Error, Sendable {
    case unknownConversation(String)
    case dispatchFailed(reason: String)
}

// MARK: - Store

/// Single source of truth in RAM for the per-user state of every
/// conversation the user has loaded.
///
/// Concurrency: an `actor`, so every mutating access serializes. UI
/// subscribers consume immutable `MeeshyConversation` snapshots via the
/// Combine publishers, which are safe to access from the main thread.
///
/// Phase 4 (foundation) scope:
/// - In-memory state + Combine publishers
/// - `hydrate` / `hydrateList`
/// - `apply(_:for:)` optimistic + outbox + dispatch + ACK/rollback
/// - `applyRemote` for `USER_PREFERENCES_UPDATED` with version gating
/// - `flushOutbox` to dispatch queued writes (foregrounded by the app
///   shell at scene-active / reachability changes)
///
/// Phase 4 bis (complete): `applyReadReceipt` (monotone),
/// `applyConversationDeleted`, `createSectionAndAssign`, `reorderConversations`
/// (batch via `POST /user-preferences/reorder`), `hydrateFromCache` (SWR from
/// the conversation cache, key "list").
///
/// Still deferred:
/// - Socket listener wiring on `MessageSocketManager` (maps socket events to
///   `applyRemote` / `applyReadReceipt` / `applyConversationDeleted` /
///   reordered) — Phase 5/6 glue.
public actor ConversationStore {

    // MARK: - State

    private var conversations: [String: MeeshyConversation] = [:]
    private nonisolated let subjects = ConversationStoreSubjects()

    private let preferenceService: ConversationPreferenceWriting
    private let conversationService: ConversationLifecycleWriting
    private let categoryService: ConversationCategoryCreating
    private let cache: ConversationCacheReading
    private let outbox: ConversationStateOutbox

    // MARK: - Init

    public static let shared = ConversationStore()

    private init() {
        self.preferenceService = DefaultPreferenceWritingAdapter()
        self.conversationService = DefaultConversationLifecycleAdapter()
        self.categoryService = DefaultCategoryCreatingAdapter()
        self.cache = DefaultCacheReadingAdapter()
        self.outbox = ConversationStateOutbox.shared
    }

    public init(
        preferenceService: ConversationPreferenceWriting,
        conversationService: ConversationLifecycleWriting,
        outbox: ConversationStateOutbox,
        categoryService: ConversationCategoryCreating = DefaultCategoryCreatingAdapter(),
        cache: ConversationCacheReading = DefaultCacheReadingAdapter()
    ) {
        self.preferenceService = preferenceService
        self.conversationService = conversationService
        self.categoryService = categoryService
        self.cache = cache
        self.outbox = outbox
    }

    // MARK: - Session teardown

    /// Purge au logout (cascade `AuthManager.logout`) — isolation des données
    /// entre comptes sur le même device : sans elle, les conversations de
    /// l'utilisateur A (et un `CurrentValueSubject` par conversation hydratée,
    /// jamais évincé) restaient résidents pendant toute la session de
    /// l'utilisateur B. Les publishers per-conv encore détenus par une UI en
    /// cours de teardown deviennent orphelins (plus d'émission) — attendu.
    public func reset() async {
        conversations.removeAll()
        subjects.removeAll()
        // outbox-03 — l'outbox SQLite réhydrate ses rows à chaque boot et les
        // flushe `force: true` sous le token courant : la purge mémoire seule
        // laissait les mutations de A (dont .leave/.deleteForUser) se rejouer
        // sous le compte B. Purge via l'outbox INJECTÉ (testabilité).
        await outbox.purgeAll()
    }

    // MARK: - Read

    public func conversation(id: String) -> MeeshyConversation? {
        conversations[id]
    }

    public nonisolated func publisher(for convId: String) -> AnyPublisher<MeeshyConversation, Never>? {
        // Returns nil if the conversation has never been hydrated — the
        // caller should hydrate first then re-subscribe.
        subjects.subject(for: convId, initial: { nil })?.eraseToAnyPublisher()
    }

    public nonisolated func listPublisher() -> AnyPublisher<[MeeshyConversation], Never> {
        subjects.list.eraseToAnyPublisher()
    }

    // MARK: - Hydration

    public func hydrate(_ conv: MeeshyConversation) {
        conversations[conv.id] = conv
        // Seed or refresh the per-conv subject and the list snapshot.
        if let existing = subjects.subject(for: conv.id, initial: { conv }) {
            existing.send(conv)
        }
        publishList()
    }

    public func hydrateList(_ convs: [MeeshyConversation]) {
        for conv in convs {
            conversations[conv.id] = conv
            if let existing = subjects.subject(for: conv.id, initial: { conv }) {
                existing.send(conv)
            }
        }
        publishList()
    }

    /// Merge a server / cache metadata snapshot into the store while
    /// preserving any local `userState` that is newer than the incoming
    /// one — i.e. an in-flight optimistic mutation the server hasn't ACK'd
    /// yet (`local.version > incoming.version`).
    ///
    /// Unlike `hydrateList`, which replaces each conversation wholesale,
    /// this is the safe path for repeated metadata refreshes (the list VM
    /// re-hydrates on every sync / socket update): metadata (title,
    /// `lastMessageAt`, members, …) always takes the incoming value, but
    /// the per-user state is version-gated so a concurrent refresh can't
    /// clobber an optimistic toggle that is still draining through the
    /// outbox. Conversations the store doesn't know yet are seeded
    /// wholesale.
    ///
    /// Le non-lu échappe au garde-fou de version : il ne participe PAS au
    /// versionnement (`applyReadReceipt` et le zéro d'ouverture ne bumpent
    /// jamais `version` — §9 du design), donc `existing.version > incoming.version`
    /// est faux à l'égalité et l'instantané entrant repassait tel quel. Un
    /// cache momentanément en retard sur la lecture locale ressuscitait ainsi
    /// la pastille dans le store, qui la regreffait sur la ligne à sa
    /// prochaine republication : le va-et-vient 0 ↔ 99 vu à l'ouverture.
    /// La parade n'est pas une règle de plus, c'est LA règle — celle du
    /// moteur de sync, appliquée ici au même titre (`reconcileUnread`).
    public func hydrateMetadata(_ convs: [MeeshyConversation]) {
        for incoming in convs {
            let existing = conversations[incoming.id]
            var merged: MeeshyConversation
            if let existing, existing.userState.version > incoming.userState.version {
                merged = incoming
                merged.userState = existing.userState
            } else {
                merged = incoming
            }
            // `openConversationId: nil` — le gate « conversation ouverte » n'a
            // pas à être re-consulté ici : l'ouverture pose déjà une frontière
            // de lecture sur CE store (`ConversationReadSignal`, app), et la
            // règle 2 de `reconcileUnread` en tire exactement la même
            // conclusion. Le lui repasser couplerait le store au singleton du
            // moteur pour un résultat identique.
            merged = ConversationSyncEngine.reconcileUnread(
                incoming: merged, local: existing, openConversationId: nil
            )
            conversations[merged.id] = merged
            if let subject = subjects.subject(for: merged.id, initial: { merged }) {
                subject.send(merged)
            }
        }
        publishList()
    }

    /// Seed the store from the L2 conversation cache (Stale-While-Revalidate):
    /// both `.fresh` and `.stale` snapshots hydrate immediately so the UI
    /// paints from cache without a spinner; `.expired` / `.empty` are no-ops
    /// (the caller's network fetch will hydrate later).
    public func hydrateFromCache() async {
        switch await cache.loadConversationList() {
        case .fresh(let convs, _), .stale(let convs, _):
            hydrateList(convs)
        case .expired, .empty:
            break
        }
    }

    // MARK: - Apply (optimistic + outbox + dispatch)

    /// Apply a mutation: snapshot → optimistic mutate + version bump →
    /// outbox enqueue → dispatch → ACK swaps in authoritative version
    /// OR rollback on permanent failure OR retain in outbox on
    /// transient failure.
    ///
    /// For local-only mutations (`UserStateMutation.isLocalOnly`) the
    /// outbox path is skipped entirely.
    public func apply(_ mutation: UserStateMutation, for convId: String) async throws {
        guard var conv = conversations[convId] else {
            throw ConversationStoreError.unknownConversation(convId)
        }
        let snapshot = conv.userState

        // 1. Optimistic mutation + candidate version bump.
        conv.userState = applyLocally(mutation, on: conv.userState)
        if !mutation.isLocalOnly {
            conv.userState.version += 1
        }
        commit(conv)

        // Local-only short-circuit (no network, no outbox).
        if mutation.isLocalOnly { return }

        // 2. Enqueue in outbox.
        guard let task = await outbox.enqueue(mutation, for: convId) else { return }

        // 3. Dispatch and apply outcome.
        await refreshPendingCount(convId: convId)
        let outcome = await dispatch(task)
        switch outcome {
        case .completed(let authoritativeVersion):
            await outbox.markCompleted(task.id)
            if var conv = conversations[convId] {
                if let v = authoritativeVersion {
                    conv.userState.version = v
                }
                conv.userState.lastSyncedAt = Date()
                commit(conv)
            }
            await refreshPendingCount(convId: convId)

        case .failedPermanent(let reason):
            // 4xx — rollback to the snapshot taken before the optimistic
            // mutation, mark task failed (which drops it), propagate.
            if var conv = conversations[convId] {
                conv.userState = snapshot
                commit(conv)
            }
            await outbox.markFailedPermanent(task.id, reason: reason)
            await refreshPendingCount(convId: convId)
            throw ConversationStoreError.dispatchFailed(reason: reason)

        case .failedTransient(let reason):
            // Network / 5xx — leave the optimistic state in place,
            // bump retry, do NOT throw (the caller already saw the
            // optimistic update succeed). A later `flushOutbox()` call
            // will retry.
            await outbox.markFailedTransient(task.id, reason: reason)
            await refreshPendingCount(convId: convId)
        }
    }

    /// Flush the outbox by dispatching every ready task through the
    /// Store's internal dispatch path. Call at app foreground and on
    /// network reachability changes.
    public func flushOutbox() async {
        await outbox.flush(force: true) { [weak self] task in
            guard let self else { return .failedTransient(reason: "store deallocated") }
            let result = await self.dispatch(task)
            // Outbox dispatch outcome maps 1:1 to the local result, minus
            // the version (which we apply directly to the in-memory
            // conversation here rather than threading it back).
            switch result {
            case .completed(let version):
                if let v = version, var conv = await self.conversations[task.convId] {
                    conv.userState.version = v
                    conv.userState.lastSyncedAt = Date()
                    await self.commit(conv)
                }
                return .completed
            case .failedPermanent(let reason):
                return .failedPermanent(reason: reason)
            case .failedTransient(let reason):
                return .failedTransient(reason: reason)
            }
        }
        for id in conversations.keys {
            await refreshPendingCount(convId: id)
        }
    }

    // MARK: - Remote event application

    /// Apply a `USER_PREFERENCES_UPDATED` socket event. Drops the event
    /// when its version is `<=` the local snapshot (stale broadcast).
    /// On `reset: true` (DELETE), restores defaults preserving the
    /// version (which the server emits as `existing.version + 1`).
    public func applyRemote(_ event: UserPreferencesUpdatedRemote) {
        guard var conv = conversations[event.conversationId] else {
            // Conversation not hydrated yet — drop silently; the next
            // list refresh will catch up.
            return
        }
        if event.version <= conv.userState.version {
            return
        }
        if event.reset {
            conv.userState = ConversationUserState(
                version: event.version,
                lastSyncedAt: Date()
            )
        } else {
            if let prefs = event.preferences {
                conv.userState.isPinned = prefs.isPinned
                conv.userState.isMuted = prefs.isMuted
                conv.userState.mentionsOnly = prefs.mentionsOnly
                conv.userState.isArchived = prefs.isArchived
                conv.userState.tags = prefs.tags
                conv.userState.sectionId = prefs.categoryId
                conv.userState.orderInCategory = prefs.orderInCategory
                conv.userState.customName = prefs.customName
                conv.userState.reaction = prefs.reaction
                conv.userState.deletedForUserAt = prefs.deletedForUserAt
                conv.userState.clearHistoryBefore = prefs.clearHistoryBefore
            }
            conv.userState.version = event.version
            conv.userState.lastSyncedAt = Date()
        }
        commit(conv)
    }

    /// Apply a read-receipt socket event. Read receipts are **monotone**:
    /// `lastReadAt` only ever moves forward, so a receipt whose `lastReadAt`
    /// is not strictly newer than the local one is dropped (stale broadcast).
    /// `unreadCount` is server-authoritative and applied as-is when the
    /// receipt is accepted. This path NEVER bumps `userState.version`
    /// (versioning is reserved for the prefs path — §9 of the design).
    public func applyReadReceipt(_ event: ReadStatusEvent) {
        guard var conv = conversations[event.conversationId] else { return }
        let isNewer: Bool
        if let incoming = event.lastReadAt {
            isNewer = conv.userState.lastReadAt.map { incoming > $0 } ?? true
        } else {
            isNewer = false
        }
        guard isNewer else { return }
        conv.userState.lastReadAt = event.lastReadAt
        conv.userState.unreadCount = event.unreadCount
        commit(conv)
    }

    /// Apply a conversation-deleted socket event: drop the conversation from
    /// the in-memory store, release its per-conv subject, and republish the
    /// list. No-op for an unknown conversation.
    public func applyConversationDeleted(_ event: ConversationDeletedEvent) {
        guard conversations[event.conversationId] != nil else { return }
        conversations.removeValue(forKey: event.conversationId)
        subjects.remove(event.conversationId)
        publishList()
    }

    /// Apply a conversation-restored socket event (#4389) : la conversation
    /// REVIENT dans la liste en mémoire, et la liste est republiée.
    ///
    /// Jumelle exacte d'`applyConversationDeleted`, et volontairement PURE —
    /// elle reçoit la conversation déjà lue, elle ne va pas la chercher. La
    /// lecture BORNÉE (`GET /conversations/:id`) vit chez l'appelant, comme
    /// côté web où le geste est `fetchConversationIntoCache` et jamais une
    /// invalidation de préfixe : rejouer les pages d'une liste écrase les
    /// écritures socket concurrentes et duplique une ligne à chaque frontière
    /// de page. Le store n'a donc aucune couture réseau de plus, et cette
    /// méthode reste testable sans I/O.
    ///
    /// Idempotente : appliquée deux fois — un rejeu, deux appareils — elle
    /// commit la même ligne. Elle ne suppose pas non plus que la conversation
    /// soit absente : une restauration peut arriver alors que la liste a déjà
    /// été rechargée par ailleurs, et écraser par la version fraîche est ce
    /// qu'on veut.
    public func applyConversationRestored(_ conversation: MeeshyConversation) {
        commit(conversation)
    }

    /// Apply a `conversation:updated` socket event. Updates conversation
    /// metadata and/or the last-message fields used for bump-to-top list
    /// reordering. Only non-nil fields are applied (nil = "not provided by
    /// this payload variant"). `lastMessageAt`, `lastMessageId` and
    /// `lastMessagePreview` — plus the Prisme pair `lastMessageTranslations` /
    /// `lastMessageOriginalLanguage` — are monotone as a group: an incoming
    /// `lastMessageAt` older than the current one means the whole payload
    /// describes a stale message, so the id/preview are skipped along with
    /// the timestamp (otherwise a delayed broadcast for an older message
    /// would leave the row showing the newest timestamp paired with the
    /// older message's text). An EQUAL timestamp is the same message, not a
    /// stale one — that is an edit, and it applies.
    ///
    /// La monotonie cède devant `previewRecalculated` : le serveur déclare
    /// alors avoir RECALCULÉ l'aperçu depuis sa base, et un tel aperçu recule
    /// légitimement (suppression pour tous du dernier message, masquage
    /// personnel du dernier message visible). Sans cette exception, le groupe
    /// entier était jeté sur ces deux chemins nominaux.
    ///
    /// Un cran au-delà du recul : `lastMessage == .replaced(nil)` dit qu'il n'y
    /// a plus AUCUN message visible pour ce lecteur, et vide le groupe entier
    /// (`MeeshyConversation.clearLastMessage`) au lieu de l'appliquer champ par
    /// champ — un payload tout en `null` ne survit à aucun `if let`.
    ///
    /// Fields unrelated to message ordering (e.g. `title`) are still applied
    /// regardless — à une exception près, `title` sur une conversation
    /// `.direct`, dont le titre client n'est pas celui de la base (voir le
    /// commentaire au point d'application). No-op for an unknown conversation
    /// (the next list refresh will catch up).
    public func applyConversationUpdated(_ event: ConversationUpdatedStoreEvent) {
        guard let conv = conversations[event.conversationId],
              let merged = Self.merging(conv, with: event) else { return }
        commit(merged)
    }

    /// Pure merge rule behind `applyConversationUpdated`, returning `nil` when
    /// the payload changes nothing. Lifted out of the actor so the disk-cache
    /// writer (`ConversationSyncEngine`) applies the SAME rule instead of
    /// re-deriving it — the RAM store and the persisted list must never
    /// disagree on what a `conversation:updated` means.
    public nonisolated static func merging(
        _ conversation: MeeshyConversation,
        with event: ConversationUpdatedStoreEvent
    ) -> MeeshyConversation? {
        var conv = conversation
        var changed = false

        // `>=` et non `>` : la règle DOCUMENTÉE ci-dessus est « un `lastMessageAt`
        // plus ANCIEN décrit un message périmé ». Un `>` strict rejetait aussi
        // l'ÉGALITÉ — c'est-à-dire le même message, qui n'est pas périmé du tout.
        // C'est exactement ce que produit une ÉDITION : le contenu change, le
        // message (donc son `createdAt`) ne change pas. Tout le groupe d'aperçu
        // était donc silencieusement jeté sur le seul chemin qui en avait besoin.
        // Ré-appliquer les mêmes valeurs sur un doublon d'événement est idempotent.
        let lastMessageIsCurrent = event.lastMessageAt.map { $0 >= conv.lastMessageAt } ?? true

        // …sauf quand le serveur DÉCLARE avoir recalculé l'aperçu depuis sa base.
        //
        // La garde monotone lit un recul comme la marque d'un message périmé.
        // C'en est une pour un événement message-driven, qui ne porte que le
        // message qu'on vient d'écrire. C'en est une FAUSSE pour un recalcul :
        // supprimer le dernier message pour tous fait redescendre la ligne sur
        // le message PRÉCÉDENT, et un lecteur qui masque son propre dernier
        // message visible se voit servir un remplaçant plus ancien par
        // construction. Les deux reculent, les deux nomment un autre message —
        // du seul contenu, ils sont indiscernables, et la garde jetait donc le
        // groupe ENTIER sur deux chemins nominaux. C'est pourquoi le
        // discriminant ne pouvait venir que de l'émetteur.
        //
        // Ce qu'il ne faut PAS faire à la place : omettre `lastMessageAt` du
        // payload pour passer sous la garde. Le champ deviendrait faux et le tri
        // de la liste avec lui — on remplacerait un aperçu périmé par un tri
        // périmé.
        //
        // Reste assumé : deux recalculs qui se doubleraient s'appliquent dans
        // l'ordre d'ARRIVÉE. Une même connexion Socket.IO préserve l'ordre
        // d'émission, et le cas où ça se joue vraiment — une traduction qui
        // atterrit derrière un message plus neuf — est déjà tenu côté serveur
        // par la borne `onlyIfLatestIs`, qui abandonne le fan-out.
        if lastMessageIsCurrent || event.previewRecalculated {
            // « Ce lecteur n'a plus AUCUN message visible ici » — il vient de
            // masquer POUR LUI le dernier qui lui restait. Le serveur l'énonce
            // en posant tout le groupe à `null`, et cette branche doit sortir en
            // premier : lu par les `if let` d'en dessous, ce payload ne dit
            // RIEN (chaque champ est jeté un par un), et la ligne garde l'aperçu
            // de ce qui vient de disparaître — définitivement, puisque plus rien
            // ne bougera dans cette conversation.
            //
            // Le fait est porté par l'IDENTITÉ du message et par elle seule :
            // c'est le seul champ du groupe dont l'ABSENCE (métadonnées) et la
            // NULLITÉ (plus rien) se distinguent sur le fil. `lastMessageAt`
            // nul, lui, décrit aussi bien un renommage.
            if case .replaced(.none) = event.lastMessage {
                changed = conv.clearLastMessage() || changed
            } else {
                if let incoming = event.lastMessageAt { conv.lastMessageAt = incoming; changed = true }
                // Nommer un AUTRE message, c'est cesser de décrire le
                // précédent. Le payload recalculé ne porte que l'identité, le
                // texte et le Prisme : l'auteur, les pièces jointes et les
                // drapeaux éphémères de l'ancien message survivraient à un
                // simple `conv.lastMessageId = id`, et la ligne décrirait un
                // mélange des deux (« Vue unique » sur un texte neuf, la
                // vignette d'une photo supprimée sous l'aperçu de son
                // remplaçant). `adoptLastMessage` les remet à neutre — et se
                // tait quand l'identité ne change pas, c'est-à-dire à l'ÉDITION
                // et à la TRADUCTION, où ils restent vrais.
                //
                // Posé AVANT les champs ci-dessous, qui reposent ce que ce
                // payload-ci porte vraiment.
                if case .replaced(.some(let id)) = event.lastMessage {
                    conv.adoptLastMessage(id: id)
                    // L'épingle fait partie de ce que `adoptLastMessage` vient
                    // de remettre à neutre, et c'est le seul de ces champs que
                    // le payload PORTE vraiment — les trois émetteurs la hissent
                    // depuis `metadata.location` du message qu'ils nomment. La
                    // reposer est donc exactement le geste que
                    // `adoptLastMessage` demande à son appelant ; l'omettre
                    // laissait une ligne BLANCHE derrière un message
                    // position-seule, dont l'aperçu est vide par construction.
                    //
                    // Écrite AVEC l'identité et jamais seule : `nil` efface
                    // l'épingle du message précédent quand un texte le remplace.
                    // Même règle, au même endroit, que le chemin jumeau de
                    // `ConversationListViewModel` — et c'est le seul point du
                    // groupe d'aperçu où les deux fusions divergeaient.
                    conv.lastMessageLocation = event.location
                    changed = true
                }
                if let v = event.lastMessagePreview { conv.lastMessagePreview = v.meeshyPreviewTruncated; changed = true }
                // Le Prisme fait partie du MÊME groupe monotone : le résolveur
                // préfère la traduction à l'aperçu brut, donc poser l'un sans
                // l'autre laisse la ligne rendre l'ANCIEN texte traduit.
                // `.replaced([:])` → `nil` : le résolveur doit distinguer « pas de
                // carte » d'une carte vide (cf. `resolvedLastMessagePreview`).
                if case .replaced(let map) = event.lastMessageTranslations {
                    conv.lastMessageTranslations = map.isEmpty ? nil : map
                    conv.lastMessageOriginalLanguage = event.lastMessageOriginalLanguage
                    changed = true
                }
            }
        }
        // Un DM ne porte JAMAIS le titre de la base : `APIConversation
        // .toConversation` l'écarte explicitement et pose à la place le nom du
        // participant d'en face. Le payload socket, lui, porte le titre BRUT —
        // `PUT /conversations/:id` n'interdit pas de renommer une conversation
        // `direct`, et le rôle `creator` que reçoit l'auteur d'un DM à sa
        // création suffit à passer son contrôle d'accès.
        //
        // L'écran porte cette garde depuis le 2026-07-04 (« sandra raveloson »
        // → « Sany », `ConversationListViewModel`). Elle manquait ICI, et c'est
        // cette copie-ci qui écrit le CACHE DISQUE (`ConversationSyncEngine
        // .applyingConversationUpdate` délègue à cette même fonction) : le nom
        // greffé survivait au redémarrage, et revenait à l'écran avant même
        // celui-ci, la réécriture du cache rediffusant la liste par
        // `conversationsDidChange`. La garde de l'écran ne protégeait donc que
        // le chemin socket direct, pas celui qui la contournait par le cache.
        //
        // Miroir exact de `merging(_:withUserUpdate:)` vingt lignes plus bas,
        // qui dérive DÉJÀ le titre d'un DM du contact d'en face : les deux
        // règles de fusion de ce fichier disent enfin la même chose du même
        // champ.
        if let v = event.title, conv.type != .direct { conv.title = v; changed = true }
        if let v = event.avatar { conv.avatar = v; changed = true }
        if let v = event.description { conv.description = v; changed = true }
        if let v = event.banner { conv.banner = v; changed = true }
        if let v = event.isAnnouncementChannel { conv.isAnnouncementChannel = v; changed = true }
        if let v = event.defaultWriteRole { conv.defaultWriteRole = v; changed = true }
        if let v = event.slowModeSeconds { conv.slowModeSeconds = v; changed = true }
        if let v = event.autoTranslateEnabled { conv.autoTranslateEnabled = v; changed = true }

        return changed ? conv : nil
    }

    /// Apply a `user:updated` socket event — un CONTACT a changé son profil
    /// public (nom, avatar, bannière). Ne touche QUE les conversations
    /// directes dont ce contact est l'interlocuteur : dans un groupe, la ligne
    /// porte l'identité du GROUPE, pas celle d'un membre.
    public func applyUserUpdated(_ event: UserUpdatedEvent) {
        // Snapshot AVANT la boucle : `commit` réécrit `conversations`, et itérer
        // la vue `.values` d'un dictionnaire qu'on mute est un comportement
        // indéfini.
        for conv in Array(conversations.values) {
            guard let merged = Self.merging(conv, withUserUpdate: event) else { continue }
            commit(merged)
        }
    }

    /// Pure merge rule behind `applyUserUpdated`, returning `nil` when the
    /// payload changes nothing for this conversation. Lifted out of the actor
    /// for the same reason as `merging(_:with:)` — le cache disque doit
    /// appliquer LA MÊME règle que le store RAM.
    ///
    /// La ligne d'une conversation directe est hydratée par le REST depuis le
    /// participant d'en face : `title` ← `APIConversationUser.name`,
    /// `participantAvatarURL` ← `resolvedAvatar`, etc. Le socket rejoue
    /// exactement ces champs-là, avec le même résolveur de nom, sinon la ligne
    /// dirait deux choses différentes selon le transport qui l'a remplie.
    public nonisolated static func merging(
        _ conversation: MeeshyConversation,
        withUserUpdate event: UserUpdatedEvent
    ) -> MeeshyConversation? {
        guard conversation.type == .direct,
              conversation.participantUserId == event.userId else { return nil }

        var conv = conversation
        var changed = false

        if let name = event.resolvedDisplayName, name != conv.title {
            conv.title = name
            changed = true
        }
        if event.hasNameGroup, let handle = event.username, handle != conv.participantUsername {
            conv.participantUsername = handle
            changed = true
        }
        // `.replaced(nil)` = photo RETIRÉE : poser `nil` est le but, pas un
        // no-op. Un `if let` ici aurait gardé l'ancienne image pour toujours.
        if case .replaced(let url) = event.avatar, url != conv.participantAvatarURL {
            conv.participantAvatarURL = url
            changed = true
        }
        if case .replaced(let url) = event.banner, url != conv.participantBanner {
            conv.participantBanner = url
            changed = true
        }

        return changed ? conv : nil
    }

    // MARK: - Composite mutations

    /// Create a new category (server round-trip) then assign `convId` to it.
    /// The section assignment goes through the regular optimistic `apply`
    /// path so it inherits outbox + version + rollback semantics. Throws
    /// `unknownConversation` before creating the category if `convId` is
    /// not hydrated (avoids orphan categories).
    public func createSectionAndAssign(
        name: String,
        color: String?,
        icon: String?,
        toConversation convId: String
    ) async throws {
        guard conversations[convId] != nil else {
            throw ConversationStoreError.unknownConversation(convId)
        }
        let category = try await categoryService.create(name: name, color: color, icon: icon)
        try await apply(.setSection(categoryId: category.id), for: convId)
    }

    /// Batch drag-to-reorder. Applies the new `orderInCategory` to every
    /// affected conversation optimistically (single publish per conv), then
    /// commits via the batch reorder endpoint. On failure the whole batch is
    /// rolled back to its pre-reorder snapshot and the error is rethrown.
    /// Order does not participate in the per-field outbox/version path — it is
    /// a direct composite write (matches the gateway's batch endpoint).
    public func reorderConversations(_ updates: [(convId: String, orderInCategory: Int)]) async throws {
        var snapshots: [String: ConversationUserState] = [:]
        for update in updates {
            guard var conv = conversations[update.convId] else { continue }
            snapshots[update.convId] = conv.userState
            conv.userState.orderInCategory = update.orderInCategory
            commit(conv)
        }
        do {
            try await preferenceService.reorderConversations(updates)
        } catch {
            for (id, snapshot) in snapshots {
                if var conv = conversations[id] {
                    conv.userState = snapshot
                    commit(conv)
                }
            }
            throw error
        }
    }

    /// Apply a remote reorder broadcast (`USER_PREFERENCES_REORDERED` from
    /// another device). Updates `orderInCategory` locally and republishes —
    /// NO network round-trip (unlike `reorderConversations`) and no version
    /// bump (order is not version-tracked). Unknown conversations are skipped.
    public func applyRemoteReorder(_ updates: [(convId: String, orderInCategory: Int)]) {
        for update in updates {
            guard var conv = conversations[update.convId] else { continue }
            conv.userState.orderInCategory = update.orderInCategory
            commit(conv)
        }
    }

    // MARK: - Private helpers

    /// Apply a mutation to a `ConversationUserState` snapshot without
    /// any version bump. Pure function (no I/O, no side effects).
    func applyLocally(_ mutation: UserStateMutation, on state: ConversationUserState) -> ConversationUserState {
        var s = state
        switch mutation {
        case .setPinned(let v): s.isPinned = v
        case .setMuted(let v): s.isMuted = v
        case .setMentionsOnly(let v): s.mentionsOnly = v
        case .setArchived(let v): s.isArchived = v
        case .setCustomName(let v): s.customName = v
        case .setReaction(let v): s.reaction = v
        case .setSection(let id): s.sectionId = id
        case .setOrderInCategory(let v): s.orderInCategory = v
        case .setTags(let v): s.tags = v
        case .addTag(let t):
            if !s.tags.contains(t) { s.tags.append(t) }
        case .removeTag(let t):
            s.tags.removeAll { $0 == t }
        case .setClearHistoryBefore(let d): s.clearHistoryBefore = d
        case .markAsRead:
            s.unreadCount = 0
            s.lastReadAt = Date()
        case .markAsUnread:
            // Server is authoritative for unread count; locally we hint
            // ≥ 1 so the UI badge appears immediately.
            if s.unreadCount == 0 { s.unreadCount = 1 }
            s.lastReadAt = nil
        case .deleteForUser:
            s.deletedForUserAt = Date()
        case .leave:
            // Visibility-wise treated like a soft delete on the user's
            // side. The server will eventually broadcast the participant
            // leave event; we just clear the local view.
            s.deletedForUserAt = Date()
        case .setLocked(let v):
            s.isLocked = v
        }
        return s
    }

    private func commit(_ conv: MeeshyConversation) {
        conversations[conv.id] = conv
        subjects.send(conv)
        publishList()
    }

    private func publishList() {
        let snapshot = Array(conversations.values).sorted { $0.lastMessageAt > $1.lastMessageAt }
        subjects.list.send(snapshot)
    }

    private func refreshPendingCount(convId: String) async {
        let count = await outbox.pendingCount(for: convId)
        guard var conv = conversations[convId], conv.userState.pendingMutationCount != count else { return }
        conv.userState.pendingMutationCount = count
        commit(conv)
    }

    // MARK: - Dispatch routing

    /// Internal dispatch outcome carrying the authoritative version
    /// returned by the server (for PUT-style mutations). Local-only
    /// outcomes use `.completed(nil)`.
    enum DispatchOutcome: Sendable {
        case completed(authoritativeVersion: Int?)
        case failedPermanent(reason: String)
        case failedTransient(reason: String)
    }

    private func dispatch(_ task: OutboxTask) async -> DispatchOutcome {
        switch task.mutation {
        case .setPinned, .setMuted, .setMentionsOnly, .setArchived,
             .setCustomName, .setReaction, .setSection, .setOrderInCategory,
             .setTags, .addTag, .removeTag, .setClearHistoryBefore:
            return await dispatchPreferencesUpdate(task: task)

        case .markAsRead:
            return await runVoid { try await self.conversationService.markRead(conversationId: task.convId) }
        case .markAsUnread:
            return await runVoid { try await self.conversationService.markUnread(conversationId: task.convId) }
        case .deleteForUser:
            return await runVoid { try await self.conversationService.deleteForMe(conversationId: task.convId) }
        case .leave:
            return await runVoid { try await self.conversationService.leave(conversationId: task.convId) }

        case .setLocked:
            // Local-only — dispatch is a no-op success.
            return .completed(authoritativeVersion: nil)
        }
    }

    private func dispatchPreferencesUpdate(task: OutboxTask) async -> DispatchOutcome {
        let request: UpdateConversationPreferencesRequest
        switch task.mutation {
        case .setPinned(let v): request = UpdateConversationPreferencesRequest(isPinned: v)
        case .setMuted(let v): request = UpdateConversationPreferencesRequest(isMuted: v)
        case .setMentionsOnly(let v): request = UpdateConversationPreferencesRequest(mentionsOnly: v)
        case .setArchived(let v): request = UpdateConversationPreferencesRequest(isArchived: v)
        case .setCustomName(let v): request = UpdateConversationPreferencesRequest(customName: v)
        case .setReaction(let v): request = UpdateConversationPreferencesRequest(reaction: v)
        case .setSection(let id): request = UpdateConversationPreferencesRequest(categoryId: id)
        case .setOrderInCategory: request = UpdateConversationPreferencesRequest()
        case .setTags(let v): request = UpdateConversationPreferencesRequest(tags: v)
        case .addTag, .removeTag:
            // The Store should resolve add/remove to the final tags
            // array via `applyLocally` before enqueueing setTags, but
            // if a raw add/remove makes it here we forward the current
            // local state.
            let tags = conversations[task.convId]?.userState.tags ?? []
            request = UpdateConversationPreferencesRequest(tags: tags)
        case .setClearHistoryBefore:
            // The request type doesn't expose clearHistoryBefore in the
            // current PreferenceService surface; treat as success
            // locally until the server endpoint is wired.
            return .completed(authoritativeVersion: nil)
        default:
            return .completed(authoritativeVersion: nil)
        }

        do {
            let updated = try await preferenceService.updateConversationPreferences(
                conversationId: task.convId,
                request: request
            )
            return .completed(authoritativeVersion: updated.version)
        } catch {
            return classifyError(error)
        }
    }

    private func runVoid(_ op: @Sendable () async throws -> Void) async -> DispatchOutcome {
        do {
            try await op()
            return .completed(authoritativeVersion: nil)
        } catch {
            return classifyError(error)
        }
    }

    private func classifyError(_ error: Error) -> DispatchOutcome {
        // Errors with an HTTP status code in 4xx → permanent (caller
        // sent garbage; rollback). Everything else → transient (network
        // / 5xx; retry).
        if let me = error as? MeeshyError, case .server(let status, let msg) = me, (400..<500).contains(status) {
            let reason = msg.isEmpty ? "HTTP \(status)" : msg
            return .failedPermanent(reason: reason)
        }
        return .failedTransient(reason: String(describing: error))
    }
}

// MARK: - Remote event value type

/// Strongly-typed payload for `USER_PREFERENCES_UPDATED` (conversation
/// scope). Mirrors the gateway's `UserPreferencesConversationUpdatedEventData`.
public struct UserPreferencesUpdatedRemote: Sendable, Hashable {
    public let userId: String
    public let conversationId: String
    public let version: Int
    public let reset: Bool
    public let preferences: RemotePreferencesPayload?

    public init(
        userId: String,
        conversationId: String,
        version: Int,
        reset: Bool,
        preferences: RemotePreferencesPayload?
    ) {
        self.userId = userId
        self.conversationId = conversationId
        self.version = version
        self.reset = reset
        self.preferences = preferences
    }
}

public struct RemotePreferencesPayload: Sendable, Hashable {
    public let isPinned: Bool
    public let isMuted: Bool
    public let mentionsOnly: Bool
    public let isArchived: Bool
    public let tags: [String]
    public let categoryId: String?
    public let orderInCategory: Int?
    public let customName: String?
    public let reaction: String?
    public let deletedForUserAt: Date?
    public let clearHistoryBefore: Date?

    public init(
        isPinned: Bool,
        isMuted: Bool,
        mentionsOnly: Bool,
        isArchived: Bool,
        tags: [String],
        categoryId: String?,
        orderInCategory: Int?,
        customName: String?,
        reaction: String?,
        deletedForUserAt: Date?,
        clearHistoryBefore: Date?
    ) {
        self.isPinned = isPinned
        self.isMuted = isMuted
        self.mentionsOnly = mentionsOnly
        self.isArchived = isArchived
        self.tags = tags
        self.categoryId = categoryId
        self.orderInCategory = orderInCategory
        self.customName = customName
        self.reaction = reaction
        self.deletedForUserAt = deletedForUserAt
        self.clearHistoryBefore = clearHistoryBefore
    }
}

/// Store-owned input for `applyReadReceipt`. Decoupled from the socket
/// layer's `ReadStatusUpdateEvent` so the wiring layer maps socket → store.
public struct ReadStatusEvent: Sendable, Hashable {
    public let conversationId: String
    public let unreadCount: Int
    public let lastReadAt: Date?

    public init(conversationId: String, unreadCount: Int, lastReadAt: Date?) {
        self.conversationId = conversationId
        self.unreadCount = unreadCount
        self.lastReadAt = lastReadAt
    }
}

/// Store-owned input for `applyConversationDeleted`.
public struct ConversationDeletedEvent: Sendable, Hashable {
    public let conversationId: String

    public init(conversationId: String) {
        self.conversationId = conversationId
    }
}

/// Store-owned input for `applyConversationUpdated`. Carries the fields
/// the store cares about from the `conversation:updated` socket event.
/// Both the message-driven path (bump-to-top: `lastMessageAt`,
/// `lastMessageId`, `lastMessagePreview`) and the metadata-driven path
/// (rename, avatar, etc.) share this type — unset fields are `nil` and
/// skipped during application.
public struct ConversationUpdatedStoreEvent: Sendable, Hashable {
    public let conversationId: String
    public let lastMessageAt: Date?
    /// Identité du dernier message. Tri-état — voir `LastMessageIdentity` :
    /// `.unchanged` (clé absente) et `.replaced(nil)` (« plus aucun message
    /// visible pour ce lecteur ») ne sont pas le même ordre.
    public let lastMessage: LastMessageIdentity
    public let lastMessagePreview: String?
    /// Prisme de la ligne de liste. Tri-état — voir
    /// `LastMessagePreviewTranslations` : `.unchanged` (clé absente) et
    /// `.replaced([:])` (carte périmée par le serveur) ne sont PAS le même
    /// ordre, et c'est la seule façon de rendre une édition applicable.
    public let lastMessageTranslations: LastMessagePreviewTranslations
    public let lastMessageOriginalLanguage: String?
    /// Épingle du dernier message, quand il en porte une. Membre du groupe
    /// d'aperçu au même titre que le texte et le Prisme : un message
    /// position-seule a un `lastMessagePreview` VIDE, donc c'est le seul champ
    /// dont la ligne dispose pour composer son libellé.
    ///
    /// Les trois émetteurs du payload la hissent depuis `metadata.location` du
    /// message NOMMÉ par `lastMessage` — jamais du message précédent. Elle
    /// s'applique donc avec l'identité, et jamais seule.
    public let location: SharedPlace?
    /// Le serveur a RECALCULÉ cet aperçu depuis sa base, au lieu de pousser le
    /// message qu'on vient d'écrire. Seul cas où le groupe d'aperçu a le droit
    /// de RECULER dans le temps — voir `merging(_:with:)`.
    public let previewRecalculated: Bool
    public let title: String?
    public let avatar: String?
    public let description: String?
    public let banner: String?
    public let isAnnouncementChannel: Bool?
    public let defaultWriteRole: String?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?

    public init(
        conversationId: String,
        lastMessageAt: Date? = nil,
        lastMessage: LastMessageIdentity = .unchanged,
        lastMessagePreview: String? = nil,
        lastMessageTranslations: LastMessagePreviewTranslations = .unchanged,
        lastMessageOriginalLanguage: String? = nil,
        location: SharedPlace? = nil,
        previewRecalculated: Bool = false,
        title: String? = nil,
        avatar: String? = nil,
        description: String? = nil,
        banner: String? = nil,
        isAnnouncementChannel: Bool? = nil,
        defaultWriteRole: String? = nil,
        slowModeSeconds: Int? = nil,
        autoTranslateEnabled: Bool? = nil
    ) {
        self.conversationId = conversationId
        self.lastMessageAt = lastMessageAt
        self.lastMessage = lastMessage
        self.lastMessagePreview = lastMessagePreview
        self.lastMessageTranslations = lastMessageTranslations
        self.lastMessageOriginalLanguage = lastMessageOriginalLanguage
        self.location = location
        self.previewRecalculated = previewRecalculated
        self.title = title
        self.avatar = avatar
        self.description = description
        self.banner = banner
        self.isAnnouncementChannel = isAnnouncementChannel
        self.defaultWriteRole = defaultWriteRole
        self.slowModeSeconds = slowModeSeconds
        self.autoTranslateEnabled = autoTranslateEnabled
    }
}

// MARK: - Default service adapters
//
// Bridge the lean `ConversationPreferenceWriting` /
// `ConversationLifecycleWriting` protocols onto the existing
// PreferenceService / ConversationService shared singletons.
// Tests inject their own mocks via the init that takes both protocols.

struct DefaultPreferenceWritingAdapter: ConversationPreferenceWriting {
    func updateConversationPreferences(
        conversationId: String,
        request: UpdateConversationPreferencesRequest
    ) async throws -> APIConversationPreferences {
        // The legacy PreferenceService.updateConversationPreferences
        // returns Void; Phase 4 needs the new prefs (with `version`) to
        // close the loop. Re-fetch the prefs after the write until the
        // service interface gets the unified update-and-return shape in
        // a follow-up.
        try await PreferenceService.shared.updateConversationPreferences(
            conversationId: conversationId,
            request: request
        )
        return try await PreferenceService.shared.getConversationPreferences(
            conversationId: conversationId
        )
    }

    func reorderConversations(_ updates: [(convId: String, orderInCategory: Int)]) async throws {
        try await PreferenceService.shared.reorderConversations(
            updates.map { (conversationId: $0.convId, orderInCategory: $0.orderInCategory) }
        )
    }
}

public struct DefaultCacheReadingAdapter: ConversationCacheReading {
    public init() {}
    public func loadConversationList() async -> CacheResult<[MeeshyConversation]> {
        await CacheCoordinator.shared.conversations.load(for: "list")
    }
}

struct DefaultConversationLifecycleAdapter: ConversationLifecycleWriting {
    func markRead(conversationId: String) async throws {
        try await ConversationService.shared.markRead(conversationId: conversationId)
    }
    func markUnread(conversationId: String) async throws {
        try await ConversationService.shared.markUnread(conversationId: conversationId)
    }
    func deleteForMe(conversationId: String) async throws {
        try await ConversationService.shared.deleteForMe(conversationId: conversationId)
    }
    func leave(conversationId: String) async throws {
        try await ConversationService.shared.leave(conversationId: conversationId)
    }
}

public struct DefaultCategoryCreatingAdapter: ConversationCategoryCreating {
    public init() {}
    public func create(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        try await UserCategoryStore.shared.create(name: name, color: color, icon: icon)
    }
}
