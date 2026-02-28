import SwiftUI
import MeeshySDK

struct StatusBubbleOverlay: View {
    let status: StatusEntry
    let anchorPoint: CGPoint
    @Binding var isPresented: Bool

    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var audioPlayer = AudioPlayerManager()
    @State private var appearAnimation = false

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
            let bubbleW: CGFloat = min(screenWidth - 48, 210)
            let bubbleX = min(max(anchor.x, bubbleW / 2 + 16), bounds.width - bubbleW / 2 - 16)
            let dir: CGFloat = showAbove ? -1 : 1
            let dx = bubbleX - anchor.x

            ZStack {
                // Tap-to-dismiss — transparent, laisse passer les scrolls
                Color.clear
                    .contentShape(Rectangle())
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 3)
                            .onChanged { _ in dismiss() }
                    )
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
        VStack(alignment: .leading, spacing: 6) {
            if let audioUrl = status.audioUrl, !audioUrl.isEmpty {
                // Audio : date sur sa propre ligne + player
                Text(status.timeAgo)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)
                audioPlayerView(urlString: audioUrl)
            } else {
                // Date + contenu directement à la suite, multilignes
                let content = status.content ?? ""
                if content.isEmpty {
                    Text(status.timeAgo)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(theme.textMuted)
                } else {
                    (Text(status.timeAgo + "  ")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(theme.textMuted)
                    + Text(content)
                        .font(.system(size: 13))
                        .foregroundColor(theme.textPrimary))
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [Color(hex: status.avatarColor).opacity(0.3), Color.white.opacity(0.1)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.5
                        )
                )
                .shadow(color: Color.black.opacity(0.1), radius: 10, y: 4)
        )
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

    // MARK: - Dismiss

    private func dismiss() {
        audioPlayer.stop()
        appearAnimation = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            isPresented = false
        }
    }
}
