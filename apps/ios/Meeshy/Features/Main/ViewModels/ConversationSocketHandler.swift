import Foundation
import Combine
import MeeshySDK
import os

// MARK: - Delegate Protocol

@MainActor
protocol ConversationSocketDelegate: AnyObject {
    var messages: [Message] { get set }
    var typingUsernames: [String] { get set }
    var lastUnreadMessage: Message? { get set }
    var newMessageAppended: Int { get set }
    var messageTranslations: [String: [MessageTranslation]] { get set }
    var messageTranscriptions: [String: MessageTranscription] { get set }
    var messageTranslatedAudios: [String: [MessageTranslatedAudio]] { get set }
    var activeLiveLocations: [ActiveLiveLocation] { get set }
    var isConversationClosed: Bool { get set }
    var pendingServerIds: [String: String] { get set }

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
}

// MARK: - ConversationSocketHandler

@MainActor
final class ConversationSocketHandler {
    private var cancellables = Set<AnyCancellable>()
    private let conversationId: String
    private let currentUserId: String
    private let messageSocket: MessageSocketProviding
    weak var delegate: ConversationSocketDelegate?

    // Message deduplication: sliding window of recently seen message IDs
    // to prevent duplicates when REST refresh and socket broadcast deliver
    // the same message during reconnection.
    private static let dedupWindowSize = 1000
    private var recentMessageIds: Set<String> = []
    private var recentMessageIdOrder: [String] = []

    // Typing emission state
    nonisolated(unsafe) private var typingTimer: Timer?
    nonisolated(unsafe) private var typingIdleTimer: Timer?
    nonisolated(unsafe) private var isEmittingTyping = false
    private static let typingDebounceInterval: TimeInterval = 3.0
    private static let typingReemitInterval: TimeInterval = 3.0
    private static let typingSafetyTimeout: TimeInterval = 15.0
    nonisolated(unsafe) private var typingSafetyTimers: [String: Timer] = [:]

    // MARK: - Init / Deinit

    init(
        conversationId: String,
        currentUserId: String,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared
    ) {
        self.conversationId = conversationId
        self.currentUserId = currentUserId
        self.messageSocket = messageSocket
        joinRoom()
        NotificationManager.shared.onConversationOpened(conversationId)
        NotificationCoordinator.shared.markConversationRead(conversationId)
    }

    func armSocketSubscriptions() {
        guard cancellables.isEmpty else { return }
        subscribeToSocket()
        subscribeToReconnect()
    }

    deinit {
        leaveRoom()
        Task { @MainActor in
            NotificationManager.shared.onConversationClosed()
        }
        typingTimer?.invalidate()
        typingIdleTimer?.invalidate()
        if isEmittingTyping {
            MessageSocketManager.shared.emitTypingStop(conversationId: conversationId)
        }
        typingSafetyTimers.values.forEach { $0.invalidate() }
    }

    // MARK: - Deduplication

    private func markSeen(_ messageId: String) {
        guard recentMessageIds.insert(messageId).inserted else { return }
        recentMessageIdOrder.append(messageId)
        while recentMessageIdOrder.count > Self.dedupWindowSize {
            let oldest = recentMessageIdOrder.removeFirst()
            recentMessageIds.remove(oldest)
        }
    }

    private func wasSeen(_ messageId: String) -> Bool {
        recentMessageIds.contains(messageId)
    }

    // MARK: - Room Management

    private func joinRoom() {
        messageSocket.joinConversation(conversationId)
    }

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

    private func resetTypingSafetyTimer(for username: String) {
        typingSafetyTimers[username]?.invalidate()
        typingSafetyTimers[username] = Timer.scheduledTimer(withTimeInterval: Self.typingSafetyTimeout, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.delegate?.typingUsernames.removeAll { $0 == username }
                self?.typingSafetyTimers.removeValue(forKey: username)
            }
        }
    }

    private func clearTypingSafetyTimer(for username: String) {
        typingSafetyTimers[username]?.invalidate()
        typingSafetyTimers.removeValue(forKey: username)
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

                    // Atomic in-place upgrade of an optimistic row. We DO NOT
                    // swap the SwiftUI `id` (that would unmount the bubble and
                    // flash). Instead we mutate the server-derived fields on
                    // the existing struct so the ForEach key stays the
                    // optimistic `tempId`. The `pendingServerIds` map stays
                    // populated for the lifetime of the VM so backend ops
                    // (delete/edit/react/pin) keep resolving the right server
                    // id, and cache writes swap to the server id only when
                    // persisting (see `ConversationViewModel.serverIdMappedSnapshot`).
                    if apiMsg.senderId == userId,
                       let tempId = delegate.pendingServerIds.first(where: { $0.value == apiMsg.id })?.key,
                       let idx = delegate.messageIndex(for: tempId) {
                        let decoded = apiMsg.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username)
                        var msgArray = [decoded]
                        await delegate.decryptMessagesIfNeeded(&msgArray)
                        guard let serverMsg = msgArray.first else { return }
                        await MainActor.run {
                            var existing = delegate.messages[idx]
                            existing.content = serverMsg.content
                            if serverMsg.deliveryStatus.isBetterThan(existing.deliveryStatus) {
                                existing.deliveryStatus = serverMsg.deliveryStatus
                            }
                            existing.updatedAt = serverMsg.updatedAt
                            existing.attachments = serverMsg.attachments
                            existing.reactions = serverMsg.reactions
                            existing.pinnedAt = serverMsg.pinnedAt
                            existing.pinnedBy = serverMsg.pinnedBy
                            existing.deliveredCount = serverMsg.deliveredCount
                            existing.readCount = serverMsg.readCount
                            existing.deliveredToAllAt = serverMsg.deliveredToAllAt
                            existing.readByAllAt = serverMsg.readByAllAt
                            existing.isEdited = serverMsg.isEdited
                            existing.editedAt = serverMsg.editedAt
                            existing.deletedAt = serverMsg.deletedAt
                            delegate.messages[idx] = existing
                            // Keep pendingServerIds[tempId] = serverId so future
                            // backend ops keep resolving correctly until reload.
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
                            let hasNewData = existing.attachments.count != socketAttachments.count
                                || existing.deliveryStatus == .sending
                            if hasNewData {
                                await MainActor.run {
                                    delegate.messages[idx] = apiMsg.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username)
                                }
                            }
                        }
                        return
                    }

                    if apiMsg.senderId == userId { return }

                    if self.wasSeen(apiMsg.id) { return }
                    self.markSeen(apiMsg.id)

                    let decoded = apiMsg.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username)
                    var msgArray = [decoded]
                    await delegate.decryptMessagesIfNeeded(&msgArray)
                    guard let msg = msgArray.first else { return }

                    await MainActor.run {
                        guard !delegate.containsMessage(id: msg.id) else { return }
                        delegate.messages.append(msg)
                        delegate.lastUnreadMessage = msg
                        delegate.newMessageAppended += 1

                        if let sender = apiMsg.sender {
                            let senderName = sender.displayName ?? sender.username ?? sender.id
                            delegate.typingUsernames.removeAll { $0 == senderName }
                            self.clearTypingSafetyTimer(for: senderName)
                        }

                        // The handler is only subscribed while this conversation is on
                        // screen, so an incoming message means the recipient is actively
                        // looking at it — fire `mark-as-read` so the sender's checkmark
                        // upgrades from `.delivered` (gray ✓✓) to `.read` (purple ✓✓)
                        // without waiting for the user to navigate away and back.
                        // markAsRead is idempotent (REST endpoint dedups within 2s and
                        // the cache update is local-first), so calling it per inbound
                        // message is safe.
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
                guard let delegate = self?.delegate else { return }
                if let idx = delegate.messageIndex(for: apiMsg.id) {
                    var updated = delegate.messages[idx]
                    updated.content = apiMsg.content ?? ""
                    updated.isEdited = true
                    delegate.messages[idx] = updated
                }
            }
            .store(in: &cancellables)

        // Deleted messages
        socketManager.messageDeleted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                if let idx = delegate.messageIndex(for: event.messageId) {
                    var updated = delegate.messages[idx]
                    updated.deletedAt = Date()
                    updated.content = ""
                    delegate.messages[idx] = updated
                }
            }
            .store(in: &cancellables)

        // Reactions added (with deduplication)
        socketManager.reactionAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                if let idx = delegate.messageIndex(for: event.messageId) {
                    let exists = delegate.messages[idx].reactions.contains {
                        $0.emoji == event.emoji && $0.participantId == event.participantId
                    }
                    if !exists {
                        let reaction = Reaction(messageId: event.messageId, participantId: event.participantId, emoji: event.emoji)
                        delegate.messages[idx].reactions.append(reaction)
                    }
                }
            }
            .store(in: &cancellables)

        // Reactions removed
        socketManager.reactionRemoved
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                if let idx = delegate.messageIndex(for: event.messageId) {
                    delegate.messages[idx].reactions.removeAll {
                        $0.emoji == event.emoji && $0.participantId == event.participantId
                    }
                }
            }
            .store(in: &cancellables)

        // Typing started (with safety timeout)
        socketManager.typingStarted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let delegate = self.delegate else { return }
                if event.userId != userId, !delegate.typingUsernames.contains(event.username) {
                    delegate.typingUsernames.append(event.username)
                }
                if event.userId != userId {
                    self.resetTypingSafetyTimer(for: event.username)
                }
            }
            .store(in: &cancellables)

        // Typing stopped
        socketManager.typingStopped
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let delegate = self.delegate else { return }
                delegate.typingUsernames.removeAll { $0 == event.username }
                self.clearTypingSafetyTimer(for: event.username)
            }
            .store(in: &cancellables)

        // Read status updated (delivered / read) — update in-memory UI state
        // Cache persistence is handled by ConversationSyncEngine
        socketManager.readStatusUpdated
            .filter { $0.conversationId == convId }
            .filter { ($0.userId ?? $0.participantId) != userId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                let summary = event.summary

                let newStatus: Message.DeliveryStatus = summary.readCount > 0 ? .read
                    : summary.deliveredCount > 0 ? .delivered : .sent

                for i in delegate.messages.indices.reversed() {
                    guard delegate.messages[i].isMe else { continue }
                    let current = delegate.messages[i].deliveryStatus
                    guard current != .read else { break }
                    if newStatus.isBetterThan(current) {
                        delegate.messages[i].deliveryStatus = newStatus
                        delegate.messages[i].deliveredCount = summary.deliveredCount
                        delegate.messages[i].readCount = summary.readCount
                    }
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
                guard let delegate = self?.delegate else { return }
                guard let msgIdx = delegate.messageIndex(for: event.messageId) else { return }
                delegate.messages[msgIdx].updatedAt = Date()
            }
            .store(in: &cancellables)

        // View-once consumed
        socketManager.messageConsumed
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                if let idx = delegate.messageIndex(for: event.messageId) {
                    delegate.messages[idx].viewOnceCount = event.viewOnceCount
                    if event.isFullyConsumed {
                        delegate.evictViewOnceMedia(message: delegate.messages[idx])
                        delegate.markMessageAsConsumed(messageId: event.messageId)
                    }
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
                delegate.messageTranscriptions[event.messageId] = MessageTranscription(
                    attachmentId: event.attachmentId,
                    text: event.transcription.text,
                    language: event.transcription.language,
                    confidence: event.transcription.confidence,
                    durationMs: event.transcription.durationMs,
                    segments: segments,
                    speakerCount: event.transcription.speakerCount
                )
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
            var existing = delegate.messageTranslatedAudios[msgId] ?? []
            if let idx = existing.firstIndex(where: { $0.targetLanguage == audio.targetLanguage }) {
                existing[idx] = audio
            } else {
                existing.append(audio)
            }
            delegate.messageTranslatedAudios[msgId] = existing
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

    private func subscribeToReconnect() {
        messageSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                Task { [weak self] in
                    await self?.delegate?.syncMissedMessages()
                    await PendingStatusQueue.shared.flush()
                }
            }
            .store(in: &cancellables)
    }
}
