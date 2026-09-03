import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes, et ne change AUCUN
// comportement — les corps sont déplacés à l'identique.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : le CYCLE DE VIE du modèle — les deux seams
// d'injection avec lesquels il est construit (`ConversationDependencies`,
// `LiveCallJoinContext`), l'activation différée (`start()`, dont le doc-comment
// explique pourquoi elle ne doit jamais tourner depuis `init`), le câblage des
// abonnements Combine, l'observation du moteur de synchronisation, le
// préchargement média et le consentement vocal. Ni chargement, ni envoi, ni
// résolution de langue.

// MARK: - ConversationDependencies

struct ConversationDependencies {
    let dbPool: any DatabaseWriter
    let persistence: MessagePersistenceActor

    @MainActor
    static var live: ConversationDependencies {
        ConversationDependencies(
            dbPool: DependencyContainer.shared.dbPool,
            persistence: DependencyContainer.shared.messagePersistence
        )
    }
}

// MARK: - Seam de reprise d'appel

/// Seam de testabilité pour `ConversationViewModel.joinOngoingCall` — par
/// défaut lit/actionne `CallManager.shared` (singleton WebRTC intestable en
/// unit) ; les tests injectent des closures espionnes pour couvrir les 4
/// branches sans toucher au sous-système d'appel réel.
@MainActor
struct LiveCallJoinContext {
    var currentCallId: () -> String?
    var isIdle: () -> Bool
    var hasPendingIncomingCall: (String) -> Bool
    var bringCallUIForward: () -> Void
    var rejoinActiveCall: (
        _ callId: String,
        _ conversationId: String,
        _ remoteUserId: String,
        _ remoteUsername: String,
        _ isVideo: Bool
    ) -> Bool

    static let live = LiveCallJoinContext(
        currentCallId: { CallManager.shared.currentCallId },
        isIdle: { CallManager.shared.callState == .idle },
        hasPendingIncomingCall: { CallManager.shared.pendingIncomingCall?.callId == $0 },
        bringCallUIForward: { CallManager.shared.displayMode = .fullScreen },
        rejoinActiveCall: { callId, conversationId, remoteUserId, remoteUsername, isVideo in
            CallManager.shared.rejoinActiveCall(
                callId: callId,
                conversationId: conversationId,
                remoteUserId: remoteUserId,
                remoteUsername: remoteUsername,
                isVideo: isVideo
            )
        }
    )
}

extension ConversationViewModel {

    // MARK: - Consentement vocal

    /// Pure, testable: maps a `hasConsent` fetch to "missing", fail-safe to false.
    nonisolated static func resolveVoiceConsentMissing(_ fetchHasConsent: () async throws -> Bool) async -> Bool {
        do { return try await !fetchHasConsent() } catch { return false }
    }

    private func loadVoiceConsentStatus() {
        // Source primaire : l'espace de préférences — la même API que celle
        // par laquelle le popup accorde le consentement (PATCH
        // /me/preferences/application). Repli legacy : un consentement
        // accordé via le wizard voice-profile n'écrit que les champs User —
        // le statut REST voice-profile couvre ce cas tant que les
        // préférences sont muettes.
        if UserPreferencesManager.shared.voiceConsentGranted {
            voiceConsentMissing = false
            return
        }
        Task { [weak self] in
            let missing = await Self.resolveVoiceConsentMissing {
                try await VoiceProfileService.shared.getConsentStatus().hasConsent
            }
            await MainActor.run { self?.voiceConsentMissing = missing }
        }
    }

    /// Validation du popup de traduction automatique à l'envoi d'un audio
    /// sans consentement : accorde via l'espace de préférences — la MÊME API
    /// que la lecture — le consentement de définition du profil vocal ET la
    /// traduction utilisant ce profil, plus les features audio associées
    /// (transcription, traduction audio, TTS, profil vocal). L'écriture est
    /// locale-first et synchronisée au backend par l'outbox des préférences
    /// (PATCH /me/preferences/application + /audio) — jamais bloquant.
    func grantVoiceAutoTranslationConsent() {
        UserPreferencesManager.shared.grantVoiceAutoTranslationConsent()
        voiceConsentMissing = false
    }

    // MARK: - Activation (start)

    /// Activates the conversation: registers the GRDB window observation,
    /// wires every Combine subscription, and declares the conversation as
    /// currently-open on the sync engine.
    ///
    /// Il n'ARME que — il ne LIT pas. La première lecture de fenêtre appartient
    /// à `loadMessages()`, que le `.task` de la vue enchaîne juste après
    /// (#4943) ; ce doc-comment annonçait encore le `Task { await
    /// messageStore.loadInitial() }` que ce lot a retiré.
    ///
    /// CRITICAL — this MUST NOT run from `init`. `ConversationView` is
    /// reconstructed by SwiftUI on every parent re-evaluation (RootView's
    /// `navigationDestination` closure reads `router.pendingReplyContext`),
    /// and each reconstruction eagerly allocates a throwaway VM that
    /// `@StateObject` immediately discards. When this work lived in `init`,
    /// every throwaway allocation paid for a full SQLite window read+decode on
    /// the main actor and thrashed `syncEngine.setCurrentlyOpenConversation`
    /// (`init` set it, the throwaway `deinit` cleared it), whose published
    /// recompute re-rendered RootView → reconstructed ConversationView → a
    /// self-sustaining main-thread storm (device trace: constant ~57% of a
    /// P-core, thermal state Nominal→Fair). Driven once from the view's
    /// `.task` (one run per `.id(conversationId)` identity); the `hasStarted`
    /// guard makes re-entry (background→foreground re-task) a no-op.
    func start() {
        guard !hasStarted else { return }
        hasStarted = true
        // Declare this conversation as currently visible so the sync engine
        // forces its `unreadCount` to 0 on every server broadcast (the user
        // IS reading it) and excludes it from the cross-conversation
        // aggregator. Cleared in `deinit`.
        syncEngine.setCurrentlyOpenConversation(conversationId)
        // OUVRIR, C'EST LIRE — et ça se voit tout de suite.
        //
        // Le moteur posait déjà cette règle (zéro + frontière) mais dans son
        // cache SEUL, et de façon différée : les lignes @Published et le
        // `ConversationStore` ne l'apprenaient que par le rechargement de
        // cache débouncé à 200 ms — quand ils l'apprenaient. Le seul autre
        // chemin qui les touchait, `markAsRead(messageIds:)`, est gaté par
        // l'exactitude de lecture (`caughtUpMessageId`) : ouvrir une
        // conversation à 99 non-lus sans en atteindre le bas ne le franchit
        // jamais. Le store gardait donc 99, le cache disait 0, et la ligne
        // affichait celui des deux qui avait publié en dernier — le
        // va-et-vient que l'utilisateur voyait.
        //
        // Rien n'est envoyé au serveur ici : l'accusé de lecture garde son
        // exigence d'exactitude, il part par `markAsRead(messageIds:)` quand
        // le lecteur a réellement rattrapé.
        ConversationReadSignal.markReadLocally(conversationId, syncEngine: syncEngine)
        // Open side-effects (socket room join + active-conversation publish to
        // the notification singletons). Lives here — NOT in the handler's init
        // — so the throwaway VMs SwiftUI allocates on every parent
        // re-evaluation never fire them (only the installed VM runs start()).
        socketHandler?.activate()
        // OBSERVER, oui — LIRE, non. La première lecture de fenêtre appartient
        // à `loadMessages()`, que le `.task` de la vue enchaîne juste après
        // `start()` (#4943, D-OPEN-01). Un `Task { await
        // messageStore.loadInitial() }` vivait ici : non attendu, il courait
        // en parallèle de `loadMessages()`, qui relit la MÊME fenêtre — deux
        // lectures SQLite et deux à trois re-dispositions de la liste dans la
        // seconde suivant le tap, pour un contenu identique.
        //
        // Et l'ordre n'est pas une préférence de style : `loadMessages()` doit
        // lire APRÈS avoir drainé les messages pré-récupérés par la NSE et
        // réconcilié les lignes d'envoi orphelines. Une lecture lancée ici les
        // manquerait toutes, puis publierait une fenêtre incomplète AVANT que
        // les traductions ne soient hydratées — le contraire de la publication
        // atomique que `loadInitialSnapshot` + `apply` construisent.
        messageStore.startObserving(dbPool: startupDependencies.dbPool)
        messagesPersistCancellable = $messages
            .dropFirst()
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] snapshot in
                guard let self, !snapshot.isEmpty else { return }
                // Route through the id-mapping persister so any reconciled
                // optimistic rows land in cache under their server ids.
                Task { [weak self] in await self?.persistMessagesUsingServerIds() }
            }
        subscribeToMessageStore()
        subscribeToQueueReconciliation()
        subscribeToLanguagePreferenceChanges()
        subscribeToMessagesForAudioQueue()
        subscribeToAudioCoordinatorFinishedEvents()
        mirrorMessagesIntoStateStore()
        hydrateCurrentConversationFromCache()
        loadVoiceConsentStatus()
        // Cross-conversation unread aggregator powers the back-button pill.
        // `setCurrentlyOpenConversation(conversationId)` (called above) makes the
        // sync engine EXCLUDE this conversation from `totalConversationsUnread`,
        // so the published aggregate is ALREADY "other conversations only" — we
        // mirror it directly. Subtracting this conversation's own unread here
        // would remove it a second time and under-shoot the pill to 0 while other
        // conversations still have unread (the engine is the single source of
        // truth for cross-conversation unread; the VM must not re-derive it).
        // `max(0, …)` is a defensive clamp — the engine already clamps ≥ 0.
        syncEngine.totalConversationsUnread
            .receive(on: DispatchQueue.main)
            .sink { [weak self] total in
                self?.otherConversationsUnread = max(0, total)
            }
            .store(in: &cancellables)
        if let session = anonymousSession {
            APIClient.shared.anonymousSessionToken = session.sessionToken
            MessageSocketManager.shared.connectAnonymous(sessionToken: session.sessionToken)
        }
    }

    // MARK: - Miroirs et préférences de langue

    /// Mirror the legacy `@Published var messages` into the new
    /// `ConversationStateStore.messages` so the split handlers
    /// (`searchHandler`, `mediaHandler`) can read
    /// off the shared store while the legacy ViewModel still owns the
    /// canonical source. Removed once the migration of the message
    /// pipeline (init/load/send/edit/delete) into `commandHandler` is
    /// complete and the legacy `@Published messages` retired.
    private func mirrorMessagesIntoStateStore() {
        stateStore.messages = messages
        $messages
            .receive(on: DispatchQueue.main)
            .sink { [weak self] snapshot in
                self?.stateStore.messages = snapshot
            }
            .store(in: &cancellables)
    }

    private func subscribeToLanguagePreferenceChanges() {
        authManager.currentUserPublisher
            .removeDuplicates { old, new in
                old?.systemLanguage == new?.systemLanguage
                && old?.regionalLanguage == new?.regionalLanguage
                && old?.customDestinationLanguage == new?.customDestinationLanguage
            }
            .dropFirst()
            .sink { [weak self] _ in
                // P4.2: cache invalidation follows the same rename that
                // moved `preferredLanguages` into ``ConversationLanguagePreferences``;
                // the old `_cachedPreferredLanguages` / `_cachedPreferredLanguagesUserId`
                // pair was collapsed into a single Equatable cache slot.
                self?._cachedLanguagePreferences = nil
                // B2 (Prisme Linguistique) — bump the revision so any
                // subscriber that selected a translation based on the
                // previous preferred languages can re-resolve. Without
                // this, the bubble keeps showing the old translation
                // until a new translation event arrives.
                self?.preferredLanguageRevision &+= 1
            }
            .store(in: &cancellables)
    }

    // MARK: - Typing Emission (delegated to socketHandler)

    func onTextChanged(_ text: String) {
        socketHandler?.onTextChanged(text)
        mentionController.handleQuery(in: text)
    }

    func stopTypingEmission() {
        socketHandler?.stopTypingEmission()
    }

    // MARK: - Programmatic Scroll Guard

    /// Call before any programmatic scroll. Resets after a short delay.
    func markProgrammaticScroll() {
        isProgrammaticScroll = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.isProgrammaticScroll = false
        }
    }

    // MARK: - Media Prefetch (delegated to ConversationMediaHandler)

    /// Prefetch media for the most recent messages with attachments. The
    /// debounce stays here (300 ms collapses bursts of socket updates) and
    /// the actual cache warming is delegated to `mediaHandler`, which owns
    /// the in-flight task / cancellation contract.
    func prefetchRecentMedia() {
        mediaPrefetchDebounce?.cancel()
        mediaPrefetchDebounce = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }
            self.mediaHandler.prefetchRecentMedia()
        }
    }

    // MARK: - Sync Engine Observation

    func observeSync() {
        let targetId = conversationId
        let publisher = syncEngine.messagesDidChange
        syncCancellable = publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] changedId in
                guard changedId == targetId else { return }
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let cached = await CacheCoordinator.shared.messages.load(for: targetId)
                    switch cached {
                    case .fresh(let data, _), .stale(let data, _):
                        // Update delivery counters on existing own-message records via GRDB;
                        // the store observation surfaces the changes to `messages` automatically.
                        // Batché : 1 transaction + 1 refresh pour la rafale,
                        // au lieu de N awaits → N notifications → N relectures.
                        let persistence = self.messagePersistence
                        let freshById = Dictionary(data.map { ($0.id, $0) },
                                                   uniquingKeysWith: { _, last in last })
                        let updates: [MessagePersistenceActor.DeliveryCounterUpdate] = self.messages
                            .filter(\.isMe)
                            .compactMap { existing in
                                guard let fresh = freshById[existing.id],
                                      fresh.deliveryStatus.isBetterThan(existing.deliveryStatus)
                                else { return nil }
                                return MessagePersistenceActor.DeliveryCounterUpdate(
                                    localId: existing.id,
                                    deliveredCount: fresh.deliveredCount,
                                    readCount: fresh.readCount,
                                    deliveredToAllAt: fresh.deliveredToAllAt,
                                    readByAllAt: fresh.readByAllAt
                                )
                            }
                        if !updates.isEmpty {
                            try? await persistence.updateDeliveryCounters(updates)
                        }
                        // Surface any messages in the cache that aren't yet in GRDB.
                        let currentIds = Set(self.messages.map(\.id))
                        let newFromCache = data.filter { !currentIds.contains($0.id) }
                        if !newFromCache.isEmpty {
                            // Convert domain messages back to IncomingMessageData for GRDB upsert.
                            let incoming = newFromCache.map { msg in
                                MessagePersistenceActor.IncomingMessageData(
                                    id: msg.id,
                                    conversationId: msg.conversationId,
                                    senderId: msg.senderId,
                                    content: msg.content.isEmpty ? nil : msg.content,
                                    createdAt: msg.createdAt,
                                    computedState: .delivered,
                                    // Le message vient du CACHE, il connaît sa
                                    // source : la taire ferait naître un avis
                                    // système comme une parole ordinaire.
                                    messageSource: msg.messageSource.rawValue,
                                    messageType: msg.messageType.rawValue
                                )
                            }
                            await self.messagePersistence.bufferIncoming(incoming)
                            self.prefetchRecentMedia()
                        }
                    case .expired, .empty:
                        break
                    }
                }
            }
    }

    // MARK: - Hydratation de la conversation courante

    /// Pulls the conversation row out of the cache so the mini-player can
    /// display its name + artwork + accent color. Best-effort — if the row
    /// isn't cached yet, the fallback constants kick in.
    private func hydrateCurrentConversationFromCache() {
        let convId = conversationId
        Task { [weak self] in
            let cached = await CacheCoordinator.shared.conversations.load(for: "list")
            guard let self else { return }
            let list: [MeeshyConversation]
            switch cached {
            case .fresh(let data, _), .stale(let data, _):
                list = data
            case .expired, .empty:
                return
            }
            if let match = list.first(where: { $0.id == convId }) {
                self.currentConversation = match
            }
        }
    }
}
