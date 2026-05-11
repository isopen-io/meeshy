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

struct PreviewMedia: Identifiable {
    let id = UUID()
    let url: URL
    let type: String?
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
    
    // Language (source language for outgoing messages).
    // Resolved via DefaultComposerLanguage: keyboard layout > "fr" fallback.
    // TextAnalyzer overrides this once the user types enough characters.
    var selectedLanguage: String = DefaultComposerLanguage.resolve()

    // Reply & Edit
    var pendingReplyReference: ReplyReference? = nil
    var editingMessageId: String? = nil
    var editingOriginalContent: String? = nil

    // Reply attachment preview
    var previewMedia: PreviewMedia? = nil

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
    var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) var colorScheme
    var isDark: Bool { colorScheme == .dark }
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
    @State private var initialScrollCompleted: Bool = false

    @State var typingDotPublisher = Timer.publish(every: 0.5, on: .main, in: .common)
    @State var typingDotConnection: Cancellable?


    let defaultReactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "💯", "😍", "👀", "🤣", "💪", "✨", "🥺"]

    // MARK: - Composer Height Measurement

    /// Persist the whole compose state (text, inline reply, selected language,
    /// effects, blur, ephemeral duration) so the user never loses context when
    /// the app is killed mid-sentence. Empty drafts are purged from
    /// `UserDefaults` by `DraftStore.save(_:for:)`.
    private func persistDraft(text: String) {
        let ref = composerState.pendingReplyReference
        let draft = MessageDraft(
            text: text,
            replyToId: ref?.messageId,
            replyAuthorName: ref?.authorName,
            replyPreviewText: ref?.previewText,
            replyIsMe: ref?.isMe ?? false,
            selectedLanguage: composerState.selectedLanguage,
            effectFlags: viewModel.pendingEffects.flags.rawValue,
            isBlurEnabled: viewModel.isBlurEnabled,
            ephemeralDurationRawValue: viewModel.ephemeralDuration?.rawValue
        )
        DraftStore.shared.save(draft, for: viewModel.conversationId)
    }

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
            closedAt: conversation?.closedAt,
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
                    isDark
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
                            isDark
                                ? Color(hex: accentColor).opacity(0.12)
                                : Color(hex: accentColor).opacity(0.08)
                        )
                        .overlay(
                            Capsule()
                                .stroke(
                                    Color(hex: accentColor).opacity(isDark ? 0.2 : 0.15),
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
                    .fill(isDark ? Color.black.opacity(0.4) : Color(UIColor.systemBackground).opacity(0.6))
            )
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Closed Conversation Banner

    private var closedConversationBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock.fill")
                .foregroundColor(.secondary)
            Text("Cette conversation a ete fermee")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(.ultraThinMaterial)
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
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: headerState.storyUserIdForHeader,
                    isPresented: $headerState.showStoryViewerFromHeader,
                    onReplyToStory: { replyContext in
                        headerState.showStoryViewerFromHeader = false
                        router.navigateToStoryReply(replyContext, conversationListViewModel: conversationListViewModel)
                    },
                    singleGroup: true,
                    presentationSource: "ConversationView.header"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationListViewModel)
            }
            .fullScreenCover(isPresented: $overlayState.showStoryViewer) {
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: overlayState.storyViewerUserId,
                    isPresented: $overlayState.showStoryViewer,
                    onReplyToStory: { replyContext in
                        overlayState.showStoryViewer = false
                        router.navigateToStoryReply(replyContext, conversationListViewModel: conversationListViewModel)
                    },
                    singleGroup: true,
                    initialStoryIndex: overlayState.storyViewerSlideIndex,
                    presentationSource: "ConversationView.overlay"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationListViewModel)
            }
            .sheet(isPresented: $composerState.showConversationInfo) {
                if let conv = conversation { ConversationInfoSheet(conversation: conv, accentColor: accentColor, messages: viewModel.messages) }
            }
            .alert("Action sélectionnée", isPresented: Binding(get: { composerState.actionAlert != nil }, set: { if !$0 { composerState.actionAlert = nil } })) {
                Button("OK") { composerState.actionAlert = nil }
            } message: { Text(composerState.actionAlert ?? "") }
            .confirmationDialog(
                "Supprimer ce message ?",
                isPresented: Binding(
                    get: { overlayState.deleteConfirmMessageId != nil },
                    set: { if !$0 { overlayState.deleteConfirmMessageId = nil } }
                ),
                titleVisibility: .visible,
                presenting: overlayState.deleteConfirmMessageId
            ) { msgId in
                // "Delete for everyone" only if the user authored the
                // message AND the 2-hour window hasn't elapsed — matches
                // WhatsApp's "Delete for everyone" gating.
                if let idx = viewModel.messageIndex(for: msgId),
                   viewModel.canDeleteForEveryone(viewModel.messages[idx]) {
                    Button("Supprimer pour tout le monde", role: .destructive) {
                        Task { await viewModel.deleteMessage(messageId: msgId, mode: .everyone) }
                        overlayState.deleteConfirmMessageId = nil
                    }
                }
                Button("Supprimer pour moi", role: .destructive) {
                    Task { await viewModel.deleteMessage(messageId: msgId, mode: .local) }
                    overlayState.deleteConfirmMessageId = nil
                }
                Button("Annuler", role: .cancel) { overlayState.deleteConfirmMessageId = nil }
            } message: { _ in
                Text("La suppression pour tout le monde est disponible pendant 2 h après l'envoi.")
            }
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
            .fullScreenCover(item: $composerState.previewMedia) { media in
                switch media.type {
                case "video":
                    VideoFullscreenPlayer(urlString: media.url.absoluteString, speed: .x1_0)
                case "audio":
                    VideoFullscreenPlayer(urlString: media.url.absoluteString, speed: .x1_0)
                default:
                    ImageFullscreen(imageUrl: media.url, accentColor: accentColor)
                }
            }
            .sheet(item: $overlayState.detailSheetMessage) { msg in
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
                        // Route through the confirmation dialog so the user
                        // picks between "Delete for me" and "Delete for
                        // everyone" instead of silently losing the message.
                        overlayState.deleteConfirmMessageId = msg.id
                    },
                    editRevisions: viewModel.editRevisions(for: msg.id)
                )
            }
    }

    private var bodyWithLifecycle: some View {
        bodyContent
            .background(InteractivePopEnabler())
            .task {
                print("[DIAG] ConversationView.task ENTERED conv=\(viewModel.conversationId)")
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
                if messageText.isEmpty, let draft = DraftStore.shared.load(for: viewModel.conversationId) {
                    messageText = draft.text
                    // Restore inline reply context from the draft so the user
                    // sees the same compose chip they left — no hidden state
                    // transitions on app reopen.
                    if let replyId = draft.replyToId,
                       let authorName = draft.replyAuthorName {
                        composerState.pendingReplyReference = ReplyReference(
                            messageId: replyId,
                            authorName: authorName,
                            previewText: draft.replyPreviewText ?? "",
                            isMe: draft.replyIsMe
                        )
                    }
                    if let lang = draft.selectedLanguage {
                        composerState.selectedLanguage = lang
                    }
                    if draft.effectFlags != 0 {
                        viewModel.pendingEffects.flags = MessageEffectFlags(rawValue: draft.effectFlags)
                    }
                    if draft.isBlurEnabled {
                        viewModel.isBlurEnabled = true
                    }
                    if let raw = draft.ephemeralDurationRawValue,
                       let duration = EphemeralDuration(rawValue: raw) {
                        viewModel.ephemeralDuration = duration
                    }
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { overlayState.longPressEnabled = true }
                if typingDotConnection == nil {
                    typingDotConnection = typingDotPublisher.connect()
                }
            }
            .onDisappear {
                print("[DIAG] ConversationView.onDisappear conv=\(viewModel.conversationId)")
                typingDotConnection?.cancel()
                typingDotConnection = nil
            }
            .onChange(of: messageText) { _, newValue in
                persistDraft(text: newValue)
            }
            .onChange(of: composerState.pendingReplyReference?.messageId) { _, _ in persistDraft(text: messageText) }
            .onChange(of: composerState.selectedLanguage) { _, _ in persistDraft(text: messageText) }
            .onChange(of: viewModel.pendingEffects.flags.rawValue) { _, _ in persistDraft(text: messageText) }
            .onChange(of: viewModel.isBlurEnabled) { _, _ in persistDraft(text: messageText) }
            .onChange(of: viewModel.ephemeralDuration?.rawValue) { _, _ in persistDraft(text: messageText) }
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
            .onChange(of: viewModel.accessRevoked) { _, revoked in
                // Server signalled the user no longer has access to this
                // conversation (kicked, group deleted, blocked, etc.). The
                // ViewModel has already wiped per-conversation cache and
                // local message state. We dismiss the screen here and
                // surface a toast so the user knows why.
                print("[DIAG] accessRevoked.onChange revoked=\(revoked)")
                guard revoked else { return }
                ToastManager.shared.showError(viewModel.error ?? "Vous n'avez plus acces a cette conversation")
                dismiss()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { notification in
                guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
                keyboardHeight = frame.height
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                keyboardHeight = 0
            }
    }

    // MARK: - Skeleton Overlay

    /// Vertical stack of skeleton bubbles used as the cold-start
    /// placeholder. The bubble indices alternate left/right inside
    /// `SkeletonMessageBubble` so the column reads like a real
    /// conversation thread while the first network/cache pass runs.
    private var messageSkeletonOverlay: some View {
        VStack(spacing: 12) {
            ForEach(0..<6, id: \.self) { index in
                SkeletonMessageBubble(index: index)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.top, 96)
        .padding(.bottom, composerHeight + 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Chargement des messages"))
    }

    // MARK: - Body Content (extracted to help type-checker)

    @ViewBuilder
    private var bodyContent: some View {
        ZStack {
            conversationBackground

            // Cold-start skeleton: shown ONLY while the initial fetch is
            // in flight AND no cached messages exist yet. Renders above
            // the (empty) MessageListView so the layout stays stable
            // when the first batch lands and the placeholder fades out.
            if viewModel.isLoadingInitial && viewModel.messages.isEmpty {
                messageSkeletonOverlay
                    .transition(.opacity)
                    .zIndex(1)
            }

            // UIKit bridge powered by GRDB store (always available after eager init)
            MessageListView(
                store: viewModel.messageStore,
                conversationViewModel: viewModel,
                currentUserId: viewModel.currentUserIdForView,
                accentColor: accentColor,
                isDirect: isDirect,
                bottomInset: composerHeight + 16,
                onNewMessagesBadge: { count in
                    scrollState.unreadBadgeCount = count
                },
                onScrollToMessage: { targetId in
                    // Tap on a reply chip inside a bubble: jump to the cited
                    // message. If the target is in the current window, the
                    // VC handles the visual scroll itself; here we cover the
                    // case where it's outside the window by widening the
                    // store's anchor (loadMessagesAround triggers a
                    // refreshFromDB which re-emits the snapshot).
                    Task { await viewModel.loadMessagesAround(messageId: targetId) }
                },
                onLoadOlder: {
                    // Infinite scroll: VM owns the cache + network sequence
                    // (syncEngine.fetchOlderMessages → store.loadOlder).
                    // Going through the store directly stalls once the local
                    // GRDB window is exhausted, leaving older messages
                    // unreachable.
                    await viewModel.loadOlderMessages()
                },
                onStoryReplyTap: { storyId in
                    // Open the story viewer at the slide that originated the
                    // quoted reply. Resolves the story id to a (group, slide)
                    // pair via StoryViewModel — preserves the legacy behaviour
                    // from ConversationView+MessageRow (now dead code).
                    if let groupIdx = storyViewModel.groupIndex(forStoryId: storyId) {
                        let group = storyViewModel.storyGroups[groupIdx]
                        let slideIdx = group.stories.firstIndex { $0.id == storyId } ?? 0
                        overlayState.storyViewerUserId = group.id
                        overlayState.storyViewerGroupIndex = groupIdx
                        overlayState.storyViewerSlideIndex = slideIdx
                        overlayState.showStoryViewer = true
                    }
                },
                onSwipeReply: { messageId in
                    // Restore swipe-to-reply: BubbleSwipeContainer commits when
                    // the bubble crosses the reply threshold. We resolve the
                    // message and reuse triggerReply() so the composer mirrors
                    // the legacy long-press / context menu reply path.
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    triggerReply(for: msg)
                },
                onSwipeForward: { messageId in
                    // Restore swipe-to-forward: opens the forward picker via
                    // composerState. HapticFeedback already fires inside the
                    // swipe container — we only stage the message here.
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    composerState.forwardMessage = msg
                },
                onLongPress: { messageId in
                    // Open the contextual options menu — same overlay used by
                    // the legacy SwiftUI list path. Bypasses the gesture if
                    // overlay-disabled (e.g. while a sheet is presented).
                    guard overlayState.longPressEnabled else { return }
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.overlayMessage = msg
                    overlayState.showOverlayMenu = true
                },
                onAddReaction: { messageId in
                    // Spring-open the inline emoji bar next to the bubble.
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        overlayState.emojiOnlyMode = true
                        overlayState.quickReactionMessageId = messageId
                    }
                    HapticFeedback.light()
                },
                onToggleReaction: { messageId, emoji in
                    viewModel.toggleReaction(messageId: messageId, emoji: emoji)
                },
                onOpenReactPicker: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.detailSheetMessage = msg
                    overlayState.detailSheetInitialTab = .react
                },
                onShowMessageInfo: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.detailSheetMessage = msg
                    overlayState.detailSheetInitialTab = .views
                },
                onShowReactions: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.detailSheetMessage = msg
                    overlayState.detailSheetInitialTab = .reactions
                },
                onShowTranslationDetail: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.detailSheetMessage = msg
                    overlayState.detailSheetInitialTab = .language
                },
                onMediaTap: { attachment in
                    // User tapped a media — opportunistically warm the cache,
                    // then stage the attachment for the gallery presenter.
                    if let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString {
                        Task { _ = try? await CacheCoordinator.shared.images.data(for: resolved) }
                    }
                    scrollState.galleryStartAttachment = attachment
                },
                onConsumeViewOnce: { messageId, completion in
                    Task {
                        let success = await viewModel.consumeViewOnce(messageId: messageId)
                        completion(success)
                    }
                },
                onRequestTranslation: { messageId, targetLang in
                    MessageSocketManager.shared.requestTranslation(messageId: messageId, targetLanguage: targetLang)
                }
            )

            floatingHeaderSection

            // Quick reaction bar — surfaced as a BOTTOM-anchored overlay
            // sitting just above the composer when the user taps the
            // smiley "+" inside a bubble. The legacy `+MessageRow` SwiftUI
            // list rendered this inline next to each cell, but the new
            // UICollectionView host doesn't carry the row-side state, so
            // we hoist the bar to the conversation root where it floats
            // over whichever message triggered it.
            //
            // Layout :
            //   - Color.clear backdrop (full-screen) → tap dismisses
            //     the bar, with the same spring as the open animation.
            //     `contentShape(Rectangle())` is REQUIRED for Color.clear
            //     to register taps — without it SwiftUI treats it as
            //     transparent for hit-testing.
            //   - Bar pinned to bottom via `.frame(maxHeight: .infinity, alignment: .bottom)`.
            //     Without that, the wrapper collapses to its intrinsic
            //     size and the parent ZStack centers it on screen.
            //   - `transition(.move(edge: .bottom).combined(with: .opacity))`
            //     + the `withAnimation { quickReactionMessageId = ... }`
            //     in `onAddReaction` produce the spring rise animation
            //     on appear and the symmetric fall on dismiss.
            if let pickerMessageId = overlayState.quickReactionMessageId {
                ZStack {
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture { closeReactionBar() }

                    quickReactionBar(for: pickerMessageId)
                        .padding(.horizontal, 16)
                        .padding(.bottom, composerHeight + 12)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(99)
            }

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
                            style: isDark ? .dark : .light,
                            onSelect: { emoji in
                                composerState.emojiToInject = emoji
                            }
                        )
                        .frame(height: 260)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    if viewModel.isConversationClosed {
                        closedConversationBanner
                    } else {
                        themedComposer
                    }
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

    /// Type-erased to break the deep opaque-type chain that crashes the
    /// SwiftUI runtime metadata resolver on first render. The chain
    /// `body → bodyWithSheets → bodyWithCovers → bodyWithLifecycle →
    /// bodyContent → floatingHeaderSection → expandedHeaderBand` produced a
    /// mangled name long enough that `swift_getTypeByMangledName` recursed
    /// past the demangler's depth limit (60+ frames of `decodeMangledType`)
    /// and crashed in `swift::SubstGenericParametersFromMetadata::buildDescriptorPath`.
    /// AnyView is a known escape hatch for this class of bug — its mangled
    /// name is a single fixed token, capping the chain depth.
    private var expandedHeaderBand: AnyView {
        AnyView(expandedHeaderBandBody)
    }

    @ViewBuilder
    private var expandedHeaderBandBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                ThemedBackButton(color: accentColor, compactMode: composerState.showOptions) { HapticFeedback.light(); router.pop() }
                expandedHeaderMidContent
                headerAvatarView
            }
        }
        .padding(.horizontal, composerState.showOptions ? 10 : 0)
        .padding(.vertical, composerState.showOptions ? 6 : 0)
        .background(expandedHeaderBackground)
        .padding(.horizontal, composerState.showOptions ? 8 : 16)
        .padding(.top, 8)
    }

    /// Middle slot of the header band (between back button and avatar).
    /// Extracted as a separate `@ViewBuilder` property because inlining the
    /// `if composerState.showOptions { … } else { Spacer() }` branches
    /// alongside the rest of the band produced an opaque return type that
    /// Swift's runtime metadata resolver couldn't materialize — `body` would
    /// crash at first render with a deep `swift_getTypeByMangledName` stack.
    @ViewBuilder
    private var expandedHeaderMidContent: some View {
        if composerState.showOptions {
            expandedHeaderTitleAndTags
        } else {
            Spacer()
        }
    }

    /// Title + tags column shown when the composer-options drawer is open.
    @ViewBuilder
    private var expandedHeaderTitleAndTags: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .top, spacing: 4) {
                Button { composerState.showConversationInfo = true } label: {
                    expandedHeaderTitleLabel
                }
                .accessibilityLabel(conversation?.name ?? "Conversation")
                .accessibilityHint("Ouvre les informations de la conversation")

                Spacer(minLength: 4)
                headerCallButtons.layoutPriority(1)
                expandedHeaderSearchButton
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
    }

    /// Title text + optional revalidation sparkle. Splitting this off keeps
    /// the conditional `Image` inside its own opaque type and prevents
    /// SwiftUI from baking it into the parent's already-complex type tree.
    @ViewBuilder
    private var expandedHeaderTitleLabel: some View {
        HStack(spacing: 6) {
            Text(conversation?.name ?? "Conversation")
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
            // Subtle "revalidating" sparkle: shown while we serve stale cache
            // and silently refresh from the server. Disappears as soon as the
            // REST response lands — no blocking spinner.
            if viewModel.isRevalidating {
                Image(systemName: "sparkles")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .symbolEffect(.pulse, options: .repeating)
                    .accessibilityLabel("Actualisation en arriere-plan")
            }
        }
    }

    private var expandedHeaderSearchButton: some View {
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

    @ViewBuilder
    private var expandedHeaderBackground: some View {
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

    // MARK: - Reply Thread Overlay

    @ViewBuilder
    private var replyThreadOverlayContent: some View {
        if overlayState.showReplyThread, let parentId = overlayState.replyThreadParentId {
            ReplyThreadOverlay(
                conversationId: viewModel.conversationId,
                parentMessageId: parentId,
                accentColor: accentColor,
                isDark: isDark,
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
                onToggleStar: {
                    _ = viewModel.toggleStar(
                        messageId: msg.id,
                        conversationName: conversation?.name,
                        conversationAccentColor: accentColor
                    )
                    HapticFeedback.success()
                },
                isStarred: viewModel.isStarred(messageId: msg.id),
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
                    // Show the confirmation dialog so the user can pick
                    // between local-only and server-broadcast deletion.
                    overlayState.deleteConfirmMessageId = msg.id
                },
                onDeleteAttachment: { attachmentId in
                    Task { await viewModel.deleteAttachment(messageId: msg.id, attachmentId: attachmentId) }
                }
            )
            .transition(.opacity).zIndex(999)
        }
    }
}
