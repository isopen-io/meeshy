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

// MARK: - Active Member (for conversation detail header)
struct ConversationActiveMember: Identifiable { // internal for cross-file extension access
    let id: String
    let name: String
    let color: String
    let avatarURL: String?
}

struct ConversationOverlayState {
    var overlayMessage: Message? = nil
    var showOverlayMenu = false
    var longPressEnabled = false
    var showMessageDetailSheet = false
    var detailSheetMessage: Message? = nil
    var detailSheetInitialTab: DetailTab? = nil
    var quickReactionMessageId: String? = nil
    var emojiOnlyMode = false
    var deleteConfirmMessageId: String? = nil
}

struct ConversationScrollState {
    var isNearBottom: Bool = true
    var unreadBadgeCount: Int = 0
    var scrollToBottomTrigger: Int = 0
    var scrollToMessageId: String? = nil
    var highlightedMessageId: String? = nil
    var swipedMessageId: String? = nil
    var swipeOffset: CGFloat = 0
    var galleryStartAttachment: MessageAttachment? = nil
    var previewingPendingImage: UIImage? = nil
    var imageToPreview: UIImage? = nil
    var videoToPreview: URL? = nil
}

struct ConversationComposerState {
    var showOptions = false
    var actionAlert: String? = nil
    var forwardMessage: Message? = nil
    var showConversationInfo = false
    
    // Attachment state
    var pendingAttachments: [MessageAttachment] = []
    var pendingAudioURL: URL? = nil
    var pendingMediaFiles: [String: URL] = [:]
    var pendingThumbnails: [String: UIImage] = [:]
    var isLoadingMedia = false
    
    // Pickers
    var showPhotoPicker = false
    var showCamera = false
    var showFilePicker = false
    var selectedPhotoItems: [PhotosPickerItem] = []
    
    // Location & Upload
    var isLoadingLocation = false
    var isUploading = false
    var uploadProgress: UploadQueueProgress? = nil
    var showLocationPicker = false
    
    // Reply & Edit
    var pendingReplyReference: ReplyReference? = nil
    var editingMessageId: String? = nil
    var editingOriginalContent: String? = nil
    
    // Misc Pickers
    var showContactPicker = false
    var showTextEmojiPicker = false
    var emojiToInject = ""
}

struct ConversationHeaderState {
    var showStoryViewerFromHeader = false
    var storyGroupIndexForHeader = 0
    var showSearch = false
    var searchQuery = ""
    var typingDotPhase: Int = 0
    var inlineTypingDotPhase: Int = 0
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
    @StateObject var audioRecorder = AudioRecorderManager()
    @StateObject var scrollButtonAudioPlayer = AudioPlayerManager()
    @StateObject var pendingAudioPlayer = AudioPlayerManager()
    
    @FocusState var isTyping: Bool
    @FocusState var isSearchFocused: Bool

    @State var composerState = ConversationComposerState()
    @State var headerState = ConversationHeaderState()

    // Overlay & Detail state
    @State var overlayState = ConversationOverlayState()

    // Scroll, Media & Swipe state
    @State var scrollState = ConversationScrollState()

    let typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()


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
        // ConversationSection.allSections should be accessed via a fast dictionary in production apps,
        // but since we only have the Array here, we can lazily build a static dictionary.
        return Self.sectionLookup[sectionId]
    }

    private static var _sectionLookup: [String: ConversationSection]?
    private static var sectionLookup: [String: ConversationSection] {
        if let cached = _sectionLookup { return cached }
        let dict = Dictionary(uniqueKeysWithValues: ConversationSection.allSections.map { ($0.id, $0) })
        _sectionLookup = dict
        return dict
    }

    var topActiveMembers: [ConversationActiveMember] {
        viewModel.topActiveMembersList(accentColor: accentColor)
    }

    private var isCurrentUserAdminOrMod: Bool {
        let role = conversation?.currentUserRole?.uppercased() ?? ""
        return ["ADMIN", "MODERATOR", "BIGBOSS"].contains(role)
    }

    var composerHeight: CGFloat {
        var height: CGFloat = 130 // UCB base + topToolbar
        if !composerState.pendingAttachments.isEmpty { height += 110 }
        if composerState.editingMessageId != nil { height += 52 }
        if composerState.pendingReplyReference != nil && composerState.editingMessageId == nil { height += 52 }
        return height
    }

    // MARK: - Init

    init(conversation: Conversation?, replyContext: ReplyContext? = nil) {
        self.conversation = conversation
        self.replyContext = replyContext
        _viewModel = StateObject(wrappedValue: ConversationViewModel(conversationId: conversation?.id ?? "", unreadCount: conversation?.unreadCount ?? 0))
    }

    // MARK: - Date Sections

    private func shouldShowDateSection(currentDate: Date, previousDate: Date?) -> Bool {
        guard let previous = previousDate else { return true }
        return currentDate.timeIntervalSince(previous) > 3600
    }

    private static let dateSectionDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateFormat = "EEEE"
        return f
    }()

    private static let dateSectionDayMonthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateFormat = "EEEE d MMM"
        return f
    }()

    private static let dateSectionFullFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateFormat = "EEEE d MMM yyyy"
        return f
    }()

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
            return "\(Self.dateSectionDayFormatter.string(from: date).capitalized) \(timeStr)"
        }
        if calendar.component(.year, from: date) == calendar.component(.year, from: now) {
            return Self.dateSectionDayMonthFormatter.string(from: date).capitalized
        }
        return Self.dateSectionFullFormatter.string(from: date).capitalized
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
                if let context = replyContext { composerState.pendingReplyReference = context.toReplyReference }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { overlayState.longPressEnabled = true }
            }
            .onChange(of: scrollState.isNearBottom) { _, _ in
                if composerState.showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { composerState.showTextEmojiPicker = false }
                }
            }
            .onChange(of: isTyping) { _, focused in
                if focused && composerState.showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { composerState.showTextEmojiPicker = false }
                }
            }
            .fullScreenCover(isPresented: $headerState.showStoryViewerFromHeader) {
                if headerState.storyGroupIndexForHeader < storyViewModel.storyGroups.count {
                    StoryViewerView(viewModel: storyViewModel, groups: [storyViewModel.storyGroups[headerState.storyGroupIndexForHeader]], currentGroupIndex: 0, isPresented: $headerState.showStoryViewerFromHeader)
                }
            }
            .sheet(isPresented: $composerState.showConversationInfo) {
                if let conv = conversation { ConversationInfoSheet(conversation: conv, accentColor: accentColor, messages: viewModel.messages) }
            }
            .alert("Action sélectionnée", isPresented: Binding(get: { composerState.actionAlert != nil }, set: { if !$0 { composerState.actionAlert = nil } })) {
                Button("OK") { composerState.actionAlert = nil }
            } message: { Text(composerState.actionAlert ?? "") }
            .alert("Supprimer ce message ?", isPresented: Binding(get: { 
                overlayState.deleteConfirmMessageId != nil 
            }, set: { 
                if !$0 { overlayState.deleteConfirmMessageId = nil } 
            })) {
                Button("Annuler", role: .cancel) { overlayState.deleteConfirmMessageId = nil }
                Button("Supprimer", role: .destructive) {
                    if let msgId = overlayState.deleteConfirmMessageId { Task { await viewModel.deleteMessage(messageId: msgId) } }
                    overlayState.deleteConfirmMessageId = nil
                }
            } message: { Text("Cette action est irréversible.") }
            .sheet(item: $composerState.forwardMessage) { msgToForward in
                ForwardPickerSheet(message: msgToForward, sourceConversationId: conversation?.id ?? "", accentColor: accentColor) { composerState.forwardMessage = nil }
                    .presentationDetents([.medium, .large])
            }

            .overlay { overlayMenuContent }
            .fullScreenCover(item: $scrollState.galleryStartAttachment) { startAttachment in
                ConversationMediaGalleryView(
                    allAttachments: viewModel.allVisualAttachments,
                    startAttachmentId: startAttachment.id,
                    accentColor: accentColor,
                    captionMap: viewModel.mediaCaptionMap,
                    senderInfoMap: viewModel.mediaSenderInfoMap
                )
            }
            .sheet(isPresented: $overlayState.showMessageDetailSheet) {
                if let msg = overlayState.detailSheetMessage {
                    MessageDetailSheet(
                        message: msg,
                        contactColor: conversation?.accentColor ?? "#FF2E63",
                        conversationId: viewModel.conversationId,
                        initialTab: overlayState.detailSheetInitialTab,
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
                Color.clear.frame(height: composerState.showOptions ? 72 : 56)
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

            if !scrollState.isNearBottom {
                VStack { Spacer(); HStack { Spacer(); scrollToBottomButton.padding(.trailing, 16).padding(.bottom, composerHeight + 8) } }
                    .zIndex(60)
                    .transition(.asymmetric(insertion: .scale(scale: 0.8).combined(with: .opacity), removal: .scale(scale: 0.6).combined(with: .opacity)))
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: scrollState.isNearBottom)
            }

            VStack {
                Spacer()
                VStack(spacing: 0) {
                    if composerState.showTextEmojiPicker {
                        EmojiKeyboardPanel(
                            style: theme.mode.isDark ? .dark : .light,
                            onSelect: { emoji in
                                composerState.emojiToInject = emoji
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
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: composerState.showTextEmojiPicker)

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
                        let index = viewModel.messageIndex(for: msg.id) ?? 0
                        let previousDate: Date? = index > 0 ? viewModel.messages[index - 1].createdAt : nil
                        if shouldShowDateSection(currentDate: msg.createdAt, previousDate: previousDate) { dateSectionView(for: msg.createdAt) }
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
                            scrollState.isNearBottom = true; scrollState.unreadBadgeCount = 0; viewModel.lastUnreadMessage = nil
                            if viewModel.firstUnreadMessageId != nil {
                                withAnimation(.easeOut(duration: 0.3)) { viewModel.firstUnreadMessageId = nil }
                            }
                        }
                        .onDisappear { scrollState.isNearBottom = false }

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
                if scrollState.isNearBottom || lastMsg.isMe {
                    viewModel.markProgrammaticScroll()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { proxy.scrollTo(lastMsg.id, anchor: .bottom) }
                } else { scrollState.unreadBadgeCount += 1 }
            }
            .onChange(of: viewModel.isLoadingOlder) { wasLoading, isLoading in
                if wasLoading && !isLoading, let anchorId = viewModel.scrollAnchorId {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                        proxy.scrollTo(anchorId, anchor: .top); viewModel.scrollAnchorId = nil
                    }
                }
            }
            .onChange(of: composerState.pendingAttachments.count) { _, _ in
                if scrollState.isNearBottom, let last = viewModel.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
            }
            .onChange(of: audioRecorder.isRecording) { _, _ in
                if scrollState.isNearBottom, let last = viewModel.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
            }
            .onChange(of: scrollState.scrollToBottomTrigger) { _, _ in
                viewModel.markProgrammaticScroll()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { proxy.scrollTo("bottom_spacer", anchor: .bottom) }
            }
            .onChange(of: scrollState.scrollToMessageId) { _, targetId in
                guard let targetId else { return }
                scrollState.scrollToMessageId = nil
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
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { composerState.showOptions = true }
                    }
                }
                .padding(.horizontal, 16).padding(.top, 8)
                .transition(.opacity)
            } else {
                expandedHeaderBand
            }

            if headerState.showSearch {
                searchBar.transition(.move(edge: .top).combined(with: .opacity))
            }

            Spacer()
        }
        .zIndex(100)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: composerState.showOptions)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isTyping)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: headerState.showSearch)
    }

    @ViewBuilder
    private var expandedHeaderBand: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                ThemedBackButton(color: accentColor, compactMode: composerState.showOptions) { HapticFeedback.light(); dismiss() }

                if composerState.showOptions {
                    // Title row: name + tags scroll + call buttons + search icon
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 4) {
                            Button { composerState.showConversationInfo = true } label: {
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
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { headerState.showSearch = true }
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
        .padding(.horizontal, composerState.showOptions ? 10 : 0)
        .padding(.vertical, composerState.showOptions ? 6 : 0)
        .background(
            Group {
                if composerState.showOptions {
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
        .padding(.horizontal, composerState.showOptions ? 8 : 16).padding(.top, 8)
    }

    // MARK: - Overlay Menu Content (extracted to help type-checker)

    @ViewBuilder
    private var overlayMenuContent: some View {
        if overlayState.showOverlayMenu, let msg = overlayState.overlayMessage {
            MessageOverlayMenu(
                message: msg,
                contactColor: accentColor,
                conversationId: viewModel.conversationId,
                messageBubbleFrame: .zero,
                isPresented: $overlayState.showOverlayMenu,
                canDelete: msg.isMe || isCurrentUserAdminOrMod,
                onReply: { triggerReply(for: msg) },
                onCopy: { UIPasteboard.general.string = msg.content; HapticFeedback.success() },
                onEdit: {
                    composerState.editingMessageId = msg.id
                    composerState.editingOriginalContent = msg.content
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
