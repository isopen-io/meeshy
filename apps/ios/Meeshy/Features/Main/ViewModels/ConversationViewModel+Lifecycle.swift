import Foundation
import Combine
import UIKit
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
    let persistence: MessagePersistenceActor
    var collaborators: ConversationCollaborators? = nil
    var transcriptionRetry: (any TranscriptionRetryScheduling)? = nil
    /// Ce que l'ère chiffrée de la conversation laisse servir (#11380) — une
    /// instance par conversation ouverte, comme ce conteneur.
    var encryptedEra = ConversationEncryptedEra()
    /// Le clair que cet appareil a posé sur le fil, que la cellule repose (#12916).
    var endToEndClear = EndToEndThreadClear()
    /// Lecture ou regard (#18721) : une conversation tirée depuis la bannière ne se marque lue qu'au premier acte.
    var readGate = ConversationReadGate()

    @MainActor
    static var live: ConversationDependencies {
        ConversationDependencies(persistence: DependencyContainer.shared.messagePersistence)
    }
}

// MARK: - Seam de reprise d'appel

/// Seam de testabilité de `LiveCallJoiner` (bulle vivante et ligne de liste) — par
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
    /// #9111 — un groupe rejoint passe par le maillage, qui doit le savoir avant la reprise.
    var markGroupConversation: (_ conversationId: String, _ title: String?) -> Void = { _, _ in }

    static let live = LiveCallJoinContext(
        currentCallId: { CallManager.shared.currentCallId },
        isIdle: { CallManager.shared.callState == .idle },
        hasPendingIncomingCall: { CallManager.shared.pendingIncomingCall?.callId == $0 },
        bringCallUIForward: { CallManager.shared.displayMode = .fullScreen },
        rejoinActiveCall: { callId, conversationId, remoteUserId, remoteUsername, isVideo in
            CallManager.shared.outgoingDial.rejoinActiveCall(
                callId: callId,
                conversationId: conversationId,
                remoteUserId: remoteUserId,
                remoteUsername: remoteUsername,
                isVideo: isVideo
            )
        },
        markGroupConversation: { GroupCallMeshCoordinator.shared.markGroupConversation($0, title: $1) }
    )
}

extension ConversationViewModel {

    // MARK: - Consentement vocal

    /// Chaque `.task` de la vue (réapparition) relit ; le retour au premier
    /// plan aussi (#16418).
    private func watchVoiceConsent() {
        collaborators.voiceConsentRefresher.observeForeground { [weak self] in self?.refreshVoiceConsentStatus() }
        refreshVoiceConsentStatus()
    }

    @discardableResult
    func refreshVoiceConsentStatus() -> Task<Void, Never>? {
        collaborators.voiceConsentRefresher.refresh { [weak self] in self?.voiceConsentMissing = $0 }
    }

    /// Validation du popup de traduction automatique à l'envoi d'un audio
    /// sans consentement : accorde le clonage vocal par
    /// `PUT /me/consents/voice-cloning` — la passerelle horodate et pose les
    /// ancêtres manquants — puis active les features audio associées.
    ///
    /// OPTIMISTE, jamais bloquant : le drapeau tombe avant la réponse, pour que
    /// l'envoi relancé par la vue parte aussitôt. Un octroi refusé RESTAURE le
    /// drapeau et le dit (#6624) : l'écran ne croit pas enregistré un
    /// consentement que la passerelle n'a pas posé.
    ///
    /// `grant` / `toast` : coutures de test, `nil` en production.
    @discardableResult
    func grantVoiceAutoTranslationConsent(
        grant: (@MainActor () async throws -> Void)? = nil,
        toast: FeedbackToastSurfacing? = nil
    ) -> Task<Void, Never> {
        let gate = collaborators.voiceConsent
        let grant: @MainActor () async throws -> Void = grant ?? { try await gate.grant() }
        let toast: FeedbackToastSurfacing = toast ?? FeedbackToastManager.shared
        let consentMissingBeforeGrant = voiceConsentMissing
        collaborators.voiceConsentRefresher.supersede()
        voiceConsentMissing = false
        return Task { [weak self] in
            do {
                try await grant()
            } catch {
                self?.voiceConsentMissing = consentMissingBeforeGrant
                toast.showError(
                    String(localized: "conversation.voiceConsent.failed",
                           defaultValue: "Impossible d'activer la traduction automatique des vocaux. Réessayez plus tard.",
                           bundle: .main)
                )
            }
        }
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
        ConversationCatchUpGate.shared.arrive(self) // #10830 — le `.task` qui ramène l'écran réarme son rattrapage.
        watchVoiceConsent()
        guard !hasStarted else { return reopenScreen() }
        hasStarted = true
        // Rouvrir, c'est relire (la marque « non lu » tombe) — sauf en REGARD (#18721), qui ne lit rien avant le premier acte.
        if startupDependencies.readGate.opensReading(conversationId) { ExplicitUnreadMarks.clear(conversationId) }
        // OUVRIR N'EST PAS LIRE (#7350, I-2) : le moteur force à 0 la ligne OUVERTE et l'exclut de l'agrégat, mais ce
        // zéro est TRANSITOIRE — `deinit` redonne à la ligne ce qui reste non lu (`notePartialRead(seen:)`, borné par
        // `FirstUnreadBoundary`), tout son compte en regard. Seule une lecture COMPLÈTE (`sendReadReceipt`) ou un geste
        // explicite date une frontière. Une scène = une ouverture (multi-fenêtre).
        syncEngine.openConversation(conversationId)
        // Open side-effects (socket room join + active-conversation publish to
        // the notification singletons). Lives here — NOT in the handler's init
        // — so the throwaway VMs SwiftUI allocates on every parent
        // re-evaluation never fire them (only the installed VM runs start()).
        socketHandler?.activate()
        // #7847 — les contacts de la liste `@` se lisent en CACHE (sans
        // réseau) dès l'ouverture : le `@` les sert ainsi à l'image près.
        Task { [weak self] in await self?.mentionController.primeContacts() }
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
        messageStore.startObserving()
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

    // MARK: - Lecture partielle

    /// Lecture PARTIELLE (#7350, I-2) : ce qui reste non lu, borné par la
    /// frontière du premier non-lu (`FirstUnreadBoundary.remainingUnread`, la
    /// loi de S1), est confié au moteur, qui le redonne à la ligne de liste
    /// quand l'écran se ferme. 99 non-lus, 5 affichés ⇒ 94 — et non le 0 que
    /// l'ouverture posait avant ce lot.
    func notePartialRead(seen messageIds: [String]) {
        seenServerMessageIds.formUnion(messageIds)
        let remaining = FirstUnreadBoundary.remainingUnread(
            messages: messages.map {
                FirstUnreadCandidateMessage(id: serverId(for: $0.id), senderId: $0.senderId, createdAt: $0.createdAt)
            },
            lastReadMessageId: lastReadMessageId,
            lastReadAt: lastReadAt,
            lastReadMessageCreatedAt: lastReadMessageCreatedAt,
            joinedAt: memberJoinedAt,
            viewerId: currentUserId,
            seenIds: seenServerMessageIds,
            unreadAtOpen: initialUnreadCount,
            windowIsAtTip: !hasNewerMessages,
            caughtUpMessageId: lastCaughtUpMessageId
        )
        syncEngine.noteUnreadRemaining(conversationId, remaining)
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
        CoalescingDeadline.shared.schedule(for: self, after: .milliseconds(500)) { [weak self] in
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
            guard await cancellableSleep(for: .milliseconds(300)) else { return }
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
                    guard let data = await self.collaborators.cacheReader.cachedThread(id: targetId) else { return }
                    // Update delivery counters on existing own-message records via GRDB;
                    // the store observation surfaces the changes to `messages` automatically.
                    // Batché : 1 transaction + 1 refresh pour la rafale,
                    // au lieu de N awaits → N notifications → N relectures.
                    let persistence = self.messagePersistence
                    let updates = DeliveryCounterReconciliation.updates(own: self.messages, fresh: data)
                    if !updates.isEmpty {
                        try? await persistence.updateDeliveryCounters(updates)
                    }
                    // Surface any messages in the cache that aren't yet in GRDB —
                    // never a dead ephemeral, never without its protection (#7552).
                    let incoming = CachedThreadSurfacing.rows(
                        data,
                        present: Set(self.messages.map(\.id))
                    )
                    if !incoming.isEmpty {
                        await self.messagePersistence.bufferIncoming(incoming)
                        self.prefetchRecentMedia()
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
        let reader = collaborators.cacheReader
        Task { [weak self] in
            guard let match = await reader.currentConversation(id: convId) else { return }
            self?.currentConversation = match
        }
    }
}
