import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

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
    @State private var failedToIds: Set<String> = []
    @State private var loadFailed = false

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
                } else if conversations.isEmpty && loadFailed {
                    // Cold-start load failure — distinct from a genuinely empty
                    // list so the user gets a recoverable Retry rather than a
                    // misleading "no conversations". Reuses the conversation-list
                    // error copy (identical operation), already localized.
                    EmptyStateView(
                        icon: "wifi.slash",
                        title: String(localized: "conversations.error.title", defaultValue: "Une erreur est survenue", bundle: .main),
                        subtitle: String(localized: "conversations.error.subtitle", defaultValue: "Impossible de charger vos conversations.", bundle: .main),
                        actionLabel: String(localized: "conversations.error.retry", defaultValue: "Réessayer", bundle: .main),
                        accentColor: accentColor,
                        compact: true,
                        onAction: { Task { await retryLoad() } }
                    )
                } else if filteredConversations.isEmpty {
                    EmptyStateView(
                        icon: "bubble.left.and.bubble.right",
                        title: String(localized: "forward.empty", defaultValue: "Aucune conversation", bundle: .main),
                        subtitle: String(localized: "forward.empty.subtitle", defaultValue: "Rejoignez ou démarrez une conversation pour y transférer des messages.", bundle: .main),
                        accentColor: accentColor,
                        compact: true
                    )
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
            .accessibilityElement(children: .combine)

            Spacer(minLength: 0)

            Button {
                dismiss()
                onDismiss()
            } label: {
                // Chrome close glyph in a thin preview banner — kept fixed per chrome doctrine 82i.
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .medium))
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
            .accessibilityElement(children: .combine)

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
        } else if failedToIds.contains(conv.id) {
            // Send failed — surface it in-sheet (a root toast renders behind the
            // sheet) as a tappable, recoverable retry. Error is signalled by the
            // glyph shape, not colour alone.
            Button {
                forwardTo(conv)
            } label: {
                Image(systemName: "exclamationmark.arrow.circlepath")
                    .font(MeeshyFont.relative(24))
                    .foregroundColor(MeeshyColors.error)
            }
            .accessibilityLabel(String(format: String(localized: "forward.retry-send-a11y", defaultValue: "Réessayer le transfert à %@", bundle: .main), conv.title ?? String(localized: "forward.this-conversation", defaultValue: "cette conversation", bundle: .main)))
            .disabled(sendingToId != nil)
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
        // Cache-first: surface the locally-cached conversations instantly (same
        // store/key as the conversation list) so the forward picker never shows
        // a spinner when data is already known, then revalidate in background.
        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cached {
        case .fresh(let data, _):
            conversations = data
            isLoading = false
        case .stale(let data, _):
            conversations = data
            isLoading = false
            await refreshConversations()
        case .expired, .empty:
            await refreshConversations()
        }
    }

    private func refreshConversations() async {
        do {
            let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await APIClient.shared.offsetPaginatedRequest(
                endpoint: "/conversations",
                offset: 0,
                limit: 50
            )
            if response.success {
                let userId = AuthManager.shared.currentUser?.id ?? ""
                let payload = response.data
                // Decode off the main actor so opening the picker never hitches.
                conversations = await Task.detached(priority: .userInitiated) {
                    payload.map { $0.toConversation(currentUserId: userId) }
                }.value
                loadFailed = false
            } else {
                loadFailed = true
            }
        } catch {
            loadFailed = true
        }
        isLoading = false
    }

    private func retryLoad() async {
        loadFailed = false
        isLoading = true
        await refreshConversations()
    }

    /// Offline: durably enqueues instead of attempting — and losing — the
    /// direct REST POST (the same `ofq_*` outbox row
    /// `OutboxDispatcher.dispatchSendMessage` already replays for
    /// `ConversationViewModel`). Gated on `NetworkMonitor.shared.isOnline`
    /// mirroring `ConversationViewModel.sendMessage`'s offline branch.
    private func forwardTo(_ targetConversation: Conversation) {
        sendingToId = targetConversation.id
        failedToIds.remove(targetConversation.id)
        Task {
            guard NetworkMonitor.shared.isOnline else {
                let item = OfflineQueueItem(
                    conversationId: targetConversation.id,
                    content: message.content,
                    forwardedFromId: message.id,
                    forwardedFromConversationId: sourceConversationId
                )
                do {
                    try await OfflineQueue.shared.enqueue(item)
                    sentToIds.insert(targetConversation.id)
                    HapticFeedback.success()
                } catch {
                    failedToIds.insert(targetConversation.id)
                    HapticFeedback.error()
                }
                sendingToId = nil
                return
            }
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
                failedToIds.insert(targetConversation.id)
                HapticFeedback.error()
            }
            sendingToId = nil
        }
    }
}
