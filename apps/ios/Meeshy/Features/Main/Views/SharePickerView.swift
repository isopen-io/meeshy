import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Shared Content Types

enum SharedContentType {
    case text(String)
    case url(URL)
    case image(UIImage)
    case message(Message)
    case story(item: StoryItem, authorName: String)
}

// MARK: - SharePickerView

struct SharePickerView: View {
    let sharedContent: SharedContentType
    let onDismiss: () -> Void
    var onShareToConversation: ((Conversation, SharedContentType) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router
    @EnvironmentObject private var statusViewModel: StatusViewModel

    @StateObject private var viewModel = SharePickerViewModel()
    @State private var searchText = ""
    // The view exposes thin computed accessors that read from `viewModel`
    // so the existing body code that referenced `conversations` /
    // `isLoading` / `sentToIds` / `sendingToId` stays compact. These
    // properties intentionally aren't @State anymore — the ViewModel
    // owns the truth (P4.1 MVVM extraction).
    private var conversations: [Conversation] { viewModel.conversations }
    private var isLoading: Bool { viewModel.isLoading }
    private var sentToIds: Set<String> { viewModel.sentToIds }
    private var sendingToId: String? { viewModel.sendingToId }

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
            .navigationTitle(String(localized: "share.picker.title", defaultValue: "Partager avec...", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) {
                        dismiss()
                        onDismiss()
                    }
                }
            }
        }
        .task {
            await loadConversations()
        }
        .withStatusBubble()
    }

    // MARK: - Content Preview Banner

    private var contentPreviewBanner: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(MeeshyColors.indigo400)
                .frame(width: 3, height: 32)

            contentIcon
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(contentLabel)
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo400)
                    .lineLimit(1)

                Text(contentPreview)
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.02))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var contentIcon: some View {
        switch sharedContent {
        case .text:
            Image(systemName: "text.bubble.fill")
                .font(MeeshyFont.relative(16))
                .foregroundColor(MeeshyColors.indigo400)
        case .url:
            Image(systemName: "link.circle.fill")
                .font(MeeshyFont.relative(16))
                .foregroundColor(MeeshyColors.indigo600)
        case .image(let image):
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 32, height: 32)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        case .message:
            Image(systemName: "arrowshape.turn.up.forward.fill")
                .font(MeeshyFont.relative(16))
                .foregroundColor(MeeshyColors.warning)
        case .story:
            Image(systemName: "play.rectangle.fill")
                .font(MeeshyFont.relative(16))
                .foregroundColor(MeeshyColors.indigo500)
        }
    }

    private var contentLabel: String {
        switch sharedContent {
        case .text: return String(localized: "share.content.text", defaultValue: "Texte", bundle: .main)
        case .url: return String(localized: "share.content.url", defaultValue: "Lien", bundle: .main)
        case .image: return String(localized: "share.content.image", defaultValue: "Image", bundle: .main)
        case .message: return String(localized: "share.content.message", defaultValue: "Message transf\u{00e9}r\u{00e9}", bundle: .main)
        case .story: return String(localized: "share.content.story", defaultValue: "Story partag\u{00e9}e", bundle: .main)
        }
    }

    private var contentPreview: String {
        switch sharedContent {
        case .text(let text):
            return String(text.prefix(120))
        case .url(let url):
            return url.absoluteString
        case .image:
            return String(localized: "share.preview.image", defaultValue: "Photo \u{00e0} partager", bundle: .main)
        case .message(let msg):
            return msg.content.isEmpty ? String(localized: "share.preview.media", defaultValue: "[M\u{00e9}dia]", bundle: .main) : String(msg.content.prefix(120))
        case .story(let item, let authorName):
            if let content = item.content, !content.isEmpty {
                return String(content.prefix(120))
            }
            return String(format: String(localized: "share.preview.story", defaultValue: "Story de %@", bundle: .main), authorName)
        }
    }

    // MARK: - Search Field

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(String(localized: "share.search.placeholder", defaultValue: "Rechercher une conversation...", bundle: .main), text: $searchText)
                .font(MeeshyFont.relative(15))
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(16))
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "common.clearSearch", defaultValue: "Clear search", bundle: .main))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
        )
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    // MARK: - States

    private var loadingState: some View {
        VStack {
            Spacer()
            ProgressView()
                .tint(MeeshyColors.indigo400)
            Spacer()
        }
    }

    private var emptyState: some View {
        EmptyStateView(
            icon: "bubble.left.and.bubble.right",
            title: String(localized: "share.empty", defaultValue: "Aucune conversation", bundle: .main),
            subtitle: ""
        )
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
                name: conv.displayName,
                context: .conversationList,
                accentColor: conv.accentColor,
                avatarURL: conv.avatar,
                moodEmoji: conv.participantUserId.flatMap { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                onMoodTap: conv.participantUserId.flatMap { statusViewModel.moodTapHandler(for: $0) }
            )

            VStack(alignment: .leading, spacing: 3) {
                ConversationTitleLabel(
                    name: conv.displayName,
                    favoriteEmoji: conv.userState.reaction,
                    font: MeeshyFont.relative(15, weight: .medium),
                    color: theme.textPrimary
                )

                HStack(spacing: 4) {
                    Text(conversationTypeLabel(conv.type))
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(theme.textMuted)

                    if let preview = conv.lastMessagePreview, !preview.isEmpty {
                        Text("\u{2022}")
                            .font(MeeshyFont.relative(10))
                            .foregroundColor(theme.textMuted)
                            .accessibilityHidden(true)
                        Text(preview)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                }
            }
            .accessibilityElement(children: .combine)

            Spacer()

            shareButton(for: conv)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func shareButton(for conv: Conversation) -> some View {
        // Colonne de contrôle en fin de ligne : les 3 états (envoyer / en cours /
        // envoyé) restent à 26pt fixe pour rester alignés avec le ProgressView
        // contraint à 26×26 — un glyphe scalable ferait sauter la largeur de la
        // colonne d'action au fil du réglage Dynamic Type (doctrine 86i, contrôle
        // à taille fixe). Tap target ≥44pt garanti par le padding de ligne.
        if sentToIds.contains(conv.id) {
            // Fixed control-sized status glyph (26pt): fills the row's trailing action
            // slot at a deliberate control size, not reading text (74i/86i doctrine).
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 26))
                .foregroundColor(MeeshyColors.success)
                .transition(.scale.combined(with: .opacity))
                .accessibilityLabel(String(localized: "share.sent", defaultValue: "Envoy\u{00e9}", bundle: .main))
        } else if sendingToId == conv.id {
            ProgressView()
                .scaleEffect(0.8)
                .frame(width: 26, height: 26)
        } else {
            Button {
                shareToConversation(conv)
            } label: {
                // Fixed control-sized action glyph (26pt): control size, not reading text.
                Image(systemName: "paperplane.circle.fill")
                    .font(.system(size: 26))
                    .foregroundColor(MeeshyColors.indigo400)
            }
            .disabled(sendingToId != nil)
            .accessibilityLabel("\(String(localized: "share.sendTo", defaultValue: "Send to", bundle: .main)) \(conv.name)")
        }
    }

    // MARK: - Helpers

    private func conversationTypeLabel(_ type: MeeshyConversation.ConversationType) -> String {
        switch type {
        case .direct: return String(localized: "conversation.type.direct", defaultValue: "Direct", bundle: .main)
        case .group: return String(localized: "conversation.type.group", defaultValue: "Groupe", bundle: .main)
        case .public: return String(localized: "conversation.type.public", defaultValue: "Publique", bundle: .main)
        case .global: return String(localized: "conversation.type.global", defaultValue: "Globale", bundle: .main)
        case .community: return String(localized: "conversation.type.community", defaultValue: "Communaut\u{00e9}", bundle: .main)
        case .channel: return String(localized: "conversation.type.channel", defaultValue: "Canal", bundle: .main)
        case .bot: return String(localized: "conversation.type.bot", defaultValue: "Bot", bundle: .main)
        case .broadcast: return String(localized: "conversation.type.broadcast", defaultValue: "Communication", bundle: .main)
        }
    }

    // MARK: - Actions

    private func loadConversations() async {
        await viewModel.loadConversations(
            seededFrom: conversationListViewModel.conversations
        )
    }

    private func shareToConversation(_ conv: Conversation) {
        if let handler = onShareToConversation {
            handler(conv, sharedContent)
            viewModel.markSent(conv.id)
            HapticFeedback.success()
            return
        }

        Task {
            guard let content = contentToSend, !content.isEmpty else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "share.error", defaultValue: "Erreur lors du partage", bundle: .main))
                return
            }
            let success = await viewModel.send(
                content,
                to: conv.id,
                forwardedMessageId: forwardedMessageId
            )
            if success {
                HapticFeedback.success()
            } else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "share.error", defaultValue: "Erreur lors du partage", bundle: .main))
            }
        }
    }

    private var contentToSend: String? {
        switch sharedContent {
        case .text(let text): return text
        case .url(let url): return url.absoluteString
        case .image: return nil
        case .message(let msg): return msg.content.isEmpty ? nil : msg.content
        case .story(let item, let authorName):
            return String(format: String(localized: "share.story.shareText", defaultValue: "🔗 Story de %1$@ : %2$@", bundle: .main), authorName, "https://meeshy.me/story/\(item.id)")
        }
    }

    private var forwardedMessageId: String? {
        if case .message(let msg) = sharedContent { return msg.id }
        return nil
    }
}
