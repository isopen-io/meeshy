//
//  ChatView.swift
//  Meeshy
//
//  Main conversation screen with real-time messaging
//  iOS 16+
//

import SwiftUI

struct ChatView: View {
    // MARK: - Properties

    @StateObject private var viewModel: ChatViewModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isInputFocused: Bool
    @State private var scrollProxy: ScrollViewProxy?
    @State private var showAttachmentPicker = false
    @State private var showConversationInfo = false
    @State private var selectedMessage: Message?
    @State private var messageToEdit: Message?
    @State private var replyToMessage: Message?
    @State private var inputText: String = ""

    let conversation: Conversation

    // Get current user ID for display name resolution
    private var currentUserId: String {
        AuthenticationManager.shared.currentUser?.id ?? ""
    }

    // Display name for the conversation header (uses other participant's name for direct chats)
    private var headerDisplayName: String {
        conversation.displayNameForUser(currentUserId)
    }

    // Avatar URL for direct conversations (other participant's avatar)
    private var headerAvatarURL: String? {
        conversation.displayAvatarForUser(currentUserId)
    }

    // MARK: - Initialization

    init(conversation: Conversation) {
        self.conversation = conversation
        _viewModel = StateObject(wrappedValue: ChatViewModel(conversationId: conversation.id))
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // Top Navigation Bar
            navigationBar

            // Messages List
            messagesList

            // Reply Preview
            if let replyTo = replyToMessage {
                replyPreview(message: replyTo)
            }

            // Input Bar
            MessageInputBar(
                text: $inputText,
                isSending: viewModel.isSending,
                onSend: { attachments, detectedLanguageCode, sentiment in
                    Task {
                        var finalAttachments = attachments
                        var messageContent = inputText

                        // Check if text exceeds 3000 characters - convert to file attachment
                        if LongTextToFileHelper.shouldConvertToFile(inputText) {
                            do {
                                let result = try LongTextToFileHelper.convertToFileAttachment(text: inputText)
                                // Add the text file as an attachment
                                finalAttachments.append(result.attachment)
                                // Use a short summary message instead of the full text
                                messageContent = result.summaryMessage
                            } catch {
                                // If conversion fails, log error and send original text
                                // (server will handle truncation if needed)
                                print("Failed to convert long text to file: \(error.localizedDescription)")
                            }
                        }

                        // TODO: Handle attachments upload in ChatView
                        if let reply = replyToMessage {
                            try? await viewModel.sendMessage(
                                content: messageContent,
                                replyToId: reply.id,
                                detectedLanguage: detectedLanguageCode,
                                sentiment: sentiment
                            )
                            replyToMessage = nil
                        } else {
                            try? await viewModel.sendMessage(
                                content: messageContent,
                                detectedLanguage: detectedLanguageCode,
                                sentiment: sentiment
                            )
                        }
                        inputText = ""
                    }
                },
                onAttachmentTap: {
                    showAttachmentPicker = true
                },
                onTyping: {
                    viewModel.startTyping()
                }
            )
            .focused($isInputFocused)
        }
        .navigationBarHidden(true)
        .background(Color(.systemGroupedBackground))
        .onAppear {
            Task {
                await viewModel.loadMessages()
            }
        }
        .onDisappear {
            viewModel.stopTyping()
        }
        .sheet(isPresented: $showAttachmentPicker) {
            AttachmentPickerView { attachment in
                // Handle attachment selection
            }
        }
        .sheet(isPresented: $showConversationInfo) {
            ConversationInfoView(conversation: conversation)
        }
        .onChange(of: selectedMessage) { newValue in
            if let message = newValue {
                showMessageContextMenu(for: message)
            }
        }
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack(spacing: 12) {
            // Back Button
            Button(action: {
                dismiss()
            }) {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                    Text("Conversations")
                        .font(.system(size: 17))
                }
                .foregroundColor(.blue)
            }

            Spacer()

            // Conversation Info
            Button(action: {
                showConversationInfo = true
            }) {
                HStack(spacing: 12) {
                    // Participant Avatar (other user for direct chats)
                    headerAvatar

                    // Conversation Name (other user's name for direct chats)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(headerDisplayName)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(.primary)

                        if !viewModel.typingUsers.isEmpty {
                            typingIndicatorText
                        } else {
                            Text(conversation.lastMessageAt.relativeTimeString)
                                .font(.system(size: 13))
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }

            Spacer()

            // Info Button
            Button(action: {
                showConversationInfo = true
            }) {
                Image(systemName: "info.circle")
                    .font(.system(size: 22))
                    .foregroundColor(.blue)
                    .frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            Color(.systemBackground)
                .shadow(color: Color.black.opacity(0.05), radius: 2, y: 2)
        )
    }

    // MARK: - Header Avatar

    private var headerAvatar: some View {
        ZStack {
            if conversation.isDirect {
                // Direct conversation - show the other participant's avatar
                let initials = String(headerDisplayName.prefix(1)).uppercased()
                CachedAsyncImage(urlString: headerAvatarURL, cacheType: .avatar) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Circle()
                        .fill(Color.blue.gradient)
                        .overlay(
                            Text(initials)
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(.white)
                        )
                }
                .frame(width: 40, height: 40)
                .clipShape(Circle())
                .overlay(
                    Circle()
                        .stroke(Color.white, lineWidth: 2)
                )
            } else {
                // Group chat - overlapping avatars
                HStack(spacing: -8) {
                    ForEach(Array(conversation.activeMembers.prefix(3).enumerated()), id: \.element.id) { index, participant in
                        CachedAsyncImage(urlString: participant.avatar, cacheType: .avatar) { image in
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Circle()
                                .fill(Color.blue.gradient)
                                .overlay(
                                    Text(participant.name.prefix(1).uppercased())
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(.white)
                                )
                        }
                        .frame(width: 32, height: 32)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(Color.white, lineWidth: 2)
                        )
                        .zIndex(Double(3 - index))
                    }
                }
            }
        }
    }

    // MARK: - Typing Indicator Text

    private var typingIndicatorText: some View {
        HStack(spacing: 4) {
            Text(typingText)
                .font(.system(size: 13))
                .foregroundColor(.blue)

            TypingDotsView()
        }
    }

    private var typingText: String {
        let users = Array(viewModel.typingUsers)
        if users.count == 1 {
            return users[0] + " is typing"
        } else if users.count == 2 {
            return users[0] + " and " + users[1] + " are typing"
        } else {
            return "Several people are typing"
        }
    }

    // MARK: - Messages List

    private var messagesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    // Load More Button
                    if viewModel.hasMoreMessages {
                        loadMoreButton
                    }

                    // Messages
                    ForEach(groupedMessages, id: \.date) { group in
                        Section {
                            ForEach(group.messages) { message in
                                messageRow(for: message, in: group.messages)
                                    .id(message.id)
                                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                            }
                        } header: {
                            DateSeparatorView(date: group.date)
                                .padding(.vertical, 12)
                        }
                    }

                    // Typing Indicator
                    if !viewModel.typingUsers.isEmpty {
                        TypingIndicatorView(users: Array(viewModel.typingUsers))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                    }
                }
                .padding(.vertical, 8)
            }
            .onAppear {
                scrollProxy = proxy
            }
            .onChange(of: viewModel.messages.count) { _ in
                scrollToBottom()
            }
        }
    }

    private var loadMoreButton: some View {
        Button(action: {
            Task {
                await viewModel.loadMoreMessages()
            }
        }) {
            if viewModel.isLoadingMore {
                ProgressView()
                    .tint(.blue)
            } else {
                Text("Load More")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.blue)
            }
        }
        .frame(height: 44)
        .frame(maxWidth: .infinity)
    }

    // MARK: - v2 - Message Row with MeeshyMessageBubble
    // Replaces legacy MessageRow with modern, animated bubble component

    private func messageRow(for message: Message, in messages: [Message]) -> some View {
        // v2 - Using MeeshyMessageBubble for modern pastel design and animations
        MeeshyMessageBubble(
            message: message,
            isGroupChat: conversation.activeMembers.count > 1,
            showSenderName: shouldShowSenderName(for: message, in: messages),
            participants: conversation.activeMembers,
            onReact: { emoji in
                Task {
                    try? await viewModel.addReaction(messageId: message.id, emoji: emoji)
                }
            },
            onReply: {
                replyToMessage = message
                isInputFocused = true
            },
            onTranslate: {
                // TODO: Implement translation
                print("Translation requested for message \(message.id)")
            },
            onCopy: {
                // v2 - Copy message content to clipboard
                UIPasteboard.general.string = message.content
            },
            onEdit: {
                messageToEdit = message
            },
            onDelete: {
                Task {
                    try? await viewModel.deleteMessage(messageId: message.id)
                }
            }
        )
    }

    // MARK: - Reply Preview

    private func replyPreview(message: Message) -> some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(Color.blue)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 4) {
                Text("Replying to \(replySenderName(for: message))")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.blue)

                Text(message.content)
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Button(action: {
                replyToMessage = nil
            }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(.secondarySystemGroupedBackground))
    }

    // MARK: - Helper Methods

    /// Get display name for a message sender (used in reply previews)
    private func replySenderName(for message: Message) -> String {
        if let displayName = message.sender?.displayName, !displayName.isEmpty {
            return displayName
        }
        if let username = message.sender?.username, !username.isEmpty {
            return username
        }
        if let senderId = message.senderId, !senderId.isEmpty {
            return "Utilisateur \(senderId.prefix(6))..."
        }
        return "Utilisateur"
    }

    private var groupedMessages: [MessageGroup] {
        let calendar = Calendar.current
        var groups: [MessageGroup] = []
        var currentDate: Date?
        var currentMessages: [Message] = []

        for message in viewModel.messages.reversed() {
            let messageDate = calendar.startOfDay(for: message.createdAt)

            if currentDate == nil {
                currentDate = messageDate
                currentMessages.append(message)
            } else if currentDate == messageDate {
                currentMessages.append(message)
            } else {
                if let date = currentDate {
                    groups.append(MessageGroup(date: date, messages: currentMessages))
                }
                currentDate = messageDate
                currentMessages = [message]
            }
        }

        if let date = currentDate, !currentMessages.isEmpty {
            groups.append(MessageGroup(date: date, messages: currentMessages))
        }

        return groups
    }

    private func shouldShowAvatar(for message: Message, in messages: [Message]) -> Bool {
        guard let index = messages.firstIndex(where: { $0.id == message.id }) else {
            return true
        }

        // Show avatar if it's the last message from this sender
        if index == messages.count - 1 {
            return true
        }

        let nextMessage = messages[index + 1]
        return nextMessage.senderId != message.senderId
    }

    private func shouldShowSenderName(for message: Message, in messages: [Message]) -> Bool {
        guard let index = messages.firstIndex(where: { $0.id == message.id }) else {
            return true
        }

        // Show sender name if it's the first message from this sender
        if index == 0 {
            return true
        }

        let previousMessage = messages[index - 1]
        return previousMessage.senderId != message.senderId
    }

    private func scrollToBottom() {
        if let firstMessage = viewModel.messages.first {
            scrollProxy?.scrollTo(firstMessage.id, anchor: .bottom)
        }
    }

    private func showMessageContextMenu(for message: Message) {
        // Context menu will be shown via long press gesture in MessageRow
    }
}

// MARK: - Message Group

struct MessageGroup {
    let date: Date
    let messages: [Message]
}

// MARK: - Typing Dots View

struct TypingDotsView: View {
    @State private var animationState = 0

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(Color.blue)
                    .frame(width: 4, height: 4)
                    .opacity(animationState == index ? 1.0 : 0.3)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.6).repeatForever()) {
                animationState = 2
            }
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationView {
        ChatView(conversation: Conversation.preview)
    }
}
