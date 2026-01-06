//
//  AudioFullScreenView.swift
//  Meeshy
//
//  Full screen audio player with two display modes:
//  - Simple mode: Player controls occupy the full screen
//  - Detailed mode: Player controls at top, audio effects timeline below
//
//  iOS 16+
//

import SwiftUI
import AVFoundation

// MARK: - Display Mode

enum AudioFullScreenMode {
    case simple     // Full screen player view
    case detailed   // Compact player + effects timeline
}

// MARK: - AudioFullScreenView

struct AudioFullScreenView: View {
    @Environment(\.dismiss) private var dismiss

    let url: URL
    let audioEffectsTimeline: AudioEffectsTimeline?

    @StateObject private var viewModel: AudioPlayerViewModel
    @State private var displayMode: AudioFullScreenMode = .simple
    @State private var isDragging = false
    @State private var dragProgress: Double = 0
    @State private var showShareSheet = false

    /// Initialize with URL and optional Attachment (preferred)
    init(url: URL, attachment: Attachment? = nil) {
        self.url = url
        self.audioEffectsTimeline = attachment?.audioEffectsTimeline
        self._viewModel = StateObject(wrappedValue: AudioPlayerViewModel(url: url))

        // Start in detailed mode if effects are available
        if attachment?.hasAudioEffects == true {
            _displayMode = State(initialValue: .detailed)
        }
    }

    /// Initialize with URL and optional MessageAttachment (legacy compatibility)
    init(url: URL, messageAttachment: MessageAttachment?) {
        self.url = url
        self.audioEffectsTimeline = messageAttachment?.audioEffectsTimeline
        self._viewModel = StateObject(wrappedValue: AudioPlayerViewModel(url: url))

        // Start in detailed mode if effects are available
        if messageAttachment?.hasAudioEffects == true {
            _displayMode = State(initialValue: .detailed)
        }
    }

    /// Initialize with URL and direct AudioEffectsTimeline
    init(url: URL, effectsTimeline: AudioEffectsTimeline?) {
        self.url = url
        self.audioEffectsTimeline = effectsTimeline
        self._viewModel = StateObject(wrappedValue: AudioPlayerViewModel(url: url))

        // Start in detailed mode if effects are available
        if effectsTimeline != nil {
            _displayMode = State(initialValue: .detailed)
        }
    }

    /// Check if effects are available
    private var hasAudioEffects: Bool {
        audioEffectsTimeline != nil
    }

    var body: some View {
        ZStack {
            // Background
            backgroundGradient

            // Content based on display mode
            VStack(spacing: 0) {
                // Top navigation bar
                navigationBar

                // Main content with swipe gesture
                Group {
                    switch displayMode {
                    case .simple:
                        simplePlayerView
                    case .detailed:
                        detailedPlayerView
                    }
                }
                .gesture(swipeGesture)
            }
        }
        .onAppear {
            viewModel.setupPlayer()
        }
        .onDisappear {
            viewModel.cleanup()
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: [url])
        }
    }

    // MARK: - Swipe Gesture

    /// Swipe gesture to toggle between simple and detailed modes
    /// Swipe up: switch to detailed mode (show effects timeline)
    /// Swipe down: switch to simple mode (full screen player)
    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 50, coordinateSpace: .local)
            .onEnded { value in
                // Only process if effects are available
                guard hasAudioEffects else { return }

                let verticalAmount = value.translation.height
                let horizontalAmount = value.translation.width

                // Ensure it's a vertical swipe (more vertical than horizontal)
                guard abs(verticalAmount) > abs(horizontalAmount) else { return }

                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    if verticalAmount < -50 {
                        // Swipe up -> show detailed mode
                        displayMode = .detailed
                    } else if verticalAmount > 50 {
                        // Swipe down -> show simple mode
                        displayMode = .simple
                    }
                }
                hapticFeedback(.light)
            }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                Color(.systemBackground),
                Color(.systemGray6),
                Color(.systemBackground)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack {
            // Close button
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Title
            Text("Audio")
                .font(.headline)

            Spacer()

            // Mode toggle (only show if effects are available)
            if hasAudioEffects {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        displayMode = displayMode == .simple ? .detailed : .simple
                    }
                    hapticFeedback(.light)
                } label: {
                    Image(systemName: displayMode == .simple ? "rectangle.expand.vertical" : "rectangle.compress.vertical")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(.meeshyPrimary)
                        .frame(width: 44, height: 44)
                        .background(
                            Circle()
                                .fill(Color.meeshyPrimary.opacity(0.15))
                        )
                }
            } else {
                // Placeholder for symmetry
                Color.clear
                    .frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Simple Mode (Full Screen Player)

    private var simplePlayerView: some View {
        VStack(spacing: 32) {
            Spacer()

            // Large circular visualization
            ZStack {
                // Background glow
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                .meeshyPrimary.opacity(viewModel.isPlaying ? 0.25 : 0.1),
                                .clear
                            ],
                            center: .center,
                            startRadius: 60,
                            endRadius: 180
                        )
                    )
                    .frame(width: 360, height: 360)
                    .blur(radius: 50)
                    .animation(.easeInOut(duration: 0.5), value: viewModel.isPlaying)

                // Circular waveform
                CircularWaveformView(
                    waveform: viewModel.waveform,
                    progress: viewModel.progress,
                    isPlaying: viewModel.isPlaying
                )
                .frame(width: 240, height: 240)
            }

            Spacer()

            // Effects badges (if available)
            if let effectsTimeline = audioEffectsTimeline {
                effectBadgesRow(effectsTimeline)
            }

            // Progress bar
            progressBarSection

            // Controls
            controlsSection

            // Action buttons
            actionButtonsRow

            // Swipe hint (only if effects available)
            if hasAudioEffects {
                swipeHintView(direction: .up, text: "Détails des effets")
            }

            Spacer(minLength: 20)
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Swipe Hint View

    private func swipeHintView(direction: SwipeDirection, text: String) -> some View {
        VStack(spacing: 4) {
            if direction == .up {
                Image(systemName: "chevron.up")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.secondary)
                Text(text)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.secondary)
            } else {
                Text(text)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.secondary)
                Image(systemName: "chevron.down")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.secondary)
            }
        }
        .opacity(0.6)
        .padding(.top, 8)
    }

    private enum SwipeDirection {
        case up, down
    }

    // MARK: - Detailed Mode (Compact Player + Effects)

    private var detailedPlayerView: some View {
        VStack(spacing: 0) {
            // Compact player section
            compactPlayerSection
                .padding(.horizontal, 24)
                .padding(.bottom, 16)

            // Separator
            Rectangle()
                .fill(Color(.systemGray4))
                .frame(height: 1)

            // Effects timeline (scrollable)
            if let effectsTimeline = audioEffectsTimeline {
                ScrollView {
                    AudioEffectsTimelineView(
                        timeline: effectsTimeline,
                        audioDuration: viewModel.duration,
                        currentTime: viewModel.currentTime,
                        onSeek: { time in
                            let progress = viewModel.duration > 0 ? time / viewModel.duration : 0
                            viewModel.seek(to: progress)
                        }
                    )
                    .padding(16)
                }
            } else {
                // Fallback if no effects (shouldn't happen in detailed mode)
                Spacer()
                Text("Aucun effet audio")
                    .foregroundColor(.secondary)
                Spacer()
            }
        }
    }

    // MARK: - Compact Player Section (for detailed mode)

    private var compactPlayerSection: some View {
        VStack(spacing: 20) {
            // Mini circular visualization + info
            HStack(spacing: 20) {
                // Small circular waveform
                ZStack {
                    Circle()
                        .fill(Color.meeshyPrimary.opacity(0.1))
                        .frame(width: 80, height: 80)

                    CircularWaveformView(
                        waveform: viewModel.waveform,
                        progress: viewModel.progress,
                        isPlaying: viewModel.isPlaying
                    )
                    .frame(width: 70, height: 70)
                }

                // Time info
                VStack(alignment: .leading, spacing: 4) {
                    Text(timeString(from: viewModel.currentTime))
                        .font(.system(size: 28, weight: .bold, design: .monospaced))
                        .foregroundColor(.primary)

                    Text("/ \(timeString(from: viewModel.duration))")
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)
                }

                Spacer()

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
                            .frame(width: 60, height: 60)
                            .shadow(color: .meeshyPrimary.opacity(0.4), radius: 8, y: 4)

                        Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: viewModel.isPlaying ? 0 : 2)
                    }
                }
                .buttonStyle(ScaleButtonStyle())
            }

            // Progress bar (simplified)
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
            .frame(height: 32)
        }
        .padding(.top, 16)
    }

    // MARK: - UI Components

    private func effectBadgesRow(_ timeline: AudioEffectsTimeline) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(timeline.appliedEffects) { effect in
                    HStack(spacing: 6) {
                        Image(systemName: effect.icon)
                            .font(.system(size: 12, weight: .medium))
                        Text(effect.name)
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(effect.swiftUIColor)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(effect.swiftUIColor.opacity(0.15))
                    )
                }
            }
        }
    }

    private var progressBarSection: some View {
        VStack(spacing: 8) {
            // Interactive waveform
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

            // Time labels
            HStack {
                Text(timeString(from: viewModel.currentTime))
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundColor(viewModel.isPlaying ? .meeshyPrimary : .secondary)

                Spacer()

                Text(remainingTimeString(from: viewModel.currentTime, total: viewModel.duration))
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
    }

    private var controlsSection: some View {
        HStack(spacing: 40) {
            // Speed button
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

            // Skip backward
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

            // Skip forward
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

    private var actionButtonsRow: some View {
        HStack(spacing: 40) {
            // Download button
            Button {
                downloadAudio()
            } label: {
                VStack(spacing: 6) {
                    Image(systemName: "arrow.down.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.blue)

                    Text("Télécharger")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                }
            }
            .buttonStyle(ScaleButtonStyle())

            // Share button
            Button {
                showShareSheet = true
            } label: {
                VStack(spacing: 6) {
                    Image(systemName: "square.and.arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.green)

                    Text("Partager")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                }
            }
            .buttonStyle(ScaleButtonStyle())
        }
        .padding(.top, 8)
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

    private func timeString(from seconds: Double) -> String {
        let totalSeconds = Int(seconds)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let secs = totalSeconds % 60
        let milliseconds = Int((seconds - Double(totalSeconds)) * 100)

        if hours >= 1 {
            return String(format: "%d:%02d:%02d.%02d", hours, minutes, secs, milliseconds)
        } else {
            return String(format: "%d:%02d.%02d", minutes, secs, milliseconds)
        }
    }

    private func remainingTimeString(from current: Double, total: Double) -> String {
        let remaining = max(0, total - current)
        return "-" + timeString(from: remaining)
    }

    private func downloadAudio() {
        Task {
            let _ = await AttachmentFileCache.shared.downloadAndCache(from: url.absoluteString, type: .audio)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    private func hapticFeedback(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
}

// MARK: - Share Sheet

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Preview

#Preview("Simple Mode") {
    AudioFullScreenView(
        url: URL(fileURLWithPath: "/tmp/test.m4a")
    )
}

#Preview("With Effects") {
    let sampleTimeline = AudioEffectsTimeline(
        segments: [
            AudioEffectSegment(effectId: "reverb", startTime: 0.0, endTime: 5.0, effectName: "Reverb"),
            AudioEffectSegment(effectId: "echo", startTime: 3.0, endTime: 8.0, effectName: "Echo")
        ],
        configurations: [
            AudioEffectConfiguration(effectId: "reverb", effectName: "Reverb", time: 0.0, parameters: ["mix": 0.5, "decay": 0.7]),
            AudioEffectConfiguration(effectId: "reverb", effectName: "Reverb", time: 2.5, parameters: ["mix": 0.8, "decay": 0.9])
        ],
        appliedEffects: [
            AudioEffectsTimeline.AppliedEffect(id: "reverb", name: "Reverb", icon: "waveform.path.ecg.rectangle", color: "#6366f1", totalDuration: 5.0, segmentCount: 1),
            AudioEffectsTimeline.AppliedEffect(id: "echo", name: "Echo", icon: "speaker.wave.3", color: "#10b981", totalDuration: 5.0, segmentCount: 1)
        ]
    )

    return AudioFullScreenView(
        url: URL(fileURLWithPath: "/tmp/test.m4a"),
        effectsTimeline: sampleTimeline
    )
}
