import SwiftUI
import PhotosUI
import CoreLocation
import MeeshySDK

// MARK: - Active Member (for conversation detail header)
private struct ConversationActiveMember: Identifiable {
    let id: String
    let name: String
    let color: String
    let avatarURL: String?
}

struct ConversationView: View {
    let conversation: Conversation?
    var replyContext: ReplyContext? = nil
    let onBack: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var presenceManager = PresenceManager.shared
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @StateObject private var viewModel: ConversationViewModel
    @StateObject private var locationManager = LocationManager()
    @State private var messageText = ""
    @State private var showOptions = false
    @State private var showAttachOptions = false
    @State private var actionAlert: String? = nil
    @State private var isRecording = false
    @State private var recordingTime: TimeInterval = 0
    @State private var recordingTimer: Timer? = nil
    @State private var pendingAttachments: [MessageAttachment] = []
    @State private var showPhotoPicker = false
    @State private var showFilePicker = false
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var isLoadingLocation = false
    @FocusState private var isTyping: Bool
    @State private var typingBounce: Bool = false
    @GestureState private var dragOffset: CGFloat = 0
    @StateObject private var textAnalyzer = TextAnalyzer()
    @State private var showLanguagePicker = false
    @State private var pendingReplyReference: ReplyReference?
    @State private var showStoryViewerFromHeader = false
    @State private var storyGroupIndexForHeader = 0

    // Reaction bar state
    @State private var quickReactionMessageId: String? = nil
    @State private var showEmojiPickerSheet = false

    // Scroll state
    @State private var isNearBottom: Bool = true
    @State private var unreadBadgeCount: Int = 0
    @State private var scrollToBottomTrigger: Int = 0

    private var headerHasStoryRing: Bool {
        guard let userId = conversation?.participantUserId else { return false }
        return storyViewModel.hasStories(forUserId: userId)
    }

    private var accentColor: String {
        conversation?.accentColor ?? DynamicColorGenerator.colorForName(conversation?.name ?? "Unknown")
    }

    private var secondaryColor: String {
        conversation?.colorPalette.secondary ?? "4ECDC4"
    }

    private var isDirect: Bool {
        conversation?.type == .direct
    }

    private var headerPresenceState: PresenceState {
        guard isDirect, let userId = conversation?.participantUserId else { return .offline }
        return presenceManager.presenceState(for: userId)
    }

    private var headerMoodEmoji: String? {
        guard isDirect, let userId = conversation?.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)?.moodEmoji
    }

    private var conversationSection: ConversationSection? {
        guard let sectionId = conversation?.sectionId else { return nil }
        return ConversationSection.allSections.first { $0.id == sectionId }
    }

    private var conversationTypeLabel: String {
        switch conversation?.type {
        case .direct: return "Direct"
        case .group: return "Groupe"
        case .public: return "Public"
        case .global: return "Global"
        case .community: return "Communauté"
        case .channel: return "Channel"
        case .bot: return "Bot"
        case .none: return ""
        }
    }

    private var topActiveMembers: [ConversationActiveMember] {
        var counts: [String: (name: String, color: String, avatarURL: String?, count: Int)] = [:]
        for msg in viewModel.messages where !msg.isMe {
            guard let id = msg.senderId else { continue }
            if var existing = counts[id] {
                existing.count += 1
                counts[id] = existing
            } else {
                counts[id] = (
                    name: msg.senderName ?? "?",
                    color: msg.senderColor ?? accentColor,
                    avatarURL: msg.senderAvatarURL,
                    count: 1
                )
            }
        }
        return counts
            .sorted { $0.value.count > $1.value.count }
            .prefix(3)
            .map { ConversationActiveMember(id: $0.key, name: $0.value.name, color: $0.value.color, avatarURL: $0.value.avatarURL) }
    }

    init(conversation: Conversation?, replyContext: ReplyContext? = nil, onBack: @escaping () -> Void) {
        self.conversation = conversation
        self.replyContext = replyContext
        self.onBack = onBack
        _viewModel = StateObject(wrappedValue: ConversationViewModel(conversationId: conversation?.id ?? ""))
    }

    // MARK: - Date Sections

    /// Show a date separator before a message if >1h gap from previous, or if it's the first message
    private func shouldShowDateSection(at index: Int) -> Bool {
        guard index > 0 else { return true }
        let current = viewModel.messages[index].createdAt
        let previous = viewModel.messages[index - 1].createdAt
        return current.timeIntervalSince(previous) > 3600
    }

    /// Format date for section header, locale-aware (supports i18n)
    private func formatDateSection(for date: Date) -> String {
        let calendar = Calendar.current
        let now = Date()

        // Time component: "14h" or "14h30"
        let hour = calendar.component(.hour, from: date)
        let minute = calendar.component(.minute, from: date)
        let timeStr = minute == 0 ? "\(hour)h" : String(format: "%dh%02d", hour, minute)

        if calendar.isDateInToday(date) {
            let todayLabel = String(localized: "date.today", defaultValue: "Aujourd'hui")
            return "\(todayLabel) \(timeStr)"
        }

        if calendar.isDateInYesterday(date) {
            let yesterdayLabel = String(localized: "date.yesterday", defaultValue: "Hier")
            return "\(yesterdayLabel) \(timeStr)"
        }

        // Within last 7 days: weekday + time (e.g. "Mardi 18h42")
        if let sevenDaysAgo = calendar.date(byAdding: .day, value: -7, to: now),
           date > sevenDaysAgo {
            let formatter = DateFormatter()
            formatter.locale = Locale.current
            formatter.dateFormat = "EEEE"
            let weekday = formatter.string(from: date).capitalized
            return "\(weekday) \(timeStr)"
        }

        // Same year: weekday + day + abbreviated month (e.g. "Jeudi 12 Janv.")
        if calendar.component(.year, from: date) == calendar.component(.year, from: now) {
            let formatter = DateFormatter()
            formatter.locale = Locale.current
            formatter.dateFormat = "EEEE d MMM"
            return formatter.string(from: date).capitalized
        }

        // Different year: weekday + day + month + year (e.g. "Mercredi 28 Dec. 2025")
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        formatter.dateFormat = "EEEE d MMM yyyy"
        return formatter.string(from: date).capitalized
    }

    /// Visual date separator: rounded pill with theme-aware colors
    private func dateSectionView(for date: Date) -> some View {
        HStack {
            Spacer()
            Text(formatDateSection(for: date))
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(
                    theme.mode.isDark
                        ? Color(hex: accentColor).opacity(0.85)
                        : Color(hex: accentColor)
                )
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(
                            theme.mode.isDark
                                ? Color(hex: accentColor).opacity(0.12)
                                : Color(hex: accentColor).opacity(0.08)
                        )
                        .overlay(
                            Capsule()
                                .stroke(
                                    Color(hex: accentColor).opacity(theme.mode.isDark ? 0.2 : 0.15),
                                    lineWidth: 0.5
                                )
                        )
                )
            Spacer()
        }
        .padding(.vertical, 6)
    }

    // MARK: - Extracted message row (avoids type-checker timeout)

    @ViewBuilder
    private func messageRow(index: Int, msg: Message) -> some View {
        let nextMsg: Message? = index + 1 < viewModel.messages.count ? viewModel.messages[index + 1] : nil
        let isLastInGroup: Bool = nextMsg == nil || nextMsg?.senderId != msg.senderId
        let bubblePresence: PresenceState = isDirect ? .offline : presenceManager.presenceState(for: msg.senderId ?? "")

        VStack(spacing: 0) {
            // Quick reaction bar + action menu (above the bubble)
            if quickReactionMessageId == msg.id {
                quickReactionBar(for: msg.id)
                    .transition(.scale(scale: 0.8, anchor: msg.isMe ? .bottomTrailing : .bottomLeading).combined(with: .opacity))
                    .padding(.bottom, 6)
            }

            ThemedMessageBubble(
                message: msg,
                contactColor: accentColor,
                showAvatar: !isDirect && isLastInGroup,
                presenceState: bubblePresence,
                onAddReaction: { messageId in
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        quickReactionMessageId = messageId
                    }
                    HapticFeedback.medium()
                }
            )
            .onLongPressGesture {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    quickReactionMessageId = msg.id
                }
                HapticFeedback.medium()
            }
        }
        .id(msg.id)
        .transition(
            .asymmetric(
                insertion: .move(edge: msg.isMe ? .trailing : .leading).combined(with: .opacity),
                removal: .opacity
            )
        )
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: msg.content)
    }

    // MARK: - Quick Reaction Bar + Actions

    private let quickEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"]

    private func quickReactionBar(for messageId: String) -> some View {
        VStack(spacing: 8) {
            // Emoji strip
            HStack(spacing: 6) {
                ForEach(quickEmojis, id: \.self) { emoji in
                    Button {
                        viewModel.toggleReaction(messageId: messageId, emoji: emoji)
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            quickReactionMessageId = nil
                        }
                    } label: {
                        Text(emoji)
                            .font(.system(size: 24))
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(EmojiScaleButtonStyle())
                }

                // (+) button for full picker
                Button {
                    showEmojiPickerSheet = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Color(hex: accentColor))
                        .frame(width: 36, height: 36)
                        .background(
                            Circle()
                                .fill(Color(hex: accentColor).opacity(0.15))
                                .overlay(
                                    Circle()
                                        .stroke(Color(hex: accentColor).opacity(0.3), lineWidth: 1)
                                )
                        )
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Capsule()
                            .stroke(Color(hex: accentColor).opacity(0.2), lineWidth: 0.5)
                    )
                    .shadow(color: Color(hex: accentColor).opacity(0.2), radius: 12, y: 4)
            )

            // Action buttons row
            HStack(spacing: 8) {
                messageActionButton(icon: "arrowshape.turn.up.left.fill", label: String(localized: "action.reply", defaultValue: "Repondre"), color: "4ECDC4") {
                    // TODO: wire reply
                    actionAlert = "Repondre"
                    closeReactionBar()
                }
                messageActionButton(icon: "doc.on.doc.fill", label: String(localized: "action.copy", defaultValue: "Copier"), color: "9B59B6") {
                    if let msg = viewModel.messages.first(where: { $0.id == messageId }) {
                        UIPasteboard.general.string = msg.content
                    }
                    closeReactionBar()
                }
                messageActionButton(icon: "arrowshape.turn.up.forward.fill", label: String(localized: "action.forward", defaultValue: "Transferer"), color: "F8B500") {
                    // TODO: wire forward
                    actionAlert = "Transferer"
                    closeReactionBar()
                }
                messageActionButton(icon: "trash.fill", label: String(localized: "action.delete", defaultValue: "Supprimer"), color: "FF6B6B") {
                    // TODO: wire delete
                    actionAlert = "Supprimer"
                    closeReactionBar()
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Capsule()
                            .stroke(Color(hex: accentColor).opacity(0.15), lineWidth: 0.5)
                    )
                    .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
            )
        }
    }

    private func messageActionButton(icon: String, label: String, color: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(Color(hex: color))
                Text(label)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            .frame(width: 60, height: 44)
        }
    }

    private func closeReactionBar() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            quickReactionMessageId = nil
        }
    }

    // Dynamic height for bottom spacer based on composer state
    private var composerHeight: CGFloat {
        var height: CGFloat = 100 // Base composer height + padding
        if !pendingAttachments.isEmpty {
            height += 110 // Attachment preview height
        }
        if isRecording {
            height += 10 // Extra space for recording UI
        }
        return height
    }

    var body: some View {
        ZStack {
            // Themed background with conversation accent
            conversationBackground

            // Messages
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 10) {
                        // Top trigger: loads older messages when scrolled to top
                        if viewModel.hasOlderMessages {
                            if viewModel.isLoadingOlder {
                                HStack(spacing: 8) {
                                    ProgressView()
                                        .tint(Color(hex: accentColor))
                                    Text(String(localized: "loading", defaultValue: "Chargement..."))
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(.secondary)
                                }
                                .frame(height: 36)
                                .transition(.opacity)
                            } else {
                                Color.clear.frame(height: 1)
                                    .onAppear {
                                        guard !viewModel.isProgrammaticScroll else { return }
                                        Task { await viewModel.loadOlderMessages() }
                                    }
                            }
                        }

                        Color.clear.frame(height: 70)

                        ForEach(Array(viewModel.messages.enumerated()), id: \.element.id) { index, msg in
                            if shouldShowDateSection(at: index) {
                                dateSectionView(for: msg.createdAt)
                            }
                            messageRow(index: index, msg: msg)
                        }

                        // Typing indicator — shown inline after last message
                        if !viewModel.typingUsernames.isEmpty {
                            inlineTypingIndicator
                                .id("typing_indicator")
                                .transition(.opacity.combined(with: .scale(scale: 0.9)))
                                .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.typingUsernames.count)
                        }

                        // Near-bottom detector — sits right after messages
                        Color.clear
                            .frame(height: 1)
                            .id("near_bottom_anchor")
                            .onAppear {
                                isNearBottom = true
                                unreadBadgeCount = 0
                                viewModel.lastUnreadMessage = nil
                            }
                            .onDisappear {
                                isNearBottom = false
                            }

                        // Dynamic bottom spacer based on composer state
                        Color.clear
                            .frame(height: composerHeight)
                            .id("bottom_spacer")
                    }
                    .padding(.horizontal, 16)
                }
                // Initial load complete → scroll to bottom with natural animation
                .onChange(of: viewModel.isLoadingInitial) { isLoading in
                    if !isLoading, let last = viewModel.messages.last {
                        viewModel.markProgrammaticScroll()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            withAnimation(.easeOut(duration: 0.4)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }
                // New message appended → scroll only if near bottom or own message
                .onChange(of: viewModel.newMessageAppended) { _ in
                    guard let lastMsg = viewModel.messages.last else { return }
                    if isNearBottom || lastMsg.isMe {
                        viewModel.markProgrammaticScroll()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                            proxy.scrollTo(lastMsg.id, anchor: .bottom)
                        }
                    } else {
                        unreadBadgeCount += 1
                    }
                }
                // Older messages prepended → restore scroll position to anchor
                .onChange(of: viewModel.isLoadingOlder) { isLoading in
                    if !isLoading, let anchorId = viewModel.scrollAnchorId {
                        // Use tiny delay to let SwiftUI layout the prepended items
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            proxy.scrollTo(anchorId, anchor: .top)
                            viewModel.scrollAnchorId = nil
                        }
                    }
                }
                // Composer state changes — scroll only if near bottom
                .onChange(of: pendingAttachments.count) { _ in
                    if isNearBottom, let last = viewModel.messages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
                .onChange(of: isRecording) { _ in
                    if isNearBottom, let last = viewModel.messages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
                // Triggered by the scroll-to-bottom button
                .onChange(of: scrollToBottomTrigger) { _ in
                    if let last = viewModel.messages.last {
                        viewModel.markProgrammaticScroll()
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            // Floating controls — 3 states: typing (compact), expanded (band), collapsed (avatar trigger)
            VStack {
                if isTyping {
                    // Compact header while keyboard is active — back + avatar only
                    HStack(spacing: 8) {
                        ThemedBackButton(color: accentColor) {
                            HapticFeedback.light()
                            onBack()
                        }

                        Spacer()

                        ThemedAvatarButton(
                            name: conversation?.name ?? "?",
                            color: accentColor,
                            secondaryColor: secondaryColor,
                            isExpanded: false,
                            hasStoryRing: headerHasStoryRing,
                            avatarURL: conversation?.type == .direct ? conversation?.participantAvatarURL : conversation?.avatar,
                            presenceState: headerPresenceState
                        ) {
                            isTyping = false
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showOptions = true
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.opacity)
                } else if showOptions {
                    // Header band takes full width — back arrow + info + avatar(s) all inside
                    conversationHeaderBand
                        .transition(.asymmetric(
                            insertion: .move(edge: .trailing).combined(with: .opacity),
                            removal: .move(edge: .trailing).combined(with: .opacity)
                        ))
                        .padding(.horizontal, 8)
                        .padding(.top, 8)
                } else {
                    // Collapsed: back button + spacer + avatar trigger
                    HStack(spacing: 8) {
                        ThemedBackButton(color: accentColor) {
                            HapticFeedback.light()
                            onBack()
                        }

                        Spacer()

                        ThemedAvatarButton(
                            name: conversation?.name ?? "?",
                            color: accentColor,
                            secondaryColor: secondaryColor,
                            isExpanded: false,
                            hasStoryRing: headerHasStoryRing,
                            avatarURL: conversation?.type == .direct ? conversation?.participantAvatarURL : conversation?.avatar,
                            presenceState: headerPresenceState
                        ) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showOptions = true
                            }
                        }
                        .contextMenu {
                            if headerHasStoryRing {
                                Button {
                                    if let userId = conversation?.participantUserId,
                                       let groupIndex = storyViewModel.groupIndex(forUserId: userId) {
                                        storyGroupIndexForHeader = groupIndex
                                        showStoryViewerFromHeader = true
                                    }
                                } label: {
                                    Label("Voir les stories", systemImage: "play.circle.fill")
                                }
                            }
                            Button {
                                actionAlert = "Profil de \(conversation?.name ?? "Contact")"
                            } label: {
                                Label("Voir le profil", systemImage: "person.fill")
                            }
                            Button {
                                actionAlert = "Infos de la conversation"
                            } label: {
                                Label("Infos conversation", systemImage: "info.circle.fill")
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                }

                Spacer()
            }
            .zIndex(100)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isTyping)

            // Dismiss overlay (header band) — hidden when typing
            if showOptions && !isTyping {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showOptions = false
                        }
                    }
                    .zIndex(99)
            }

            // Dismiss overlay (reaction bar)
            if quickReactionMessageId != nil {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        closeReactionBar()
                    }
                    .zIndex(10)
            }

            // Scroll-to-bottom button — visible whenever not at bottom
            if !isNearBottom {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        scrollToBottomButton
                            .padding(.trailing, 16)
                            .padding(.bottom, composerHeight + 8)
                    }
                }
                .zIndex(60)
                .transition(.asymmetric(
                    insertion: .scale(scale: 0.8).combined(with: .opacity),
                    removal: .scale(scale: 0.6).combined(with: .opacity)
                ))
                .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isNearBottom)
            }

            // Composer
            VStack {
                Spacer()
                themedComposer
            }
            .zIndex(50)

            // Attach options
            attachOptionsLadder
        }
        .gesture(swipeBackGesture)
        .offset(x: dragOffset)
        .scaleEffect(dragOffset > 0 ? 1.0 - (dragOffset / UIScreen.main.bounds.width * 0.05) : 1.0)
        .opacity(dragOffset > 0 ? 1.0 - (dragOffset / UIScreen.main.bounds.width * 0.3) : 1.0)
        .task {
            await viewModel.loadMessages()
            // Connect message socket
            MessageSocketManager.shared.connect()
        }
        .onAppear {
            // Pre-populate reply reference from story/status reply
            if let context = replyContext {
                pendingReplyReference = context.toReplyReference
            }
        }
        .fullScreenCover(isPresented: $showStoryViewerFromHeader) {
            if storyGroupIndexForHeader < storyViewModel.storyGroups.count {
                StoryViewerView(
                    viewModel: storyViewModel,
                    groups: [storyViewModel.storyGroups[storyGroupIndexForHeader]],
                    currentGroupIndex: 0,
                    isPresented: $showStoryViewerFromHeader
                )
            }
        }
        .alert("Action sélectionnée", isPresented: Binding(
            get: { actionAlert != nil },
            set: { if !$0 { actionAlert = nil } }
        )) {
            Button("OK") { actionAlert = nil }
        } message: {
            Text(actionAlert ?? "")
        }
        .sheet(isPresented: $showEmojiPickerSheet) {
            EmojiPickerSheet(
                quickReactions: quickEmojis,
                onSelect: { emoji in
                    if let messageId = quickReactionMessageId {
                        viewModel.toggleReaction(messageId: messageId, emoji: emoji)
                    }
                    showEmojiPickerSheet = false
                    closeReactionBar()
                }
            )
            .presentationDetents([.medium, .large] as Set<PresentationDetent>)
        }
    }

    // MARK: - Conversation Background
    private var conversationBackground: some View {
        ConversationAnimatedBackground(
            config: ConversationBackgroundConfig(
                conversationType: conversation?.type ?? .direct,
                isEncrypted: conversation?.encryptionMode != nil,
                isE2EEncrypted: conversation?.encryptionMode == "e2ee",
                memberCount: conversation?.memberCount ?? 2,
                accentHex: accentColor,
                secondaryHex: secondaryColor,
                isDarkMode: theme.mode.isDark
            )
        )
    }

    // MARK: - Options Ladder (config button, unfolds below header band)
    private var optionsLadder: some View {
        VStack(spacing: 12) {
            HStack {
                Spacer()
                VStack(spacing: 10) {
                    ThemedActionButton(icon: "gearshape.fill", color: accentColor, size: 36) {
                        actionAlert = "Configuration conversation"
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showOptions = false }
                    }
                    .menuAnimation(showMenu: showOptions, delay: 0.06)
                }
            }
            .padding(.trailing, 16)
        }
        .padding(.top, 58)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .zIndex(showOptions && !isTyping ? 200 : -1)
        .allowsHitTesting(showOptions && !isTyping)
    }

    // MARK: - Conversation Header Band (thin strip — back arrow inside, full width)
    private var conversationHeaderBand: some View {
        HStack(spacing: 8) {
            // Back arrow inside the band
            Button {
                HapticFeedback.light()
                onBack()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 28, height: 28)
            }

            // Center: category + type badges, name
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if let section = conversationSection {
                        HStack(spacing: 2) {
                            Image(systemName: section.icon)
                                .font(.system(size: 8, weight: .bold))
                            Text(section.name)
                                .font(.system(size: 9, weight: .bold))
                        }
                        .foregroundColor(Color(hex: section.color))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color(hex: section.color).opacity(0.2)))
                    }

                    if !conversationTypeLabel.isEmpty {
                        Text(conversationTypeLabel)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(Color(hex: accentColor))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color(hex: accentColor).opacity(0.2)))
                    }

                    if let conv = conversation {
                        ForEach(conv.tags.prefix(2)) { tag in
                            Text(tag.name)
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundColor(Color(hex: tag.color))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(Color(hex: tag.color).opacity(0.12)))
                        }
                    }

                    if let mood = headerMoodEmoji {
                        Text(mood)
                            .font(.system(size: 14))
                    }
                }

                Button {
                    actionAlert = "Configuration conversation"
                } label: {
                    Text(conversation?.name ?? "Conversation")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            // Search button
            Button {
                actionAlert = "Rechercher dans la conversation"
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 28, height: 28)
                    .background(
                        Circle().fill(Color(hex: accentColor).opacity(0.15))
                    )
            }

            // Participant avatar(s) — tap opens profile
            if isDirect, let userId = conversation?.participantUserId {
                MeeshyAvatar(
                    name: conversation?.name ?? "?",
                    mode: .custom(36),
                    accentColor: accentColor,
                    avatarURL: conversation?.participantAvatarURL,
                    storyState: memberStoryState(for: userId),
                    presenceState: presenceManager.presenceState(for: userId),
                    onTap: {
                        HapticFeedback.light()
                        actionAlert = "Profil de \(conversation?.name ?? "Contact")"
                    },
                    onViewStory: {
                        if let groupIndex = storyViewModel.groupIndex(forUserId: userId) {
                            storyGroupIndexForHeader = groupIndex
                            showStoryViewerFromHeader = true
                        }
                    },
                    contextMenuItems: headerAvatarContextMenu(for: userId, name: conversation?.name ?? "Contact")
                )
            } else if !topActiveMembers.isEmpty {
                HStack(spacing: -6) {
                    ForEach(topActiveMembers) { member in
                        MeeshyAvatar(
                            name: member.name,
                            mode: .custom(24),
                            accentColor: member.color,
                            avatarURL: member.avatarURL,
                            storyState: memberStoryState(for: member.id),
                            presenceState: presenceManager.presenceState(for: member.id),
                            onTap: {
                                HapticFeedback.light()
                                actionAlert = "Profil de \(member.name)"
                            },
                            onViewStory: {
                                if let groupIndex = storyViewModel.groupIndex(forUserId: member.id) {
                                    storyGroupIndexForHeader = groupIndex
                                    showStoryViewerFromHeader = true
                                }
                            },
                            contextMenuItems: headerAvatarContextMenu(for: member.id, name: member.name)
                        )
                    }
                }
            } else if let conv = conversation, conv.memberCount > 2 {
                HStack(spacing: 3) {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 9))
                    Text("\(conv.memberCount)")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundColor(.white.opacity(0.5))
            }
        }
        .padding(.leading, 10)
        .padding(.trailing, 12)
        .padding(.vertical, 4)
        .frame(height: 48)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(
                    Capsule()
                        .stroke(
                            LinearGradient(
                                colors: [Color(hex: accentColor).opacity(0.4), Color(hex: secondaryColor).opacity(0.15)],
                                startPoint: .leading,
                                endPoint: .trailing
                            ),
                            lineWidth: 1
                        )
                )
        )
        .shadow(color: Color(hex: accentColor).opacity(0.2), radius: 8, y: 2)
    }

    // Helper: story state for a member
    private func memberStoryState(for userId: String) -> StoryRingState {
        if storyViewModel.hasUnviewedStories(forUserId: userId) { return .unread }
        if storyViewModel.hasStories(forUserId: userId) { return .read }
        return .none
    }

    // Helper: context menu items for participant avatars in header band
    private func headerAvatarContextMenu(for userId: String, name: String) -> [AvatarContextMenuItem] {
        var items: [AvatarContextMenuItem] = []
        if storyViewModel.hasStories(forUserId: userId) {
            items.append(AvatarContextMenuItem(label: "Voir les stories", icon: "play.circle.fill") {
                if let groupIndex = storyViewModel.groupIndex(forUserId: userId) {
                    storyGroupIndexForHeader = groupIndex
                    showStoryViewerFromHeader = true
                }
            })
        }
        items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
            actionAlert = "Profil de \(name)"
        })
        items.append(AvatarContextMenuItem(label: "Envoyer un message", icon: "bubble.left.fill") {
            actionAlert = "Message à \(name)"
        })
        return items
    }

    // MARK: - Attach Options Ladder
    private var attachOptionsLadder: some View {
        VStack(spacing: 10) {
            // File picker
            ThemedActionButton(icon: "doc.fill", color: "45B7D1") {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showAttachOptions = false }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    showFilePicker = true
                }
            }
            .menuAnimation(showMenu: showAttachOptions, delay: 0.0)

            // Location
            ThemedActionButton(icon: "location.fill", color: "2ECC71") {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showAttachOptions = false }
                addCurrentLocation()
            }
            .menuAnimation(showMenu: showAttachOptions, delay: 0.04)

            // Camera (placeholder)
            ThemedActionButton(icon: "camera.fill", color: "F8B500") {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showAttachOptions = false }
                // Camera would be implemented with UIImagePickerController
                addPlaceholderImage(type: "camera")
            }
            .menuAnimation(showMenu: showAttachOptions, delay: 0.08)

            // Photo gallery
            ThemedActionButton(icon: "photo.fill", color: "9B59B6") {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showAttachOptions = false }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    showPhotoPicker = true
                }
            }
            .menuAnimation(showMenu: showAttachOptions, delay: 0.12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .padding(.leading, 18)
        .padding(.bottom, 78)
        .zIndex(showAttachOptions ? 150 : -1)
        .allowsHitTesting(showAttachOptions)
    }

    // MARK: - Scroll to Bottom Button

    private var hasTypingIndicator: Bool {
        !viewModel.typingUsernames.isEmpty
    }

    /// Unread message attachment (for rich preview in button)
    private var unreadAttachment: MessageAttachment? {
        viewModel.lastUnreadMessage?.attachments.first
    }

    /// True when there are unread messages to show in the button
    private var hasUnreadContent: Bool {
        unreadBadgeCount > 0 || hasTypingIndicator
    }

    private var scrollToBottomButton: some View {
        Button {
            HapticFeedback.light()
            scrollToBottomTrigger += 1
            unreadBadgeCount = 0
            viewModel.lastUnreadMessage = nil
        } label: {
            Group {
                if hasUnreadContent {
                    // Rich button with preview
                    unreadPreviewContent
                } else {
                    // Simple chevron-only pill
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .padding(12)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: hasUnreadContent ? 16 : 20)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(hex: accentColor).opacity(0.95),
                                Color(hex: secondaryColor).opacity(0.9)
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 8, y: 4)
            )
        }
    }

    private var unreadPreviewContent: some View {
        HStack(spacing: 10) {
            // Left: rich preview (image thumbnail or audio play)
            if let attachment = unreadAttachment {
                unreadAttachmentPreview(attachment)
            }

            VStack(alignment: .leading, spacing: 3) {
                // Typing indicator (top priority)
                if hasTypingIndicator {
                    HStack(spacing: 4) {
                        typingDotsView
                        Text(typingLabel)
                            .font(.system(size: 11, weight: .semibold))
                            .lineLimit(1)
                    }
                }

                // Last unread message text preview
                if let msg = viewModel.lastUnreadMessage, !msg.content.isEmpty {
                    Text(msg.content)
                        .font(.system(size: 12, weight: .regular))
                        .lineLimit(1)
                } else if unreadAttachment != nil, !hasTypingIndicator {
                    Text(unreadAttachmentTypeLabel)
                        .font(.system(size: 12, weight: .regular))
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            // Right: chevron + unread count
            VStack(spacing: 2) {
                if unreadBadgeCount > 0 {
                    Text("\(unreadBadgeCount)")
                        .font(.system(size: 10, weight: .heavy))
                        .frame(width: 20, height: 20)
                        .background(Circle().fill(Color.white.opacity(0.3)))
                }
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: 240)
    }

    @ViewBuilder
    private func unreadAttachmentPreview(_ attachment: MessageAttachment) -> some View {
        switch attachment.type {
        case .image, .video:
            // Thumbnail
            if let thumbUrl = attachment.thumbnailUrl ?? (attachment.type == .image ? attachment.fileUrl : nil),
               let url = URL(string: thumbUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 36, height: 36)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    default:
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.white.opacity(0.2))
                            .frame(width: 36, height: 36)
                            .overlay(
                                Image(systemName: attachment.type == .video ? "video.fill" : "photo.fill")
                                    .font(.system(size: 14))
                                    .foregroundColor(.white.opacity(0.6))
                            )
                    }
                }
            }
        case .audio:
            // Play button
            Image(systemName: "play.fill")
                .font(.system(size: 14, weight: .bold))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.white.opacity(0.25)))
        default:
            EmptyView()
        }
    }

    private var unreadAttachmentTypeLabel: String {
        guard let att = unreadAttachment else { return "" }
        switch att.type {
        case .image: return "Photo"
        case .video: return "Video"
        case .audio: return "Audio"
        case .file: return "Fichier"
        case .location: return "Position"
        }
    }

    private var typingLabel: String {
        let names = viewModel.typingUsernames
        switch names.count {
        case 1: return "\(names[0]) ecrit..."
        case 2: return "\(names[0]) et \(names[1])..."
        default: return "\(names.count) personnes..."
        }
    }

    @State private var typingDotPhase: Int = 0

    private var typingDotsView: some View {
        HStack(spacing: 2) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color.white)
                    .frame(width: 4, height: 4)
                    .opacity(typingDotPhase == i ? 1.0 : 0.4)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.4).repeatForever(autoreverses: false)) {
                typingDotPhase = (typingDotPhase + 1) % 3
            }
        }
    }

    // MARK: - Inline Typing Indicator (shown after last message)
    @State private var inlineTypingDotPhase: Int = 0

    private var inlineTypingIndicator: some View {
        let isDark = theme.mode.isDark
        let accent = Color(hex: accentColor)

        return HStack(spacing: 8) {
            // Animated dots bubble
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(accent.opacity(inlineTypingDotPhase == i ? 1.0 : 0.35))
                        .frame(width: 6, height: 6)
                        .scaleEffect(inlineTypingDotPhase == i ? 1.2 : 1.0)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                Capsule()
                    .fill(isDark ? accent.opacity(0.1) : accent.opacity(0.06))
                    .overlay(
                        Capsule()
                            .stroke(accent.opacity(isDark ? 0.2 : 0.12), lineWidth: 0.5)
                    )
            )
            .onAppear {
                withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: false)) {
                    inlineTypingDotPhase = (inlineTypingDotPhase + 1) % 3
                }
            }

            // Typing label
            Text(typingLabel)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(isDark ? accent.opacity(0.7) : accent.opacity(0.6))

            Spacer()
        }
        .padding(.vertical, 4)
    }

    // MARK: - Themed Composer
    private var themedComposer: some View {
        VStack(spacing: 8) {
            // Pending attachments preview
            if !pendingAttachments.isEmpty {
                pendingAttachmentsPreview
                    .transition(.scale.combined(with: .opacity))
            }

            HStack(alignment: .bottom, spacing: 12) {
                // Plus/Mic button (hidden only when recording)
                if !isRecording {
                    ThemedComposerButton(
                        icon: showAttachOptions ? "mic.fill" : "plus",
                        colors: showAttachOptions ? ["FF6B6B", "E74C3C"] : [accentColor, secondaryColor],
                        isActive: showAttachOptions
                    ) {
                        if showAttachOptions {
                            // Start recording when mic is clicked
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showAttachOptions = false
                                startRecording()
                            }
                        } else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showAttachOptions = true
                            }
                        }
                    }
                }

                // Input field with mic/stop button inside
                HStack(spacing: 0) {
                    if isRecording {
                        // Stop button inside input (replaces mic)
                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                stopAndPreviewRecording()
                            }
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            colors: [Color(hex: "FF6B6B"), Color(hex: "E74C3C")],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 32, height: 32)

                                Image(systemName: "stop.fill")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(.white)
                            }
                            .frame(width: 44, height: 44)
                        }

                        // Recording interface
                        voiceRecordingView
                    } else if !showAttachOptions {
                        // Smart Context Zone / Mic button
                        let hasText = !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        let textLen = messageText.count

                        if hasText {
                            SmartContextZone(
                                analyzer: textAnalyzer,
                                accentColor: accentColor,
                                isCompact: false,
                                showFlag: textLen > 20
                            )
                            .transition(.scale.combined(with: .opacity))
                        } else {
                            // Mic button - starts recording immediately
                            Button {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    startRecording()
                                }
                            } label: {
                                Image(systemName: "mic.fill")
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundStyle(
                                        LinearGradient(
                                            colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 44, height: 44)
                            }
                            .transition(.scale.combined(with: .opacity))
                        }

                        // Text input
                        ZStack(alignment: .leading) {
                            if messageText.isEmpty {
                                Text("Message...")
                                    .foregroundColor(theme.textMuted)
                            }

                            TextField("", text: $messageText, axis: .vertical)
                                .focused($isTyping)
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1...5)
                        }
                        .padding(.trailing, 12)
                        .padding(.vertical, 12)
                    } else {
                        // When attach options shown, just show text input (mic is now the left button)
                        ZStack(alignment: .leading) {
                            if messageText.isEmpty {
                                Text("Message...")
                                    .foregroundColor(theme.textMuted)
                            }

                            TextField("", text: $messageText, axis: .vertical)
                                .focused($isTyping)
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1...5)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
                .frame(minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: 22)
                        .fill(theme.surfaceGradient(tint: isRecording ? "FF6B6B" : accentColor))
                        .overlay(
                            RoundedRectangle(cornerRadius: 22)
                                .stroke(
                                    (isTyping || isRecording) ?
                                    LinearGradient(colors: [Color(hex: isRecording ? "FF6B6B" : accentColor), Color(hex: isRecording ? "E74C3C" : secondaryColor)], startPoint: .leading, endPoint: .trailing) :
                                    theme.border(tint: accentColor, intensity: 0.3),
                                    lineWidth: (isTyping || isRecording) ? 2 : 1
                                )
                        )
                )
                .scaleEffect(typingBounce ? 1.02 : 1.0)

                // Send button - show when recording, has pending attachments, or has text
                if isRecording || !pendingAttachments.isEmpty || !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    ThemedComposerButton(
                        icon: "paperplane.fill",
                        colors: ["FF6B6B", "4ECDC4"],
                        isActive: true,
                        rotateIcon: true
                    ) {
                        if isRecording {
                            stopAndSendRecording()
                        } else {
                            sendMessageWithAttachments()
                        }
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: messageText.isEmpty)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isRecording)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: pendingAttachments.count)
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFileImport(result)
        }
        .onChange(of: selectedPhotoItems) { items in
            handlePhotoSelection(items)
        }
        .onChange(of: messageText) { newText in
            textAnalyzer.analyze(text: newText)
            viewModel.onTextChanged(newText)
        }
        .onChange(of: isTyping) { focused in
            // Bounce animation on focus
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                typingBounce = focused
            }
            // Close attach menu when composer gets focus
            if focused && showAttachOptions {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = false
                }
            }
        }
        .sheet(isPresented: $textAnalyzer.showLanguagePicker) {
            LanguagePickerSheet(analyzer: textAnalyzer)
        }
    }

    // MARK: - Pending Attachments Preview
    private var pendingAttachmentsPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(pendingAttachments) { attachment in
                    attachmentPreviewTile(attachment)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .frame(height: 100)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Attachment Preview Tile
    private func attachmentPreviewTile(_ attachment: MessageAttachment) -> some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 4) {
                // Icon based on type
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 56, height: 56)

                    Image(systemName: iconForAttachmentType(attachment.type))
                        .font(.system(size: 22))
                        .foregroundColor(.white)
                }

                // Info text
                Text(labelForAttachment(attachment))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
                    .frame(width: 60)
            }

            // Delete button
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    pendingAttachments.removeAll { $0.id == attachment.id }
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(Color(hex: "FF6B6B"))
                    .background(Circle().fill(theme.backgroundPrimary).frame(width: 14, height: 14))
            }
            .offset(x: 6, y: -6)
        }
    }

    private func iconForAttachmentType(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    private func labelForAttachment(_ attachment: MessageAttachment) -> String {
        switch attachment.type {
        case .image: return "Photo"
        case .video: return "Vidéo"
        case .audio: return attachment.durationFormatted ?? "Audio"
        case .file: return attachment.originalName.isEmpty ? "Fichier" : attachment.originalName
        case .location: return "Position"
        }
    }

    // MARK: - Voice Recording View
    private var voiceRecordingView: some View {
        HStack(spacing: 12) {
            // Recording indicator with animated pulse
            ZStack {
                Circle()
                    .fill(Color(hex: "FF6B6B").opacity(0.3))
                    .frame(width: 20, height: 20)
                    .scaleEffect(recordingTime.truncatingRemainder(dividingBy: 1) < 0.5 ? 1.5 : 1.0)
                    .opacity(recordingTime.truncatingRemainder(dividingBy: 1) < 0.5 ? 0 : 0.5)
                    .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isRecording)

                Circle()
                    .fill(Color(hex: "FF6B6B"))
                    .frame(width: 12, height: 12)
                    .opacity(recordingTime.truncatingRemainder(dividingBy: 1) < 0.5 ? 1 : 0.3)
                    .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isRecording)
            }

            // Animated waveform bars
            HStack(spacing: 3) {
                ForEach(0..<15, id: \.self) { i in
                    AnimatedWaveformBar(index: i, isRecording: isRecording)
                }
            }

            Spacer()

            // Timer with subtle scale
            Text(formatRecordingTime(recordingTime))
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundColor(theme.textPrimary)
                .padding(.trailing, 8)
                .contentTransition(.numericText())
                .animation(.spring(response: 0.3), value: recordingTime)
        }
        .padding(.leading, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Recording Functions
    private func startRecording() {
        isRecording = true
        recordingTime = 0
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            recordingTime += 0.1
        }
        HapticFeedback.medium()
    }

    private func stopRecording() {
        isRecording = false
        recordingTimer?.invalidate()
        recordingTimer = nil
    }

    private func stopAndPreviewRecording() {
        guard recordingTime > 0.5 else {
            stopRecording()
            return
        }
        let durationMs = Int(recordingTime * 1000)
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
        pendingAttachments.append(audioAttachment)
        stopRecording()
        recordingTime = 0
        HapticFeedback.light()
    }

    private func stopAndSendRecording() {
        guard recordingTime > 0.5 else {
            stopRecording()
            return
        }
        let durationMs = Int(recordingTime * 1000)
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
        pendingAttachments.append(audioAttachment)
        stopRecording()
        recordingTime = 0
        sendMessageWithAttachments()
    }

    private func sendMessageWithAttachments() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !pendingAttachments.isEmpty else { return }

        let replyId = pendingReplyReference != nil ? nil : nil as String? // TODO: wire reply ID
        let content = text

        // Clear UI state immediately
        let attachments = pendingAttachments
        pendingAttachments.removeAll()
        messageText = ""
        pendingReplyReference = nil
        viewModel.stopTypingEmission()
        HapticFeedback.light()

        // If we have local-only attachments (not uploaded), fall back to local append
        if !attachments.isEmpty {
            let conversationId = conversation?.id ?? "temp"
            let newMsg = Message(
                conversationId: conversationId,
                content: content,
                messageType: attachments.first?.type == .audio ? .audio : .text,
                createdAt: Date(),
                attachments: attachments,
                isMe: true
            )
            viewModel.messages.append(newMsg)
            return
        }

        // Send text via API
        Task {
            await viewModel.sendMessage(content: content, replyToId: replyId)
        }
    }

    private func formatRecordingTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    // MARK: - Attachment Handlers
    private func handlePhotoSelection(_ items: [PhotosPickerItem]) {
        for item in items {
            // In a real app, you'd load the actual image data
            let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
            let attachment: MessageAttachment
            if isVideo {
                attachment = MessageAttachment.video(durationMs: 30000, color: "FF6B6B")
            } else {
                attachment = MessageAttachment.image(color: "9B59B6")
            }
            pendingAttachments.append(attachment)
        }
        selectedPhotoItems.removeAll()
        HapticFeedback.light()
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            for url in urls {
                let fileName = url.lastPathComponent
                let fileSize = getFileSize(url)
                let attachment = MessageAttachment.file(name: fileName, size: fileSize, color: "45B7D1")
                pendingAttachments.append(attachment)
            }
            HapticFeedback.light()
        case .failure:
            actionAlert = "Erreur lors de l'import"
        }
    }

    private func getFileSize(_ url: URL) -> Int {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attributes[.size] as? Int else {
            return 0
        }
        return size
    }

    private func addCurrentLocation() {
        isLoadingLocation = true
        locationManager.requestLocation { location in
            isLoadingLocation = false
            if let location = location {
                let attachment = MessageAttachment.location(
                    latitude: location.coordinate.latitude,
                    longitude: location.coordinate.longitude,
                    color: "2ECC71"
                )
                withAnimation {
                    pendingAttachments.append(attachment)
                }
                HapticFeedback.light()
            } else {
                actionAlert = "Impossible d'obtenir la position"
            }
        }
    }

    private func addPlaceholderImage(type: String) {
        let colors = ["FF6B6B", "4ECDC4", "9B59B6", "F8B500", "45B7D1"]
        let randomColor = colors.randomElement() ?? "4ECDC4"
        let attachment = MessageAttachment.image(color: randomColor)
        pendingAttachments.append(attachment)
        HapticFeedback.light()
    }

    // MARK: - Gestures
    private var swipeBackGesture: some Gesture {
        DragGesture()
            .updating($dragOffset) { value, state, _ in
                if value.startLocation.x < 50 && value.translation.width > 0 {
                    state = value.translation.width
                }
            }
            .onEnded { value in
                if value.translation.width > 100 { onBack() }
            }
    }

    private func sendMessage() {
        guard !messageText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let text = messageText
        messageText = ""
        viewModel.stopTypingEmission()
        HapticFeedback.light()
        Task {
            await viewModel.sendMessage(content: text)
        }
    }
}

// MARK: - Themed Back Button
struct ThemedBackButton: View {
    let color: String
    var compactMode: Bool = false
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                // Circle background — collapses in compact mode
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 40, height: 40)
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(
                                    colors: [Color(hex: color).opacity(0.5), Color(hex: "4ECDC4").opacity(0.5)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
                    .shadow(color: Color(hex: color).opacity(0.3), radius: 6, y: 3)
                    .opacity(compactMode ? 0 : 1)
                    .scaleEffect(compactMode ? 0.4 : 1)

                // Chevron — always visible
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: color), Color(hex: "4ECDC4")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
            .frame(width: compactMode ? 24 : 40, height: 40)
            .scaleEffect(isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: compactMode)
        }
    }
}

// MARK: - Themed Avatar Button
struct ThemedAvatarButton: View {
    let name: String
    let color: String
    let secondaryColor: String
    let isExpanded: Bool
    var hasStoryRing: Bool = false
    var avatarURL: String? = nil
    var presenceState: PresenceState = .offline
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            MeeshyAvatar(
                name: name,
                mode: .conversationHeader,
                accentColor: color,
                secondaryColor: secondaryColor,
                avatarURL: avatarURL,
                storyState: hasStoryRing ? .unread : .none,
                presenceState: presenceState
            )
            .shadow(color: Color(hex: color).opacity(isExpanded ? 0.6 : 0.4), radius: isExpanded ? 12 : 8, y: 3)
            .scaleEffect(isPressed ? 0.9 : (isExpanded ? 1.1 : 1))
        }
    }
}

// MARK: - Themed Composer Button
struct ThemedComposerButton: View {
    let icon: String
    let colors: [String]
    var isActive: Bool = false
    var rotateIcon: Bool = false
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                Circle()
                    .fill(
                        isActive ?
                        LinearGradient(colors: colors.map { Color(hex: $0) }, startPoint: .topLeading, endPoint: .bottomTrailing) :
                        LinearGradient(colors: [Color(hex: colors[0]).opacity(0.2), Color(hex: colors[1]).opacity(0.15)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .frame(width: 44, height: 44)
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(colors: colors.map { Color(hex: $0).opacity(isActive ? 0 : 0.4) }, startPoint: .topLeading, endPoint: .bottomTrailing),
                                lineWidth: isActive ? 0 : 1
                            )
                    )
                    .shadow(color: Color(hex: colors[0]).opacity(isActive ? 0.5 : 0.2), radius: isActive ? 10 : 6, y: 3)

                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(isActive ? .white : Color(hex: colors[0]))
                    .rotationEffect(rotateIcon ? .degrees(45) : .degrees(0))
                    .offset(x: rotateIcon ? -1 : 0, y: rotateIcon ? 1 : 0)
            }
            .scaleEffect(isPressed ? 0.9 : 1)
        }
    }
}

// MARK: - Themed Message Bubble
struct ThemedMessageBubble: View {
    let message: Message
    let contactColor: String
    var showAvatar: Bool = true
    var presenceState: PresenceState = .offline
    var onAddReaction: ((String) -> Void)? = nil

    @State private var showProfileAlert = false
    @ObservedObject private var theme = ThemeManager.shared
    private let myColors = ["FF6B6B", "E91E63"]

    private var bubbleColor: String {
        message.isMe ? myColors[0] : contactColor
    }

    // Computed reaction summaries for display
    private var reactionSummaries: [ReactionSummary] {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        var emojiCounts: [String: (count: Int, includesMe: Bool)] = [:]
        for reaction in message.reactions {
            let isMe = reaction.userId == currentUserId
            if var existing = emojiCounts[reaction.emoji] {
                existing.count += 1
                existing.includesMe = existing.includesMe || isMe
                emojiCounts[reaction.emoji] = existing
            } else {
                emojiCounts[reaction.emoji] = (count: 1, includesMe: isMe)
            }
        }
        return emojiCounts.map { ReactionSummary(emoji: $0.key, count: $0.value.count, includesMe: $0.value.includesMe) }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isMe { Spacer(minLength: 50) }

            // Sender avatar (non-me messages only, last in group)
            if !message.isMe {
                if showAvatar {
                    MeeshyAvatar(
                        name: message.senderName ?? "?",
                        mode: .messageBubble,
                        accentColor: message.senderColor ?? contactColor,
                        avatarURL: message.senderAvatarURL,
                        presenceState: presenceState,
                        onViewProfile: { showProfileAlert = true },
                        contextMenuItems: [
                            AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                                showProfileAlert = true
                            }
                        ]
                    )
                } else {
                    Color.clear.frame(width: 32, height: 32)
                }
            }

            VStack(alignment: message.isMe ? .trailing : .leading, spacing: 4) {
                // Reply reference
                if let reply = message.replyTo {
                    replyPreview(reply)
                }

                // Main bubble avec réactions par-dessus
                VStack(alignment: .leading, spacing: 8) {
                    // Attachments
                    ForEach(message.attachments) { attachment in
                        attachmentView(attachment)
                    }

                    // Text content
                    if !message.content.isEmpty {
                        Text(message.content)
                            .font(.system(size: 15))
                            .foregroundColor(.white)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(bubbleBackground)
                .shadow(
                    color: Color(hex: bubbleColor).opacity(message.isMe ? 0.3 : 0.2),
                    radius: 6,
                    y: 3
                )
                .overlay(alignment: .bottomLeading) {
                    // Réactions chevauchant la bordure basse (80-90% hors du cadre)
                    reactionsOverlay
                        .padding(.leading, 8)
                        .offset(y: 20)
                }
            }

            if !message.isMe { Spacer(minLength: 50) }
        }
        .padding(.bottom, 16) // Espace pour les réactions qui dépassent sous la bulle
        .alert("Navigation", isPresented: $showProfileAlert) {
            Button("OK") {}
        } message: {
            Text("Naviguer vers le profil de \(message.senderName ?? "?")")
        }
    }

    // MARK: - Reply Preview
    private func replyPreview(_ reply: ReplyReference) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: reply.isMe ? myColors[0] : reply.authorColor))
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 2) {
                Text(reply.isMe ? "Vous" : reply.authorName)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(hex: reply.isMe ? myColors[0] : reply.authorColor))

                Text(reply.previewText)
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
        )
    }

    // MARK: - Attachment View
    @ViewBuilder
    private func attachmentView(_ attachment: MessageAttachment) -> some View {
        switch attachment.type {
        case .image:
            ImageViewerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor
            )

        case .video:
            VideoPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor
            )

        case .audio:
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor
            )

        case .file:
            DocumentViewerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor
            )

        case .location:
            RoundedRectangle(cornerRadius: 12)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 200, height: 120)
                .overlay(
                    VStack(spacing: 8) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 36))
                            .foregroundColor(.white)

                        Text("Position partagée")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.9))
                    }
                )
        }
    }

    // MARK: - Reactions Overlay (themed, accent-aware)
    private var reactionsOverlay: some View {
        let isDark = theme.mode.isDark
        let accent = Color(hex: contactColor)

        return HStack(spacing: 5) {
            // Add reaction button
            Button(action: {
                onAddReaction?(message.id)
            }) {
                Image(systemName: "face.smiling")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(isDark ? accent.opacity(0.6) : accent.opacity(0.5))
            }
            .frame(width: 28, height: 28)
            .background(
                Circle()
                    .fill(isDark ? accent.opacity(0.1) : accent.opacity(0.06))
                    .overlay(
                        Circle()
                            .stroke(accent.opacity(isDark ? 0.2 : 0.12), lineWidth: 0.5)
                    )
                    .shadow(color: accent.opacity(0.1), radius: 4, y: 2)
            )

            // Emoji reactions
            ForEach(reactionSummaries, id: \.emoji) { reaction in
                HStack(spacing: 3) {
                    Text(reaction.emoji)
                        .font(.system(size: 14))
                    if reaction.count > 1 {
                        Text("\(reaction.count)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(
                                reaction.includesMe
                                    ? (isDark ? .white : .white)
                                    : (isDark ? .white.opacity(0.7) : accent)
                            )
                    }
                }
                .padding(.horizontal, reaction.count > 1 ? 8 : 6)
                .frame(height: 28)
                .background(
                    Capsule()
                        .fill(
                            reaction.includesMe
                                ? (isDark
                                    ? accent.opacity(0.35)
                                    : accent.opacity(0.2))
                                : (isDark
                                    ? Color.white.opacity(0.08)
                                    : Color.black.opacity(0.04))
                        )
                        .overlay(
                            Capsule()
                                .stroke(
                                    reaction.includesMe
                                        ? accent.opacity(isDark ? 0.6 : 0.4)
                                        : accent.opacity(isDark ? 0.15 : 0.1),
                                    lineWidth: reaction.includesMe ? 1.5 : 0.5
                                )
                        )
                        .shadow(
                            color: reaction.includesMe ? accent.opacity(0.25) : .clear,
                            radius: 4, y: 2
                        )
                )
            }
        }
    }

    // MARK: - Bubble Background
    private var bubbleBackground: some View {
        RoundedRectangle(cornerRadius: 18)
            .fill(
                message.isMe ?
                LinearGradient(
                    colors: myColors.map { Color(hex: $0) },
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ) :
                LinearGradient(
                    colors: [
                        Color(hex: contactColor).opacity(theme.mode.isDark ? 0.35 : 0.25),
                        Color(hex: contactColor).opacity(theme.mode.isDark ? 0.2 : 0.15)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(
                        message.isMe ?
                        LinearGradient(colors: [Color.clear, Color.clear], startPoint: .leading, endPoint: .trailing) :
                        LinearGradient(
                            colors: [Color(hex: contactColor).opacity(0.5), Color(hex: contactColor).opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: message.isMe ? 0 : 1
                    )
            )
    }
}

// MARK: - Animated Waveform Bar
struct AnimatedWaveformBar: View {
    let index: Int
    let isRecording: Bool
    @State private var barHeight: CGFloat = 8

    private let minHeight: CGFloat = 6
    private let maxHeight: CGFloat = 26

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color.white.opacity(0.9), Color.white.opacity(0.5)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: barHeight)
            .onAppear {
                guard isRecording else { return }
                startAnimating()
            }
            .onChange(of: isRecording) { recording in
                if recording {
                    startAnimating()
                } else {
                    withAnimation(.easeOut(duration: 0.3)) {
                        barHeight = minHeight
                    }
                }
            }
    }

    private func startAnimating() {
        let randomDuration = Double.random(in: 0.3...0.6)
        let randomDelay = Double(index) * 0.04
        withAnimation(
            .easeInOut(duration: randomDuration)
                .repeatForever(autoreverses: true)
                .delay(randomDelay)
        ) {
            barHeight = CGFloat.random(in: (minHeight + 4)...maxHeight)
        }
    }
}

// MARK: - Legacy Support (Message defined in Models.swift, ChatMessage is alias)
struct ConversationOptionButton: View {
    let icon: String
    let color: String
    let action: () -> Void
    var body: some View { ThemedActionButton(icon: icon, color: color, action: action) }
}

struct AttachOptionButton: View {
    let icon: String
    let color: String
    let action: () -> Void
    var body: some View { ThemedActionButton(icon: icon, color: color, action: action) }
}

struct MessageBubble: View {
    let message: Message
    var body: some View { ThemedMessageBubble(message: message, contactColor: "4ECDC4") }
}

struct ColorfulMessageBubble: View {
    let message: Message
    let contactColor: String
    var body: some View { ThemedMessageBubble(message: message, contactColor: contactColor) }
}

// MARK: - Location Manager
class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var completion: ((CLLocation?) -> Void)?

    @Published var lastLocation: CLLocation?
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestLocation(completion: @escaping (CLLocation?) -> Void) {
        self.completion = completion

        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        default:
            completion(nil)
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        lastLocation = location
        completion?(location)
        completion = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location error: \(error.localizedDescription)")
        completion?(nil)
        completion = nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus = manager.authorizationStatus
        if authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways {
            manager.requestLocation()
        }
    }
}
