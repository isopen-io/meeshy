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
    }

    // MARK: - Message Preview

    private var messagePreview: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: accentColor))
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 2) {
                Text(message.senderName ?? "?")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))

                Text(message.content.isEmpty ? "[Media]" : message.content)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)

            if let firstAttachment = message.attachments.first {
                attachmentThumbnail(firstAttachment)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
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
            .frame(width: 40, height: 40)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    // MARK: - Conversation Row

    private func conversationRow(_ conv: Conversation) -> some View {
        Button {
            forwardTo(conv)
        } label: {
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: conv.name,
                    mode: .conversationList,
                    accentColor: conv.accentColor ?? accentColor,
                    avatarURL: conv.avatar
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

                if sentToIds.contains(conv.id) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(.green)
                } else if sendingToId == conv.id {
                    ProgressView()
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "paperplane.circle")
                        .font(.system(size: 22))
                        .foregroundColor(Color(hex: accentColor).opacity(0.6))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .disabled(sendingToId != nil || sentToIds.contains(conv.id))
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
                    forwardedFromId: message.id,
                    forwardedFromConversationId: sourceConversationId
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
