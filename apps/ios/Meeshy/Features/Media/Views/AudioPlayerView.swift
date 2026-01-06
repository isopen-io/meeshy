//
//  AudioPlayerView.swift
//  Meeshy
//
//  Modern audio player with waveform visualization and seek controls
//  - Countdown timer (shows remaining time, decrements to zero)
//  - Settings icon to open fullscreen with download/share options
//  - Exclusive playback: starting new audio stops all others
//

import SwiftUI
import AVFoundation

struct AudioPlayerView: View {
    let url: URL
    var style: AudioPlayerStyle = .standard
    var attachment: MessageAttachment?  // Optional attachment for audio effects metadata
    var onOpenFullscreen: (() -> Void)?  // Callback to open fullscreen view

    @StateObject private var viewModel: AudioPlayerViewModel
    @StateObject private var transcriptionService = SimpleTranscriptionService()
    @State private var isDragging = false
    @State private var dragProgress: Double = 0

    // Transcription display state
    @State private var isTranscriptionExpanded = false

    init(url: URL, style: AudioPlayerStyle = .standard, attachment: MessageAttachment? = nil, onOpenFullscreen: (() -> Void)? = nil) {
        self.url = url
        self.style = style
        self.attachment = attachment
        self.onOpenFullscreen = onOpenFullscreen
        self._viewModel = StateObject(wrappedValue: AudioPlayerViewModel(url: url))
    }

    var body: some View {
        Group {
            switch style {
            case .standard:
                standardPlayerView
            case .compact:
                compactPlayerView
            case .expanded:
                expandedPlayerView
            }
        }
        .onAppear {
            viewModel.setupPlayer()
            // Auto-transcribe on appear
            Task {
                await transcriptionService.transcribe(url: url)
            }
        }
        .onDisappear {
            viewModel.cleanup()
        }
    }

    // MARK: - Standard Player

    private var standardPlayerView: some View {
        VStack(spacing: 16) {
            // Waveform with interactive scrubber
            InteractiveWaveformView(
                waveform: viewModel.waveform,
                progress: isDragging ? dragProgress : viewModel.progress,
                isPlaying: viewModel.isPlaying,
                onSeek: { progress in
                    viewModel.seek(to: progress)
                },
                onDragChanged: { progress in
                    isDragging = true
                    dragProgress = progress
                },
                onDragEnded: {
                    isDragging = false
                }
            )
            .frame(height: 48)

            // Controls row
            HStack(spacing: 20) {
                // Time elapsed (always with ms: mm:ss.ms or HH:mm:ss.ms)
                Text(timeString(from: viewModel.currentTime))
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(viewModel.isPlaying ? .meeshyPrimary : .secondary)
                    .frame(width: 65, alignment: .leading)

                Spacer()

                // Skip backward
                Button {
                    viewModel.skipBackward()
                    hapticFeedback(.light)
                } label: {
                    Image(systemName: "gobackward.10")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(.primary.opacity(0.8))
                }
                .buttonStyle(ScaleButtonStyle())

                // Play/Pause
                Button {
                    viewModel.togglePlayPause()
                    hapticFeedback(.medium)
                } label: {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [.meeshyPrimary, .meeshyPrimary.opacity(0.8)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 56, height: 56)
                            .shadow(color: .meeshyPrimary.opacity(0.3), radius: 8, y: 4)

                        Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundColor(.white)
                            .offset(x: viewModel.isPlaying ? 0 : 2)
                    }
                }
                .buttonStyle(ScaleButtonStyle())

                // Skip forward
                Button {
                    viewModel.skipForward()
                    hapticFeedback(.light)
                } label: {
                    Image(systemName: "goforward.10")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(.primary.opacity(0.8))
                }
                .buttonStyle(ScaleButtonStyle())

                Spacer()

                // Remaining time / Speed toggle
                VStack(alignment: .trailing, spacing: 2) {
                    // Remaining time (always shows: -mm:ss.ms or -HH:mm:ss.ms)
                    Text(remainingTimeString(from: viewModel.currentTime, total: viewModel.duration))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)

                    Button {
                        viewModel.cyclePlaybackSpeed()
                        hapticFeedback(.light)
                    } label: {
                        Text(speedLabel)
                            .font(.system(size: 10, weight: .semibold, design: .rounded))
                            .foregroundColor(.meeshyPrimary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(Color.meeshyPrimary.opacity(0.15))
                            )
                    }
                }
                .frame(width: 75, alignment: .trailing)
            }

            // Collapsible transcription
            if let text = transcriptionService.transcription, !text.isEmpty {
                collapsibleTranscriptionView(text: text)
            } else if transcriptionService.isTranscribing {
                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Transcription en cours...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.gray.opacity(0.1), lineWidth: 1)
        )
    }

    // MARK: - Compact Player (for message bubbles)

    private var compactPlayerView: some View {
        VStack(spacing: 6) {
            compactPlayerControls

            // Collapsible transcription display
            if let text = transcriptionService.transcription, !text.isEmpty {
                collapsibleTranscriptionView(text: text)
            } else if transcriptionService.isTranscribing {
                // Loading indicator
                HStack(spacing: 6) {
                    ProgressView()
                        .scaleEffect(0.6)
                    Text("Transcription...")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
        .clipped()
    }

    /// Collapsible transcription view - shows preview, tap to expand
    private func collapsibleTranscriptionView(text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            // Transcription text (collapsed or expanded)
            Text(text)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(isTranscriptionExpanded ? nil : 2)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Show expand/collapse button if text is long
            if text.count > 80 {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isTranscriptionExpanded.toggle()
                    }
                    hapticFeedback(.light)
                } label: {
                    HStack(spacing: 4) {
                        Text(isTranscriptionExpanded ? "Voir moins" : "Voir plus")
                            .font(.caption2.weight(.medium))
                        Image(systemName: isTranscriptionExpanded ? "chevron.up" : "chevron.down")
                            .font(.caption2)
                    }
                    .foregroundColor(.meeshyPrimary)
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 2)
    }

    private var compactPlayerControls: some View {
        HStack(spacing: 10) {
            // Play/Pause - fixed size
            Button {
                viewModel.togglePlayPause()
                hapticFeedback(.light)
            } label: {
                ZStack {
                    Circle()
                        .fill(Color.meeshyPrimary)
                        .frame(width: 36, height: 36)

                    Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .offset(x: viewModel.isPlaying ? 0 : 1)
                }
            }
            .buttonStyle(ScaleButtonStyle())
            .fixedSize()

            // Waveform and time - takes remaining space with constraints
            VStack(alignment: .leading, spacing: 4) {
                InteractiveWaveformView(
                    waveform: viewModel.waveform,
                    progress: isDragging ? dragProgress : viewModel.progress,
                    isPlaying: viewModel.isPlaying,
                    barSpacing: 2,
                    barWidth: 2,
                    onSeek: { progress in
                        viewModel.seek(to: progress)
                    },
                    onDragChanged: { progress in
                        isDragging = true
                        dragProgress = progress
                    },
                    onDragEnded: {
                        isDragging = false
                    }
                )
                .frame(height: 24)

                HStack(spacing: 4) {
                    // Countdown timer: shows remaining time, decrements to 0
                    Text(countdownTimeString(from: viewModel.currentTime, total: viewModel.duration))
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundColor(viewModel.isPlaying ? .meeshyPrimary : .secondary)
                        .fixedSize()

                    Spacer(minLength: 4)

                    if viewModel.playbackSpeed != 1.0 {
                        Text(speedLabel)
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.meeshyPrimary)
                            .fixedSize()
                    }

                    // Settings icon to open fullscreen
                    Button {
                        onOpenFullscreen?()
                        hapticFeedback(.light)
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(ScaleButtonStyle())
                    .fixedSize()
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity)
        }
    }

    // MARK: - Expanded Player (full screen or sheet)

    private var expandedPlayerView: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Top section: Waveform and controls
                expandedPlayerTopSection

                // Audio effects timeline (if present)
                if let effectsTimeline = attachment?.audioEffectsTimeline {
                    AudioEffectsTimelineView(
                        timeline: effectsTimeline,
                        audioDuration: viewModel.duration,
                        currentTime: viewModel.currentTime,
                        onSeek: { time in
                            let progress = viewModel.duration > 0 ? time / viewModel.duration : 0
                            viewModel.seek(to: progress)
                        }
                    )
                    .frame(minHeight: 300)
                }

                // Transcription section
                transcriptionSection
            }
            .padding(24)
        }
    }

    // MARK: - Transcription Section (for expanded player)

    private var transcriptionSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            Label("Transcription", systemImage: "text.bubble")
                .font(.headline)
                .foregroundColor(.primary)

            // Transcription content (auto-loaded)
            if let text = transcriptionService.transcription, !text.isEmpty {
                // Show full transcription with expand/collapse
                VStack(alignment: .leading, spacing: 8) {
                    Text(text)
                        .font(.body)
                        .foregroundColor(.primary)
                        .lineLimit(isTranscriptionExpanded ? nil : 4)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if text.count > 150 {
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                isTranscriptionExpanded.toggle()
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text(isTranscriptionExpanded ? "Voir moins" : "Voir le texte complet")
                                    .font(.subheadline.weight(.medium))
                                Image(systemName: isTranscriptionExpanded ? "chevron.up" : "chevron.down")
                                    .font(.caption)
                            }
                            .foregroundColor(.meeshyPrimary)
                        }
                    }

                    // Copy button
                    HStack {
                        Spacer()
                        Button {
                            UIPasteboard.general.string = text
                            hapticFeedback(.light)
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "doc.on.doc")
                                Text("Copier")
                            }
                            .font(.caption)
                            .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(.systemBackground))
                )
            } else if let error = transcriptionService.error {
                // Error state
                VStack(spacing: 12) {
                    Image(systemName: transcriptionService.requiresSettings ? "gear" : "exclamationmark.triangle")
                        .font(.system(size: 32))
                        .foregroundColor(transcriptionService.requiresSettings ? .blue : .orange)

                    Text(error)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)

                    if transcriptionService.requiresSettings {
                        // Open Settings button
                        Button {
                            if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(settingsURL)
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "gear")
                                Text("Ouvrir les Réglages")
                            }
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Color.blue)
                            .cornerRadius(20)
                        }
                    }

                    Button {
                        Task {
                            await transcriptionService.transcribe(url: url)
                        }
                    } label: {
                        Text("Réessayer")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.meeshyPrimary)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            } else if transcriptionService.isTranscribing {
                // Loading state
                VStack(spacing: 12) {
                    ProgressView()
                        .scaleEffect(1.2)

                    Text("Transcription en cours...")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            } else {
                // Not transcribed yet - show button to start
                VStack(spacing: 12) {
                    Image(systemName: "text.bubble")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)

                    Text("Aucune transcription disponible")
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    Button {
                        Task {
                            await transcriptionService.transcribe(url: url)
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "waveform")
                            Text("Transcrire l'audio")
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.meeshyPrimary)
                        .cornerRadius(20)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
    }

    private var expandedPlayerTopSection: some View {
        VStack(spacing: 32) {
            // Large waveform visualization
            ZStack {
                // Background glow
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                .meeshyPrimary.opacity(viewModel.isPlaying ? 0.2 : 0.1),
                                .clear
                            ],
                            center: .center,
                            startRadius: 50,
                            endRadius: 150
                        )
                    )
                    .frame(width: 300, height: 300)
                    .blur(radius: 40)
                    .animation(.easeInOut(duration: 0.5), value: viewModel.isPlaying)

                // Circular waveform
                CircularWaveformView(
                    waveform: viewModel.waveform,
                    progress: viewModel.progress,
                    isPlaying: viewModel.isPlaying
                )
                .frame(width: 200, height: 200)
            }

            // Progress slider
            VStack(spacing: 8) {
                InteractiveWaveformView(
                    waveform: viewModel.waveform,
                    progress: isDragging ? dragProgress : viewModel.progress,
                    isPlaying: viewModel.isPlaying,
                    onSeek: { progress in
                        viewModel.seek(to: progress)
                    },
                    onDragChanged: { progress in
                        isDragging = true
                        dragProgress = progress
                    },
                    onDragEnded: {
                        isDragging = false
                    }
                )
                .frame(height: 40)

                HStack {
                    // Elapsed time (always with ms: mm:ss.ms or HH:mm:ss.ms)
                    Text(timeString(from: viewModel.currentTime))
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundColor(viewModel.isPlaying ? .meeshyPrimary : .secondary)

                    Spacer()

                    // Remaining time (always with ms: -mm:ss.ms or -HH:mm:ss.ms)
                    Text(remainingTimeString(from: viewModel.currentTime, total: viewModel.duration))
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)
                }
            }

            // Effects indicator badge (if has effects)
            if let effectsTimeline = attachment?.audioEffectsTimeline {
                HStack(spacing: 8) {
                    ForEach(effectsTimeline.appliedEffects.prefix(4)) { effect in
                        HStack(spacing: 4) {
                            Image(systemName: effect.icon)
                                .font(.system(size: 11))
                            Text(effect.name)
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(effect.swiftUIColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(effect.swiftUIColor.opacity(0.15))
                        )
                    }
                }
            }

            // Controls
            HStack(spacing: 40) {
                // Playback speed
                Button {
                    viewModel.cyclePlaybackSpeed()
                    hapticFeedback(.light)
                } label: {
                    Text(speedLabel)
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundColor(.primary)
                        .frame(width: 50, height: 50)
                        .background(Circle().fill(Color(.systemGray5)))
                }
                .buttonStyle(ScaleButtonStyle())

                // Skip backward 15s
                Button {
                    viewModel.skipBackward(seconds: 15)
                    hapticFeedback(.light)
                } label: {
                    Image(systemName: "gobackward.15")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundColor(.primary)
                }
                .buttonStyle(ScaleButtonStyle())

                // Play/Pause
                Button {
                    viewModel.togglePlayPause()
                    hapticFeedback(.medium)
                } label: {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [.meeshyPrimary, .meeshyPrimary.opacity(0.8)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 80, height: 80)
                            .shadow(color: .meeshyPrimary.opacity(0.4), radius: 12, y: 6)

                        Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: viewModel.isPlaying ? 0 : 3)
                    }
                }
                .buttonStyle(ScaleButtonStyle())

                // Skip forward 15s
                Button {
                    viewModel.skipForward(seconds: 15)
                    hapticFeedback(.light)
                } label: {
                    Image(systemName: "goforward.15")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundColor(.primary)
                }
                .buttonStyle(ScaleButtonStyle())

                // Placeholder for symmetry
                Color.clear
                    .frame(width: 50, height: 50)
            }
        }
    }

    // MARK: - Helpers

    private var speedLabel: String {
        if viewModel.playbackSpeed == 1.0 {
            return "1x"
        } else if viewModel.playbackSpeed == 1.5 {
            return "1.5x"
        } else if viewModel.playbackSpeed == 2.0 {
            return "2x"
        } else {
            return String(format: "%.1fx", viewModel.playbackSpeed)
        }
    }

    /// Format time for display - always includes milliseconds
    /// - >= 1 hour: HH:mm:ss.ms
    /// - < 1 hour: mm:ss.ms
    private func timeString(from seconds: Double) -> String {
        let totalSeconds = Int(seconds)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let secs = totalSeconds % 60
        let milliseconds = Int((seconds - Double(totalSeconds)) * 100)

        if hours >= 1 {
            // Show hours with ms: HH:mm:ss.ms
            return String(format: "%d:%02d:%02d.%02d", hours, minutes, secs, milliseconds)
        } else {
            // Show with ms: mm:ss.ms
            return String(format: "%d:%02d.%02d", minutes, secs, milliseconds)
        }
    }

    /// Format remaining time (total - current) with milliseconds and minus sign
    private func remainingTimeString(from current: Double, total: Double) -> String {
        let remaining = max(0, total - current)
        return "-" + timeString(from: remaining)
    }

    /// Format countdown time: shows duration when not playing, remaining time during playback
    /// No minus sign - just the time counting down to 0:00
    private func countdownTimeString(from current: Double, total: Double) -> String {
        let remaining = max(0, total - current)
        return timeString(from: remaining)
    }

    private func hapticFeedback(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
}

// MARK: - Player Style

enum AudioPlayerStyle {
    case standard   // Default with all controls
    case compact    // For message bubbles
    case expanded   // Full screen / sheet
}

// MARK: - Audio Player ViewModel

@MainActor
final class AudioPlayerViewModel: ObservableObject {
    let url: URL
    private var player: AVAudioPlayer?
    private let mediaId: String  // Unique ID for MediaPlaybackManager

    @Published var isPlaying = false
    @Published var currentTime: Double = 0
    @Published var duration: Double = 0
    @Published var playbackSpeed: Float = 1.0
    @Published var progress: Double = 0
    @Published var waveform: [CGFloat] = Array(repeating: 0.5, count: 50)

    private var updateTimer: Timer?
    private let skipSeconds: Double = 10
    private var isSetup = false  // Guard against multiple setup calls

    init(url: URL) {
        self.url = url
        self.mediaId = url.absoluteString
    }

    // MARK: - Setup

    func setupPlayer() {
        // Guard against multiple calls (onAppear can be triggered multiple times during scroll)
        guard !isSetup else {
            print("🔊 [AudioPlayer] setupPlayer() SKIPPED - already setup for: \(url.lastPathComponent)")
            return
        }
        isSetup = true
        print("🔊 [AudioPlayer] setupPlayer() called for: \(url.lastPathComponent)")
        do {
            // Configure audio session for playback
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)

            player = try AVAudioPlayer(contentsOf: url)
            player?.prepareToPlay()
            player?.enableRate = true
            duration = player?.duration ?? 0
            print("🔊 [AudioPlayer] Duration: \(duration)s, ready to play")

            // Register with MediaPlaybackManager for exclusive playback
            MediaPlaybackManager.shared.register(id: mediaId) { [weak self] in
                Task { @MainActor in
                    print("🔊 [AudioPlayer] Stop callback triggered by MediaPlaybackManager")
                    self?.stopPlayback()
                }
            }

            // Check if we have a saved position (e.g., from fullscreen transition)
            if let savedPosition = MediaPlaybackManager.shared.getSavedPosition(for: mediaId) {
                seek(to: savedPosition / duration)
                // Resume playing if it was playing before
                if MediaPlaybackManager.shared.isCurrentlyPlaying(id: mediaId) {
                    player?.play()
                    isPlaying = true
                    startUpdateTimer()
                }
            }

            // Generate waveform from audio
            generateWaveform()

        } catch {
            print("🔊 [AudioPlayer] ❌ Failed to setup: \(error)")
        }
    }

    func cleanup() {
        print("🔊 [AudioPlayer] cleanup() called - stopping playback")
        stopPlayback()
        MediaPlaybackManager.shared.unregister(id: mediaId)
        player = nil
        isSetup = false  // Reset so player can be setup again if view reappears
    }

    // MARK: - Controls

    func togglePlayPause() {
        if isPlaying {
            pausePlayback()
        } else {
            startPlayback()
        }
    }

    private func startPlayback() {
        print("🔊 [AudioPlayer] startPlayback() - requesting exclusive play")
        // Request exclusive playback - this will stop other audio/video
        guard MediaPlaybackManager.shared.requestPlay(id: mediaId, currentTime: currentTime) else {
            print("🔊 [AudioPlayer] ❌ requestPlay denied")
            return
        }

        player?.play()
        isPlaying = true
        startUpdateTimer()
        print("🔊 [AudioPlayer] ▶️ Playing started")
    }

    private func pausePlayback() {
        print("🔊 [AudioPlayer] ⏸️ pausePlayback()")
        player?.pause()
        updateTimer?.invalidate()
        isPlaying = false
        MediaPlaybackManager.shared.notifyPause(id: mediaId, at: currentTime)
    }

    private func stopPlayback() {
        print("🔊 [AudioPlayer] ⏹️ stopPlayback() at \(currentTime)s / \(duration)s")
        player?.pause()
        updateTimer?.invalidate()
        isPlaying = false
        MediaPlaybackManager.shared.notifyStop(id: mediaId)
    }

    func seek(to progress: Double) {
        let targetTime = duration * progress
        player?.currentTime = targetTime
        currentTime = targetTime
        self.progress = progress
        MediaPlaybackManager.shared.updatePlaybackTime(id: mediaId, time: currentTime)
    }

    func skipForward(seconds: Double? = nil) {
        let skip = seconds ?? skipSeconds
        let targetTime = min(currentTime + skip, duration)
        player?.currentTime = targetTime
        currentTime = targetTime
        progress = duration > 0 ? currentTime / duration : 0
        MediaPlaybackManager.shared.updatePlaybackTime(id: mediaId, time: currentTime)
    }

    func skipBackward(seconds: Double? = nil) {
        let skip = seconds ?? skipSeconds
        let targetTime = max(currentTime - skip, 0)
        player?.currentTime = targetTime
        currentTime = targetTime
        progress = duration > 0 ? currentTime / duration : 0
        MediaPlaybackManager.shared.updatePlaybackTime(id: mediaId, time: currentTime)
    }

    func setPlaybackSpeed(_ speed: Float) {
        playbackSpeed = speed
        player?.rate = speed
    }

    func cyclePlaybackSpeed() {
        switch playbackSpeed {
        case 1.0:
            setPlaybackSpeed(1.5)
        case 1.5:
            setPlaybackSpeed(2.0)
        default:
            setPlaybackSpeed(1.0)
        }
    }

    // MARK: - Update Timer

    private func startUpdateTimer() {
        // Use 60fps update rate (16.67ms) for smooth progress bar animation
        updateTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateProgress()
            }
        }
    }

    private func updateProgress() {
        guard let player = player else { return }

        currentTime = player.currentTime
        progress = duration > 0 ? currentTime / duration : 0

        // Update MediaPlaybackManager with current position
        MediaPlaybackManager.shared.updatePlaybackTime(id: mediaId, time: currentTime)

        // Stop when finished - check if player has actually finished (not playing anymore)
        // AVAudioPlayer.isPlaying becomes false when audio ends
        if !player.isPlaying && currentTime >= duration - 0.01 {
            stopPlayback()
            player.currentTime = 0
            currentTime = 0
            progress = 0
        }
    }

    // MARK: - Waveform Loading (Cached)

    private func generateWaveform() {
        Task {
            // Use cached waveform - no regeneration on each open
            let levels = await WaveformCache.shared.getWaveform(for: url)

            withAnimation(.easeOut(duration: 0.3)) {
                self.waveform = levels
            }
        }
    }
}

// MARK: - Interactive Waveform View

struct InteractiveWaveformView: View {
    let waveform: [CGFloat]
    let progress: Double
    let isPlaying: Bool
    var barSpacing: CGFloat = 3
    var barWidth: CGFloat? = nil
    var showPercentage: Bool = true
    var onSeek: ((Double) -> Void)?
    var onDragChanged: ((Double) -> Void)?
    var onDragEnded: (() -> Void)?

    @State private var isHovering = false
    @State private var hoverProgress: Double = 0

    private var percentageText: String {
        "\(Int(progress * 100))%"
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Waveform bars - constrained to available width
                HStack(spacing: barSpacing) {
                    ForEach(Array(waveform.enumerated()), id: \.offset) { index, level in
                        // Bar at index N should be colored when progress has passed its start position
                        // Start position of bar N = N / count
                        let barStartPosition = Double(index) / Double(max(1, waveform.count))
                        let isPlayed = progress > barStartPosition

                        WaveformBar(
                            level: level,
                            isPlayed: isPlayed,
                            isPlaying: isPlaying && isPlayed,
                            width: computedBarWidth(for: geometry.size.width)
                        )
                    }
                }
                .frame(width: geometry.size.width, height: geometry.size.height, alignment: .center)

                // Playhead indicator - positioned accurately based on progress
                if progress > 0 && progress < 1 {
                    Rectangle()
                        .fill(Color.meeshyPrimary)
                        .frame(width: 2, height: geometry.size.height + 8)
                        .position(x: geometry.size.width * CGFloat(progress), y: geometry.size.height / 2)
                        .shadow(color: .meeshyPrimary.opacity(0.5), radius: 4)
                }

                // Percentage indicator - centered
                if showPercentage && progress > 0 {
                    Text(percentageText)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            Capsule()
                                .fill(Color.meeshyPrimary)
                                .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
                        )
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()  // Prevent overflow
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let progress = max(0, min(1, value.location.x / geometry.size.width))
                        onDragChanged?(progress)
                    }
                    .onEnded { value in
                        let progress = max(0, min(1, value.location.x / geometry.size.width))
                        onSeek?(progress)
                        onDragEnded?()
                    }
            )
        }
    }

    private func computedBarWidth(for totalWidth: CGFloat) -> CGFloat {
        if let width = barWidth { return width }
        let totalBars = CGFloat(waveform.count)
        let totalSpacing = (totalBars - 1) * barSpacing
        return max(2, (totalWidth - totalSpacing) / totalBars)
    }
}

// MARK: - Waveform Bar

struct WaveformBar: View {
    let level: CGFloat
    let isPlayed: Bool
    let isPlaying: Bool
    let width: CGFloat

    @State private var animatedLevel: CGFloat = 0

    var body: some View {
        RoundedRectangle(cornerRadius: width / 2)
            .fill(
                isPlayed
                    ? LinearGradient(
                        colors: [.meeshyPrimary, .meeshyPrimary.opacity(0.7)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    : LinearGradient(
                        colors: [Color.gray.opacity(0.4), Color.gray.opacity(0.2)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
            )
            .frame(width: width)
            .scaleEffect(y: isPlaying ? animatedLevel : level, anchor: .center)
            .animation(.easeInOut(duration: 0.1), value: isPlaying)
            .onAppear {
                if isPlaying {
                    startPulseAnimation()
                }
            }
            .onChange(of: isPlaying) { _, playing in
                if playing {
                    startPulseAnimation()
                } else {
                    animatedLevel = level
                }
            }
    }

    private func startPulseAnimation() {
        withAnimation(.easeInOut(duration: 0.2).repeatForever(autoreverses: true)) {
            animatedLevel = level * CGFloat.random(in: 0.8...1.2)
        }
    }
}

// MARK: - Circular Waveform View (for expanded player)

struct CircularWaveformView: View {
    let waveform: [CGFloat]
    let progress: Double
    let isPlaying: Bool

    var body: some View {
        GeometryReader { geometry in
            let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
            let radius = min(geometry.size.width, geometry.size.height) / 2 - 20

            ZStack {
                // Background circle
                Circle()
                    .stroke(Color.gray.opacity(0.2), lineWidth: 3)

                // Progress arc
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        LinearGradient(
                            colors: [.meeshyPrimary, .meeshyPrimary.opacity(0.6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        style: StrokeStyle(lineWidth: 4, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                // Waveform bars around circle
                ForEach(Array(waveform.enumerated()), id: \.offset) { index, level in
                    let angle = (Double(index) / Double(waveform.count)) * 360 - 90
                    let barProgress = Double(index) / Double(waveform.count)
                    let isPlayed = barProgress <= progress

                    RoundedRectangle(cornerRadius: 2)
                        .fill(isPlayed ? Color.meeshyPrimary : Color.gray.opacity(0.3))
                        .frame(width: 3, height: 15 + level * 20)
                        .offset(y: -(radius - 10))
                        .rotationEffect(.degrees(angle))
                        .scaleEffect(isPlaying && isPlayed ? 1.1 : 1.0)
                        .animation(.easeInOut(duration: 0.2), value: isPlaying)
                }

                // Center play indicator
                Circle()
                    .fill(Color(.systemBackground))
                    .frame(width: radius * 0.8, height: radius * 0.8)
                    .shadow(color: .black.opacity(0.1), radius: 8)

                Image(systemName: isPlaying ? "waveform" : "music.note")
                    .font(.system(size: 32, weight: .light))
                    .foregroundColor(.meeshyPrimary)
                    .symbolEffect(.bounce, value: isPlaying)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
    }
}

// MARK: - Scale Button Style

struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Standard") {
    AudioPlayerView(
        url: Bundle.main.url(forResource: "sample", withExtension: "m4a") ?? URL(fileURLWithPath: "/tmp/test.m4a"),
        style: .standard
    )
    .padding()
}

#Preview("Compact") {
    AudioPlayerView(
        url: Bundle.main.url(forResource: "sample", withExtension: "m4a") ?? URL(fileURLWithPath: "/tmp/test.m4a"),
        style: .compact
    )
    .padding()
    .frame(width: 280)
}

#Preview("Expanded") {
    AudioPlayerView(
        url: Bundle.main.url(forResource: "sample", withExtension: "m4a") ?? URL(fileURLWithPath: "/tmp/test.m4a"),
        style: .expanded
    )
}
