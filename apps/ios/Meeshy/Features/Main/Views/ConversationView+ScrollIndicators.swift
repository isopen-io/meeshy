// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK

// MARK: - Scroll Indicators, Typing & Attach Options
extension ConversationView {

    // MARK: - Scroll to Bottom Button

    var hasTypingIndicator: Bool {
        !viewModel.typingUsernames.isEmpty
    }

    /// Unread message attachment (for rich preview in button)
    var unreadAttachment: MessageAttachment? {
        viewModel.lastUnreadMessage?.attachments.first
    }

    /// True when there are unread messages to show in the button
    var hasUnreadContent: Bool {
        scrollState.unreadBadgeCount > 0 || hasTypingIndicator
    }

    var isOffline: Bool {
        // You can link this to the actual offline state (e.g. from viewModel or presenceManager)
        return false // Defaults to false if not connected to a reachability manager here
    }

    var scrollToBottomButton: some View {
        ConversationScrollControlsView(
            unreadCount: scrollState.unreadBadgeCount,
            typingUsernames: viewModel.typingUsernames,
            lastUnreadMessageContent: viewModel.lastUnreadMessage?.content,
            unreadAttachmentTypeLabel: unreadAttachmentTypeLabel,
            unreadAttachmentThumbHash: unreadAttachment?.thumbHash,
            unreadAttachmentThumbnailUrl: unreadAttachment?.thumbnailUrl,
            unreadAttachmentFullUrl: unreadAttachment?.type == .image ? unreadAttachment?.fileUrl : nil,
            unreadAttachmentIsAudio: unreadAttachment?.type == .audio,
            isAudioPlaying: scrollButtonAudioPlayer.isPlaying,
            isOffline: isOffline,
            typingDotPhase: headerState.typingDotPhase,
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            onScrollToBottom: {
                HapticFeedback.light()
                scrollState.scrollToBottomTrigger += 1
                scrollState.unreadBadgeCount = 0
                viewModel.lastUnreadMessage = nil
            },
            onPlayAudio: {
                HapticFeedback.light()
                if scrollButtonAudioPlayer.isPlaying {
                    scrollButtonAudioPlayer.stop()
                } else if let fileUrl = unreadAttachment?.fileUrl {
                    scrollButtonAudioPlayer.play(urlString: fileUrl)
                }
            }
        )
        .accessibilityLabel(scrollToBottomAccessibilityLabel)
    }

    private var scrollToBottomAccessibilityLabel: String {
        if scrollState.unreadBadgeCount > 0 {
            return "\(scrollState.unreadBadgeCount) messages non lus, defiler vers le bas"
        }
        if hasTypingIndicator {
            return "\(typingLabel), defiler vers le bas"
        }
        return "Defiler vers le bas"
    }

    var unreadAttachmentTypeLabel: String? {
        guard let att = unreadAttachment else { return nil }
        switch att.type {
        case .image: return "Photo"
        case .video: return "Video"
        case .audio: return "Audio"
        case .file: return "Fichier"
        case .location: return "Position"
        }
    }

    var typingLabel: String {
        let names = viewModel.typingUsernames
        switch names.count {
        case 1: return "\(names[0]) écrit"
        case 2: return "\(names[0]) et \(names[1]) écrivent"
        default: return "\(names.count) personnes écrivent"
        }
    }

    // MARK: - Inline Typing Indicator (shown after last message)

    var inlineTypingIndicator: some View {
        let accent = Color(hex: accentColor)

        return HStack(spacing: 6) {
            // Author name + "écrit"
            Text(typingLabel)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(isDark ? accent.opacity(0.7) : accent.opacity(0.6))

            // Animated dots (inline, after text)
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(accent.opacity(headerState.inlineTypingDotPhase == i ? 1.0 : 0.35))
                        .frame(width: 5, height: 5)
                        .offset(y: headerState.inlineTypingDotPhase == i ? -3 : 0)
                        .animation(
                            .spring(response: 0.3, dampingFraction: 0.5)
                                .delay(Double(i) * 0.1),
                            value: headerState.inlineTypingDotPhase
                        )
                }
            }
            .onReceive(typingDotPublisher) { _ in
                guard !viewModel.typingUsernames.isEmpty else { return }
                headerState.inlineTypingDotPhase = (headerState.inlineTypingDotPhase + 1) % 3
            }

            Spacer()
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(typingLabel)
    }
}
