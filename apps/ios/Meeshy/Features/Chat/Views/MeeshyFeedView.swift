//
//  MeeshyFeedView.swift
//  Meeshy
//
//  Vue Feed pour Meeshy et les chats anonymes
//  - Header simple avec titre "Meeshy"
//  - Bannière d'information fermable/défilante
//  - Pseudo utilisateur à droite (fantôme si anonyme)
//  - Zone de frappe, envoi, réactions, notifications
//  - Zone de saisie pour envoyer des messages
//  - Glissement vers le bas ou flèche pour quitter
//

import SwiftUI

// MARK: - Meeshy Feed View

struct MeeshyFeedView: View {
    @StateObject private var viewModel: ModernChatViewModel
    @State private var messageText = ""
    @State private var showInfoBanner = true
    @State private var dragOffset: CGFloat = 0
    @GestureState private var isDragging = false
    @State private var replyingTo: Message? = nil

    @Environment(\.dismiss) private var dismiss

    let conversation: Conversation
    let currentUserName: String
    let isAnonymous: Bool

    /// System/user info messages to display in banner
    @State private var bannerMessages: [String] = [
        "Bienvenue sur Meeshy!",
        "Vos messages sont sécurisés"
    ]
    @State private var currentBannerIndex = 0

    // Swipe threshold to dismiss
    private let swipeThreshold: CGFloat = 100

    init(
        conversation: Conversation,
        currentUserName: String = "Utilisateur",
        isAnonymous: Bool = false
    ) {
        self.conversation = conversation
        self.currentUserName = currentUserName
        self.isAnonymous = isAnonymous
        _viewModel = StateObject(wrappedValue: ModernChatViewModel(conversation: conversation))
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color(.systemBackground)
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // HEADER
                    feedHeader
                        .gesture(
                            DragGesture()
                                .updating($isDragging) { value, state, _ in
                                    state = true
                                }
                                .onChanged { value in
                                    if value.translation.height > 0 {
                                        dragOffset = value.translation.height
                                    }
                                }
                                .onEnded { value in
                                    if value.translation.height > swipeThreshold {
                                        dismiss()
                                    }
                                    dragOffset = 0
                                }
                        )

                    // Info Banner (closable/scrolling)
                    if showInfoBanner {
                        infoBanner
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }

                    // Activity Zone (typing, reactions, notifications)
                    activityZone

                    // Messages List
                    messagesList
                        .frame(maxHeight: .infinity)

                    // Input Zone
                    inputZone
                }
            }
            .offset(y: dragOffset * 0.5) // Parallax effect during drag
            .opacity(Double(1.0 - (dragOffset / 400.0))) // Fade out during drag
        }
        .navigationBarHidden(true)
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }

    // MARK: - Header

    private var feedHeader: some View {
        HStack(spacing: 12) {
            // Back button
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.meeshyPrimary)
            }

            // Title "Meeshy"
            Text("Meeshy")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.primary)

            Spacer()

            // User info (ghost if anonymous)
            HStack(spacing: 6) {
                if isAnonymous {
                    Image(systemName: "theatermasks.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }
                Text(currentUserName)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }

    // MARK: - Info Banner

    private var infoBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 16))
                .foregroundColor(.meeshyPrimary)

            // Scrolling messages
            Text(bannerMessages[safe: currentBannerIndex] ?? "")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(1)
                .animation(.easeInOut, value: currentBannerIndex)

            Spacer()

            // Close button
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    showInfoBanner = false
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.meeshyPrimary.opacity(0.1))
        .onAppear {
            startBannerRotation()
        }
    }

    private func startBannerRotation() {
        guard bannerMessages.count > 1 else { return }

        Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.3)) {
                currentBannerIndex = (currentBannerIndex + 1) % bannerMessages.count
            }
        }
    }

    // MARK: - Activity Zone

    private var activityZone: some View {
        HStack(spacing: 8) {
            // Typing indicator
            if !viewModel.typingUsers.isEmpty {
                HStack(spacing: 4) {
                    TypingIndicatorDots()
                    Text(typingText)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                .transition(.opacity)
            }

            Spacer()

            // Message count / activity
            if viewModel.messages.count > 0 {
                Text("\(viewModel.messages.count) messages")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 32)
        .background(Color(.secondarySystemBackground))
        .animation(.easeInOut(duration: 0.2), value: viewModel.typingUsers.count)
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

    // MARK: - Messages List (Using Configurable Component)

    private var messagesList: some View {
        MessageBubbleConfigurableListing(
            viewModel: viewModel,
            configuration: .feed,
            onReply: { message in
                withAnimation(.easeOut(duration: 0.2)) {
                    replyingTo = message
                }
            }
        )
    }

    // MARK: - Input Zone (MessageInputBar)

    private var inputZone: some View {
        MessageInputBar(
            text: $messageText,
            isSending: viewModel.isSending,
            onSend: { attachments, languageCode, sentiment in
                sendMessage(attachments: attachments, languageCode: languageCode, sentiment: sentiment)
            },
            onAttachmentTap: { },
            onTyping: {
                viewModel.startTyping()
            },
            replyingTo: replyingTo,
            onCancelReply: {
                withAnimation(.easeOut(duration: 0.2)) {
                    replyingTo = nil
                }
            }
        )
    }

    private func sendMessage(attachments: [InputAttachment], languageCode: String?, sentiment: SentimentCategory?) {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !attachments.isEmpty else { return }

        messageText = ""
        viewModel.stopTyping()

        viewModel.sendMessageWithAttachments(
            content: text,
            attachments: attachments,
            replyToId: replyingTo?.id,
            detectedLanguage: languageCode,
            sentiment: sentiment
        )

        // Clear reply
        replyingTo = nil
    }
}

// MARK: - Safe Array Access Extension

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// MARK: - Preview

#Preview {
    MeeshyFeedView(
        conversation: .preview,
        currentUserName: "Jean",
        isAnonymous: true
    )
}
