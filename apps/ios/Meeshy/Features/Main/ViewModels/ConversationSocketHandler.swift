import Foundation
import Combine
import GRDB
import MeeshySDK
import UIKit
import os

// MARK: - Delegate Protocol

@MainActor
protocol ConversationSocketDelegate: AnyObject {
    var messages: [Message] { get set }
    var typingUsernames: [String] { get set }
    var lastUnreadMessage: Message? { get set }
    var messageTranslations: [String: [MessageTranslation]] { get set }
    var messageTranscriptions: [String: MessageTranscription] { get set }
    /// Per-attachment transcription keyed by `attachmentId`. Mirrors
    /// `ConversationViewModel.messageTranscriptionsByAttachment` so the
    /// socket handler can write both dicts atomically in the
    /// `transcription:ready` handler (multi-audio karaoke realtime fix).
    var messageTranscriptionsByAttachment: [String: MessageTranscription] { get set }
    var messageTranslatedAudios: [String: [MessageTranslatedAudio]] { get set }
    /// Per-attachment translated audios keyed by `attachmentId`. Mirrors
    /// `ConversationViewModel.messageTranslatedAudiosByAttachment` so the
    /// socket handler can write both dicts atomically in the audio
    /// translation handler (multi-audio Prisme realtime fix).
    var messageTranslatedAudiosByAttachment: [String: [MessageTranslatedAudio]] { get set }
    var activeLiveLocations: [ActiveLiveLocation] { get set }
    var isConversationClosed: Bool { get set }
    var pendingServerIds: [String: String] { get set }

    /// `true` when the message list is scrolled to (or near) the bottom, where a
    /// newly arrived message is visible. Read-receipt precision gate: an inbound
    /// message is only auto-marked read when the user could actually see it.
    var isViewportAtBottom: Bool { get }

    /// O(1) index lookup by message ID (backed by dictionary)
    func messageIndex(for id: String) -> Int?
    /// O(1) membership check by message ID
    func containsMessage(id: String) -> Bool

    func evictViewOnceMedia(message: Message)
    func markMessageAsConsumed(messageId: String)
    func handleParticipantRoleUpdated(participantId: String, newRole: String)
    func syncMissedMessages() async
    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async
    func persistMessagesUsingServerIds() async
    /// Server rejected `conversation:join` — purge per-conversation cache,
    /// flip the access-revoked flag so the View dismisses, surface a toast.
    /// Mirrors the REST 403 path so socket and HTTP failures converge on
    /// the same UX.
    func handleSocketAccessRevoked(reason: String?)

    /// Mark the conversation as read. Called from the socket handler when an
    /// inbound message arrives while this conversation is on screen so the
    /// sender's checkmark upgrades from `.delivered` to `.read` without
    /// waiting for a navigation cycle.
    func markAsRead()

    /// Apply a server-pushed attachment delta atomically : injects the
    /// enriched transcription / audio translations into the metadata
    /// dictionaries in a single MainActor slice, then schedules the
    /// GRDB upsert so future opens of this conversation render the
    /// enriched attachment from cache without a refetch.
    func applyAttachmentUpdate(_ event: AttachmentUpdatedEvent)
    func applyAttachmentReactionDelta(attachmentId: String, reactionSummary: [String: Int])
}

// MARK: - ConversationSocketHandler

@MainActor
final class ConversationSocketHandler {
    private var cancellables = Set<AnyCancellable>()
    private let conversationId: String
    private let currentUserId: String
    private let messageSocket: MessageSocketProviding
    weak var delegate: ConversationSocketDelegate?

    /// Foreground/active probe for the read-receipt precision gate. Injected so
    /// the XCTest host — which never reaches `.active` — can force a known value.
    /// Production reads the real application state on the main actor.
    private let isApplicationActive: @MainActor () -> Bool

    /// Optional persistence actor — when set, message-related socket events
    /// write through the actor in addition to updating the delegate/ViewModel.
    var persistence: MessagePersistenceActor?

    // Message deduplication: combined count + time-based eviction.
    // Tracks messageId → timestamp so:
    //   • Entries older than dedupMaxAge are always evictable (prevents stale
    //     entries from blocking legitimate re-delivers after long gaps).
    //   • When the table exceeds dedupMaxSize the oldest half is pruned
    //     to keep memory bounded even during reconnect bursts.
    // TTL matches the server-side delivery queue retention (48h) so messages
    // queued while offline for up to 48h cannot replay after cache eviction.
    private static let dedupMaxSize: Int = 10_000
    private static let dedupMaxAge: TimeInterval = 48 * 60 * 60 // 48 hours — matches DELIVERY_QUEUE_TTL_SECONDS
    private var recentMessageTimestamps: [String: Date] = [:]

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
    nonisolated(unsafe) private var typingUserNames: [String: String] = [:]

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
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        isApplicationActive: @escaping @MainActor () -> Bool = {
            UIApplication.shared.applicationState == .active
        }
    ) {
        self.conversationId = conversationId
        self.currentUserId = currentUserId
        self.messageSocket = messageSocket
        self.isApplicationActive = isApplicationActive
    }

    /// Side-effects d'ouverture : join de la room socket + publication de la
    /// conversation active aux singletons notifications. Mutations `@Published`
    /// sur des singletons partagés → doit être appelé hors évaluation de body
    /// (le `.task` de la vue, via `ConversationViewModel.start()`, satisfait
    /// cette contrainte). Idempotent.
    func activate() {
        guard !didActivate else { return }
        didActivate = true
        messageSocket.joinConversation(conversationId)
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
            leaveRoom()
            Task { @MainActor in
                NotificationToastManager.shared.onConversationClosed()
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
        typingUserNames.removeAll()
        Task { @MainActor [weak self] in
            self?.delegate?.typingUsernames.removeAll()
        }
    }

    // MARK: - Deduplication

    private func markSeen(_ messageId: String) {
        guard recentMessageTimestamps[messageId] == nil else { return }
        recentMessageTimestamps[messageId] = Date()
        if recentMessageTimestamps.count > Self.dedupMaxSize {
            evictDedup()
        }
    }

    private func wasSeen(_ messageId: String) -> Bool {
        recentMessageTimestamps[messageId] != nil
    }

    private func evictDedup() {
        let cutoff = Date().addingTimeInterval(-Self.dedupMaxAge)
        recentMessageTimestamps = recentMessageTimestamps.filter { $0.value > cutoff }
        guard recentMessageTimestamps.count > Self.dedupMaxSize else { return }
        let sorted = recentMessageTimestamps.sorted { $0.value < $1.value }
        let excessCount = recentMessageTimestamps.count - Self.dedupMaxSize / 2
        for (key, _) in sorted.prefix(excessCount) {
            recentMessageTimestamps.removeValue(forKey: key)
        }
    }

    // MARK: - Room Management

    private nonisolated func leaveRoom() {
        MessageSocketManager.shared.leaveConversation(conversationId)
    }

    // MARK: - Typing Emission

    func onTextChanged(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            startTypingEmission()
            resetIdleTimer()
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

        typingTimer?.invalidate()

        if !isEmittingTyping {
            isEmittingTyping = true
            messageSocket.emitTypingStart(conversationId: conversationId)
        }

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
    /// `delegate.typingUsernames` is recomputed from this roster on every
    /// change, preserving first-seen order.
    private func addTypingUser(id: String, name: String) {
        typingUserNames[id] = name
        if !typingUserOrder.contains(id) {
            typingUserOrder.append(id)
        }
        delegate?.typingUsernames = typingUserOrder.compactMap { typingUserNames[$0] }
    }

    private func removeTypingUser(id: String) {
        guard typingUserNames.removeValue(forKey: id) != nil else { return }
        typingUserOrder.removeAll { $0 == id }
        delegate?.typingUsernames = typingUserOrder.compactMap { typingUserNames[$0] }
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
                    guard let self, let delegate = self.delegate else { return }

                    // RC2.3 — reconcile an optimistic echo by `clientMessageId`.
                    // The optimistic row's localId IS the `cid_*` (Phase 4
                    // contract), so `messageIndex(for: cid)` resolves it
                    // directly — independent of `pendingServerIds`, which is
                    // only populated AFTER the REST POST returns. A broadcast
                    // that raced ahead of the ACK used to miss the map, fall
                    // into the `senderId == userId` branch and get dropped
                    // (Sprint 2 RC2.3b). The serverId scan stays as a
                    // retro-compat fallback for payloads without a cid.
                    let reconcileTempId: String? = {
                        if let cid = apiMsg.clientMessageId, !cid.isEmpty,
                           delegate.messageIndex(for: cid) != nil {
                            return cid
                        }
                        return delegate.pendingServerIds.first(where: { $0.value == apiMsg.id })?.key
                    }()

                    // Atomic in-place upgrade of an optimistic row. We DO NOT
                    // swap the SwiftUI `id` (that would unmount the bubble and
                    // flash). Instead we mutate the server-derived fields on
                    // the existing struct so the ForEach key stays the
                    // optimistic `tempId`.
                    if apiMsg.senderId == userId, let tempId = reconcileTempId,
                       let optimisticIdx = delegate.messageIndex(for: tempId) {
                        // Capture the optimistic plaintext BEFORE the await
                        // below — `delegate.messages` (and therefore this
                        // index) can change across the suspension point.
                        let optimisticContent = delegate.messages[optimisticIdx].content
                        let decoded = apiMsg.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username)
                        var msgArray = [decoded]
                        await delegate.decryptMessagesIfNeeded(&msgArray)
                        guard let serverMsg = msgArray.first else { return }
                        // For an own E2EE message we keep the OPTIMISTIC
                        // plaintext: the server echo only carries ciphertext,
                        // and there is no E2EE session to decrypt our OWN
                        // message with (sessions are keyed by the peer, never
                        // self) — so `serverMsg.content` is still ciphertext.
                        // An own message's content never legitimately changes
                        // on server-ACK, so the optimistic row is the
                        // authoritative readable copy. Without this the bubble
                        // would flip plaintext → base64 ciphertext on echo.
                        let reconciledContent: String? = (apiMsg.isEncrypted == true)
                            ? optimisticContent
                            : serverMsg.content
                        // Persist server ACK (state machine) via actor — store
                        // observation will surface the delivery-status change.
                        if let persistence = self.persistence {
                            do {
                                _ = try await persistence.applyEvent(
                                    localId: tempId,
                                    event: .serverAck(serverId: apiMsg.id, at: serverMsg.updatedAt)
                                )
                                Logger.messages.info("SendFlow PENDING->SENT (socket broadcast) tempId=\(tempId, privacy: .public) serverId=\(apiMsg.id, privacy: .public) transport=broadcast")
                            } catch {
                                Logger.messages.error("Persistence serverAck failed: \(error, privacy: .public) tempId=\(tempId, privacy: .public)")
                            }
                            // Persist server-confirmed content/attachments/reactions
                            // so the store snapshot reflects ground-truth values.
                            // `nil` attachments/reactions are preserved by
                            // `updateServerAckedFields` (COALESCE) so a media
                            // echo that races server-side processing never
                            // blanks the optimistic preview.
                            let attachmentsJson = serverMsg.attachments.isEmpty ? nil
                                : try? JSONEncoder().encode(serverMsg.attachments)
                            let reactionsJson = serverMsg.reactions.isEmpty ? nil
                                : try? JSONEncoder().encode(serverMsg.reactions)
                            do {
                                try await persistence.updateServerAckedFields(
                                    localId: tempId,
                                    content: reconciledContent,
                                    attachmentsJson: attachmentsJson,
                                    reactionsJson: reactionsJson,
                                    pinnedAt: serverMsg.pinnedAt,
                                    pinnedBy: serverMsg.pinnedBy,
                                    isEdited: serverMsg.isEdited,
                                    editedAt: serverMsg.editedAt,
                                    deletedAt: serverMsg.deletedAt,
                                    deliveredCount: serverMsg.deliveredCount,
                                    readCount: serverMsg.readCount,
                                    deliveredToAllAt: serverMsg.deliveredToAllAt,
                                    readByAllAt: serverMsg.readByAllAt,
                                    updatedAt: serverMsg.updatedAt
                                )
                            } catch {
                                Logger.messages.error("Persistence updateServerAckedFields failed: \(error, privacy: .public) tempId=\(tempId, privacy: .public)")
                            }
                        }
                        // Persist using server id so a future cold-start REST
                        // fetch reconciles cleanly without duplicates.
                        await delegate.persistMessagesUsingServerIds()
                        return
                    }

                    if delegate.containsMessage(id: apiMsg.id) {
                        if apiMsg.senderId == userId,
                           let socketAttachments = apiMsg.attachments, !socketAttachments.isEmpty,
                           let idx = delegate.messageIndex(for: apiMsg.id) {
                            let existing = delegate.messages[idx]
                            // `.slow` is a still-pending optimistic row (failed
                            // once, retrying via the outbox) — like `.sending`,
                            // its attachment data is local and must be refreshed
                            // from the authoritative socket echo.
                            let hasNewData = existing.attachments.count != socketAttachments.count
                                || existing.deliveryStatus == .sending
                                || existing.deliveryStatus == .slow
                            if hasNewData, let persistence = self.persistence {
                                // Write refreshed attachment data through persistence;
                                // store observation surfaces the update to the view.
                                let refreshed = apiMsg.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username)
                                let attachmentsJson = try? JSONEncoder().encode(refreshed.attachments)
                                do {
                                    try await persistence.updateAttachmentsJson(
                                        localId: existing.id,
                                        attachmentsJson: attachmentsJson
                                    )
                                } catch {
                                    Logger.messages.error("Persistence updateAttachmentsJson failed: \(error, privacy: .public) messageId=\(existing.id, privacy: .public)")
                                }
                            }
                        }
                        return
                    }

                    if self.wasSeen(apiMsg.id) { return }
                    self.markSeen(apiMsg.id)

                    // An own echo reaching this point means no in-memory
                    // optimistic row matched (branch A missed it).
                    //  - WITH clientMessageId: safe to persist —
                    //    `upsertFromAPIMessages` reconciles the GRDB optimistic
                    //    row by cid (PK lookup), or inserts cleanly when it is a
                    //    genuine send from another of this user's devices.
                    //  - WITHOUT clientMessageId: an echo from the REST
                    //    broadcast path (`MeeshySocketIOManager._broadcastNewMessage`
                    //    omits the cid). Our optimistic row will be reconciled
                    //    by the REST ACK; persisting here cannot match it and
                    //    would insert a DUPLICATE row. Drop it — the legacy
                    //    behaviour was correct for this specific case.
                    let isOwnEcho = apiMsg.senderId == userId
                    // System messages (e.g. call summaries) are server-generated.
                    // The `message:new` socket BROADCAST omits `clientMessageId`
                    // (MeeshySocketIOManager._broadcastNewMessage), yet the
                    // initiator IS the attributed sender — so they'd be dropped
                    // here as a cid-less own echo, leaving the caller without a
                    // realtime call bubble until the next REST sync. They dedup by
                    // serverId in upsertFromAPIMessages, so letting them through is
                    // safe.
                    let isSystemMessage = apiMsg.messageSource == "system"
                    if isOwnEcho, !isSystemMessage, (apiMsg.clientMessageId ?? "").isEmpty {
                        return
                    }

                    // RC2.2 — persist the FULL APIMessage through the same path
                    // REST uses. `bufferIncomingAPIMessages` →
                    // `upsertFromAPIMessages` writes attachments, reactions,
                    // reply/forward refs, encryption flags and mentions. The
                    // legacy 6-field `IncomingMessageData` dropped every one of
                    // them — a media-only or encrypted message received via
                    // socket rendered as an empty bubble.
                    if let persistence = self.persistence {
                        await persistence.bufferIncomingAPIMessages([apiMsg])
                    }

                    // Own message from another device — persisted above;
                    // nothing is "unread" for us, so skip the badge / read.
                    if isOwnEcho { return }

                    // Inbound message from someone else. Decode + decrypt only
                    // for the transient UI signals (scroll-to-bottom preview) —
                    // the persisted row stays ciphertext on disk and the
                    // display pipeline decrypts it.
                    let decoded = apiMsg.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username)
                    var msgArray = [decoded]
                    await delegate.decryptMessagesIfNeeded(&msgArray)
                    guard let msg = msgArray.first else { return }

                    // UI signals: unread badge anchor + auto mark-as-read.
                    delegate.lastUnreadMessage = msg

                    if let sender = apiMsg.sender {
                        self.removeTypingUser(id: sender.id)
                        self.clearTypingSafetyTimer(for: sender.id)
                    }

                    // Read PRECISION gate. Being subscribed to the socket is NOT
                    // proof the user is reading: the handler stays wired while the
                    // app is backgrounded (phone in a pocket) and while the user is
                    // scrolled up reading history. Emitting `mark-as-read` in those
                    // cases produces a FALSE read receipt — the sender's check turns
                    // indigo "read" although nobody read anything. Only fire when the
                    // app is foregrounded AND the viewport is at the bottom (the new
                    // message is, or auto-scrolls into, view). A deferred read is
                    // re-emitted when the user foregrounds or scrolls back to the
                    // bottom (`onNearBottomChanged`), so receipts stay truthful and
                    // eventually complete. markAsRead is idempotent (REST dedups
                    // within 2s, cache update is local-first).
                    if ReadReceiptGate.shouldEmitAutoRead(
                        isApplicationActive: self.isApplicationActive(),
                        isViewportAtBottom: delegate.isViewportAtBottom
                    ) {
                        delegate.markAsRead()
                    }

                    // mark-as-received is handled globally by ConversationListViewModel
                }
            }
            .store(in: &cancellables)

        // Conversation join refused by the server (banned, no longer member,
        // never a member, conversation deleted, etc.). The ViewModel reuses
        // the REST 403 path: purge per-conversation cache + flip the
        // accessRevoked flag so the View dismisses with a toast.
        socketManager.conversationJoinError
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.delegate?.handleSocketAccessRevoked(reason: event.message)
            }
            .store(in: &cancellables)

        // Edited messages
        socketManager.messageEdited
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiMsg in
                guard let self else { return }
                if let persistence = self.persistence {
                    // Write through persistence; store observation surfaces the edit.
                    let msgId = apiMsg.id
                    let content = apiMsg.content ?? ""
                    // Use the server's editedAt, not the device clock: markEdited
                    // compares this against the stored editedAt to reject stale,
                    // out-of-order edit events, which only works if every device
                    // is comparing the same (server) clock.
                    let editedAt = apiMsg.editedAt ?? Date()
                    Task {
                        do {
                            try await persistence.markEdited(localId: msgId, newContent: content, editedAt: editedAt)
                        } catch {
                            Logger.messages.warning("[ConversationSocket] markEdited failed \(msgId, privacy: .public): \(error.localizedDescription, privacy: .public)")
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
                            try await persistence.markDeleted(localId: msgId, deletedAt: now)
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
                // on ne la re-anime pas ici.
                if event.participantId != self.currentUserId {
                    let animMessageId = event.messageId
                    let animEmoji = event.emoji
                    Task { @MainActor in
                        ReactionAnimationGate.markAdded(messageId: animMessageId, emoji: animEmoji)
                    }
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
                Task {
                    do {
                        try await persistence.appendReaction(
                            localId: msgId,
                            reactionId: UUID().uuidString,
                            messageId: msgId,
                            participantId: participantId,
                            emoji: emoji,
                            maxCount: maxCount
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
                            participantId: event.participantId
                        )
                    } catch {
                        Logger.messages.warning("[ConversationSocket] removeReaction failed \(event.messageId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }
            }
            .store(in: &cancellables)

        // BUG2 A' — réactions par-image : le delta porte le reactionSummary
        // autoritaire ; on remplace les comptes in-memory (currentUserReactions
        // reste géré optimiste côté VM, comme message-level).
        socketManager.attachmentReactionAdded
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let delegate = self.delegate, let summary = event.reactionSummary else { return }
                delegate.applyAttachmentReactionDelta(attachmentId: event.attachmentId, reactionSummary: summary)
            }
            .store(in: &cancellables)

        socketManager.attachmentReactionRemoved
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let delegate = self.delegate, let summary = event.reactionSummary else { return }
                delegate.applyAttachmentReactionDelta(attachmentId: event.attachmentId, reactionSummary: summary)
            }
            .store(in: &cancellables)

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

        // Read status updated (delivered / read) — persist delivery state;
        // store observation surfaces the updated checkmarks in the view.
        socketManager.readStatusUpdated
            .filter { $0.conversationId == convId }
            .filter { ($0.userId ?? $0.participantId) != userId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let persistence = self.persistence else { return }
                let summary = event.summary
                // WhatsApp-style all-or-nothing: the sender's ✓✓ / read indicator
                // must reflect EVERY recipient, never a single member of a group.
                // `totalMembers` is the active recipient count (sender excluded);
                // a partial summary advances NOTHING — the bubbles stay at their
                // current (lower) state until the whole group catches up. The
                // threshold is owned by DeliveryStatusResolver (single source of
                // truth; a 0 denominator falls back to legacy "any > 0" for 1:1).
                let deliveryEvent: MessageEvent?
                switch DeliveryStatusResolver.fromCounts(
                    deliveredCount: summary.deliveredCount,
                    readCount: summary.readCount,
                    recipientCount: summary.totalMembers
                ) {
                case .read:
                    deliveryEvent = .readBy(userId: userId, at: event.updatedAt)
                case .delivered:
                    deliveryEvent = .delivered(count: summary.deliveredCount, at: event.updatedAt)
                default:
                    deliveryEvent = nil
                }
                // Batch-update delivery state; store observation will rebuild
                // the message list with updated deliveryStatus for all rows.
                if let deliveryEvent {
                    Task { await persistence.bufferBatchDelivery(conversationId: convId, event: deliveryEvent) }
                }
            }
            .store(in: &cancellables)

        // Participant role updated
        socketManager.participantRoleUpdated
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                delegate.handleParticipantRoleUpdated(
                    participantId: event.participant.id,
                    newRole: event.newRole
                )
            }
            .store(in: &cancellables)

        // Attachment status updated (listened, watched, viewed, downloaded)
        socketManager.attachmentStatusUpdated
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let persistence = self.persistence else { return }
                // Touch the record so the store observation fires and
                // bubbles re-render with the updated attachment status.
                Task {
                    do {
                        try await persistence.touchUpdatedAt(localId: event.messageId)
                    } catch {
                        Logger.messages.error("Persistence touchUpdatedAt failed: \(error, privacy: .public) messageId=\(event.messageId, privacy: .public)")
                    }
                }
            }
            .store(in: &cancellables)

        // Attachment payload enriched server-side (transcription finalized,
        // audio translation finalized for one language). Delegate handles
        // the metadata dictionaries injection atomically + GRDB upsert ;
        // the same atomic rule as `loadInitialSnapshot` ensures no
        // intermediate frame ever renders the message without its enriched
        // transcription / translated audios.
        socketManager.attachmentUpdated
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.delegate?.applyAttachmentUpdate(event)
            }
            .store(in: &cancellables)

        // View-once consumed
        socketManager.messageConsumed
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let delegate = self.delegate else { return }
                // Capture the current message snapshot for eviction BEFORE
                // the persistence write updates the record and the store
                // observation refreshes delegate.messages.
                let messageForEviction: Message? = event.isFullyConsumed
                    ? delegate.messages.first(where: { $0.id == event.messageId })
                    : nil
                if let persistence = self.persistence {
                    // Write through persistence; store observation surfaces the count update.
                    Task {
                        do {
                            try await persistence.updateViewOnceCount(
                                localId: event.messageId,
                                count: event.viewOnceCount
                            )
                        } catch {
                            Logger.messages.error("Persistence updateViewOnceCount failed: \(error, privacy: .public) messageId=\(event.messageId, privacy: .public)")
                        }
                    }
                }
                // Eviction is media-cache housekeeping; not a messages array mutation.
                if event.isFullyConsumed {
                    if let msg = messageForEviction {
                        delegate.evictViewOnceMedia(message: msg)
                    }
                    delegate.markMessageAsConsumed(messageId: event.messageId)
                }
            }
            .store(in: &cancellables)

        // Translation received — coalesce bursts (the server can fire 5+
        // language translations for the same message within ~50ms when the
        // recipient ring is fanned out). Collecting via `.collect(.byTime)`
        // means a single `@Published` write fires instead of N, cutting
        // ConversationView body re-evals by ~80% on multilingual groups.
        socketManager.translationReceived
            .collect(.byTime(DispatchQueue.main, .milliseconds(80)))
            .filter { !$0.isEmpty }
            .sink { [weak self] events in
                guard let delegate = self?.delegate else { return }
                var buckets: [String: [MessageTranslation]] = [:]
                for event in events {
                    guard delegate.containsMessage(id: event.messageId) else { continue }
                    let mapped = event.translations.map { t in
                        MessageTranslation(
                            id: t.id,
                            messageId: t.messageId,
                            sourceLanguage: t.sourceLanguage,
                            targetLanguage: t.targetLanguage,
                            translatedContent: t.translatedContent,
                            translationModel: t.translationModel,
                            confidenceScore: t.confidenceScore
                        )
                    }
                    var merged = buckets[event.messageId] ?? delegate.messageTranslations[event.messageId] ?? []
                    for translation in mapped {
                        if let idx = merged.firstIndex(where: { $0.targetLanguage == translation.targetLanguage }) {
                            merged[idx] = translation
                        } else {
                            merged.append(translation)
                        }
                    }
                    buckets[event.messageId] = merged
                }
                // Single assignment so SwiftUI publishes once per burst
                // regardless of how many messages/languages came in.
                for (msgId, merged) in buckets {
                    delegate.messageTranslations[msgId] = merged
                }

                // Persist translations via actor
                if let persistence = self?.persistence {
                    let capturedEvents = events
                    Task {
                        for event in capturedEvents {
                            for t in event.translations {
                                let record = TranslationRecord(
                                    id: t.id,
                                    messageLocalId: t.messageId,
                                    messageServerId: t.messageId,
                                    targetLanguage: t.targetLanguage,
                                    translatedContent: t.translatedContent,
                                    translationModel: t.translationModel,
                                    confidenceScore: t.confidenceScore,
                                    sourceLanguage: t.sourceLanguage,
                                    receivedAt: Date()
                                )
                                do {
                                    try await persistence.saveTranslation(record)
                                } catch {
                                    Logger.messages.error("Persistence saveTranslation failed: \(error, privacy: .public) messageId=\(t.messageId, privacy: .public) lang=\(t.targetLanguage, privacy: .public)")
                                }
                            }
                        }
                    }
                }
            }
            .store(in: &cancellables)

        // Transcription ready
        socketManager.transcriptionReady
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                let segments = (event.transcription.segments ?? []).map { s in
                    MessageTranscriptionSegment(
                        text: s.text,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        speakerId: s.speakerId
                    )
                }
                let transcription = MessageTranscription(
                    attachmentId: event.attachmentId,
                    text: event.transcription.text,
                    language: event.transcription.language,
                    confidence: event.transcription.confidence,
                    durationMs: event.transcription.durationMs,
                    segments: segments,
                    speakerCount: event.transcription.speakerCount
                )
                // Per-message dict (single-audio backward compat)
                delegate.messageTranscriptions[event.messageId] = transcription
                // Per-attachment dict (multi-audio karaoke realtime fix):
                // mirrors how all 3 VM hydration sites populate both dicts.
                delegate.messageTranscriptionsByAttachment[event.attachmentId] = transcription
            }
            .store(in: &cancellables)

        // Audio translation (all 3 events use same handler)
        let audioHandler: (AudioTranslationEvent) -> Void = { [weak self] event in
            guard let delegate = self?.delegate else { return }
            guard event.conversationId == convId else { return }
            let msgId = event.messageId
            let segments = (event.translatedAudio.segments ?? []).map { s in
                MessageTranscriptionSegment(
                    text: s.text,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    speakerId: s.speakerId
                )
            }
            let audio = MessageTranslatedAudio(
                id: event.translatedAudio.id,
                attachmentId: event.attachmentId,
                targetLanguage: event.translatedAudio.targetLanguage,
                url: event.translatedAudio.url,
                transcription: event.translatedAudio.transcription,
                durationMs: event.translatedAudio.durationMs,
                format: event.translatedAudio.format,
                cloned: event.translatedAudio.cloned,
                quality: event.translatedAudio.quality,
                voiceModelId: event.translatedAudio.voiceModelId,
                ttsModel: event.translatedAudio.ttsModel,
                segments: segments
            )
            // Per-message dict (single-audio backward compat): dedup by
            // targetLanguage only.
            var existing = delegate.messageTranslatedAudios[msgId] ?? []
            if let idx = existing.firstIndex(where: { $0.targetLanguage == audio.targetLanguage }) {
                existing[idx] = audio
            } else {
                existing.append(audio)
            }
            delegate.messageTranslatedAudios[msgId] = existing
            // Per-attachment dict (multi-audio Prisme realtime fix): dedup
            // scoped to (attachmentId, targetLanguage) so each track keeps its
            // own language buttons. Mirrors how the transcription handler
            // populates `messageTranscriptionsByAttachment`.
            var existingForAttachment = delegate.messageTranslatedAudiosByAttachment[event.attachmentId] ?? []
            if let idx = existingForAttachment.firstIndex(where: { $0.targetLanguage == audio.targetLanguage }) {
                existingForAttachment[idx] = audio
            } else {
                existingForAttachment.append(audio)
            }
            delegate.messageTranslatedAudiosByAttachment[event.attachmentId] = existingForAttachment
        }

        socketManager.audioTranslationReady
            .receive(on: DispatchQueue.main)
            .sink(receiveValue: audioHandler)
            .store(in: &cancellables)

        socketManager.audioTranslationProgressive
            .receive(on: DispatchQueue.main)
            .sink(receiveValue: audioHandler)
            .store(in: &cancellables)

        socketManager.audioTranslationCompleted
            .receive(on: DispatchQueue.main)
            .sink(receiveValue: audioHandler)
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
                self.typingUserNames.removeAll()
                self.delegate?.typingUsernames.removeAll()
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
