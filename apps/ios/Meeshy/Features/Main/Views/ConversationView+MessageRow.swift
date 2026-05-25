// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

nonisolated(unsafe) private var searchDebounceKey: UInt8 = 0

// MARK: - Message Row, Reactions & Search
extension ConversationView {


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

                TextField(String(localized: "conversation.view.search.placeholder", defaultValue: "Rechercher dans la conversation...", bundle: .main), text: $headerState.searchQuery)
                    .font(.system(size: 15))
                    .foregroundColor(theme.textPrimary)
                    .focused($isSearchFocused)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .submitLabel(.search)
                    .onSubmit { triggerBackendSearch() }
                    .adaptiveOnChange(of: headerState.searchQuery) { _, _ in debounceSearch() }

                if !headerState.searchQuery.isEmpty {
                    Button {
                        headerState.searchQuery = ""
                        viewModel.searchResults = []
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(theme.textMuted)
                    }
                    .accessibilityLabel(String(localized: "conversation.view.search.clear", defaultValue: "Effacer la recherche", bundle: .main))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
            )

            if viewModel.isSearching {
                ProgressView()
                    .tint(Color(hex: accentColor))
                    .scaleEffect(0.8)
            }

            Button {
                dismissSearch()
            } label: {
                Text(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "conversation.view.search.close", defaultValue: "Fermer la recherche", bundle: .main))
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
                    Text(String(localized: "conversation.view.search.no_results", defaultValue: "Aucun résultat", bundle: .main))
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
                context: .messageBubble,
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
                .fill(isDark ? Color.white.opacity(0.06) : Color.white.opacity(0.8))
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
                            Text(String(localized: "conversation.view.recent_messages", defaultValue: "Messages récents", bundle: .main))
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
                    .accessibilityLabel(String(localized: "conversation.view.return_to_recent", defaultValue: "Retourner aux messages recents", bundle: .main))
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
        // Shared `EmojiReactionPicker` (MeeshyUI) — the same strip the
        // long-press `MessageOverlayMenu` uses, so the two surfaces stay
        // visually identical. Capped at 280pt to hold the pill silhouette;
        // scrollable with the trailing "+" expand button. All the contextual
        // behaviour (toggle reaction, close bar, promote to the full detail
        // sheet) lives here in the call-site closures.
        EmojiReactionPicker(
            quickEmojis: emojis,
            style: isDark ? .dark : .light,
            scrollable: true,
            onReact: { emoji in
                viewModel.toggleReaction(messageId: messageId, emoji: emoji)
                EmojiUsageTracker.recordUsage(emoji: emoji)
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    overlayState.quickReactionMessageId = nil
                }
            },
            onExpandFullPicker: {
                // Same behaviour as the previous inline "+" button: close the
                // quick bar, then promote to the full detail sheet on the
                // react tab. The slight delay lets the transition complete
                // before the sheet animates in.
                let resolved = viewModel.messageIndex(for: messageId).map { viewModel.messages[$0] } ?? viewModel.messages.first
                closeReactionBar()
                guard let msg = resolved else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    overlayState.detailSheetMessage = msg
                    overlayState.detailSheetInitialTab = .react
                }
            }
        )
        .frame(maxWidth: 280)
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
        .accessibilityLabel(label)
    }

    func closeReactionBar() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            overlayState.quickReactionMessageId = nil
        }
    }

    /// Floating quick-reaction bar anchored to the bubble that opened it.
    /// The bar sits just below the tapped bubble and flips above when the
    /// message hugs the composer — see `QuickReactionBarPlacement`. The
    /// full-screen `Color.clear` backdrop dismisses the bar on tap and also
    /// blocks the list from scrolling, so the captured anchor never drifts.
    @ViewBuilder
    func quickReactionBarOverlay(for messageId: String) -> some View {
        GeometryReader { proxy in
            let container = proxy.frame(in: .global)
            let placement = QuickReactionBarPlacement.compute(
                anchor: overlayState.quickReactionAnchorFrame,
                container: container,
                barHeight: QuickReactionBarPlacement.estimatedEmojiBarHeight,
                topLimit: QuickReactionBarPlacement.headerClearance,
                composerHeight: composerHeight,
                gap: QuickReactionBarPlacement.bubbleGap
            )
            ZStack(alignment: .top) {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { closeReactionBar() }

                quickReactionBar(for: messageId)
                    .padding(.horizontal, 16)
                    .padding(.top, placement.inset)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .frame(width: container.width, height: container.height)
        }
        .ignoresSafeArea()
        .transition(.scale(scale: 0.9).combined(with: .opacity))
    }

    // MARK: - Failed Message Retry
    func failedMessageBar(for msg: Message) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 11))
                .foregroundColor(Color(hex: "FF6B6B"))
                .accessibilityHidden(true)

            Text(String(localized: "conversation.view.send_failed", defaultValue: "Échec de l'envoi", bundle: .main))
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(hex: "FF6B6B"))

            Text("·")
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            Button {
                HapticFeedback.light()
                Task { await viewModel.retryMessage(messageId: msg.id) }
            } label: {
                Text(String(localized: "conversation.view.retry", defaultValue: "Réessayer", bundle: .main))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "conversation.view.retry_send", defaultValue: "Reessayer l'envoi du message", bundle: .main))

            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    viewModel.removeFailedMessage(messageId: msg.id)
                }
            } label: {
                Text(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "conversation.view.delete_failed", defaultValue: "Supprimer le message en echec", bundle: .main))
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
        let label = count == 1
            ? String(localized: "conversation.view.reply.count.one", defaultValue: "1 reponse", bundle: .main)
            : String(localized: "conversation.view.reply.count.many", defaultValue: "\(count) reponses", bundle: .main)
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
                    .fill(accent.opacity(isDark ? 0.12 : 0.08))
                    .overlay(
                        Capsule()
                            .stroke(accent.opacity(isDark ? 0.2 : 0.12), lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(label)
        .accessibilityHint(String(localized: "conversation.view.go_to_first_reply", defaultValue: "Aller a la premiere reponse de ce message", bundle: .main))
    }
}

// MARK: - Quick Reaction Bar Placement

/// Pure geometry helper deciding where the floating quick-reaction bar sits
/// relative to the bubble that opened it. Kept free of SwiftUI/UIKit view
/// types (only `CGRect`/`CGFloat`) so it is unit-testable in isolation.
enum QuickReactionBarPlacement {
    /// Vertical gap between the bubble cell and the reaction bar. Generous on
    /// purpose so the message's own reaction stickers — which bleed a few
    /// points below the bubble — stay fully visible above the bar.
    static let bubbleGap: CGFloat = 16
    /// Rough height of the emoji-only quick-reaction bar, used to clamp the
    /// bar so it never clips past the screen's bottom edge.
    static let estimatedEmojiBarHeight: CGFloat = 56
    /// Clearance kept below the floating conversation header so the bar never
    /// tucks under the header chrome for a message near the top.
    static let headerClearance: CGFloat = 96

    struct Result: Equatable {
        /// Top padding inside the placement container — positions the bar
        /// just below the tapped bubble.
        let inset: CGFloat
    }

    /// Computes the top inset that places the floating quick-reaction bar
    /// just below the tapped bubble. The bar ALWAYS sits below the bubble;
    /// for a message pinned to the bottom it simply floats over the composer
    /// zone (the full-screen backdrop dismisses it on tap). The inset is
    /// clamped so the bar stays fully on-screen — never under the header,
    /// never clipped past the bottom edge.
    /// - Parameters:
    ///   - anchor: bubble cell frame, same coordinate space as `container`
    ///     (`nil` → bar pinned just above the composer, legacy fallback).
    ///   - container: the placement container frame.
    ///   - barHeight: estimated bar height, for the bottom-edge clamp.
    ///   - topLimit: clearance kept below the container's top edge.
    ///   - composerHeight: composer height — used only by the no-anchor fallback.
    ///   - gap: spacing between the bubble and the bar.
    static func compute(
        anchor: CGRect?,
        container: CGRect,
        barHeight: CGFloat,
        topLimit: CGFloat,
        composerHeight: CGFloat,
        gap: CGFloat
    ) -> Result {
        guard let anchor, container.height > 0 else {
            // No realised cell — fall back to just above the composer.
            let fallback = container.height - composerHeight - gap - barHeight
            return Result(inset: max(topLimit, fallback))
        }
        let belowTop = anchor.maxY + gap
        // Clamp so the bar stays fully on-screen: never under the header,
        // never clipped past the bottom edge.
        let maxTop = container.maxY - barHeight
        let clamped = min(max(belowTop, container.minY + topLimit), maxTop)
        return Result(inset: clamped - container.minY)
    }
}
