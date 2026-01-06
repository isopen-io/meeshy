//
//  MessageBubbleConfigurableListing.swift
//  Meeshy
//
//  Configurable message listing component used by both Feed and Conversation views
//  Provides consistent message display with configurable bubble behavior
//

import SwiftUI

// MARK: - Message Bubble Configurable Listing

struct MessageBubbleConfigurableListing: View {
    // MARK: - Properties

    @ObservedObject var viewModel: ModernChatViewModel
    let configuration: MessageListConfiguration

    /// Callback when user taps reply on a message
    var onReply: ((Message) -> Void)?

    /// Callback when user selects a message
    var onMessageSelected: ((Message) -> Void)?

    // MARK: - State

    @State private var selectedMessageId: String?
    @Namespace private var messageNamespace

    // MARK: - Body

    var body: some View {
        ScrollViewReader { scrollProxy in
            ScrollView {
                LazyVStack(spacing: configuration.bubbleConfiguration.verticalSpacing) {
                    // Load more button
                    if configuration.showLoadMore && viewModel.hasMoreMessages {
                        loadMoreButton
                    }

                    // Messages
                    let messages = configuration.reversedOrder
                        ? viewModel.messages.reversed()
                        : viewModel.messages

                    ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                        let previousMessage = getPreviousMessage(at: index, in: Array(messages))
                        let nextMessage = getNextMessage(at: index, in: Array(messages))

                        VStack(spacing: 0) {
                            // Date separator
                            if configuration.showDateSeparators {
                                dateSeparatorIfNeeded(for: message, previous: previousMessage)
                            }

                            // Message bubble
                            messageRow(for: message, previous: previousMessage, next: nextMessage)
                                .id(message.id)
                        }
                    }

                    // Typing indicator
                    if configuration.showTypingIndicator && !viewModel.typingUsers.isEmpty {
                        typingIndicator
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }

                    // Bottom spacer
                    Color.clear.frame(height: 8)
                }
                .padding(.horizontal, configuration.bubbleConfiguration.horizontalPadding)
            }
            .onChange(of: viewModel.messages.count) { _, _ in
                if configuration.autoScrollToBottom, let lastMessage = viewModel.messages.last {
                    withAnimation(.easeOut(duration: 0.2)) {
                        scrollProxy.scrollTo(lastMessage.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Load More Button

    private var loadMoreButton: some View {
        Button {
            viewModel.loadMoreMessages()
        } label: {
            HStack(spacing: 8) {
                if viewModel.isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "arrow.up.circle")
                    Text("Charger plus de messages")
                }
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(.meeshyPrimary)
            .padding(.vertical, 12)
        }
        .disabled(viewModel.isLoading)
    }

    // MARK: - Message Row

    @ViewBuilder
    private func messageRow(for message: Message, previous: Message?, next: Message?) -> some View {
        let isCurrentUser = message.senderId == viewModel.currentUserId
        let showSenderInfo = shouldShowSenderInfo(for: message, previous: previous)
        let isLastInGroup = isLastMessageInGroup(message, next: next)

        HStack(alignment: .bottom, spacing: 8) {
            // Left side: Avatar for others
            if !isCurrentUser && configuration.bubbleConfiguration.showAvatar {
                if showSenderInfo {
                    avatarView(for: message)
                } else {
                    Color.clear.frame(width: 32)
                }
            }

            // Message content
            VStack(alignment: isCurrentUser ? .trailing : .leading, spacing: 2) {
                // Sender name
                if !isCurrentUser && showSenderInfo && configuration.bubbleConfiguration.showSenderName {
                    Text(message.sender?.preferredDisplayName ?? "Anonyme")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                        .padding(.leading, 4)
                }

                // Use ModernMessageBubble for full functionality
                ModernMessageBubble(
                    message: message,
                    isCurrentUser: isCurrentUser,
                    isFirstInGroup: showSenderInfo,
                    isLastInGroup: isLastInGroup,
                    onReply: {
                        onReply?(message)
                    },
                    onReaction: { reaction in
                        Task {
                            await viewModel.toggleReaction(messageId: message.id, emoji: reaction)
                        }
                    },
                    onTranslate: { _ in
                        // Translation handled elsewhere
                    },
                    onEdit: { newContent in
                        viewModel.editMessage(messageId: message.id, newContent: newContent)
                    },
                    onDelete: {
                        viewModel.deleteMessage(messageId: message.id)
                    },
                    onReport: {
                        // Report functionality handled elsewhere
                    },
                    onForward: {
                        // Forward functionality handled elsewhere
                    },
                    getMessageById: { messageId in
                        viewModel.messages.first { $0.id == messageId }
                    },
                    currentUserId: viewModel.currentUserId
                )
                .environment(\.messageDisplayConfiguration, configuration.bubbleConfiguration)

                // Timestamp (if in feed mode, show inline)
                if configuration.mode == .feed && isLastInGroup {
                    Text(message.createdAt.formatted(date: .omitted, time: .shortened))
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 4)
                }
            }
            .frame(
                maxWidth: UIScreen.main.bounds.width * configuration.bubbleConfiguration.maxWidthRatio,
                alignment: isCurrentUser ? .trailing : .leading
            )

            // Right side: Spacer for current user's messages
            if isCurrentUser && configuration.bubbleConfiguration.showAvatar {
                Color.clear.frame(width: 32)
            }
        }
        .frame(maxWidth: .infinity, alignment: isCurrentUser ? .trailing : .leading)
    }

    // MARK: - Avatar View

    private func avatarView(for message: Message) -> some View {
        Group {
            if let avatarUrl = message.sender?.avatar, let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    avatarPlaceholder(for: message)
                }
            } else {
                avatarPlaceholder(for: message)
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
    }

    private func avatarPlaceholder(for message: Message) -> some View {
        Circle()
            .fill(Color.meeshyPrimary.opacity(0.2))
            .overlay(
                Text(String(message.sender?.preferredDisplayName.prefix(1) ?? "?"))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.meeshyPrimary)
            )
    }

    // MARK: - Date Separator

    @ViewBuilder
    private func dateSeparatorIfNeeded(for message: Message, previous: Message?) -> some View {
        if shouldShowDateSeparator(for: message, previous: previous) {
            HStack {
                VStack { Divider() }
                Text(formatDateSeparator(message.createdAt))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(Color(.systemGray6))
                    )
                VStack { Divider() }
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        HStack(spacing: 8) {
            // Avatar placeholder
            if configuration.bubbleConfiguration.showAvatar {
                Circle()
                    .fill(Color(.systemGray4))
                    .frame(width: 32, height: 32)
            }

            // Typing bubble
            HStack(spacing: 4) {
                TypingIndicatorDots()
                Text(typingText)
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(18)

            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var typingText: String {
        let users = viewModel.typingUsers
        if users.count == 1 {
            return "\(users.first?.displayName ?? "Quelqu'un") écrit..."
        } else if users.count == 2 {
            let names = users.map { $0.displayName ?? "Quelqu'un" }
            return "\(names.joined(separator: " et ")) écrivent..."
        } else {
            return "Plusieurs personnes écrivent..."
        }
    }

    // MARK: - Helper Methods

    private func getPreviousMessage(at index: Int, in messages: [Message]) -> Message? {
        guard index > 0 else { return nil }
        return messages[index - 1]
    }

    private func getNextMessage(at index: Int, in messages: [Message]) -> Message? {
        guard index < messages.count - 1 else { return nil }
        return messages[index + 1]
    }

    private func shouldShowSenderInfo(for message: Message, previous: Message?) -> Bool {
        guard let previous = previous else { return true }

        // Show sender info if different sender or more than 5 minutes apart
        if previous.senderId != message.senderId { return true }
        let timeDiff = message.createdAt.timeIntervalSince(previous.createdAt)
        return timeDiff > 300 // 5 minutes
    }

    private func isLastMessageInGroup(_ message: Message, next: Message?) -> Bool {
        guard let next = next else { return true }
        return next.senderId != message.senderId
    }

    private func shouldShowDateSeparator(for message: Message, previous: Message?) -> Bool {
        guard let previous = previous else { return true }
        return !Calendar.current.isDate(message.createdAt, inSameDayAs: previous.createdAt)
    }

    private func formatDateSeparator(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) {
            return "Aujourd'hui"
        } else if Calendar.current.isDateInYesterday(date) {
            return "Hier"
        } else {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            return formatter.string(from: date)
        }
    }
}

// MARK: - Typing Indicator Dots (moved from MeeshyFeedView for reuse)

struct TypingIndicatorDots: View {
    @State private var animationPhase = 0

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(Color.secondary)
                    .frame(width: 6, height: 6)
                    .scaleEffect(animationPhase == index ? 1.2 : 0.8)
                    .animation(
                        .easeInOut(duration: 0.4)
                            .repeatForever()
                            .delay(Double(index) * 0.15),
                        value: animationPhase
                    )
            }
        }
        .onAppear {
            withAnimation {
                animationPhase = 1
            }
        }
    }
}

// MARK: - Preview

#Preview("Conversation Mode") {
    MessageBubbleConfigurableListing(
        viewModel: ModernChatViewModel(conversation: .preview),
        configuration: .conversation
    )
}

#Preview("Feed Mode") {
    MessageBubbleConfigurableListing(
        viewModel: ModernChatViewModel(conversation: .preview),
        configuration: .feed
    )
}
