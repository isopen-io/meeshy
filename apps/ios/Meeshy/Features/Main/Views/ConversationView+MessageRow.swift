// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK

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

    var searchOverlay: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textMuted)

                    TextField("Rechercher...", text: $searchQuery)
                        .font(.system(size: 15))
                        .foregroundColor(theme.textPrimary)
                        .focused($isSearchFocused)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.search)
                        .onSubmit { performSearch() }
                        .onChange(of: searchQuery) { _ in performSearch() }

                    if !searchQuery.isEmpty {
                        Button {
                            searchQuery = ""
                            searchResultIds = []
                            searchCurrentIndex = 0
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

                if !searchResultIds.isEmpty {
                    HStack(spacing: 4) {
                        Text("\(searchCurrentIndex + 1)/\(searchResultIds.count)")
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundColor(theme.textSecondary)

                        Button {
                            navigateSearch(direction: -1)
                        } label: {
                            Image(systemName: "chevron.up")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(Color(hex: accentColor))
                                .frame(width: 28, height: 28)
                                .background(Circle().fill(Color(hex: accentColor).opacity(0.12)))
                        }

                        Button {
                            navigateSearch(direction: 1)
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(Color(hex: accentColor))
                                .frame(width: 28, height: 28)
                                .background(Circle().fill(Color(hex: accentColor).opacity(0.12)))
                        }
                    }
                }

                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showSearch = false
                        searchQuery = ""
                        searchResultIds = []
                        searchCurrentIndex = 0
                        highlightedMessageId = nil
                    }
                    isSearchFocused = false
                } label: {
                    Text("Fermer")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(hex: accentColor))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
            )

            Spacer()
        }
    }

    func performSearch() {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard query.count >= 2 else {
            searchResultIds = []
            searchCurrentIndex = 0
            highlightedMessageId = nil
            return
        }
        searchResultIds = viewModel.messages
            .filter { !$0.isDeleted && $0.content.lowercased().contains(query) }
            .map(\.id)
        searchCurrentIndex = searchResultIds.isEmpty ? 0 : searchResultIds.count - 1
        if let targetId = searchResultIds.last {
            scrollToMessageId = targetId
        }
    }

    func navigateSearch(direction: Int) {
        guard !searchResultIds.isEmpty else { return }
        searchCurrentIndex = (searchCurrentIndex + direction + searchResultIds.count) % searchResultIds.count
        let targetId = searchResultIds[searchCurrentIndex]
        scrollToMessageId = targetId
        HapticFeedback.light()
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
