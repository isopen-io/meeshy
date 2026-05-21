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
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "share")

    init(
        api: APIClientProviding = APIClient.shared,
        currentUserIdProvider: @MainActor @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.api = api
        self.currentUserIdProvider = currentUserIdProvider
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
                conversations = response.data.map { $0.toConversation(currentUserId: userId) }
            }
        } catch {
            Self.logger.error("Failed to load conversations for share: \(error.localizedDescription)")
        }
        isLoading = false
    }

    // MARK: - Send

    /// POSTs the shared content to the target conversation. Returns `true`
    /// on success; the view layer maps that to a haptic + chip update.
    /// Failures are logged but not surfaced via `errorMessage` because the
    /// share sheet is a transient surface — the caller (the view) is
    /// already showing a toast for the failure case.
    func send(
        _ content: String,
        to conversationId: String,
        forwardedMessageId: String?
    ) async -> Bool {
        sendingToId = conversationId
        defer { sendingToId = nil }
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
