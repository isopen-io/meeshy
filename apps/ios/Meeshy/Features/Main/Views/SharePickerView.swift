import SwiftUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - Shared Content Types

enum SharedContentType {
    case text(String)
    case url(URL)
    case image(UIImage)
    case message(Message)
}

// MARK: - SharePickerView

struct SharePickerView: View {
    let sharedContent: SharedContentType
    let onDismiss: () -> Void
    var onShareToConversation: ((Conversation, SharedContentType) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router

    @State private var conversations: [Conversation] = []
    @State private var isLoading = true
    @State private var searchText = ""
    @State private var sentToIds: Set<String> = []
    @State private var sendingToId: String? = nil

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "share")

    private var filteredConversations: [Conversation] {
        let active = conversations.filter { $0.isActive }
        guard !searchText.isEmpty else {
            return active
        }
        let query = searchText.lowercased()
        return active.filter { $0.name.lowercased().contains(query) }
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                contentPreviewBanner

                Divider()
                    .overlay(theme.textMuted.opacity(0.2))

                searchField

                if isLoading {
                    loadingState
                } else if filteredConversations.isEmpty {
                    emptyState
                } else {
                    conversationList
                }
            }
            .background(theme.backgroundPrimary)
            .navigationTitle("Partager avec...")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") {
                        dismiss()
                        onDismiss()
                    }
                }
            }
        }
        .task {
            await loadConversations()
        }
    }

    // MARK: - Content Preview Banner

    private var contentPreviewBanner: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(MeeshyColors.cyan)
                .frame(width: 3, height: 32)

            contentIcon

            VStack(alignment: .leading, spacing: 2) {
                Text(contentLabel)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(MeeshyColors.cyan)
                    .lineLimit(1)

                Text(contentPreview)
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(theme.mode.isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.02))
    }

    @ViewBuilder
    private var contentIcon: some View {
        switch sharedContent {
        case .text:
            Image(systemName: "text.bubble.fill")
                .font(.system(size: 16))
                .foregroundColor(MeeshyColors.cyan)
        case .url:
            Image(systemName: "link.circle.fill")
                .font(.system(size: 16))
                .foregroundColor(MeeshyColors.purple)
        case .image(let image):
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 32, height: 32)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        case .message:
            Image(systemName: "arrowshape.turn.up.forward.fill")
                .font(.system(size: 16))
                .foregroundColor(MeeshyColors.orange)
        }
    }

    private var contentLabel: String {
        switch sharedContent {
        case .text: return "Texte"
        case .url: return "Lien"
        case .image: return "Image"
        case .message: return "Message transf\u{00e9}r\u{00e9}"
        }
    }

    private var contentPreview: String {
        switch sharedContent {
        case .text(let text):
            return String(text.prefix(120))
        case .url(let url):
            return url.absoluteString
        case .image:
            return "Photo a partager"
        case .message(let msg):
            return msg.content.isEmpty ? "[Media]" : String(msg.content.prefix(120))
        }
    }

    // MARK: - Search Field

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)

            TextField("Rechercher une conversation...", text: $searchText)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel("Effacer la recherche")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
        )
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    // MARK: - States

    private var loadingState: some View {
        VStack {
            Spacer()
            ProgressView()
                .tint(MeeshyColors.cyan)
            Spacer()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 40))
                .foregroundColor(theme.textMuted)
            Text("Aucune conversation")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
    }

    // MARK: - Conversation List

    private var conversationList: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(filteredConversations) { conv in
                    shareRow(for: conv)
                }
            }
        }
    }

    private func shareRow(for conv: Conversation) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: conv.name,
                mode: .custom(44),
                accentColor: conv.accentColor,
                avatarURL: conv.avatar
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(conv.name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(conversationTypeLabel(conv.type))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)

                    if let preview = conv.lastMessagePreview, !preview.isEmpty {
                        Text("\u{2022}")
                            .font(.system(size: 10))
                            .foregroundColor(theme.textMuted)
                        Text(preview)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            shareButton(for: conv)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func shareButton(for conv: Conversation) -> some View {
        if sentToIds.contains(conv.id) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 26))
                .foregroundColor(MeeshyColors.green)
                .transition(.scale.combined(with: .opacity))
        } else if sendingToId == conv.id {
            ProgressView()
                .scaleEffect(0.8)
                .frame(width: 26, height: 26)
        } else {
            Button {
                shareToConversation(conv)
            } label: {
                Image(systemName: "paperplane.circle.fill")
                    .font(.system(size: 26))
                    .foregroundColor(MeeshyColors.cyan)
            }
            .disabled(sendingToId != nil)
            .accessibilityLabel("Envoyer a \(conv.name)")
        }
    }

    // MARK: - Helpers

    private func conversationTypeLabel(_ type: MeeshyConversation.ConversationType) -> String {
        switch type {
        case .direct: return "Direct"
        case .group: return "Groupe"
        case .public: return "Publique"
        case .global: return "Globale"
        case .community: return "Communaut\u{00e9}"
        case .channel: return "Canal"
        case .bot: return "Bot"
        }
    }

    // MARK: - Actions

    private func loadConversations() async {
        if !conversationListViewModel.conversations.isEmpty {
            conversations = conversationListViewModel.conversations
            isLoading = false
            return
        }

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
            Self.logger.error("Failed to load conversations for share: \(error.localizedDescription)")
        }
        isLoading = false
    }

    private func shareToConversation(_ conv: Conversation) {
        if let handler = onShareToConversation {
            handler(conv, sharedContent)
            sentToIds.insert(conv.id)
            HapticFeedback.success()
            return
        }

        sendingToId = conv.id
        Task {
            do {
                let content = contentToSend
                let body = SendMessageRequest(
                    content: content,
                    originalLanguage: nil,
                    replyToId: nil,
                    forwardedFromId: forwardedMessageId,
                    forwardedFromConversationId: nil,
                    attachmentIds: nil
                )
                let _: APIResponse<SendMessageResponseData> = try await APIClient.shared.post(
                    endpoint: "/conversations/\(conv.id)/messages",
                    body: body
                )
                sentToIds.insert(conv.id)
                HapticFeedback.success()
                Self.logger.info("Shared content to conversation \(conv.id)")
            } catch {
                Self.logger.error("Failed to share to conversation: \(error.localizedDescription)")
                HapticFeedback.error()
                ToastManager.shared.showError("Erreur lors du partage")
            }
            sendingToId = nil
        }
    }

    private var contentToSend: String? {
        switch sharedContent {
        case .text(let text): return text
        case .url(let url): return url.absoluteString
        case .image: return nil
        case .message(let msg): return msg.content.isEmpty ? nil : msg.content
        }
    }

    private var forwardedMessageId: String? {
        if case .message(let msg) = sharedContent { return msg.id }
        return nil
    }
}
