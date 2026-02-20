import Foundation
import Combine
import MeeshySDK

@MainActor
class ConversationViewModel: ObservableObject {

    // MARK: - Published State

    @Published var messages: [Message] = []
    @Published var isLoadingInitial = false
    @Published var isLoadingOlder = false
    @Published var hasOlderMessages = true
    @Published var isSending = false
    @Published var error: String?

    /// Set before prepend so the view can restore scroll position
    @Published var scrollAnchorId: String?
    /// Incremented when a new message is appended at the end (not prepended)
    @Published var newMessageAppended: Int = 0

    /// Users currently typing in this conversation
    @Published var typingUsernames: [String] = []

    /// Last unread message from another user (set only via socket, cleared on scroll-to-bottom)
    @Published var lastUnreadMessage: Message?

    /// True during programmatic scrolls (initial load, send, scroll-to-bottom tap)
    /// When true, onAppear prefetch triggers are suppressed.
    @Published var isProgrammaticScroll = false

    // MARK: - Private

    let conversationId: String
    private let limit = 50
    private var cancellables = Set<AnyCancellable>()

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

    // MARK: - Init

    init(conversationId: String) {
        self.conversationId = conversationId
        subscribeToSocket()
    }

    // MARK: - Programmatic Scroll Guard

    /// Call before any programmatic scroll. Resets after a short delay.
    func markProgrammaticScroll() {
        isProgrammaticScroll = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.isProgrammaticScroll = false
        }
    }

    // MARK: - Load Messages (initial)

    func loadMessages() async {
        guard !isLoadingInitial else { return }
        isLoadingInitial = true
        error = nil

        do {
            let response: MessagesAPIResponse = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/messages",
                queryItems: [
                    URLQueryItem(name: "limit", value: "\(limit)"),
                    URLQueryItem(name: "offset", value: "0"),
                    URLQueryItem(name: "include_replies", value: "true"),
                ]
            )

            let userId = currentUserId
            // API returns newest first, reverse to oldest-first for display
            messages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
            hasOlderMessages = response.pagination?.hasMore ?? false

            // Mark conversation as read (fire-and-forget)
            Task {
                let _: APIResponse<[String: Bool]>? = try? await APIClient.shared.request(
                    endpoint: "/conversations/\(conversationId)/mark-read",
                    method: "POST"
                )
            }
        } catch {
            self.error = error.localizedDescription
        }

        isLoadingInitial = false
    }

    // MARK: - Load Older Messages (infinite scroll)

    func loadOlderMessages() async {
        guard hasOlderMessages, !isLoadingOlder else { return }
        guard let oldestId = messages.first?.id else { return }

        isLoadingOlder = true
        // Save anchor BEFORE prepend so the view can restore scroll position
        scrollAnchorId = oldestId

        do {
            let response: MessagesAPIResponse = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/messages",
                queryItems: [
                    URLQueryItem(name: "limit", value: "\(limit)"),
                    URLQueryItem(name: "before", value: oldestId),
                    URLQueryItem(name: "include_replies", value: "true"),
                ]
            )

            let userId = currentUserId
            let olderMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }

            // Dedup and prepend
            let existingIds = Set(messages.map(\.id))
            let newMessages = olderMessages.filter { !existingIds.contains($0.id) }
            messages.insert(contentsOf: newMessages, at: 0)

            hasOlderMessages = response.pagination?.hasMore ?? false
        } catch {
            self.error = error.localizedDescription
        }

        isLoadingOlder = false
    }

    // MARK: - Send Message

    func sendMessage(content: String, replyToId: String? = nil, attachmentIds: [String]? = nil) async {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !(attachmentIds ?? []).isEmpty else { return }

        isSending = true

        // Optimistic insert
        let tempId = "temp_\(UUID().uuidString)"
        let optimisticMessage = Message(
            id: tempId,
            conversationId: conversationId,
            senderId: currentUserId,
            content: text,
            replyToId: replyToId,
            createdAt: Date(),
            updatedAt: Date(),
            isMe: true
        )
        messages.append(optimisticMessage)
        newMessageAppended += 1

        do {
            let body = SendMessageRequest(
                content: text.isEmpty ? nil : text,
                originalLanguage: nil,
                replyToId: replyToId,
                attachmentIds: attachmentIds
            )
            let response: APIResponse<SendMessageResponseData> = try await APIClient.shared.post(
                endpoint: "/conversations/\(conversationId)/messages",
                body: body
            )

            // Replace temp message with server version
            if let idx = messages.firstIndex(where: { $0.id == tempId }) {
                messages[idx] = Message(
                    id: response.data.id,
                    conversationId: conversationId,
                    senderId: currentUserId,
                    content: text,
                    replyToId: replyToId,
                    createdAt: response.data.createdAt,
                    updatedAt: response.data.createdAt,
                    isMe: true
                )
            }
        } catch {
            // Mark optimistic message as failed (keep in list for retry)
            if let idx = messages.firstIndex(where: { $0.id == tempId }) {
                messages[idx].content = "⚠️ " + messages[idx].content
            }
            self.error = error.localizedDescription
        }

        isSending = false
    }

    // MARK: - Toggle Reaction

    func toggleReaction(messageId: String, emoji: String) {
        guard let idx = messages.firstIndex(where: { $0.id == messageId }) else { return }

        let userId = currentUserId
        let alreadyReacted = messages[idx].reactions.contains { $0.emoji == emoji && $0.userId == userId }

        if alreadyReacted {
            // Optimistic remove
            messages[idx].reactions.removeAll { $0.emoji == emoji && $0.userId == userId }
            // API call
            Task {
                let encoded = emoji.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? emoji
                let _: APIResponse<[String: String]>? = try? await APIClient.shared.request(
                    endpoint: "/reactions/\(messageId)/\(encoded)",
                    method: "DELETE"
                )
            }
        } else {
            // Optimistic add
            let reaction = Reaction(messageId: messageId, userId: userId, emoji: emoji)
            messages[idx].reactions.append(reaction)
            // API call
            Task {
                struct AddReactionBody: Encodable {
                    let messageId: String
                    let emoji: String
                }
                let _: APIResponse<[String: String]>? = try? await APIClient.shared.post(
                    endpoint: "/reactions",
                    body: AddReactionBody(messageId: messageId, emoji: emoji)
                )
            }
        }
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
                guard let self else { return }
                // Skip if already in list (e.g. our own optimistic message)
                guard !self.messages.contains(where: { $0.id == apiMsg.id }) else { return }
                // Skip own messages (already added optimistically)
                if apiMsg.senderId == userId { return }
                let msg = apiMsg.toMessage(currentUserId: userId)
                self.messages.append(msg)
                self.lastUnreadMessage = msg
                self.newMessageAppended += 1
            }
            .store(in: &cancellables)

        // Edited messages
        socketManager.messageEdited
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiMsg in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == apiMsg.id }) {
                    self.messages[idx].content = apiMsg.content ?? ""
                    self.messages[idx].isEdited = true
                }
            }
            .store(in: &cancellables)

        // Deleted messages
        socketManager.messageDeleted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == event.messageId }) {
                    self.messages[idx].isDeleted = true
                    self.messages[idx].content = ""
                }
            }
            .store(in: &cancellables)

        // Reactions added
        socketManager.reactionAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == event.messageId }) {
                    let reaction = Reaction(messageId: event.messageId, userId: event.userId, emoji: event.emoji)
                    self.messages[idx].reactions.append(reaction)
                }
            }
            .store(in: &cancellables)

        // Reactions removed
        socketManager.reactionRemoved
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == event.messageId }) {
                    self.messages[idx].reactions.removeAll {
                        $0.emoji == event.emoji && $0.userId == event.userId
                    }
                }
            }
            .store(in: &cancellables)

        // Typing started
        socketManager.typingStarted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if event.userId != userId, !self.typingUsernames.contains(event.username) {
                    self.typingUsernames.append(event.username)
                }
            }
            .store(in: &cancellables)

        // Typing stopped
        socketManager.typingStopped
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.typingUsernames.removeAll { $0 == event.username }
            }
            .store(in: &cancellables)
    }
}
