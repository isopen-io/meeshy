import SwiftUI
import MeeshySDK
import NaturalLanguage

// MARK: - DetailTab

enum DetailTab: String, CaseIterable, Identifiable {
    case language, views, reactions, react, report, delete, forward, sentiment, transcription, meta

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .language: return "globe"
        case .views: return "eye.fill"
        case .reactions: return "face.smiling"
        case .react: return "plus.circle"
        case .report: return "exclamationmark.triangle.fill"
        case .delete: return "trash.fill"
        case .forward: return "arrowshape.turn.up.forward.fill"
        case .sentiment: return "brain.head.profile"
        case .transcription: return "waveform"
        case .meta: return "info.circle"
        }
    }

    var label: String {
        switch self {
        case .language: return "Langue"
        case .views: return "Vues"
        case .reactions: return "Reactions"
        case .react: return "Reagir"
        case .report: return "Signaler"
        case .delete: return "Supprimer"
        case .forward: return "Transferer"
        case .sentiment: return "Sentiment"
        case .transcription: return "Transcription"
        case .meta: return "Meta"
        }
    }
}

// MARK: - MessageDetailSheet

struct MessageDetailSheet: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    var initialTab: DetailTab = .language
    var canDelete: Bool = false

    var onReact: ((String) -> Void)?
    var onReport: ((String, String?) -> Void)?
    var onDelete: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    @State private var selectedTab: DetailTab

    // Reaction detail state
    @State private var reactionGroups: [ReactionGroup] = []
    @State private var isLoadingReactions = false
    @State private var reactionFilter: String = "all"

    // Forward state
    @State private var conversations: [Conversation] = []
    @State private var isLoadingConversations = true
    @State private var forwardSearchText = ""
    @State private var sendingToId: String? = nil
    @State private var sentToIds: Set<String> = []

    // Report state
    @State private var selectedReportType: ReportType? = nil
    @State private var reportReason = ""
    @State private var isSubmittingReport = false

    // Delete animation
    @State private var deleteIconScale: CGFloat = 0.5

    init(message: Message, contactColor: String, conversationId: String, initialTab: DetailTab = .language, canDelete: Bool = false, onReact: ((String) -> Void)? = nil, onReport: ((String, String?) -> Void)? = nil, onDelete: (() -> Void)? = nil) {
        self.message = message
        self.contactColor = contactColor
        self.conversationId = conversationId
        self.initialTab = initialTab
        self.canDelete = canDelete
        self.onReact = onReact
        self.onReport = onReport
        self.onDelete = onDelete
        _selectedTab = State(initialValue: initialTab)
    }

    private var availableTabs: [DetailTab] {
        DetailTab.allCases.filter { tab in
            switch tab {
            case .delete: return canDelete
            case .sentiment: return !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            case .transcription: return message.attachments.contains { $0.mimeType.hasPrefix("audio/") || $0.mimeType.hasPrefix("video/") }
            default: return true
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            sheetHeader
            tabBar
            tabContent
        }
        .background(theme.backgroundPrimary)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onChange(of: selectedTab) { _, newTab in
            if newTab == .reactions { Task { await loadReactionDetails() } }
            if newTab == .forward { Task { await loadConversations() } }
        }
        .onAppear {
            if selectedTab == .reactions { Task { await loadReactionDetails() } }
            if selectedTab == .forward { Task { await loadConversations() } }
        }
    }

    // MARK: - Sheet Header

    private var sheetHeader: some View {
        let accent = Color(hex: message.senderColor ?? contactColor)
        let initials = senderInitials(message.senderName)

        return HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(accent.opacity(0.2))
                    .frame(width: 40, height: 40)
                Text(initials)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(accent)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(message.senderName ?? "Inconnu")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Text(formatDateFR(message.createdAt))
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 4)

        // Message preview
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(availableTabs) { tab in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedTab = tab
                        }
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: tab.icon)
                                .font(.system(size: 12, weight: .medium))
                            Text(tab.label)
                                .font(.system(size: 12, weight: .medium))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(selectedTab == tab
                                      ? Color(hex: contactColor).opacity(0.15)
                                      : Color.clear)
                        )
                        .foregroundColor(selectedTab == tab
                                         ? Color(hex: contactColor)
                                         : theme.textMuted)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Tab Content

    private var tabContent: some View {
        ScrollView(showsIndicators: false) {
            Group {
                switch selectedTab {
                case .language:
                    languageTabContent
                case .views:
                    viewsTabContent
                case .reactions:
                    reactionsTabContent
                case .react:
                    reactTabContent
                case .report:
                    reportTabContent
                case .delete:
                    deleteTabContent
                case .forward:
                    forwardTabContent
                case .sentiment:
                    sentimentTabContent
                case .transcription:
                    transcriptionTabContent
                case .meta:
                    metaTabContent
                }
            }
            .id(selectedTab)
            .transition(.opacity)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .animation(.easeInOut(duration: 0.2), value: selectedTab)
    }

    // MARK: - Language Tab Content

    private var languageTabContent: some View {
        let originalLang = message.originalLanguage
        let languages: [(code: String, flag: String, name: String)] = [
            ("fr", "\u{1F1EB}\u{1F1F7}", "Fran\u{00e7}ais"),
            ("en", "\u{1F1EC}\u{1F1E7}", "English"),
            ("es", "\u{1F1EA}\u{1F1F8}", "Espa\u{00f1}ol"),
            ("de", "\u{1F1E9}\u{1F1EA}", "Deutsch"),
            ("ar", "\u{1F1F8}\u{1F1E6}", "\u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629}"),
            ("zh", "\u{1F1E8}\u{1F1F3}", "\u{4E2D}\u{6587}"),
            ("pt", "\u{1F1F5}\u{1F1F9}", "Portugu\u{00EA}s"),
            ("it", "\u{1F1EE}\u{1F1F9}", "Italiano"),
            ("ja", "\u{1F1EF}\u{1F1F5}", "\u{65E5}\u{672C}\u{8A9E}"),
            ("ko", "\u{1F1F0}\u{1F1F7}", "\u{D55C}\u{AD6D}\u{C5B4}")
        ]

        let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "globe")
                    .font(.system(size: 12, weight: .medium))
                Text("Langue originale : \(originalLang.uppercased())")
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(Color(hex: contactColor))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color(hex: contactColor).opacity(0.12)))

            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(0..<languages.count, id: \.self) { index in
                    let lang = languages[index]
                    let isOriginal = lang.code == originalLang

                    Button {
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 6) {
                            Text(lang.flag)
                                .font(.system(size: 18))
                            Text(lang.name)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.03))
                        )
                        .opacity(isOriginal ? 0.4 : 1.0)
                    }
                    .disabled(isOriginal)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Views Tab Content

    private var viewsTabContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                let initials = senderInitials(message.senderName)
                let color = Color(hex: message.senderColor ?? contactColor)

                ZStack {
                    Circle()
                        .fill(color.opacity(0.2))
                        .frame(width: 36, height: 36)
                    Text(initials)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(color)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(message.senderName ?? "Inconnu")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text(formatDateFR(message.createdAt))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()
            }

            Divider()

            VStack(alignment: .leading, spacing: 12) {
                Text("Statut de livraison")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                deliveryStatusRow(
                    icon: "checkmark",
                    label: "Envoye",
                    timestamp: formatTimeFR(message.createdAt),
                    isReached: deliveryStatusLevel >= 1
                )

                deliveryStatusRow(
                    icon: "checkmark.circle",
                    label: "Distribue",
                    timestamp: nil,
                    isReached: deliveryStatusLevel >= 2
                )

                deliveryStatusRow(
                    icon: "eye",
                    label: "Lu",
                    timestamp: nil,
                    isReached: deliveryStatusLevel >= 3
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Reactions Tab Content

    @ViewBuilder
    private var reactionsTabContent: some View {
        VStack(spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    reactionFilterCapsule(
                        label: "Toutes",
                        count: reactionGroups.reduce(0) { $0 + $1.count },
                        isSelected: reactionFilter == "all"
                    ) {
                        reactionFilter = "all"
                    }
                    ForEach(reactionGroups) { group in
                        reactionFilterCapsule(
                            label: group.emoji,
                            count: group.count,
                            isSelected: reactionFilter == group.emoji
                        ) {
                            reactionFilter = group.emoji
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            if isLoadingReactions {
                ProgressView()
                    .tint(Color(hex: contactColor))
                    .padding(.vertical, 20)
            } else if filteredReactionUsers.isEmpty {
                emptyReactionsView
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(filteredReactionUsers) { item in
                        reactionUserRow(item)
                    }
                }
            }
        }
    }

    private var filteredReactionUsers: [ReactionUserItem] {
        var items: [ReactionUserItem] = []
        for group in reactionGroups {
            if reactionFilter == "all" || reactionFilter == group.emoji {
                for user in group.users {
                    items.append(ReactionUserItem(
                        userId: user.userId,
                        username: user.username,
                        avatar: user.avatar,
                        emoji: group.emoji,
                        createdAt: user.createdAt
                    ))
                }
            }
        }
        return items.sorted { $0.createdAt > $1.createdAt }
    }

    private func reactionFilterCapsule(label: String, count: Int, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { action() }
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Text(label)
                    .font(.system(size: 14, weight: .medium))
                Text("\(count)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(isSelected ? Color(hex: contactColor) : theme.textMuted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(isSelected
                          ? Color(hex: contactColor).opacity(0.15)
                          : theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
            )
            .foregroundColor(isSelected ? Color(hex: contactColor) : theme.textSecondary)
        }
    }

    private func reactionUserRow(_ item: ReactionUserItem) -> some View {
        let accent = Color(hex: contactColor)
        let initials = senderInitials(item.username)

        return HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(accent.opacity(0.15))
                    .frame(width: 34, height: 34)
                Text(initials)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(accent)
            }

            Text(item.username)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            if reactionFilter == "all" {
                Text(item.emoji)
                    .font(.system(size: 18))
            }

            Spacer()

            Text(relativeDate(item.createdAt))
                .font(.system(size: 11))
                .foregroundColor(theme.textMuted)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
    }

    private var emptyReactionsView: some View {
        VStack(spacing: 8) {
            Image(systemName: "face.smiling")
                .font(.system(size: 32))
                .foregroundColor(theme.textMuted.opacity(0.5))
            Text("Aucune reaction")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(.vertical, 30)
        .frame(maxWidth: .infinity)
    }

    // MARK: - React Tab Content

    private var reactTabContent: some View {
        let quickEmojis = ["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F64F}", "\u{1F525}", "\u{1F389}"]

        return VStack(spacing: 16) {
            VStack(spacing: 8) {
                Text("Reactions rapides")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 12) {
                    ForEach(EmojiUsageTracker.sortedEmojis(from: quickEmojis).prefix(5), id: \.self) { emoji in
                        Button {
                            EmojiUsageTracker.recordUsage(emoji: emoji)
                            onReact?(emoji)
                            dismiss()
                        } label: {
                            Text(emoji)
                                .font(.system(size: 36))
                        }
                        .buttonStyle(EmojiScaleButtonStyle())
                    }
                }
                .padding(.vertical, 4)
            }

            Divider()

            EmojiPickerView(recentEmojis: quickEmojis) { emoji in
                onReact?(emoji)
                dismiss()
            }
            .frame(height: 300)
        }
    }

    // MARK: - Delete Tab Content

    private var deleteTabContent: some View {
        VStack(spacing: 20) {
            Spacer().frame(height: 20)

            Image(systemName: "trash.fill")
                .font(.system(size: 48))
                .foregroundColor(.red)
                .scaleEffect(deleteIconScale)
                .onAppear {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                        deleteIconScale = 1.0
                    }
                }

            Text("Supprimer ce message ?")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text("Cette action est irreversible")
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)

            VStack(spacing: 10) {
                Button {
                    HapticFeedback.medium()
                    onDelete?()
                    dismiss()
                } label: {
                    Text("Supprimer")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.red)
                        )
                }

                Button {
                    dismiss()
                } label: {
                    Text("Annuler")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                        )
                }
            }
            .padding(.top, 8)

            Spacer().frame(height: 20)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Report Tab Content

    private var reportTabContent: some View {
        VStack(spacing: 16) {
            Text("Pourquoi signalez-vous ce message ?")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            ForEach(ReportType.allCases) { type in
                reportTypeRow(type)
            }

            if selectedReportType != nil {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Details (optionnel)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.textSecondary)

                    TextField("Decrivez le probleme...", text: $reportReason, axis: .vertical)
                        .font(.system(size: 14))
                        .lineLimit(3...6)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(theme.inputBackground)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(theme.textMuted.opacity(0.2), lineWidth: 1)
                                )
                        )
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            if let reportType = selectedReportType {
                Button {
                    isSubmittingReport = true
                    HapticFeedback.medium()
                    onReport?(reportType.rawValue, reportReason.isEmpty ? nil : reportReason)
                    dismiss()
                } label: {
                    if isSubmittingReport {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Envoyer le signalement")
                            .font(.system(size: 15, weight: .semibold))
                    }
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(hex: contactColor))
                )
                .disabled(isSubmittingReport)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: selectedReportType)
    }

    private func reportTypeRow(_ type: ReportType) -> some View {
        let isSelected = selectedReportType == type
        let accent = Color(hex: contactColor)

        return Button {
            HapticFeedback.light()
            selectedReportType = type
        } label: {
            HStack(spacing: 12) {
                Image(systemName: type.icon)
                    .font(.system(size: 16))
                    .foregroundColor(isSelected ? accent : theme.textSecondary)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(type.label)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                    Text(type.description)
                        .font(.system(size: 12))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(accent)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? accent.opacity(0.08) : theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isSelected ? accent.opacity(0.3) : theme.textMuted.opacity(0.1), lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - Forward Tab Content

    private var forwardTabContent: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundColor(theme.textMuted)

                TextField("Rechercher une conversation", text: $forwardSearchText)
                    .font(.system(size: 14))
                    .autocorrectionDisabled()

                if !forwardSearchText.isEmpty {
                    Button {
                        forwardSearchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(theme.textMuted)
                    }
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
            } else if filteredForwardConversations.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 32))
                        .foregroundColor(theme.textMuted)
                    Text("Aucune conversation")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.vertical, 20)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(filteredForwardConversations) { conv in
                        forwardConversationRow(conv)
                    }
                }
            }
        }
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
                mode: .conversationList,
                accentColor: conv.accentColor,
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

            forwardSendButton(for: conv)
        }
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private func forwardSendButton(for conv: Conversation) -> some View {
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
                    .foregroundColor(Color(hex: contactColor))
            }
            .disabled(sendingToId != nil)
        }
    }

    // MARK: - Sentiment Tab Content

    private var sentimentTabContent: some View {
        let score = analyzeSentiment(message.content)

        return VStack(spacing: 16) {
            Text(sentimentEmoji(score))
                .font(.system(size: 56))

            Text(sentimentLabel(score))
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(
                            LinearGradient(
                                colors: [.red, .orange, .yellow, .green],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(height: 12)

                    let normalized = (score + 1) / 2
                    let position = normalized * geo.size.width

                    Circle()
                        .fill(.white)
                        .frame(width: 18, height: 18)
                        .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        .offset(x: max(0, min(position - 9, geo.size.width - 18)))
                }
            }
            .frame(height: 18)
            .padding(.horizontal, 20)

            Text(String(format: "Score : %.2f", score))
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    // MARK: - Transcription Tab Content

    private var transcriptionTabContent: some View {
        let mediaAttachments = message.attachments.filter {
            $0.mimeType.hasPrefix("audio/") || $0.mimeType.hasPrefix("video/")
        }

        return VStack(alignment: .leading, spacing: 12) {
            ForEach(mediaAttachments) { attachment in
                HStack(spacing: 10) {
                    Image(systemName: attachment.mimeType.hasPrefix("audio/") ? "waveform" : "video")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(hex: contactColor))
                        .frame(width: 20)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(attachment.originalName.isEmpty ? attachment.fileName : attachment.originalName)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)

                        if let duration = attachment.duration {
                            Text(formatDuration(duration))
                                .font(.system(size: 11))
                                .foregroundColor(theme.textMuted)
                        }
                    }

                    Spacer()
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.03))
                )
            }

            HStack {
                Spacer()
                VStack(spacing: 6) {
                    Image(systemName: "text.below.photo")
                        .font(.system(size: 24))
                        .foregroundColor(theme.textMuted.opacity(0.5))
                    Text("Transcription non disponible")
                        .font(.system(size: 13))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.vertical, 20)
                Spacer()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Meta Tab Content

    private var metaTabContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            metaRow(key: "ID", value: String(message.id.prefix(12)))
            metaRow(key: "Type", value: message.messageType.rawValue)
            metaRow(key: "Source", value: message.messageSource.rawValue)
            metaRow(key: "Langue", value: message.originalLanguage.uppercased())
            metaRow(key: "Cree le", value: formatDateTimeFR(message.createdAt))
            metaRow(key: "Modifie le", value: formatDateTimeFR(message.updatedAt))

            metaRow(
                key: "Chiffrement",
                value: message.isEncrypted
                    ? "Oui" + (message.encryptionMode.map { " (\($0))" } ?? "")
                    : "Non"
            )

            if message.isEdited {
                metaRow(key: "Etat", value: "Modifie", valueColor: .yellow)
            }
            if message.isDeleted {
                metaRow(key: "Etat", value: "Supprime", valueColor: .red)
            }

            if !message.attachments.isEmpty {
                let types = Set(message.attachments.map {
                    $0.mimeType.components(separatedBy: "/").first ?? "file"
                })
                metaRow(
                    key: "Pieces jointes",
                    value: "\(message.attachments.count) (\(types.sorted().joined(separator: ", ")))"
                )
            }

            if let forward = message.forwardedFrom {
                Divider()
                Text("Transfere de")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .textCase(.uppercase)
                metaRow(key: "Auteur", value: forward.senderName)
                if let convo = forward.conversationName {
                    metaRow(key: "Conversation", value: convo)
                }
            }

            if let reply = message.replyTo {
                Divider()
                Text("Reponse a")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .textCase(.uppercase)
                metaRow(key: "Auteur", value: reply.authorName)
                metaRow(key: "Apercu", value: reply.previewText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Network Actions

    private func loadReactionDetails() async {
        guard !isLoadingReactions || reactionGroups.isEmpty else { return }
        isLoadingReactions = true
        defer { isLoadingReactions = false }
        do {
            let response: APIResponse<ReactionSyncResponse> = try await APIClient.shared.request(
                endpoint: "/reactions/\(message.id)"
            )
            if response.success {
                reactionGroups = response.data.reactions
            }
        } catch {
            reactionGroups = []
        }
    }

    private func loadConversations() async {
        guard isLoadingConversations else { return }
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
            conversations = []
        }
        isLoadingConversations = false
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
                HapticFeedback.error()
            }
            sendingToId = nil
        }
    }

    // MARK: - Helpers

    private func deliveryStatusRow(icon: String, label: String, timestamp: String?, isReached: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(isReached ? Color(hex: contactColor) : theme.textMuted.opacity(0.5))
                .frame(width: 20)

            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(isReached ? theme.textPrimary : theme.textMuted.opacity(0.5))

            if let timestamp {
                Spacer()
                Text(timestamp)
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()
        }
    }

    private var deliveryStatusLevel: Int {
        switch message.deliveryStatus {
        case .failed: return -1
        case .sending: return 0
        case .sent: return 1
        case .delivered: return 2
        case .read: return 3
        }
    }

    private func metaRow(key: String, value: String, valueColor: Color? = nil) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(key)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textMuted)
                .frame(width: 100, alignment: .trailing)

            Text(value)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(valueColor ?? theme.textPrimary)
                .lineLimit(2)

            Spacer()
        }
    }

    private func senderInitials(_ name: String?) -> String {
        guard let name = name, !name.isEmpty else { return "?" }
        let words = name.components(separatedBy: " ")
        if words.count >= 2 {
            return String(words[0].prefix(1) + words[1].prefix(1)).uppercased()
        }
        return String(name.prefix(2)).uppercased()
    }

    private func formatDateFR(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    private func formatTimeFR(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    private func formatDateTimeFR(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "dd/MM/yyyy HH:mm"
        return formatter.string(from: date)
    }

    private func formatDuration(_ seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func formatFileSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        let kb = Double(bytes) / 1024
        if kb < 1024 { return String(format: "%.1f KB", kb) }
        let mb = kb / 1024
        return String(format: "%.1f MB", mb)
    }

    private func analyzeSentiment(_ text: String) -> Double {
        let tagger = NLTagger(tagSchemes: [.sentimentScore])
        tagger.string = text
        let (tag, _) = tagger.tag(at: text.startIndex, unit: .paragraph, scheme: .sentimentScore)
        return Double(tag?.rawValue ?? "0") ?? 0
    }

    private func sentimentEmoji(_ score: Double) -> String {
        if score < -0.6 { return "\u{1F621}" }
        if score < -0.2 { return "\u{1F614}" }
        if score < 0.2 { return "\u{1F610}" }
        if score < 0.6 { return "\u{1F642}" }
        return "\u{1F604}"
    }

    private func sentimentLabel(_ score: Double) -> String {
        if score < -0.6 { return "Tres negatif" }
        if score < -0.2 { return "Negatif" }
        if score < 0.2 { return "Neutre" }
        if score < 0.6 { return "Positif" }
        return "Tres positif"
    }

    private func relativeDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Reaction User Item

private struct ReactionUserItem: Identifiable {
    let userId: String
    let username: String
    let avatar: String?
    let emoji: String
    let createdAt: Date

    var id: String { "\(userId)-\(emoji)" }
}

// EmojiUsageTracker is defined in MessageOverlayMenu.swift (shared across app)
