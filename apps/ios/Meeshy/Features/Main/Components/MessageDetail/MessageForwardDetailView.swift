import SwiftUI
import MeeshySDK
import MeeshyUI

/// Transfert d'un message vers une autre conversation.
/// Recherche + envoi 100 % encapsulés — extrait de l'ancien
/// `MessageDetailSheet.forwardTabContent`. Aucun changement de comportement.
struct MessageForwardDetailView: View {
    let message: Message
    let conversationId: String

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @State private var conversations: [Conversation] = []
    @State private var isLoadingConversations = true
    @State private var loadFailed = false
    @State private var forwardSearchText = ""
    @State private var sendingToId: String? = nil
    @State private var sentToIds: Set<String> = []
    @State private var failedToIds: Set<String> = []

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.subheadline)
                    .foregroundColor(theme.textMuted)
                    .accessibilityHidden(true)

                TextField(String(localized: "forward.search-placeholder", defaultValue: "Rechercher une conversation", bundle: .main), text: $forwardSearchText)
                    .font(.subheadline)
                    .autocorrectionDisabled()

                if !forwardSearchText.isEmpty {
                    Button {
                        forwardSearchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.subheadline)
                            .foregroundColor(theme.textMuted)
                    }
                    .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(theme.inputBackground)
            )

            if isLoadingConversations {
                ProgressView()
                    .tint(Color(hex: contactColor))
                    .padding(.vertical, 20)
            } else if conversations.isEmpty && loadFailed {
                // Cold-start load failure — distinct from a genuinely empty
                // list so the user gets a recoverable Retry rather than the
                // misleading "no conversations" (parity with ForwardPickerSheet).
                emptyStateView(
                    icon: "wifi.slash",
                    text: String(localized: "conversations.error.subtitle", defaultValue: "Impossible de charger vos conversations.", bundle: .main),
                    accent: Color(hex: contactColor),
                    retryAction: { Task { await retryLoad() } }
                )
            } else if filteredForwardConversations.isEmpty {
                emptyStateView(icon: "bubble.left.and.bubble.right", text: String(localized: "forward.empty", defaultValue: "Aucune conversation", bundle: .main), accent: Color(hex: contactColor))
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(filteredForwardConversations) { conv in
                        forwardConversationRow(conv)
                    }
                }
            }
        }
        .onAppear { Task { await loadConversations() } }
    }

    private var contactColor: String {
        message.senderColor ?? MeeshyColors.brandPrimaryHex
    }

    private var filteredForwardConversations: [Conversation] {
        let filtered = conversations.filter { $0.id != conversationId }
        guard !forwardSearchText.isEmpty else { return filtered }
        let query = forwardSearchText.lowercased()
        return filtered.filter { $0.name.lowercased().contains(query) }
    }

    private func forwardConversationRow(_ conv: Conversation) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: conv.name,
                context: .conversationList,
                accentColor: conv.accentColor,
                avatarURL: conv.avatar
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(conv.name)
                    .font(.callout.weight(.medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(conv.type.rawValue)
                        .font(.caption)
                        .foregroundColor(theme.textMuted)

                    if conv.memberCount > 0 {
                        Text(String(format: String(localized: "forward.members-count", defaultValue: "\u{2022} %d membres", bundle: .main), conv.memberCount))
                            .font(.caption)
                            .foregroundColor(theme.textMuted)
                    }
                }
            }
            .accessibilityElement(children: .combine)

            Spacer()

            forwardSendButton(for: conv)
        }
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private func forwardSendButton(for conv: Conversation) -> some View {
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
            // Send failed — was silently swallowed before (HapticFeedback.error()
            // only, no visible trace). Tappable, recoverable retry glyph, shape
            // (not colour alone) signals the error state (parity with
            // ForwardPickerSheet.sendButton).
            Button {
                forwardTo(conv)
            } label: {
                Image(systemName: "exclamationmark.arrow.circlepath")
                    .font(.title2)
                    .foregroundColor(MeeshyColors.error)
            }
            .accessibilityLabel(String(format: String(localized: "forward.retry-send-a11y", defaultValue: "Réessayer le transfert à %@", bundle: .main), conv.name))
            .disabled(sendingToId != nil)
        } else {
            Button {
                forwardTo(conv)
            } label: {
                Image(systemName: "paperplane.circle.fill")
                    .font(.title2)
                    .foregroundColor(Color(hex: contactColor))
            }
            .accessibilityLabel(String(format: String(localized: "forward.send-a11y", defaultValue: "Transférer à %@", bundle: .main), conv.name))
            .disabled(sendingToId != nil)
        }
    }

    private func emptyStateView(icon: String, text: String, accent: Color, retryAction: (() -> Void)? = nil) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
                .accessibilityHidden(true)
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
            if let retryAction {
                Button(String(localized: "conversations.error.retry", defaultValue: "Réessayer", bundle: .main), action: retryAction)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(accent)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Network Actions

    /// Cache-first: surfaces the locally-cached conversation list instantly
    /// (same store/key as the conversation list and `ForwardPickerSheet`) so
    /// this tab never shows a spinner — or worse, a false "Aucune
    /// conversation" — when the data is already known, then revalidates in
    /// the background.
    private func loadConversations() async {
        guard isLoadingConversations else { return }
        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cached {
        case .fresh(let data, _):
            conversations = data
            isLoadingConversations = false
        case .stale(let data, _):
            conversations = data
            isLoadingConversations = false
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
                conversations = response.data.map { $0.toConversation(currentUserId: userId) }
                loadFailed = false
            } else {
                loadFailed = true
            }
        } catch {
            loadFailed = true
        }
        isLoadingConversations = false
    }

    private func retryLoad() async {
        loadFailed = false
        isLoadingConversations = true
        await refreshConversations()
    }

    private func forwardTo(_ targetConversation: Conversation) {
        sendingToId = targetConversation.id
        failedToIds.remove(targetConversation.id)
        Task {
            do {
                let body = SendMessageRequest(
                    content: message.content.isEmpty ? nil : message.content,
                    originalLanguage: nil,
                    replyToId: nil,
                    forwardedFromId: message.id,
                    forwardedFromConversationId: conversationId,
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
