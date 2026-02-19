import SwiftUI
import MeeshySDK

struct StatusBubbleOverlay: View {
    let status: StatusEntry
    let anchorPoint: CGPoint
    @Binding var isPresented: Bool
    var onReply: (() -> Void)? = nil
    var onShare: (() -> Void)? = nil
    var onReaction: ((String) -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var audioPlayer = AudioPlayerManager()
    @State private var translatedText: String?
    @State private var isTranslating = false
    @State private var appearAnimation = false
    @State private var reactedEmoji: String?

    private let quickEmojis = ["❤️", "😂", "🔥", "😮", "😢", "👏"]

    private var screenHeight: CGFloat { UIScreen.main.bounds.height }
    private var screenWidth: CGFloat { UIScreen.main.bounds.width }
    private var showAbove: Bool { anchorPoint.y > screenHeight * 0.45 }

    var body: some View {
        GeometryReader { parentGeo in
            let parentOrigin = parentGeo.frame(in: .global).origin
            let anchor = CGPoint(
                x: anchorPoint.x - parentOrigin.x,
                y: anchorPoint.y - parentOrigin.y
            )
            let bounds = parentGeo.size
            let bubbleW: CGFloat = min(screenWidth - 32, 280)
            let bubbleX = min(max(anchor.x, bubbleW / 2 + 16), bounds.width - bubbleW / 2 - 16)
            let dir: CGFloat = showAbove ? -1 : 1
            let dx = bubbleX - anchor.x

            ZStack {
                // Tap-to-dismiss
                Color.black.opacity(appearAnimation ? 0.06 : 0)
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }
                    .allowsHitTesting(appearAnimation)

                // Thought trail circles
                thoughtCircle(size: 4)
                    .position(x: anchor.x + dx * 0.08, y: anchor.y + dir * 7)
                    .opacity(appearAnimation ? 1 : 0)
                    .animation(.spring(response: 0.22, dampingFraction: 0.7), value: appearAnimation)

                thoughtCircle(size: 7)
                    .position(x: anchor.x + dx * 0.22, y: anchor.y + dir * 15)
                    .opacity(appearAnimation ? 1 : 0)
                    .animation(.spring(response: 0.22, dampingFraction: 0.7).delay(0.03), value: appearAnimation)

                thoughtCircle(size: 10)
                    .position(x: anchor.x + dx * 0.42, y: anchor.y + dir * 24)
                    .opacity(appearAnimation ? 1 : 0)
                    .animation(.spring(response: 0.22, dampingFraction: 0.7).delay(0.06), value: appearAnimation)

                // Main bubble
                bubbleContent
                    .frame(width: bubbleW)
                    .fixedSize(horizontal: false, vertical: true)
                    .position(x: bubbleX, y: anchor.y + dir * 62)
                    .scaleEffect(appearAnimation ? 1 : 0.2, anchor: showAbove ? .bottom : .top)
                    .opacity(appearAnimation ? 1 : 0)
                    .animation(.spring(response: 0.28, dampingFraction: 0.72).delay(0.05), value: appearAnimation)
            }
        }
        .onAppear {
            appearAnimation = true
        }
    }

    // MARK: - Thought Circle

    private func thoughtCircle(size: CGFloat) -> some View {
        Circle()
            .fill(.ultraThinMaterial)
            .frame(width: size, height: size)
            .overlay(
                Circle().stroke(Color(hex: status.avatarColor).opacity(0.3), lineWidth: 0.5)
            )
            .shadow(color: Color.black.opacity(0.06), radius: 2, y: 1)
    }

    // MARK: - Bubble Content

    private var bubbleContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Top bar: translate, reply, share, close
            HStack(spacing: 6) {
                // Translate
                if status.content != nil || status.audioUrl != nil {
                    bubbleActionButton(
                        icon: translatedText != nil ? "character.book.closed.fill" : "globe",
                        color: "4ECDC4",
                        isLoading: isTranslating
                    ) {
                        translateContent()
                    }
                }

                // Reply
                bubbleActionButton(icon: "arrowshape.turn.up.left.fill", color: "FF6B6B") {
                    HapticFeedback.light()
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { onReply?() }
                }

                // Share
                bubbleActionButton(icon: "paperplane.fill", color: status.avatarColor) {
                    HapticFeedback.light()
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { onShare?() }
                }

                Spacer()

                // Time ago
                Text(status.timeAgo)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)

                // Close
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 22, height: 22)
                        .background(Circle().fill(theme.textMuted.opacity(0.12)))
                }
            }

            // Content (text or audio) — directly visible
            if let audioUrl = status.audioUrl, !audioUrl.isEmpty {
                audioPlayerView(urlString: audioUrl)
            } else if let content = status.content, !content.isEmpty {
                Text(translatedText ?? content)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(4)
            }

            // Quick reaction strip
            quickReactionStrip
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [Color(hex: status.avatarColor).opacity(0.3), Color.white.opacity(0.1)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.5
                        )
                )
                .shadow(color: Color.black.opacity(0.12), radius: 14, y: 5)
        )
    }

    // MARK: - Bubble Action Button

    private func bubbleActionButton(icon: String, color: String, isLoading: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.5)
                        .tint(Color(hex: color))
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(hex: color))
                }
            }
            .frame(width: 26, height: 26)
            .background(
                Circle().fill(Color(hex: color).opacity(theme.mode.isDark ? 0.18 : 0.1))
            )
        }
    }

    // MARK: - Quick Reactions Strip

    private var quickReactionStrip: some View {
        HStack(spacing: 0) {
            ForEach(quickEmojis, id: \.self) { emoji in
                Button {
                    triggerReaction(emoji)
                } label: {
                    Text(emoji)
                        .font(.system(size: reactedEmoji == emoji ? 22 : 18))
                        .scaleEffect(reactedEmoji == emoji ? 1.3 : 1.0)
                        .animation(.spring(response: 0.25, dampingFraction: 0.5), value: reactedEmoji)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Audio Player

    private func audioPlayerView(urlString: String) -> some View {
        HStack(spacing: 6) {
            Button {
                if audioPlayer.isPlaying {
                    audioPlayer.togglePlayPause()
                } else if audioPlayer.progress > 0 {
                    audioPlayer.togglePlayPause()
                } else {
                    audioPlayer.play(urlString: urlString)
                }
            } label: {
                Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Color(hex: status.avatarColor)))
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(hex: status.avatarColor).opacity(0.2))
                        .frame(height: 3)
                    Capsule()
                        .fill(Color(hex: status.avatarColor))
                        .frame(width: geo.size.width * audioPlayer.progress, height: 3)
                }
            }
            .frame(height: 3)
        }
    }

    // MARK: - Reactions

    private func triggerReaction(_ emoji: String) {
        HapticFeedback.light()

        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
            reactedEmoji = emoji
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation { reactedEmoji = nil }
        }

        onReaction?(emoji)

        // Auto-dismiss after reaction
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            dismiss()
        }
    }

    // MARK: - Translate

    private func translateContent() {
        if translatedText != nil {
            translatedText = nil
            return
        }

        guard let content = status.content, !content.isEmpty else { return }
        isTranslating = true

        Task {
            do {
                let body: [String: String] = [
                    "text": content,
                    "source_language": "auto",
                    "target_language": "fr"
                ]
                let response: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(
                    endpoint: "/translate",
                    body: body
                )
                if response.success, let data = response.data["translatedText"]?.value as? String {
                    translatedText = data
                }
            } catch {
                // Silent failure
            }
            isTranslating = false
        }
    }

    // MARK: - Dismiss

    private func dismiss() {
        audioPlayer.stop()
        appearAnimation = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            isPresented = false
        }
    }
}
