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
                    },
                    onShowInfo: {
                        infoSheetMessage = msg
                        showMessageInfoSheet = true
                    },
                    onReplyTap: { messageId in
                        scrollToMessageId = messageId
                    }
                )
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: MessageFrameKey.self,
                            value: [msg.id: geo.frame(in: .global)]
                        )
                    }
                )
                .onLongPressGesture(minimumDuration: 0.5) {
                    guard longPressEnabled else { return }
                    overlayMessageFrame = messageFrames[msg.id] ?? .zero
                    overlayMessage = msg
                    showOverlayMenu = true
                    HapticFeedback.medium()
                }
                .opacity(msg.deliveryStatus == .failed ? 0.7 : 1.0)

                // Failed message retry bar
                if msg.deliveryStatus == .failed && msg.isMe {
                    failedMessageBar(for: msg)
                }
            }
            .offset(x: isActiveSwipe ? swipeOffset : 0)
            .simultaneousGesture(
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
                            forwardMessage = msg
                        }
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            swipeOffset = 0
                            swipedMessageId = nil
                        }
                    }
            )
        }
        .id(msg.id)
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(hex: accentColor).opacity(highlightedMessageId == msg.id ? 0.2 : 0))
                .animation(.easeInOut(duration: 0.3), value: highlightedMessageId)
                .allowsHitTesting(false)
        )
        .transition(
            .asymmetric(
                insertion: .move(edge: msg.isMe ? .trailing : .leading).combined(with: .opacity),
                removal: .opacity
            )
        )
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: msg.content)
    }

    func triggerReply(for msg: Message) {
        let firstAttachment = msg.attachments.first
        let preview = msg.content.isEmpty
            ? (firstAttachment.map { "[\($0.type.rawValue.capitalized)]" } ?? "")
            : msg.content
        let attType = firstAttachment?.type.rawValue
        let attThumb = firstAttachment?.thumbnailUrl ?? (firstAttachment?.type == .image ? firstAttachment?.fileUrl : nil)
        pendingReplyReference = ReplyReference(
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
        viewModel.markProgrammaticScroll()
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            proxy.scrollTo(targetId, anchor: .center)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(.easeIn(duration: 0.15)) {
                highlightedMessageId = targetId
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                withAnimation(.easeOut(duration: 0.4)) {
                    highlightedMessageId = nil
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

                TextField("Rechercher dans la conversation...", text: $searchQuery)
                    .font(.system(size: 15))
                    .foregroundColor(theme.textPrimary)
                    .focused($isSearchFocused)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .submitLabel(.search)
                    .onSubmit { triggerBackendSearch() }
                    .onChange(of: searchQuery) { _ in debounceSearch() }

                if !searchQuery.isEmpty {
                    Button {
                        searchQuery = ""
                        viewModel.searchResults = []
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(theme.textMuted)
                    }
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
            if viewModel.searchResults.isEmpty && !viewModel.isSearching && searchQuery.count >= 2 {
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
                                        Task { await viewModel.loadMoreSearchResults(query: searchQuery) }
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

                    Text(highlightedText(result.matchedText, query: searchQuery))
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

    private func formatSearchDate(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"
            return formatter.string(from: date)
        }
        if calendar.isDateInYesterday(date) {
            return "Hier"
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM/yy"
        return formatter.string(from: date)
    }

    // MARK: - Search Actions

    func triggerBackendSearch() {
        Task { await viewModel.searchMessages(query: searchQuery) }
    }

    private var searchDebounceTask: Task<Void, Never>? {
        get { objc_getAssociatedObject(self, &searchDebounceKey) as? Task<Void, Never> }
        nonmutating set { objc_setAssociatedObject(self, &searchDebounceKey, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }

    func debounceSearch() {
        searchDebounceTask?.cancel()
        let query = searchQuery
        searchDebounceTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled, query.count >= 2 else { return }
            await viewModel.searchMessages(query: query)
        }
    }

    func jumpToSearchResult(_ result: SearchResultItem) async {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showSearch = false
        }
        isSearchFocused = false
        HapticFeedback.medium()

        await viewModel.loadMessagesAround(messageId: result.id)

        try? await Task.sleep(nanoseconds: 100_000_000)
        scrollToMessageId = result.id
    }

    func dismissSearch() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showSearch = false
            searchQuery = ""
            highlightedMessageId = nil
        }
        viewModel.searchResults = [SearchResultItem]()
        viewModel.searchHasMore = false
        viewModel.searchNextCursor = nil as String?
        isSearchFocused = false
    }

    // MARK: - Search Results Blur Overlay (extracted for type-checker)

    @ViewBuilder
    var searchResultsBlurOverlay: some View {
        if showSearch && searchQuery.count >= 2 {
            Color.black.opacity(0.001)
                .background(.ultraThinMaterial)
                .ignoresSafeArea()
                .zIndex(80)
                .transition(.opacity)

            VStack(spacing: 0) {
                Color.clear.frame(height: showOptions ? 140 : 100)
                searchResultsOverlay
            }
            .zIndex(81)
            .transition(.opacity)
        }
    }

    // MARK: - Return to Latest Button (extracted for type-checker)

    @ViewBuilder
    var returnToLatestButton: some View {
        if viewModel.isInJumpedState && !showSearch {
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
                        forwardMessage = viewModel.messages.first(where: { $0.id == messageId })
                        closeReactionBar()
                    }
                    messageActionButton(icon: "trash.fill", label: String(localized: "action.delete", defaultValue: "Supprimer"), color: "FF6B6B") {
                        deleteConfirmMessageId = messageId
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
            quickReactionMessageId = nil
        }
    }

    // MARK: - Failed Message Retry
    func failedMessageBar(for msg: Message) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 11))
                .foregroundColor(Color(hex: "FF6B6B"))

            Text("Échec de l'envoi")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(hex: "FF6B6B"))

            Text("·")
                .foregroundColor(theme.textMuted)

            Button {
                HapticFeedback.light()
                Task { await viewModel.retryMessage(messageId: msg.id) }
            } label: {
                Text("Réessayer")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(hex: accentColor))
            }

            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    viewModel.removeFailedMessage(messageId: msg.id)
                }
            } label: {
                Text("Supprimer")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.horizontal, 16)
        .padding(.top, 2)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}
