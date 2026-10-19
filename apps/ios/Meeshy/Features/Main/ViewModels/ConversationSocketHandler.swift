import Foundation
import Combine
import GRDB
import MeeshySDK
import UIKit
import os

// MARK: - ConversationSocketHandler

@MainActor
final class ConversationSocketHandler {
    // Internal (not `private`), not `fileprivate` : `ConversationSocketHandler
    // +MediaEvents.swift` (I4, #7360) stores its own subscriptions into this
    // SAME set from another file — the split that keeps this file under the
    // repo's 1200-line budget. Still invisible outside the module.
    var cancellables = Set<AnyCancellable>()
    private let conversationId: String
    private let currentUserId: String
    private let messageSocket: MessageSocketProviding
    // `nonisolated(unsafe)` for the same reason as the typing state below:
    // `deinit` needs to snapshot this reference into a local BEFORE handing
    // it (not `self`) to the MainActor `Task` that clears it — self is
    // uniquely referenced at that point, so there's no real race.
    nonisolated(unsafe) weak var delegate: ConversationSocketDelegate?

    /// Optional persistence actor — when set, message-related socket events
    /// write through the actor in addition to updating the delegate/ViewModel.
    var persistence: MessagePersistenceActor?

    private lazy var incomingReconciler = ConversationIncomingMessageReconciler(
        currentUserId: currentUserId,
        delegateProvider: { [weak self] in self?.delegate },
        persistenceProvider: { [weak self] in self?.persistence },
        onSenderStoppedTyping: { [weak self] id in
            self?.removeTypingUser(id: id)
            self?.clearTypingSafetyTimer(for: id)
        }
    )

    // Typing emission state. `nonisolated(unsafe)` is REQUIRED (not cosmetic):
    // the nonisolated `deinit` invalidates these timers for cleanup, and under
    // Swift 6 strict concurrency a nonisolated deinit cannot touch MainActor-
    // isolated, non-Sendable stored properties (`Timer` is non-Sendable). At
    // deallocation `self` is uniquely referenced, so there is no actual data
    // race — the unsafe assertion is sound. Timer callbacks still hop to the
    // MainActor via `Task { @MainActor [weak self] in ... }` before mutating.
    nonisolated(unsafe) private var typingTimer: Timer?
    nonisolated(unsafe) private var typingIdleTimer: Timer?
    nonisolated(unsafe) private var isEmittingTyping = false
    private static let typingDebounceInterval: TimeInterval = 3.0
    private static let typingReemitInterval: TimeInterval = 3.0
    private static let typingSafetyTimeout: TimeInterval = 15.0
    // Keyed by userId (NOT display name) — two participants can share a display
    // name (e.g. two uncustomized "John Smith"s in a group), and keying by name
    // caused one user's typing:stop to wipe the other's still-active entry.
    nonisolated(unsafe) private var typingSafetyTimers: [String: Timer] = [:]
    nonisolated(unsafe) private var typingUserOrder: [String] = []
    nonisolated(unsafe) private var typingUserEntries: [String: TypingParticipant] = [:]

    /// `true` une fois `activate()` exécuté (instance réelle, installée par
    /// `@StateObject`). SwiftUI alloue EAGER un `ConversationViewModel`
    /// jetable — donc un handler jetable — à chaque ré-évaluation d'un parent
    /// qui monte `ConversationView` (ex. `iPadRootView`, qui observe
    /// `NotificationToastManager`). Ces jetables ne doivent émettre NI
    /// `conversation:join`/`leave` NI publier `onConversationOpened`/`Closed`
    /// — sinon ils re-déclenchent la ré-évaluation du parent et créent une
    /// boucle create/destroy auto-entretenue (pic CPU, storm 429 sur `/read`).
    /// L'ancienne protection (side-effects différés via
    /// `DispatchQueue.main.async { [weak self] }` depuis `init`) reposait sur
    /// la désallocation du jetable AVANT le tick suivant — timing non garanti
    /// sous pression de re-render : un jetable encore vivant s'activait, son
    /// `deinit` publiait `onConversationClosed`, et le cycle open→close→open
    /// relançait un POST `/notifications/conversation/:id/read` à chaque tour.
    /// `activate()` n'est désormais appelé QUE depuis
    /// `ConversationViewModel.start()` (déclenché par `.task` de la vue,
    /// jamais exécuté par une VM jetable), ce qui supprime la course.
    nonisolated(unsafe) private var didActivate = false

    // MARK: - Init / Deinit

    init(
        conversationId: String,
        currentUserId: String,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared
    ) {
        self.conversationId = conversationId
        self.currentUserId = currentUserId
        self.messageSocket = messageSocket
    }

    /// Side-effects d'ouverture : join de la room socket + publication de la
    /// conversation active aux singletons notifications. Mutations `@Published`
    /// sur des singletons partagés → doit être appelé hors évaluation de body
    /// (le `.task` de la vue, via `ConversationViewModel.start()`, satisfait
    /// cette contrainte). Idempotent.
    func activate() {
        guard !didActivate else { return }
        didActivate = true
        // **L'oreille AVANT la question** (#5947). `joinConversation` pose au
        // serveur la seule question dont la réponse dit « tu n'es plus membre » ;
        // le puits qui l'écoute (`conversationJoinError`, plus bas dans
        // `subscribeToSocket`) n'était armé qu'ensuite, par `loadMessages()`.
        // Entre les deux : une lecture GRDB, le drain NSE, les réconciliations —
        // bien plus que les ~90 ms d'aller-retour mesurés.
        //
        // `PassthroughSubject` ne rejoue RIEN. La réponse tombait donc dans le
        // vide, et le mémo de `joinConversation` interdisait de reposer la
        // question : une conversation dont le serveur avait retiré l'utilisateur
        // restait ouverte, lisible et INSCRIPTIBLE, y compris après relance
        // complète de l'app.
        //
        // L'armement est idempotent (`guard cancellables.isEmpty`) et ne coûte
        // rien — c'est exactement l'argument qui l'avait déjà fait remonter
        // avant la garde d'idempotence de `loadMessages` (#4943).
        armSocketSubscriptions()
        messageSocket.joinConversation(conversationId)
        ConversationViewingReporter.shared.conversationOpened(conversationId)
        NotificationToastManager.shared.onConversationOpened(conversationId)
        NotificationCoordinator.shared.markConversationRead(conversationId)
    }

    // UNE file ordonnée par handler ACTIVÉ, créée ici et jamais pour les
    // handlers jetables de SwiftUI : les événements qui mutent le fil
    // s'appliquent dans l'ordre d'ARRIVÉE (#11047). Un `typing:start` reçu après
    // un `message:new` ne peut plus être effacé par la réconciliation, plus
    // lente, du message.
    private var eventLane: OrderedEventLane?

    func armSocketSubscriptions() {
        guard cancellables.isEmpty else { return }
        let lane = OrderedEventLane()
        lane.store(in: &cancellables)
        eventLane = lane
        subscribeToSocket(on: lane)
        subscribeToReconnect()
    }

    /// Barrière des tests : rend la main quand tout événement reçu avant
    /// l'appel est appliqué.
    func awaitPendingSocketEvents() async {
        await eventLane?.barrier()
    }

    nonisolated deinit {
        // Seule l'instance réellement activée quitte la room / signale la
        // fermeture / coupe le typing. Un handler jetable (didActivate=false)
        // n'a jamais rejoint ni publié, donc il ne doit rien défaire — sinon
        // il publie `onConversationClosed` et relance la boucle.
        if didActivate {
            // Capturé AVANT la `Task` : `deinit` est nonisolé et `self` ne
            // survit pas à la fermeture — lire `conversationId` dedans ne
            // compilerait pas, et le capturer implicitement retiendrait `self`.
            let id = conversationId
            Task { @MainActor in
                // La conversation NOMMÉE (#5938) : cette `Task` est différée,
                // donc elle peut s'exécuter APRÈS l'ouverture de la suivante.
                // Sans son nom, elle effaçait la conversation où l'on venait
                // d'entrer — et toutes ses notifications se remettaient à
                // s'afficher par-dessus le fil qu'on lisait.
                NotificationToastManager.shared.onConversationClosed(id)
                // La room ne se quitte qu'au DERNIER écran de la conversation
                // (#9047) : un `conversation:leave` immédiat, émis par un écran
                // démonté après la réouverture, retirait le socket de la room
                // et la présence « ici » côté serveur.
                if ConversationViewingReporter.shared.conversationClosed(id) {
                    MessageSocketManager.shared.leaveConversation(id)
                }
            }
            if isEmittingTyping {
                MessageSocketManager.shared.emitTypingStop(conversationId: conversationId)
            }
        }
        typingTimer?.invalidate()
        typingIdleTimer?.invalidate()
        typingSafetyTimers.values.forEach { $0.invalidate() }
        typingSafetyTimers.removeAll()
        typingUserOrder.removeAll()
        typingUserEntries.removeAll()
        // Snapshot `delegate` now, while `self` is still valid, and hand the
        // snapshot (not `self`) to the Task. ARC zeroes weak references to
        // `self` as soon as `deinit` begins — a `[weak self]` capture inside
        // a Task launched FROM `deinit` already observes `self` as nil by
        // the time it runs, making `self?.delegate?...` silently dead code
        // and leaving stale typing indicators on the delegate after teardown.
        let delegateSnapshot = delegate
        Task { @MainActor in
            delegateSnapshot?.typingParticipants.removeAll()
        }
    }


    // MARK: - Room Management

    // MARK: - Typing Emission

    func onTextChanged(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            startTypingEmission()
            resetIdleTimer()
            ConversationViewingReporter.shared.activityOccurred(conversationId)
        } else {
            stopTypingEmission()
        }
    }

    private func resetIdleTimer() {
        typingIdleTimer?.invalidate()
        typingIdleTimer = Timer.scheduledTimer(withTimeInterval: Self.typingDebounceInterval, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.stopTypingEmission()
            }
        }
    }

    private func startTypingEmission() {
        guard UserPreferencesManager.shared.privacy.showTypingIndicator else { return }

        if !isEmittingTyping {
            isEmittingTyping = true
            messageSocket.emitTypingStart(conversationId: conversationId)
        }

        guard typingTimer == nil else { return }
        typingTimer = Timer.scheduledTimer(withTimeInterval: Self.typingReemitInterval, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.isEmittingTyping else { return }
                self.messageSocket.emitTypingStart(conversationId: self.conversationId)
            }
        }
    }

    func stopTypingEmission() {
        typingTimer?.invalidate()
        typingTimer = nil
        typingIdleTimer?.invalidate()
        typingIdleTimer = nil

        guard isEmittingTyping else { return }
        isEmittingTyping = false
        messageSocket.emitTypingStop(conversationId: conversationId)
    }

    // MARK: - Typing Safety Timers

    // Guard against runaway timer growth in large conversations: beyond this
    // cap we skip scheduling a new timer (the oldest entry stays at its current
    // timeout, which is the desired no-op for very large groups).
    // Cap set to 1000 to support large group chats (500+ participants) without
    // silently dropping typing indicators mid-conversation.
    private static let typingSafetyTimerCap = 1_000

    private func resetTypingSafetyTimer(for userId: String) {
        if typingSafetyTimers[userId] == nil,
           typingSafetyTimers.count >= Self.typingSafetyTimerCap {
            return
        }
        typingSafetyTimers[userId]?.invalidate()
        typingSafetyTimers[userId] = Timer.scheduledTimer(withTimeInterval: Self.typingSafetyTimeout, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.removeTypingUser(id: userId)
                self.typingSafetyTimers.removeValue(forKey: userId)
            }
        }
    }

    private func clearTypingSafetyTimer(for userId: String) {
        typingSafetyTimers[userId]?.invalidate()
        typingSafetyTimers.removeValue(forKey: userId)
    }

    /// Roster of currently-typing users, keyed by userId so a same-name
    /// collision can't make one user's departure clear another's entry.
    /// `delegate.typingParticipants` is recomputed from this roster on every
    /// change, preserving first-seen order.
    private func addTypingUser(id: String, name: String) {
        // L'avatar est relu à CHAQUE `typing:start`, pas seulement à la
        // première frappe : au tout premier événement l'auteur n'a
        // peut-être encore rien écrit dans ce fil (aucun `senderAvatarURL`
        // en mémoire), et le keepalive de frappe — un `typing:start` toutes
        // les ~3 s — rattrape le visage dès qu'il devient connu.
        typingUserEntries[id] = TypingParticipant(
            id: id,
            displayName: name,
            avatarURL: delegate?.localAvatarURL(forSender: id),
            ring: delegate?.localRing(forSender: id)
        )
        if !typingUserOrder.contains(id) {
            typingUserOrder.append(id)
        }
        publishTypingRoster()
    }

    private func removeTypingUser(id: String) {
        guard typingUserEntries.removeValue(forKey: id) != nil else { return }
        typingUserOrder.removeAll { $0 == id }
        publishTypingRoster()
    }

    /// Republie le roster dans l'ordre de première apparition. Site unique :
    /// les deux mutations ci-dessus doivent produire exactement la même
    /// projection, sans quoi la rangée du fil et le bouton de retour au bas
    /// désigneraient des personnes différentes.
    private func publishTypingRoster() {
        delegate?.typingParticipants = typingUserOrder.compactMap { typingUserEntries[$0] }
    }

    // MARK: - Socket Subscriptions

    private func subscribeToSocket(on lane: OrderedEventLane) {
        subscribeMessageLifecycle(on: lane)
        subscribeMessageMarks(on: lane)
        subscribeReactions(on: lane)
        subscribePresence(on: lane)
        subscribeConversationState()
        // Réactions par-pièce-jointe, statut de consommation, enrichissements
        // (transcription / traduction audio) — extraits par responsabilité
        // dans `ConversationSocketHandler+MediaEvents.swift` (I4, #7360).
        subscribeToMediaEvents(socketManager: messageSocket, convId: conversationId, userId: currentUserId, on: lane)
    }

    private func subscribeMessageLifecycle(on lane: OrderedEventLane) {
        let convId = conversationId

        messageSocket.messageReceived
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyIncoming($0) }
            .store(in: &cancellables)

        // Jonction refusée par le serveur. Le MOTIF décide : `isMembershipDenied`
        // est le jumeau Swift de la règle partagée `isMembershipDeniedJoinError()`.
        // Un refus transitoire (`rate_limited`, `server_error`…) ne détruit rien ;
        // la room sera rejointe par le cycle de reconnexion du socket. Reste un
        // puits synchrone : il ne mute pas le fil et ne doit attendre personne.
        messageSocket.conversationJoinError
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard event.isMembershipDenied else {
                    Logger.socket.notice(
                        "conversation:join-error TRANSITOIRE — cache et vue conservés (reason=\(event.reason ?? "nil", privacy: .public))"
                    )
                    return
                }
                self?.delegate?.handleSocketAccessRevoked(reason: event.message)
            }
            .store(in: &cancellables)

        messageSocket.messageEdited
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyEdited($0) }
            .store(in: &cancellables)

        messageSocket.messageDeleted
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyDeleted($0) }
            .store(in: &cancellables)

        messageSocket.messageExpired
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyExpired($0) }
            .store(in: &cancellables)

        messageSocket.messageCountdownStarted
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyCountdownStarted($0) }
            .store(in: &cancellables)

        messageSocket.messageHiddenForMe
            .map { @Sendable event in event.messages.filter { $0.conversationId == convId }.map(\.messageId) }
            .filter { !$0.isEmpty }
            .relay(through: lane) { [weak self] in await self?.applyHiddenForMe(ids: $0) }
            .store(in: &cancellables)

        messageSocket.messageRestoredForMe
            .map { @Sendable event in event.messages.filter { $0.conversationId == convId }.map(\.messageId) }
            .filter { !$0.isEmpty }
            .relay(through: lane) { [weak self] in await self?.applyRestoredForMe(ids: $0) }
            .store(in: &cancellables)
    }

    private func subscribeMessageMarks(on lane: OrderedEventLane) {
        let convId = conversationId

        messageSocket.messagePinned
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyPinned($0) }
            .store(in: &cancellables)

        messageSocket.messageUnpinned
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyUnpinned($0) }
            .store(in: &cancellables)
    }

    private func subscribeReactions(on lane: OrderedEventLane) {
        let convId = conversationId

        messageSocket.reactionAdded
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyReactionAdded($0) }
            .store(in: &cancellables)

        messageSocket.reactionRemoved
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyReactionRemoved($0) }
            .store(in: &cancellables)
    }

    private func subscribePresence(on lane: OrderedEventLane) {
        let convId = conversationId
        let userId = currentUserId

        // Le roster est keyé par `userId` (voir `addTypingUser`) : deux
        // participants peuvent partager un nom d'affichage.
        messageSocket.typingStarted
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyTypingStarted($0) }
            .store(in: &cancellables)

        messageSocket.typingStopped
            .filter { $0.conversationId == convId }
            .relay(through: lane) { [weak self] in await self?.applyTypingStopped($0) }
            .store(in: &cancellables)

        messageSocket.readStatusUpdated
            .filter { $0.conversationId == convId }
            .filter { ($0.userId ?? $0.participantId) != userId }
            .relay(through: lane) { [weak self] in await self?.applyReadStatus($0) }
            .store(in: &cancellables)

        // I3 (#7349) — `message:pending-delivered` : la file hors-ligne de cet
        // utilisateur vient d'être rejouée par le gateway. Même chemin que la
        // resynchronisation de reconnexion, borné à la conversation du handler.
        messageSocket.pendingMessagesDelivered
            .filter { $0.conversationIds.contains(convId) }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.triggerSyncIfNeeded()
            }
            .store(in: &cancellables)
    }

    private func subscribeConversationState() {
        let convId = conversationId

        messageSocket.participantRoleUpdated
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                // `participant` est optionnel : renoncer à l'invalidation parce
                // qu'il manque coûterait un trombinoscope périmé pour un nom absent.
                delegate.handleParticipantRoleUpdated(
                    participantId: event.participant?.id ?? event.userId,
                    newRole: event.newRole
                )
            }
            .store(in: &cancellables)

        messageSocket.liveLocationStarted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                let session = ActiveLiveLocation(
                    userId: event.userId,
                    username: event.username,
                    latitude: event.latitude,
                    longitude: event.longitude,
                    expiresAt: event.expiresAt ?? Date().addingTimeInterval(TimeInterval(event.durationMinutes * 60)),
                    startedAt: event.startedAt ?? Date()
                )
                delegate.activeLiveLocations.removeAll { $0.userId == event.userId }
                delegate.activeLiveLocations.append(session)
            }
            .store(in: &cancellables)

        messageSocket.liveLocationUpdated
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate,
                      let idx = delegate.activeLiveLocations.firstIndex(where: { $0.userId == event.userId })
                else { return }
                delegate.activeLiveLocations[idx].latitude = event.latitude
                delegate.activeLiveLocations[idx].longitude = event.longitude
                delegate.activeLiveLocations[idx].speed = event.speed
                delegate.activeLiveLocations[idx].heading = event.heading
                delegate.activeLiveLocations[idx].lastUpdated = event.timestamp ?? Date()
            }
            .store(in: &cancellables)

        messageSocket.liveLocationStopped
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.delegate?.activeLiveLocations.removeAll { $0.userId == event.userId }
            }
            .store(in: &cancellables)

        messageSocket.conversationClosed
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.delegate?.isConversationClosed = true
            }
            .store(in: &cancellables)
    }

    // MARK: - Event Application (ordered lane)

    private func applyIncoming(_ apiMsg: APIMessage) async {
        guard delegate != nil else { return }
        await incomingReconciler.reconcile(apiMsg)
    }

    /// Une édition de CONTENU périme les traductions du message : le gateway
    /// pose `translations: null` dans le même `updateMany` que `content`, le
    /// client pose le même verdict sinon la bulle (et la copie, et le partage)
    /// servent le texte traduit d'AVANT. Hors branche `callSummary` : la
    /// transition live → terminal d'un avis d'appel n'est pas une édition de
    /// contenu. Posé indépendamment de la présence du store.
    private func applyEdited(_ apiMsg: APIMessage) async {
        if apiMsg.callSummary == nil {
            delegate?.invalidateTranslations(for: apiMsg.id)
        }
        StarredMessagesStore.shared.updatePreview(messageId: apiMsg.id, contentPreview: apiMsg.content ?? "")
        guard let persistence else { return }
        if let callSummary = apiMsg.callSummary {
            await persistCallNoticeEdit(apiMsg, callSummary: callSummary, in: persistence)
        } else {
            await persistContentEdit(apiMsg, in: persistence)
        }
    }

    /// Message d'appel : l'édition serveur est la transition live → terminal
    /// (« en cours » → « Appel · 04:32 »). `markEdited` ne ré-applique JAMAIS la
    /// métadonnée et poserait isEdited — `applyCallNoticeUpdate` met à jour
    /// content + callSummaryJson sans flags d'édition.
    private func persistCallNoticeEdit(
        _ apiMsg: APIMessage, callSummary: CallSummaryMetadata, in persistence: MessagePersistenceActor
    ) async {
        let msgId = apiMsg.id
        do {
            try await persistence.applyCallNoticeUpdate(
                localId: msgId,
                content: apiMsg.content ?? "",
                callSummaryJson: try? JSONEncoder().encode(callSummary),
                serverUpdatedAt: apiMsg.updatedAt ?? apiMsg.editedAt ?? Date()
            )
            try await persistence.applyCallNoticeAttachments(from: apiMsg)
        } catch {
            Logger.messages.warning("[ConversationSocket] applyCallNoticeUpdate failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// L'`editedAt` du SERVEUR, pas l'horloge de l'appareil : `markEdited`
    /// compare cette valeur à l'`editedAt` stocké pour rejeter les éditions
    /// périmées ou hors d'ordre, ce qui exige que tous les appareils comparent
    /// la même horloge.
    private func persistContentEdit(_ apiMsg: APIMessage, in persistence: MessagePersistenceActor) async {
        let msgId = apiMsg.id
        do {
            try await persistence.markEdited(
                localId: msgId,
                newContent: apiMsg.content ?? "",
                editedAt: apiMsg.editedAt ?? Date(),
                marksEdited: apiMsg.isEdited ?? true,
                arrivalsNotice: apiMsg.arrivalsNotice
            )
        } catch {
            Logger.messages.warning("[ConversationSocket] markEdited failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    private func applyDeleted(_ event: MessageDeletedEvent) async {
        // Une suppression pour tous évince aussi l'instantané des favoris : la
        // liste ne montre plus de pierre tombale.
        StarredMessagesStore.shared.remove(messageId: event.messageId)
        guard let persistence else { return }
        let msgId = event.messageId
        do {
            try await persistence.markDeleted(localId: msgId, deletedAt: Date(), sparingOpenedViewOnce: true)
        } catch {
            Logger.messages.warning("[ConversationSocket] markDeleted failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Jumeau SERVEUR d'une suppression (un message auto-détruit brûlé par
    /// `ExpiredMessagesCleanupService`) : même effet local, même écriture.
    ///
    /// **La mort se GRAVE, elle ne s'oublie pas** (#7552) : le registre de
    /// réception est renseigné AVANT l'écriture, sans quoi la projection
    /// retrouvait un registre vide entre les deux et stampait une réception
    /// NEUVE. #7453 — le balayage des bannières est le seul à savoir qu'un
    /// message PRÉCIS vient de mourir pendant que l'application est à l'écran.
    private func applyExpired(_ event: MessageExpiredEvent) async {
        StarredMessagesStore.shared.remove(messageId: event.messageId)
        EphemeralReceiptLedger.shared.noteDestruction(of: event.messageId)
        if let persistence {
            let msgId = event.messageId
            do {
                try await persistence.markDeleted(localId: msgId, deletedAt: Date(), expired: true)
                // #10433 — ses réponses partent avec lui, et une réponse dont
                // la citation est déjà morte part au lieu de rester « Message supprimé ».
                try await persistence.purgeQuoteCascade(fromDead: [msgId])
            } catch {
                Logger.messages.warning("[ConversationSocket] markDeleted (expired) failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        Task { await NotificationActionHandler.sweepExpiredEphemeralBanners() }
    }

    /// **L'échéance SERVIE d'un éphémère** (contrat du fil #7451 point 5).
    /// Chez un destinataire elle ne REMPLACE pas l'échéance locale :
    /// `EphemeralDeadline.resolve` retient la plus PROCHE. Chez l'EXPÉDITEUR
    /// elle est la SEULE horloge (#8905) : `max D(u)`, qui recule à chaque
    /// destinataire qui reçoit plus tard — d'où le remplacement. Gravée en
    /// base : le fil relit GRDB.
    private func applyCountdownStarted(_ event: MessageCountdownStartedEvent) async {
        if let delegate, let index = delegate.messageIndex(for: event.messageId) {
            delegate.messages[index].expiresAt = event.expiresAt
        }
        guard let persistence else { return }
        do {
            try await persistence.applyServedEphemeralDeadline(messageId: event.messageId, expiresAt: event.expiresAt)
        } catch {
            Logger.messages.warning("[ConversationSocket] servedEphemeralDeadline failed \(event.messageId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Masquage PERSONNEL : CE lecteur a retiré des messages de SA vue depuis
    /// un autre appareil. Pas `markDeleted` : le message reste VIVANT pour les
    /// autres, et une pierre tombale resterait affichée à vie puisque le
    /// serveur ne le renverra plus à ce lecteur — il disparaît sans trace.
    /// Un message retiré de la vue ne reste pas dans les favoris.
    private func applyHiddenForMe(ids hiddenIds: [String]) async {
        hiddenIds.forEach { StarredMessagesStore.shared.remove(messageId: $0) }
        guard let persistence else { return }
        do {
            try await persistence.purgeMessages(ids: hiddenIds)
        } catch {
            Logger.messages.warning("[ConversationSocket] purgeMessages failed \(hiddenIds.count, privacy: .public) id(s): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Retour en vue PERSONNEL : le masquage a PURGÉ la ligne, et l'événement
    /// ne porte qu'une ADRESSE — le seul geste honnête est d'aller rechercher,
    /// ce que le délégué fait.
    private func applyRestoredForMe(ids restoredIds: [String]) async {
        await delegate?.restoreMessagesForMe(ids: restoredIds)
    }

    private func applyPinned(_ event: MessagePinnedEvent) async {
        guard let persistence else { return }
        let msgId = event.messageId
        do {
            try await persistence.updatePinned(localId: msgId, pinnedAt: Date(), pinnedBy: event.pinnedBy)
        } catch {
            Logger.messages.warning("[ConversationSocket] updatePinned failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    private func applyUnpinned(_ event: MessageUnpinnedEvent) async {
        guard let persistence else { return }
        let msgId = event.messageId
        do {
            try await persistence.updatePinned(localId: msgId, pinnedAt: nil, pinnedBy: nil)
        } catch {
            Logger.messages.warning("[ConversationSocket] updateUnpinned failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Réaction d'un AUTRE utilisateur : la clé est marquée pour que la pill
    /// joue la comète. La garde compare `userId` (User.id, identité stable) —
    /// `participantId` ne vaut JAMAIS `currentUserId`, donc l'écho de sa propre
    /// réaction re-déclenchait la comète. `aggregation.count` sert de plafond :
    /// l'écho de MA réaction (clé Participant.id) ne s'empile pas sur la ligne
    /// optimiste (clé `currentUserId`), ce qui affichait « 2 » pour un tap.
    private func applyReactionAdded(_ event: ReactionUpdateEvent) async {
        guard let persistence else { return }
        if (event.userId ?? event.participantId) != currentUserId {
            ReactionAnimationGate.markAdded(messageId: event.messageId, emoji: event.emoji)
        }
        let msgId = event.messageId
        do {
            try await persistence.appendReaction(
                localId: msgId,
                reactionId: UUID().uuidString,
                messageId: msgId,
                participantId: event.participantId,
                emoji: event.emoji,
                maxCount: event.aggregation?.count,
                ownerUserId: event.userId
            )
        } catch {
            Logger.messages.warning("[ConversationSocket] appendReaction failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    private func applyReactionRemoved(_ event: ReactionUpdateEvent) async {
        guard let persistence else { return }
        do {
            try await persistence.removeReaction(
                localId: event.messageId,
                emoji: event.emoji,
                participantId: event.participantId,
                ownerUserId: event.userId,
                aggregateCount: event.aggregation?.count,
                aggregateParticipantIds: event.aggregation?.participantIds
            )
        } catch {
            Logger.messages.warning("[ConversationSocket] removeReaction failed \(event.messageId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Le nom affiché est choisi par le client (`preferredDisplayName`,
    /// displayName d'abord, username en repli), le roster reste keyé par `userId`.
    private func applyTypingStarted(_ event: TypingEvent) {
        guard delegate != nil, event.userId != currentUserId else { return }
        addTypingUser(id: event.userId, name: event.preferredDisplayName)
        resetTypingSafetyTimer(for: event.userId)
    }

    private func applyTypingStopped(_ event: TypingEvent) {
        guard delegate != nil else { return }
        removeTypingUser(id: event.userId)
        clearTypingSafetyTimer(for: event.userId)
    }

    /// #7433 : le résumé décrit UN message (`summary.messageId`, sinon le dernier
    /// du fil) et ne touche que lui, s'il est le mien (`ReadStatusReceipt`).
    private func applyReadStatus(_ event: ReadStatusUpdateEvent) async {
        guard let persistence else { return }
        await persistence.bufferReadStatusSummary(
            conversationId: conversationId, summary: event.summary, currentUserId: currentUserId
        )
    }

    // MARK: - Reconnection Sync

    private var lastSyncTriggerAt: Date = .distantPast
    private static let syncCoalesceWindow: TimeInterval = 2.0

    private func triggerSyncIfNeeded() {
        let now = Date()
        guard now.timeIntervalSince(lastSyncTriggerAt) > Self.syncCoalesceWindow else { return }
        lastSyncTriggerAt = now
        Task { [weak self] in
            await self?.delegate?.syncMissedMessages()
            await PendingStatusQueue.shared.flush()
            // Flush the OfflineQueue on socket reconnect. OutboxRetryScheduler
            // covers the network-reconnect path (NWPathMonitor) but a socket
            // reconnect without a NW path change (e.g. server restart) would
            // leave queued outbox records stranded until the next foreground.
            await OutboxFlushTrigger.flushNow()
        }
    }

    private func subscribeToReconnect() {
        messageSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                // Typing state from before the disconnect is stale — remote peers
                // will re-emit typing:start only if they are still typing.
                self.typingSafetyTimers.values.forEach { $0.invalidate() }
                self.typingSafetyTimers.removeAll()
                self.typingUserOrder.removeAll()
                self.typingUserEntries.removeAll()
                self.delegate?.typingParticipants.removeAll()
                self.triggerSyncIfNeeded()
            }
            .store(in: &cancellables)

        // Foreground backfill: if the socket stayed connected while the app was
        // backgrounded (APNs / NSE delivered messages but the socket never
        // disconnected), `didReconnect` never fires and those messages won't be
        // fetched. Subscribe to willEnterForeground as a second trigger so the
        // watermark sync runs regardless of reconnect state.
        NotificationCenter.default
            .publisher(for: UIApplication.willEnterForegroundNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.triggerSyncIfNeeded()
            }
            .store(in: &cancellables)
    }
}
