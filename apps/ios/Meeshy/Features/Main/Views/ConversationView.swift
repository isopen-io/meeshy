import SwiftUI
import PhotosUI
import CoreLocation
import AVFoundation
import Contacts
import MeeshySDK
import MeeshyUI

// MARK: - Swipe-to-go-back enabler
// Réactive le geste de retour par bord gauche d'iOS quand la nav bar est masquée.

private struct InteractivePopEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> PopEnablerVC { PopEnablerVC() }
    func updateUIViewController(_ vc: PopEnablerVC, context: Context) {}

    final class PopEnablerVC: UIViewController {
        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            navigationController?.interactivePopGestureRecognizer?.isEnabled = true
            // delegate = nil permet le geste même sans barre de navigation visible
            navigationController?.interactivePopGestureRecognizer?.delegate = nil
        }
    }
}

// MARK: - Message Frame PreferenceKey

struct MessageFrameKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { $1 }
    }
}

// MARK: - Active Member (for conversation detail header)
struct ConversationActiveMember: Identifiable { // internal for cross-file extension access
    let id: String
    let name: String
    let color: String
    let avatarURL: String?
}

struct ConversationView: View {
    let conversation: Conversation?
    var replyContext: ReplyContext? = nil

    // NOTE: Properties below are internal (not private) for cross-file extension access.
    // Extensions in ConversationView+MessageRow, +Header, +ScrollIndicators, +Composer.

    @Environment(\.dismiss) private var dismiss
    @ObservedObject var theme = ThemeManager.shared
    @ObservedObject var presenceManager = PresenceManager.shared
    @ObservedObject var socketManager = MessageSocketManager.shared
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var router: Router
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @StateObject var viewModel: ConversationViewModel
    @State var messageText = ""
    @State var showOptions = false
    @State var actionAlert: String? = nil
    @State var forwardMessage: Message? = nil
    @State var showConversationInfo = false
    @StateObject var audioRecorder = AudioRecorderManager()
    @State var pendingAttachments: [MessageAttachment] = []
    @State var pendingAudioURL: URL? = nil
    @State var pendingMediaFiles: [String: URL] = [:]
    @State var pendingThumbnails: [String: UIImage] = [:]
    @State var isLoadingMedia = false
    @State var showPhotoPicker = false
    @State var showCamera = false
    @State var showFilePicker = false
    @State var selectedPhotoItems: [PhotosPickerItem] = []
    @State var isLoadingLocation = false
    @State var isUploading = false
    @State var uploadProgress: UploadQueueProgress?
    @State var showLocationPicker = false
    @FocusState var isTyping: Bool
    @State var pendingReplyReference: ReplyReference?
    @State var editingMessageId: String?
    @State var editingOriginalContent: String?
    @State var showStoryViewerFromHeader = false
    @State var storyGroupIndexForHeader = 0

    // Overlay menu state
    @State var overlayMessage: Message? = nil
    @State var showOverlayMenu = false
    @State var overlayMessageFrame: CGRect = .zero
    @State var messageFrames: [String: CGRect] = [:]
    @State var longPressEnabled = false

    // Detail sheet state
    @State var showMessageDetailSheet = false
    @State var detailSheetMessage: Message? = nil
    @State var detailSheetInitialTab: DetailTab? = nil

    // Reaction bar state
    @State var quickReactionMessageId: String? = nil
    @State var emojiOnlyMode: Bool = false
    @State var deleteConfirmMessageId: String? = nil

    // Scroll state
    @State var isNearBottom: Bool = true
    @State var unreadBadgeCount: Int = 0
    @State var scrollToBottomTrigger: Int = 0
    @State var scrollToMessageId: String? = nil
    @State var highlightedMessageId: String? = nil
    @StateObject var scrollButtonAudioPlayer = AudioPlayerManager()
    @StateObject var pendingAudioPlayer = AudioPlayerManager()
    @State var previewingPendingImage: UIImage? = nil
    @State var imageToPreview: UIImage? = nil
    @State var videoToPreview: URL? = nil

    // Search state
    @State var showSearch = false
    @State var searchQuery = ""
    // searchResultIds and searchCurrentIndex removed — backend search uses viewModel.searchResults
    @FocusState var isSearchFocused: Bool

    // Conversation-level media gallery
    @State var galleryStartAttachment: MessageAttachment? = nil

    // Swipe state
    @State var swipedMessageId: String? = nil
    @State var swipeOffset: CGFloat = 0

    // Contact picker state
    @State var showContactPicker = false

    // Emoji picker state
    @State var showTextEmojiPicker = false
    @State var emojiToInject = ""

    // Typing dot state
    @State var typingDotPhase: Int = 0
    let typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()
    @State var inlineTypingDotPhase: Int = 0

    let defaultReactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "💯", "😍", "👀", "🤣", "💪", "✨", "🥺"]

    // MARK: - Computed Properties

    var headerHasStoryRing: Bool {
        guard let userId = conversation?.participantUserId else { return false }
        return storyViewModel.hasStories(forUserId: userId)
    }

    var accentColor: String {
        conversation?.accentColor ?? DynamicColorGenerator.colorForName(conversation?.name ?? "Unknown")
    }

    var secondaryColor: String {
        conversation?.colorPalette.secondary ?? "4ECDC4"
    }

    var isDirect: Bool {
        conversation?.type == .direct
    }

    var headerPresenceState: PresenceState {
        guard isDirect, let userId = conversation?.participantUserId else { return .offline }
        return presenceManager.presenceState(for: userId)
    }

    private var headerMoodEmoji: String? {
        guard isDirect, let userId = conversation?.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)?.moodEmoji
    }

    var conversationSection: ConversationSection? {
        guard let sectionId = conversation?.sectionId else { return nil }
        return ConversationSection.allSections.first { $0.id == sectionId }
    }

    var topActiveMembers: [ConversationActiveMember] {
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

    private var isCurrentUserAdminOrMod: Bool {
        let role = conversation?.currentUserRole?.uppercased() ?? ""
        return ["ADMIN", "MODERATOR", "BIGBOSS"].contains(role)
    }

    var composerHeight: CGFloat {
        var height: CGFloat = 130 // UCB base + topToolbar
        if !pendingAttachments.isEmpty { height += 110 }
        if editingMessageId != nil { height += 52 }
        if pendingReplyReference != nil && editingMessageId == nil { height += 52 }
        return height
    }

    // MARK: - Init

    init(conversation: Conversation?, replyContext: ReplyContext? = nil) {
        self.conversation = conversation
        self.replyContext = replyContext
        _viewModel = StateObject(wrappedValue: ConversationViewModel(conversationId: conversation?.id ?? "", unreadCount: conversation?.unreadCount ?? 0))
    }

    // MARK: - Date Sections

    private func shouldShowDateSection(at index: Int) -> Bool {
        guard index > 0 else { return true }
        let current = viewModel.messages[index].createdAt
        let previous = viewModel.messages[index - 1].createdAt
        return current.timeIntervalSince(previous) > 3600
    }

    private func formatDateSection(for date: Date) -> String {
        let calendar = Calendar.current
        let now = Date()
        let hour = calendar.component(.hour, from: date)
        let minute = calendar.component(.minute, from: date)
        let timeStr = minute == 0 ? "\(hour)h" : String(format: "%dh%02d", hour, minute)

        if calendar.isDateInToday(date) {
            return "\(String(localized: "date.today", defaultValue: "Aujourd'hui")) \(timeStr)"
        }
        if calendar.isDateInYesterday(date) {
            return "\(String(localized: "date.yesterday", defaultValue: "Hier")) \(timeStr)"
        }
        if let sevenDaysAgo = calendar.date(byAdding: .day, value: -7, to: now), date > sevenDaysAgo {
            let formatter = DateFormatter()
            formatter.locale = Locale.current
            formatter.dateFormat = "EEEE"
            return "\(formatter.string(from: date).capitalized) \(timeStr)"
        }
        if calendar.component(.year, from: date) == calendar.component(.year, from: now) {
            let formatter = DateFormatter()
            formatter.locale = Locale.current
            formatter.dateFormat = "EEEE d MMM"
            return formatter.string(from: date).capitalized
        }
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        formatter.dateFormat = "EEEE d MMM yyyy"
        return formatter.string(from: date).capitalized
    }

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
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    // MARK: - Unread Separator

    private var unreadSeparator: some View {
        HStack(spacing: 10) {
            Rectangle()
                .fill(MeeshyColors.coral.opacity(0.5))
                .frame(height: 1)
                .accessibilityHidden(true)
            Text("Nouveaux messages")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(MeeshyColors.coral)
                .lineLimit(1)
                .fixedSize()
            Rectangle()
                .fill(MeeshyColors.coral.opacity(0.5))
                .frame(height: 1)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 4)
        .id("unread_separator")
        .transition(.opacity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Nouveaux messages non lus")
        .accessibilityAddTraits(.isHeader)
    }

    // MARK: - Body

    var body: some View {
        bodyContent
            // Réactive le swipe de bord gauche pour revenir en arrière (désactivé par navigationBarHidden)
            .background(InteractivePopEnabler())
            .task { await viewModel.loadMessages(); MessageSocketManager.shared.connect() }
            .onAppear {
                if let context = replyContext { pendingReplyReference = context.toReplyReference }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { longPressEnabled = true }
            }
            .onChange(of: isNearBottom) { _, _ in
                if showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showTextEmojiPicker = false }
                }
            }
            .onChange(of: isTyping) { _, focused in
                if focused && showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showTextEmojiPicker = false }
                }
            }
            .fullScreenCover(isPresented: $showStoryViewerFromHeader) {
                if storyGroupIndexForHeader < storyViewModel.storyGroups.count {
                    StoryViewerView(viewModel: storyViewModel, groups: [storyViewModel.storyGroups[storyGroupIndexForHeader]], currentGroupIndex: 0, isPresented: $showStoryViewerFromHeader)
                }
            }
            .sheet(isPresented: $showConversationInfo) {
                if let conv = conversation { ConversationInfoSheet(conversation: conv, accentColor: accentColor, messages: viewModel.messages) }
            }
            .alert("Action sélectionnée", isPresented: Binding(get: { actionAlert != nil }, set: { if !$0 { actionAlert = nil } })) {
                Button("OK") { actionAlert = nil }
            } message: { Text(actionAlert ?? "") }
            .alert("Supprimer ce message ?", isPresented: Binding(get: { deleteConfirmMessageId != nil }, set: { if !$0 { deleteConfirmMessageId = nil } })) {
                Button("Annuler", role: .cancel) { deleteConfirmMessageId = nil }
                Button("Supprimer", role: .destructive) {
                    if let msgId = deleteConfirmMessageId { Task { await viewModel.deleteMessage(messageId: msgId) } }
                    deleteConfirmMessageId = nil
                }
            } message: { Text("Cette action est irréversible.") }
            .sheet(item: $forwardMessage) { msgToForward in
                ForwardPickerSheet(message: msgToForward, sourceConversationId: conversation?.id ?? "", accentColor: accentColor) { forwardMessage = nil }
                    .presentationDetents([.medium, .large])
            }
            .onPreferenceChange(MessageFrameKey.self) { frames in messageFrames = frames }
            .overlay { overlayMenuContent }
            .fullScreenCover(item: $galleryStartAttachment) { startAttachment in
                ConversationMediaGalleryView(
                    allAttachments: viewModel.allVisualAttachments,
                    startAttachmentId: startAttachment.id,
                    accentColor: accentColor,
                    captionMap: viewModel.mediaCaptionMap,
                    senderInfoMap: viewModel.mediaSenderInfoMap
                )
            }
            .sheet(isPresented: $showMessageDetailSheet) {
                if let msg = detailSheetMessage {
                    MessageDetailSheet(
                        message: msg,
                        contactColor: conversation?.accentColor ?? "#FF2E63",
                        conversationId: viewModel.conversationId,
                        initialTab: detailSheetInitialTab,
                        canDelete: msg.isMe || isCurrentUserAdminOrMod,
                        textTranslations: viewModel.messageTranslations[msg.id] ?? [],
                        transcription: viewModel.messageTranscriptions[msg.id],
                        translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
                        onSelectTranslation: { translation in
                            viewModel.setActiveTranslation(for: msg.id, translation: translation)
                        },
                        onSelectAudioLanguage: { langCode in
                            viewModel.setActiveAudioLanguage(for: msg.id, language: langCode)
                        },
                        onRequestTranslation: { messageId, lang in
                            MessageSocketManager.shared.requestTranslation(messageId: messageId, targetLanguage: lang)
                        },
                        onReact: { emoji in
                            viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                        },
                        onReport: { type, reason in
                            Task {
                                let success = await viewModel.reportMessage(messageId: msg.id, reportType: type, reason: reason)
                                if success { HapticFeedback.success() }
                                else { HapticFeedback.error() }
                            }
                        },
                        onDelete: {
                            Task { await viewModel.deleteMessage(messageId: msg.id) }
                        }
                    )
                }
            }
            .withStatusBubble()
    }

    // MARK: - Body Content (extracted to help type-checker)

    @ViewBuilder
    private var bodyContent: some View {
        ZStack {
            conversationBackground

            messageScrollView

            floatingHeaderSection

            // Connection status banner
            VStack {
                Color.clear.frame(height: showOptions ? 72 : 56)
                ConnectionBanner()
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: socketManager.isConnected)
                Spacer()
            }
            .zIndex(98)
            .allowsHitTesting(false)

            // Status bar gradient — from very top edge of screen through status bar
            VStack(spacing: 0) {
                LinearGradient(
                    stops: [
                        .init(color: Color.black.opacity(0.75), location: 0),
                        .init(color: Color.black.opacity(0.4), location: 0.55),
                        .init(color: Color.clear, location: 1)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 100)
                Spacer()
            }
            .ignoresSafeArea(edges: .top)
            .zIndex(99)
            .allowsHitTesting(false)
            .accessibilityHidden(true)

            if !isNearBottom {
                VStack { Spacer(); HStack { Spacer(); scrollToBottomButton.padding(.trailing, 16).padding(.bottom, composerHeight + 8) } }
                    .zIndex(60)
                    .transition(.asymmetric(insertion: .scale(scale: 0.8).combined(with: .opacity), removal: .scale(scale: 0.6).combined(with: .opacity)))
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isNearBottom)
            }

            VStack {
                Spacer()
                VStack(spacing: 0) {
                    if showTextEmojiPicker {
                        EmojiKeyboardPanel(
                            style: theme.mode.isDark ? .dark : .light,
                            onSelect: { emoji in
                                emojiToInject = emoji
                            }
                        )
                        .frame(height: 260)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    themedComposer
                }
                .background(
                    theme.mode.isDark
                        ? Color.black.opacity(0.6)
                        : Color(UIColor.systemBackground).opacity(0.95)
                )
                .background(.ultraThinMaterial)
                .ignoresSafeArea(.container, edges: .bottom)
            }
            .zIndex(50)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showTextEmojiPicker)

            searchResultsBlurOverlay
            returnToLatestButton
        }
    }

    // MARK: - Message Scroll View (extracted to help type-checker)

    @ViewBuilder
    private var messageScrollView: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 10) {
                    if viewModel.hasOlderMessages {
                        if viewModel.isLoadingOlder {
                            HStack(spacing: 8) {
                                ProgressView().tint(Color(hex: accentColor))
                                Text(String(localized: "loading", defaultValue: "Chargement..."))
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.secondary)
                            }
                            .frame(height: 36).transition(.opacity)
                        } else {
                            Color.clear.frame(height: 1)
                                .onAppear {
                                    guard !viewModel.isProgrammaticScroll else { return }
                                    Task { await viewModel.loadOlderMessages() }
                                }
                        }
                    }

                    Color.clear.frame(height: 70)

                    if viewModel.isLoadingInitial && viewModel.messages.isEmpty {
                        ForEach(0..<6, id: \.self) { index in
                            SkeletonMessageBubble(index: index)
                                .staggeredAppear(index: index, baseDelay: 0.04)
                        }
                        .transition(.opacity)
                    }

                    ForEach(viewModel.messages) { msg in
                        let index = viewModel.messages.firstIndex(where: { $0.id == msg.id }) ?? 0
                        if shouldShowDateSection(at: index) { dateSectionView(for: msg.createdAt) }
                        if msg.id == viewModel.firstUnreadMessageId { unreadSeparator }
                        messageRow(index: index, msg: msg)
                    }

                    if !viewModel.typingUsernames.isEmpty {
                        inlineTypingIndicator
                            .id("typing_indicator")
                            .transition(.opacity.combined(with: .scale(scale: 0.9)))
                            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.typingUsernames.count)
                    }

                    if viewModel.hasNewerMessages && !viewModel.isLoadingNewer {
                        Color.clear.frame(height: 1)
                            .onAppear {
                                guard !viewModel.isProgrammaticScroll else { return }
                                Task { await viewModel.loadNewerMessages() }
                            }
                    }

                    Color.clear.frame(height: 1).id("near_bottom_anchor")
                        .onAppear {
                            isNearBottom = true; unreadBadgeCount = 0; viewModel.lastUnreadMessage = nil
                            if viewModel.firstUnreadMessageId != nil {
                                withAnimation(.easeOut(duration: 0.3)) { viewModel.firstUnreadMessageId = nil }
                            }
                        }
                        .onDisappear { isNearBottom = false }

                    Color.clear.frame(height: composerHeight).id("bottom_spacer")
                }
                .padding(.horizontal, 16)
            }
            .onChange(of: viewModel.isLoadingInitial) { wasLoading, isLoading in
                if wasLoading && !isLoading, let last = viewModel.messages.last {
                    viewModel.markProgrammaticScroll()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                        withAnimation(.easeOut(duration: 0.4)) { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }
            .onChange(of: viewModel.newMessageAppended) { _, _ in
                guard let lastMsg = viewModel.messages.last else { return }
                if isNearBottom || lastMsg.isMe {
                    viewModel.markProgrammaticScroll()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { proxy.scrollTo(lastMsg.id, anchor: .bottom) }
                } else { unreadBadgeCount += 1 }
            }
            .onChange(of: viewModel.isLoadingOlder) { wasLoading, isLoading in
                if wasLoading && !isLoading, let anchorId = viewModel.scrollAnchorId {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                        proxy.scrollTo(anchorId, anchor: .top); viewModel.scrollAnchorId = nil
                    }
                }
            }
            .onChange(of: pendingAttachments.count) { _, _ in
                if isNearBottom, let last = viewModel.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
            }
            .onChange(of: audioRecorder.isRecording) { _, _ in
                if isNearBottom, let last = viewModel.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
            }
            .onChange(of: scrollToBottomTrigger) { _, _ in
                viewModel.markProgrammaticScroll()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { proxy.scrollTo("bottom_spacer", anchor: .bottom) }
            }
            .onChange(of: scrollToMessageId) { _, targetId in
                guard let targetId else { return }
                scrollToMessageId = nil
                scrollToAndHighlight(targetId, proxy: proxy)
            }
        }
    }

    // MARK: - Floating Header Section (extracted to help type-checker)

    @ViewBuilder
    private var floatingHeaderSection: some View {
        VStack {
            if isTyping {
                HStack(spacing: 8) {
                    ThemedBackButton(color: accentColor) { HapticFeedback.light(); dismiss() }
                    Spacer()
                    ThemedAvatarButton(
                        name: conversation?.name ?? "?", color: accentColor, secondaryColor: secondaryColor,
                        isExpanded: false, hasStoryRing: headerHasStoryRing,
                        avatarURL: conversation?.type == .direct ? conversation?.participantAvatarURL : conversation?.avatar,
                        presenceState: headerPresenceState
                    ) {
                        isTyping = false
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { showOptions = true }
                    }
                }
                .padding(.horizontal, 16).padding(.top, 8)
                .transition(.opacity)
            } else {
                expandedHeaderBand
            }

            if showSearch {
                searchBar.transition(.move(edge: .top).combined(with: .opacity))
            }

            Spacer()
        }
        .zIndex(100)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showOptions)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isTyping)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showSearch)
    }

    @ViewBuilder
    private var expandedHeaderBand: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                ThemedBackButton(color: accentColor, compactMode: showOptions) { HapticFeedback.light(); dismiss() }

                if showOptions {
                    // Title row: name + tags scroll + call buttons + search icon
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 4) {
                            Button { showConversationInfo = true } label: {
                                Text(conversation?.name ?? "Conversation")
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                    .foregroundColor(.white).lineLimit(1)
                                    .fixedSize()
                            }
                            .accessibilityLabel(conversation?.name ?? "Conversation")
                            .accessibilityHint("Ouvre les informations de la conversation")
                            if let mood = headerMoodEmoji { Text(mood).font(.system(size: 14)) }
                            Spacer(minLength: 4)
                            headerCallButtons
                            Button {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showSearch = true }
                                isSearchFocused = true
                            } label: {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(LinearGradient(colors: [Color(hex: accentColor), Color(hex: secondaryColor)], startPoint: .topLeading, endPoint: .bottomTrailing))
                                    .frame(width: 28, height: 28)
                                    .background(Circle().fill(Color(hex: accentColor).opacity(0.15)))
                            }
                            .accessibilityLabel("Rechercher dans la conversation")
                        }

                        // Tags row: aligned with title, scrolls under the search icon
                        headerTagsRow
                            .mask(
                                HStack(spacing: 0) {
                                    Color.black
                                    LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                                        .frame(width: 24)
                                }
                            )
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                } else {
                    Spacer()
                }

                headerAvatarView
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
                                    LinearGradient(colors: [Color(hex: accentColor).opacity(0.4), Color(hex: secondaryColor).opacity(0.15)], startPoint: .leading, endPoint: .trailing),
                                    lineWidth: 1
                                )
                        )
                        .shadow(color: Color(hex: accentColor).opacity(0.2), radius: 8, y: 2)
                        .transition(.scale(scale: 0.1, anchor: .trailing).combined(with: .opacity))
                }
            }
        )
        .padding(.horizontal, showOptions ? 8 : 16).padding(.top, 8)
    }

    // MARK: - Overlay Menu Content (extracted to help type-checker)

    @ViewBuilder
    private var overlayMenuContent: some View {
        if showOverlayMenu, let msg = overlayMessage {
            MessageOverlayMenu(
                message: msg,
                contactColor: accentColor,
                conversationId: viewModel.conversationId,
                messageBubbleFrame: overlayMessageFrame,
                isPresented: $showOverlayMenu,
                canDelete: msg.isMe || isCurrentUserAdminOrMod,
                onReply: { triggerReply(for: msg) },
                onCopy: { UIPasteboard.general.string = msg.content; HapticFeedback.success() },
                onEdit: {
                    editingMessageId = msg.id
                    editingOriginalContent = msg.content
                    messageText = msg.content
                },
                onPin: { Task { await viewModel.togglePin(messageId: msg.id) }; HapticFeedback.medium() },
                textTranslations: viewModel.messageTranslations[msg.id] ?? [],
                transcription: viewModel.messageTranscriptions[msg.id],
                translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
                onSelectTranslation: { translation in
                    viewModel.setActiveTranslation(for: msg.id, translation: translation)
                },
                onSelectAudioLanguage: { langCode in
                    viewModel.setActiveAudioLanguage(for: msg.id, language: langCode)
                },
                onRequestTranslation: { messageId, lang in
                    MessageSocketManager.shared.requestTranslation(messageId: messageId, targetLanguage: lang)
                },
                onReact: { emoji in
                    viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                },
                onReport: { type, reason in
                    Task {
                        let success = await viewModel.reportMessage(messageId: msg.id, reportType: type, reason: reason)
                        if success { HapticFeedback.success() }
                        else { HapticFeedback.error() }
                    }
                },
                onDelete: {
                    Task { await viewModel.deleteMessage(messageId: msg.id) }
                }
            )
            .transition(.opacity).zIndex(999)
        }
    }
}
