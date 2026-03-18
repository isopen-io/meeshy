import Foundation
import Combine
import GRDB
import UIKit
import os

public actor CacheCoordinator {
    public static let shared = CacheCoordinator()

    public let conversations: GRDBCacheStore<String, MeeshyConversation>
    public let messages: GRDBCacheStore<String, MeeshyMessage>
    public let participants: GRDBCacheStore<String, PaginatedParticipant>
    public let profiles: GRDBCacheStore<String, MeeshyUser>
    public let feed: GRDBCacheStore<String, FeedPost>

    public let images: DiskCacheStore
    public let audio: DiskCacheStore
    public let video: DiskCacheStore
    public let thumbnails: DiskCacheStore

    // MARK: - In-Memory Translation/Transcription/Audio Caches (keyed by messageId)

    private var translationCache: [String: [TranslationData]] = [:]
    private var transcriptionCache: [String: TranscriptionReadyEvent] = [:]
    private var audioTranslationCache: [String: [AudioTranslationEvent]] = [:]

    public func cachedTranslations(for messageId: String) -> [TranslationData]? {
        translationCache[messageId]
    }

    public func cachedTranscription(for messageId: String) -> TranscriptionReadyEvent? {
        transcriptionCache[messageId]
    }

    public func cachedAudioTranslations(for messageId: String) -> [AudioTranslationEvent]? {
        audioTranslationCache[messageId]
    }

    private let messageSocket: any MessageSocketProviding
    private let socialSocket: any SocialSocketProviding
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "cache-coordinator")
    private var isStarted = false
    private var currentUserId: String = ""

    public init(
        messageSocket: any MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: any SocialSocketProviding = SocialSocketManager.shared,
        db: any DatabaseWriter = AppDatabase.shared.databaseWriter
    ) {
        self.messageSocket = messageSocket
        self.socialSocket = socialSocket

        self.conversations = GRDBCacheStore(policy: .conversations, db: db, namespace: "conv")
        self.messages = GRDBCacheStore(policy: .messages, db: db, namespace: "msg")
        self.participants = GRDBCacheStore(policy: .participants, db: db, namespace: "part")
        self.profiles = GRDBCacheStore(policy: .userProfiles, db: db, namespace: "prof")
        self.feed = GRDBCacheStore(policy: .feedPosts, db: db, namespace: "feed")

        self.images = DiskCacheStore(policy: .mediaImages)
        self.audio = DiskCacheStore(policy: .mediaAudio)
        self.video = DiskCacheStore(policy: .mediaVideo)
        self.thumbnails = DiskCacheStore(policy: .thumbnails)
    }

    public func start() {
        guard !isStarted else { return }
        isStarted = true
        resolveCurrentUserId()
        subscribeToMessageSocket()
        subscribeToLifecycle()
    }

    private func resolveCurrentUserId() {
        Task { @MainActor in
            if let userId = AuthManager.shared.currentUser?.id {
                await self.setCurrentUserId(userId)
            }
        }
    }

    private func setCurrentUserId(_ id: String) {
        currentUserId = id
    }

    // MARK: - Message Socket Subscriptions

    private func subscribeToMessageSocket() {
        let msgSocket = messageSocket

        msgSocket.messageReceived
            .sink { [weak self] apiMessage in
                guard let self else { return }
                Task {
                    let msg = apiMessage.toMessage(currentUserId: await self.currentUserId)
                    await self.handleMessageReceived(msg)
                }
            }
            .store(in: &cancellables)

        msgSocket.messageEdited
            .sink { [weak self] apiMessage in
                guard let self else { return }
                Task {
                    let msg = apiMessage.toMessage(currentUserId: await self.currentUserId)
                    await self.handleMessageEdited(msg)
                }
            }
            .store(in: &cancellables)

        msgSocket.messageDeleted
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleMessageDeleted(event) }
            }
            .store(in: &cancellables)

        msgSocket.reactionAdded
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReactionAdded(event) }
            }
            .store(in: &cancellables)

        msgSocket.reactionRemoved
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReactionRemoved(event) }
            }
            .store(in: &cancellables)

        msgSocket.reactionSynced
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReactionSynced(event) }
            }
            .store(in: &cancellables)

        msgSocket.participantRoleUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleParticipantRoleUpdated(event) }
            }
            .store(in: &cancellables)

        msgSocket.conversationJoined
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.participants.invalidate(for: event.conversationId) }
            }
            .store(in: &cancellables)

        msgSocket.conversationLeft
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.participants.invalidate(for: event.conversationId) }
            }
            .store(in: &cancellables)

        msgSocket.unreadUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleUnreadUpdated(event) }
            }
            .store(in: &cancellables)

        msgSocket.readStatusUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReadStatusUpdated(event) }
            }
            .store(in: &cancellables)

        msgSocket.translationReceived
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleTranslationReceived(event) }
            }
            .store(in: &cancellables)

        msgSocket.transcriptionReady
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleTranscriptionReady(event) }
            }
            .store(in: &cancellables)

        msgSocket.audioTranslationReady
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleAudioTranslation(event) }
            }
            .store(in: &cancellables)

        msgSocket.audioTranslationProgressive
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleAudioTranslation(event) }
            }
            .store(in: &cancellables)

        msgSocket.audioTranslationCompleted
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleAudioTranslation(event) }
            }
            .store(in: &cancellables)

        msgSocket.didReconnect
            .sink { [weak self] in
                guard let self else { return }
                Task { await self.handleReconnect() }
            }
            .store(in: &cancellables)
    }

    // MARK: - Event Handlers

    private func handleMessageReceived(_ msg: MeeshyMessage) async {
        await messages.update(for: msg.conversationId) { existing in
            var updated = existing
            updated.append(msg)
            return updated
        }
    }

    private func handleMessageEdited(_ msg: MeeshyMessage) async {
        await messages.update(for: msg.conversationId) { existing in
            existing.map { $0.id == msg.id ? msg : $0 }
        }
    }

    private func handleMessageDeleted(_ event: MessageDeletedEvent) async {
        await messages.update(for: event.conversationId) { existing in
            existing.map { msg in
                guard msg.id == event.messageId else { return msg }
                var updated = msg
                updated.deletedAt = Date()
                updated.content = ""
                return updated
            }
        }
    }

    private func handleReactionAdded(_ event: ReactionUpdateEvent) async {
        let mutate: @Sendable (MeeshyMessage) -> MeeshyMessage = { msg in
            var updated = msg
            let reaction = MeeshyReaction(
                messageId: event.messageId,
                participantId: event.participantId,
                emoji: event.emoji
            )
            updated.reactions.append(reaction)
            return updated
        }
        if let convId = event.conversationId {
            await updateMessageInKey(conversationId: convId, messageId: event.messageId, mutate: mutate)
        } else {
            await updateMessageInAllKeys(messageId: event.messageId, mutate: mutate)
        }
    }

    private func handleReactionRemoved(_ event: ReactionUpdateEvent) async {
        let mutate: @Sendable (MeeshyMessage) -> MeeshyMessage = { msg in
            var updated = msg
            updated.reactions.removeAll {
                $0.emoji == event.emoji && $0.participantId == event.participantId
            }
            return updated
        }
        if let convId = event.conversationId {
            await updateMessageInKey(conversationId: convId, messageId: event.messageId, mutate: mutate)
        } else {
            await updateMessageInAllKeys(messageId: event.messageId, mutate: mutate)
        }
    }

    private func handleReactionSynced(_ event: ReactionSyncEvent) async {
        await updateMessageInAllKeys(messageId: event.messageId) { msg in
            var updated = msg
            updated.reactions = event.reactions.flatMap { agg in
                (0..<agg.count).map { index in
                    let pid = agg.participantIds.flatMap { $0.count > index ? $0[index] : nil }
                    return MeeshyReaction(
                        messageId: event.messageId,
                        participantId: pid,
                        emoji: agg.emoji
                    )
                }
            }
            return updated
        }
    }

    private func handleParticipantRoleUpdated(_ event: ParticipantRoleUpdatedEvent) async {
        await participants.update(for: event.conversationId) { existing in
            existing.map { participant in
                guard participant.id == event.participant.id else { return participant }
                var updated = participant
                updated.conversationRole = event.newRole
                return updated
            }
        }
    }

    private func handleUnreadUpdated(_ event: UnreadUpdateEvent) async {
        await conversations.update(for: "list") { existing in
            existing.map { conv in
                guard conv.id == event.conversationId else { return conv }
                var updated = conv
                updated.unreadCount = event.unreadCount
                return updated
            }
        }
    }

    private func handleReadStatusUpdated(_ event: ReadStatusUpdateEvent) async {
        await messages.update(for: event.conversationId) { existing in
            existing.map { msg in
                var updated = msg
                updated.deliveredCount = event.summary.deliveredCount
                updated.readCount = event.summary.readCount
                return updated
            }
        }
    }

    private func handleTranslationReceived(_ event: TranslationEvent) async {
        let msgId = event.messageId
        var existing = translationCache[msgId] ?? []
        for translation in event.translations {
            if let idx = existing.firstIndex(where: { $0.targetLanguage == translation.targetLanguage }) {
                existing[idx] = translation
            } else {
                existing.append(translation)
            }
        }
        translationCache[msgId] = existing
    }

    private func handleTranscriptionReady(_ event: TranscriptionReadyEvent) async {
        transcriptionCache[event.messageId] = event
    }

    private func handleAudioTranslation(_ event: AudioTranslationEvent) async {
        let msgId = event.messageId
        var existing = audioTranslationCache[msgId] ?? []
        if let idx = existing.firstIndex(where: { $0.translatedAudio.targetLanguage == event.translatedAudio.targetLanguage }) {
            existing[idx] = event
        } else {
            existing.append(event)
        }
        audioTranslationCache[msgId] = existing
    }

    private func handleReconnect() async {
        await conversations.invalidate(for: "list")
        logger.info("Reconnected — invalidated conversations cache")
    }

    // MARK: - Helpers

    private func updateMessageInKey(
        conversationId: String,
        messageId: String,
        mutate: @Sendable (MeeshyMessage) -> MeeshyMessage
    ) async {
        await messages.update(for: conversationId) { existing in
            guard existing.contains(where: { $0.id == messageId }) else { return existing }
            return existing.map { $0.id == messageId ? mutate($0) : $0 }
        }
    }

    private func updateMessageInAllKeys(
        messageId: String,
        mutate: @Sendable (MeeshyMessage) -> MeeshyMessage
    ) async {
        let keys = await messages.loadedKeys()
        for key in keys {
            await messages.update(for: key) { existing in
                guard existing.contains(where: { $0.id == messageId }) else { return existing }
                return existing.map { $0.id == messageId ? mutate($0) : $0 }
            }
        }
    }

    // MARK: - Lifecycle

    private nonisolated func subscribeToLifecycle() {
        #if canImport(UIKit)
        NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.flushAll() }
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.evictUnderMemoryPressure() }
        }
        #endif
    }

    public func flushAll() async {
        await conversations.flushDirtyKeys()
        await messages.flushDirtyKeys()
        await participants.flushDirtyKeys()
        await profiles.flushDirtyKeys()
        await feed.flushDirtyKeys()
    }

    public func evictUnderMemoryPressure() async {
        await images.evictExpired()
        await audio.evictExpired()
        await video.evictExpired()
        await thumbnails.evictExpired()
        logger.info("Memory pressure — evicted expired media")
    }

    public func invalidateAll() async {
        await conversations.invalidateAll()
        await messages.invalidateAll()
        await participants.invalidateAll()
        await profiles.invalidateAll()
        await feed.invalidateAll()
        await images.invalidateAll()
        await audio.invalidateAll()
        await video.invalidateAll()
        await thumbnails.invalidateAll()
        await UserColorCache.shared.invalidateAll()
        translationCache.removeAll()
        transcriptionCache.removeAll()
        audioTranslationCache.removeAll()
    }
}
