// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK

private var searchDebounceKey: UInt8 = 0

// MARK: - Message Row, Reactions & Search
extension ConversationView {

    // MARK: - Extracted message row (avoids type-checker timeout)

    @ViewBuilder
    func messageRow(index: Int, msg: Message) -> some View {
        let nextMsg: Message? = index + 1 < viewModel.messages.count ? viewModel.messages[index + 1] : nil
        let isLastInGroup: Bool = nextMsg == nil || nextMsg?.senderId != msg.senderId
        let bubblePresence: PresenceState = isDirect ? .offline : presenceManager.presenceState(for: msg.senderId ?? "")
        let lastReceivedIdx = viewModel.messages.indices.last(where: { !viewModel.messages[$0].isMe })
        let isLastReceived = !msg.isMe && index == lastReceivedIdx

        // Swipe direction: reply = swipe toward center (right for other, left for own)
        let replyDirection: CGFloat = msg.isMe ? -1 : 1
        let isActiveSwipe = scrollState.swipedMessageId == msg.id

        ZStack {
            // Icône répondre/transférer révélée élastiquement derrière la bulle
            if isActiveSwipe {
                let progress = min(abs(scrollState.swipeOffset) / 72.0, 1.0)
                let isReplyDir = scrollState.swipeOffset * replyDirection > 0
                let iconColor = isReplyDir ? "4ECDC4" : "F8B500"
                HStack {
                    // L'icône se place du côté révélé (opposé au déplacement de la bulle)
                    if scrollState.swipeOffset <= 0 { Spacer() }
                    Image(systemName: isReplyDir ? "arrowshape.turn.up.left.fill" : "arrowshape.turn.up.forward.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color(hex: iconColor))
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color(hex: iconColor).opacity(0.15)))
                        .scaleEffect(0.4 + 0.6 * progress)
                        .opacity(min(progress * 2.5, 1.0))
                    if scrollState.swipeOffset > 0 { Spacer() }
                }
                .padding(.horizontal, 16)
            }

            VStack(spacing: 0) {
                ThemedMessageBubble(
                    message: msg,
                    contactColor: accentColor,
                    transcription: viewModel.messageTranscriptions[msg.id],
                    translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
                    textTranslations: viewModel.messageTranslations[msg.id] ?? [],
                    preferredTranslation: viewModel.preferredTranslation(for: msg.id),
                    showAvatar: !isDirect && isLastInGroup,
                    presenceState: bubblePresence,
                    senderMoodEmoji: statusViewModel.statusForUser(userId: msg.senderId ?? "")?.moodEmoji,
                    onAddReaction: { messageId in
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            overlayState.emojiOnlyMode = true
                            overlayState.quickReactionMessageId = messageId
                        }
                        HapticFeedback.light()
                    },
                    onToggleReaction: { emoji in
                        viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                    },
                    onOpenReactPicker: { messageId in
                        let target = viewModel.messageIndex(for: messageId).map { viewModel.messages[$0] } ?? msg
                        overlayState.detailSheetMessage = target
                        overlayState.detailSheetInitialTab = .react
                        overlayState.showMessageDetailSheet = true
                    },
                    onShowInfo: {
                        overlayState.detailSheetMessage = msg
                        overlayState.detailSheetInitialTab = .views
                        overlayState.showMessageDetailSheet = true
                    },
                    onShowReactions: { messageId in
                        overlayState.detailSheetMessage = viewModel.messageIndex(for: messageId).map { viewModel.messages[$0] } ?? msg
                        overlayState.detailSheetInitialTab = .reactions
                        overlayState.showMessageDetailSheet = true
                    },
                    onReplyTap: { messageId in
                        scrollState.scrollToMessageId = messageId
                    },
                    onMediaTap: { attachment in
                        // User explicitly tapped media -> always cache (not conditional)
                        if let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString {
                            Task { await MediaCacheManager.shared.prefetch(resolved) }
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
                    },
                    onShowTranslationDetail: { messageId in
                        overlayState.detailSheetMessage = viewModel.messageIndex(for: messageId).map { viewModel.messages[$0] } ?? msg
                        overlayState.detailSheetInitialTab = .language
                        overlayState.showMessageDetailSheet = true
                    },
                    allAudioItems: viewModel.allAudioItems,
                    onScrollToMessage: { messageId in
                        scrollState.scrollToMessageId = messageId
                    },
                    activeAudioLanguage: viewModel.activeAudioLanguageOverrides[msg.id] ?? nil,
                    isLastReceivedMessage: isLastReceived
                )
                .onLongPressGesture(minimumDuration: 0.5) {
                    guard overlayState.longPressEnabled else { return }
                    // Removed overlayMessageFrame (GeometryReader dependency)
                    // We will center the overlay menu in screen if needed, 
                    // or rely on native Menu in future iterations. 
                    overlayState.overlayMessage = msg
                    overlayState.showOverlayMenu = true
                    HapticFeedback.medium()
                }
                .opacity(msg.deliveryStatus == .failed ? 0.7 : 1.0)

                // Reply count pill
                if let replyCount = replyCountFor(messageId: msg.id), replyCount > 0 {
                    HStack {
                        if msg.isMe { Spacer() }
                        replyCountPill(count: replyCount, isMe: msg.isMe, parentMessageId: msg.id)
                        if !msg.isMe { Spacer() }
                    }
                    .padding(.top, 2)
                }

                // Quick reaction bar (below message)
                if overlayState.quickReactionMessageId == msg.id {
                    HStack {
                        if msg.isMe { Spacer() }
                        quickReactionBar(for: msg.id)
                        if !msg.isMe { Spacer() }
                    }
                    .transition(.scale(scale: 0.85, anchor: msg.isMe ? .topTrailing : .topLeading).combined(with: .opacity))
                    .padding(.top, 4)
                    .zIndex(100)
                }

                // Failed message retry bar
                if msg.deliveryStatus == .failed && msg.isMe {
                    failedMessageBar(for: msg)
                }
            }
            .offset(x: isActiveSwipe ? scrollState.swipeOffset : 0)
            .simultaneousGesture(
                DragGesture(minimumDistance: overlayState.quickReactionMessageId != nil ? 10000 : 15)
                    .onChanged { value in
                        let h = value.translation.width
                        let v = abs(value.translation.height)
                        // Geste clairement horizontal (ratio 2:1)
                        guard abs(h) > v * 2 else { return }
                        guard abs(h) > 12 else { return }
                        scrollState.swipedMessageId = msg.id
                        // Rubber-band : libre jusqu'à 72 pt, résistance 15 % au-delà
                        let zone: CGFloat = 72
                        let absH = abs(h)
                        let sign: CGFloat = h > 0 ? 1 : -1
                        if absH > zone {
                            scrollState.swipeOffset = sign * (zone + (absH - zone) * 0.15)
                        } else {
                            scrollState.swipeOffset = h
                        }
                    }
                    .onEnded { value in
                        let directed = scrollState.swipeOffset * replyDirection
                        // Déclenchement à ≥ 92 % de la zone (≈ 66 pt sur 72 pt)
                        if directed >= 66 {
                            triggerReply(for: msg)
                            HapticFeedback.success()
                        } else if directed <= -66 {
                            composerState.forwardMessage = msg
                            HapticFeedback.success()
                        } else if abs(scrollState.swipeOffset) > 15 {
                            HapticFeedback.light()
                        }
                        withAnimation(.spring(response: 0.42, dampingFraction: 0.62, blendDuration: 0.04)) {
                            scrollState.swipeOffset = 0
                            scrollState.swipedMessageId = nil
                        }
                    }
            )
        }
        .id(msg.id)
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(hex: "F8B500").opacity(scrollState.highlightedMessageId == msg.id ? 0.25 : 0))
                .shadow(
                    color: Color(hex: "F8B500").opacity(scrollState.highlightedMessageId == msg.id ? 0.4 : 0),
                    radius: scrollState.highlightedMessageId == msg.id ? 12 : 0
                )
                .animation(.easeInOut(duration: 0.3), value: scrollState.highlightedMessageId)
                .allowsHitTesting(false)
        )
        .transition(
            .asymmetric(
                insertion: .move(edge: msg.isMe ? .trailing : .leading).combined(with: .opacity),
                removal: .opacity
            )
        )
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: msg.content)
        .onTapGesture {
            if overlayState.quickReactionMessageId != nil && overlayState.quickReactionMessageId != msg.id {
                closeReactionBar()
            }
        }
        .onAppear {
            prefetchNearbyMedia(index: index)
        }
    }

    // MARK: - Media Prefetch

    func prefetchNearbyMedia(index: Int) {
        guard index >= 0 && index < viewModel.messages.count else { return }
        
        // Optimize: Only prefetch the media for the CURRENT message appearing,
        // rather than scanning 11 nearby messages every time a cell appears (O(N) overhead).
        let msg = viewModel.messages[index]
        
        for attachment in msg.attachments {
            let urls = [
                attachment.thumbnailUrl,
                attachment.type == .image ? attachment.fileUrl : nil,
            ].compactMap { $0 }.filter { !$0.isEmpty }

            for urlStr in urls {
                guard let resolved = MeeshyConfig.resolveMediaURL(urlStr) else { continue }
                Task { await MediaCacheManager.shared.prefetch(resolved.absoluteString) }
            }
        }

        if let avatarURL = msg.senderAvatarURL, !avatarURL.isEmpty {
            if let resolved = MeeshyConfig.resolveMediaURL(avatarURL) {
                Task { await MediaCacheManager.shared.prefetch(resolved.absoluteString) }
            }
        }
    }

    func triggerReply(for msg: Message) {
        let firstAttachment = msg.attachments.first
        let preview = msg.content.isEmpty
            ? (firstAttachment.map { "[\($0.type.rawValue.capitalized)]" } ?? "")
            : msg.content
        let attType = firstAttachment?.type.rawValue
        let attThumb = firstAttachment?.thumbnailUrl ?? (firstAttachment?.type == .image ? firstAttachment?.fileUrl : nil)
        composerState.pendingReplyReference = ReplyReference(
            messageId: msg.id,
            authorName: msg.senderName ?? "?",
            previewText: preview,
            isMe: msg.isMe,
            authorColor: msg.senderColor,
            attachmentType: attType,
            attachmentThumbnailUrl: attThumb
        )
        isTyping = true
        HapticFeedback.medium()
    }

    func scrollToAndHighlight(_ targetId: String, proxy: ScrollViewProxy) {
        let messageExists = viewModel.messages.contains { $0.id == targetId }
        guard messageExists else {
            ToastManager.shared.show("Message non disponible", type: .error)
            return
        }
        viewModel.markProgrammaticScroll()
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            proxy.scrollTo(targetId, anchor: .center)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(.easeIn(duration: 0.2)) {
                scrollState.highlightedMessageId = targetId
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                withAnimation(.easeOut(duration: 0.5)) {
                    scrollState.highlightedMessageId = nil
                }
            }
        }
    }

    // MARK: - Search Overlay

    // MARK: - Search Bar (below header)

    var searchBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textMuted)

                TextField("Rechercher dans la conversation...", text: $headerState.searchQuery)
                    .font(.system(size: 15))
                    .foregroundColor(theme.textPrimary)
                    .focused($isSearchFocused)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .submitLabel(.search)
                    .onSubmit { triggerBackendSearch() }
                    .onChange(of: headerState.searchQuery) { _, _ in debounceSearch() }

                if !headerState.searchQuery.isEmpty {
                    Button {
                        headerState.searchQuery = ""
                        viewModel.searchResults = []
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(theme.textMuted)
                    }
                    .accessibilityLabel("Effacer la recherche")
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
            )

            if viewModel.isSearching {
                ProgressView()
                    .tint(Color(hex: accentColor))
                    .scaleEffect(0.8)
            }

            Button {
                dismissSearch()
            } label: {
                Text("Fermer")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel("Fermer la recherche")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
        )
        .padding(.horizontal, 8)
        .padding(.top, 4)
    }

    // MARK: - Search Results Overlay (blurred background)

    var searchResultsOverlay: some View {
        VStack(spacing: 0) {
            if viewModel.searchResults.isEmpty && !viewModel.isSearching && headerState.searchQuery.count >= 2 {
                VStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 36, weight: .light))
                        .foregroundColor(theme.textMuted.opacity(0.5))
                    Text("Aucun résultat")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !viewModel.searchResults.isEmpty {
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 2) {
                        ForEach(viewModel.searchResults) { result in
                            searchResultRow(result)
                                .onTapGesture {
                                    Task { await jumpToSearchResult(result) }
                                }
                                .onAppear {
                                    if result.id == viewModel.searchResults.last?.id && viewModel.searchHasMore {
                                        Task { await viewModel.loadMoreSearchResults(query: headerState.searchQuery) }
                                    }
                                }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            Color.black.opacity(0.001)
                .onTapGesture { dismissSearch() }
        )
    }

    private func searchResultRow(_ result: SearchResultItem) -> some View {
        HStack(spacing: 10) {
            // Avatar
            MeeshyAvatar(
                name: result.senderName,
                mode: .custom(36),
                accentColor: DynamicColorGenerator.colorForName(result.senderName),
                avatarURL: result.senderAvatar
            )

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(result.senderName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    Text(formatSearchDate(result.createdAt))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                HStack(spacing: 4) {
                    if result.matchType == "translation" {
                        Image(systemName: "globe")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Color(hex: accentColor).opacity(0.7))
                    }

                    Text(highlightedText(result.matchedText, query: headerState.searchQuery))
                        .font(.system(size: 13))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.white.opacity(0.8))
        )
        .contentShape(Rectangle())
    }

    private func highlightedText(_ text: String, query: String) -> AttributedString {
        var attributed = AttributedString(text.prefix(120) + (text.count > 120 ? "..." : ""))
        let queryLower = query.lowercased()
        let textLower = String(text.prefix(120)).lowercased()
        if let range = textLower.range(of: queryLower) {
            let start = text.distance(from: text.startIndex, to: range.lowerBound)
            let end = text.distance(from: text.startIndex, to: range.upperBound)
            let attrStart = attributed.index(attributed.startIndex, offsetByCharacters: start)
            let attrEnd = attributed.index(attributed.startIndex, offsetByCharacters: min(end, text.prefix(120).count))
            if attrStart < attributed.endIndex && attrEnd <= attributed.endIndex {
                attributed[attrStart..<attrEnd].foregroundColor = Color(hex: accentColor)
                attributed[attrStart..<attrEnd].font = .system(size: 13, weight: .bold)
            }
        }
        return attributed
    }

    private static let searchTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    private static let searchDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "dd/MM/yy"
        return f
    }()

    private func formatSearchDate(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return Self.searchTimeFormatter.string(from: date)
        }
        if calendar.isDateInYesterday(date) {
            return "Hier"
        }
        return Self.searchDateFormatter.string(from: date)
    }

    // MARK: - Search Actions

    func triggerBackendSearch() {
        Task { await viewModel.searchMessages(query: headerState.searchQuery) }
    }

    private var searchDebounceTask: Task<Void, Never>? {
        get { objc_getAssociatedObject(self, &searchDebounceKey) as? Task<Void, Never> }
        nonmutating set { objc_setAssociatedObject(self, &searchDebounceKey, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }

    func debounceSearch() {
        searchDebounceTask?.cancel()
        let query = headerState.searchQuery
        searchDebounceTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled, query.count >= 2 else { return }
            await viewModel.searchMessages(query: query)
        }
    }

    func jumpToSearchResult(_ result: SearchResultItem) async {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            headerState.showSearch = false
        }
        isSearchFocused = false
        HapticFeedback.medium()

        await viewModel.loadMessagesAround(messageId: result.id)

        try? await Task.sleep(nanoseconds: 100_000_000)
        scrollState.scrollToMessageId = result.id
    }

    func dismissSearch() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            headerState.showSearch = false
            headerState.searchQuery = ""
            scrollState.highlightedMessageId = nil
        }
        viewModel.searchResults = [SearchResultItem]()
        viewModel.searchHasMore = false
        viewModel.searchNextCursor = nil as String?
        isSearchFocused = false
    }

    // MARK: - Search Overlay (combines bar + blur + results)

    var searchOverlay: some View {
        VStack(spacing: 0) {
            searchBar
            searchResultsBlurOverlay
        }
    }

    // MARK: - Search Results Blur Overlay (extracted for type-checker)

    @ViewBuilder
    var searchResultsBlurOverlay: some View {
        if headerState.showSearch && headerState.searchQuery.count >= 2 {
            Color.black.opacity(0.001)
                .background(.ultraThinMaterial)
                .ignoresSafeArea()
                .zIndex(80)
                .transition(.opacity)

            VStack(spacing: 0) {
                Color.clear.frame(height: composerState.showOptions ? 140 : 100)
                searchResultsOverlay
            }
            .zIndex(81)
            .transition(.opacity)
        }
    }

    // MARK: - Return to Latest Button (extracted for type-checker)

    @ViewBuilder
    var returnToLatestButton: some View {
        if viewModel.isInJumpedState && !headerState.showSearch {
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button {
                        HapticFeedback.medium()
                        Task { await viewModel.returnToLatest() }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.down.to.line")
                                .font(.system(size: 12, weight: .bold))
                            Text("Messages récents")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(Color(hex: accentColor).opacity(0.9))
                                .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 8, y: 2)
                        )
                    }
                    .accessibilityLabel("Retourner aux messages recents")
                    Spacer()
                }
                .padding(.bottom, composerHeight + 8)
            }
            .zIndex(65)
            .transition(.scale(scale: 0.8).combined(with: .opacity))
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.isInJumpedState)
        }
    }

    // MARK: - Quick Reaction Bar + Actions

    func quickReactionBar(for messageId: String) -> some View {
        let topReactions = EmojiUsageTracker.topEmojis(count: 15, defaults: defaultReactionEmojis)

        return VStack(spacing: 6) {
            quickReactionEmojiStrip(messageId: messageId, emojis: topReactions)

            if !overlayState.emojiOnlyMode {
                quickReactionActionsRow(messageId: messageId)
            }
        }
    }

    private func quickReactionEmojiStrip(messageId: String, emojis: [String]) -> some View {
        let accent = Color(hex: accentColor)
        return HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(emojis, id: \.self) { emoji in
                        Button {
                            viewModel.toggleReaction(messageId: messageId, emoji: emoji)
                            EmojiUsageTracker.recordUsage(emoji: emoji)
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                overlayState.quickReactionMessageId = nil
                            }
                        } label: {
                            Text(emoji)
                                .font(.system(size: 18))
                                .frame(width: 28, height: 28)
                        }
                        .buttonStyle(EmojiScaleButtonStyle())
                    }
                }
                .padding(.leading, 8)
                .padding(.trailing, 2)
            }
            .frame(maxWidth: 166) // ~5 emojis visible (5*28 + 4*4 + 10)

            Capsule()
                .fill(accent.opacity(0.2))
                .frame(width: 1, height: 18)
                .padding(.horizontal, 3)

            quickReactionPlusButton(messageId: messageId, accent: accent)
                .padding(.trailing, 8)
        }
        .padding(.vertical, 5)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().stroke(accent.opacity(0.2), lineWidth: 0.5))
                .shadow(color: accent.opacity(0.15), radius: 8, y: 3)
        )
    }

    private func quickReactionPlusButton(messageId: String, accent: Color) -> some View {
        Button {
            let msg = viewModel.messageIndex(for: messageId).map { viewModel.messages[$0] } ?? viewModel.messages.first!
            closeReactionBar()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                overlayState.detailSheetMessage = msg
                overlayState.detailSheetInitialTab = .react
                overlayState.showMessageDetailSheet = true
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(accent)
                .frame(width: 26, height: 26)
                .background(
                    Circle()
                        .fill(accent.opacity(0.15))
                        .overlay(Circle().stroke(accent.opacity(0.3), lineWidth: 0.5))
                )
        }
    }

    private func quickReactionActionsRow(messageId: String) -> some View {
        HStack(spacing: 8) {
            messageActionButton(icon: "arrowshape.turn.up.left.fill", label: String(localized: "action.reply", defaultValue: "Repondre"), color: "4ECDC4") {
                if let msg = viewModel.messageIndex(for: messageId).map({ viewModel.messages[$0] }) {
                    triggerReply(for: msg)
                }
                closeReactionBar()
            }
            messageActionButton(icon: "doc.on.doc.fill", label: String(localized: "action.copy", defaultValue: "Copier"), color: "9B59B6") {
                if let msg = viewModel.messageIndex(for: messageId).map({ viewModel.messages[$0] }) {
                    UIPasteboard.general.string = msg.content
                }
                closeReactionBar()
            }
            messageActionButton(icon: "arrowshape.turn.up.forward.fill", label: String(localized: "action.forward", defaultValue: "Transferer"), color: "F8B500") {
                composerState.forwardMessage = viewModel.messageIndex(for: messageId).map({ viewModel.messages[$0] })
                closeReactionBar()
            }
            messageActionButton(icon: "trash.fill", label: String(localized: "action.delete", defaultValue: "Supprimer"), color: "FF6B6B") {
                overlayState.deleteConfirmMessageId = messageId
                closeReactionBar()
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().stroke(Color(hex: accentColor).opacity(0.15), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
        )
        .transition(.scale(scale: 0.8).combined(with: .opacity))
    }

    func messageActionButton(icon: String, label: String, color: String, action: @escaping () -> Void) -> some View {
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

    func closeReactionBar() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            overlayState.quickReactionMessageId = nil
        }
    }

    // MARK: - Failed Message Retry
    func failedMessageBar(for msg: Message) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 11))
                .foregroundColor(Color(hex: "FF6B6B"))
                .accessibilityHidden(true)

            Text("Échec de l'envoi")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(hex: "FF6B6B"))

            Text("·")
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            Button {
                HapticFeedback.light()
                Task { await viewModel.retryMessage(messageId: msg.id) }
            } label: {
                Text("Réessayer")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel("Reessayer l'envoi du message")

            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    viewModel.removeFailedMessage(messageId: msg.id)
                }
            } label: {
                Text("Supprimer")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            .accessibilityLabel("Supprimer le message en echec")
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.horizontal, 16)
        .padding(.top, 2)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    // MARK: - Reply Count

    func replyCountFor(messageId: String) -> Int? {
        let count = viewModel.replyCountMap[messageId] ?? 0
        return count > 0 ? count : nil
    }

    func replyCountPill(count: Int, isMe: Bool, parentMessageId: String) -> some View {
        let accent = Color(hex: accentColor)
        let label = count == 1 ? "1 reponse" : "\(count) reponses"
        return Button {
            HapticFeedback.light()
            if let firstReply = viewModel.messages.first(where: { $0.replyToId == parentMessageId }) {
                scrollState.scrollToMessageId = firstReply.id
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrowshape.turn.up.left.2.fill")
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundColor(accent)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(accent.opacity(theme.mode.isDark ? 0.12 : 0.08))
                    .overlay(
                        Capsule()
                            .stroke(accent.opacity(theme.mode.isDark ? 0.2 : 0.12), lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(label)
        .accessibilityHint("Aller a la premiere reponse de ce message")
    }
}
