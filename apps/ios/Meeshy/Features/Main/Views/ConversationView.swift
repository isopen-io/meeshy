import SwiftUI
import PhotosUI
import CoreLocation
import MeeshySDK

struct ConversationView: View {
    let conversation: Conversation?
    var replyContext: ReplyContext? = nil
    let onBack: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject var storyViewModel: StoryViewModel
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

    init(conversation: Conversation?, replyContext: ReplyContext? = nil, onBack: @escaping () -> Void) {
        self.conversation = conversation
        self.replyContext = replyContext
        self.onBack = onBack
        _viewModel = StateObject(wrappedValue: ConversationViewModel(conversationId: conversation?.id ?? ""))
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
                        // Loading indicator at very top (only visible during active load)
                        if viewModel.isLoadingOlder {
                            HStack(spacing: 8) {
                                ProgressView()
                                    .tint(Color(hex: accentColor))
                                Text("Chargement...")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.secondary)
                            }
                            .frame(height: 36)
                            .transition(.opacity)
                        }

                        Color.clear.frame(height: 70)

                        ForEach(Array(viewModel.messages.enumerated()), id: \.element.id) { index, msg in
                            ThemedMessageBubble(message: msg, contactColor: accentColor)
                                .id(msg.id)
                                .transition(
                                    .asymmetric(
                                        insertion: .move(edge: msg.isMe ? .trailing : .leading).combined(with: .opacity),
                                        removal: .opacity
                                    )
                                )
                                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: msg.content)
                                .onAppear {
                                    // Only prefetch on manual scroll (not programmatic)
                                    guard !viewModel.isProgrammaticScroll else { return }
                                    let total = viewModel.messages.count
                                    let midpoint = total / 2
                                    let urgentPoint = total / 5 // top 20%
                                    // Anticipatory prefetch at midpoint
                                    if index <= midpoint && viewModel.hasOlderMessages && !viewModel.isLoadingOlder {
                                        viewModel.prefetchOlderIfNeeded()
                                    }
                                    // Urgent load when very close to top (fast scrolling)
                                    if index <= urgentPoint && viewModel.hasOlderMessages && !viewModel.isLoadingOlder {
                                        Task { await viewModel.loadOlderMessages() }
                                    }
                                }
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

            // Floating controls
            VStack {
                HStack {
                    // Back button
                    ThemedBackButton(color: accentColor) {
                        HapticFeedback.light()
                        onBack()
                    }

                    Spacer()

                    // Avatar button with story ring — tap toggles options menu
                    ThemedAvatarButton(
                        name: conversation?.name ?? "?",
                        color: accentColor,
                        secondaryColor: secondaryColor,
                        isExpanded: showOptions,
                        hasStoryRing: headerHasStoryRing
                    ) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showOptions.toggle()
                        }
                    }
                    .contextMenu {
                        // Long press: view stories, profile, info
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

                Spacer()
            }
            .zIndex(100)

            // Options ladder
            optionsLadder

            // Dismiss overlay
            if showOptions {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showOptions = false
                        }
                    }
                    .zIndex(99)
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

    // MARK: - Options Ladder
    private var optionsLadder: some View {
        VStack(spacing: 10) {
            ThemedActionButton(icon: "person.fill", color: "9B59B6") {
                actionAlert = "Profil de \(conversation?.name ?? "Contact")"
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showOptions = false }
            }
            .menuAnimation(showMenu: showOptions, delay: 0.0)

            ThemedActionButton(icon: "video.fill", color: "4ECDC4") {
                actionAlert = "Appel vidéo"
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showOptions = false }
            }
            .menuAnimation(showMenu: showOptions, delay: 0.04)

            ThemedActionButton(icon: "phone.fill", color: "F8B500") {
                actionAlert = "Appel vocal"
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showOptions = false }
            }
            .menuAnimation(showMenu: showOptions, delay: 0.08)

            ThemedActionButton(icon: "magnifyingglass", color: "FF6B6B") {
                actionAlert = "Rechercher dans la conversation"
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showOptions = false }
            }
            .menuAnimation(showMenu: showOptions, delay: 0.12)
        }
        .padding(.top, 58)
        .padding(.trailing, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .zIndex(showOptions ? 200 : -1)
        .allowsHitTesting(showOptions)
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
        HapticFeedback.light()
        Task {
            await viewModel.sendMessage(content: text)
        }
    }
}

// MARK: - Themed Back Button
struct ThemedBackButton: View {
    let color: String
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
            .scaleEffect(isPressed ? 0.9 : 1)
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
                size: .medium,
                accentColor: color,
                secondaryColor: secondaryColor,
                storyState: hasStoryRing ? .unread : .none
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

    @ObservedObject private var theme = ThemeManager.shared
    private let myColors = ["FF6B6B", "E91E63"]

    private var bubbleColor: String {
        message.isMe ? myColors[0] : contactColor
    }

    // Computed reaction summaries for display
    private var reactionSummaries: [ReactionSummary] {
        // Group reactions by emoji and count them
        var emojiCounts: [String: (count: Int, includesMe: Bool)] = [:]
        for reaction in message.reactions {
            let currentUserId = "" // Would be current user's ID
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
        HStack {
            if message.isMe { Spacer(minLength: 50) }

            VStack(alignment: message.isMe ? .trailing : .leading, spacing: 4) {
                // Reply reference
                if let reply = message.replyTo {
                    replyPreview(reply)
                }

                // Main bubble
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

                // Reactions
                if !reactionSummaries.isEmpty {
                    reactionsView
                }
            }

            if !message.isMe { Spacer(minLength: 50) }
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
            // Image placeholder
            RoundedRectangle(cornerRadius: 12)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 200, height: 150)
                .overlay(
                    Image(systemName: "photo.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.white.opacity(0.7))
                )

        case .video:
            // Video placeholder
            RoundedRectangle(cornerRadius: 12)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 200, height: 150)
                .overlay(
                    VStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .fill(Color.white.opacity(0.3))
                                .frame(width: 50, height: 50)
                            Image(systemName: "play.fill")
                                .font(.system(size: 20))
                                .foregroundColor(.white)
                        }
                        if let duration = attachment.durationFormatted {
                            Text(duration)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Capsule().fill(Color.black.opacity(0.5)))
                        }
                    }
                )

        case .audio:
            // Audio message with stylized waveform
            HStack(spacing: 12) {
                Circle()
                    .fill(Color.white.opacity(0.3))
                    .frame(width: 40, height: 40)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                    )

                // Stylized waveform with deterministic heights
                HStack(spacing: 2) {
                    ForEach(0..<20, id: \.self) { i in
                        let height = waveformHeight(for: i)
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.9), Color.white.opacity(0.5)],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                            .frame(width: 3, height: height)
                    }
                }

                if let duration = attachment.durationFormatted {
                    Text(duration)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                }
            }
            .frame(width: 200)

        case .file:
            // File attachment
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.white.opacity(0.2))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: "doc.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.white)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.originalName.isEmpty ? "Document" : attachment.originalName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    Text(attachment.fileSizeFormatted)
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.7))
                }

                Spacer()

                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.white.opacity(0.8))
            }
            .frame(width: 220)

        case .location:
            // Location placeholder
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

    // MARK: - Reactions View
    private var reactionsView: some View {
        HStack(spacing: 4) {
            ForEach(reactionSummaries, id: \.emoji) { reaction in
                HStack(spacing: 4) {
                    Text(reaction.emoji)
                        .font(.system(size: 14))
                    Text("\(reaction.count)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(reaction.includesMe ? Color(hex: bubbleColor) : theme.textMuted)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(reaction.includesMe ?
                              Color(hex: bubbleColor).opacity(theme.mode.isDark ? 0.2 : 0.15) :
                              theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05))
                        .overlay(
                            Capsule()
                                .stroke(reaction.includesMe ? Color(hex: bubbleColor).opacity(0.5) : Color.clear, lineWidth: 1)
                        )
                )
            }
        }
    }

    // MARK: - Waveform Height Generator (deterministic per bar index)
    private func waveformHeight(for index: Int) -> CGFloat {
        // Creates a natural-looking waveform pattern using sine waves
        let base: CGFloat = 10
        let amplitude: CGFloat = 14
        let phase1 = sin(Double(index) * 0.8) * 0.7
        let phase2 = sin(Double(index) * 1.6 + 1.0) * 0.3
        return base + amplitude * CGFloat(abs(phase1 + phase2))
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
