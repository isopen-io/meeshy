import SwiftUI
import Combine
import os
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
    /// Message whose call-detail sheet (transcript-aware, `CallSummaryDetailSheet`)
    /// is presented — separate from `detailSheetMessage`, which stays wired to
    /// `MessageMoreSheet` for regular messages.
    var callDetailMessage: Message? = nil
    var moreSheetInitialItem: MoreItem? = nil
    /// Message dont le picker d'emoji complet (réaction) est présenté.
    var fullReactionPickerMessage: Message? = nil
    var quickReactionMessageId: String? = nil

    /// Bubble cell frame (window coordinates) of the message whose
    /// add-reaction button opened the quick-reaction bar. Anchors the bar's
    /// placement; `nil` falls back to the legacy bottom-pinned position.
    var quickReactionAnchorFrame: CGRect? = nil
    var emojiOnlyMode = false
    var deleteConfirmMessageId: String? = nil
    var showStoryViewer = false
    var storyViewerUserId: String? = nil
    var storyViewerGroupIndex: Int = 0
    var storyViewerSlideIndex: Int = 0
    /// `true` quand le viewer est ouvert depuis l'avatar d'un expéditeur
    /// (première non-vue) ; `false` quand une story-reply cible une slide
    /// précise via `storyViewerSlideIndex`.
    var storyViewerStartAtFirstUnviewed = false
    var showReplyThread = false
    var replyThreadParentId: String? = nil
}

struct ConversationScrollState {
    var isNearBottom: Bool = true
    var unreadBadgeCount: Int = 0
    var scrollToBottomTrigger: Int = 0
    var scrollToMessageId: String? = nil
    /// Counter incremented each time a scroll-to-message is requested via the
    /// server-loaded path (jumpToQuotedMessage). The MessageListView bridge
    /// compares old vs. new to fire the VC's scrollToMessage.
    var scrollToMessageTrigger: Int = 0
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
    var audioToEdit: PendingAudioEdit? = nil
    // "Éditer" from the recent-media strip — edited BEFORE staging (the edited
    // output goes through the camera-capture pipeline, never the original).
    var recentImageToEdit: UIImage? = nil
    var recentVideoToEdit: URL? = nil
}

struct PreviewMedia: Identifiable {
    let id = UUID()
    let url: URL
    let type: String?
}

/// A pending audio attachment opened for editing — carries the attachment id
/// so the editor can replace that exact tray chip on confirm (never append).
struct PendingAudioEdit: Identifiable, Equatable {
    /// The id of the `MessageAttachment` being edited.
    let id: String
    let url: URL
}

struct ConversationComposerState {
    var showOptions = false
    var actionAlert: String? = nil
    var forwardMessage: Message? = nil
    var showConversationInfo = false

    // Popup consentement vocal à l'envoi d'audio (2026-07-08) : proposé UNE
    // fois par session de conversation ; quelle que soit la décision, l'envoi
    // repart — le refus envoie l'audio sans transcription/traduction.
    var showVoiceAutoTranslateConsent = false
    var voiceConsentPromptedThisSession = false
    
    // Attachment state
    var pendingAttachments: [MessageAttachment] = []
    var pendingMediaFiles: [String: URL] = [:]
    var pendingThumbnails: [String: UIImage] = [:]
    var isLoadingMedia = false

    /// In-flight attachment preparations (decompression → compression →
    /// thumbnailing → ThumbHash). Each entry renders an `AttachmentLoadingTile`
    /// in the composer tray until it transitions to `.ready`, at which point
    /// the result is moved into `pendingAttachments`/`pendingMediaFiles`/
    /// `pendingThumbnails` and the handle is dropped from this array.
    var preparingAttachments: [PreparingAttachment] = []
    
    // Pickers
    var showPhotoPicker = false
    var showCamera = false
    var showFilePicker = false
    var selectedPhotoItems: [PhotosPickerItem] = []
    /// True while `selectedPhotoItems` is being primed with the recent-media
    /// strip's multi-selection before presenting the PhotosPicker. Priming
    /// fires the selection onChange once — this flag swallows that echo so
    /// items are only ingested when the user actually confirms in the picker.
    var photoPickerPriming = false
    
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

extension ConversationComposerState {
    /// Replaces the audio attachment `attachmentId` in place with the freshly
    /// edited recording. Editing a media attachment must never spawn a second
    /// tray chip — this mirrors the image editor's replace-by-id contract
    /// (`pendingAttachments[idx] = …`). Returns the now-stale audio file URL so
    /// the caller can delete it from disk.
    @discardableResult
    mutating func applyEditedAudio(attachmentId: String, editedURL: URL, durationMs: Int) -> URL? {
        let staleURL = pendingMediaFiles[attachmentId]
        let duration = max(durationMs, 500)
        pendingMediaFiles[attachmentId] = editedURL
        if let index = pendingAttachments.firstIndex(where: { $0.id == attachmentId }) {
            pendingAttachments[index] = MessageAttachment(
                id: attachmentId,
                mimeType: "audio/mp4",
                duration: duration,
                channels: 2,
                thumbnailColor: pendingAttachments[index].thumbnailColor
            )
        } else {
            pendingAttachments.append(
                MessageAttachment(id: attachmentId, mimeType: "audio/mp4", duration: duration, channels: 2)
            )
        }
        return staleURL == editedURL ? nil : staleURL
    }
}

struct ConversationHeaderState {
    var showStoryViewerFromHeader = false
    var storyUserIdForHeader: String?
    var showSearch = false
    var searchQuery = ""
}

struct ConversationView: View {
    let conversation: Conversation?
    var replyContext: ReplyContext? = nil
    var anonymousSession: AnonymousSessionContext? = nil
    /// Lightweight preview presentation (notification long-press overlay):
    /// the composer hides file/photo attachments and exposes a view-once
    /// toggle, while keeping text / voice / effects / blur / ephemeral. Default
    /// `false` leaves the full conversation screen unchanged.
    var previewMode: Bool = false
    /// In `previewMode`, called when the user taps anywhere over the message
    /// area (composer excluded) to leave the preview and open the full
    /// conversation with a navigation transition.
    var onOpenFullConversation: (() -> Void)? = nil

    // NOTE: Properties below are internal (not private) for cross-file extension access.
    // Extensions in ConversationView+MessageRow, +Header, +ScrollIndicators, +Composer.

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) var colorScheme
    /// U1 inc.2 — namespace zoom injecté par RootView (no-op < iOS 18/nil).
    @Environment(\.zoomTransitionNamespace) private var zoomNamespace
    var isDark: Bool { colorScheme == .dark }
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet de la conversation. La présence est rafraîchie via les refreshs naturels.
    var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var router: Router
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @StateObject var viewModel: ConversationViewModel
    /// Observes ONLY typing state — avoids full-view re-render on every keystroke.
    /// `internal` (not `private`): accessed by the `ConversationView+ScrollIndicators`
    /// extension, which lives in a separate file (private is file-scoped).
    @ObservedObject var typingObserver: ConversationStateStore
    /// Observe le blocage pour réafficher la zone composer « débloquer » dès
    /// qu'un block/unblock change. Événement rare (action explicite), hors hot
    /// path — safe (même pattern que ConversationListView). Seuls les blocages
    /// SORTANTS sont connus du client ; un blocage entrant remonte en erreur
    /// d'envoi côté gateway.
    private var blockService: BlockService { BlockService.shared }
    /// Texte du composer, ISOLÉ de l'arbre racine : tenu via `@State` (stockage
    /// stable) mais JAMAIS lu dans ce body ni observé ici — seul
    /// `ComposerTextHost` (+Composer) s'y abonne, donc la frappe ne ré-évalue
    /// que le sous-arbre composer au lieu des ~1500 lignes de la racine.
    /// Lecture/écriture depuis les handlers (send, mention, edit) via
    /// `composerText.text` — hors body, donc sans créer de dépendance.
    @State var composerText = ConversationComposerTextModel()
    @StateObject var audioRecorder = AudioRecorderManager()
    @StateObject var scrollButtonAudioPlayer = AudioPlaybackManager()
    @StateObject var pendingAudioPlayer = AudioPlaybackManager()
    /// Composant unifié « Enregistrer » au niveau écran — sert l'action
    /// `.saveMedia` du menu appui-long (l'overlay n'est pas un cover, la
    /// sheet de destinations se présente sans conflit).
    @StateObject var mediaSaveCoordinator = MediaSaveCoordinator()
    
    @FocusState var isTyping: Bool
    @FocusState var isSearchFocused: Bool

    @State var composerState = ConversationComposerState()
    @State var headerState = ConversationHeaderState()

    // Overlay & Detail state
    @State var overlayState = ConversationOverlayState()

    /// Per-cell screen-frame map populated by `MessageFramePreferenceKey`
    /// publishes from each `BubbleSwipeContainer`. The long-press handler
    /// looks up the target message's frame here at gesture fire time and
    /// passes it to `MessageOverlayMenu` as the source frame.
    @State var frameTracker = MessageFrameTracker()

    // Scroll, Media & Swipe state
    @State var scrollState = ConversationScrollState()
    @State var composerHeight: CGFloat = 130
    @State private var keyboardHeight: CGFloat = 0
    @State private var initialScrollCompleted: Bool = false


    let defaultReactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "💯", "😍", "👀", "🤣", "💪", "✨", "🥺"]

    // MARK: - Composer Height Measurement

    /// Persist the whole compose state (text, inline reply, selected language,
    /// effects, blur, ephemeral duration) so the user never loses context when
    /// the app is killed mid-sentence. Empty drafts are purged from
    /// `UserDefaults` by `DraftStore.save(_:for:)`.
    private func persistDraft(text: String, attachmentRefs: [DraftAttachmentRef]? = nil) {
        let ref = composerState.pendingReplyReference
        // Les refs de pièces jointes sont l'autorité du handler background
        // (copie durable) : une frappe intermédiaire les PRÉSERVE au lieu de
        // les écraser — sinon chaque lettre tapée perdrait les pièces du
        // brouillon persisté.
        let refs = attachmentRefs
            ?? DraftStore.shared.load(for: viewModel.conversationId)?.attachments
        let draft = MessageDraft(
            text: text,
            replyToId: ref?.messageId,
            replyAuthorName: ref?.authorName,
            replyPreviewText: ref?.previewText,
            replyIsMe: ref?.isMe ?? false,
            selectedLanguage: composerState.selectedLanguage,
            effectFlags: viewModel.pendingEffects.flags.rawValue,
            isBlurEnabled: viewModel.isBlurEnabled,
            ephemeralDurationRawValue: viewModel.ephemeralDuration?.rawValue,
            attachments: (refs?.isEmpty ?? true) ? nil : refs
        )
        DraftStore.shared.save(draft, for: viewModel.conversationId)
    }

    /// Copie durable des pièces jointes du tray au passage en background,
    /// puis re-save du brouillon avec leurs références. Rebuild complet à
    /// chaque background : une pièce retirée du tray ne ressuscite jamais.
    private func persistDraftAttachmentsForBackground() {
        guard let userId = AuthManager.shared.currentUser?.id else { return }
        let refs = MessageDraftMediaStore.persist(
            attachments: composerState.pendingAttachments,
            files: composerState.pendingMediaFiles,
            userId: userId,
            conversationId: viewModel.conversationId
        )
        persistDraft(text: composerText.text, attachmentRefs: refs)
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

    var headerStoryRingState: StoryRingState {
        guard conversation?.type == .direct,
              let userId = conversation?.participantUserId else { return .none }
        return storyViewModel.storyRingState(forUserId: userId)
    }

    var accentColor: String {
        conversation?.accentColor ?? DynamicColorGenerator.colorForName(conversation?.name ?? "Unknown")
    }

    var secondaryColor: String {
        conversation?.colorPalette.secondary ?? MeeshyColors.indigo300Hex
    }

    var isDirect: Bool {
        conversation?.type == .direct
    }

    /// DM participant the current user has (outgoing) blocked — drives the
    /// composer "unblock to chat" zone. `nil` when not a DM, no participant, or
    /// not blocked. Only outgoing blocks are known client-side (product
    /// decision); incoming blocks surface as a gateway send error.
    var blockedDirectParticipantId: String? {
        guard isDirect, let uid = conversation?.participantUserId,
              blockService.isBlocked(userId: uid) else { return nil }
        return uid
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
        guard let sectionId = conversation?.userState.sectionId else { return nil }
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

    var isCurrentUserAdminOrMod: Bool {
        let convRole = conversation?.currentUserRole?.uppercased() ?? ""
        let platformRole = AuthManager.shared.currentUser?.role?.uppercased() ?? ""
        let modRoles: Set<String> = ["ADMIN", "MODERATOR", "BIGBOSS"]
        return modRoles.contains(convRole) || modRoles.contains(platformRole)
    }

    // MARK: - Init

    init(conversation: Conversation?, replyContext: ReplyContext? = nil, anonymousSession: AnonymousSessionContext? = nil, previewMode: Bool = false, onOpenFullConversation: (() -> Void)? = nil) {
        self.conversation = conversation
        self.replyContext = replyContext
        self.anonymousSession = anonymousSession
        self.previewMode = previewMode
        self.onOpenFullConversation = onOpenFullConversation
        let vm = ConversationViewModel(
            conversationId: conversation?.id ?? "",
            unreadCount: conversation?.userState.unreadCount ?? 0,
            isDirect: conversation?.type == .direct,
            participantUserId: conversation?.participantUserId,
            memberJoinedAt: conversation?.currentUserJoinedAt,
            closedAt: conversation?.closedAt,
            anonymousSession: anonymousSession
        )
        _viewModel = StateObject(wrappedValue: vm)
        // Wire the typing observer separately so typing changes don't re-evaluate
        // the full conversation body — only typing-specific sub-views update.
        _typingObserver = ObservedObject(wrappedValue: vm.stateStore)
    }

    // MARK: - Encryption Disclaimer

    @ViewBuilder
    private var encryptionDisclaimer: some View {
        if let conv = conversation, conv.encryptionMode != nil, !viewModel.hasOlderMessages, !viewModel.isLoadingInitial {
            VStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "lock.fill")
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .foregroundColor(MeeshyColors.indigo400)
                    .padding(MeeshySpacing.sm)
                    .background(Circle().fill(MeeshyColors.indigo400.opacity(0.15)))

                Text(String(localized: "conversation.view.e2e_notice", bundle: .main))
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.sm)
            }
            .padding(.vertical, MeeshySpacing.lg)
            .padding(.horizontal, MeeshySpacing.lg)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md - 2)
                    .fill(isDark ? Color.black.opacity(0.4) : Color(UIColor.systemBackground).opacity(0.6))
            )
            .padding(.horizontal, MeeshySpacing.xxl)
            .padding(.top, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.sm)
        }
    }

    // MARK: - Closed Conversation Banner

    private var closedConversationBanner: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "lock.fill")
                .foregroundColor(.secondary)
            Text(String(localized: "conversation.view.closed", bundle: .main))
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.md + 2)
        .background(.ultraThinMaterial)
    }

    // MARK: - Blocked Conversation Composer Zone

    /// Replaces the composer for a DM the user has blocked: explains they must
    /// unblock to write to and receive messages from the user, with a one-tap
    /// unblock CTA. Mirrors `closedConversationBanner`'s static-zone pattern.
    private func blockedComposerZone(userId: String) -> some View {
        VStack(spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "hand.raised.fill")
                    .foregroundColor(.secondary)
                Text(String(localized: "conversation.composer.blocked.title", bundle: .main))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.secondary)
            }
            Text(String(localized: "conversation.composer.blocked.subtitle", bundle: .main))
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button {
                HapticFeedback.medium()
                Task {
                    await BlockActionCoordinator.shared.unblock(userId: userId)
                    await MainActor.run { HapticFeedback.success() }
                }
            } label: {
                Text(String(localized: "conversation.composer.blocked.unblock", bundle: .main))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.xxl)
                    .padding(.vertical, MeeshySpacing.sm + 2)
                    .background(Capsule().fill(Color(hex: accentColor)))
            }
            .accessibilityLabel(String(localized: "conversation.composer.blocked.unblock", bundle: .main))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.lg)
        .padding(.horizontal, MeeshySpacing.xxl)
        .background(.ultraThinMaterial)
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
                    startAtFirstUnviewed: true,
                    presentationSource: "ConversationView.header"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationListViewModel)
                // U1 inc.2 — zoom depuis la bulle si elle est enregistrée
                // (tray in-chat), fallback cover standard sinon (avatar header).
                .zoomTransitionDestination(sourceID: headerState.storyUserIdForHeader ?? "", in: zoomNamespace)
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
                    startAtFirstUnviewed: overlayState.storyViewerStartAtFirstUnviewed,
                    presentationSource: "ConversationView.overlay"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationListViewModel)
                .zoomTransitionDestination(sourceID: overlayState.storyViewerUserId ?? "", in: zoomNamespace)
            }
            .sheet(isPresented: $composerState.showConversationInfo) {
                if let conv = conversation { ConversationInfoSheet(conversation: conv, accentColor: accentColor, messages: viewModel.messages) }
            }
            .alert(String(localized: "conversation.view.action_selected", bundle: .main), isPresented: Binding(get: { composerState.actionAlert != nil }, set: { if !$0 { composerState.actionAlert = nil } })) {
                Button(String(localized: "common.ok", bundle: .main)) { composerState.actionAlert = nil }
            } message: { Text(composerState.actionAlert ?? "") }
            // Popup consentement vocal (2026-07-08) : envoi d'un audio sans
            // consentement validé → proposer la traduction automatique. La
            // validation accorde le consentement de définition du profil
            // vocal ET la traduction utilisant ce profil, puis relance
            // l'envoi ; « Plus tard » envoie tel quel (le composer n'a pas
            // encore été vidé quand ce popup interrompt le send).
            .alert(
                String(localized: "conversation.voiceConsent.title",
                       defaultValue: "Traduction automatique des vocaux", bundle: .main),
                isPresented: $composerState.showVoiceAutoTranslateConsent
            ) {
                Button(String(localized: "conversation.voiceConsent.accept",
                              defaultValue: "Activer", bundle: .main)) {
                    viewModel.grantVoiceAutoTranslationConsent()
                    sendMessageWithAttachments()
                }
                Button(String(localized: "conversation.voiceConsent.later",
                              defaultValue: "Plus tard", bundle: .main), role: .cancel) {
                    sendMessageWithAttachments()
                }
            } message: {
                Text(String(localized: "conversation.voiceConsent.message",
                            defaultValue: "Autorisez la définition de votre profil vocal pour que vos messages vocaux soient transcrits et traduits automatiquement dans la langue de chaque destinataire — y compris avec votre voix.",
                            bundle: .main))
            }
            .confirmationDialog(
                String(localized: "conversation.view.delete_message.title", bundle: .main),
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
                    Button(String(localized: "conversation.view.delete_for_everyone", bundle: .main), role: .destructive) {
                        Task { await viewModel.deleteMessage(messageId: msgId, mode: .everyone) }
                        overlayState.deleteConfirmMessageId = nil
                    }
                }
                Button(String(localized: "conversation.view.delete_for_me", bundle: .main), role: .destructive) {
                    Task { await viewModel.deleteMessage(messageId: msgId, mode: .local) }
                    overlayState.deleteConfirmMessageId = nil
                }
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) { overlayState.deleteConfirmMessageId = nil }
            } message: { _ in
                Text(String(localized: "conversation.view.delete_for_everyone.hint", bundle: .main))
            }
            .sheet(item: $composerState.forwardMessage) { msgToForward in
                ForwardPickerSheet(message: msgToForward, sourceConversationId: conversation?.id ?? "", accentColor: accentColor) { composerState.forwardMessage = nil }
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .overlay { overlayMenuContent }
            .onPreferenceChange(MessageFramePreferenceKey.self) { frames in
                frameTracker.update(frames)
            }
            .sheet(isPresented: $overlayState.showReplyThread) {
                if let parentId = overlayState.replyThreadParentId,
                   let parent = viewModel.messages.first(where: { $0.id == parentId }) {
                    ThreadView(parentMessage: parent, conversationId: viewModel.conversationId)
                        .environmentObject(statusViewModel)
                }
            }
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
            .mediaSaveFlow(mediaSaveCoordinator)
            .sheet(item: $overlayState.detailSheetMessage) { msg in
                let ctx = MessageMenuContext(
                    isMine: msg.isMe,
                    canEdit: msg.isMe || isCurrentUserAdminOrMod,
                    canDelete: msg.isMe || isCurrentUserAdminOrMod,
                    hasText: !msg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                    hasMedia: !msg.attachments.isEmpty,
                    hasTimebasedMedia: msg.attachments.contains { AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack },
                    isPinned: msg.pinnedAt != nil,
                    isStarred: viewModel.isStarred(messageId: msg.id),
                    isEdited: msg.isEdited,
                    hasEditRevisions: !viewModel.editRevisions(for: msg.id).isEmpty
                )
                MessageMoreSheet(
                    message: msg,
                    contactColor: conversation?.accentColor ?? MeeshyColors.brandPrimaryHex,
                    conversationId: viewModel.conversationId,
                    sections: MessageActionResolver.moreSections(ctx),
                    initialItem: overlayState.moreSheetInitialItem,
                    textTranslations: viewModel.messageTranslations[msg.id] ?? [],
                    transcription: viewModel.messageTranscriptions[msg.id],
                    translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
                    editRevisions: viewModel.editRevisions(for: msg.id),
                    onReply: { triggerReply(for: msg) },
                    onForward: { composerState.forwardMessage = msg },
                    onThread: {
                        overlayState.replyThreadParentId = msg.id
                        overlayState.showReplyThread = true
                    },
                    onDeleteMedia: {
                        if let attId = msg.attachments.first?.id {
                            Task { await viewModel.deleteAttachment(messageId: msg.id, attachmentId: attId) }
                        }
                    },
                    onSelectTranslation: { translation in
                        viewModel.setActiveTranslation(for: msg.id, translation: translation)
                    },
                    onSelectAudioLanguage: { langCode in
                        viewModel.setActiveAudioLanguage(for: msg.id, language: langCode)
                    },
                    onReport: { type, reason in
                        Task {
                            let success = await viewModel.reportMessage(messageId: msg.id, reportType: type, reason: reason)
                            if success { HapticFeedback.success() }
                            else { HapticFeedback.error() }
                        }
                    }
                )
            }
            .sheet(item: $overlayState.callDetailMessage) { msg in
                if let summary = msg.callSummary {
                    CallSummaryDetailSheet(
                        summary: summary,
                        isOutgoing: summary.initiatorId == viewModel.currentUserIdForView,
                        accentHex: accentColor,
                        timestamp: msg.createdAt,
                        onCallBack: { s in viewModel.callBack(for: s) }
                    )
                }
            }
            .sheet(item: $overlayState.fullReactionPickerMessage) { msg in
                EmojiPickerSheet(
                    quickReactions: ["❤️", "😂", "👍", "🔥", "😍", "😮", "😢", "👏", "🎉"],
                    onSelect: { emoji in
                        viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                        overlayState.fullReactionPickerMessage = nil
                    }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
    }

    private var bodyWithLifecycle: some View {
        bodyContent
            .background(InteractivePopEnabler())
            .task {
                // Activate the live (StateObject-retained) VM exactly once.
                // Heavy side-effects (GRDB observation, initial load, Combine
                // subscriptions, sync-engine gate) are deferred here out of
                // `init` so the throwaway VMs SwiftUI allocates on every
                // reconstruction stay free — see ConversationViewModel.start().
                viewModel.start()
                viewModel.observeSync()
                await viewModel.loadMessages()
                MessageSocketManager.shared.connect()

                if let messageId = router.pendingHighlightMessageId, !messageId.isEmpty {
                    router.pendingHighlightMessageId = nil
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    guard !Task.isCancelled else { return }
                    if viewModel.messages.contains(where: { $0.id == messageId }) {
                        scrollState.scrollToMessageId = messageId
                        scrollState.scrollToMessageTrigger += 1
                    } else {
                        await viewModel.loadMessagesAround(messageId: messageId)
                        if Task.isCancelled { return }
                        try? await Task.sleep(nanoseconds: 100_000_000)
                        guard !Task.isCancelled else { return }
                        scrollState.scrollToMessageId = messageId
                        scrollState.scrollToMessageTrigger += 1
                    }
                }

                // Ouverture depuis le bouton Recherche de l'aperçu long-press :
                // active directement la barre de recherche in-conversation.
                if router.pendingOpenSearch {
                    router.pendingOpenSearch = false
                    try? await Task.sleep(nanoseconds: 250_000_000)
                    guard !Task.isCancelled else { return }
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        headerState.showSearch = true
                    }
                }
            }
            .onAppear {
                if let context = replyContext { composerState.pendingReplyReference = context.toReplyReference }
                // Language priority (Prisme Linguistique): the user's primary
                // configured content language is the source of truth and wins
                // the compose default. The active keyboard layout is only a
                // FALLBACK — used for anonymous users or unsupported content
                // languages. It must NEVER override the in-app preference, the
                // same way `deviceLocale` ranks last in language resolution.
                //
                // Locale.current is likewise NOT consulted: it reflects the
                // device's UI language, decoupled from the chosen content
                // language. A French-speaker on an English keyboard / English
                // iPhone composes in French; live detection corrects in-flight
                // if they actually type another language.
                if let userLang = AuthManager.shared.currentUser?
                        .preferredContentLanguages.first,
                   LanguageOption.defaults.contains(where: { $0.code == userLang }) {
                    composerState.selectedLanguage = userLang
                } else if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
                    let code = String(kbd.prefix(2))
                    if LanguageOption.defaults.contains(where: { $0.code == code }) {
                        composerState.selectedLanguage = code
                    }
                }
                // Brancher la persistance du brouillon (immédiate à chaque
                // fin de mot / champ vidé, débouncée 400 ms en milieu de mot
                // — cf. ConversationComposerTextModel). Vit sur le modèle
                // isolé : la racine ne se ré-évalue plus à la frappe, donc un
                // `onChange` ici ne fonctionnerait plus. La closure capture
                // une copie de la vue mais lit les @State/@StateObject via
                // leur stockage LIVE.
                composerText.onPersistNeeded = { text in
                    persistDraft(text: text)
                }
                if composerText.text.isEmpty, let draft = DraftStore.shared.load(for: viewModel.conversationId) {
                    composerText.text = draft.text
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
                    // Pièces jointes du brouillon (copiées en durable au
                    // background) : restaure les survivantes dans le tray —
                    // un fichier purgé est sauté silencieusement, le texte
                    // reste intact. Thumbnails régénérées pour les images.
                    if let refs = draft.attachments, !refs.isEmpty,
                       composerState.pendingAttachments.isEmpty,
                       let userId = AuthManager.shared.currentUser?.id {
                        let restored = MessageDraftMediaStore.restore(
                            refs: refs,
                            userId: userId,
                            conversationId: viewModel.conversationId
                        )
                        composerState.pendingAttachments = restored.attachments
                        composerState.pendingMediaFiles = restored.files
                        for attachment in restored.attachments where attachment.kind == .image {
                            if let url = restored.files[attachment.id],
                               let thumb = UIImage(contentsOfFile: url.path) {
                                composerState.pendingThumbnails[attachment.id] = thumb
                            }
                        }
                    }
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { overlayState.longPressEnabled = true }
            }
            .adaptiveOnChange(of: router.replyContextVersion) { _, _ in
                // Réponse à un mood affiché dans la barre directe courante : la vue
                // est déjà à l'écran, `onAppear` ne se redéclenche pas. On applique
                // le contexte au composer ssi il cible CETTE conversation directe.
                guard isDirect,
                      let ctx = router.pendingReplyContext,
                      ctx.authorId == conversation?.participantUserId else { return }
                composerState.pendingReplyReference = ctx.toReplyReference
                router.pendingReplyContext = nil
            }
            .adaptiveOnChange(of: composerState.pendingReplyReference?.messageId) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: composerState.selectedLanguage) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: viewModel.pendingEffects.flags.rawValue) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: viewModel.isBlurEnabled) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: viewModel.ephemeralDuration?.rawValue) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: scrollState.isNearBottom) { _, _ in
                if composerState.showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { composerState.showTextEmojiPicker = false }
                }
            }
            .adaptiveOnChange(of: isTyping) { _, focused in
                if focused && composerState.showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { composerState.showTextEmojiPicker = false }
                }
            }
            .adaptiveOnChange(of: scenePhase) { _, phase in
                // Read-receipt precision: messages that arrived while the app was
                // backgrounded were deliberately NOT auto-marked read (the user
                // wasn't looking). On return to the foreground, if the user is at
                // the bottom they now see the latest message — re-emit the read so
                // the deferred receipt completes. If scrolled up, the message is
                // still off-screen and stays unread until they scroll down. The
                // gateway-level dedup makes a redundant call harmless.
                if phase == .active && scrollState.isNearBottom {
                    viewModel.markAsRead()
                }
                // Pièces jointes du brouillon : copie durable au passage en
                // background (les fichiers du tray vivent dans tmp/, purgeable
                // par iOS) — miroir du D1 story. Rebuild complet : la vérité
                // est l'état courant du tray.
                if phase == .background {
                    persistDraftAttachmentsForBackground()
                }
            }
            .adaptiveOnChange(of: viewModel.accessRevoked) { _, revoked in
                // Server signalled the user no longer has access to this
                // conversation (kicked, group deleted, blocked, etc.). The
                // ViewModel has already wiped per-conversation cache and
                // local message state. We dismiss the screen here and
                // surface a toast so the user knows why.
                guard revoked else { return }
                FeedbackToastManager.shared.showError(viewModel.error ?? String(localized: "conversation.accessRevoked", bundle: .main))
                dismiss()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { notification in
                guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
                keyboardHeight = frame.height
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                keyboardHeight = 0
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
                // Le debounce de 400 ms a remplacé la persistance par frappe :
                // sans ce flush, backgrounder l'app (ou la tuer depuis
                // l'app-switcher) dans la fenêtre de debounce perdrait la fin
                // de la saisie — onDisappear ne couvre que la navigation.
                composerText.flushPendingChange()
            }
            .onDisappear {
                composerText.flushPendingChange()
                // Rompt le cycle de rétention : `onPersistNeeded` capture une
                // copie de cette struct, dont le wrapper State retient (via sa
                // box de stockage) le modèle vivant — soit modèle → closure →
                // copie de la vue → State box → modèle. Sans ce nil, le modèle
                // ET le ConversationViewModel (retenu transitivement par le
                // wrapper @StateObject de la copie) fuiteraient à chaque
                // teardown. onAppear réinstalle le callback si la vue revient
                // (retour d'un fullScreenCover/sheet) — aucune frappe n'est
                // possible pendant qu'elle est couverte.
                composerText.onPersistNeeded = nil
                // Arrêt déterministe des deux players locaux (scroll-button +
                // preview d'audio en attente) : sans lui, l'audio continuait
                // jusqu'au dealloc du @StateObject et la session restait
                // acquise (refcount) le temps de la libération. Idempotent.
                scrollButtonAudioPlayer.stop()
                pendingAudioPlayer.stop()
                if audioRecorder.isRecording {
                    audioRecorder.cancelRecording()
                }
            }
    }

    // MARK: - Skeleton Overlay

    /// Vertical stack of skeleton bubbles used as the cold-start
    /// placeholder. The bubble indices alternate left/right inside
    /// `SkeletonMessageBubble` so the column reads like a real
    /// conversation thread while the first network/cache pass runs.
    private var messageSkeletonOverlay: some View {
        VStack(spacing: MeeshySpacing.md) {
            ForEach(0..<6, id: \.self) { index in
                SkeletonMessageBubble(index: index)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MeeshySpacing.md + 2)
        .padding(.top, 96)
        .padding(.bottom, composerHeight + MeeshySpacing.xxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "conversation.view.loading_messages", bundle: .main)))
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
                scrollToBottomTrigger: scrollState.scrollToBottomTrigger,
                scrollToMessageId: scrollState.scrollToMessageId,
                scrollToMessageTrigger: scrollState.scrollToMessageTrigger,
                isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
                onNewMessagesBadge: { count in
                    scrollState.unreadBadgeCount = count
                },
                onScrollToMessage: { targetId in
                    // Tap on a reply chip inside a bubble: jump to the cited
                    // message. Uses the new jumpToQuotedMessage flow which:
                    // 1. Checks if the message is already local → instant scroll
                    // 2. If not, shows a pulsing indicator on the scroll button
                    //    while fetching from the server
                    // 3. After loading, triggers the visual scroll + highlight
                    Task {
                        let result = await viewModel.jumpToQuotedMessage(messageId: targetId)
                        switch result {
                        case .foundLocally:
                            // The VC's scrollToMessage already handled the
                            // visual scroll for the local case.
                            break
                        case .loadedFromServer:
                            // The store snapshot was reloaded around the target.
                            // Trigger the VC to scroll to it now.
                            scrollState.scrollToMessageId = targetId
                            scrollState.scrollToMessageTrigger += 1
                        case .notFound:
                            HapticFeedback.error()
                            FeedbackToastManager.shared.show(String(localized: "conversation.messageNotFound", bundle: .main), type: .info)
                        }
                    }
                },
                onLoadOlder: {
                    // Infinite scroll: VM owns the cache + network sequence
                    // (syncEngine.fetchOlderMessages → store.loadOlder).
                    // Going through the store directly stalls once the local
                    // GRDB window is exhausted, leaving older messages
                    // unreachable.
                    await viewModel.loadOlderMessages()
                },
                onNearBottomChanged: { nearBottom in
                    let wasNearBottom = scrollState.isNearBottom
                    if scrollState.isNearBottom != nearBottom {
                        scrollState.isNearBottom = nearBottom
                    }
                    viewModel.isCurrentlyNearBottom = nearBottom
                    // Read-receipt precision: a message that arrived while the
                    // user was scrolled up was deliberately NOT auto-marked read
                    // (it was off-screen). Scrolling back to the bottom means the
                    // user now sees it — re-emit the read so the deferred receipt
                    // completes. Idempotent; only on the false→true edge.
                    if nearBottom && !wasNearBottom {
                        viewModel.markAsRead()
                    }
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
                        overlayState.storyViewerStartAtFirstUnviewed = false
                        overlayState.showStoryViewer = true
                    }
                },
                onViewSenderStory: { userId in
                    // Anneau story d'un avatar de bulle (conversations de
                    // groupe) → story de CET expéditeur, première non-vue.
                    overlayState.storyViewerUserId = userId
                    overlayState.storyViewerSlideIndex = 0
                    overlayState.storyViewerStartAtFirstUnviewed = true
                    overlayState.showStoryViewer = true
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
                    // Preserve l'overlay menu existant (MessageOverlayMenu panel).
                    // L'infrastructure frame-tracking + LayoutEngine reste en place
                    // et sera utilisée ensuite pour lifter la bulle dans le flow
                    // du menu existant (sans remplacer le menu lui-même).
                    guard overlayState.longPressEnabled else { return }
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    if msg.callSummary != nil {
                        overlayState.callDetailMessage = msg
                    } else if msg.messageSource != .system {
                        overlayState.overlayMessage = msg
                        overlayState.showOverlayMenu = true
                    }
                },
                // iOS 26+ : contenu du `.contextMenu` NATIF (Liquid Glass) des
                // bulles — mêmes actions que l'overlay custom (SSOT). `nil`
                // renvoyé pour les messages système / résumés d'appel (pas de
                // menu). Le builder est appelé une fois par config de cellule.
                nativeMessageMenu: { msg in buildNativeMessageMenu(for: msg) },
                onCallDetailRequest: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.callDetailMessage = msg
                },
                onAddReaction: { messageId, bubbleFrame in
                    // Spring-open the emoji bar anchored to the tapped bubble
                    // (appears below it, flips above near the composer).
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        overlayState.emojiOnlyMode = true
                        overlayState.quickReactionAnchorFrame = bubbleFrame
                        overlayState.quickReactionMessageId = messageId
                    }
                    HapticFeedback.light()
                },
                onToggleReaction: { messageId, emoji in
                    viewModel.toggleReaction(messageId: messageId, emoji: emoji)
                },
                onReactToAttachment: { attachmentId, messageId, emoji in
                    viewModel.toggleAttachmentReaction(attachmentId: attachmentId, messageId: messageId, emoji: emoji)
                },
                onOpenReactPicker: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.fullReactionPickerMessage = msg
                },
                onShowMessageInfo: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.moreSheetInitialItem = .views
                    overlayState.detailSheetMessage = msg
                },
                onShowReadStatus: { messageId in
                    // Tap sur les coches (✓ / ✓✓ / ✓✓ bleu) d'un message envoyé.
                    // Ouvre la sheet detail sur l'onglet "Vues" pour consulter
                    // qui a reçu / qui a lu — sans passer par le long-press.
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.moreSheetInitialItem = .views
                    overlayState.detailSheetMessage = msg
                },
                onRetry: { messageId in
                    // Tap on the orange retry band of a FAILED outgoing message.
                    // `retryMessage` deletes the failed row and re-sends with the
                    // SAME clientMessageId (gateway dedup) AND kicks the outbox
                    // flusher — so the resend actually fires (the old local
                    // OfflineQueue reset never flushed on a foregrounded device).
                    Task { await viewModel.retryMessage(messageId: messageId) }
                },
                onShowReactions: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.moreSheetInitialItem = .reactions
                    overlayState.detailSheetMessage = msg
                },
                onShowTranslationDetail: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.moreSheetInitialItem = .language
                    overlayState.detailSheetMessage = msg
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

            // L'indicateur de frappe n'est PAS un overlay : c'est une vraie
            // cellule du flux de messages, rendue en dernier par
            // `MessageListViewController` (voir `MessageListItem.typingIndicator`).

            // Notification preview: a tap anywhere over the message area opens
            // the full conversation (navigation transition). The composer is
            // excluded (bottom inset) so the user can still reply in place.
            if previewMode {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { onOpenFullConversation?() }
                    .padding(.bottom, composerHeight)
                    .zIndex(49)
                    .accessibilityLabel(String(localized: "conversation.preview.open", bundle: .main))
            }

            floatingHeaderSection

            // Quick reaction bar — a floating overlay anchored to the bubble
            // whose smiley "+" the user tapped. `quickReactionBarOverlay`
            // places the bar just below that bubble (using the cell frame
            // captured at tap time) and flips it above when the message
            // hugs the composer. See `QuickReactionBarPlacement`.
            if let pickerMessageId = overlayState.quickReactionMessageId {
                quickReactionBarOverlay(for: pickerMessageId)
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
                                .foregroundStyle(MeeshyColors.warning)
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

            if !scrollState.isNearBottom || viewModel.isSearchingQuotedMessage {
                VStack { Spacer(); HStack { Spacer(); scrollToBottomButton.padding(.trailing, 16).padding(.bottom, composerHeight + 8) } }
                    .zIndex(60)
                    .transition(.asymmetric(insertion: .scale(scale: 0.8).combined(with: .opacity), removal: .scale(scale: 0.6).combined(with: .opacity)))
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: scrollState.isNearBottom)
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.isSearchingQuotedMessage)
            }

            VStack {
                Spacer()
                VStack(spacing: 0) {
                    if viewModel.activeMentionQuery != nil {
                        mentionSuggestionPanel
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    if let blockedId = blockedDirectParticipantId {
                        blockedComposerZone(userId: blockedId)
                    } else if viewModel.isConversationClosed {
                        closedConversationBanner
                    } else {
                        themedComposer
                    }
                    // Panneau emoji inline — glisse vers le haut À LA PLACE DU
                    // CLAVIER, donc EN DESSOUS de la barre de composition (jamais
                    // au-dessus). Même placement que le carrousel de pièces
                    // jointes et que le composer story, pour une bascule
                    // clavier ⇄ emoji sans saut visuel.
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
                }
                .background(.ultraThinMaterial)
                .ignoresSafeArea(.container, edges: .bottom)
                .background(
                    GeometryReader { geo in
                        Color.clear
                            .onAppear { updateComposerHeight(geo.size.height) }
                            .adaptiveOnChange(of: geo.size.height) { _, h in updateComposerHeight(h) }
                    }
                )
            }
            .zIndex(50)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: composerState.showTextEmojiPicker)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.activeMentionQuery != nil)

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
                        composerText.text = viewModel.insertMention(candidate, into: composerText.text)
                    } label: {
                        HStack(spacing: MeeshySpacing.sm + 2) {
                            MeeshyAvatar(
                                name: candidate.displayName,
                                context: .userListItem,
                                accentColor: accentColor,
                                avatarURL: candidate.avatarURL
                            )
                            VStack(alignment: .leading, spacing: 1) {
                                Text(candidate.displayName)
                                    .font(MeeshyFont.relative(14, weight: .semibold))
                                    .foregroundColor(theme.textPrimary)
                                Text("@\(candidate.username)")
                                    .font(MeeshyFont.relative(12))
                                    .foregroundColor(theme.textSecondary)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                    }
                    .accessibilityLabel(String(localized: "conversation.view.mention", bundle: .main))
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
                HStack(spacing: MeeshySpacing.sm) {
                    ThemedBackButton(color: accentColor, unreadCount: viewModel.otherConversationsUnread) { HapticFeedback.light(); router.pop() }
                    Spacer()
                    ThemedAvatarButton(
                        name: conversation?.name ?? "?", color: accentColor, secondaryColor: secondaryColor,
                        isExpanded: false, storyState: headerStoryRingState,
                        avatarURL: conversation?.type == .direct ? conversation?.participantAvatarURL : conversation?.avatar,
                        presenceState: headerPresenceState,
                        moodEmoji: headerMoodEmoji
                    ) {
                        isTyping = false
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { composerState.showOptions = true }
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.sm)
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
            ConversationTitleLabel(
                name: conversation?.displayName ?? "Conversation",
                favoriteEmoji: conversation?.userState.reaction,
                font: MeeshyFont.relative(15, weight: .semibold, design: .rounded),
                color: .white
            )
            Spacer()
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(11, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(theme.textMuted.opacity(0.12)))
            }
            .accessibilityLabel(String(localized: "conversation.view.close", bundle: .main))
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
            HStack(spacing: MeeshySpacing.sm) {
                ThemedBackButton(color: accentColor, compactMode: composerState.showOptions, unreadCount: viewModel.otherConversationsUnread) { HapticFeedback.light(); router.pop() }
                expandedHeaderMidContent
                headerAvatarView
            }
        }
        .padding(.horizontal, composerState.showOptions ? MeeshySpacing.sm + 2 : 0)
        .padding(.vertical, composerState.showOptions ? MeeshySpacing.sm - 2 : 0)
        .background(expandedHeaderBackground)
        .padding(.horizontal, composerState.showOptions ? MeeshySpacing.sm : MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
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
            // Call button stays next to the search icon in BOTH states
            // (user-requested 2026-07-11) — collapsing/expanding the header
            // only toggles the name/category/tags/favorite-emoji area
            // (expandedHeaderTitleAndTags), never the call button's presence.
            HStack {
                Spacer()
                headerButtonsCluster
            }
        }
    }

    /// Call + search buttons, grouped with zero extra spacing between them
    /// (user-requested 2026-07-11: "les boutons n'ont pas besoin d'être si
    /// loin l'un de l'autre"). Each button already carries its own ~8pt of
    /// invisible padding via `.meeshyTapTarget()`'s 44×44 HIG minimum around
    /// a visually 28×28 glass circle — stacking the HStack's own spacing ON
    /// TOP of that built-in padding is what pushed them apart. `spacing: 0`
    /// still leaves that built-in padding as the visible gap (no tap-target
    /// overlap between the two 44×44 hit areas).
    private var headerButtonsCluster: some View {
        HStack(spacing: 0) {
            headerCallButtons.layoutPriority(1)
            expandedHeaderSearchButton
        }
    }

    /// Title + tags column shown when the composer-options drawer is open.
    @ViewBuilder
    private var expandedHeaderTitleAndTags: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs - 1) {
            HStack(alignment: .top, spacing: MeeshySpacing.xs) {
                Button { composerState.showConversationInfo = true } label: {
                    expandedHeaderTitleLabel
                        .meeshyTapTarget()
                }
                .accessibilityLabel(conversation?.name ?? "Conversation")
                .accessibilityHint(String(localized: "conversation.view.open_info", bundle: .main))

                Spacer(minLength: 4)
                headerButtonsCluster
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
        HStack(spacing: MeeshySpacing.xs + 2) {
            ConversationTitleLabel(
                name: conversation?.displayName ?? "Conversation",
                favoriteEmoji: conversation?.userState.reaction,
                font: MeeshyFont.relative(13, weight: .bold, design: .rounded),
                color: .white,
                lineLimit: 2
            )
            // Subtle "revalidating" sparkle: shown while we serve stale cache
            // and silently refresh from the server. Disappears as soon as the
            // REST response lands — no blocking spinner.
            if viewModel.isRevalidating {
                Image(systemName: "sparkles")
                    .font(MeeshyFont.relative(10, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .adaptiveSymbolPulse()
                    .accessibilityLabel(String(localized: "conversation.view.refreshing_background", bundle: .main))
            }
        }
    }

    private var expandedHeaderSearchButton: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { headerState.showSearch = true }
            isSearchFocused = true
        } label: {
            Image(systemName: "magnifyingglass")
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundStyle(LinearGradient(colors: [Color(hex: accentColor), Color(hex: secondaryColor)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 28, height: 28)
                .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(0.25))
                .meeshyTapTarget()
        }
        .accessibilityLabel(String(localized: "conversation.view.search_in_conversation", bundle: .main))
        .accessibilityHint(String(localized: "accessibility.search.hint", bundle: .main))
        .accessibilityIdentifier("conversation.header.search")
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

    // MARK: - Overlay Menu Content (extracted to help type-checker)

    @ViewBuilder
    private var overlayMenuContent: some View {
        if overlayState.showOverlayMenu, let msg = overlayState.overlayMessage {
            MessageOverlayMenu(
                message: msg,
                contactColor: accentColor,
                messageBubbleFrame: frameTracker.frame(for: msg.id) ?? .zero,
                isPresented: $overlayState.showOverlayMenu,
                canDelete: msg.isMe || isCurrentUserAdminOrMod,
                canEdit: msg.isMe || isCurrentUserAdminOrMod,
                onCopy: { UIPasteboard.general.string = msg.content; HapticFeedback.success() },
                onEdit: {
                    composerState.editingMessageId = msg.id
                    composerState.editingOriginalContent = msg.content
                    composerText.text = msg.content
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
                onReact: { emoji in
                    viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                },
                onDelete: {
                    // Show the confirmation dialog so the user can pick
                    // between local-only and server-broadcast deletion.
                    overlayState.deleteConfirmMessageId = msg.id
                },
                onSaveMedia: {
                    // Composant unifié « Enregistrer » — l'action n'apparaît
                    // que pour un message à exactement UN attachment.
                    guard let attachment = msg.attachments.first(where: { $0.type != .location }) else { return }
                    HapticFeedback.light()
                    mediaSaveCoordinator.requestSave(MediaSaveRequest(
                        kind: attachment.kind,
                        remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
                        suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                        attachmentId: attachment.id.isEmpty ? nil : attachment.id
                    ))
                },
                isDirect: isDirect,
                preferredTranslation: viewModel.preferredTranslation(for: msg.id),
                mentionDisplayNames: viewModel.mentionDisplayNames,
                currentUserId: AuthManager.shared.currentUser?.id ?? "",
                userRegionalLanguage: AuthManager.shared.currentUser?.regionalLanguage,
                userCustomDestinationLanguage: AuthManager.shared.currentUser?.customDestinationLanguage,
                onShowTranslate: {
                    overlayState.moreSheetInitialItem = .language
                    overlayState.detailSheetMessage = msg
                },
                onShowMore: {
                    overlayState.moreSheetInitialItem = nil
                    overlayState.detailSheetMessage = msg
                },
                onExpandFullPicker: {
                    overlayState.fullReactionPickerMessage = msg
                }
            )
            .transition(.opacity).zIndex(999)
        }
    }

    // MARK: - Menu message NATIF (iOS 26 Liquid Glass)

    /// Contenu du `.contextMenu` natif d'une bulle (iOS 26+, cf. MessageListView
    /// / MessageListViewController). Palette d'emojis rapides (`ControlGroup`,
    /// choix produit 2026-07-14) + actions primaires via `MessageActionResolver`
    /// — EXACTEMENT les mêmes callbacks que `overlayMenuContent` (SSOT). Menu
    /// vide pour les messages système / résumés d'appel (parité overlay :
    /// aucun menu). Reply/Forward restent dans « Plus… » (feuille détail) et
    /// via le swipe latéral, inchangés.
    private func buildNativeMessageMenu(for msg: Message) -> AnyView {
        guard msg.callSummary == nil, msg.messageSource != .system else {
            return AnyView(EmptyView())
        }
        let hasText = !msg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let ctx = MessageMenuContext(
            isMine: msg.isMe,
            canEdit: msg.isMe || isCurrentUserAdminOrMod,
            canDelete: msg.isMe || isCurrentUserAdminOrMod,
            hasText: hasText,
            hasMedia: !msg.attachments.isEmpty,
            hasTimebasedMedia: msg.attachments.contains {
                AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack
            },
            isPinned: msg.pinnedAt != nil,
            isStarred: viewModel.isStarred(messageId: msg.id),
            isEdited: msg.isEdited,
            hasEditRevisions: true,
            saveableAttachmentCount: msg.attachments.filter { $0.type != .location }.count
        )
        let actions = MessageActionResolver.primaryActions(ctx)
        // 4 emojis les plus utilisés (fallback sur les défauts) — rangée rapide
        // du menu natif. PLAFOND à 4 : au-delà, `.compactMenu` passe à la ligne
        // (la rangée doit rester sur UNE seule ligne — feedback device 2026-07-14).
        let recentEmojis = EmojiUsageTracker.topEmojis(count: 4, defaults: Self.nativeQuickReactionEmojis)
        return AnyView(
            Group {
                // Réactions rapides = rangée horizontale d'emojis (4 plus
                // utilisés) via `ControlGroup` + `.controlGroupStyle(.compactMenu)`
                // — rendu système en rangée medium (pattern Messages/Photos, cf.
                // RecentMediaStrip). SANS ce style, le ControlGroup empile les
                // emojis (3 + 3 vertical, feedback device 2026-07-14). iOS 16.4+ ;
                // le menu natif n'existe que sur iOS 26 → toujours disponible.
                if #available(iOS 16.4, *) {
                    ControlGroup {
                        ForEach(recentEmojis, id: \.self) { emoji in
                            Button {
                                viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                            } label: {
                                Text(emoji)
                            }
                        }
                    }
                    .controlGroupStyle(.compactMenu)
                } else {
                    ForEach(recentEmojis, id: \.self) { emoji in
                        Button {
                            viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                        } label: {
                            Text(emoji)
                        }
                    }
                }

                // « Plus d'emojis » → picker complet (sous la rangée rapide).
                Button {
                    overlayState.fullReactionPickerMessage = msg
                } label: {
                    Label(
                        String(localized: "action.more_emojis", defaultValue: "Plus d'emojis", bundle: .main),
                        systemImage: "plus"
                    )
                }

                Divider()

                ForEach(actions, id: \.self) { action in
                    if action == .delete { Divider() }
                    nativeMenuButton(action, msg: msg)
                }
            }
        )
    }

    /// Emojis de la palette rapide du menu natif (sous-ensemble des défauts de
    /// l'overlay — un menu système ne doit pas porter les 20).
    private static let nativeQuickReactionEmojis = ["😂", "❤️", "👍", "😮", "😢", "🔥"]

    /// Un item du menu natif pour une `PrimaryAction` — mêmes actions que
    /// l'overlay (`overlayMenuContent`). `.delete` porte `role: .destructive`
    /// (rendu rouge système) et arme la confirmation, jamais de delete direct.
    @ViewBuilder
    private func nativeMenuButton(_ action: PrimaryAction, msg: Message) -> some View {
        switch action {
        case .edit:
            Button {
                composerState.editingMessageId = msg.id
                composerState.editingOriginalContent = msg.content
                composerText.text = msg.content
            } label: {
                Label(String(localized: "action.edit", defaultValue: "Éditer", bundle: .main), systemImage: "pencil")
            }
        case .translate:
            Button {
                overlayState.moreSheetInitialItem = .language
                overlayState.detailSheetMessage = msg
            } label: {
                Label(String(localized: "action.translate", defaultValue: "Traduire", bundle: .main), systemImage: "globe")
            }
        case .copy:
            Button {
                UIPasteboard.general.string = msg.content
                HapticFeedback.success()
            } label: {
                Label(String(localized: "action.copy", defaultValue: "Copier", bundle: .main), systemImage: "doc.on.doc")
            }
        case .saveMedia:
            Button {
                guard let attachment = msg.attachments.first(where: { $0.type != .location }) else { return }
                HapticFeedback.light()
                mediaSaveCoordinator.requestSave(MediaSaveRequest(
                    kind: attachment.kind,
                    remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
                    suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                    attachmentId: attachment.id.isEmpty ? nil : attachment.id
                ))
            } label: {
                Label(String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main), systemImage: "arrow.down.to.line")
            }
        case .pin:
            Button {
                Task { await viewModel.togglePin(messageId: msg.id) }
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "action.pin", defaultValue: "Épingler", bundle: .main), systemImage: "pin.fill")
            }
        case .unpin:
            Button {
                Task { await viewModel.togglePin(messageId: msg.id) }
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main), systemImage: "pin.slash.fill")
            }
        case .star:
            Button {
                _ = viewModel.toggleStar(messageId: msg.id, conversationName: conversation?.name, conversationAccentColor: accentColor)
                HapticFeedback.success()
            } label: {
                Label(String(localized: "action.star", defaultValue: "Favori", bundle: .main), systemImage: "star.fill")
            }
        case .unstar:
            Button {
                _ = viewModel.toggleStar(messageId: msg.id, conversationName: conversation?.name, conversationAccentColor: accentColor)
                HapticFeedback.success()
            } label: {
                Label(String(localized: "action.unstar", defaultValue: "Retirer des favoris", bundle: .main), systemImage: "star.slash.fill")
            }
        case .more:
            Button {
                overlayState.moreSheetInitialItem = nil
                overlayState.detailSheetMessage = msg
            } label: {
                Label(String(localized: "action.more", defaultValue: "Plus…", bundle: .main), systemImage: "ellipsis")
            }
        case .delete:
            Button(role: .destructive) {
                overlayState.deleteConfirmMessageId = msg.id
            } label: {
                Label(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
            }
        }
    }
}
