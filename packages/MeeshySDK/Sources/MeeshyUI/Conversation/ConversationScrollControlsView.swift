import SwiftUI
import Combine

public struct ConversationScrollControlsView: View {
    public var unreadCount: Int
    public var typingUsernames: [String]
    public var lastUnreadMessageContent: String?
    public var unreadAttachmentTypeLabel: String?
    public var unreadAttachmentThumbHash: String?
    public var unreadAttachmentThumbnailUrl: String?
    public var unreadAttachmentFullUrl: String?
    public var unreadAttachmentIsAudio: Bool
    /// Pre-formatted media detail of the last unread attachment, e.g.
    /// "0:34 · 410 KB" (audio), "1280×720 · 2.3 MB" (image/video). Built
    /// app-side so the SDK component stays agnostic of byte/duration
    /// formatting. `nil` when no detail is available.
    public var unreadAttachmentDetail: String?
    /// SF Symbol name for the last unread attachment's type (waveform, photo,
    /// video, doc, mappin…). Lets the preview show a type glyph when there is
    /// no thumbnail to render. `nil` for plain-text messages.
    public var unreadAttachmentSymbol: String?
    public var isAudioPlaying: Bool
    public var isOffline: Bool
    public var isSearchingQuotedMessage: Bool
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
        unreadAttachmentDetail: String? = nil,
        unreadAttachmentSymbol: String? = nil,
        isAudioPlaying: Bool,
        isOffline: Bool,
        isSearchingQuotedMessage: Bool = false,
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
        self.unreadAttachmentDetail = unreadAttachmentDetail
        self.unreadAttachmentSymbol = unreadAttachmentSymbol
        self.isAudioPlaying = isAudioPlaying
        self.isOffline = isOffline
        self.isSearchingQuotedMessage = isSearchingQuotedMessage
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
        Self.typingLabel(for: typingUsernames)
    }

    /// Libellé de frappe du bouton de retour au bas : auteur(s) seul(s),
    /// SANS suffixe « écrit »/« écrivent » — l'animation de points indique
    /// déjà la frappe. Les noms sont dédupliqués (en préservant l'ordre) pour
    /// qu'un même auteur n'apparaisse jamais deux fois, et la liste est
    /// compactée pour tenir dans la largeur réduite du composant.
    public nonisolated static func typingLabel(for usernames: [String]) -> String {
        var seen = Set<String>()
        let unique = usernames.filter { seen.insert($0).inserted }
        switch unique.count {
        case 0: return ""
        case 1: return unique[0]
        case 2: return "\(unique[0]), \(unique[1])"
        default: return "\(unique[0]) +\(unique.count - 1)"
        }
    }
    
    @State private var searchPulse: Bool = false
    /// Phase d'animation des points "typing" (0 -> 1 -> 2), possedee par la vue.
    /// L'indicateur n'a de sens qu'ici : son timer 0.5s vit dans la feuille qui
    /// l'affiche, au lieu de remonter dans ConversationView (qui re-evaluait
    /// alors tout l'ecran 2x/s pendant la frappe). Pattern WWDC "isoler l'etat
    /// d'animation dans la sous-vue" ; le garde sur hasTypingIndicator evite tout
    /// tick utile quand personne ne tape.
    @State private var typingDotPhase: Int = 0
    private let typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

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
            // Liquid Glass iOS 26 (fallback material teinté < 26). Teinte accent
            // FORTE pour préserver le contraste du contenu blanc (badge non-lus,
            // aperçu pièce jointe) — toutes les infos restent visibles.
            .adaptiveGlass(
                in: RoundedRectangle(cornerRadius: (hasUnreadContent || isOffline || isSearchingQuotedMessage) ? 16 : 20, style: .continuous),
                tint: isOffline ? MeeshyColors.neutral500.opacity(0.9) : Color(hex: accentColor).opacity(0.85)
            )
        }
        .allowsHitTesting(!isSearchingQuotedMessage)
        .onReceive(typingDotTimer) { _ in
            guard hasTypingIndicator else { return }
            typingDotPhase = (typingDotPhase + 1) % 3
        }
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
    
    /// Whether the last unread message carries a renderable attachment preview
    /// (audio control, image/video thumbnail, or a type glyph).
    private var hasAttachmentPreview: Bool {
        unreadAttachmentIsAudio
            || unreadAttachmentThumbHash != nil
            || unreadAttachmentThumbnailUrl != nil
            || unreadAttachmentFullUrl != nil
            || unreadAttachmentSymbol != nil
    }

    /// Whether the rich attachment preview should appear on the scroll-to-bottom
    /// pill. Gated on `unreadCount > 0` exactly like the text preview line: the
    /// attachment inputs come from `lastUnreadMessage`, which is only cleared on
    /// an explicit tap — so once the conversation is read (count 0) a mere typing
    /// indicator would otherwise keep surfacing the already-read last message's
    /// attachment preview (stale, inaccurate).
    nonisolated static func shouldShowAttachmentPreview(unreadCount: Int, hasAttachmentPreview: Bool) -> Bool {
        unreadCount > 0 && hasAttachmentPreview
    }

    /// Unified rich preview used for BOTH single and multiple unreads. Shows
    /// the count headline when more than one message is pending, followed by a
    /// preview of the LAST received message — its text, or for media its type
    /// label plus formatted detail (size / duration). Mirrors the product
    /// requirement: "le nombre de messages ET à la suite le dernier message".
    private var unreadPreviewContent: some View {
        HStack(spacing: 10) {
            // Left: rich attachment preview (audio play / image|video thumbnail
            // / type glyph) of the last unread message.
            if Self.shouldShowAttachmentPreview(unreadCount: unreadCount, hasAttachmentPreview: hasAttachmentPreview) {
                unreadAttachmentPreview
            }

            VStack(alignment: .leading, spacing: 2) {
                // Typing indicator (top priority — someone is composing now).
                if hasTypingIndicator {
                    HStack(spacing: 4) {
                        typingDotsView
                        Text(typingLabel)
                            .font(.system(size: 11, weight: .semibold))
                            .lineLimit(1)
                    }
                }

                // Count headline — only when more than one message is pending.
                if unreadCount > 1 {
                    Text("\(unreadCount) messages")
                        .font(.system(size: 13, weight: .heavy))
                        .lineLimit(1)
                }

                // Last received message preview (skipped when only typing).
                if unreadCount > 0 {
                    lastMessageLine
                }
            }

            Spacer(minLength: 0)

            // Right: chevron / offline glyph.
            if isOffline {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 11, weight: .bold))
            } else {
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: 260)
    }

    /// Single-line preview of the last received message: its text when present,
    /// otherwise the attachment type label with its formatted media detail
    /// (e.g. "Audio · 0:34 · 410 KB", "Photo · 1280×720 · 2.3 MB").
    @ViewBuilder
    private var lastMessageLine: some View {
        if let content = lastUnreadMessageContent, !content.isEmpty {
            Text(content)
                .font(.system(size: 12, weight: .regular))
                .lineLimit(1)
                .opacity(0.95)
        } else if let label = unreadAttachmentTypeLabel {
            HStack(spacing: 4) {
                if let symbol = unreadAttachmentSymbol {
                    Image(systemName: symbol)
                        .font(.system(size: 10, weight: .semibold))
                }
                Text(attachmentSummary(label: label))
                    .font(.system(size: 12, weight: .regular))
                    .lineLimit(1)
                    .opacity(0.95)
            }
        }
    }

    /// Joins the attachment type label with its formatted detail when present.
    private func attachmentSummary(label: String) -> String {
        guard let detail = unreadAttachmentDetail, !detail.isEmpty else { return label }
        return "\(label) · \(detail)"
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
        } else if let symbol = unreadAttachmentSymbol {
            // Media without a thumbnail (file, location, thumbnail-less video):
            // render the type glyph so the preview still reads as media.
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.2)))
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
