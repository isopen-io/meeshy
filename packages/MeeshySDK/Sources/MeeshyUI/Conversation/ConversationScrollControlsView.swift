import SwiftUI

public struct ConversationScrollControlsView: View {
    public var unreadCount: Int
    public var typingUsernames: [String]
    public var lastUnreadMessageContent: String?
    public var unreadAttachmentTypeLabel: String?
    public var unreadAttachmentThumbHash: String?
    public var unreadAttachmentThumbnailUrl: String?
    public var unreadAttachmentFullUrl: String?
    public var unreadAttachmentIsAudio: Bool
    public var isAudioPlaying: Bool
    public var isOffline: Bool
    public var isSearchingQuotedMessage: Bool
    public var typingDotPhase: Int
    public var accentColor: String
    public var secondaryColor: String
    
    public var onScrollToBottom: () -> Void
    public var onPlayAudio: () -> Void
    
    public init(
        unreadCount: Int,
        typingUsernames: [String],
        lastUnreadMessageContent: String?,
        unreadAttachmentTypeLabel: String?,
        unreadAttachmentThumbHash: String?,
        unreadAttachmentThumbnailUrl: String?,
        unreadAttachmentFullUrl: String?,
        unreadAttachmentIsAudio: Bool,
        isAudioPlaying: Bool,
        isOffline: Bool,
        isSearchingQuotedMessage: Bool = false,
        typingDotPhase: Int,
        accentColor: String,
        secondaryColor: String,
        onScrollToBottom: @escaping () -> Void,
        onPlayAudio: @escaping () -> Void
    ) {
        self.unreadCount = unreadCount
        self.typingUsernames = typingUsernames
        self.lastUnreadMessageContent = lastUnreadMessageContent
        self.unreadAttachmentTypeLabel = unreadAttachmentTypeLabel
        self.unreadAttachmentThumbHash = unreadAttachmentThumbHash
        self.unreadAttachmentThumbnailUrl = unreadAttachmentThumbnailUrl
        self.unreadAttachmentFullUrl = unreadAttachmentFullUrl
        self.unreadAttachmentIsAudio = unreadAttachmentIsAudio
        self.isAudioPlaying = isAudioPlaying
        self.isOffline = isOffline
        self.isSearchingQuotedMessage = isSearchingQuotedMessage
        self.typingDotPhase = typingDotPhase
        self.accentColor = accentColor
        self.secondaryColor = secondaryColor
        self.onScrollToBottom = onScrollToBottom
        self.onPlayAudio = onPlayAudio
    }
    
    private var hasTypingIndicator: Bool {
        !typingUsernames.isEmpty
    }
    
    private var hasUnreadContent: Bool {
        unreadCount > 0 || hasTypingIndicator
    }
    
    private var typingLabel: String {
        switch typingUsernames.count {
        case 0: return ""
        case 1: return "\(typingUsernames[0]) écrit"
        case 2: return "\(typingUsernames[0]) et \(typingUsernames[1]) écrivent"
        default: return "\(typingUsernames.count) personnes écrivent"
        }
    }
    
    @State private var searchPulse: Bool = false

    public var body: some View {
        Button {
            onScrollToBottom()
        } label: {
            Group {
                if isSearchingQuotedMessage {
                    // Pulsing search indicator while loading quoted message
                    quotedMessageSearchContent
                } else if hasUnreadContent {
                    // Rich button with preview
                    unreadPreviewContent
                } else if isOffline {
                    // Offline indicator when no unread/typing
                    HStack(spacing: 8) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 13, weight: .bold))
                        Text("Hors ligne")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                } else {
                    // Simple chevron-only pill
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .padding(12)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: (hasUnreadContent || isOffline || isSearchingQuotedMessage) ? 16 : 20)
                    .fill(
                        LinearGradient(
                            colors: [
                                isOffline ? MeeshyColors.neutral400 : Color(hex: accentColor).opacity(0.95),
                                isOffline ? MeeshyColors.neutral500 : Color(hex: secondaryColor).opacity(0.9)
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: isOffline ? MeeshyColors.neutral400.opacity(0.4) : Color(hex: accentColor).opacity(0.4), radius: 8, y: 4)
            )
        }
        .allowsHitTesting(!isSearchingQuotedMessage)
    }

    // MARK: - Quoted Message Search Indicator

    private var quotedMessageSearchContent: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .bold))
                .scaleEffect(searchPulse ? 1.15 : 0.85)
                .opacity(searchPulse ? 1.0 : 0.6)

            Text("Recherche…")
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)

            Spacer(minLength: 0)

            // Animated dots to show activity
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(Color.white.opacity(searchPulse ? 1.0 : 0.4))
                        .frame(width: 4, height: 4)
                        .scaleEffect(searchPulse ? 1.2 : 0.7)
                        .animation(
                            .easeInOut(duration: 0.6)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.15),
                            value: searchPulse
                        )
                }
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: 180)
        .onAppear { searchPulse = true }
        .onDisappear { searchPulse = false }
        .animation(
            .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
            value: searchPulse
        )
    }
    
    private var unreadPreviewContent: some View {
        HStack(spacing: 10) {
            if unreadCount > 1 {
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
    
    private var multipleUnreadContent: some View {
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
                    Text("\(unreadCount)")
                        .font(.system(size: 16, weight: .heavy))
                    Text("messages")
                        .font(.system(size: 12, weight: .medium))
                }
            }

            Spacer(minLength: 0)
            
            if isOffline {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 11, weight: .bold))
            } else {
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
            }
        }
    }
    
    private var singleUnreadContent: some View {
        Group {
            // Left: rich preview (image thumbnail or audio play)
            if unreadAttachmentThumbHash != nil || unreadAttachmentThumbnailUrl != nil || unreadAttachmentFullUrl != nil || unreadAttachmentIsAudio {
                unreadAttachmentPreview
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
                if let content = lastUnreadMessageContent, !content.isEmpty {
                    Text(content)
                        .font(.system(size: 12, weight: .regular))
                        .lineLimit(1)
                } else if unreadAttachmentTypeLabel != nil, !hasTypingIndicator {
                    Text(unreadAttachmentTypeLabel ?? "")
                        .font(.system(size: 12, weight: .regular))
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            // Right: chevron + unread count badge
            VStack(spacing: 2) {
                if unreadCount > 0 {
                    Text("\(unreadCount)")
                        .font(.system(size: 10, weight: .heavy))
                        .frame(width: 20, height: 20)
                        .background(Circle().fill(Color.white.opacity(0.3)))
                }
                
                if isOffline {
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 11, weight: .bold))
                } else {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .bold))
                }
            }
        }
    }
    
    @ViewBuilder
    private var unreadAttachmentPreview: some View {
        if unreadAttachmentIsAudio {
            Image(systemName: isAudioPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 14, weight: .bold))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.white.opacity(isAudioPlaying ? 0.4 : 0.25)))
                .contentShape(Circle())
                .highPriorityGesture(
                    TapGesture().onEnded {
                        onPlayAudio()
                    }
                )
        } else if unreadAttachmentThumbHash != nil || unreadAttachmentThumbnailUrl != nil || unreadAttachmentFullUrl != nil {
            ProgressiveCachedImage(
                thumbHash: unreadAttachmentThumbHash,
                thumbnailUrl: unreadAttachmentThumbnailUrl,
                fullUrl: unreadAttachmentFullUrl ?? unreadAttachmentThumbnailUrl
            ) {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.white.opacity(0.2))
                    .frame(width: 36, height: 36)
                    .overlay(
                        Image(systemName: unreadAttachmentTypeLabel == "Video" ? "video.fill" : "photo.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.6))
                    )
            }
            .aspectRatio(contentMode: .fill)
            .frame(width: 36, height: 36)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            EmptyView()
        }
    }
    
    private var typingDotsView: some View {
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
    }
}
