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
            let bubbleW: CGFloat = min(screenWidth - 48, 250)
            // Décalé à droite de l'avatar : bord gauche de la bulle à anchor.x + 12
            let bubbleX = min(anchor.x + 12 + bubbleW / 2, bounds.width - bubbleW / 2 - 16)
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
                    .position(x: bubbleX, y: anchor.y + dir * 52)
                    .scaleEffect(appearAnimation ? 1 : 0.2, anchor: showAbove ? .bottomLeading : .topLeading)
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
        VStack(alignment: .leading, spacing: 4) {
            // Ligne 1 : temps seulement (emoji déjà visible sur le badge avatar)
            Text(status.timeAgo)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textMuted)

            // Ligne(s) suivante(s) : contenu texte ou audio
            if let audioUrl = status.audioUrl, !audioUrl.isEmpty {
                audioPlayerRow(urlString: audioUrl)
            } else if let content = status.content, !content.isEmpty {
                Text(content)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
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

    private func audioPlayerRow(urlString: String) -> some View {
        HStack(spacing: 6) {
            Button {
                audioPlayer.togglePlayPause()
            } label: {
                Image(systemName: audioPlayer.isPlaying ? "stop.fill" : "play.fill")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(Color(hex: status.avatarColor)))
            }

            ProgressView(value: audioPlayer.progress)
                .progressViewStyle(.linear)
                .tint(Color(hex: status.avatarColor))
                .frame(maxWidth: .infinity)
                .scaleEffect(y: 0.6, anchor: .center)
        }
        .onAppear {
            audioPlayer.play(urlString: urlString)
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
