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

    @Environment(\.dismiss) private var dismiss
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
    @StateObject private var textAnalyzer = TextAnalyzer()
    @State private var showLanguagePicker = false
    @State private var pendingReplyReference: ReplyReference?
    @State private var showStoryViewerFromHeader = false
    @State private var storyGroupIndexForHeader = 0

    // Reaction bar state
    @State private var quickReactionMessageId: String? = nil
    @State private var showEmojiPickerSheet = false
    @State private var emojiOnlyMode: Bool = false

    // Scroll state
    @State private var isNearBottom: Bool = true
    @State private var unreadBadgeCount: Int = 0
    @State private var scrollToBottomTrigger: Int = 0
    @StateObject private var scrollButtonAudioPlayer = AudioPlayerManager()

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

    init(conversation: Conversation?, replyContext: ReplyContext? = nil) {
        self.conversation = conversation
        self.replyContext = replyContext
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

    @State private var swipedMessageId: String? = nil
    @State private var swipeOffset: CGFloat = 0

    @ViewBuilder
    private func messageRow(index: Int, msg: Message) -> some View {
        let nextMsg: Message? = index + 1 < viewModel.messages.count ? viewModel.messages[index + 1] : nil
        let isLastInGroup: Bool = nextMsg == nil || nextMsg?.senderId != msg.senderId
        let bubblePresence: PresenceState = isDirect ? .offline : presenceManager.presenceState(for: msg.senderId ?? "")

        // Swipe direction: reply = swipe toward center (right for other, left for own)
        let replyDirection: CGFloat = msg.isMe ? -1 : 1
        let isActiveSwipe = swipedMessageId == msg.id

        ZStack {
            // Reply icon revealed behind the bubble
            if isActiveSwipe && abs(swipeOffset) > 20 {
                HStack {
                    if !msg.isMe {
                        Spacer()
                    }
                    Image(systemName: swipeOffset * replyDirection > 0 ? "arrowshape.turn.up.left.fill" : "arrowshape.turn.up.forward.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color(hex: swipeOffset * replyDirection > 0 ? "4ECDC4" : "F8B500"))
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color(hex: swipeOffset * replyDirection > 0 ? "4ECDC4" : "F8B500").opacity(0.15)))
                        .scaleEffect(min(abs(swipeOffset) / 60.0, 1.0))
                        .opacity(min(abs(swipeOffset) / 40.0, 1.0))
                    if msg.isMe {
                        Spacer()
                    }
                }
                .padding(.horizontal, 16)
            }

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
                            emojiOnlyMode = true
                            quickReactionMessageId = messageId
                        }
                        HapticFeedback.medium()
                    }
                )
                .onLongPressGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        emojiOnlyMode = false
                        quickReactionMessageId = msg.id
                    }
                    HapticFeedback.medium()
                }
            }
            .offset(x: isActiveSwipe ? swipeOffset : 0)
            .gesture(
                DragGesture(minimumDistance: 20)
                    .onChanged { value in
                        // Only allow horizontal swipes
                        guard abs(value.translation.width) > abs(value.translation.height) else { return }
                        swipedMessageId = msg.id
                        // Elastic resistance after threshold
                        let raw = value.translation.width
                        let clamped = raw > 0 ? min(raw, 80) : max(raw, -80)
                        swipeOffset = clamped
                    }
                    .onEnded { value in
                        let threshold: CGFloat = 60
                        if swipeOffset * replyDirection > threshold {
                            // Reply action
                            triggerReply(for: msg)
                        } else if swipeOffset * replyDirection < -threshold {
                            // Forward action (opposite direction)
                            actionAlert = "Transferer"
                        }
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            swipeOffset = 0
                            swipedMessageId = nil
                        }
                    }
            )
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

    private func triggerReply(for msg: Message) {
        let preview = msg.content.isEmpty
            ? (msg.attachments.first.map { "[\($0.type.rawValue.capitalized)]" } ?? "")
            : msg.content
        pendingReplyReference = ReplyReference(
            messageId: msg.id,
            authorName: msg.senderName ?? "?",
            previewText: preview,
            isMe: msg.isMe,
            authorColor: msg.senderColor
        )
        isTyping = true
        HapticFeedback.medium()
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

            // Action buttons row (hidden in emoji-only mode)
            if !emojiOnlyMode {
                HStack(spacing: 8) {
                    messageActionButton(icon: "arrowshape.turn.up.left.fill", label: String(localized: "action.reply", defaultValue: "Repondre"), color: "4ECDC4") {
                        if let msg = viewModel.messages.first(where: { $0.id == messageId }) {
                            triggerReply(for: msg)
                        }
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
                .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
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

            // Floating controls — morphing header (avatar expands into band)
            VStack {
                if isTyping {
                    // Compact header while keyboard is active
                    HStack(spacing: 8) {
                        ThemedBackButton(color: accentColor) {
                            HapticFeedback.light()
                            dismiss()
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
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                showOptions = true
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.opacity)
                } else {
                    // Morphing container — back + expanding content + avatar
                    VStack(alignment: .leading, spacing: showOptions ? 4 : 0) {
                        HStack(spacing: 8) {
                            // Back button — own circle collapses when band opens
                            ThemedBackButton(color: accentColor, compactMode: showOptions) {
                                HapticFeedback.light()
                                dismiss()
                            }

                            // Band content — slides in from avatar side
                            if showOptions {
                                HStack(spacing: 4) {
                                    Button {
                                        actionAlert = "Configuration conversation"
                                    } label: {
                                        Text(conversation?.name ?? "Conversation")
                                            .font(.system(size: 13, weight: .bold, design: .rounded))
                                            .foregroundColor(.white)
                                            .lineLimit(1)
                                    }
                                    if let mood = headerMoodEmoji {
                                        Text(mood)
                                            .font(.system(size: 14))
                                    }
                                }
                                .transition(.move(edge: .trailing).combined(with: .opacity))

                                Spacer(minLength: 4)

                                // Search
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
                                        .background(Circle().fill(Color(hex: accentColor).opacity(0.15)))
                                }
                                .transition(.opacity)
                            } else {
                                Spacer()
                            }

                            // Avatar — always anchored right, morphs behavior
                            headerAvatarView
                        }

                        // Tags row — only when expanded
                        if showOptions {
                            headerTagsRow
                                .transition(.move(edge: .top).combined(with: .opacity))
                        }
                    }
                    .padding(.horizontal, showOptions ? 10 : 0)
                    .padding(.vertical, showOptions ? 6 : 0)
                    .background(
                        Group {
                            if showOptions {
                                RoundedRectangle(cornerRadius: 22)
                                    .fill(.ultraThinMaterial)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 22)
                                            .stroke(
                                                LinearGradient(
                                                    colors: [Color(hex: accentColor).opacity(0.4), Color(hex: secondaryColor).opacity(0.15)],
                                                    startPoint: .leading,
                                                    endPoint: .trailing
                                                ),
                                                lineWidth: 1
                                            )
                                    )
                                    .shadow(color: Color(hex: accentColor).opacity(0.2), radius: 8, y: 2)
                                    .transition(.scale(scale: 0.1, anchor: .trailing).combined(with: .opacity))
                            }
                        }
                    )
                    .padding(.horizontal, showOptions ? 8 : 16)
                    .padding(.top, 8)
                }

                Spacer()
            }
            .zIndex(100)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showOptions)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isTyping)

            // (dismiss: avatar tap toggles band — no full-screen overlay needed)

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

    // MARK: - Header Avatar (morphs from trigger to participant display)
    @ViewBuilder
    private var headerAvatarView: some View {
        if showOptions {
            // Expanded: participant avatar(s) — tap collapses band
            if isDirect, let userId = conversation?.participantUserId {
                MeeshyAvatar(
                    name: conversation?.name ?? "?",
                    mode: .custom(44),
                    accentColor: accentColor,
                    avatarURL: conversation?.participantAvatarURL,
                    storyState: memberStoryState(for: userId),
                    presenceState: presenceManager.presenceState(for: userId),
                    onTap: {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            showOptions = false
                        }
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
                            mode: .custom(28),
                            accentColor: member.color,
                            avatarURL: member.avatarURL,
                            storyState: memberStoryState(for: member.id),
                            presenceState: presenceManager.presenceState(for: member.id),
                            onTap: {
                                HapticFeedback.light()
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                    showOptions = false
                                }
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
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        showOptions = false
                    }
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 9))
                        Text("\(conv.memberCount)")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundColor(.white.opacity(0.5))
                }
            }
        } else {
            // Collapsed: avatar trigger — tap morphs into band
            ThemedAvatarButton(
                name: conversation?.name ?? "?",
                color: accentColor,
                secondaryColor: secondaryColor,
                isExpanded: false,
                hasStoryRing: headerHasStoryRing,
                avatarURL: conversation?.type == .direct ? conversation?.participantAvatarURL : conversation?.avatar,
                presenceState: headerPresenceState
            ) {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
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
    }

    // MARK: - Header Tags Row (category + colored tags, horizontally scrollable)
    @ViewBuilder
    private var headerTagsRow: some View {
        if conversationSection != nil || !(conversation?.tags.isEmpty ?? true) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) {
                    if let section = conversationSection {
                        HStack(spacing: 3) {
                            Image(systemName: section.icon)
                                .font(.system(size: 8, weight: .bold))
                            Text(section.name)
                                .font(.system(size: 9, weight: .bold))
                        }
                        .foregroundColor(Color(hex: section.color))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            Capsule()
                                .fill(Color(hex: section.color).opacity(0.2))
                                .overlay(
                                    Capsule()
                                        .stroke(Color(hex: section.color).opacity(0.3), lineWidth: 0.5)
                                )
                        )
                    }

                    if let conv = conversation {
                        ForEach(conv.tags) { tag in
                            Text(tag.name)
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundColor(Color(hex: tag.color))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(
                                    Capsule()
                                        .fill(Color(hex: tag.color).opacity(0.12))
                                        .overlay(
                                            Capsule()
                                                .stroke(Color(hex: tag.color).opacity(0.25), lineWidth: 0.5)
                                        )
                                )
                        }
                    }
                }
            }
            .padding(.leading, 28)
        }
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
            if unreadBadgeCount > 1 {
                // Multiple messages: prominent count display
                multipleUnreadContent
            } else {
                // Single unread or typing only: rich preview
                singleUnreadContent
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: 240)
    }

    private var multipleUnreadContent: some View {
        Group {
            // Typing indicator takes priority even with multiple unreads
            if hasTypingIndicator {
                HStack(spacing: 4) {
                    typingDotsView
                    Text(typingLabel)
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(1)
                }
            } else {
                HStack(spacing: 6) {
                    Text("\(unreadBadgeCount)")
                        .font(.system(size: 16, weight: .heavy))
                    Text("messages")
                        .font(.system(size: 12, weight: .medium))
                }
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.down")
                .font(.system(size: 11, weight: .bold))
        }
    }

    private var singleUnreadContent: some View {
        Group {
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

            // Right: chevron + unread count badge
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
            // Independently tappable play button (downloads + plays audio without scrolling)
            Image(systemName: scrollButtonAudioPlayer.isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 14, weight: .bold))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.white.opacity(scrollButtonAudioPlayer.isPlaying ? 0.4 : 0.25)))
                .contentShape(Circle())
                .highPriorityGesture(
                    TapGesture().onEnded {
                        HapticFeedback.light()
                        if scrollButtonAudioPlayer.isPlaying {
                            scrollButtonAudioPlayer.stop()
                        } else {
                            scrollButtonAudioPlayer.play(urlString: attachment.fileUrl)
                        }
                    }
                )
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

    private let typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    private var typingDotsView: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color.white)
                    .frame(width: 5, height: 5)
                    .offset(y: typingDotPhase == i ? -3 : 0)
                    .animation(
                        .spring(response: 0.3, dampingFraction: 0.5)
                            .delay(Double(i) * 0.1),
                        value: typingDotPhase
                    )
            }
        }
        .onReceive(typingDotTimer) { _ in
            typingDotPhase = (typingDotPhase + 1) % 3
        }
    }

    // MARK: - Inline Typing Indicator (shown after last message)
    @State private var inlineTypingDotPhase: Int = 0

    private var inlineTypingIndicator: some View {
        let isDark = theme.mode.isDark
        let accent = Color(hex: accentColor)

        return HStack(spacing: 8) {
            // Animated dots bubble (wave bounce)
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(accent.opacity(inlineTypingDotPhase == i ? 1.0 : 0.35))
                        .frame(width: 6, height: 6)
                        .offset(y: inlineTypingDotPhase == i ? -4 : 0)
                        .animation(
                            .spring(response: 0.3, dampingFraction: 0.5)
                                .delay(Double(i) * 0.1),
                            value: inlineTypingDotPhase
                        )
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
            .onReceive(typingDotTimer) { _ in
                inlineTypingDotPhase = (inlineTypingDotPhase + 1) % 3
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
            // Reply preview banner
            if let reply = pendingReplyReference {
                composerReplyBanner(reply)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

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

    // MARK: - Composer Reply Banner
    private func composerReplyBanner(_ reply: ReplyReference) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: reply.isMe ? accentColor : reply.authorColor))
                .frame(width: 3, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(reply.isMe ? "Vous" : reply.authorName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: reply.isMe ? accentColor : reply.authorColor))

                Text(reply.previewText)
                    .font(.system(size: 12))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    pendingReplyReference = nil
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
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

        let replyId = pendingReplyReference?.messageId.isEmpty == false ? pendingReplyReference?.messageId : nil
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
    @State private var showShareSheet = false
    @State private var shareURL: URL? = nil
    @State private var fullscreenAttachment: MessageAttachment? = nil
    @State private var showCarousel: Bool = false
    @State private var carouselIndex: Int = 0
    @ObservedObject private var theme = ThemeManager.shared

    private let gridMaxWidth: CGFloat = 300
    private let gridSpacing: CGFloat = 2

    private var bubbleColor: String {
        message.isMe ? contactColor : contactColor
    }

    private var visualAttachments: [MessageAttachment] {
        message.attachments.filter { [.image, .video].contains($0.type) }
    }

    private var audioAttachments: [MessageAttachment] {
        message.attachments.filter { $0.type == .audio }
    }

    private var nonMediaAttachments: [MessageAttachment] {
        message.attachments.filter { ![.image, .audio, .video].contains($0.type) }
    }

    private var hasTextOrNonMediaContent: Bool {
        let hasNonMedia = !nonMediaAttachments.isEmpty
        let hasText = !message.content.isEmpty
        let isAudioOnlyWithTranscription = hasText && !audioAttachments.isEmpty && visualAttachments.isEmpty && nonMediaAttachments.isEmpty
        if isAudioOnlyWithTranscription { return false }
        return hasText || hasNonMedia
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

                // Grille visuelle (images + vidéos)
                if !visualAttachments.isEmpty {
                    if showCarousel {
                        carouselView
                            .background(Color.black)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .transition(.opacity)
                    } else {
                        visualMediaGrid
                            .background(Color.black)
                            .compositingGroup()
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .transition(.opacity)
                    }
                }

                // Audio standalone
                ForEach(audioAttachments) { attachment in
                    mediaStandaloneView(attachment)
                }

                // Bulle texte + non-media attachments (file, location)
                if hasTextOrNonMediaContent {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(nonMediaAttachments) { attachment in
                            attachmentView(attachment)
                        }

                        if !message.content.isEmpty {
                            Text(message.content)
                                .font(.system(size: 15))
                                .foregroundColor(message.isMe ? .white : theme.textPrimary)
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
                }
            }
            .overlay(alignment: .bottomLeading) {
                reactionsOverlay
                    .padding(.leading, 8)
                    .offset(y: 20)
            }

            if !message.isMe { Spacer(minLength: 50) }
        }
        .padding(.bottom, 16)
        .alert("Navigation", isPresented: $showProfileAlert) {
            Button("OK") {}
        } message: {
            Text("Naviguer vers le profil de \(message.senderName ?? "?")")
        }
        .sheet(isPresented: $showShareSheet) {
            if let url = shareURL {
                ShareSheet(activityItems: [url])
            }
        }
        .fullScreenCover(item: $fullscreenAttachment) { attachment in
            switch attachment.type {
            case .image:
                let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
                ImageFullscreen(
                    imageUrl: urlStr.isEmpty ? nil : MeeshyConfig.resolveMediaURL(urlStr),
                    accentColor: contactColor
                )
            case .video:
                if !attachment.fileUrl.isEmpty {
                    VideoFullscreenPlayer(urlString: attachment.fileUrl, speed: .x1_0)
                }
            default:
                EmptyView()
            }
        }
    }

    // MARK: - Reply Preview
    private func replyPreview(_ reply: ReplyReference) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: reply.isMe ? contactColor : reply.authorColor))
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 2) {
                Text(reply.isMe ? "Vous" : reply.authorName)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(hex: reply.isMe ? contactColor : reply.authorColor))

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

    // MARK: - Visual Media Grid

    @ViewBuilder
    private var visualMediaGrid: some View {
        let items = visualAttachments

        switch items.count {
        case 1:
            visualGridCell(items[0])
                .frame(width: gridMaxWidth, height: 240)

        case 2:
            HStack(spacing: gridSpacing) {
                visualGridCell(items[0])
                visualGridCell(items[1])
            }
            .frame(width: gridMaxWidth, height: 180)

        case 3:
            let leftW = (gridMaxWidth - gridSpacing) * 0.6
            let rightW = (gridMaxWidth - gridSpacing) * 0.4
            HStack(spacing: gridSpacing) {
                visualGridCell(items[0])
                    .frame(width: leftW)
                VStack(spacing: gridSpacing) {
                    visualGridCell(items[1])
                    visualGridCell(items[2], isFirstRow: false)
                }
                .frame(width: rightW)
            }
            .frame(width: gridMaxWidth, height: 240)

        default:
            let overflow = items.count - 3
            VStack(spacing: gridSpacing) {
                HStack(spacing: gridSpacing) {
                    visualGridCell(items[0])
                    visualGridCell(items[1])
                }
                HStack(spacing: gridSpacing) {
                    visualGridCell(items[2], isFirstRow: false)
                    visualGridCell(items[3], overflowCount: overflow, isFirstRow: false)
                }
            }
            .frame(width: gridMaxWidth, height: 240)
        }
    }

    @ViewBuilder
    private func visualGridCell(_ attachment: MessageAttachment, overflowCount: Int = 0, isFirstRow: Bool = true) -> some View {
        ZStack {
            Color.black

            switch attachment.type {
            case .image:
                gridImageCell(attachment)
            case .video:
                gridVideoCell(attachment)
            default:
                EmptyView()
            }

            if overflowCount > 0 {
                Color.black.opacity(0.5)
                Text("+\(overflowCount)")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture {
            if overflowCount > 0 {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showCarousel = true
                    carouselIndex = 0
                }
                HapticFeedback.light()
            } else {
                Task {
                    let cached = await MediaCacheManager.shared.isCached(attachment.fileUrl)
                    if cached {
                        fullscreenAttachment = attachment
                        HapticFeedback.light()
                    }
                }
            }
        }
        .overlay(alignment: .bottom) {
            downloadBadge(attachment)
                .padding(.bottom, 6)
        }
    }

    // MARK: - Carousel View

    @State private var carouselDragOffset: CGFloat = 0

    private var carouselWidth: CGFloat {
        UIScreen.main.bounds.width - 32 // Full width minus padding
    }

    @ViewBuilder
    private var carouselView: some View {
        let items = visualAttachments
        let itemWidth = carouselWidth
        let totalOffset = -CGFloat(carouselIndex) * itemWidth + carouselDragOffset

        ZStack(alignment: .top) {
            HStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, attachment in
                    ZStack {
                        Color.black

                        switch attachment.type {
                        case .image:
                            carouselImageCell(attachment)
                        case .video:
                            gridVideoCell(attachment)
                        default:
                            EmptyView()
                        }
                    }
                    .frame(width: itemWidth, height: 280)
                    .clipped()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        fullscreenAttachment = attachment
                        HapticFeedback.light()
                    }
                }
            }
            .offset(x: totalOffset)
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: carouselIndex)
            .animation(.interactiveSpring(), value: carouselDragOffset)
            .highPriorityGesture(
                DragGesture(minimumDistance: 15)
                    .onChanged { value in
                        if abs(value.translation.width) > abs(value.translation.height) {
                            carouselDragOffset = value.translation.width
                        }
                    }
                    .onEnded { value in
                        let threshold: CGFloat = itemWidth * 0.25
                        let velocity = value.predictedEndTranslation.width - value.translation.width

                        if value.translation.width < -threshold || velocity < -100 {
                            carouselIndex = min(carouselIndex + 1, items.count - 1)
                        } else if value.translation.width > threshold || velocity > 100 {
                            carouselIndex = max(carouselIndex - 1, 0)
                        }
                        carouselDragOffset = 0
                        HapticFeedback.light()
                    }
            )
            .frame(width: itemWidth, height: 280)
            .clipped()

            HStack {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showCarousel = false
                    }
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(Color.black.opacity(0.6)))
                }
                .padding(8)

                Spacer()

                Text("\(carouselIndex + 1)/\(items.count)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.black.opacity(0.6)))
                    .padding(8)
            }
        }
        .task {
            // Pre-download all attachments when carousel opens
            for attachment in items {
                Task {
                    _ = try? await MediaCacheManager.shared.image(
                        for: MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func gridImageCell(_ attachment: MessageAttachment) -> some View {
        // Use full image (fileUrl) when available, fallback to thumbnail
        let fullUrl = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
        let thumbUrl = attachment.thumbnailUrl
        let urlStr = fullUrl ?? thumbUrl ?? ""
        if !urlStr.isEmpty {
            CachedAsyncImage(url: urlStr) {
                // Show thumbnail as placeholder while full image loads
                if let thumbUrl, fullUrl != nil, thumbUrl != fullUrl {
                    CachedAsyncImage(url: thumbUrl) {
                        Color(hex: attachment.thumbnailColor).shimmer()
                    }
                    .aspectRatio(contentMode: .fill)
                } else {
                    Color(hex: attachment.thumbnailColor).shimmer()
                }
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
        } else {
            Color(hex: attachment.thumbnailColor)
                .overlay(Image(systemName: "photo").foregroundColor(.white.opacity(0.5)))
        }
    }

    @ViewBuilder
    private func carouselImageCell(_ attachment: MessageAttachment) -> some View {
        // Always use full image in carousel
        let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
        if !urlStr.isEmpty {
            CachedAsyncImage(url: urlStr) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fit)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
        } else {
            Color(hex: attachment.thumbnailColor)
                .overlay(Image(systemName: "photo").foregroundColor(.white.opacity(0.5)))
        }
    }

    @ViewBuilder
    private func gridVideoCell(_ attachment: MessageAttachment) -> some View {
        let thumbUrl = attachment.thumbnailUrl ?? ""
        ZStack {
            if !thumbUrl.isEmpty {
                CachedAsyncImage(url: thumbUrl) {
                    Color(hex: attachment.thumbnailColor).shimmer()
                }
                .aspectRatio(contentMode: .fill)
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                .clipped()
            } else if !attachment.fileUrl.isEmpty {
                VideoThumbnailView(
                    videoUrlString: attachment.fileUrl,
                    accentColor: attachment.thumbnailColor
                )
            } else {
                Color(hex: attachment.thumbnailColor)
            }

            CachedPlayIcon(fileUrl: attachment.fileUrl)
        }
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
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark

        return RoundedRectangle(cornerRadius: 18)
            .fill(
                message.isMe ?
                LinearGradient(
                    colors: [accent, accent.opacity(0.8)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ) :
                LinearGradient(
                    colors: [
                        accent.opacity(isDark ? 0.35 : 0.25),
                        accent.opacity(isDark ? 0.2 : 0.15)
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
                            colors: [accent.opacity(0.5), accent.opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: message.isMe ? 0 : 1
                    )
            )
    }

    // MARK: - Media Standalone View
    @ViewBuilder
    private func mediaStandaloneView(_ attachment: MessageAttachment) -> some View {
        switch attachment.type {
        case .audio:
            AudioMediaView(
                attachment: attachment,
                message: message,
                contactColor: contactColor,
                visualAttachments: visualAttachments,
                theme: theme,
                onShareFile: { url in
                    shareURL = url
                    showShareSheet = true
                }
            )

        default:
            EmptyView()
        }
    }

    // MARK: - Audio Bubble Background
    private var audioBubbleBackground: some View {
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark
        return RoundedRectangle(cornerRadius: 20)
            .fill(isDark ? accent.opacity(0.15) : accent.opacity(0.08))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(accent.opacity(isDark ? 0.25 : 0.15), lineWidth: 1)
            )
    }

    // MARK: - Download Badge (delegated to DownloadBadgeView)

    private func downloadBadge(_ attachment: MessageAttachment) -> some View {
        DownloadBadgeView(
            attachment: attachment,
            accentColor: contactColor,
            onShareFile: { url in
                shareURL = url
                showShareSheet = true
            }
        )
    }
}

// MARK: - Share Sheet
struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Download Badge View (3 states: idle → downloading → cached)
struct DownloadBadgeView: View {
    let attachment: MessageAttachment
    let accentColor: String
    var onShareFile: ((URL) -> Void)? = nil

    @StateObject private var downloader = AttachmentDownloader()
    private var accent: Color { Color(hex: accentColor) }

    private var totalSizeText: String {
        if downloader.totalBytes > 0 { return AttachmentDownloader.fmt(downloader.totalBytes) }
        if attachment.fileSize > 0 { return AttachmentDownloader.fmt(Int64(attachment.fileSize)) }
        return ""
    }

    var body: some View {
        Group {
            if downloader.isCached {
                EmptyView()
            } else if downloader.isDownloading {
                downloadingBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                idleBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: downloader.isCached)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: downloader.isDownloading)
    }

    private var idleBadge: some View {
        Button {
            downloader.start(attachment: attachment, onShare: onShareFile)
        } label: {
            HStack(spacing: 3) {
                if !totalSizeText.isEmpty {
                    Text(totalSizeText)
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundColor(.white)
                }
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 16))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, accent.opacity(0.85))
            }
            .padding(.horizontal, 5)
            .padding(.vertical, 3)
            .background(Capsule().fill(.black.opacity(0.5)))
        }
        .padding(4)
        .task { await downloader.checkCache(attachment.fileUrl) }
    }

    private var downloadingBadge: some View {
        Button { downloader.cancel() } label: {
            VStack(spacing: 2) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.15), lineWidth: 2.5)
                    Circle()
                        .trim(from: 0, to: downloader.progress)
                        .stroke(accent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.2), value: downloader.progress)

                    if downloader.progress > 0 {
                        Text("\(Int(downloader.progress * 100))")
                            .font(.system(size: 7, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    } else {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.white)
                            .frame(width: 7, height: 7)
                    }
                }
                .frame(width: 24, height: 24)

                Text("\(AttachmentDownloader.fmt(downloader.downloadedBytes))/\(totalSizeText)")
                    .font(.system(size: 7, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            .padding(5)
            .background(RoundedRectangle(cornerRadius: 8).fill(.black.opacity(0.6)))
        }
        .padding(4)
    }
}

// MARK: - Attachment Downloader (real byte-level progress via URLSession.bytes)
@MainActor
final class AttachmentDownloader: ObservableObject {
    @Published var isCached = false
    @Published var isDownloading = false
    @Published var downloadedBytes: Int64 = 0
    @Published var totalBytes: Int64 = 0

    var progress: Double {
        guard totalBytes > 0 else { return 0 }
        return min(Double(downloadedBytes) / Double(totalBytes), 1.0)
    }

    private var downloadTask: Task<Void, Never>?

    func checkCache(_ urlString: String) async {
        let cached = await MediaCacheManager.shared.isCached(urlString)
        if cached { isCached = true }
    }

    func start(attachment: MessageAttachment, onShare: ((URL) -> Void)?) {
        let fileUrl = attachment.fileUrl
        guard !fileUrl.isEmpty else { return }
        isDownloading = true
        downloadedBytes = 0
        totalBytes = Int64(attachment.fileSize)
        HapticFeedback.light()

        downloadTask = Task.detached { [weak self] in
            do {
                guard let url = MeeshyConfig.resolveMediaURL(fileUrl) else { throw URLError(.badURL) }

                let (asyncBytes, response) = try await URLSession.shared.bytes(from: url)

                guard let http = response as? HTTPURLResponse,
                      (200...299).contains(http.statusCode) else {
                    throw URLError(.badServerResponse)
                }

                let expectedLength = http.expectedContentLength
                if expectedLength > 0 {
                    await MainActor.run { [weak self] in self?.totalBytes = expectedLength }
                }

                var data = Data()
                if expectedLength > 0 {
                    data.reserveCapacity(Int(expectedLength))
                }

                var buffer = [UInt8]()
                buffer.reserveCapacity(16384)

                for try await byte in asyncBytes {
                    guard !Task.isCancelled else { return }
                    buffer.append(byte)

                    if buffer.count >= 16384 {
                        data.append(contentsOf: buffer)
                        buffer.removeAll(keepingCapacity: true)
                        let current = Int64(data.count)
                        await MainActor.run { [weak self] in self?.downloadedBytes = current }
                    }
                }

                guard !Task.isCancelled else { return }

                if !buffer.isEmpty {
                    data.append(contentsOf: buffer)
                }

                await MediaCacheManager.shared.store(data, for: fileUrl)

                let finalSize = Int64(data.count)
                await MainActor.run { [weak self] in
                    self?.downloadedBytes = finalSize
                    self?.totalBytes = finalSize
                    self?.isDownloading = false
                    self?.isCached = true
                    HapticFeedback.success()
                }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run { [weak self] in
                    self?.isDownloading = false
                    HapticFeedback.error()
                }
            }
        }
    }

    func cancel() {
        downloadTask?.cancel()
        downloadTask = nil
        isDownloading = false
        downloadedBytes = 0
        HapticFeedback.light()
    }

    static func fmt(_ bytes: Int64) -> String {
        let kb = Double(bytes) / 1024
        if kb < 1 { return "\(bytes)B" }
        if kb < 1024 { return String(format: "%.0fKB", kb) }
        return String(format: "%.1fMB", kb / 1024)
    }
}

// MARK: - Cached Play Icon (active when media is locally cached, polls until available)
struct CachedPlayIcon: View {
    let fileUrl: String
    @State private var isCached = false

    var body: some View {
        Group {
            if isCached {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(.white, Color.black.opacity(0.4))
                    .shadow(color: .black.opacity(0.4), radius: 4, y: 2)
                    .transition(.scale(scale: 0.5).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: isCached)
        .task {
            while !Task.isCancelled && !isCached {
                let cached = await MediaCacheManager.shared.isCached(fileUrl)
                if cached {
                    isCached = true
                    break
                }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
    }
}

// MARK: - Audio Media View (shows placeholder until cached, then full player)
struct AudioMediaView: View {
    let attachment: MessageAttachment
    let message: Message
    let contactColor: String
    let visualAttachments: [MessageAttachment]
    @ObservedObject var theme: ThemeManager
    var onShareFile: ((URL) -> Void)?

    @State private var isCached = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack {
                if isCached {
                    AudioPlayerView(
                        attachment: attachment,
                        context: .messageBubble,
                        accentColor: contactColor
                    )
                    .transition(.opacity)
                } else {
                    audioPlaceholder
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: isCached)
            .overlay(alignment: .bottom) {
                DownloadBadgeView(
                    attachment: attachment,
                    accentColor: contactColor,
                    onShareFile: onShareFile
                )
                .padding(.bottom, 6)
            }

            if !message.content.isEmpty && visualAttachments.isEmpty {
                Text(message.content)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(3)
                    .padding(.leading, 4)
                    .padding(.top, 2)
            }
        }
        .task {
            while !Task.isCancelled && !isCached {
                let cached = await MediaCacheManager.shared.isCached(attachment.fileUrl)
                if cached {
                    isCached = true
                    break
                }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    private var audioPlaceholder: some View {
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark
        let duration = Double(attachment.duration ?? 0) / 1000.0

        return HStack(spacing: 8) {
            // Disabled play circle
            ZStack {
                Circle()
                    .fill(accent.opacity(0.3))
                    .frame(width: 34, height: 34)
                Image(systemName: "play.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white.opacity(0.3))
                    .offset(x: 1)
            }

            // Static waveform placeholder
            HStack(spacing: 2) {
                ForEach(0..<25, id: \.self) { i in
                    let height = CGFloat.random(in: 6...22)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(accent.opacity(0.2))
                        .frame(width: 2, height: height)
                }
            }
            .frame(height: 26)

            Spacer()

            // Duration label
            if duration > 0 {
                Text(formatDuration(duration))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(isDark ? accent.opacity(0.15) : accent.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(accent.opacity(isDark ? 0.25 : 0.15), lineWidth: 1)
                )
        )
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
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
