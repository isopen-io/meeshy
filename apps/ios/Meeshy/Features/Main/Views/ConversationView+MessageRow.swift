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
            FeedbackToastManager.shared.show("Message non disponible", type: .error)
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
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(theme.textMuted)

                TextField(String(localized: "conversation.view.search.placeholder", defaultValue: "Rechercher dans la conversation...", bundle: .main), text: $headerState.searchQuery)
                    .font(MeeshyFont.relative(15))
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
                        Task { await viewModel.endSearch() }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(MeeshyFont.relative(16))
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
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "conversation.view.search.close", defaultValue: "Fermer la recherche", bundle: .main))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 16), tint: Color(hex: accentColor).opacity(0.12))
        .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
        .padding(.horizontal, 8)
        .padding(.top, 4)
    }

    // MARK: - Search Results Banner (filtered-conversation mode)

    /// In filtered-conversation search the real conversation behind the bar
    /// already shows ONLY the matching bubbles (term highlighted, via the
    /// MessageStore `.search` window). We no longer blur the conversation nor
    /// list mini-cards — just a slim, non-interactive banner announcing the
    /// match count (or the empty / searching state).
    @ViewBuilder
    var searchResultsBanner: some View {
        let count = viewModel.searchResults.count
        HStack(spacing: 6) {
            Image(systemName: (count == 0 && !viewModel.isSearching) ? "magnifyingglass" : "text.magnifyingglass")
                .font(MeeshyFont.relative(12, weight: .semibold))
            Text(searchBannerLabel(count: count, searching: viewModel.isSearching))
                .font(MeeshyFont.relative(12, weight: .medium))
                .lineLimit(1)
        }
        .foregroundColor(theme.textSecondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Capsule().fill(.ultraThinMaterial))
        .shadow(color: .black.opacity(0.08), radius: 3, y: 1)
        .padding(.top, 6)
    }

    private func searchBannerLabel(count: Int, searching: Bool) -> String {
        if searching && count == 0 {
            return String(localized: "conversation.view.search.searching", defaultValue: "Recherche…", bundle: .main)
        }
        if count == 0 {
            return String(localized: "conversation.view.search.no_results", defaultValue: "Aucun résultat", bundle: .main)
        }
        let fmt = String(localized: "conversation.view.search.results_count", defaultValue: "%lld résultat(s)", bundle: .main)
        return String(format: fmt, count)
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
            guard !Task.isCancelled else { return }
            if query.count >= 2 {
                await viewModel.searchMessages(query: query)
            } else {
                // Query dropped below the threshold — exit the filter so the
                // full conversation comes back.
                await viewModel.endSearch()
            }
        }
    }

    func dismissSearch() {
        // Cancel any pending debounce so a stale `endSearch` / `searchMessages`
        // can't fire after the search UI has been dismissed.
        searchDebounceTask?.cancel()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            headerState.showSearch = false
            headerState.searchQuery = ""
            scrollState.highlightedMessageId = nil
        }
        viewModel.searchNextCursor = nil as String?
        isSearchFocused = false
        // Restore the full conversation window + clear search state.
        Task { await viewModel.endSearch() }
    }

    // MARK: - Search Results Blur Overlay (extracted for type-checker)

    @ViewBuilder
    var searchResultsBlurOverlay: some View {
        if headerState.showSearch && headerState.searchQuery.count >= 2 {
            // No full-screen blur: the conversation itself is filtered in-situ
            // (MessageStore `.search` window) and MUST stay visible. We only
            // float a slim results banner; taps fall through to the filtered
            // bubbles so the user keeps interacting with the conversation.
            VStack(spacing: 0) {
                Color.clear.frame(height: composerState.showOptions ? 140 : 100)
                searchResultsBanner
                Spacer()
            }
            .zIndex(81)
            .allowsHitTesting(false)
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
                                .font(MeeshyFont.relative(12, weight: .bold))
                            Text(String(localized: "conversation.view.recent_messages", defaultValue: "Messages récents", bundle: .main))
                                .font(MeeshyFont.relative(12, weight: .semibold))
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
                // before the sheet animates in. If the message is no longer
                // resolvable (scrolled out of the loaded window, deleted),
                // there is no safe fallback — NEVER default to
                // `messages.first` (the oldest loaded message): that would
                // silently open the sheet to react on the wrong message.
                closeReactionBar()
                guard let msg = viewModel.messageIndex(for: messageId).map({ viewModel.messages[$0] }) else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    overlayState.fullReactionPickerMessage = msg
                }
            }
        )
        .frame(maxWidth: 280)
    }

    private func quickReactionActionsRow(messageId: String) -> some View {
        HStack(spacing: 8) {
            messageActionButton(icon: "arrowshape.turn.up.left.fill", label: String(localized: "action.reply", defaultValue: "Repondre"), color: MeeshyColors.indigo300Hex) {
                if let msg = viewModel.messageIndex(for: messageId).map({ viewModel.messages[$0] }) {
                    triggerReply(for: msg)
                }
                closeReactionBar()
            }
            messageActionButton(icon: "doc.on.doc.fill", label: String(localized: "action.copy", defaultValue: "Copier"), color: MeeshyColors.trackingAccentHex) {
                if let msg = viewModel.messageIndex(for: messageId).map({ viewModel.messages[$0] }) {
                    // Prisme: copy what's actually DISPLAYED (the preferred
                    // translation when one is showing), never blindly the
                    // original — matches the long-press menu's Copier below.
                    UIPasteboard.general.string = viewModel.preferredTranslation(for: msg.id)?.translatedContent ?? msg.content
                }
                closeReactionBar()
            }
            messageActionButton(icon: "arrowshape.turn.up.forward.fill", label: String(localized: "action.forward", defaultValue: "Transferer"), color: MeeshyColors.warningHex) {
                composerState.forwardMessage = viewModel.messageIndex(for: messageId).map({ viewModel.messages[$0] })
                closeReactionBar()
            }
            messageActionButton(icon: "trash.fill", label: String(localized: "action.delete", defaultValue: "Supprimer"), color: MeeshyColors.errorHex) {
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
                // Doctrine 82i : icône + micro-label figés — bouton d'action compact
                // dans un cadre tap fixe 60×44 aligné en rangée horizontale ; les faire
                // scaler ferait déborder/casser la barre. Le bouton porte `accessibilityLabel`.
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
                    .font(MeeshyFont.relative(10, weight: .semibold))
                Text(label)
                    .font(MeeshyFont.relative(11, weight: .semibold))
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
