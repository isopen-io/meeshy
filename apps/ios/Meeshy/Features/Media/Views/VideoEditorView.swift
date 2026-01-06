//
//  VideoEditorView.swift
//  Meeshy
//
//  Unified video editor with full-screen preview and overlay controls.
//  Merges functionality from VideoEditorView, VideoPreviewView, and VideoTrimView.
//
//  Features:
//  - Full-screen video preview with real-time playback
//  - Inline trim timeline with draggable handles
//  - Mute/unmute toggle
//  - Video filters with real-time preview
//  - Quality selection with live preview
//  - File size estimation
//  - Compression with progress indicator
//
//  iOS 16+
//

import SwiftUI
import AVFoundation
import AVKit
import CoreImage
import CoreImage.CIFilterBuiltins

// MARK: - Video Editor View

struct VideoEditorView: View {
    // MARK: - Properties

    let videoURL: URL
    let onConfirm: (URL, Bool) -> Void  // (finalURL, isMuted)
    let onCancel: () -> Void
    let onRetake: (() -> Void)?

    @StateObject private var viewModel: UnifiedVideoEditorViewModel
    @Environment(\.dismiss) private var dismiss

    // UI State
    @State private var showFiltersPanel = false
    @State private var showQualityPanel = false
    @State private var activeControl: ActiveControl = .none

    enum ActiveControl {
        case none
        case trim
        case filters
        case quality
    }

    // MARK: - Constants

    private let timelineHeight: CGFloat = 60
    private let handleWidth: CGFloat = 16
    private let controlBarHeight: CGFloat = 100

    // MARK: - Init

    init(
        videoURL: URL,
        onConfirm: @escaping (URL, Bool) -> Void,
        onCancel: @escaping () -> Void,
        onRetake: (() -> Void)? = nil
    ) {
        self.videoURL = videoURL
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        self.onRetake = onRetake
        self._viewModel = StateObject(wrappedValue: UnifiedVideoEditorViewModel(url: videoURL))
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            // Full-screen video background
            Color.black.ignoresSafeArea()

            // Video player (full screen)
            videoPlayerLayer
                .ignoresSafeArea()
                .onTapGesture {
                    viewModel.togglePlayPause()
                }

            // Overlay controls
            VStack(spacing: 0) {
                // Top bar overlay
                topBarOverlay

                Spacer()

                // Play/Pause indicator
                if viewModel.isPaused {
                    playPauseIndicator
                }

                Spacer()

                // Bottom controls area
                VStack(spacing: 0) {
                    // Progress bar
                    progressBar
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)

                    // Trim timeline (always visible when editing)
                    if activeControl == .trim {
                        trimTimelineSection
                            .padding(.horizontal, 16)
                            .padding(.bottom, 12)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Filter selector
                    if activeControl == .filters {
                        filterSelectorPanel
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Quality selector
                    if activeControl == .quality {
                        qualitySelectorPanel
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Control bar
                    controlBar
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)

                    // Action buttons
                    actionButtonsBar
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                }
                .background(
                    LinearGradient(
                        colors: [Color.clear, Color.black.opacity(0.8), Color.black],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .ignoresSafeArea(edges: .bottom)
                )
            }

            // Loading overlay
            if viewModel.isLoading {
                loadingOverlay
            }

            // Processing overlay
            if viewModel.isProcessing {
                processingOverlay
            }
        }
        .animation(.easeInOut(duration: 0.25), value: activeControl)
        .animation(.easeInOut(duration: 0.2), value: viewModel.isPaused)
        .statusBarHidden(true)
        .sheet(isPresented: $showQualityPanel) {
            qualitySelectionSheet
        }
        .onAppear {
            viewModel.loadVideo()
        }
        .onDisappear {
            viewModel.cleanup()
        }
    }

    // MARK: - Video Player Layer

    private var videoPlayerLayer: some View {
        Group {
            if let player = viewModel.player {
                UnifiedVideoPlayerLayer(player: player)
            } else {
                Color.black
            }
        }
    }

    // MARK: - Top Bar Overlay

    private var topBarOverlay: some View {
        HStack {
            // Cancel button
            Button {
                viewModel.cleanup()
                onCancel()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }

            Spacer()

            // Video info
            VStack(spacing: 2) {
                Text(viewModel.durationFormatted)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)

                if viewModel.isTrimmed {
                    Text("Réduit")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.yellow)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.black.opacity(0.5)))

            Spacer()

            // Mute button
            Button {
                viewModel.toggleMute()
            } label: {
                Image(systemName: viewModel.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(viewModel.isMuted ? Color.red.opacity(0.7) : Color.black.opacity(0.5)))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Play/Pause Indicator

    private var playPauseIndicator: some View {
        Image(systemName: "play.circle.fill")
            .font(.system(size: 72))
            .foregroundColor(.white.opacity(0.8))
            .shadow(color: .black.opacity(0.5), radius: 10)
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                // Background track
                Capsule()
                    .fill(Color.white.opacity(0.3))
                    .frame(height: 4)

                // Progress
                Capsule()
                    .fill(Color.yellow)
                    .frame(width: geometry.size.width * viewModel.playbackProgress, height: 4)
            }
        }
        .frame(height: 4)
    }

    // MARK: - Trim Timeline Section

    private var trimTimelineSection: some View {
        VStack(spacing: 8) {
            // Duration info
            HStack {
                Text(viewModel.startTimeFormatted)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.yellow)

                Spacer()

                Text(viewModel.selectedDurationFormatted)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                Text(viewModel.endTimeFormatted)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.yellow)
            }

            // Timeline with handles
            GeometryReader { geometry in
                let availableWidth = geometry.size.width - (handleWidth * 2)

                ZStack(alignment: .leading) {
                    // Thumbnails
                    thumbnailsView(width: geometry.size.width)

                    // Dimmed regions
                    Rectangle()
                        .fill(Color.black.opacity(0.7))
                        .frame(width: max(0, viewModel.startHandlePosition * availableWidth + handleWidth))

                    Rectangle()
                        .fill(Color.black.opacity(0.7))
                        .frame(width: max(0, (1 - viewModel.endHandlePosition) * availableWidth + handleWidth))
                        .offset(x: viewModel.endHandlePosition * availableWidth + handleWidth)

                    // Selected region borders
                    selectedRegionBorders(availableWidth: availableWidth)

                    // Start handle
                    trimHandle(isStart: true)
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
                    trimHandle(isStart: false)
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

                    // Playhead
                    playheadIndicator(availableWidth: availableWidth)
                }
                .frame(height: timelineHeight)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .frame(height: timelineHeight)
        }
    }

    private func thumbnailsView(width: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(viewModel.thumbnails.enumerated()), id: \.offset) { _, image in
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

    private func trimHandle(isStart: Bool) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.yellow)
                .frame(width: handleWidth, height: timelineHeight)

            VStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color.black.opacity(0.4))
                        .frame(width: 3, height: 10)
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
            Rectangle()
                .fill(Color.yellow)
                .frame(width: max(0, selectedWidth), height: 3)
                .offset(x: startX, y: 0)

            Rectangle()
                .fill(Color.yellow)
                .frame(width: max(0, selectedWidth), height: 3)
                .offset(x: startX, y: timelineHeight - 3)
        }
    }

    private func playheadIndicator(availableWidth: CGFloat) -> some View {
        let startX = viewModel.startHandlePosition * availableWidth + handleWidth
        let endX = viewModel.endHandlePosition * availableWidth + handleWidth
        let selectedWidth = endX - startX

        return Rectangle()
            .fill(Color.white)
            .frame(width: 2, height: timelineHeight)
            .offset(x: startX + (viewModel.playheadPosition * selectedWidth) - 1)
            .shadow(color: .black.opacity(0.5), radius: 2)
    }

    // MARK: - Filter Selector Panel

    private var filterSelectorPanel: some View {
        VStack(spacing: 12) {
            Text(viewModel.selectedFilter.rawValue)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(VideoFilter.allCases, id: \.self) { filter in
                        VideoFilterThumbnail(
                            filter: filter,
                            thumbnail: viewModel.thumbnail,
                            isSelected: viewModel.selectedFilter == filter
                        ) {
                            viewModel.applyFilter(filter)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .padding(.vertical, 12)
    }

    // MARK: - Quality Selector Panel

    private var qualitySelectorPanel: some View {
        VStack(spacing: 12) {
            Text("Qualité")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white)

            HStack(spacing: 12) {
                ForEach(VideoEditorQuality.allCases, id: \.self) { quality in
                    Button {
                        viewModel.selectedQuality = quality
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    } label: {
                        VStack(spacing: 4) {
                            Text(quality.shortName)
                                .font(.system(size: 16, weight: .semibold))
                            Text(viewModel.estimatedSizeFormatted(for: quality))
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.7))
                        }
                        .foregroundColor(viewModel.selectedQuality == quality ? .black : .white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(viewModel.selectedQuality == quality ? Color.yellow : Color.white.opacity(0.15))
                        )
                    }
                }
            }
            .padding(.horizontal, 16)

            // File size info
            HStack(spacing: 8) {
                Text("Original:")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.6))
                Text(viewModel.originalFileSizeFormatted)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white)

                Image(systemName: "arrow.right")
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(0.5))

                Text("Compressé:")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.6))
                Text(viewModel.estimatedFileSizeFormatted)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.yellow)
            }
        }
        .padding(.vertical, 12)
    }

    // MARK: - Control Bar

    private var controlBar: some View {
        HStack(spacing: 0) {
            // Trim button
            ControlBarButton(
                icon: "scissors",
                title: "Réduire",
                isSelected: activeControl == .trim
            ) {
                activeControl = activeControl == .trim ? .none : .trim
            }

            // Filters button
            ControlBarButton(
                icon: "wand.and.stars",
                title: "Filtres",
                isSelected: activeControl == .filters
            ) {
                activeControl = activeControl == .filters ? .none : .filters
            }

            // Quality button
            ControlBarButton(
                icon: "slider.horizontal.3",
                title: viewModel.selectedQuality.shortName,
                isSelected: activeControl == .quality
            ) {
                activeControl = activeControl == .quality ? .none : .quality
            }
        }
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.3))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Action Buttons Bar

    private var actionButtonsBar: some View {
        HStack(spacing: 16) {
            // Retake button (if available)
            if let onRetake = onRetake {
                Button {
                    viewModel.cleanup()
                    onRetake()
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 22))
                        Text("Reprendre")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.white.opacity(0.15))
                    )
                }
            }

            // Confirm button
            Button {
                confirmVideo()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .semibold))
                    Text("Ajouter")
                        .font(.system(size: 17, weight: .semibold))
                }
                .foregroundColor(.black)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.yellow)
                )
            }
            .disabled(viewModel.isLoading || viewModel.isProcessing)
        }
    }

    // MARK: - Quality Selection Sheet

    private var qualitySelectionSheet: some View {
        NavigationView {
            List {
                ForEach(VideoEditorQuality.allCases, id: \.self) { quality in
                    Button {
                        viewModel.selectedQuality = quality
                        showQualityPanel = false
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(quality.displayName)
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(.primary)

                                Text(quality.description)
                                    .font(.system(size: 13))
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            if viewModel.selectedQuality == quality {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.blue)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("Qualité")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("OK") {
                        showQualityPanel = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Overlays

    private var loadingOverlay: some View {
        ZStack {
            Color.black.opacity(0.7).ignoresSafeArea()

            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.white)

                Text("Chargement...")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
            }
        }
    }

    private var processingOverlay: some View {
        ZStack {
            Color.black.opacity(0.8).ignoresSafeArea()

            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.2), lineWidth: 6)
                        .frame(width: 80, height: 80)

                    Circle()
                        .trim(from: 0, to: viewModel.processingProgress)
                        .stroke(Color.yellow, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .frame(width: 80, height: 80)
                        .rotationEffect(.degrees(-90))

                    Text("\(Int(viewModel.processingProgress * 100))%")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                }

                Text("Traitement de la vidéo...")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: - Actions

    private func confirmVideo() {
        Task {
            let finalURL = await viewModel.processAndExport()
            await MainActor.run {
                onConfirm(finalURL, viewModel.isMuted)
            }
        }
    }
}

// MARK: - Control Bar Button

private struct ControlBarButton: View {
    let icon: String
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        }) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                Text(title)
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundColor(isSelected ? .yellow : .white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
        }
    }
}

// MARK: - Unified Video Editor ViewModel

@MainActor
final class UnifiedVideoEditorViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published private(set) var isLoading = true
    @Published private(set) var isProcessing = false
    @Published private(set) var processingProgress: Double = 0
    @Published private(set) var isPaused = true
    @Published private(set) var isMuted = false
    @Published private(set) var playbackProgress: Double = 0
    @Published private(set) var currentTime: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var isTrimmed = false
    @Published private(set) var thumbnail: UIImage?
    @Published private(set) var thumbnails: [UIImage] = []
    @Published var selectedQuality: VideoEditorQuality = .medium
    @Published private(set) var selectedFilter: VideoFilter = .original

    // Trim state
    @Published private(set) var startHandlePosition: Double = 0.0
    @Published private(set) var endHandlePosition: Double = 1.0
    @Published private(set) var playheadPosition: Double = 0.0

    // File size
    @Published private(set) var originalFileSize: Int64 = 0

    private(set) var player: AVPlayer?
    private(set) var currentVideoURL: URL

    // MARK: - Private Properties

    private let originalURL: URL
    private var timeObserver: Any?
    private var loopObserver: NSObjectProtocol?
    private let minimumTrimDuration: Double = 1.0
    private let thumbnailCount: Int = 12

    private let feedbackGenerator = UIImpactFeedbackGenerator(style: .medium)
    private let selectionFeedbackGenerator = UISelectionFeedbackGenerator()

    // MARK: - Computed Properties

    var durationFormatted: String {
        formatTime(duration)
    }

    var currentTimeFormatted: String {
        formatTime(currentTime)
    }

    var startTimeFormatted: String {
        formatTime(startHandlePosition * duration)
    }

    var endTimeFormatted: String {
        formatTime(endHandlePosition * duration)
    }

    var selectedDurationFormatted: String {
        let selectedDuration = (endHandlePosition - startHandlePosition) * duration
        return formatTime(selectedDuration)
    }

    var originalFileSizeFormatted: String {
        ByteCountFormatter.string(fromByteCount: originalFileSize, countStyle: .file)
    }

    var estimatedFileSizeFormatted: String {
        let estimatedSize = estimateFileSize()
        return ByteCountFormatter.string(fromByteCount: estimatedSize, countStyle: .file)
    }

    func estimatedSizeFormatted(for quality: VideoEditorQuality) -> String {
        let size = estimateFileSize(for: quality)
        return ByteCountFormatter.string(fromByteCount: size, countStyle: .file)
    }

    private var startTime: CMTime {
        CMTime(seconds: startHandlePosition * duration, preferredTimescale: 600)
    }

    private var endTime: CMTime {
        CMTime(seconds: endHandlePosition * duration, preferredTimescale: 600)
    }

    // MARK: - Init

    init(url: URL) {
        self.originalURL = url
        self.currentVideoURL = url
        feedbackGenerator.prepare()
        selectionFeedbackGenerator.prepare()
    }

    // MARK: - Setup

    @MainActor
    func loadVideo() {
        isLoading = true

        Task { @MainActor in
            do {
                guard FileManager.default.fileExists(atPath: currentVideoURL.path) else {
                    mediaLogger.error("[VideoEditor] Video file does not exist at: \(currentVideoURL.path)")
                    isLoading = false
                    return
                }

                // Extract metadata on background thread
                let metadata = try await VideoCompressor.extractMetadata(currentVideoURL)

                // Update UI properties on main thread
                duration = metadata.duration
                originalFileSize = metadata.fileSize

                // Generate thumbnail
                if let thumb = try? await VideoCompressor.generateThumbnail(currentVideoURL, at: .zero) {
                    thumbnail = thumb
                }

                // Generate timeline thumbnails
                await generateThumbnails()

                // Setup player (must be on main thread)
                setupPlayer()

                isLoading = false

            } catch {
                mediaLogger.error("[VideoEditor] Failed to load video: \(error.localizedDescription)")
                isLoading = false
            }
        }
    }

    private func generateThumbnails() async {
        do {
            let images = try await VideoCompressor.generateThumbnails(currentVideoURL, count: thumbnailCount)
            thumbnails = images
            mediaLogger.info("[VideoEditor] Generated \(images.count) thumbnails")
        } catch {
            mediaLogger.error("[VideoEditor] Failed to generate thumbnails: \(error.localizedDescription)")
        }
    }

    private func setupPlayer() {
        let playerItem = AVPlayerItem(url: currentVideoURL)
        player = AVPlayer(playerItem: playerItem)
        player?.isMuted = isMuted

        // Time observer - runs on main queue
        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            // Since class is @MainActor and queue is .main, we can directly call
            Task { @MainActor [weak self] in
                self?.updatePlayback(currentTime: time)
            }
        }

        // Loop observer - runs on main queue
        loopObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player?.currentItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.loopToStart()
            }
        }

        isPaused = true
        mediaLogger.info("[VideoEditor] Player setup complete")
    }

    private func updatePlayback(currentTime time: CMTime) {
        let seconds = CMTimeGetSeconds(time)
        self.currentTime = seconds

        if duration > 0 {
            playbackProgress = seconds / duration
        }

        // Update playhead position within trim range
        let startSeconds = startHandlePosition * duration
        let endSeconds = endHandlePosition * duration
        let selectedDuration = endSeconds - startSeconds

        guard selectedDuration > 0 else {
            playheadPosition = 0
            return
        }

        if seconds >= endSeconds {
            loopToStart()
            return
        }

        let positionInRange = (seconds - startSeconds) / selectedDuration
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
            let currentSeconds = CMTimeGetSeconds(player?.currentTime() ?? .zero)
            let endSeconds = endHandlePosition * duration

            if currentSeconds >= endSeconds - 0.1 {
                player?.seek(to: startTime, toleranceBefore: .zero, toleranceAfter: .zero)
            }

            player?.play()
            isPaused = false
        } else {
            player?.pause()
            isPaused = true
        }
    }

    func toggleMute() {
        isMuted.toggle()
        player?.isMuted = isMuted
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    func applyFilter(_ filter: VideoFilter) {
        selectedFilter = filter
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    // MARK: - Trim Handle Updates

    func updateStartPosition(_ position: Double) {
        let clampedPosition = max(0, min(position, endHandlePosition - (minimumTrimDuration / duration)))

        if clampedPosition <= 0 && startHandlePosition > 0 {
            feedbackGenerator.impactOccurred()
        } else if clampedPosition >= endHandlePosition - (minimumTrimDuration / duration) &&
                  startHandlePosition < endHandlePosition - (minimumTrimDuration / duration) {
            feedbackGenerator.impactOccurred()
        }

        if abs(clampedPosition - startHandlePosition) > 0.01 {
            selectionFeedbackGenerator.selectionChanged()
        }

        startHandlePosition = clampedPosition
        isTrimmed = (startHandlePosition > 0 || endHandlePosition < 1.0)

        let newStartTime = CMTime(seconds: startHandlePosition * duration, preferredTimescale: 600)
        player?.seek(to: newStartTime, toleranceBefore: .zero, toleranceAfter: .zero)

        if !isPaused {
            player?.pause()
            isPaused = true
        }
    }

    func updateEndPosition(_ position: Double) {
        let clampedPosition = max(startHandlePosition + (minimumTrimDuration / duration), min(position, 1.0))

        if clampedPosition >= 1.0 && endHandlePosition < 1.0 {
            feedbackGenerator.impactOccurred()
        } else if clampedPosition <= startHandlePosition + (minimumTrimDuration / duration) &&
                  endHandlePosition > startHandlePosition + (minimumTrimDuration / duration) {
            feedbackGenerator.impactOccurred()
        }

        if abs(clampedPosition - endHandlePosition) > 0.01 {
            selectionFeedbackGenerator.selectionChanged()
        }

        endHandlePosition = clampedPosition
        isTrimmed = (startHandlePosition > 0 || endHandlePosition < 1.0)

        if !isPaused {
            player?.pause()
            isPaused = true
        }
    }

    func finalizeTrimRange() {
        player?.seek(to: startTime, toleranceBefore: .zero, toleranceAfter: .zero)
        playheadPosition = 0
    }

    // MARK: - Export

    func processAndExport() async -> URL {
        await MainActor.run {
            isProcessing = true
            processingProgress = 0
            player?.pause()
            isPaused = true
        }

        do {
            var outputURL = currentVideoURL

            // Trim if needed
            if startHandlePosition > 0 || endHandlePosition < 1.0 {
                await MainActor.run { processingProgress = 0.1 }

                let trimmedURL = try await VideoCompressor.trim(
                    outputURL,
                    start: startTime,
                    end: endTime,
                    quality: selectedQuality.compressorQuality
                )

                outputURL = trimmedURL
                mediaLogger.info("[VideoEditor] Video trimmed successfully")
            }

            await MainActor.run { processingProgress = 0.3 }

            // Apply filter if needed
            if selectedFilter != .original {
                let filteredURL = try await applyFilterToVideo(
                    sourceURL: outputURL,
                    filter: selectedFilter
                ) { progress in
                    Task { @MainActor in
                        self.processingProgress = 0.3 + (progress * 0.3)
                    }
                }

                outputURL = filteredURL
                mediaLogger.info("[VideoEditor] Filter '\(selectedFilter.rawValue)' applied successfully")
            }

            await MainActor.run { processingProgress = 0.6 }

            // Compress with selected quality
            let compressedURL = try await VideoCompressor.compress(
                outputURL,
                quality: selectedQuality.compressorQuality
            ) { progress in
                Task { @MainActor in
                    self.processingProgress = 0.6 + (progress * 0.4)
                }
            }

            await MainActor.run {
                processingProgress = 1.0
                isProcessing = false
            }

            return compressedURL

        } catch {
            mediaLogger.error("[VideoEditor] Export failed: \(error.localizedDescription)")
            await MainActor.run {
                isProcessing = false
            }
            return currentVideoURL
        }
    }

    private func applyFilterToVideo(
        sourceURL: URL,
        filter: VideoFilter,
        progressHandler: @escaping (Double) -> Void
    ) async throws -> URL {
        guard let filterName = filter.ciFilterName else {
            return sourceURL
        }

        let asset = AVURLAsset(url: sourceURL)

        async let tracksLoad = asset.loadTracks(withMediaType: .video)
        async let durationLoad = asset.load(.duration)

        let (tracks, _) = try await (tracksLoad, durationLoad)

        guard let videoTrack = tracks.first else {
            throw NSError(domain: "VideoEditor", code: 1, userInfo: [NSLocalizedDescriptionKey: "No video track found"])
        }

        let naturalSize = try await videoTrack.load(.naturalSize)
        let preferredTransform = try await videoTrack.load(.preferredTransform)

        var renderSize = naturalSize
        let isPortrait = preferredTransform.a == 0 && preferredTransform.d == 0
        if isPortrait {
            renderSize = CGSize(width: naturalSize.height, height: naturalSize.width)
        }

        let composition = AVMutableVideoComposition(asset: asset) { request in
            let sourceImage = request.sourceImage.clampedToExtent()

            guard let ciFilter = CIFilter(name: filterName) else {
                request.finish(with: sourceImage, context: nil)
                return
            }

            ciFilter.setValue(sourceImage, forKey: kCIInputImageKey)

            if filter == .vivid {
                ciFilter.setValue(0.5, forKey: "inputAmount")
            }

            if let outputImage = ciFilter.outputImage?.cropped(to: request.sourceImage.extent) {
                request.finish(with: outputImage, context: nil)
            } else {
                request.finish(with: sourceImage, context: nil)
            }
        }

        composition.renderSize = renderSize
        composition.frameDuration = CMTime(value: 1, timescale: 30)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("filtered_\(UUID().uuidString)")
            .appendingPathExtension("mp4")

        guard let exportSession = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw NSError(domain: "VideoEditor", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create export session"])
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.videoComposition = composition
        exportSession.shouldOptimizeForNetworkUse = true

        let progressTimer = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 100_000_000)
                let progress = Double(exportSession.progress)
                progressHandler(progress)
            }
        }

        await exportSession.export()

        progressTimer.cancel()

        switch exportSession.status {
        case .completed:
            progressHandler(1.0)
            return outputURL

        case .failed:
            let error = exportSession.error ?? NSError(domain: "VideoEditor", code: 3, userInfo: [NSLocalizedDescriptionKey: "Export failed"])
            throw error

        case .cancelled:
            throw NSError(domain: "VideoEditor", code: 4, userInfo: [NSLocalizedDescriptionKey: "Export cancelled"])

        default:
            throw NSError(domain: "VideoEditor", code: 5, userInfo: [NSLocalizedDescriptionKey: "Unknown export status"])
        }
    }

    private func estimateFileSize() -> Int64 {
        estimateFileSize(for: selectedQuality)
    }

    private func estimateFileSize(for quality: VideoEditorQuality) -> Int64 {
        let selectedDuration = (endHandlePosition - startHandlePosition) * duration
        let bitrateKbps: Double
        switch quality {
        case .low: bitrateKbps = 1000
        case .medium: bitrateKbps = 2500
        case .high: bitrateKbps = 5000
        }

        let estimatedBytes = (bitrateKbps * 1000 / 8) * selectedDuration
        return Int64(estimatedBytes)
    }

    // MARK: - Cleanup

    func cleanup() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }

        if let observer = loopObserver {
            NotificationCenter.default.removeObserver(observer)
            loopObserver = nil
        }

        player?.pause()
        player = nil
        thumbnails = []
    }

    // MARK: - Helpers

    private func formatTime(_ time: Double) -> String {
        guard time.isFinite && time >= 0 else { return "0:00" }

        let totalSeconds = Int(time)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60

        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Video Editor Quality Enum

enum VideoEditorQuality: CaseIterable {
    case low
    case medium
    case high

    var displayName: String {
        switch self {
        case .low: return "Basse"
        case .medium: return "Moyenne"
        case .high: return "Haute"
        }
    }

    var shortName: String {
        switch self {
        case .low: return "480p"
        case .medium: return "720p"
        case .high: return "1080p"
        }
    }

    var description: String {
        switch self {
        case .low: return "480p - Fichier plus petit, qualité réduite"
        case .medium: return "720p - Bon équilibre taille/qualité"
        case .high: return "1080p - Meilleure qualité, fichier plus grand"
        }
    }

    var compressorQuality: VideoQuality {
        switch self {
        case .low: return .low
        case .medium: return .medium
        case .high: return .high
        }
    }
}

// MARK: - Video Filter Thumbnail (uses VideoFilter typealias from MediaFilter.swift)

struct VideoFilterThumbnail: View {
    let filter: VideoFilter
    let thumbnail: UIImage?
    let isSelected: Bool
    let action: () -> Void

    @State private var filteredImage: UIImage?

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    if let image = filteredImage ?? thumbnail {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 70, height: 70)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    } else {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: 70, height: 70)
                    }

                    if isSelected {
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.yellow, lineWidth: 3)
                            .frame(width: 70, height: 70)
                    }
                }

                Text(filter.rawValue)
                    .font(.system(size: 11, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? .yellow : .white)
            }
        }
        .task {
            await generateFilteredThumbnail()
        }
    }

    private func generateFilteredThumbnail() async {
        guard let thumbnail = thumbnail,
              filter != .original,
              let filterName = filter.ciFilterName else {
            return
        }

        guard let ciImage = CIImage(image: thumbnail),
              let ciFilter = CIFilter(name: filterName) else {
            return
        }

        ciFilter.setValue(ciImage, forKey: kCIInputImageKey)

        if filter == .vivid {
            ciFilter.setValue(0.5, forKey: "inputAmount")
        }

        guard let output = ciFilter.outputImage else { return }

        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let cgImage = context.createCGImage(output, from: output.extent) else { return }

        await MainActor.run {
            filteredImage = UIImage(cgImage: cgImage)
        }
    }
}

// MARK: - Unified Video Player Layer

struct UnifiedVideoPlayerLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> UIView {
        let view = VideoPlayerContainerView()
        view.backgroundColor = .black

        let playerLayer = AVPlayerLayer(player: player)
        playerLayer.videoGravity = .resizeAspect
        view.playerLayer = playerLayer
        view.layer.addSublayer(playerLayer)

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        if let containerView = uiView as? VideoPlayerContainerView {
            containerView.playerLayer?.player = player
        }
    }

    private class VideoPlayerContainerView: UIView {
        var playerLayer: AVPlayerLayer?

        override func layoutSubviews() {
            super.layoutSubviews()
            playerLayer?.frame = bounds
        }
    }
}

// MARK: - Preview

#Preview("Unified Video Editor") {
    VideoEditorView(
        videoURL: URL(fileURLWithPath: "/tmp/sample.mp4"),
        onConfirm: { _, _ in },
        onCancel: {},
        onRetake: {}
    )
}
