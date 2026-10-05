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
    /// Lien tracké `meeshy.me/l/<token>` d'une story, résolu au montage (cas
    /// `.story` uniquement). Tant qu'il est `nil`, le partage retombe sur l'URL
    /// directe de la story — le partage n'attend jamais après le lien tracké.
    @State private var resolvedStoryLink: String?
    // The view exposes thin computed accessors that read from `viewModel`
    // so the existing body code that referenced `conversations` /
    // `isLoading` / `sentToIds` / `sendingToId` stays compact. These
    // properties intentionally aren't @State anymore — the ViewModel
    // owns the truth (P4.1 MVVM extraction).
    private var conversations: [Conversation] { viewModel.conversations }
    private var isLoading: Bool { viewModel.isLoading }
    private var sentToIds: Set<String> { viewModel.sentToIds }
    private var sendingToId: String? { viewModel.sendingToId }

    /// B1 (Prisme Linguistique) — prisme du lecteur, même autorité que
    /// `ConversationListView` (`AuthManager.currentUser?.preferredContentLanguages`).
    private var preferredContentLanguages: [String] {
        AuthManager.shared.currentUser?.preferredContentLanguages ?? []
    }

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
        let visible = filteredConversations   // filtre actif + recherche, UNE fois par rendu
        NavigationStack {
            VStack(spacing: 0) {
                contentPreviewBanner

                Divider()
                    .overlay(theme.textMuted.opacity(MeeshyOpacity.light))

                searchField

                if isLoading {
                    loadingState
                } else if visible.isEmpty {
                    emptyState
                } else {
                    conversationList(visible)
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
            // Story : minte le lien tracké /l/<token> à partager (le picker choisit
            // « à qui envoyer » ; le lien remplace l'URL directe brute). Résolu APRÈS
            // la liste pour ne pas retarder son affichage.
            if case .story(let item, _) = sharedContent {
                resolvedStoryLink = await viewModel.resolveStoryShareLink(storyId: item.id)
            }
        }
        .withStatusBubble()
    }

    // MARK: - Content Preview Banner

    private var contentPreviewBanner: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(MeeshyColors.indigo400)
                .frame(width: 3, height: 32)

            contentIcon
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(contentLabel)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo400)
                    .lineLimit(1)

                Text(contentPreview)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
        .background(isDark ? Color.white.opacity(MeeshyOpacity.faint) : Color.black.opacity(0.02))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var contentIcon: some View {
        switch sharedContent {
        case .text:
            Image(systemName: "text.bubble.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.md))
                .foregroundColor(MeeshyColors.indigo400)
        case .url:
            Image(systemName: "link.circle.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.md))
                .foregroundColor(MeeshyColors.indigo600)
        case .image(let image):
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xxs))
        case .message:
            Image(systemName: "arrowshape.turn.up.forward.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.md))
                .foregroundColor(MeeshyColors.warning)
        case .story:
            Image(systemName: "play.rectangle.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.md))
                .foregroundColor(MeeshyColors.indigo500)
        }
    }

    private var contentLabel: String {
        switch sharedContent {
        case .text: return String(localized: "share.content.text", defaultValue: "Texte", bundle: .main)
        case .url: return String(localized: "share.content.url", defaultValue: "Lien", bundle: .main)
        case .image: return String(localized: "share.content.image", defaultValue: "Image", bundle: .main)
        case .message: return String(localized: "share.content.message", defaultValue: "Message transféré", bundle: .main)
        case .story: return String(localized: "share.content.story", defaultValue: "Story partagée", bundle: .main)
        }
    }

    private var contentPreview: String {
        switch sharedContent {
        case .text(let text):
            return String(text.prefix(120))
        case .url(let url):
            return url.absoluteString
        case .image:
            return String(localized: "share.preview.image", defaultValue: "Photo à partager", bundle: .main)
        case .message(let msg):
            return msg.content.isEmpty ? String(localized: "share.preview.media", defaultValue: "[Média]", bundle: .main) : String(msg.content.prefix(120))
        case .story(let item, let authorName):
            if let content = item.content, !content.isEmpty {
                return String(content.prefix(120))
            }
            return String(format: String(localized: "share.preview.story", defaultValue: "Story de %@", bundle: .main), authorName)
        }
    }

    // MARK: - Search Field

    private var searchField: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(String(localized: "share.search.placeholder", defaultValue: "Rechercher une conversation...", bundle: .main), text: $searchText)
                .font(MeeshyFont.relative(MeeshyFont.bodySize))
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.search)

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.md))
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "common.clearSearch", defaultValue: "Effacer la recherche", bundle: .main))
            }
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.smPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(isDark ? Color.white.opacity(MeeshyOpacity.subtle) : Color.black.opacity(MeeshyOpacity.faint))
        )
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.sm)
    }

    // MARK: - States

    private var loadingState: some View {
        VStack {
            Spacer()
            ProgressView()
                .tint(MeeshyColors.indigo400)
                .accessibilityLabel(String(localized: "share.loading", defaultValue: "Chargement des conversations…", bundle: .main))
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

    private func conversationList(_ visible: [Conversation]) -> some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(visible) { conv in
                    shareRow(for: conv)
                }
            }
        }
    }

    private func shareRow(for conv: Conversation) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: conv.displayName,
                context: .conversationList,
                accentColor: conv.accentColor,
                avatarURL: conv.avatar,
                moodEmoji: conv.participantUserId.flatMap { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                onMoodTap: conv.participantUserId.flatMap { statusViewModel.moodTapHandler(for: $0) }
            )

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                ConversationTitleLabel(
                    name: conv.displayName,
                    favoriteEmoji: conv.userState.reaction,
                    font: MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium),
                    color: theme.textPrimary
                )

                HStack(spacing: MeeshySpacing.xs) {
                    Text(conv.type.displayName)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundColor(theme.textMuted)

                    // B1 (Prisme Linguistique) — même résolution que la ligne
                    // de liste : le sélecteur de destination montre les MÊMES
                    // conversations, et une même ligne ne peut pas dire deux
                    // textes selon l'écran qui la rend.
                    if let preview = conv.resolvedLastMessagePreview(
                        preferredLanguages: preferredContentLanguages
                    ), !preview.isEmpty {
                        Text("\u{2022}")
                            .font(MeeshyFont.relative(MeeshyFont.captionSize))
                            .foregroundColor(theme.textMuted)
                            .accessibilityHidden(true)
                        Text(preview)
                            .font(MeeshyFont.relative(MeeshyFont.smallSize))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                }
            }
            .accessibilityElement(children: .combine)

            Spacer()

            shareButton(for: conv)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.smPlus)
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
                .font(.system(size: MeeshyIconSize.xxxl))
                .foregroundColor(MeeshyColors.success)
                .transition(.scale.combined(with: .opacity))
                .accessibilityLabel(String(localized: "share.sent", defaultValue: "Envoyé", bundle: .main))
        } else if sendingToId == conv.id {
            ProgressView()
                .scaleEffect(0.8)
                .frame(width: 26, height: 26)
                .accessibilityLabel(String(localized: "share.sending", defaultValue: "Envoi en cours…", bundle: .main))
        } else {
            Button {
                shareToConversation(conv)
            } label: {
                // Fixed control-sized action glyph (26pt): control size, not reading text.
                Image(systemName: "paperplane.circle.fill")
                    .font(.system(size: MeeshyIconSize.xxxl))
                    .foregroundColor(MeeshyColors.indigo400)
            }
            .disabled(sendingToId != nil)
            .accessibilityLabel("\(String(localized: "share.sendTo", defaultValue: "Envoyer à", bundle: .main)) \(conv.displayName)")
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
            noteSharedStory()
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
                noteSharedStory()
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
            // Lien tracké /l/<token> s'il est prêt, sinon URL directe de la story
            // (fallback : le partage ne bloque jamais sur la résolution du lien).
            let link = resolvedStoryLink ?? "https://meeshy.me/story/\(item.id)"
            return String(format: String(localized: "share.story.shareText", defaultValue: "🔗 Story de %1$@ : %2$@", bundle: .main), authorName, link)
        }
    }

    /// Une story ENVOYÉE allume l'anneau du cœur sur « Envoyer » dans son lecteur
    /// (directive porteur 2026-10-01) — la passerelle ne sert pas ce geste.
    private func noteSharedStory() {
        guard case .story(let item, _) = sharedContent else { return }
        StoryViewerParticipationStore.shared.note(.sent, storyId: item.id)
    }

    private var forwardedMessageId: String? {
        if case .message(let msg) = sharedContent { return msg.id }
        return nil
    }
}
