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

    /// O(1) index lookup by message ID (backed by dictionary)
    func messageIndex(for id: String) -> Int?
    /// O(1) membership check by message ID
    func containsMessage(id: String) -> Bool

    func evictViewOnceMedia(message: Message)
    func markMessageAsConsumed(messageId: String)
    func syncMissedMessages() async
}

// MARK: - ConversationSocketHandler

@MainActor
final class ConversationSocketHandler {
    private var cancellables = Set<AnyCancellable>()
    private let conversationId: String
    private let currentUserId: String
    weak var delegate: ConversationSocketDelegate?

    // Typing emission state
    private var typingTimer: Timer?
    private var isEmittingTyping = false
    private static let typingDebounceInterval: TimeInterval = 3.0
    private static let typingSafetyTimeout: TimeInterval = 15.0
    private var typingSafetyTimers: [String: Timer] = [:]

    // MARK: - Init / Deinit

    init(conversationId: String, currentUserId: String) {
        self.conversationId = conversationId
        self.currentUserId = currentUserId
        joinRoom()
        subscribeToSocket()
        subscribeToReconnect()
    }

    deinit {
        leaveRoom()
        MessageSocketManager.shared.activeConversationId = nil
        typingTimer?.invalidate()
        if isEmittingTyping {
            MessageSocketManager.shared.emitTypingStop(conversationId: conversationId)
        }
        typingSafetyTimers.values.forEach { $0.invalidate() }
    }

    // MARK: - Room Management

    private func joinRoom() {
        MessageSocketManager.shared.activeConversationId = conversationId
        MessageSocketManager.shared.joinConversation(conversationId)
    }

    private nonisolated func leaveRoom() {
        MessageSocketManager.shared.leaveConversation(conversationId)
    }

    // MARK: - Typing Emission

    func onTextChanged(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            startTypingEmission()
        } else {
            stopTypingEmission()
        }
    }

    private func startTypingEmission() {
        typingTimer?.invalidate()

        if !isEmittingTyping {
            isEmittingTyping = true
            MessageSocketManager.shared.emitTypingStart(conversationId: conversationId)
        }

        typingTimer = Timer.scheduledTimer(withTimeInterval: Self.typingDebounceInterval, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.stopTypingEmission()
            }
        }
    }

    func stopTypingEmission() {
        typingTimer?.invalidate()
        typingTimer = nil

        guard isEmittingTyping else { return }
        isEmittingTyping = false
        MessageSocketManager.shared.emitTypingStop(conversationId: conversationId)
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
        let socketManager = MessageSocketManager.shared
        let convId = conversationId
        let userId = currentUserId

        // New messages
        socketManager.messageReceived
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiMsg in
                guard let self, let delegate = self.delegate else { return }
                guard !delegate.containsMessage(id: apiMsg.id) else { return }
                if apiMsg.senderId == userId { return }
                let msg = apiMsg.toMessage(currentUserId: userId)
                delegate.messages.append(msg)
                delegate.lastUnreadMessage = msg
                delegate.newMessageAppended += 1

                if let sender = apiMsg.sender {
                    let senderName = sender.displayName ?? sender.username
                    delegate.typingUsernames.removeAll { $0 == senderName }
                    self.clearTypingSafetyTimer(for: senderName)
                }
            }
            .store(in: &cancellables)

        // Edited messages
        socketManager.messageEdited
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiMsg in
                guard let delegate = self?.delegate else { return }
                if let idx = delegate.messageIndex(for: apiMsg.id) {
                    delegate.messages[idx].content = apiMsg.content ?? ""
                    delegate.messages[idx].isEdited = true
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
                    delegate.messages[idx].isDeleted = true
                    delegate.messages[idx].content = ""
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
                        $0.emoji == event.emoji && $0.userId == event.userId
                    }
                    if !exists {
                        let reaction = Reaction(messageId: event.messageId, userId: event.userId, emoji: event.emoji)
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
                        $0.emoji == event.emoji && $0.userId == event.userId
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

        // Read status updated (delivered / read)
        socketManager.readStatusUpdated
            .filter { $0.conversationId == convId }
            .filter { $0.userId != userId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                let newStatus: Message.DeliveryStatus = event.type == "read" ? .read : .delivered
                
                for i in delegate.messages.indices.reversed() {
                    guard delegate.messages[i].isMe else { continue }
                    
                    let current = delegate.messages[i].deliveryStatus
                    
                    if delegate.messages[i].createdAt <= event.updatedAt {
                        // Break early: if current message already has target state (or better), older ones do too
                        if newStatus == .read && current == .read { break }
                        if newStatus == .delivered && (current == .delivered || current == .read) { break }
                        
                        if newStatus == .read || (newStatus == .delivered && current != .read) {
                            delegate.messages[i].deliveryStatus = newStatus
                        }
                    } else if current == .read {
                        // Even if this message is newer than updatedAt, if it's already read, we don't need to keep checking older ones
                        // because they will be read too.
                        break
                    }
                }
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

        // Translation received
        socketManager.translationReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let delegate = self?.delegate else { return }
                guard delegate.containsMessage(id: event.messageId) else { return }
                let msgId = event.messageId
                let newTranslations = event.translations.map { t in
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
                var existing = delegate.messageTranslations[msgId] ?? []
                for translation in newTranslations {
                    if let idx = existing.firstIndex(where: { $0.targetLanguage == translation.targetLanguage }) {
                        existing[idx] = translation
                    } else {
                        existing.append(translation)
                    }
                }
                delegate.messageTranslations[msgId] = existing
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
    }

    // MARK: - Reconnection Sync

    private func subscribeToReconnect() {
        MessageSocketManager.shared.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                Task { [weak self] in
                    await self?.delegate?.syncMissedMessages()
                }
            }
            .store(in: &cancellables)
    }
}
