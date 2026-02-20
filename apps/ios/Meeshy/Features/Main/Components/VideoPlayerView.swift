import SwiftUI
import AVKit
import MeeshySDK

// ============================================================================
// MARK: - Video Player View
// ============================================================================
///
/// Reusable video player that adapts to context:
///  - `.messageBubble` — Thumbnail + play overlay, compact
///  - `.composerAttachment` — Preview with delete/edit
///  - `.feedPost` — Full width, inline play, social bar
///  - `.storyOverlay` — Autoplay, immersive dark
///  - `.fullscreen` — Native AVPlayerViewController
///
struct VideoPlayerView: View {
    let attachment: MessageAttachment
    let context: MediaPlayerContext
    var accentColor: String = "08D9D6"

    // Transcription
    var transcription: MessageTranscription? = nil
    var onRequestTranscription: (() -> Void)? = nil

    // Actions
    var onDelete: (() -> Void)? = nil
    var onEdit: (() -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @State private var showFullscreen = false
    @State private var showTranscription = false
    @State private var playbackSpeed: PlaybackSpeed = .x1_0
    @State private var isInlinePlay = false

    private var isDark: Bool { theme.mode.isDark || context.isImmersive }
    private var accent: Color { Color(hex: accentColor) }

    private var displaySegments: [TranscriptionDisplaySegment] {
        guard let t = transcription else { return [] }
        return TranscriptionDisplaySegment.buildFrom(t)
    }

    private var videoHeight: CGFloat {
        switch context {
        case .messageBubble: return 180
        case .composerAttachment: return 140
        case .feedPost: return 240
        case .storyOverlay: return 300
        case .fullscreen: return UIScreen.main.bounds.height
        }
    }

    // MARK: - Body
    var body: some View {
        VStack(spacing: 0) {
            // Video preview / inline player
            ZStack {
                if isInlinePlay, context == .feedPost || context == .storyOverlay,
                   !attachment.fileUrl.isEmpty, let url = URL(string: attachment.fileUrl) {
                    // Inline AVPlayer for feed/story
                    VideoPlayer(player: {
                        let p = AVPlayer(url: url)
                        p.rate = Float(playbackSpeed.rawValue)
                        return p
                    }())
                } else {
                    thumbnailView
                    playOverlay
                }

                // Duration badge
                durationBadge

                // Speed badge
                if playbackSpeed != .x1_0 {
                    speedOverlayBadge
                }

                // Delete badge in attachment mode
                if context.showsDeleteButton, let onDelete = onDelete {
                    VStack {
                        HStack {
                            Spacer()
                            Button { onDelete() } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(Color(hex: "FF6B6B"))
                                    .background(Circle().fill(.ultraThinMaterial).frame(width: 16, height: 16))
                            }
                            .padding(8)
                        }
                        Spacer()
                    }
                }
            }
            .frame(height: videoHeight)
            .clipShape(RoundedRectangle(cornerRadius: context.cornerRadius))

            // Controls bar (below thumbnail)
            controlsBar
                .padding(.horizontal, 6)
                .padding(.vertical, 4)

            // Transcription panel
            if showTranscription, !displaySegments.isEmpty {
                MediaTranscriptionView(
                    segments: displaySegments,
                    currentTime: 0, // Would need player time for sync
                    accentColor: accentColor,
                    maxHeight: context.isCompact ? 120 : 200,
                    onSeek: nil
                )
                .padding(.horizontal, 4)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .background(
            RoundedRectangle(cornerRadius: context.cornerRadius)
                .fill(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.02))
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showTranscription)
        .fullScreenCover(isPresented: $showFullscreen) {
            VideoFullscreenPlayer(
                urlString: attachment.fileUrl,
                speed: playbackSpeed
            )
        }
    }

    // MARK: - Thumbnail
    private var thumbnailView: some View {
        Group {
            if let thumbUrl = attachment.thumbnailUrl ?? (attachment.fileUrl.isEmpty ? nil : attachment.fileUrl),
               let url = URL(string: thumbUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    default:
                        videoPlaceholder
                    }
                }
            } else {
                videoPlaceholder
            }
        }
    }

    private var videoPlaceholder: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [accent.opacity(0.25), accent.opacity(0.08)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                Image(systemName: "video.fill")
                    .font(.system(size: 32))
                    .foregroundColor(isDark ? .white.opacity(0.25) : .black.opacity(0.15))
            )
    }

    // MARK: - Play Overlay
    private var playOverlay: some View {
        Button {
            if context == .feedPost || context == .storyOverlay {
                withAnimation(.spring(response: 0.3)) {
                    isInlinePlay = true
                }
            } else {
                showFullscreen = true
            }
            HapticFeedback.light()
        } label: {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: context.isCompact ? 44 : 56, height: context.isCompact ? 44 : 56)

                Circle()
                    .fill(accent.opacity(0.85))
                    .frame(width: context.isCompact ? 38 : 50, height: context.isCompact ? 38 : 50)

                Image(systemName: "play.fill")
                    .font(.system(size: context.isCompact ? 16 : 20, weight: .bold))
                    .foregroundColor(.white)
                    .offset(x: 2)
            }
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
        }
    }

    // MARK: - Duration Badge
    private var durationBadge: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                if let duration = attachment.durationFormatted {
                    Text(duration)
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(.black.opacity(0.6)))
                        .padding(8)
                }
            }
        }
    }

    // MARK: - Speed Overlay Badge
    private var speedOverlayBadge: some View {
        VStack {
            HStack {
                Text(playbackSpeed.label)
                    .font(.system(size: 10, weight: .heavy, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(accent.opacity(0.8)))
                    .padding(8)
                Spacer()
            }
            Spacer()
        }
    }

    // MARK: - Controls Bar
    private var controlsBar: some View {
        HStack(spacing: 10) {
            // Speed control
            Button { playbackSpeed = playbackSpeed.next(); HapticFeedback.light() } label: {
                Text(playbackSpeed.label)
                    .font(.system(size: 10, weight: .heavy, design: .monospaced))
                    .foregroundColor(playbackSpeed == .x1_0
                        ? (isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                        : accent)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 3)
                    .background(
                        RoundedRectangle(cornerRadius: 5)
                            .fill(playbackSpeed == .x1_0
                                  ? (isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                                  : accent.opacity(0.12))
                    )
            }

            Spacer()

            // Transcription button
            if transcription != nil || onRequestTranscription != nil {
                Button {
                    if transcription != nil {
                        withAnimation { showTranscription.toggle() }
                    } else {
                        onRequestTranscription?()
                    }
                    HapticFeedback.light()
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: transcription != nil ? "text.bubble.fill" : "text.badge.plus")
                            .font(.system(size: 11))
                        if !context.isCompact {
                            Text(transcription != nil ? "Transcription" : "Transcrire")
                                .font(.system(size: 10, weight: .medium))
                        }
                    }
                    .foregroundColor(showTranscription ? accent : (isDark ? .white.opacity(0.45) : .black.opacity(0.35)))
                }
            }

            // Edit button (composer)
            if context.isEditable, let onEdit = onEdit {
                Button { onEdit() } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 12))
                        .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                        .frame(width: 26, height: 26)
                }
            }
        }
    }
}

// ============================================================================
// MARK: - Video Fullscreen Player
// ============================================================================

struct VideoFullscreenPlayer: View {
    let urlString: String
    let speed: PlaybackSpeed

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let url = URL(string: urlString) {
                VideoPlayer(player: {
                    let p = AVPlayer(url: url)
                    p.rate = Float(speed.rawValue)
                    return p
                }())
                .ignoresSafeArea()
            }

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.white.opacity(0.8))
                            .padding()
                    }
                    Spacer()
                }
                Spacer()
            }
        }
    }
}
