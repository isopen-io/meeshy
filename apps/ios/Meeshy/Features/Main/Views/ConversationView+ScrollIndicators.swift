// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK

// MARK: - Scroll Indicators, Typing & Attach Options
extension ConversationView {

    // MARK: - Scroll to Bottom Button

    var hasTypingIndicator: Bool {
        !typingObserver.typingUsernames.isEmpty
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
            typingUsernames: typingObserver.typingUsernames,
            lastUnreadMessageContent: viewModel.lastUnreadMessage?.content,
            unreadAttachmentTypeLabel: unreadAttachmentTypeLabel,
            unreadAttachmentThumbHash: unreadAttachment?.thumbHash,
            unreadAttachmentThumbnailUrl: unreadAttachment?.thumbnailUrl,
            unreadAttachmentFullUrl: unreadAttachment?.type == .image ? unreadAttachment?.fileUrl : nil,
            unreadAttachmentIsAudio: unreadAttachment?.type == .audio,
            unreadAttachmentDetail: unreadAttachmentDetail,
            unreadAttachmentSymbol: unreadAttachmentSymbol,
            isAudioPlaying: scrollButtonAudioPlayer.isPlaying,
            isOffline: isOffline,
            isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
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
        let action = String(localized: "conversation.scroll-to-bottom.a11y",
                            defaultValue: "Défiler vers le bas", bundle: .main)
        if scrollState.unreadBadgeCount > 0 {
            let unread = String(format: String(localized: "conversation.scroll-to-bottom.a11y-unread",
                                defaultValue: "%d messages non lus", bundle: .main),
                                scrollState.unreadBadgeCount)
            return "\(unread), \(action)"
        }
        if hasTypingIndicator {
            return "\(typingLabel), \(action)"
        }
        return action
    }

    var unreadAttachmentTypeLabel: String? {
        guard let att = unreadAttachment else { return nil }
        switch att.type {
        case .image: return String(localized: "attachment.label.photo", defaultValue: "Photo", bundle: .main)
        case .video: return String(localized: "attachment.label.video", defaultValue: "Video", bundle: .main)
        case .audio: return String(localized: "attachment.label.audio", defaultValue: "Audio", bundle: .main)
        case .file: return String(localized: "attachment.label.file", defaultValue: "File", bundle: .main)
        case .location: return String(localized: "attachment.label.location", defaultValue: "Location", bundle: .main)
        }
    }

    /// SF Symbol describing the last unread attachment's type — drives the
    /// type glyph in the scroll-to-bottom button when no thumbnail exists.
    var unreadAttachmentSymbol: String? {
        guard let att = unreadAttachment else { return nil }
        switch att.type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "mappin.circle.fill"
        }
    }

    /// Formatted media detail of the last unread attachment shown after its
    /// type label: dimensions for image/video, duration for audio/video, and
    /// file size when known. Returns `nil` when nothing meaningful is known
    /// (e.g. fileSize 0 and no duration), matching the size-display convention.
    var unreadAttachmentDetail: String? {
        guard let att = unreadAttachment else { return nil }
        var parts: [String] = []
        switch att.type {
        case .image, .video:
            if let w = att.width, let h = att.height, w > 0, h > 0 {
                parts.append("\(w)×\(h)")
            }
        default:
            break
        }
        if att.type == .audio || att.type == .video, let duration = att.durationFormatted {
            parts.append(duration)
        }
        if att.fileSize > 0 {
            parts.append(att.fileSizeFormatted)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var typingLabel: String {
        let names = typingObserver.typingUsernames
        switch names.count {
        case 1: return String(format: String(localized: "typing.named", bundle: .main), names[0])
        case 2: return String(format: String(localized: "typing.double", bundle: .main), names[0], names[1])
        default: return String(localized: "typing.several", bundle: .main)
        }
    }

    // L'indicateur de frappe en fin de conversation n'est plus un overlay :
    // c'est une vraie cellule du flux, gérée par `MessageListViewController`
    // (`MessageListItem.typingIndicator` + `TypingIndicatorBubble`).
}
