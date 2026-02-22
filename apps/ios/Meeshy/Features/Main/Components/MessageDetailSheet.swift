import SwiftUI
import MeeshySDK
import NaturalLanguage

// MARK: - DetailTab

enum DetailTab: String, CaseIterable, Identifiable {
    case language, views, reactions, react, report, delete, forward, sentiment, transcription

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
        }
    }
}

// MARK: - Views Sub-Filter

private enum ViewsFilter: String, CaseIterable, Identifiable {
    case sent, delivered, read, listened, watched

    var id: String { rawValue }

    var label: String {
        switch self {
        case .sent: return "Envoye"
        case .delivered: return "Distribue"
        case .read: return "Lu"
        case .listened: return "Ecoute"
        case .watched: return "Vu"
        }
    }

    var icon: String {
        switch self {
        case .sent: return "paperplane.fill"
        case .delivered: return "checkmark.circle.fill"
        case .read: return "eye.fill"
        case .listened: return "headphones"
        case .watched: return "play.rectangle.fill"
        }
    }
}

// MARK: - MessageAction (shared for overlay integration)

struct MessageAction: Identifiable {
    let id: String
    let icon: String
    let label: String
    let color: String
    let handler: () -> Void
}

// MARK: - MessageDetailSheet

struct MessageDetailSheet: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    var initialTab: DetailTab = .views
    var canDelete: Bool = false
    var actions: [MessageAction]? = nil
    var onDismissAction: (() -> Void)? = nil

    var onReact: ((String) -> Void)?
    var onReport: ((String, String?) -> Void)?
    var onDelete: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var envDismiss
    @State private var selectedTab: DetailTab
    @State private var actionGridAppeared = false

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

    // Read status state
    @State private var readStatusData: ReadStatusData? = nil
    @State private var isLoadingReadStatus = false
    @State private var attachmentStatuses: [String: [AttachmentStatusUser]] = [:]
    @State private var isLoadingAttachmentStatuses = false

    // Views sub-filter
    @State private var viewsFilter: ViewsFilter = .sent

    init(message: Message, contactColor: String, conversationId: String, initialTab: DetailTab = .views, canDelete: Bool = false, actions: [MessageAction]? = nil, onDismissAction: (() -> Void)? = nil, onReact: ((String) -> Void)? = nil, onReport: ((String, String?) -> Void)? = nil, onDelete: (() -> Void)? = nil) {
        self.message = message
        self.contactColor = contactColor
        self.conversationId = conversationId
        self.initialTab = initialTab
        self.canDelete = canDelete
        self.actions = actions
        self.onDismissAction = onDismissAction
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

    private var availableViewsFilters: [ViewsFilter] {
        var filters: [ViewsFilter] = [.sent, .delivered, .read]
        let hasAudio = message.attachments.contains { $0.mimeType.hasPrefix("audio/") }
        let hasVideo = message.attachments.contains { $0.mimeType.hasPrefix("video/") }
        if hasAudio { filters.append(.listened) }
        if hasVideo { filters.append(.watched) }
        return filters
    }

    private func performDismiss() {
        if let onDismissAction { onDismissAction() }
        else { envDismiss() }
    }

    var body: some View {
        VStack(spacing: 0) {
            if let actions, !actions.isEmpty {
                actionGridSection(actions)
                    .padding(.top, 4)
            }
            tabBar
            tabContent
        }
        .background(actions != nil ? Color.clear : theme.backgroundPrimary)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(actions != nil ? .hidden : .visible)
        .onChange(of: selectedTab) { _, newTab in
            if newTab == .reactions { Task { await loadReactionDetails() } }
            if newTab == .forward { Task { await loadConversations() } }
            if newTab == .views { Task { await loadReadStatus(); await loadAttachmentStatuses() } }
        }
        .onAppear {
            if selectedTab == .reactions { Task { await loadReactionDetails() } }
            if selectedTab == .forward { Task { await loadConversations() } }
            if selectedTab == .views { Task { await loadReadStatus(); await loadAttachmentStatuses() } }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7).delay(0.1)) {
                actionGridAppeared = true
            }
        }
    }

    // MARK: - Action Grid

    private func actionGridSection(_ actions: [MessageAction]) -> some View {
        let columns = [
            GridItem(.flexible(), spacing: 6),
            GridItem(.flexible(), spacing: 6),
            GridItem(.flexible(), spacing: 6),
            GridItem(.flexible(), spacing: 6)
        ]

        return LazyVGrid(columns: columns, spacing: 8) {
            ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
                actionGridButton(action, index: index)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func actionGridButton(_ action: MessageAction, index: Int) -> some View {
        let accent = Color(hex: action.color)

        return Button {
            HapticFeedback.medium()
            action.handler()
        } label: {
            VStack(spacing: 5) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [accent.opacity(theme.mode.isDark ? 0.25 : 0.15), accent.opacity(theme.mode.isDark ? 0.12 : 0.06)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .overlay(
                            Circle()
                                .stroke(accent.opacity(0.2), lineWidth: 0.5)
                        )
                        .frame(width: 42, height: 42)

                    Image(systemName: action.icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(accent)
                }

                Text(action.label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .opacity(actionGridAppeared ? 1 : 0)
            .offset(y: actionGridAppeared ? 0 : 12)
            .animation(
                .spring(response: 0.4, dampingFraction: 0.7).delay(Double(index) * 0.04),
                value: actionGridAppeared
            )
        }
        .buttonStyle(DetailActionButtonStyle())
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(availableTabs) { tab in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedTab = tab
                        }
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: tab.icon)
                                .font(.system(size: 11, weight: .medium))
                            Text(tab.label)
                                .font(.system(size: 11, weight: .medium))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(selectedTab == tab
                                      ? Color(hex: contactColor).opacity(0.18)
                                      : theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                        )
                        .overlay(
                            Capsule()
                                .stroke(selectedTab == tab ? Color(hex: contactColor).opacity(0.3) : Color.clear, lineWidth: 0.5)
                        )
                        .foregroundColor(selectedTab == tab
                                         ? Color(hex: contactColor)
                                         : theme.textMuted)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
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
                }
            }
            .id(selectedTab)
            .transition(.opacity)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
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

    // MARK: - Views Tab Content (Premium Redesign)

    private var viewsTabContent: some View {
        let accent = Color(hex: contactColor)

        return VStack(alignment: .leading, spacing: 0) {
            // Sub-filter capsules
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(availableViewsFilters) { filter in
                        viewsFilterCapsule(filter, accent: accent)
                    }
                }
            }
            .padding(.bottom, 14)

            // Content for selected filter
            Group {
                switch viewsFilter {
                case .sent:
                    viewsSentContent(accent: accent)
                case .delivered:
                    viewsDeliveredContent(accent: accent)
                case .read:
                    viewsReadContent(accent: accent)
                case .listened:
                    viewsListenedContent(accent: accent)
                case .watched:
                    viewsWatchedContent(accent: accent)
                }
            }
            .id(viewsFilter)
            .transition(.asymmetric(
                insertion: .opacity.combined(with: .move(edge: .trailing)),
                removal: .opacity.combined(with: .move(edge: .leading))
            ))
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: viewsFilter)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func viewsFilterCapsule(_ filter: ViewsFilter, accent: Color) -> some View {
        let isSelected = viewsFilter == filter
        var count: Int? = nil

        switch filter {
        case .delivered: count = readStatusData?.receivedCount
        case .read: count = readStatusData?.readCount
        case .listened:
            let audioIds = message.attachments.filter { $0.mimeType.hasPrefix("audio/") }.map(\.id)
            count = audioIds.reduce(0) { $0 + (attachmentStatuses[$1]?.count ?? 0) }
        case .watched:
            let videoIds = message.attachments.filter { $0.mimeType.hasPrefix("video/") }.map(\.id)
            count = videoIds.reduce(0) { $0 + (attachmentStatuses[$1]?.count ?? 0) }
        default: break
        }

        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                viewsFilter = filter
            }
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: filter.icon)
                    .font(.system(size: 11, weight: .medium))
                Text(filter.label)
                    .font(.system(size: 12, weight: .medium))
                if let count {
                    Text("\(count)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(isSelected ? accent : theme.textMuted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(
                            Capsule()
                                .fill(isSelected ? accent.opacity(0.15) : theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                        )
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(isSelected ? accent.opacity(0.15) : theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
            )
            .overlay(
                Capsule()
                    .stroke(isSelected ? accent.opacity(0.35) : Color.clear, lineWidth: 0.5)
            )
            .foregroundColor(isSelected ? accent : theme.textMuted)
        }
    }

    // MARK: - Envoyé (Sent) — Message Info + Author

    private func viewsSentContent(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            // Author card with avatar
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: message.senderName ?? "?",
                    mode: .conversationHeader,
                    accentColor: message.senderColor ?? contactColor,
                    avatarURL: message.senderAvatarURL
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(message.senderName ?? "Inconnu")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(formatDateFR(message.createdAt))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                // Delivery badge
                deliveryBadge(accent: accent)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(accent.opacity(0.1), lineWidth: 0.5)
                    )
            )

            // Message meta info (merged from old Meta tab)
            VStack(spacing: 0) {
                metaInfoRow(icon: "number", label: "ID", value: String(message.id.prefix(12)), accent: accent)
                metaDivider
                metaInfoRow(icon: "bubble.left.fill", label: "Type", value: message.messageType.rawValue, accent: accent)
                metaDivider
                metaInfoRow(icon: "antenna.radiowaves.left.and.right", label: "Source", value: message.messageSource.rawValue, accent: accent)
                metaDivider
                metaInfoRow(icon: "globe", label: "Langue", value: message.originalLanguage.uppercased(), accent: accent)
                metaDivider
                metaInfoRow(
                    icon: "lock.shield.fill",
                    label: "Chiffrement",
                    value: message.isEncrypted
                        ? "Oui" + (message.encryptionMode.map { " (\($0))" } ?? "")
                        : "Non",
                    accent: accent,
                    valueColor: message.isEncrypted ? .green : nil
                )

                if message.isEdited {
                    metaDivider
                    metaInfoRow(icon: "pencil", label: "Modifie", value: formatDateTimeFR(message.updatedAt), accent: accent, valueColor: .yellow)
                }

                if !message.attachments.isEmpty {
                    metaDivider
                    let types = Set(message.attachments.map {
                        $0.mimeType.components(separatedBy: "/").first ?? "file"
                    })
                    metaInfoRow(
                        icon: "paperclip",
                        label: "Pieces jointes",
                        value: "\(message.attachments.count) (\(types.sorted().joined(separator: ", ")))",
                        accent: accent
                    )
                }

                if let forward = message.forwardedFrom {
                    metaDivider
                    metaInfoRow(icon: "arrowshape.turn.up.forward.fill", label: "Transfere de", value: forward.senderName, accent: accent)
                    if let convo = forward.conversationName {
                        metaDivider
                        metaInfoRow(icon: "bubble.left.and.bubble.right", label: "Conversation", value: convo, accent: accent)
                    }
                }

                if let reply = message.replyTo {
                    metaDivider
                    metaInfoRow(icon: "arrowshape.turn.up.left.fill", label: "Reponse a", value: reply.authorName, accent: accent)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func deliveryBadge(accent: Color) -> some View {
        let level = deliveryStatusLevel
        let icon: String
        let label: String
        let color: Color

        switch level {
        case 3:
            icon = "eye.fill"
            label = "Lu"
            color = .green
        case 2:
            icon = "checkmark.circle.fill"
            label = "Distribue"
            color = accent
        case 1:
            icon = "checkmark"
            label = "Envoye"
            color = accent.opacity(0.7)
        case 0:
            icon = "arrow.up.circle"
            label = "Envoi..."
            color = theme.textMuted
        default:
            icon = "exclamationmark.circle"
            label = "Echec"
            color = .red
        }

        return HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
            Text(label)
                .font(.system(size: 10, weight: .semibold))
        }
        .foregroundColor(color)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(color.opacity(0.12))
        )
    }

    private func metaInfoRow(icon: String, label: String, value: String, accent: Color, valueColor: Color? = nil) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(accent.opacity(0.6))
                .frame(width: 16)

            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textMuted)
                .frame(width: 85, alignment: .leading)

            Text(value)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(valueColor ?? theme.textPrimary)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
    }

    private var metaDivider: some View {
        Rectangle()
            .fill(theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
            .frame(height: 0.5)
            .padding(.leading, 38)
    }

    // MARK: - Distribué (Delivered) — User List

    private func viewsDeliveredContent(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if isLoadingReadStatus {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                if status.receivedBy.isEmpty {
                    emptyStateView(icon: "checkmark.circle", text: "Aucune confirmation de distribution", accent: accent)
                } else {
                    // Timeline header
                    if let deliveredAt = message.deliveredToAllAt {
                        timelineBanner(
                            icon: "checkmark.circle.fill",
                            text: "Distribue a tous",
                            detail: formatTimeFR(deliveredAt),
                            count: "\(status.receivedCount)/\(status.totalMembers)",
                            accent: accent
                        )
                    }

                    LazyVStack(spacing: 0) {
                        ForEach(Array(status.receivedBy.enumerated()), id: \.element.userId) { index, user in
                            userStatusRow(
                                username: user.username,
                                avatar: nil,
                                date: user.receivedAt,
                                accent: accent,
                                index: index
                            )
                        }
                    }
                }
            } else {
                emptyStateView(icon: "wifi.slash", text: "Impossible de charger les donnees", accent: accent)
            }
        }
    }

    // MARK: - Lu (Read) — User List

    private func viewsReadContent(accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if isLoadingReadStatus {
                loadingIndicator(accent: accent)
            } else if let status = readStatusData {
                if status.readBy.isEmpty {
                    emptyStateView(icon: "eye.slash", text: "Personne n'a lu ce message", accent: accent)
                } else {
                    if let readAt = message.readByAllAt {
                        timelineBanner(
                            icon: "eye.fill",
                            text: "Lu par tous",
                            detail: formatTimeFR(readAt),
                            count: "\(status.readCount)/\(status.totalMembers)",
                            accent: accent
                        )
                    }

                    LazyVStack(spacing: 0) {
                        ForEach(Array(status.readBy.enumerated()), id: \.element.userId) { index, user in
                            userStatusRow(
                                username: user.username,
                                avatar: nil,
                                date: user.readAt,
                                accent: accent,
                                index: index
                            )
                        }
                    }
                }
            } else {
                emptyStateView(icon: "wifi.slash", text: "Impossible de charger les donnees", accent: accent)
            }
        }
    }

    // MARK: - Écouté (Listened) — Per-Audio Attachment

    private func viewsListenedContent(accent: Color) -> some View {
        let audioAttachments = message.attachments.filter { $0.mimeType.hasPrefix("audio/") }

        return VStack(alignment: .leading, spacing: 14) {
            if isLoadingAttachmentStatuses {
                loadingIndicator(accent: accent)
            } else {
                ForEach(audioAttachments) { attachment in
                    mediaConsumptionCard(
                        attachment: attachment,
                        isAudio: true,
                        accent: accent
                    )
                }

                if audioAttachments.isEmpty {
                    emptyStateView(icon: "headphones", text: "Aucun audio attache", accent: accent)
                }
            }
        }
    }

    // MARK: - Vu (Watched) — Per-Video Attachment

    private func viewsWatchedContent(accent: Color) -> some View {
        let videoAttachments = message.attachments.filter { $0.mimeType.hasPrefix("video/") }

        return VStack(alignment: .leading, spacing: 14) {
            if isLoadingAttachmentStatuses {
                loadingIndicator(accent: accent)
            } else {
                ForEach(videoAttachments) { attachment in
                    mediaConsumptionCard(
                        attachment: attachment,
                        isAudio: false,
                        accent: accent
                    )
                }

                if videoAttachments.isEmpty {
                    emptyStateView(icon: "play.rectangle", text: "Aucune video attachee", accent: accent)
                }
            }
        }
    }

    // MARK: - Shared Views Components

    private func timelineBanner(icon: String, text: String, detail: String, count: String, accent: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(accent)

            VStack(alignment: .leading, spacing: 1) {
                Text(text)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            Text(count)
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(accent)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    Capsule()
                        .fill(accent.opacity(0.12))
                )
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(accent.opacity(theme.mode.isDark ? 0.06 : 0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(accent.opacity(0.12), lineWidth: 0.5)
                )
        )
    }

    private func userStatusRow(username: String, avatar: String?, date: Date, accent: Color, index: Int, trailing: AnyView? = nil) -> some View {
        HStack(spacing: 10) {
            MeeshyAvatar(
                name: username,
                mode: .messageBubble,
                accentColor: contactColor,
                avatarURL: avatar
            )

            Text(username)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            if let trailing {
                trailing
            }

            Text(relativeDate(date))
                .font(.system(size: 11))
                .foregroundColor(theme.textMuted)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
    }

    private func mediaConsumptionCard(attachment: MessageAttachment, isAudio: Bool, accent: Color) -> some View {
        let users = attachmentStatuses[attachment.id] ?? []
        let icon = isAudio ? "waveform" : "film"
        let name = attachment.originalName.isEmpty ? attachment.fileName : attachment.originalName

        return VStack(alignment: .leading, spacing: 10) {
            // Attachment header
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(accent.opacity(theme.mode.isDark ? 0.15 : 0.1))
                        .frame(width: 32, height: 32)
                    Image(systemName: icon)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(accent)
                }

                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if let duration = attachment.duration {
                        Text(formatDuration(duration / 1000))
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(theme.textMuted)
                    }
                }

                Spacer()

                Text("\(users.count)")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(accent.opacity(0.12)))
            }

            if users.isEmpty {
                Text(isAudio ? "Pas encore ecoute" : "Pas encore visionne")
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
                    .padding(.vertical, 4)
            } else {
                // User consumption rows
                ForEach(Array(users.enumerated()), id: \.element.id) { index, user in
                    let listenDate = isAudio ? user.listenedAt : user.watchedAt
                    let isComplete = isAudio ? (user.listenedComplete ?? false) : (user.watchedComplete ?? false)
                    let positionMs = isAudio ? user.lastPlayPositionMs : user.lastWatchPositionMs
                    let count = isAudio ? user.listenCount : user.watchCount

                    HStack(spacing: 10) {
                        MeeshyAvatar(
                            name: user.username,
                            mode: .messageBubble,
                            accentColor: contactColor,
                            avatarURL: user.avatar
                        )

                        VStack(alignment: .leading, spacing: 1) {
                            Text(user.username)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(theme.textPrimary)

                            if let date = listenDate {
                                Text(relativeDate(date))
                                    .font(.system(size: 10))
                                    .foregroundColor(theme.textMuted)
                            }
                        }

                        Spacer()

                        // Play count badge
                        if let c = count, c > 1 {
                            Text("\(c)x")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundColor(accent.opacity(0.8))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(
                                    Capsule().fill(accent.opacity(0.08))
                                )
                        }

                        // Completion status
                        if isComplete {
                            HStack(spacing: 3) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 11))
                                Text("complet")
                                    .font(.system(size: 10, weight: .semibold))
                            }
                            .foregroundColor(Color(hex: "2ECC71"))
                        } else if let pos = positionMs, pos > 0 {
                            Text(formatDuration(pos / 1000))
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .foregroundColor(theme.textMuted)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(
                                    Capsule()
                                        .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                                )
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04), lineWidth: 0.5)
                )
        )
    }

    private func loadingIndicator(accent: Color) -> some View {
        HStack {
            Spacer()
            ProgressView()
                .tint(accent)
            Spacer()
        }
        .padding(.vertical, 30)
    }

    private func emptyStateView(icon: String, text: String, accent: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
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
        HStack(spacing: 10) {
            MeeshyAvatar(
                name: item.username,
                mode: .messageBubble,
                accentColor: contactColor,
                avatarURL: item.avatar
            )

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
        emptyStateView(icon: "face.smiling", text: "Aucune reaction", accent: Color(hex: contactColor))
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
                            performDismiss()
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
                performDismiss()
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
                    performDismiss()
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
                    performDismiss()
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
                    performDismiss()
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
                emptyStateView(icon: "bubble.left.and.bubble.right", text: "Aucune conversation", accent: Color(hex: contactColor))
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

            emptyStateView(icon: "text.below.photo", text: "Transcription non disponible", accent: Color(hex: contactColor))
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

    private func loadReadStatus() async {
        guard readStatusData == nil, !isLoadingReadStatus else { return }
        isLoadingReadStatus = true
        defer { isLoadingReadStatus = false }
        do {
            let response: APIResponse<ReadStatusData> = try await APIClient.shared.request(
                endpoint: "/messages/\(message.id)/read-status"
            )
            if response.success {
                readStatusData = response.data
            }
        } catch { }
    }

    private func loadAttachmentStatuses() async {
        let mediaAttachments = message.attachments.filter {
            $0.mimeType.hasPrefix("audio/") || $0.mimeType.hasPrefix("video/")
        }
        guard !mediaAttachments.isEmpty, !isLoadingAttachmentStatuses else { return }
        isLoadingAttachmentStatuses = true
        defer { isLoadingAttachmentStatuses = false }

        for attachment in mediaAttachments {
            do {
                let response: OffsetPaginatedAPIResponse<[AttachmentStatusUser]> = try await APIClient.shared.request(
                    endpoint: "/attachments/\(attachment.id)/status-details"
                )
                if response.success {
                    attachmentStatuses[attachment.id] = response.data
                }
            } catch { }
        }
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

    private var deliveryStatusLevel: Int {
        switch message.deliveryStatus {
        case .failed: return -1
        case .sending: return 0
        case .sent: return 1
        case .delivered: return 2
        case .read: return 3
        }
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

// MARK: - Detail Action Button Style

private struct DetailActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.88 : 1.0)
            .opacity(configuration.isPressed ? 0.7 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.65), value: configuration.isPressed)
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

// MARK: - Read Status API Models

private struct ReadStatusData: Decodable {
    let messageId: String
    let totalMembers: Int
    let receivedCount: Int
    let readCount: Int
    let receivedBy: [ReceivedByUser]
    let readBy: [ReadByUser]
}

private struct ReceivedByUser: Decodable {
    let userId: String
    let username: String
    let receivedAt: Date
}

private struct ReadByUser: Decodable {
    let userId: String
    let username: String
    let readAt: Date
}

// MARK: - Attachment Status API Models

private struct AttachmentStatusUser: Decodable, Identifiable {
    let userId: String
    let username: String
    let avatar: String?
    let viewedAt: Date?
    let downloadedAt: Date?
    let listenedAt: Date?
    let watchedAt: Date?
    let listenCount: Int?
    let watchCount: Int?
    let listenedComplete: Bool?
    let watchedComplete: Bool?
    let lastPlayPositionMs: Int?
    let lastWatchPositionMs: Int?

    var id: String { userId }
}
