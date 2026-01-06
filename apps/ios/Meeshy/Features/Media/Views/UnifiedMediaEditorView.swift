//
//  UnifiedMediaEditorView.swift
//  Meeshy
//
//  Unified editor view for both photos and videos.
//  Automatically adapts UI based on media type.
//  Replaces separate ImageEditorView and VideoEditorView in capture flow.
//
//  Features:
//  - Photo: Filters, crop, rotation
//  - Video: Trim, filters, audio effects, quality
//  - Shared: Retake, confirm, cancel
//
//  iOS 16+
//

import SwiftUI
import AVFoundation
import AVKit
import CoreImage
import CoreImage.CIFilterBuiltins

// MARK: - Media Type

enum CapturedMediaType: Equatable {
    case photo(UIImage)
    case video(URL)

    static func == (lhs: CapturedMediaType, rhs: CapturedMediaType) -> Bool {
        switch (lhs, rhs) {
        case (.photo(let img1), .photo(let img2)):
            // Compare by image reference (pointer equality)
            return img1 === img2
        case (.video(let url1), .video(let url2)):
            return url1 == url2
        default:
            return false
        }
    }
}

// MARK: - Capture Info (passed from CameraView)

struct CaptureInfo: Equatable {
    let media: CapturedMediaType
    let selectedFilter: VideoFilter
    let selectedAudioEffect: AudioEffectType

    var isPhoto: Bool {
        if case .photo = media { return true }
        return false
    }

    var isVideo: Bool {
        if case .video = media { return true }
        return false
    }
}

// MARK: - Unified Media Editor View

struct UnifiedMediaEditorView: View {
    let captureInfo: CaptureInfo
    let onConfirm: (CapturedMediaType) -> Void
    let onCancel: () -> Void
    let onRetake: () -> Void

    // MARK: - State

    // Shared state
    @State private var selectedFilter: VideoFilter
    @State private var isProcessing = false
    @State private var processingProgress: Double = 0
    @State private var activePanel: ActivePanel = .none

    // Photo-specific state
    @State private var editedImage: UIImage?

    // Video-specific state
    @State private var videoViewModel: MediaEditorVideoViewModel?
    @State private var selectedAudioEffect: AudioEffectType
    @State private var isMuted = false
    @State private var trimStart: Double = 0
    @State private var trimEnd: Double = 1

    @Environment(\.dismiss) private var dismiss

    enum ActivePanel {
        case none
        case filters
        case audio
        case quality
    }

    // MARK: - Init

    init(
        captureInfo: CaptureInfo,
        onConfirm: @escaping (CapturedMediaType) -> Void,
        onCancel: @escaping () -> Void,
        onRetake: @escaping () -> Void
    ) {
        self.captureInfo = captureInfo
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        self.onRetake = onRetake

        self._selectedFilter = State(initialValue: captureInfo.selectedFilter)
        self._selectedAudioEffect = State(initialValue: captureInfo.selectedAudioEffect)

        // Initialize photo state
        if case .photo(let image) = captureInfo.media {
            self._editedImage = State(initialValue: image)
        }

        // Initialize video view model
        if case .video(let url) = captureInfo.media {
            self._videoViewModel = State(initialValue: MediaEditorVideoViewModel(url: url))
        }
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Content based on media type
            Group {
                switch captureInfo.media {
                case .photo(let image):
                    photoEditorContent(image: image)

                case .video(let url):
                    if let vm = videoViewModel {
                        videoEditorContent(url: url, viewModel: vm)
                    }
                }
            }

            // Top bar overlay
            VStack {
                topBar
                Spacer()
            }

            // Processing overlay
            if isProcessing {
                processingOverlay
            }
        }
        .statusBar(hidden: true)
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            Button {
                onCancel()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }

            Spacer()

            // Title
            Text(captureInfo.isPhoto ? "Photo" : "Video")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)

            Spacer()

            // Placeholder for symmetry
            Color.clear
                .frame(width: 40, height: 40)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Photo Editor Content

    private func photoEditorContent(image: UIImage) -> some View {
        VStack(spacing: 0) {
            Spacer()

            // Image preview with filter applied
            if let displayImage = applyFilterToImage(editedImage ?? image) {
                Image(uiImage: displayImage)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 20)
            }

            Spacer()

            // Filter panel
            if activePanel == .filters {
                filterSelectorPanel(thumbnail: image)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Control bar
            photoControlBar

            // Action buttons
            actionButtonsBar
        }
        .animation(.spring(response: 0.3), value: activePanel)
    }

    private var photoControlBar: some View {
        HStack(spacing: 24) {
            // Filter button
            Button {
                withAnimation {
                    activePanel = activePanel == .filters ? .none : .filters
                }
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "camera.filters")
                        .font(.system(size: 22))
                    Text("Filtres")
                        .font(.system(size: 11))
                }
                .foregroundColor(activePanel == .filters || selectedFilter != .original ? .yellow : .white)
            }
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(Color.black.opacity(0.5))
    }

    // MARK: - Video Editor Content

    private func videoEditorContent(url: URL, viewModel: MediaEditorVideoViewModel) -> some View {
        VStack(spacing: 0) {
            Spacer()

            // Video player
            VideoPlayer(player: viewModel.player)
                .aspectRatio(16/9, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 20)
                .onTapGesture {
                    viewModel.togglePlayPause()
                }

            Spacer()

            // Panels
            Group {
                if activePanel == .filters {
                    filterSelectorPanel(thumbnail: viewModel.thumbnail)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                if activePanel == .audio {
                    audioEffectPanel
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }

            // Control bar
            videoControlBar(viewModel: viewModel)

            // Action buttons
            actionButtonsBar
        }
        .animation(.spring(response: 0.3), value: activePanel)
        .onAppear {
            viewModel.player?.play()
        }
        .onDisappear {
            viewModel.cleanup()
        }
    }

    private func videoControlBar(viewModel: MediaEditorVideoViewModel) -> some View {
        HStack(spacing: 24) {
            // Mute button
            Button {
                isMuted.toggle()
                viewModel.player?.isMuted = isMuted
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 20))
                    Text(isMuted ? "Muet" : "Son")
                        .font(.system(size: 11))
                }
                .foregroundColor(isMuted ? .red : .white)
            }

            // Filter button
            Button {
                withAnimation {
                    activePanel = activePanel == .filters ? .none : .filters
                }
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "camera.filters")
                        .font(.system(size: 20))
                    Text("Filtres")
                        .font(.system(size: 11))
                }
                .foregroundColor(activePanel == .filters || selectedFilter != .original ? .yellow : .white)
            }

            // Audio effects button
            Button {
                withAnimation {
                    activePanel = activePanel == .audio ? .none : .audio
                }
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(.system(size: 20))
                    Text("Audio FX")
                        .font(.system(size: 11))
                }
                .foregroundColor(activePanel == .audio || selectedAudioEffect != .normal ? .yellow : .white)
            }
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(Color.black.opacity(0.5))
    }

    // MARK: - Filter Panel

    private func filterSelectorPanel(thumbnail: UIImage?) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text("Filtres")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                Text(selectedFilter.rawValue)
                    .font(.system(size: 12))
                    .foregroundColor(.yellow)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(VideoFilter.allCases, id: \.self) { filter in
                        CameraFilterThumbnail(
                            filter: filter,
                            thumbnail: thumbnail,
                            isSelected: selectedFilter == filter
                        ) {
                            selectedFilter = filter
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
            }
        }
        .background(Color.black.opacity(0.7))
    }

    // MARK: - Audio Effect Panel

    private var audioEffectPanel: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Effets audio")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                Text(audioEffectDisplayName)
                    .font(.system(size: 12))
                    .foregroundColor(.yellow)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(commonAudioEffects, id: \.self) { effect in
                        AudioEffectThumbnail(
                            effect: effect,
                            isSelected: selectedAudioEffect == effect
                        ) {
                            selectedAudioEffect = effect
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
            }
        }
        .background(Color.black.opacity(0.7))
    }

    private var commonAudioEffects: [AudioEffectType] {
        [.normal, .echo, .reverb, .robot, .chipmunk, .deep, .telephone, .stadium]
    }

    private var audioEffectDisplayName: String {
        switch selectedAudioEffect {
        case .normal: return "Normal"
        case .echo: return "Echo"
        case .reverb: return "Reverb"
        case .robot: return "Robot"
        case .chipmunk: return "Chipmunk"
        case .deep: return "Grave"
        case .telephone: return "Telephone"
        case .stadium: return "Stadium"
        default: return selectedAudioEffect.rawValue.capitalized
        }
    }

    // MARK: - Action Buttons

    private var actionButtonsBar: some View {
        HStack(spacing: 16) {
            // Retake button
            Button {
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

            // Confirm button
            Button {
                processAndConfirm()
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
            .disabled(isProcessing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.black.opacity(0.5))
    }

    // MARK: - Processing Overlay

    private var processingOverlay: some View {
        ZStack {
            Color.black.opacity(0.8)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.white)

                Text("Traitement en cours...")
                    .font(.headline)
                    .foregroundColor(.white)

                if processingProgress > 0 {
                    Text("\(Int(processingProgress * 100))%")
                        .font(.system(.body, design: .monospaced))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
        }
    }

    // MARK: - Processing

    private func processAndConfirm() {
        Task {
            isProcessing = true

            switch captureInfo.media {
            case .photo(let originalImage):
                // Apply filter to image
                if let finalImage = applyFilterToImage(originalImage) {
                    await MainActor.run {
                        isProcessing = false
                        onConfirm(.photo(finalImage))
                    }
                } else {
                    await MainActor.run {
                        isProcessing = false
                        onConfirm(.photo(originalImage))
                    }
                }

            case .video(let originalURL):
                // Process video with filter and audio effect
                do {
                    let processedURL = try await processVideo(url: originalURL)
                    await MainActor.run {
                        isProcessing = false
                        onConfirm(.video(processedURL))
                    }
                } catch {
                    mediaLogger.error("[UnifiedEditor] Video processing failed: \(error)")
                    await MainActor.run {
                        isProcessing = false
                        onConfirm(.video(originalURL))
                    }
                }
            }
        }
    }

    // MARK: - Filter Application

    private func applyFilterToImage(_ image: UIImage) -> UIImage? {
        guard selectedFilter != .original,
              let filterName = selectedFilter.ciFilterName,
              let ciImage = CIImage(image: image),
              let filter = CIFilter(name: filterName) else {
            return image
        }

        filter.setValue(ciImage, forKey: kCIInputImageKey)

        if selectedFilter == .vivid {
            filter.setValue(0.5, forKey: "inputAmount")
        }

        guard let output = filter.outputImage else { return image }

        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let cgImage = context.createCGImage(output, from: output.extent) else { return image }

        return UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
    }

    private func processVideo(url: URL) async throws -> URL {
        var currentURL = url

        // Step 1: Apply video filter if needed
        if selectedFilter != .original {
            processingProgress = 0.3
            currentURL = try await applyVideoFilter(to: currentURL)
        }

        // Step 2: Apply audio effect if needed
        if selectedAudioEffect != .normal {
            processingProgress = 0.6
            currentURL = try await applyAudioEffect(to: currentURL)
        }

        processingProgress = 1.0
        return currentURL
    }

    private func applyVideoFilter(to url: URL) async throws -> URL {
        guard let filterName = selectedFilter.ciFilterName else { return url }

        let asset = AVURLAsset(url: url)
        let tracks = try await asset.loadTracks(withMediaType: .video)

        guard let _ = tracks.first else {
            throw NSError(domain: "UnifiedEditor", code: 1, userInfo: [NSLocalizedDescriptionKey: "No video track found"])
        }

        let composition = AVMutableVideoComposition(asset: asset) { request in
            let sourceImage = request.sourceImage.clampedToExtent()

            guard let ciFilter = CIFilter(name: filterName) else {
                request.finish(with: sourceImage, context: nil)
                return
            }

            ciFilter.setValue(sourceImage, forKey: kCIInputImageKey)

            if self.selectedFilter == .vivid {
                ciFilter.setValue(0.5, forKey: "inputAmount")
            }

            if let outputImage = ciFilter.outputImage?.cropped(to: request.sourceImage.extent) {
                request.finish(with: outputImage, context: nil)
            } else {
                request.finish(with: sourceImage, context: nil)
            }
        }

        let naturalSize = try await tracks.first?.load(.naturalSize) ?? CGSize(width: 1920, height: 1080)
        composition.renderSize = naturalSize
        composition.frameDuration = CMTime(value: 1, timescale: 30)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("filtered_\(UUID().uuidString)")
            .appendingPathExtension("mp4")

        guard let exportSession = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw NSError(domain: "UnifiedEditor", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create export session"])
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.videoComposition = composition

        await exportSession.export()

        if exportSession.status == .completed {
            return outputURL
        } else {
            throw exportSession.error ?? NSError(domain: "UnifiedEditor", code: 3, userInfo: [NSLocalizedDescriptionKey: "Export failed"])
        }
    }

    private func applyAudioEffect(to url: URL) async throws -> URL {
        // Skip if normal effect
        guard selectedAudioEffect != .normal else { return url }

        let asset = AVAsset(url: url)

        // Check if video has audio track
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        guard !audioTracks.isEmpty else {
            // No audio track, return original
            return url
        }

        // Create output URL
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("audio_effected_\(UUID().uuidString).mp4")

        // Extract audio to temporary file
        let audioURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("temp_audio_\(UUID().uuidString).m4a")

        try await extractAudio(from: asset, to: audioURL)

        // Apply effect to audio
        let processedAudioURL = try await processAudioWithEffect(audioURL)

        // Merge processed audio with video
        try await mergeAudioWithVideo(
            videoAsset: asset,
            audioURL: processedAudioURL,
            outputURL: outputURL
        )

        // Cleanup temp files
        try? FileManager.default.removeItem(at: audioURL)
        try? FileManager.default.removeItem(at: processedAudioURL)

        return outputURL
    }

    private func extractAudio(from asset: AVAsset, to outputURL: URL) async throws {
        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            throw NSError(domain: "UnifiedEditor", code: 10, userInfo: [NSLocalizedDescriptionKey: "Cannot create audio export session"])
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .m4a

        await exportSession.export()

        if exportSession.status != .completed {
            throw exportSession.error ?? NSError(domain: "UnifiedEditor", code: 11, userInfo: [NSLocalizedDescriptionKey: "Audio extraction failed"])
        }
    }

    private func processAudioWithEffect(_ inputURL: URL) async throws -> URL {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("processed_\(UUID().uuidString).m4a")

        // Create audio engine and nodes
        let engine = AVAudioEngine()
        let playerNode = AVAudioPlayerNode()

        // Load source file
        let sourceFile = try AVAudioFile(forReading: inputURL)
        let format = sourceFile.processingFormat

        // Add player node
        engine.attach(playerNode)

        // Use centralized AudioEffectProcessor for effect chain
        _ = AudioEffectProcessor.shared.setupEffectChain(
            engine: engine,
            playerNode: playerNode,
            format: format,
            effectType: selectedAudioEffect
        )

        // Create output file
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount
        ]

        let outputFile = try AVAudioFile(
            forWriting: outputURL,
            settings: outputSettings
        )

        // Install tap to capture processed audio
        let bufferSize: AVAudioFrameCount = 4096
        engine.mainMixerNode.installTap(
            onBus: 0,
            bufferSize: bufferSize,
            format: format
        ) { buffer, _ in
            try? outputFile.write(from: buffer)
        }

        // Start engine
        try engine.start()

        // Schedule file and wait for completion using continuation
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            playerNode.scheduleFile(sourceFile, at: nil) {
                continuation.resume()
            }
            playerNode.play()
        }

        // Small delay to ensure final buffer is written
        try await Task.sleep(nanoseconds: 100_000_000) // 100ms

        // Stop and cleanup
        playerNode.stop()
        engine.mainMixerNode.removeTap(onBus: 0)
        engine.stop()

        return outputURL
    }

    private func mergeAudioWithVideo(videoAsset: AVAsset, audioURL: URL, outputURL: URL) async throws {
        let composition = AVMutableComposition()

        // Get video track
        let videoTracks = try await videoAsset.loadTracks(withMediaType: .video)
        guard let videoTrack = videoTracks.first else {
            throw NSError(domain: "UnifiedEditor", code: 12, userInfo: [NSLocalizedDescriptionKey: "No video track"])
        }

        let duration = try await videoAsset.load(.duration)

        // Add video track to composition
        guard let compositionVideoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw NSError(domain: "UnifiedEditor", code: 13, userInfo: [NSLocalizedDescriptionKey: "Cannot create video composition track"])
        }

        try compositionVideoTrack.insertTimeRange(
            CMTimeRange(start: .zero, duration: duration),
            of: videoTrack,
            at: .zero
        )

        // Add processed audio track
        let audioAsset = AVAsset(url: audioURL)
        let audioTracks = try await audioAsset.loadTracks(withMediaType: .audio)
        if let audioTrack = audioTracks.first {
            guard let compositionAudioTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else {
                throw NSError(domain: "UnifiedEditor", code: 14, userInfo: [NSLocalizedDescriptionKey: "Cannot create audio composition track"])
            }

            let audioDuration = try await audioAsset.load(.duration)
            let insertDuration = min(duration, audioDuration)

            try compositionAudioTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: insertDuration),
                of: audioTrack,
                at: .zero
            )
        }

        // Export
        guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            throw NSError(domain: "UnifiedEditor", code: 15, userInfo: [NSLocalizedDescriptionKey: "Cannot create export session"])
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4

        await exportSession.export()

        if exportSession.status != .completed {
            throw exportSession.error ?? NSError(domain: "UnifiedEditor", code: 16, userInfo: [NSLocalizedDescriptionKey: "Merge export failed"])
        }
    }
}

// MARK: - Media Editor Video ViewModel (Simplified)

@MainActor
class MediaEditorVideoViewModel: ObservableObject {
    @Published var player: AVPlayer?
    @Published var thumbnail: UIImage?
    @Published var duration: TimeInterval = 0
    @Published var isPaused = false

    private let url: URL

    init(url: URL) {
        self.url = url
        setupPlayer()
        generateThumbnail()
    }

    private func setupPlayer() {
        let playerItem = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: playerItem)
        player?.actionAtItemEnd = .none

        // Loop video
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            self?.player?.seek(to: .zero)
            self?.player?.play()
        }

        // Load duration
        Task {
            let asset = AVURLAsset(url: url)
            let loadedDuration = try? await asset.load(.duration)
            if let loadedDuration {
                duration = CMTimeGetSeconds(loadedDuration)
            }
        }
    }

    private func generateThumbnail() {
        Task {
            let asset = AVURLAsset(url: url)
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 200, height: 200)

            do {
                let cgImage = try generator.copyCGImage(at: .zero, actualTime: nil)
                thumbnail = UIImage(cgImage: cgImage)
            } catch {
                mediaLogger.error("[UnifiedVideoEditor] Failed to generate thumbnail: \(error)")
            }
        }
    }

    func togglePlayPause() {
        if isPaused {
            player?.play()
        } else {
            player?.pause()
        }
        isPaused.toggle()
    }

    func cleanup() {
        player?.pause()
        player = nil
    }
}

// MARK: - Preview

#if DEBUG
struct UnifiedMediaEditorView_Previews: PreviewProvider {
    static var previews: some View {
        UnifiedMediaEditorView(
            captureInfo: CaptureInfo(
                media: .photo(UIImage(systemName: "photo")!),
                selectedFilter: .original,
                selectedAudioEffect: .normal
            ),
            onConfirm: { _ in },
            onCancel: { },
            onRetake: { }
        )
    }
}
#endif
