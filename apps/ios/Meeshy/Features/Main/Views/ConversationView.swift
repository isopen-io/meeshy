import SwiftUI
import Combine
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
    var showStoryViewer = false
    var storyViewerUserId: String? = nil
    var storyViewerGroupIndex: Int = 0
    var storyViewerSlideIndex: Int = 0
    var showReplyThread = false
    var replyThreadParentId: String? = nil
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
    var imageToPreview: UIImage? = nil
    var videoToPreview: URL? = nil

    // Media editor queues
    var photosToEdit: [UIImage] = []
    var videosToPreview: [URL] = []
    var editingPendingAttachmentId: String? = nil
    var videoToEdit: URL? = nil
    var audioToEdit: URL? = nil
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
    
    // Language (source language for outgoing messages)
    // Priority: keyboard layout > system language > "fr" fallback
    var selectedLanguage: String = {
        if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
            let code = String(kbd.prefix(2))
            if LanguageOption.defaults.contains(where: { $0.code == code }) { return code }
        }
        if let sysLang = Locale.current.language.languageCode?.identifier,
           LanguageOption.defaults.contains(where: { $0.code == sysLang }) {
            return sysLang
        }
        return "fr"
    }()

    // Reply & Edit
    var pendingReplyReference: ReplyReference? = nil
    var editingMessageId: String? = nil
    var editingOriginalContent: String? = nil

    // Reply attachment preview
    var previewMediaURL: URL? = nil
    var previewMediaType: String? = nil

    // Misc Pickers
    var showContactPicker = false
    var showTextEmojiPicker = false
    var emojiToInject = ""
}

struct ConversationHeaderState {
    var showStoryViewerFromHeader = false
    var storyUserIdForHeader: String?
    var showSearch = false
    var searchQuery = ""
    var typingDotPhase: Int = 0
    var inlineTypingDotPhase: Int = 0
}

struct ConversationView: View {
    let conversation: Conversation?
    var replyContext: ReplyContext? = nil
    var anonymousSession: AnonymousSessionContext? = nil

    // NOTE: Properties below are internal (not private) for cross-file extension access.
    // Extensions in ConversationView+MessageRow, +Header, +ScrollIndicators, +Composer.

    @Environment(\.dismiss) private var dismiss
    @ObservedObject var theme = ThemeManager.shared
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet de la conversation. La présence est rafraîchie via les refreshs naturels.
    var presenceManager: PresenceManager { PresenceManager.shared }
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
    @State var composerHeight: CGFloat = 130
    @State private var keyboardHeight: CGFloat = 0

    @State var typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()


    let defaultReactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "💯", "😍", "👀", "🤣", "💪", "✨", "🥺"]

    // MARK: - Composer Height Measurement

    private func updateComposerHeight(_ contentHeight: CGFloat) {
        // N'ajoute la safe area que si le clavier est absent — quand le clavier est visible
        // la safe area bottom passe à 0 et le GeometryReader fire à chaque frame d'animation,
        // ce qui provoquerait des mises à jour en boucle de composerHeight.
        guard keyboardHeight == 0 else { return }
        let safeBottom = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first(where: { $0.isKeyWindow })?.safeAreaInsets.bottom ?? 0
        composerHeight = contentHeight + safeBottom
    }

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

    var cachedLastReceivedIndex: Int? {
        viewModel.cachedLastReceivedIndex
    }

    var headerPresenceState: PresenceState {
        guard isDirect, let userId = conversation?.participantUserId else { return .offline }
        return presenceManager.presenceState(for: userId)
    }

    var headerMoodEmoji: String? {
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
        let convRole = conversation?.currentUserRole?.uppercased() ?? ""
        let platformRole = AuthManager.shared.currentUser?.role?.uppercased() ?? ""
        let modRoles: Set<String> = ["ADMIN", "MODERATOR", "BIGBOSS"]
        return modRoles.contains(convRole) || modRoles.contains(platformRole)
    }

    // MARK: - Init

    init(conversation: Conversation?, replyContext: ReplyContext? = nil, anonymousSession: AnonymousSessionContext? = nil) {
        self.conversation = conversation
        self.replyContext = replyContext
        self.anonymousSession = anonymousSession
        _viewModel = StateObject(wrappedValue: ConversationViewModel(
            conversationId: conversation?.id ?? "",
            unreadCount: conversation?.unreadCount ?? 0,
            isDirect: conversation?.type == .direct,
            participantUserId: conversation?.participantUserId,
            memberJoinedAt: conversation?.currentUserJoinedAt,
            anonymousSession: anonymousSession
        ))
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

    private func joinedBanner(date: Date) -> some View {
        HStack(spacing: 6) {
            Spacer()
            Image(systemName: "person.badge.plus")
                .font(.system(size: 10, weight: .semibold))
            Text("conversation.joined_on \(Self.joinedDateFormatter.string(from: date))")
                .font(.system(size: 11, weight: .medium))
            Spacer()
        }
        .foregroundColor(Color(hex: accentColor).opacity(0.7))
        .padding(.vertical, 10)
    }

    private static let joinedDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .long
        f.timeStyle = .none
        f.locale = Locale.current
        return f
    }()

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

    // MARK: - Encryption Disclaimer

    @ViewBuilder
    private var encryptionDisclaimer: some View {
        if let conv = conversation, conv.encryptionMode != nil, !viewModel.hasOlderMessages, !viewModel.isLoadingInitial {
            VStack(spacing: 8) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(Color(hex: "4ECDC4"))
                    .padding(8)
                    .background(Circle().fill(Color(hex: "4ECDC4").opacity(0.15)))

                Text("Les messages dans cette conversation sont chiffrés de bout en bout. Personne, pas même Meeshy, ne peut les lire.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
            }
            .padding(.vertical, 16)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.mode.isDark ? Color.black.opacity(0.4) : Color(UIColor.systemBackground).opacity(0.6))
            )
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Empty Conversation State

    private var conversationEmptyState: some View {
        VStack(spacing: 12) {
            Spacer()

            Image(systemName: conversation?.type == .direct ? "person.crop.circle" : "bubble.left.and.bubble.right")
                .font(.system(size: 36, weight: .light))
                .foregroundColor(Color(hex: accentColor).opacity(0.5))

            Button {
                isTyping = true
            } label: {
                Text(String(localized: "empty.send_first", defaultValue: "Envoyer un message"))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(Color(hex: accentColor)))
            }

            Text(conversation?.type == .direct
                 ? String(localized: "empty.direct_hint", defaultValue: "Commencez la conversation")
                 : String(localized: "empty.group_hint", defaultValue: "Soyez le premier a envoyer un message"))
                .font(.system(size: 12))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()
        }
        .frame(maxWidth: .infinity, minHeight: 200)
    }

    // MARK: - Unread Separator

    private var unreadSeparator: some View {
        HStack(spacing: 10) {
            Rectangle()
                .fill(MeeshyColors.error.opacity(0.5))
                .frame(height: 1)
                .accessibilityHidden(true)
            Text("Nouveaux messages")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(MeeshyColors.error)
                .lineLimit(1)
                .fixedSize()
            Rectangle()
                .fill(MeeshyColors.error.opacity(0.5))
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
        bodyWithSheets
    }

    private var bodyWithSheets: some View {
        bodyWithCovers
            .fullScreenCover(isPresented: $headerState.showStoryViewerFromHeader) {
                if let userId = headerState.storyUserIdForHeader,
                   let resolvedIndex = storyViewModel.groupIndex(forUserId: userId) {
                    StoryViewerView(viewModel: storyViewModel, groups: [storyViewModel.storyGroups[resolvedIndex]], currentGroupIndex: 0, isPresented: $headerState.showStoryViewerFromHeader)
                } else {
                    storyLoadingFallback(isPresented: $headerState.showStoryViewerFromHeader)
                }
            }
            .fullScreenCover(isPresented: $overlayState.showStoryViewer) {
                if let resolvedIndex = storyViewModel.groupIndex(forUserId: overlayState.storyViewerUserId ?? "") {
                    let slideIdx = overlayState.storyViewerSlideIndex
                    StoryViewerView(
                        viewModel: storyViewModel,
                        groups: [storyViewModel.storyGroups[resolvedIndex]],
                        currentGroupIndex: 0,
                        isPresented: $overlayState.showStoryViewer,
                        initialStoryIndex: slideIdx
                    )
                } else {
                    storyLoadingFallback(isPresented: $overlayState.showStoryViewer)
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
            .overlay { replyThreadOverlayContent }
            .withStatusBubble()
    }

    private var bodyWithCovers: some View {
        bodyWithLifecycle
            .fullScreenCover(item: $scrollState.galleryStartAttachment) { startAttachment in
                ConversationMediaGalleryView(
                    allAttachments: viewModel.allVisualAttachments,
                    startAttachmentId: startAttachment.id,
                    accentColor: accentColor,
                    captionMap: viewModel.mediaCaptionMap,
                    senderInfoMap: viewModel.mediaSenderInfoMap
                )
            }
            .fullScreenCover(isPresented: Binding(
                get: { composerState.previewMediaURL != nil },
                set: { if !$0 { composerState.previewMediaURL = nil; composerState.previewMediaType = nil } }
            )) {
                if let url = composerState.previewMediaURL {
                    switch composerState.previewMediaType {
                    case "video":
                        VideoFullscreenPlayer(urlString: url.absoluteString, speed: .x1_0)
                    case "audio":
                        VideoFullscreenPlayer(urlString: url.absoluteString, speed: .x1_0)
                    default:
                        ImageFullscreen(imageUrl: url, accentColor: accentColor)
                    }
                }
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
    }

    private var bodyWithLifecycle: some View {
        bodyContent
            .background(InteractivePopEnabler())
            .task {
                viewModel.observeSync()
                await viewModel.loadMessages()
                MessageSocketManager.shared.connect()

                if let messageId = router.pendingHighlightMessageId, !messageId.isEmpty {
                    router.pendingHighlightMessageId = nil
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    guard !Task.isCancelled else { return }
                    if viewModel.messages.contains(where: { $0.id == messageId }) {
                        scrollState.scrollToMessageId = messageId
                    } else {
                        await viewModel.loadMessagesAround(messageId: messageId)
                        try? await Task.sleep(nanoseconds: 100_000_000)
                        guard !Task.isCancelled else { return }
                        scrollState.scrollToMessageId = messageId
                    }
                }
            }
            .onAppear {
                if let context = replyContext { composerState.pendingReplyReference = context.toReplyReference }
                // Language priority: keyboard layout > system language > current default
                if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
                    let code = String(kbd.prefix(2))
                    if LanguageOption.defaults.contains(where: { $0.code == code }) {
                        composerState.selectedLanguage = code
                    }
                } else if let sysLang = Locale.current.language.languageCode?.identifier,
                          LanguageOption.defaults.contains(where: { $0.code == sysLang }) {
                    composerState.selectedLanguage = sysLang
                }
                let draft = DraftStore.shared.load(for: viewModel.conversationId)
                if !draft.isEmpty && messageText.isEmpty { messageText = draft }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { overlayState.longPressEnabled = true }
            }
            .onChange(of: messageText) { _, newValue in
                DraftStore.shared.save(newValue, for: viewModel.conversationId)
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
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { notification in
                guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
                keyboardHeight = frame.height
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                keyboardHeight = 0
            }
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
                Spacer()
            }
            .zIndex(98)
            .allowsHitTesting(false)

            // Error banner
            Group {
                if let error = viewModel.error {
                    VStack {
                        Color.clear.frame(height: composerState.showOptions ? 72 : 56)
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.yellow)
                            Text(error)
                                .font(.caption)
                                .lineLimit(2)
                            Spacer()
                            Button {
                                viewModel.error = nil
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        Spacer()
                    }
                }
            }
            .zIndex(97)
            .animation(.easeInOut, value: viewModel.error)

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
                    if !viewModel.mentionSuggestions.isEmpty {
                        mentionSuggestionPanel
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
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
                .background(.ultraThinMaterial)
                .ignoresSafeArea(.container, edges: .bottom)
                .background(
                    GeometryReader { geo in
                        Color.clear
                            .onAppear { updateComposerHeight(geo.size.height) }
                            .onChange(of: geo.size.height) { _, h in updateComposerHeight(h) }
                    }
                )
            }
            .zIndex(50)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: composerState.showTextEmojiPicker)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.mentionSuggestions.isEmpty)

            searchResultsBlurOverlay
            returnToLatestButton
        }
    }

    // MARK: - Mention Suggestion Panel

    @ViewBuilder
    private var mentionSuggestionPanel: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 0) {
                ForEach(viewModel.mentionSuggestions) { candidate in
                    Button {
                        messageText = viewModel.insertMention(candidate, into: messageText)
                    } label: {
                        HStack(spacing: 10) {
                            MeeshyAvatar(
                                name: candidate.displayName,
                                context: .userListItem,
                                accentColor: accentColor,
                                avatarURL: candidate.avatarURL
                            )
                            VStack(alignment: .leading, spacing: 1) {
                                Text(candidate.displayName)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(theme.textPrimary)
                                Text("@\(candidate.username)")
                                    .font(.system(size: 12))
                                    .foregroundColor(theme.textSecondary)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                    }
                    .accessibilityLabel("Mentionner \(candidate.displayName)")
                    if candidate.id != viewModel.mentionSuggestions.last?.id {
                        Divider()
                            .padding(.leading, 58)
                    }
                }
            }
        }
        .frame(maxHeight: 200)
        .background(.ultraThinMaterial)
    }

    // MARK: - Message Scroll View (extracted to help type-checker)

    @ViewBuilder
    private var messageListContent: some View {
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
        } else if !viewModel.messages.isEmpty, let joinedAt = viewModel.memberJoinedAt {
            joinedBanner(date: joinedAt)
        }

        Color.clear.frame(height: 70)

        if viewModel.isLoadingInitial && viewModel.messages.isEmpty {
            ForEach(0..<6, id: \.self) { index in
                SkeletonMessageBubble(index: index)
                    .staggeredAppear(index: index, baseDelay: 0.04)
            }
            .transition(.opacity)
        } else if viewModel.messages.isEmpty && !viewModel.isLoadingInitial {
            conversationEmptyState
        } else {
            encryptionDisclaimer
        }

        ForEach(viewModel.messagesByDate) { group in
            Section {
                ForEach(group.messages) { msg in
                    let index = viewModel.messageIndex(for: msg.id) ?? 0
                    if msg.id == viewModel.firstUnreadMessageId { unreadSeparator }
                    messageRow(index: index, msg: msg)
                        .onAppear {
                            if index < 5 && viewModel.hasOlderMessages && !viewModel.isLoadingOlder && !viewModel.isProgrammaticScroll {
                                Task { await viewModel.loadOlderMessages() }
                            }
                        }
                }
            } header: {
                dateSectionView(for: group.date)
            }
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

    // MARK: - Story Loading Fallback

    @ViewBuilder
    private func storyLoadingFallback(isPresented: Binding<Bool>) -> some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 20) {
                if storyViewModel.isLoading {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(1.5)
                    Text("Loading stories...")
                        .foregroundColor(.white.opacity(0.7))
                        .font(.subheadline)
                } else {
                    Image(systemName: "photo.on.rectangle.angled")
                        .font(.system(size: 48))
                        .foregroundColor(.white.opacity(0.5))
                    Text("Story unavailable")
                        .foregroundColor(.white.opacity(0.7))
                        .font(.subheadline)
                }
            }

            VStack {
                HStack {
                    Spacer()
                    Button { isPresented.wrappedValue = false } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(Color.white.opacity(0.2)))
                    }
                    .padding(.trailing, 16)
                    .padding(.top, 8)
                }
                Spacer()
            }
        }
        .task {
            guard storyViewModel.storyGroups.isEmpty else { return }
            await storyViewModel.loadStories()
        }
    }

    @ViewBuilder
    private var messageScrollView: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    messageListContent
                }
                .padding(.horizontal, 16)
            }
            .defaultScrollAnchor(.bottom)
            .onChange(of: viewModel.isLoadingInitial) { wasLoading, isLoading in
                if wasLoading && !isLoading, !viewModel.messages.isEmpty {
                    viewModel.markProgrammaticScroll()
                    proxy.scrollTo("bottom_spacer", anchor: .bottom)
                }
            }
            .onChange(of: viewModel.newMessageAppended) { _, _ in
                guard let lastMsg = viewModel.messages.last else { return }
                if scrollState.isNearBottom || lastMsg.isMe {
                    viewModel.markProgrammaticScroll()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { proxy.scrollTo("bottom_spacer", anchor: .bottom) }
                    if scrollState.isNearBottom && !lastMsg.isMe {
                        viewModel.markAsRead()
                    }
                } else { scrollState.unreadBadgeCount += 1 }
            }
            .onChange(of: viewModel.isLoadingOlder) { wasLoading, isLoading in
                if wasLoading && !isLoading, let anchorId = viewModel.scrollAnchorId {
                    viewModel.markProgrammaticScroll()
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
            .onChange(of: viewModel.typingUsernames.isEmpty) { _, isEmpty in
                guard !isEmpty, scrollState.isNearBottom else { return }
                viewModel.markProgrammaticScroll()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    proxy.scrollTo("typing_indicator", anchor: .bottom)
                }
            }
            .onChange(of: composerState.isUploading) { wasUploading, isUploading in
                guard wasUploading && !isUploading else { return }
                viewModel.markProgrammaticScroll()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    proxy.scrollTo("bottom_spacer", anchor: .bottom)
                }
            }
            .onChange(of: keyboardHeight) { oldHeight, newHeight in
                guard newHeight > oldHeight, scrollState.isNearBottom else { return }
                viewModel.markProgrammaticScroll()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    proxy.scrollTo("bottom_spacer", anchor: .bottom)
                }
            }
            .onChange(of: composerHeight) { oldHeight, newHeight in
                // Ignore pendant que le clavier est visible : le GeometryReader fire en boucle
                // pendant l'animation du clavier, ce qui déclencherait plusieurs spring animations.
                guard keyboardHeight == 0, newHeight > oldHeight + 20, scrollState.isNearBottom else { return }
                viewModel.markProgrammaticScroll()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    proxy.scrollTo("bottom_spacer", anchor: .bottom)
                }
            }
        }
    }

    // MARK: - Floating Header Section (extracted to help type-checker)

    private var isAnonymous: Bool { anonymousSession != nil }

    @ViewBuilder
    private var floatingHeaderSection: some View {
        VStack {
            if isAnonymous {
                anonymousHeaderBar
            } else if isTyping {
                HStack(spacing: 8) {
                    ThemedBackButton(color: accentColor) { HapticFeedback.light(); router.pop() }
                    Spacer()
                    ThemedAvatarButton(
                        name: conversation?.name ?? "?", color: accentColor, secondaryColor: secondaryColor,
                        isExpanded: false, hasStoryRing: headerHasStoryRing,
                        avatarURL: conversation?.type == .direct ? conversation?.participantAvatarURL : conversation?.avatar,
                        presenceState: headerPresenceState,
                        moodEmoji: headerMoodEmoji
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
    private var anonymousHeaderBar: some View {
        HStack {
            Text(conversation?.name ?? "Conversation")
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(1)
            Spacer()
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(theme.textMuted.opacity(0.12)))
            }
            .accessibilityLabel("Fermer la conversation")
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    @ViewBuilder
    private var expandedHeaderBand: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                ThemedBackButton(color: accentColor, compactMode: composerState.showOptions) { HapticFeedback.light(); router.pop() }

                if composerState.showOptions {
                    // Title row: name + tags scroll + call buttons + search icon
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .top, spacing: 4) {
                            Button { composerState.showConversationInfo = true } label: {
                                Text(conversation?.name ?? "Conversation")
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                    .foregroundColor(.white)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .multilineTextAlignment(.leading)
                            }
                            .accessibilityLabel(conversation?.name ?? "Conversation")
                            .accessibilityHint("Ouvre les informations de la conversation")

                            Spacer(minLength: 4)
                            headerCallButtons.layoutPriority(1)
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

    // MARK: - Reply Thread Overlay

    @ViewBuilder
    private var replyThreadOverlayContent: some View {
        if overlayState.showReplyThread, let parentId = overlayState.replyThreadParentId {
            ReplyThreadOverlay(
                conversationId: viewModel.conversationId,
                parentMessageId: parentId,
                accentColor: accentColor,
                isDark: theme.mode.isDark,
                allMessages: viewModel.messages,
                translationResolver: { messageId in
                    viewModel.preferredTranslation(for: messageId)?.translatedContent
                },
                isPresented: $overlayState.showReplyThread
            )
        }
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
                canEdit: msg.isMe || isCurrentUserAdminOrMod,
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
                },
                onDeleteAttachment: { attachmentId in
                    Task { await viewModel.deleteAttachment(messageId: msg.id, attachmentId: attachmentId) }
                }
            )
            .transition(.opacity).zIndex(999)
        }
    }
}
