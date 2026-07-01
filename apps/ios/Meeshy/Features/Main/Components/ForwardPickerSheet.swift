import SwiftUI
import Combine
import MeeshySDK

// MARK: - ForwardPickerSheet

struct ForwardPickerSheet: View {
    let message: Message
    let sourceConversationId: String
    let accentColor: String
    let onDismiss: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
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
            conv.id != sourceConversationId
                && (conv.displayName.lowercased().contains(query)
                    || conv.name.lowercased().contains(query))
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
                        // Héros décoratif ≥40pt : taille fixe, exclu du Dynamic Type
                        // (doctrine 74i/86i) ; le libellé adjacent porte le sens.
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 40))
                            .foregroundColor(theme.textMuted)
                            .accessibilityHidden(true)
                        Text(String(localized: "forward.empty", defaultValue: "Aucune conversation", bundle: .main))
                            .font(MeeshyFont.relative(15, weight: .medium))
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
            .navigationTitle(String(localized: "forward.title", defaultValue: "Forward", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Close", bundle: .main)) {
                        dismiss()
                        onDismiss()
                    }
                }
            }
            .searchable(text: $searchText, prompt: String(localized: "forward.search-placeholder", defaultValue: "Search a conversation", bundle: .main))
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
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .lineLimit(1)

                Text(message.content.isEmpty ? String(localized: "forward.media-placeholder", defaultValue: "[Media]", bundle: .main) : message.content)
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Button {
                dismiss()
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(10, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.02))
    }

    @ViewBuilder
    private func attachmentThumbnail(_ attachment: MessageAttachment) -> some View {
        let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
        let fullUrl = attachment.type == .image && !attachment.fileUrl.isEmpty ? attachment.fileUrl : nil
        if thumbUrl != nil || fullUrl != nil || attachment.thumbHash != nil {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: thumbUrl,
                fullUrl: fullUrl ?? thumbUrl
            ) {
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
                name: conv.displayName,
                context: .conversationList,
                accentColor: conv.accentColor,
                avatarURL: conv.avatar,
                moodEmoji: conv.participantUserId.flatMap { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                onMoodTap: conv.participantUserId.flatMap { statusViewModel.moodTapHandler(for: $0) }
            )

            VStack(alignment: .leading, spacing: 2) {
                ConversationTitleLabel(
                    name: conv.displayName,
                    favoriteEmoji: conv.userState.reaction,
                    font: MeeshyFont.relative(15, weight: .medium),
                    color: theme.textPrimary
                )

                HStack(spacing: 4) {
                    Text(conv.type.rawValue)
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(theme.textMuted)

                    if conv.memberCount > 0 {
                        Text(String(format: String(localized: "forward.members-count", defaultValue: "\u{2022} %d membres", bundle: .main), conv.memberCount))
                            .font(MeeshyFont.relative(12))
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
                .font(.title2)
                .foregroundColor(MeeshyColors.success)
                .accessibilityLabel(String(localized: "forward.sent", defaultValue: "Transféré", bundle: .main))
        } else if sendingToId == conv.id {
            ProgressView()
                .scaleEffect(0.8)
                .frame(width: 24, height: 24)
                .accessibilityLabel(String(localized: "forward.sending", defaultValue: "Envoi en cours", bundle: .main))
        } else {
            Button {
                forwardTo(conv)
            } label: {
                Image(systemName: "paperplane.circle.fill")
                    .font(MeeshyFont.relative(24))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(format: String(localized: "forward.send-a11y", defaultValue: "Transférer à %@", bundle: .main), conv.title ?? String(localized: "forward.this-conversation", defaultValue: "cette conversation", bundle: .main)))
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
                errorMessage = String(format: String(localized: "common.error.format", defaultValue: "Erreur: %@", bundle: .main), error.localizedDescription)
                HapticFeedback.error()
            }
            sendingToId = nil
        }
    }
}
