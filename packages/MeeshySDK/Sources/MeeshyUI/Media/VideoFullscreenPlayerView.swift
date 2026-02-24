import SwiftUI
import AVKit
import MeeshySDK

// MARK: - Fullscreen AVPlayerLayer View (UIViewRepresentable)

public struct FullscreenAVPlayerLayerView: UIViewRepresentable {
    public let player: AVPlayer
    public let gravity: AVLayerVideoGravity
    public var configurePip: Bool = true

    public init(player: AVPlayer, gravity: AVLayerVideoGravity, configurePip: Bool = true) {
        self.player = player
        self.gravity = gravity
        self.configurePip = configurePip
    }

    public func makeUIView(context: Context) -> FullscreenPlayerUIView {
        let view = FullscreenPlayerUIView()
        view.playerLayer.videoGravity = gravity
        view.playerLayer.player = player
        if configurePip {
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
        return view
    }

    public func updateUIView(_ uiView: FullscreenPlayerUIView, context: Context) {
        uiView.updatePlayer(player)
        uiView.updateGravity(gravity)
        if configurePip {
            SharedAVPlayerManager.shared.configurePip(playerLayer: uiView.playerLayer)
        }
    }

    public final class FullscreenPlayerUIView: UIView {
        public let playerLayer = AVPlayerLayer()

        public override init(frame: CGRect) {
            super.init(frame: frame)
            layer.addSublayer(playerLayer)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError() }

        public override func layoutSubviews() {
            super.layoutSubviews()
            playerLayer.frame = bounds
        }

        public func updatePlayer(_ player: AVPlayer) {
            guard playerLayer.player !== player else { return }
            playerLayer.player = player
        }

        public func updateGravity(_ gravity: AVLayerVideoGravity) {
            guard playerLayer.videoGravity != gravity else { return }
            playerLayer.videoGravity = gravity
        }
    }
}

// MARK: - Orientation Manager

@MainActor
public final class OrientationManager: ObservableObject {
    public static let shared = OrientationManager()

    @Published public var orientationLock: UIInterfaceOrientationMask = .portrait

    private init() {}

    public func unlock() {
        orientationLock = .allButUpsideDown
    }

    public func lockPortrait() {
        orientationLock = .portrait
        if #available(iOS 16.0, *) {
            guard let windowScene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene }).first else { return }
            windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
        }
    }
}

// MARK: - Video Fullscreen Player View

public struct VideoFullscreenPlayerView: View {
    public let urlString: String
    public let accentColor: String
    public let fileName: String

    @ObservedObject private var manager = SharedAVPlayerManager.shared
    @Environment(\.dismiss) private var dismiss

    @State private var showControls = true
    @State private var controlsTimer: Timer?
    @State private var videoGravity: AVLayerVideoGravity = .resizeAspect
    @State private var saveState: SaveState = .idle
    @State private var dismissOffset: CGFloat = 0
    @State private var isSeeking = false
    @State private var seekValue: Double = 0

    private enum SaveState {
        case idle, saving, saved, failed
    }

    private var accent: Color { Color(hex: accentColor) }

    private var progress: Double {
        guard manager.duration > 0 else { return 0 }
        return isSeeking ? seekValue : manager.currentTime / manager.duration
    }

    private let fullscreenSpeeds: [PlaybackSpeed] = [.x1_0, .x1_25, .x1_5, .x1_75, .x2_0]

    public init(
        urlString: String,
        accentColor: String = "08D9D6",
        fileName: String = ""
    ) {
        self.urlString = urlString
        self.accentColor = accentColor
        self.fileName = fileName
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if manager.player != nil && manager.activeURL == urlString {
                playerContent
            } else {
                loadingState
            }
        }
        .offset(y: dismissOffset)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: dismissOffset)
        .onAppear { OrientationManager.shared.unlock() }
        .onDisappear {
            controlsTimer?.invalidate()
            controlsTimer = nil
            OrientationManager.shared.lockPortrait()
        }
        .statusBarHidden(true)
    }

    // MARK: - Player Content

    private var playerContent: some View {
        ZStack {
            if let player = manager.player {
                FullscreenAVPlayerLayerView(player: player, gravity: videoGravity)
                    .ignoresSafeArea()
                    .onTapGesture { toggleControls() }
                    .gesture(swipeDownGesture)
                    .gesture(pinchGesture)
            }

            if showControls {
                fullscreenOverlay
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showControls)
    }

    // MARK: - Loading State

    private var loadingState: some View {
        ProgressView()
            .tint(.white)
            .onAppear {
                manager.load(urlString: urlString)
                manager.play()
            }
    }

    // MARK: - Fullscreen Overlay

    private var fullscreenOverlay: some View {
        ZStack {
            scrimGradients

            VStack(spacing: 0) {
                topBar
                    .padding(.top, 8)
                    .padding(.horizontal, 16)

                Spacer()

                centerControls

                Spacer()

                VStack(spacing: 8) {
                    seekBar
                        .padding(.horizontal, 16)

                    HStack {
                        Text(formatMediaDuration(isSeeking ? seekValue * manager.duration : manager.currentTime))
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white.opacity(0.7))

                        Spacer()

                        Text(formatMediaDuration(manager.duration))
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white.opacity(0.7))
                    }
                    .padding(.horizontal, 16)

                    speedRow
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                }
            }
        }
    }

    // MARK: - Scrim Gradients

    private var scrimGradients: some View {
        VStack(spacing: 0) {
            LinearGradient(
                colors: [Color.black.opacity(0.7), Color.clear],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 80)

            Spacer()

            LinearGradient(
                colors: [Color.clear, Color.black.opacity(0.7)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 160)
        }
        .ignoresSafeArea()
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: 12) {
            Button {
                closePlayer()
                HapticFeedback.light()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white.opacity(0.2)))
            }

            if !fileName.isEmpty {
                Text(fileName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer()

            downloadButton
        }
    }

    // MARK: - Center Controls

    private var centerControls: some View {
        HStack(spacing: 48) {
            Button {
                manager.skip(seconds: -10)
                HapticFeedback.light()
            } label: {
                Image(systemName: "gobackward.10")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(.white)
            }

            Button {
                manager.togglePlayPause()
                HapticFeedback.light()
                scheduleControlsHide()
            } label: {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.2))
                        .frame(width: 64, height: 64)

                    Image(systemName: manager.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.white)
                        .offset(x: manager.isPlaying ? 0 : 3)
                }
            }

            Button {
                manager.skip(seconds: 10)
                HapticFeedback.light()
            } label: {
                Image(systemName: "goforward.10")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: - Seek Bar

    private var seekBar: some View {
        GeometryReader { geo in
            let trackHeight: CGFloat = 5
            let thumbSize: CGFloat = 16
            let filledWidth = geo.size.width * progress

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.white.opacity(0.3))
                    .frame(height: trackHeight)

                Capsule()
                    .fill(accent)
                    .frame(width: max(0, filledWidth), height: trackHeight)

                Circle()
                    .fill(Color.white)
                    .frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                    .offset(x: max(0, min(filledWidth - thumbSize / 2, geo.size.width - thumbSize)))
            }
            .frame(height: max(trackHeight, thumbSize))
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        isSeeking = true
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        seekValue = fraction
                    }
                    .onEnded { value in
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        let targetSeconds = fraction * manager.duration
                        manager.seek(to: targetSeconds)
                        isSeeking = false
                        seekValue = 0
                    }
            )
        }
        .frame(height: 16)
    }

    // MARK: - Speed Row

    private var speedRow: some View {
        HStack(spacing: 8) {
            ForEach(fullscreenSpeeds, id: \.rawValue) { speed in
                Button {
                    manager.setSpeed(speed)
                    HapticFeedback.light()
                } label: {
                    Text(speed.label)
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundColor(manager.playbackSpeed == speed ? .black : .white.opacity(0.7))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(
                                manager.playbackSpeed == speed
                                    ? accent
                                    : Color.white.opacity(0.15)
                            )
                        )
                }
            }
        }
    }

    // MARK: - Download Button

    private var downloadButton: some View {
        Button { saveVideoToPhotos() } label: {
            Group {
                switch saveState {
                case .idle:
                    Image(systemName: "arrow.down.to.line")
                case .saving:
                    ProgressView().tint(.white)
                case .saved:
                    Image(systemName: "checkmark")
                case .failed:
                    Image(systemName: "xmark")
                }
            }
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.white.opacity(0.9))
            .frame(width: 36, height: 36)
            .background(Circle().fill(Color.white.opacity(0.2)))
        }
        .disabled(saveState == .saving || saveState == .saved)
    }

    // MARK: - Gestures

    private var swipeDownGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                let translation = value.translation.height
                guard translation > 0 else { return }
                dismissOffset = translation
            }
            .onEnded { value in
                if value.translation.height > 150 {
                    if manager.isPlaying {
                        manager.startPip()
                    }
                    closePlayer()
                } else {
                    dismissOffset = 0
                }
            }
    }

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .onEnded { scale in
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    videoGravity = scale > 1 ? .resizeAspectFill : .resizeAspect
                }
                HapticFeedback.light()
            }
    }

    // MARK: - Actions

    private func toggleControls() {
        withAnimation { showControls.toggle() }
        if showControls {
            scheduleControlsHide()
        }
    }

    private func scheduleControlsHide() {
        controlsTimer?.invalidate()
        controlsTimer = Timer.scheduledTimer(withTimeInterval: 4.0, repeats: false) { _ in
            Task { @MainActor in
                withAnimation { showControls = false }
            }
        }
    }

    private func closePlayer() {
        OrientationManager.shared.lockPortrait()
        dismiss()
    }

    private func saveVideoToPhotos() {
        guard let url = MeeshyConfig.resolveMediaURL(urlString) else { return }
        saveState = .saving
        HapticFeedback.light()
        Task {
            do {
                let (tempURL, _) = try await URLSession.shared.download(from: url)
                let tempFile = FileManager.default.temporaryDirectory
                    .appendingPathComponent("save_\(UUID().uuidString).mp4")
                try FileManager.default.moveItem(at: tempURL, to: tempFile)
                let saved = await PhotoLibraryManager.shared.saveVideo(at: tempFile)
                try? FileManager.default.removeItem(at: tempFile)
                await MainActor.run {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        saveState = saved ? .saved : .failed
                    }
                    if saved { HapticFeedback.success() } else { HapticFeedback.error() }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            } catch {
                await MainActor.run {
                    withAnimation { saveState = .failed }
                    HapticFeedback.error()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            }
        }
    }
}
