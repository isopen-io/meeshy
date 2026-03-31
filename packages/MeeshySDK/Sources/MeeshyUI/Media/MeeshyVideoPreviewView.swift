import SwiftUI
import AVKit

// MARK: - Meeshy Video Preview View

public struct MeeshyVideoPreviewView: View {
    let url: URL
    let context: MediaPreviewContext
    let accentColor: String
    let onAccept: () -> Void
    let onCancel: (() -> Void)?

    @Environment(\.dismiss) private var dismiss

    @State private var player: AVPlayer?
    @State private var timeObserver: Any?
    @State private var loopObserver: NSObjectProtocol?
    @State private var isPlaying = true
    @State private var showEditor = false

    private var accentGradient: LinearGradient {
        LinearGradient(
            colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.85)],
            startPoint: .leading, endPoint: .trailing
        )
    }

    public init(
        url: URL,
        context: MediaPreviewContext,
        accentColor: String = MeeshyColors.brandPrimaryHex,
        onAccept: @escaping () -> Void,
        onCancel: (() -> Void)? = nil
    ) {
        self.url = url
        self.context = context
        self.accentColor = accentColor
        self.onAccept = onAccept
        self.onCancel = onCancel
    }

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                navigationBar
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                Spacer()

                contextPreview

                Spacer()

                bottomActions
                    .padding(.horizontal, 20)
                    .padding(.bottom, 34)
            }
        }
        .onAppear { setup() }
        .onDisappear { teardown() }
        .fullScreenCover(isPresented: $showEditor) {
            MeeshyVideoEditorView(
                url: url,
                accentColor: accentColor,
                onAccept: {
                    showEditor = false
                },
                onCancel: {
                    showEditor = false
                }
            )
        }
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack {
            Button {
                onCancel?()
                dismiss()
            } label: {
                Text(String(localized: "media.videoPreview.cancel", defaultValue: "Annuler", bundle: .module))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(.white.opacity(0.2)))
            }

            Spacer()

            HStack(spacing: 6) {
                Image(systemName: context.contextIcon)
                    .font(.system(size: 12, weight: .semibold))
                Text(context.contextLabel)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(Color(hex: accentColor))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(Color(hex: accentColor).opacity(0.15))
            )

            Spacer()

            Button {
                onAccept()
                HapticFeedback.success()
                dismiss()
            } label: {
                Text("OK")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(
                        Capsule()
                            .fill(accentGradient)
                    )
            }
        }
    }

    // MARK: - Context Preview

    @ViewBuilder
    private var contextPreview: some View {
        switch context {
        case .story:
            videoPlayerView
                .ignoresSafeArea()

        case .post:
            VStack(spacing: 0) {
                videoPlayerView
                    .aspectRatio(contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal, 16)

                HStack {
                    Text(String(localized: "media.videoPreview.addCaption", defaultValue: "Ajouter une l\u{00E9}gende...", bundle: .module))
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.3))
                    Spacer()
                }
                .padding(16)
            }

        case .message:
            videoPlayerView
                .aspectRatio(contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 20)

        case .avatar:
            videoPlayerView
                .frame(width: 120, height: 120)
                .clipShape(Circle())

        case .banner:
            videoPlayerView
                .frame(height: 200)
                .clipped()
        }
    }

    @ViewBuilder
    private var videoPlayerView: some View {
        if let player {
            ZStack {
                VideoPlayer(player: player)
                    .allowsHitTesting(false)

                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if isPlaying {
                            player.pause()
                            isPlaying = false
                        } else {
                            player.play()
                            isPlaying = true
                        }
                        HapticFeedback.light()
                    }

                if !isPlaying {
                    Image(systemName: "play.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(.white.opacity(0.85))
                        .shadow(color: .black.opacity(0.4), radius: 6)
                        .allowsHitTesting(false)
                }
            }
        } else {
            Rectangle()
                .fill(.white.opacity(0.05))
                .overlay(ProgressView().tint(.white))
        }
    }

    // MARK: - Bottom Actions

    private var bottomActions: some View {
        HStack(spacing: 16) {
            Button {
                showEditor = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "pencil")
                        .font(.system(size: 14, weight: .semibold))
                    Text(String(localized: "media.videoPreview.edit", defaultValue: "\u{00C9}diter", bundle: .module))
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(.white.opacity(0.12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(.white.opacity(0.15), lineWidth: 0.5)
                        )
                )
            }

            Button {
                onAccept()
                HapticFeedback.success()
                dismiss()
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                    Text(String(localized: "media.videoPreview.use", defaultValue: "Utiliser", bundle: .module))
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(accentGradient)
                        .shadow(color: Color(hex: accentColor).opacity(0.45), radius: 10, y: 4)
                )
            }
        }
    }

    // MARK: - Player

    private func setup() {
        let avPlayer = AVPlayer(url: url)
        player = avPlayer
        avPlayer.play()

        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserver = avPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { _ in }

        loopObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: avPlayer.currentItem,
            queue: .main
        ) { _ in
            avPlayer.seek(to: .zero)
            avPlayer.play()
        }
    }

    private func teardown() {
        if let obs = timeObserver { player?.removeTimeObserver(obs) }
        if let obs = loopObserver { NotificationCenter.default.removeObserver(obs) }
        player?.pause()
        player = nil
    }
}
