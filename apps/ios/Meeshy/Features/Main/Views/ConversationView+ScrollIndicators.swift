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
        unreadBadgeCount > 0 || hasTypingIndicator
    }

    var scrollToBottomButton: some View {
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
        .accessibilityLabel(scrollToBottomAccessibilityLabel)
    }

    private var scrollToBottomAccessibilityLabel: String {
        if unreadBadgeCount > 0 {
            return "\(unreadBadgeCount) messages non lus, defiler vers le bas"
        }
        if hasTypingIndicator {
            return "\(typingLabel), defiler vers le bas"
        }
        return "Defiler vers le bas"
    }

    var unreadPreviewContent: some View {
        HStack(spacing: 10) {
            if unreadBadgeCount > 1 {
                // Multiple messages: prominent count display
                multipleUnreadContent
            } else {
                // Single unread or typing only: rich preview
                singleUnreadContent
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: 240)
    }

    var multipleUnreadContent: some View {
        Group {
            // Typing indicator takes priority even with multiple unreads
            if hasTypingIndicator {
                HStack(spacing: 4) {
                    typingDotsView
                    Text(typingLabel)
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(1)
                }
            } else {
                HStack(spacing: 6) {
                    Text("\(unreadBadgeCount)")
                        .font(.system(size: 16, weight: .heavy))
                    Text("messages")
                        .font(.system(size: 12, weight: .medium))
                }
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.down")
                .font(.system(size: 11, weight: .bold))
        }
    }

    var singleUnreadContent: some View {
        Group {
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

            // Right: chevron + unread count badge
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
    }

    @ViewBuilder
    func unreadAttachmentPreview(_ attachment: MessageAttachment) -> some View {
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
            // Independently tappable play button (downloads + plays audio without scrolling)
            Image(systemName: scrollButtonAudioPlayer.isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 14, weight: .bold))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.white.opacity(scrollButtonAudioPlayer.isPlaying ? 0.4 : 0.25)))
                .contentShape(Circle())
                .highPriorityGesture(
                    TapGesture().onEnded {
                        HapticFeedback.light()
                        if scrollButtonAudioPlayer.isPlaying {
                            scrollButtonAudioPlayer.stop()
                        } else {
                            scrollButtonAudioPlayer.play(urlString: attachment.fileUrl)
                        }
                    }
                )
        default:
            EmptyView()
        }
    }

    var unreadAttachmentTypeLabel: String {
        guard let att = unreadAttachment else { return "" }
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
        case 1: return "\(names[0]) ecrit..."
        case 2: return "\(names[0]) et \(names[1])..."
        default: return "\(names.count) personnes..."
        }
    }

    var typingDotsView: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color.white)
                    .frame(width: 5, height: 5)
                    .offset(y: typingDotPhase == i ? -3 : 0)
                    .animation(
                        .spring(response: 0.3, dampingFraction: 0.5)
                            .delay(Double(i) * 0.1),
                        value: typingDotPhase
                    )
            }
        }
        .onReceive(typingDotTimer) { _ in
            typingDotPhase = (typingDotPhase + 1) % 3
        }
    }

    // MARK: - Inline Typing Indicator (shown after last message)

    var inlineTypingIndicator: some View {
        let isDark = theme.mode.isDark
        let accent = Color(hex: accentColor)

        return HStack(spacing: 8) {
            // Animated dots bubble (wave bounce)
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(accent.opacity(inlineTypingDotPhase == i ? 1.0 : 0.35))
                        .frame(width: 6, height: 6)
                        .offset(y: inlineTypingDotPhase == i ? -4 : 0)
                        .animation(
                            .spring(response: 0.3, dampingFraction: 0.5)
                                .delay(Double(i) * 0.1),
                            value: inlineTypingDotPhase
                        )
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                Capsule()
                    .fill(isDark ? accent.opacity(0.1) : accent.opacity(0.06))
                    .overlay(
                        Capsule()
                            .stroke(accent.opacity(isDark ? 0.2 : 0.12), lineWidth: 0.5)
                    )
            )
            .onReceive(typingDotTimer) { _ in
                inlineTypingDotPhase = (inlineTypingDotPhase + 1) % 3
            }

            // Typing label
            Text(typingLabel)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(isDark ? accent.opacity(0.7) : accent.opacity(0.6))

            Spacer()
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(typingLabel)
    }
}
