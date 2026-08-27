// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Scroll Indicators, Typing & Attach Options
extension ConversationView {

    // MARK: - Scroll to Bottom Button

    var hasTypingIndicator: Bool {
        !typingObserver.typingParticipants.isEmpty
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
            typingParticipants: typingObserver.typingParticipants,
            lastUnreadMessageContent: viewModel.lastUnreadMessage?.content,
            // Nom devant l'aperçu — utile en groupe (qui a écrit ?), muet en
            // DM (l'unique interlocuteur n'a pas besoin d'être nommé) (#3921).
            lastUnreadMessageSenderName: isDirect ? nil : viewModel.lastUnreadMessage?.senderName,
            unreadAttachmentTypeLabel: unreadAttachmentTypeLabel,
            unreadAttachmentThumbHash: unreadAttachment?.thumbHash,
            unreadAttachmentThumbnailUrl: unreadAttachment?.thumbnailUrl,
            unreadAttachmentFullUrl: unreadAttachment?.type == .image ? unreadAttachment?.fileUrl : nil,
            unreadAttachmentIsAudio: unreadAttachment?.type == .audio,
            unreadAttachmentDetail: unreadAttachmentDetail,
            unreadAttachmentSymbol: unreadAttachmentSymbol,
            isAudioPlaying: scrollButtonAudioIsPlaying,
            isOffline: isOffline,
            isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            unreadCallSymbol: unreadCallSymbol,
            unreadCallTint: unreadCallTint,
            onScrollToBottom: {
                HapticFeedback.light()
                scrollState.scrollToBottomTrigger += 1
                // Demander le bas, c'est déclarer le regarder : l'accusé part
                // avec le défilement, pas une seconde après.
                scrollState.flushSeenTrigger += 1
                scrollState.unreadBadgeCount = 0
                viewModel.lastUnreadMessage = nil
            },
            onPlayAudio: {
                HapticFeedback.light()
                guard let att = unreadAttachment, att.type == .audio else { return }
                let coordinator = ConversationAudioCoordinator.sharedForTesting
                if coordinator.isActive(attachmentId: att.id) {
                    coordinator.togglePlayPause()
                } else {
                    viewModel.playAudio(attachmentId: att.id)
                }
            }
        )
        .accessibilityLabel(scrollToBottomAccessibilityLabel)
        .onReceive(scrollButtonAudioStatePublisher) { context, playing in
            updateScrollButtonAudioIsPlaying(context: context, playing: playing)
        }
        .adaptiveOnChange(of: unreadAttachment?.id) { _, _ in
            let coordinator = ConversationAudioCoordinator.sharedForTesting
            updateScrollButtonAudioIsPlaying(context: coordinator.activeContext, playing: coordinator.isPlaying)
        }
    }

    func updateScrollButtonAudioIsPlaying(context: ActiveAudioContext?, playing: Bool) {
        let id = unreadAttachment?.id
        let newValue = playing && id != nil && context?.attachmentId == id
        if scrollButtonAudioIsPlaying != newValue { scrollButtonAudioIsPlaying = newValue }
    }

    private var scrollToBottomAccessibilityLabel: String {
        let action = String(localized: "conversation.scroll-to-bottom.a11y",
                            defaultValue: "Défiler vers le bas", bundle: .main)
        if scrollState.unreadBadgeCount > 0 {
            // `UnreadCountLabel` et non une clé propre à ce bouton : la clé
            // `conversation.scroll-to-bottom.a11y-unread` était, dans les 7
            // locales, le doublon mot pour mot de la forme `other` de
            // `accessibility.unread_count` — mais à plat, donc « 1 messages
            // non lus » au singulier.
            let unread = UnreadCountLabel.messages(scrollState.unreadBadgeCount)
            return "\(unread), \(action)"
        }
        if hasTypingIndicator {
            return "\(typingLabel), \(action)"
        }
        return action
    }

    var unreadAttachmentTypeLabel: String? {
        guard let att = unreadAttachment else { return nil }
        return MediaKindLabel.name(MediaKindLabel.kind(for: att.type))
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

    /// SF Symbol + hex tint for the last unread message when it's a call
    /// notice (`CallSummaryMetadata`, no `MessageAttachment` involved — a
    /// call system message never has one). Reads `isLive` BEFORE `outcome`
    /// (a live message's outcome is a neutral placeholder), mirroring the
    /// SSOT `CallNoticePresentation.isLive`/`.tint`
    /// (`Bubble/BubbleCallNoticeView.swift:265-274`) WITHOUT re-decoding
    /// `message.metadata` — `callSummary` is already decoded on the model.
    ///
    /// Tint diverges from `CallNoticePresentation.tint` on two states, both
    /// deliberate: live returns `nil` (the whole pill is already accent-tinted
    /// via `.adaptiveGlass(tint:)`; an accent glyph on accent glass would be
    /// invisible — the glyph falls back to `contentColor`'s WCAG black/white
    /// choice instead), and `.completed` returns `nil`/`nil` (a finished call
    /// isn't a pending action worth flagging on the scroll button). A
    /// "cancelled" call (`.missed` + `isCancelled(viewerIsInitiator:)`) stays
    /// on the same error hex as a plain "missed" call — same visual family,
    /// no dedicated branch needed.
    static func unreadCallIndicator(for summary: CallSummaryMetadata?) -> (symbol: String?, tint: String?) {
        guard let summary else { return (nil, nil) }
        let glyph = summary.callType == .video ? "video.fill" : "phone.fill"
        if summary.isLive {
            return (glyph, nil)
        }
        switch summary.outcome {
        case .missed, .rejected:
            return (glyph, MeeshyColors.errorHex)
        case .failed:
            return (glyph, MeeshyColors.warningHex)
        case .completed:
            return (nil, nil)
        }
    }

    /// SF Symbol half of `unreadCallIndicator` for the scroll-to-bottom button.
    var unreadCallSymbol: String? {
        Self.unreadCallIndicator(for: viewModel.lastUnreadMessage?.callSummary).symbol
    }

    /// Hex tint half of `unreadCallIndicator` for the scroll-to-bottom button.
    var unreadCallTint: String? {
        Self.unreadCallIndicator(for: viewModel.lastUnreadMessage?.callSummary).tint
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
        let names = typingObserver.typingParticipants.displayNames
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
