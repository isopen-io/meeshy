import SwiftUI
import MeeshySDK

// MARK: - ForwardPickerSheet

struct ForwardPickerSheet: View {
    let message: Message
    let sourceConversationId: String
    let accentColor: String
    let onDismiss: () -> Void

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var statusViewModel: StatusViewModel

    @State private var conversations: [Conversation] = []
    @State private var isLoading = true
    @State private var searchText = ""
    @State private var sendingToId: String? = nil
    @State private var sentToIds: Set<String> = []
    @State private var errorMessage: String? = nil

    private var filteredConversations: [Conversation] {
        if searchText.isEmpty {
            return conversations.filter { $0.id != sourceConversationId }
        }
        let query = searchText.lowercased()
        return conversations.filter { conv in
            conv.id != sourceConversationId && conv.name.lowercased().contains(query)
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                messagePreview

                Divider()
                    .overlay(theme.textMuted.opacity(0.2))

                if isLoading {
                    Spacer()
                    ProgressView()
                        .tint(Color(hex: accentColor))
                    Spacer()
                } else if filteredConversations.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 40))
                            .foregroundColor(theme.textMuted)
                        Text("Aucune conversation")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(filteredConversations) { conv in
                                conversationRow(conv)
                            }
                        }
                    }
                }
            }
            .background(theme.backgroundPrimary)
            .navigationTitle("Transf\u{00e9}rer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") {
                        dismiss()
                        onDismiss()
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Rechercher une conversation")
        }
        .task {
            await loadConversations()
        }
        .withStatusBubble()
    }

    // MARK: - Message Preview (thin, like reply banner)

    private var messagePreview: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color(hex: accentColor))
                .frame(width: 3, height: 28)

            if let firstAttachment = message.attachments.first {
                attachmentThumbnail(firstAttachment)
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(message.senderName ?? "?")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .lineLimit(1)

                Text(message.content.isEmpty ? "[Media]" : message.content)
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Button {
                dismiss()
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(theme.mode.isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.02))
    }

    @ViewBuilder
    private func attachmentThumbnail(_ attachment: MessageAttachment) -> some View {
        let thumbUrl = attachment.thumbnailUrl ?? (attachment.type == .image ? attachment.fileUrl : nil)
        if let urlStr = thumbUrl, !urlStr.isEmpty {
            CachedAsyncImage(url: urlStr) {
                Color(hex: accentColor).opacity(0.3)
            }
            .aspectRatio(contentMode: .fill)
            .frame(width: 28, height: 28)
            .clipShape(RoundedRectangle(cornerRadius: 5))
        }
    }

    // MARK: - Conversation Row

    private func conversationRow(_ conv: Conversation) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: conv.name,
                mode: .conversationList,
                accentColor: conv.accentColor,
                avatarURL: conv.avatar,
                moodEmoji: conv.participantUserId.flatMap { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                onMoodTap: conv.participantUserId.flatMap { statusViewModel.moodTapHandler(for: $0) }
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(conv.name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(conv.type.rawValue)
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)

                    if conv.memberCount > 0 {
                        Text("\u{2022} \(conv.memberCount) membres")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                    }
                }
            }

            Spacer()

            sendButton(for: conv)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private func sendButton(for conv: Conversation) -> some View {
        if sentToIds.contains(conv.id) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 24))
                .foregroundColor(.green)
        } else if sendingToId == conv.id {
            ProgressView()
                .scaleEffect(0.8)
                .frame(width: 24, height: 24)
        } else {
            Button {
                forwardTo(conv)
            } label: {
                Image(systemName: "paperplane.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(Color(hex: accentColor))
            }
            .disabled(sendingToId != nil)
        }
    }

    // MARK: - Actions

    private func loadConversations() async {
        do {
            let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await APIClient.shared.offsetPaginatedRequest(
                endpoint: "/conversations",
                offset: 0,
                limit: 50
            )
            if response.success {
                let userId = AuthManager.shared.currentUser?.id ?? ""
                conversations = response.data.map { $0.toConversation(currentUserId: userId) }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func forwardTo(_ targetConversation: Conversation) {
        sendingToId = targetConversation.id
        Task {
            do {
                let body = SendMessageRequest(
                    content: message.content.isEmpty ? nil : message.content,
                    originalLanguage: nil,
                    replyToId: nil,
                    forwardedFromId: message.id,
                    forwardedFromConversationId: sourceConversationId,
                    attachmentIds: nil
                )
                let _: APIResponse<SendMessageResponseData> = try await APIClient.shared.post(
                    endpoint: "/conversations/\(targetConversation.id)/messages",
                    body: body
                )
                sentToIds.insert(targetConversation.id)
                HapticFeedback.success()
            } catch {
                errorMessage = "Erreur: \(error.localizedDescription)"
                HapticFeedback.error()
            }
            sendingToId = nil
        }
    }
}
