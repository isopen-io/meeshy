import Foundation
import Combine
import MeeshySDK
import os

/// MVVM extraction for ``SharePickerView``. Owns the network calls that
/// the view used to make directly via `APIClient.shared.offsetPaginatedRequest`
/// and `APIClient.shared.post`. Cache-first read on
/// `CacheCoordinator.shared.conversations` is preserved so a cold open of
/// the share sheet still surfaces the list instantly.
///
/// Dependencies via init injection per `apps/ios/CLAUDE.md`. `MockAPIClientForApp`
/// drives the unit tests.
@MainActor
final class SharePickerViewModel: ObservableObject {

    @Published private(set) var conversations: [Conversation] = []
    @Published private(set) var isLoading = true
    @Published private(set) var sentToIds: Set<String> = []
    @Published private(set) var sendingToId: String? = nil

    private let api: APIClientProviding
    private let currentUserIdProvider: @MainActor () -> String?
    /// P8 — `send` used to POST directly with no offline fallback: a share
    /// attempted without connectivity threw straight to the `catch` branch
    /// and the content was gone. Gated on `networkMonitor.isOnline` (mirrors
    /// `ConversationViewModel.sendMessage`) so an offline share durably
    /// enqueues instead of failing.
    private let networkMonitor: any NetworkMonitorProviding
    private let offlineQueue: OfflineMessageQueueing
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "share")

    init(
        api: APIClientProviding = APIClient.shared,
        currentUserIdProvider: @MainActor @escaping () -> String? = { AuthManager.shared.currentUser?.id },
        networkMonitor: any NetworkMonitorProviding = NetworkMonitor.shared,
        offlineQueue: OfflineMessageQueueing = OfflineQueue.shared
    ) {
        self.api = api
        self.currentUserIdProvider = currentUserIdProvider
        self.networkMonitor = networkMonitor
        self.offlineQueue = offlineQueue
    }

    // MARK: - Load

    /// Loads the conversation list to pick from. Caller passes the
    /// already-known list from the surrounding `ConversationListViewModel`
    /// — when non-empty we use it as the seed and skip the network entirely
    /// (the share sheet should never feel slower than the list it opened on
    /// top of). Otherwise we fall through to cache + revalidate.
    func loadConversations(seededFrom seed: [Conversation]) async {
        if !seed.isEmpty {
            conversations = seed
            isLoading = false
            return
        }

        let cacheResult = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cacheResult {
        case .fresh(let cached, _):
            conversations = cached
            isLoading = false
        case .stale(let cached, _):
            conversations = cached
            isLoading = false
            await refreshConversations()
        case .expired, .empty:
            await refreshConversations()
        }
    }

    private func refreshConversations() async {
        do {
            let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await api.offsetPaginatedRequest(
                endpoint: "/conversations",
                offset: 0,
                limit: 50
            )
            if response.success {
                let userId = currentUserIdProvider() ?? ""
                let payload = response.data
                // Decode 50 conversations (nested last message / participants /
                // preferences) off the main actor so opening the share picker
                // doesn't hitch. APIConversation + MeeshyConversation are Sendable.
                conversations = await Task.detached(priority: .userInitiated) {
                    payload.map { $0.toConversation(currentUserId: userId) }
                }.value
            }
        } catch {
            Self.logger.error("Failed to load conversations for share: \(error.localizedDescription)")
        }
        isLoading = false
    }

    // MARK: - Send

    /// Sends the shared content to the target conversation. Returns `true`
    /// on success; the view layer maps that to a haptic + chip update.
    /// Failures are logged but not surfaced via `errorMessage` because the
    /// share sheet is a transient surface — the caller (the view) is
    /// already showing a toast for the failure case.
    ///
    /// Offline: durably enqueues an `OfflineQueueItem` (same outbox row
    /// `OutboxDispatcher.dispatchSendMessage` already replays for
    /// `ConversationViewModel`) instead of attempting — and losing — a
    /// direct REST POST. The chip still flips to "sent" immediately
    /// (optimistic) since the queue guarantees eventual delivery.
    func send(
        _ content: String,
        to conversationId: String,
        forwardedMessageId: String?
    ) async -> Bool {
        sendingToId = conversationId
        defer { sendingToId = nil }

        guard networkMonitor.isOnline else {
            let item = OfflineQueueItem(
                conversationId: conversationId,
                content: content,
                forwardedFromId: forwardedMessageId
            )
            do {
                try await offlineQueue.enqueue(item)
                sentToIds.insert(conversationId)
                Self.logger.info("Queued offline share for conversation \(conversationId, privacy: .public)")
                return true
            } catch {
                Self.logger.error("Failed to queue offline share: \(error.localizedDescription)")
                return false
            }
        }

        do {
            let body = SendMessageRequest(
                content: content,
                originalLanguage: nil,
                replyToId: nil,
                forwardedFromId: forwardedMessageId,
                forwardedFromConversationId: nil,
                attachmentIds: nil
            )
            let _: APIResponse<SendMessageResponseData> = try await api.post(
                endpoint: "/conversations/\(conversationId)/messages",
                body: body
            )
            sentToIds.insert(conversationId)
            Self.logger.info("Shared content to conversation \(conversationId, privacy: .public)")
            return true
        } catch {
            Self.logger.error("Failed to share to conversation: \(error.localizedDescription)")
            return false
        }
    }

    /// Used by the external-handler branch (`onShareToConversation`) so
    /// the chip in the picker can reflect the same sent state without the
    /// view writing to `sentToIds` itself.
    func markSent(_ conversationId: String) {
        sentToIds.insert(conversationId)
    }
}
