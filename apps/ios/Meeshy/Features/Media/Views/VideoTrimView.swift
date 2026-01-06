//
//  VideoTrimView.swift
//  Meeshy
//
//  Video trimming view for precise video clip selection in a messaging app.
//  Replaces VideoTrimSheetPlaceholder in VideoPreviewView.swift
//
//  Features:
//  - Horizontal scrollable timeline with video thumbnails
//  - Draggable trim handles (start/end) with yellow/gold accent
//  - AVPlayer preview looping within trim range
//  - Duration display and progress indicator
//  - Haptic feedback at boundaries
//  - Export trimmed video using VideoCompressor
//
//  iOS 16+
//

import SwiftUI
import AVFoundation
import AVKit
import CoreMedia

// MARK: - Trim State

enum VideoTrimState: Equatable {
    case loading
    case ready
    case trimming(progress: Double)
    case completed(URL)
    case error(String)

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    var isTrimming: Bool {
        if case .trimming = self { return true }
        return false
    }
}

// MARK: - Video Trim View

struct VideoTrimView: View {

    // MARK: - Properties

    let videoURL: URL
    let onTrimComplete: (URL) -> Void
    let onCancel: () -> Void

    @StateObject private var viewModel: VideoTrimViewModel
    @Environment(\.dismiss) private var dismiss

    // MARK: - Constants

    private let timelineHeight: CGFloat = 60
    private let handleWidth: CGFloat = 16
    private let minimumTrimDuration: Double = 1.0 // 1 second minimum

    // MARK: - Initialization

    init(
        videoURL: URL,
        onTrimComplete: @escaping (URL) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.videoURL = videoURL
        self.onTrimComplete = onTrimComplete
        self.onCancel = onCancel
        self._viewModel = StateObject(wrappedValue: VideoTrimViewModel(url: videoURL))
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                // Dark background
                Color.black
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Video preview
                    videoPreviewSection
                        .frame(maxWidth: .infinity, maxHeight: .infinity)

                    // Duration info
                    durationInfoSection

                    // Timeline with trim handles
                    timelineSection
                        .padding(.horizontal, 16)
                        .padding(.vertical, 20)

                    // Bottom action buttons
                    bottomActionBar
                }

                // Loading overlay
                if viewModel.state.isLoading {
                    loadingOverlay
                }

                // Trimming progress overlay
                if case .trimming(let progress) = viewModel.state {
                    trimmingOverlay(progress: progress)
                }

                // Error overlay
                if case .error(let message) = viewModel.state {
                    errorOverlay(message: message)
                }
            }
            .navigationTitle("Trim Video")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.black.opacity(0.9), for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        viewModel.cleanup()
                        onCancel()
                    }
                    .foregroundColor(.white)
                }
            }
            .onAppear {
                mediaLogger.info("[VideoTrim] View appeared for: \(videoURL.lastPathComponent)")
                viewModel.loadVideo()
            }
            .onDisappear {
                mediaLogger.info("[VideoTrim] View disappeared")
                viewModel.cleanup()
            }
        }
    }

    // MARK: - Video Preview Section

    private var videoPreviewSection: some View {
        ZStack {
            if let player = viewModel.player {
                VideoTrimPlayerLayer(player: player)
                    .ignoresSafeArea()

                // Play/Pause overlay
                playPauseOverlay

                // Current time indicator
                currentTimeIndicator
            } else {
                Color.black
                    .overlay(
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(1.2)
                    )
            }
        }
        .onTapGesture {
            viewModel.togglePlayPause()
        }
    }

    private var playPauseOverlay: some View {
        Group {
            if viewModel.isPaused {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 64))
                    .foregroundColor(.white.opacity(0.8))
                    .shadow(color: .black.opacity(0.5), radius: 8)
            }
        }
    }

    private var currentTimeIndicator: some View {
        VStack {
            HStack {
                Spacer()

                Text(viewModel.currentTimeFormatted)
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(Color.black.opacity(0.6))
                    )
                    .padding(16)
            }

            Spacer()
        }
    }

    // MARK: - Duration Info Section

    private var durationInfoSection: some View {
        VStack(spacing: 8) {
            // Selected range
            HStack {
                Text(viewModel.startTimeFormatted)
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundColor(.yellow)

                Text("-")
                    .foregroundColor(.white.opacity(0.6))

                Text(viewModel.endTimeFormatted)
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundColor(.yellow)
            }

            // Selected duration
            HStack(spacing: 4) {
                Text(viewModel.selectedDurationFormatted)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)

                Text("selected")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.6))

                Text("(of \(viewModel.totalDurationFormatted))")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(Color.black)
    }

    // MARK: - Timeline Section

    private var timelineSection: some View {
        GeometryReader { geometry in
            let availableWidth = geometry.size.width - (handleWidth * 2)

            ZStack(alignment: .leading) {
                // Thumbnails background
                thumbnailsView(width: geometry.size.width)

                // Dimmed left region (before start handle)
                Rectangle()
                    .fill(Color.black.opacity(0.7))
                    .frame(width: max(0, viewModel.startHandlePosition * availableWidth + handleWidth))

                // Dimmed right region (after end handle)
                Rectangle()
                    .fill(Color.black.opacity(0.7))
                    .frame(width: max(0, (1 - viewModel.endHandlePosition) * availableWidth + handleWidth))
                    .offset(x: viewModel.endHandlePosition * availableWidth + handleWidth)

                // Start handle
                trimHandle(isStart: true, totalWidth: availableWidth)
                    .offset(x: viewModel.startHandlePosition * availableWidth)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                let newPosition = (value.location.x - handleWidth / 2) / availableWidth
                                viewModel.updateStartPosition(newPosition)
                            }
                            .onEnded { _ in
                                viewModel.finalizeTrimRange()
                            }
                    )

                // End handle
                trimHandle(isStart: false, totalWidth: availableWidth)
                    .offset(x: viewModel.endHandlePosition * availableWidth + handleWidth)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                let newPosition = (value.location.x - handleWidth / 2) / availableWidth
                                viewModel.updateEndPosition(newPosition)
                            }
                            .onEnded { _ in
                                viewModel.finalizeTrimRange()
                            }
                    )

                // Top and bottom borders for selected region
                selectedRegionBorders(availableWidth: availableWidth)

                // Playhead indicator (white vertical line)
                playheadIndicator(availableWidth: availableWidth)
            }
            .frame(height: timelineHeight)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .frame(height: timelineHeight)
    }

    private func thumbnailsView(width: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(viewModel.thumbnails.enumerated()), id: \.offset) { index, image in
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: width / CGFloat(max(viewModel.thumbnails.count, 1)))
                    .frame(height: timelineHeight)
                    .clipped()
            }
        }
        .frame(width: width, height: timelineHeight)
        .background(Color.gray.opacity(0.3))
    }

    private func trimHandle(isStart: Bool, totalWidth: CGFloat) -> some View {
        ZStack {
            // Handle background
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.trimHandleColor)
                .frame(width: handleWidth, height: timelineHeight)

            // Handle grip lines
            VStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color.black.opacity(0.4))
                        .frame(width: 3, height: 12)
                }
            }
        }
        .shadow(color: .black.opacity(0.3), radius: 2, x: isStart ? 1 : -1)
    }

    private func selectedRegionBorders(availableWidth: CGFloat) -> some View {
        let startX = viewModel.startHandlePosition * availableWidth + handleWidth
        let endX = viewModel.endHandlePosition * availableWidth + handleWidth
        let selectedWidth = endX - startX

        return Group {
            // Top border
            Rectangle()
                .fill(Color.trimHandleColor)
                .frame(width: max(0, selectedWidth), height: 3)
                .offset(x: startX, y: 0)

            // Bottom border
            Rectangle()
                .fill(Color.trimHandleColor)
                .frame(width: max(0, selectedWidth), height: 3)
                .offset(x: startX, y: timelineHeight - 3)
        }
    }

    private func playheadIndicator(availableWidth: CGFloat) -> some View {
        let playheadPosition = viewModel.playheadPosition
        let startX = viewModel.startHandlePosition * availableWidth + handleWidth
        let endX = viewModel.endHandlePosition * availableWidth + handleWidth
        let selectedWidth = endX - startX

        return Rectangle()
            .fill(Color.white)
            .frame(width: 2, height: timelineHeight)
            .offset(x: startX + (playheadPosition * selectedWidth) - 1)
            .shadow(color: .black.opacity(0.5), radius: 2)
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 16) {
            // Reset button
            Button {
                viewModel.resetTrimRange()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 16))
                    Text("Reset")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.white.opacity(0.15))
                )
            }
            .disabled(viewModel.state.isTrimming)

            Spacer()

            // Trim button
            Button {
                performTrim()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "scissors")
                        .font(.system(size: 16))
                    Text("Trim")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(.black)
                .padding(.horizontal, 32)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.trimHandleColor)
                )
            }
            .disabled(viewModel.state.isTrimming || viewModel.state.isLoading)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .padding(.bottom, 8)
        .background(Color.black)
    }

    // MARK: - Overlays

    private var loadingOverlay: some View {
        ZStack {
            Color.black.opacity(0.7)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.white)

                Text("Loading video...")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
            }
            .padding(32)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.black.opacity(0.8))
            )
        }
    }

    private func trimmingOverlay(progress: Double) -> some View {
        ZStack {
            Color.black.opacity(0.8)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                // Progress ring
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.2), lineWidth: 6)
                        .frame(width: 80, height: 80)

                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Color.trimHandleColor, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .frame(width: 80, height: 80)
                        .rotationEffect(.degrees(-90))

                    Text("\(Int(progress * 100))%")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                }

                Text("Trimming video...")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)

                Text("Please wait")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.6))
            }
            .padding(32)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.black.opacity(0.9))
            )
        }
    }

    private func errorOverlay(message: String) -> some View {
        ZStack {
            Color.black.opacity(0.8)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.orange)

                Text("Error")
                    .font(.headline)
                    .foregroundColor(.white)

                Text(message)
                    .font(.system(size: 14))
                    .foregroundColor(.white.opacity(0.8))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                Button {
                    viewModel.loadVideo()
                } label: {
                    Label("Retry", systemImage: "arrow.clockwise")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.black)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(Color.trimHandleColor))
                }
                .padding(.top, 8)
            }
            .padding(32)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.black.opacity(0.9))
            )
        }
    }

    // MARK: - Actions

    private func performTrim() {
        Task {
            do {
                let trimmedURL = try await viewModel.exportTrimmedVideo()
                await MainActor.run {
                    onTrimComplete(trimmedURL)
                }
            } catch {
                mediaLogger.error("[VideoTrim] Trim failed: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - Video Trim Player Layer

private struct VideoTrimPlayerLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> UIView {
        let view = PlayerContainerView()
        view.backgroundColor = .black

        let playerLayer = AVPlayerLayer(player: player)
        playerLayer.videoGravity = .resizeAspect
        view.playerLayer = playerLayer
        view.layer.addSublayer(playerLayer)

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        if let containerView = uiView as? PlayerContainerView {
            containerView.playerLayer?.player = player
        }
    }

    private class PlayerContainerView: UIView {
        var playerLayer: AVPlayerLayer?

        override func layoutSubviews() {
            super.layoutSubviews()
            playerLayer?.frame = bounds
        }
    }
}

// MARK: - Video Trim ViewModel

@MainActor
final class VideoTrimViewModel: ObservableObject {

    // MARK: - Published Properties

    @Published private(set) var state: VideoTrimState = .loading
    @Published private(set) var thumbnails: [UIImage] = []
    @Published private(set) var startHandlePosition: Double = 0.0 // 0.0 to 1.0
    @Published private(set) var endHandlePosition: Double = 1.0   // 0.0 to 1.0
    @Published private(set) var playheadPosition: Double = 0.0    // 0.0 to 1.0 within selected range
    @Published private(set) var isPaused: Bool = true

    private(set) var player: AVPlayer?

    // MARK: - Private Properties

    private let videoURL: URL
    private var totalDuration: Double = 0
    private var timeObserver: Any?
    private var boundaryObserver: Any?
    private let minimumTrimDuration: Double = 1.0
    private let thumbnailCount: Int = 12

    private let feedbackGenerator = UIImpactFeedbackGenerator(style: .medium)
    private let selectionFeedbackGenerator = UISelectionFeedbackGenerator()

    // MARK: - Computed Properties

    var currentTimeFormatted: String {
        guard let player = player else { return "0:00" }
        let currentTime = CMTimeGetSeconds(player.currentTime())
        return formatTime(currentTime)
    }

    var startTimeFormatted: String {
        let startTime = startHandlePosition * totalDuration
        return formatTime(startTime)
    }

    var endTimeFormatted: String {
        let endTime = endHandlePosition * totalDuration
        return formatTime(endTime)
    }

    var selectedDurationFormatted: String {
        let duration = (endHandlePosition - startHandlePosition) * totalDuration
        return formatTime(duration)
    }

    var totalDurationFormatted: String {
        formatTime(totalDuration)
    }

    private var startTime: CMTime {
        CMTime(seconds: startHandlePosition * totalDuration, preferredTimescale: 600)
    }

    private var endTime: CMTime {
        CMTime(seconds: endHandlePosition * totalDuration, preferredTimescale: 600)
    }

    // MARK: - Initialization

    init(url: URL) {
        self.videoURL = url
        feedbackGenerator.prepare()
        selectionFeedbackGenerator.prepare()
        mediaLogger.info("[VideoTrimVM] Init for: \(url.lastPathComponent)")
    }

    deinit {
        mediaLogger.info("[VideoTrimVM] Deinit")
    }

    // MARK: - Setup

    func loadVideo() {
        state = .loading

        Task {
            do {
                // Extract metadata
                let metadata = try await VideoCompressor.extractMetadata(videoURL)
                self.totalDuration = metadata.duration

                mediaLogger.info("[VideoTrimVM] Video loaded - Duration: \(metadata.durationFormatted)")

                // Generate thumbnails
                await generateThumbnails()

                // Setup player
                setupPlayer()

                self.state = .ready

            } catch {
                mediaLogger.error("[VideoTrimVM] Failed to load video: \(error.localizedDescription)")
                self.state = .error(error.localizedDescription)
            }
        }
    }

    private func generateThumbnails() async {
        do {
            let images = try await VideoCompressor.generateThumbnails(videoURL, count: thumbnailCount)
            await MainActor.run {
                self.thumbnails = images
                mediaLogger.info("[VideoTrimVM] Generated \(images.count) thumbnails")
            }
        } catch {
            mediaLogger.error("[VideoTrimVM] Failed to generate thumbnails: \(error.localizedDescription)")
        }
    }

    private func setupPlayer() {
        let playerItem = AVPlayerItem(url: videoURL)
        player = AVPlayer(playerItem: playerItem)
        player?.isMuted = false

        // Setup time observer for playhead position
        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                self?.updatePlayheadPosition(currentTime: time)
            }
        }

        // Setup boundary observer for looping
        setupBoundaryObserver()

        // Seek to start and pause
        player?.seek(to: startTime, toleranceBefore: .zero, toleranceAfter: .zero)
        isPaused = true

        mediaLogger.info("[VideoTrimVM] Player setup complete")
    }

    private func setupBoundaryObserver() {
        // Remove existing observer
        if let observer = boundaryObserver {
            NotificationCenter.default.removeObserver(observer)
        }

        // Add observer for end of playback
        boundaryObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player?.currentItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.loopToStart()
            }
        }
    }

    private func updatePlayheadPosition(currentTime: CMTime) {
        let currentSeconds = CMTimeGetSeconds(currentTime)
        let startSeconds = startHandlePosition * totalDuration
        let endSeconds = endHandlePosition * totalDuration
        let selectedDuration = endSeconds - startSeconds

        guard selectedDuration > 0 else {
            playheadPosition = 0
            return
        }

        // Check if we've reached the end of trim range
        if currentSeconds >= endSeconds {
            loopToStart()
            return
        }

        // Calculate position within selected range
        let positionInRange = (currentSeconds - startSeconds) / selectedDuration
        playheadPosition = max(0, min(1, positionInRange))
    }

    private func loopToStart() {
        player?.seek(to: startTime, toleranceBefore: .zero, toleranceAfter: .zero)
        if !isPaused {
            player?.play()
        }
        playheadPosition = 0
    }

    // MARK: - Controls

    func togglePlayPause() {
        if isPaused {
            // If at or past end, restart from beginning
            let currentSeconds = CMTimeGetSeconds(player?.currentTime() ?? .zero)
            let endSeconds = endHandlePosition * totalDuration

            if currentSeconds >= endSeconds - 0.1 {
                player?.seek(to: startTime, toleranceBefore: .zero, toleranceAfter: .zero)
            }

            player?.play()
            isPaused = false
        } else {
            player?.pause()
            isPaused = true
        }

        mediaLogger.info("[VideoTrimVM] Play/Pause toggled: \(isPaused ? "paused" : "playing")")
    }

    // MARK: - Handle Position Updates

    func updateStartPosition(_ position: Double) {
        let clampedPosition = max(0, min(position, endHandlePosition - (minimumTrimDuration / totalDuration)))

        // Haptic feedback at boundaries
        if clampedPosition <= 0 && startHandlePosition > 0 {
            feedbackGenerator.impactOccurred()
        } else if clampedPosition >= endHandlePosition - (minimumTrimDuration / totalDuration) &&
                  startHandlePosition < endHandlePosition - (minimumTrimDuration / totalDuration) {
            feedbackGenerator.impactOccurred()
        }

        // Selection feedback for smooth dragging
        if abs(clampedPosition - startHandlePosition) > 0.01 {
            selectionFeedbackGenerator.selectionChanged()
        }

        startHandlePosition = clampedPosition

        // Update player position to start of trim
        let newStartTime = CMTime(seconds: startHandlePosition * totalDuration, preferredTimescale: 600)
        player?.seek(to: newStartTime, toleranceBefore: .zero, toleranceAfter: .zero)

        // Pause during drag
        if !isPaused {
            player?.pause()
            isPaused = true
        }
    }

    func updateEndPosition(_ position: Double) {
        let clampedPosition = max(startHandlePosition + (minimumTrimDuration / totalDuration), min(position, 1.0))

        // Haptic feedback at boundaries
        if clampedPosition >= 1.0 && endHandlePosition < 1.0 {
            feedbackGenerator.impactOccurred()
        } else if clampedPosition <= startHandlePosition + (minimumTrimDuration / totalDuration) &&
                  endHandlePosition > startHandlePosition + (minimumTrimDuration / totalDuration) {
            feedbackGenerator.impactOccurred()
        }

        // Selection feedback for smooth dragging
        if abs(clampedPosition - endHandlePosition) > 0.01 {
            selectionFeedbackGenerator.selectionChanged()
        }

        endHandlePosition = clampedPosition

        // Pause during drag
        if !isPaused {
            player?.pause()
            isPaused = true
        }
    }

    func finalizeTrimRange() {
        // Seek to start of new trim range
        player?.seek(to: startTime, toleranceBefore: .zero, toleranceAfter: .zero)
        playheadPosition = 0

        mediaLogger.info("[VideoTrimVM] Trim range finalized: \(startTimeFormatted) - \(endTimeFormatted)")
    }

    func resetTrimRange() {
        startHandlePosition = 0
        endHandlePosition = 1.0
        playheadPosition = 0

        player?.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)

        feedbackGenerator.impactOccurred()
        mediaLogger.info("[VideoTrimVM] Trim range reset to full video")
    }

    // MARK: - Export

    func exportTrimmedVideo() async throws -> URL {
        mediaLogger.info("[VideoTrimVM] Starting video trim export...")

        await MainActor.run {
            state = .trimming(progress: 0)
            player?.pause()
            isPaused = true
        }

        // If no trimming needed (full video selected), return original URL
        if startHandlePosition == 0 && endHandlePosition == 1.0 {
            mediaLogger.info("[VideoTrimVM] No trimming needed, returning original URL")
            await MainActor.run {
                state = .completed(videoURL)
            }
            return videoURL
        }

        // Perform trim
        let trimmedURL = try await VideoCompressor.trim(
            videoURL,
            start: startTime,
            end: endTime,
            quality: .medium
        )

        await MainActor.run {
            state = .completed(trimmedURL)
        }

        mediaLogger.info("[VideoTrimVM] Trim export complete: \(trimmedURL.lastPathComponent)")
        return trimmedURL
    }

    // MARK: - Cleanup

    func cleanup() {
        mediaLogger.info("[VideoTrimVM] Cleanup starting...")

        // Remove time observer
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }

        // Remove boundary observer
        if let observer = boundaryObserver {
            NotificationCenter.default.removeObserver(observer)
            boundaryObserver = nil
        }

        // Stop player
        player?.pause()
        player = nil

        thumbnails = []

        mediaLogger.info("[VideoTrimVM] Cleanup complete")
    }

    // MARK: - Helpers

    private func formatTime(_ time: Double) -> String {
        guard time.isFinite && time >= 0 else { return "0:00" }

        let totalSeconds = Int(time)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        let milliseconds = Int((time - Double(totalSeconds)) * 100)

        if time < 60 {
            return String(format: "0:%02d.%02d", seconds, milliseconds)
        } else {
            return String(format: "%d:%02d", minutes, seconds)
        }
    }
}

// MARK: - Color Extension for Trim Handle

extension Color {
    /// Yellow/gold color for trim handles (iOS Photos app style)
    static let trimHandleColor = Color(red: 1.0, green: 0.84, blue: 0.0) // Golden yellow
}

// MARK: - Preview

#Preview("Video Trim View") {
    VideoTrimView(
        videoURL: URL(fileURLWithPath: "/tmp/sample_video.mp4"),
        onTrimComplete: { url in
            print("Trim complete: \(url)")
        },
        onCancel: {
            print("Trim cancelled")
        }
    )
}

#Preview("Video Trim View - Dark") {
    VideoTrimView(
        videoURL: URL(fileURLWithPath: "/tmp/sample_video.mp4"),
        onTrimComplete: { _ in },
        onCancel: {}
    )
    .preferredColorScheme(.dark)
}
