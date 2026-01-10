import SwiftUI

struct MeeshyGlobalView: View {
    @StateObject private var viewModel: ChatViewModel
    
    init() {
        // Create mock global Meeshy conversation with required parameters
        let meeshyConversation = Conversation(
            id: "meeshy",
            identifier: "meeshy",
            type: .global,
            title: "Meeshy Global",
            description: "Conversation mondiale Meeshy",
            image: nil,
            avatar: nil,
            communityId: nil,
            isActive: true,
            isArchived: false,
            lastMessageAt: Date(),
            createdAt: Date(),
            updatedAt: Date(),
            members: [],
            lastMessage: nil,
            shareLinks: nil,
            anonymousParticipants: nil,
            userPreferences: nil,
            unreadCount: 0,
            isMuted: false,
            isPinned: false
        )
        _viewModel = StateObject(wrappedValue: ChatViewModel(conversationId: meeshyConversation.id))
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Header with logo
                GlobalConversationHeader()
                
                // Use the enhanced chat view
                EnhancedChatContent(viewModel: viewModel)
            }
            .navigationBarHidden(true)
            .task {
                await viewModel.loadMessages()
            }
            .onAppear {
                // Mark conversation as read when view appears
                // Note: markAsRead functionality to be implemented in ChatViewModel
            }
            .onDisappear {
                viewModel.stopTyping()
            }
        }
    }
}

// MARK: - Global Conversation Header
struct GlobalConversationHeader: View {
    var body: some View {
        HStack {
            Image(systemName: "globe.americas.fill")
                .font(.title2)
                .foregroundColor(.blue)
            
            VStack(alignment: .leading, spacing: 2) {
                Text("Meeshy Global")
                    .font(.headline)
                
                Text("Conversation mondiale")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            // Online users count (mock)
            HStack(spacing: 4) {
                Circle()
                    .fill(Color.green)
                    .frame(width: 8, height: 8)
                Text("1.2k")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }
}

// MARK: - Enhanced Chat Content (reusable)
struct EnhancedChatContent: View {
    @ObservedObject var viewModel: ChatViewModel
    @State private var messageText = ""
    @State private var replyingTo: Message?
    @FocusState private var isMessageFieldFocused: Bool
    
    var body: some View {
        VStack(spacing: 0) {
            // Messages list
            if viewModel.isLoading && viewModel.messages.isEmpty {
                VStack(spacing: 16) {
                    Spacer()
                    ProgressView()
                    Text("Chargement des messages...")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Spacer()
                }
            } else if viewModel.messages.isEmpty {
                EmptyMessagesView()
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(viewModel.messages) { message in
                                ModernMessageBubble(
                                    message: message,
                                    isCurrentUser: message.senderId == getCurrentUserId(),
                                    isFirstInGroup: true,
                                    isLastInGroup: true,
                                    onReply: { replyingTo = message; isMessageFieldFocused = true },
                                    onReaction: { emoji in },
                                    onTranslate: { lang in },
                                    onEdit: { content in },
                                    onDelete: { },
                                    onReport: { },
                                    onForward: { },
                                    getMessageById: { id in viewModel.messages.first { $0.id == id } },
                                    currentUserId: getCurrentUserId(),
                                    onScrollToMessage: { messageId in
                                        // Scroll to the quoted message
                                        withAnimation(.easeInOut(duration: 0.3)) {
                                            proxy.scrollTo(messageId, anchor: .center)
                                        }
                                    }
                                )
                                .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: viewModel.messages.count) { _ in
                        if let lastMessage = viewModel.messages.last {
                            withAnimation {
                                proxy.scrollTo(lastMessage.id, anchor: .bottom)
                            }
                        }
                    }
                }
            }
            
            // Typing indicator
            if !viewModel.typingUsers.isEmpty {
                TypingIndicatorView(users: Array(viewModel.typingUsers))
            }
            
            // Reply preview
            if let replyMessage = replyingTo {
                ReplyPreviewBar(
                    message: replyMessage,
                    onCancel: {
                        replyingTo = nil
                    }
                )
            }
            
            // Message input with language detection and sentiment analysis
            MessageInputBar(
                text: $messageText,
                isSending: viewModel.isSending,
                onSend: { attachments, detectedLanguage, sentiment in
                    Task {
                        let text = messageText
                        messageText = ""
                        viewModel.stopTyping()
                        // TODO: Handle attachments upload in MeeshyGlobalView
                        try? await viewModel.sendMessage(
                            content: text,
                            replyToId: replyingTo?.id,
                            detectedLanguage: detectedLanguage,
                            sentiment: sentiment
                        )
                        replyingTo = nil
                    }
                },
                onAttachmentTap: {
                    // TODO: Implement attachments
                },
                onTyping: {
                    viewModel.startTyping()
                }
            )
        }
    }
    
    private func getCurrentUserId() -> String? {
        return AuthenticationManager.shared.currentUser?.id
    }
}

// MARK: - Empty Messages View
struct EmptyMessagesView: View {
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 60))
                .foregroundColor(.gray.opacity(0.5))
            Text("Bienvenue sur Meeshy Global !")
                .font(.title2)
                .fontWeight(.medium)
            Text("Soyez le premier à envoyer un message")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
        }
        .padding()
    }
}

#Preview {
    MeeshyGlobalView()
}
