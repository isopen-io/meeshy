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

    func armSocketSubscriptions() {
        guard cancellables.isEmpty else { return }
        subscribeToSocket()
        subscribeToReconnect()
    }

    deinit {
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

    private func subscribeToSocket() {
        let socketManager = messageSocket
        let convId = conversationId
        let userId = currentUserId

        // New messages
        socketManager.messageReceived
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiMsg in
                Task { [weak self] in
                    guard let self, self.delegate != nil else { return }
                    await self.incomingReconciler.reconcile(apiMsg)
                }
            }
            .store(in: &cancellables)

        // Jonction refusée par le serveur. Le MOTIF décide, et il ne le faisait
        // pas : ce puits appelait `handleSocketAccessRevoked` sur les SEPT
        // motifs qu'émet la passerelle — donc aussi sur `rate_limited`,
        // `server_error`, `not_authenticated` et `invalid_payload`, qui ne
        // disent rien de l'appartenance. Une limite de débit franchie par une
        // tempête de reconnexion (elle rejoint toutes les rooms d'un coup)
        // purgeait le cache du fil et le fermait sous un bandeau « accès
        // révoqué », alors que l'utilisateur était en train de le lire.
        //
        // `isMembershipDenied` est le jumeau Swift de la règle partagée
        // `isMembershipDeniedJoinError()`. Un refus transitoire ne détruit plus
        // rien ; la room sera rejointe par le cycle de reconnexion du socket.
        socketManager.conversationJoinError
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

        // Edited messages
        socketManager.messageEdited
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiMsg in
                guard let self else { return }
                // Une édition de CONTENU périme les traductions du message : le
                // gateway pose `translations: null` dans le même `updateMany`
                // que `content`, le client doit poser le même verdict sinon la
                // bulle (et la copie, et le partage) servent le texte traduit
                // d'AVANT. Hors branche `callSummary` : la transition live →
                // terminal d'un avis d'appel n'est pas une édition de contenu.
                // Posé avant l'écriture persistée et indépendamment d'elle —
                // l'invalidation ne dépend pas de la présence du store.
                if apiMsg.callSummary == nil {
                    self.delegate?.invalidateTranslations(for: apiMsg.id)
                }
                if let persistence = self.persistence {
                    // Write through persistence; store observation surfaces the edit.
                    let msgId = apiMsg.id
                    let content = apiMsg.content ?? ""
                    if let callSummary = apiMsg.callSummary {
                        // Message d'appel : l'édition serveur est la transition
                        // live → terminal (« en cours » → « Appel · 04:32 »).
                        // markEdited ne ré-applique JAMAIS la métadonnée et
                        // poserait isEdited — applyCallNoticeUpdate met à jour
                        // content + callSummaryJson sans flags d'édition.
                        let callSummaryJson = try? JSONEncoder().encode(callSummary)
                        let serverUpdatedAt = apiMsg.updatedAt ?? apiMsg.editedAt ?? Date()
                        Task {
                            do {
                                try await persistence.applyCallNoticeUpdate(
                                    localId: msgId,
                                    content: content,
                                    callSummaryJson: callSummaryJson,
                                    serverUpdatedAt: serverUpdatedAt
                                )
                                try await persistence.applyCallNoticeAttachments(from: apiMsg)
                            } catch {
                                Logger.messages.warning("[ConversationSocket] applyCallNoticeUpdate failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                            }
                        }
                    } else {
                        // Use the server's editedAt, not the device clock: markEdited
                        // compares this against the stored editedAt to reject stale,
                        // out-of-order edit events, which only works if every device
                        // is comparing the same (server) clock.
                        let editedAt = apiMsg.editedAt ?? Date()
                        let marksEdited = apiMsg.isEdited ?? true
                        Task {
                            do {
                                try await persistence.markEdited(
                                    localId: msgId, newContent: content, editedAt: editedAt, marksEdited: marksEdited,
                                    arrivalsNotice: apiMsg.arrivalsNotice)
                            } catch {
                                Logger.messages.warning("[ConversationSocket] markEdited failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                            }
                        }
                    }
                }
                // Keep the (frozen) starred snapshot's preview in sync with the edit.
                StarredMessagesStore.shared.updatePreview(
                    messageId: apiMsg.id, contentPreview: apiMsg.content ?? ""
                )
            }
            .store(in: &cancellables)

        // Deleted messages
        socketManager.messageDeleted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let persistence = self.persistence {
                    // Write through persistence; store observation surfaces the deletion.
                    let now = Date()
                    let msgId = event.messageId
                    Task {
                        do {
                            try await persistence.markDeleted(localId: msgId, deletedAt: now, sparingOpenedViewOnce: true)
                        } catch {
                            Logger.messages.warning("[ConversationSocket] markDeleted failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                        }
                    }
                }
                // A delete-for-everyone broadcast must also evict the starred
                // snapshot so the Starred Messages list stops showing a tombstone.
                StarredMessagesStore.shared.remove(messageId: event.messageId)
            }
            .store(in: &cancellables)

        // Expired messages — server-initiated twin of a deletion (a
        // self-destructing message burned by `ExpiredMessagesCleanupService`
        // rather than a user request). Same local effect, so the same write.
        socketManager.messageExpired
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let persistence = self.persistence {
                    let now = Date()
                    let msgId = event.messageId
                    Task {
                        do {
                            try await persistence.markDeleted(localId: msgId, deletedAt: now, expired: true)
                            // #10433 — ses réponses partent avec lui, et une
                            // réponse dont la citation est déjà morte part au
                            // lieu de rester « Message supprimé ».
                            try await persistence.purgeQuoteCascade(fromDead: [msgId])
                        } catch {
                            Logger.messages.warning("[ConversationSocket] markDeleted (expired) failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                        }
                    }
                }
                StarredMessagesStore.shared.remove(messageId: event.messageId)
                // **La mort se GRAVE, elle ne s'oublie pas** (#7552). Ce site
                // EFFAÇAIT la réception ; mais la ligne ne quitte le fil qu'au
                // tour suivant, et entre les deux la projection retrouvait un
                // registre VIDE et stampait une réception NEUVE — une fenêtre
                // entière repartait. On oubliait avant d'avoir retiré.
                EphemeralReceiptLedger.shared.noteDestruction(of: event.messageId)
                // #7453 — le troisième chemin du balayage. Il est le seul à
                // savoir qu'un message PRÉCIS vient de mourir, y compris
                // pendant que l'application est à l'écran : ni la NSE (qui
                // n'agit qu'à l'arrivée d'un push) ni le retour au premier
                // plan ne couvrent ce cas.
                Task { await NotificationActionHandler.sweepExpiredEphemeralBanners() }
            }
            .store(in: &cancellables)

        // **L'échéance SERVIE d'un éphémère** (`message:countdown-started`,
        // contrat du fil #7451 point 5).
        //
        // Chez un destinataire elle ne REMPLACE pas l'échéance locale : les
        // deux concourent, et `EphemeralDeadline.resolve` retient la plus
        // PROCHE. Chez l'EXPÉDITEUR, dont l'envoi ne compte pas comme une
        // réception, elle est la SEULE horloge (#8905) : `max D(u)`, qui recule
        // à chaque destinataire qui reçoit plus tard — d'où le remplacement.
        //
        // Gravée en base : le fil relit GRDB, et une valeur posée en mémoire
        // seule s'effaçait à la première écriture de la conversation.
        socketManager.messageCountdownStarted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let delegate = self.delegate, let index = delegate.messageIndex(for: event.messageId) {
                    delegate.messages[index].expiresAt = event.expiresAt
                }
                guard let persistence = self.persistence else { return }
                Task {
                    do {
                        try await persistence.applyServedEphemeralDeadline(messageId: event.messageId, expiresAt: event.expiresAt)
                    } catch {
                        Logger.messages.warning("[ConversationSocket] servedEphemeralDeadline failed \(event.messageId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }
            }
            .store(in: &cancellables)

        // Masquage PERSONNEL — CE lecteur a retiré des messages de SA vue depuis
        // un autre de ses appareils.
        //
        // Le canal existe parce qu'un filtre de LECTURE ne rétrécit que ce qu'une
        // NOUVELLE requête renvoie : il n'a aucune prise sur une ligne que le
        // client détient déjà. Sans ce consommateur, la bulle restait affichée
        // pour toute la session — la ligne de liste, elle, était bien corrigée
        // par le `conversation:updated` jumeau, si bien que l'aperçu et le fil
        // se contredisaient.
        //
        // Pas `markDeleted` : le message reste VIVANT pour les autres
        // participants, et une pierre tombale « ce message a été supprimé »
        // resterait affichée à vie puisque le serveur ne renverra plus jamais ce
        // message à ce lecteur. Il doit disparaître sans trace — d'où la purge.
        //
        // Les références qui nomment un AUTRE fil sont laissées à leur propre
        // handler : ce dernier n'existe que si la conversation est ouverte, et
        // sinon le prochain chargement REST (déjà filtré côté serveur) suffit.
        socketManager.messageHiddenForMe
            .map { event in
                event.messages
                    .filter { ref in ref.conversationId == convId }
                    .map(\.messageId)
            }
            .filter { ids in !ids.isEmpty }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] hiddenIds in
                guard let self else { return }
                if let persistence = self.persistence {
                    Task {
                        do {
                            try await persistence.purgeMessages(ids: hiddenIds)
                        } catch {
                            Logger.messages.warning("[ConversationSocket] purgeMessages failed \(hiddenIds.count, privacy: .public) id(s): \(error.localizedDescription, privacy: .public)")
                        }
                    }
                }
                // Même raison que pour la suppression pour tous : un message
                // retiré de la vue ne peut pas rester dans les favoris, où son
                // instantané figé survivrait au retrait.
                for messageId in hiddenIds {
                    StarredMessagesStore.shared.remove(messageId: messageId)
                }
            }
            .store(in: &cancellables)

        // Retour en vue PERSONNEL — l'inverse exact du masquage ci-dessus.
        //
        // Le masquage a PURGÉ la ligne : cet appareil ne détient plus rien à
        // ré-afficher, et l'événement ne porte qu'une ADRESSE (aucun contenu —
        // une apparition ne s'écrit pas comme une tombstone inversée). Le seul
        // geste honnête est donc d'aller rechercher, ce que le délégué fait.
        //
        // Ni `markDeleted` inversé, ni `syncMissedMessages` : ce dernier ne
        // remonte le temps dans AUCUN cas (watermark strictement en avant),
        // alors qu'un message rendu est presque toujours PLUS VIEUX que le
        // dernier message détenu.
        //
        // Même découpage par conversation que le masquage : le lot peut nommer
        // plusieurs fils, ce handler ne parle que du sien.
        socketManager.messageRestoredForMe
            .map { event in
                event.messages
                    .filter { ref in ref.conversationId == convId }
                    .map(\.messageId)
            }
            .filter { ids in !ids.isEmpty }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] restoredIds in
                guard let self else { return }
                Task { [weak self] in
                    await self?.delegate?.restoreMessagesForMe(ids: restoredIds)
                }
            }
            .store(in: &cancellables)

        // Pinned messages — un autre participant (ou un autre device) epingle un
        // message. Write-through persistence; l'observation du store surface le pin.
        socketManager.messagePinned
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let persistence = self.persistence else { return }
                let pinnedBy = event.pinnedBy
                let msgId = event.messageId
                Task {
                    do {
                        try await persistence.updatePinned(localId: msgId, pinnedAt: Date(), pinnedBy: pinnedBy)
                    } catch {
                        Logger.messages.warning("[ConversationSocket] updatePinned failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }
            }
            .store(in: &cancellables)

        // Unpinned messages — meme chemin write-through, pinnedAt remis a nil.
        socketManager.messageUnpinned
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let persistence = self.persistence else { return }
                let msgId = event.messageId
                Task {
                    do {
                        try await persistence.updatePinned(localId: msgId, pinnedAt: nil, pinnedBy: nil)
                    } catch {
                        Logger.messages.warning("[ConversationSocket] updateUnpinned failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }
            }
            .store(in: &cancellables)

        // Reactions added (with deduplication)
        socketManager.reactionAdded
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let persistence = self.persistence else { return }
                // Reaction d'un AUTRE utilisateur arrivant en temps reel : on
                // marque la cle pour que la nouvelle pill joue la comete au
                // prochain rendu. La propre reaction de l'utilisateur a deja ete
                // marquee+animee par le toggle optimiste (`toggleReaction`), donc
                // on ne la re-anime pas ici. La garde compare `userId` (User.id,
                // identité stable) — `participantId` est un Participant.id qui
                // ne vaut JAMAIS `currentUserId`, donc l'écho de sa propre
                // réaction re-déclenchait la comète une seconde fois.
                if (event.userId ?? event.participantId) != self.currentUserId {
                    ReactionAnimationGate.markAdded(messageId: event.messageId, emoji: event.emoji)
                }
                // Write through persistence; store observation surfaces the reaction.
                // Pass the server's authoritative `aggregation.count` as a cap so an
                // echo of the user's OWN reaction (keyed by the resolved
                // Participant.id) can't pile a second row on top of the optimistic
                // row (keyed by the currentUserId sentinel) — which rendered a
                // single tap as "2". Other users' reactions still land because the
                // cap rises with each genuine new reactor.
                let msgId = event.messageId
                let participantId = event.participantId
                let emoji = event.emoji
                let maxCount = event.aggregation?.count
                let ownerUserId = event.userId
                Task {
                    do {
                        try await persistence.appendReaction(
                            localId: msgId,
                            reactionId: UUID().uuidString,
                            messageId: msgId,
                            participantId: participantId,
                            emoji: emoji,
                            maxCount: maxCount,
                            ownerUserId: ownerUserId
                        )
                    } catch {
                        Logger.messages.warning("[ConversationSocket] appendReaction failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }
            }
            .store(in: &cancellables)

        // Reactions removed
        socketManager.reactionRemoved
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let persistence = self.persistence else { return }
                // Write through persistence; store observation surfaces the removal.
                Task {
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
            }
            .store(in: &cancellables)

        // Réactions par-pièce-jointe, statut de consommation, enrichissements
        // (transcription / traduction audio) — extraits par responsabilité
        // dans `ConversationSocketHandler+MediaEvents.swift` (I4, #7360) :
        // ce fichier dépassait le plafond de 1200 lignes du dépôt.
        subscribeToMediaEvents(socketManager: socketManager, convId: convId, userId: userId)

        // Typing started (with safety timeout). The client picks the name to show —
        // `preferredDisplayName` is displayName-first, username-fallback — but the
        // roster is keyed by `userId` (see `addTypingUser`/`removeTypingUser`): two
        // participants can share the same display name, and keying by name would
        // let one user's typing:stop wipe the other's still-active entry.
        socketManager.typingStarted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.delegate != nil else { return }
                guard event.userId != userId else { return }
                self.addTypingUser(id: event.userId, name: event.preferredDisplayName)
                self.resetTypingSafetyTimer(for: event.userId)
            }
            .store(in: &cancellables)

        // Typing stopped
        socketManager.typingStopped
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.delegate != nil else { return }
                self.removeTypingUser(id: event.userId)
                self.clearTypingSafetyTimer(for: event.userId)
            }
            .store(in: &cancellables)

        // Read status updated (delivered / read) — #7433 : le résumé décrit
        // UN message (`summary.messageId`, sinon le dernier du fil) et ne
        // touche que lui, s'il est le mien (`ReadStatusReceipt`). L'appliquer
        // à tout message antérieur à `updatedAt` — l'instant d'ÉMISSION —
        // peignait de faux « Lu » que la fiche « Vu par » démentait.
        socketManager.readStatusUpdated
            .filter { $0.conversationId == convId }
            .filter { ($0.userId ?? $0.participantId) != userId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let persistence = self.persistence else { return }
                Task {
                    await persistence.bufferReadStatusSummary(
                        conversationId: convId, summary: event.summary, currentUserId: userId
                    )
                }
            }
            .store(in: &cancellables)

        // I3 (#7349) — `message:pending-delivered`: this user's offline queue
        // was just replayed by the gateway. iOS had no listener at all before
        // this lot. Mirrors the existing reconnect/foreground resync path
        // (`triggerSyncIfNeeded` → `delegate.syncMissedMessages()`), scoped to
        // the conversation this handler owns — the same signal web-v2 uses to
        // invalidate its own message list cache for the named conversations.
        socketManager.pendingMessagesDelivered
            .filter { $0.conversationIds.contains(convId) }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.triggerSyncIfNeeded()
            }
            .store(in: &cancellables)

        // Participant role updated
        socketManager.participantRoleUpdated
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                // `participant` est optionnel : ce bloc n'est ici qu'informatif
                // (le délégué le journalise, puis invalide le cache). Renoncer à
                // l'invalidation parce qu'il manque coûterait un trombinoscope
                // périmé pour un nom absent.
                delegate.handleParticipantRoleUpdated(
                    participantId: event.participant?.id ?? event.userId,
                    newRole: event.newRole
                )
            }
            .store(in: &cancellables)

        // Live location started
        socketManager.liveLocationStarted
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

        // Live location updated
        socketManager.liveLocationUpdated
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                if let idx = delegate.activeLiveLocations.firstIndex(where: { $0.userId == event.userId }) {
                    delegate.activeLiveLocations[idx].latitude = event.latitude
                    delegate.activeLiveLocations[idx].longitude = event.longitude
                    delegate.activeLiveLocations[idx].speed = event.speed
                    delegate.activeLiveLocations[idx].heading = event.heading
                    delegate.activeLiveLocations[idx].lastUpdated = event.timestamp ?? Date()
                }
            }
            .store(in: &cancellables)

        // Live location stopped
        socketManager.liveLocationStopped
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                delegate.activeLiveLocations.removeAll { $0.userId == event.userId }
            }
            .store(in: &cancellables)

        // Conversation closed
        socketManager.conversationClosed
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let delegate = self?.delegate else { return }
                delegate.isConversationClosed = true
            }
            .store(in: &cancellables)
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
