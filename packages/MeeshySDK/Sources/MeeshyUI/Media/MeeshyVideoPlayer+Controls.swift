import SwiftUI
import AVFoundation
import Combine

/// Private overlay bar : play/pause + scrubber + duration + expand
/// (composed from `controls: ControlSet`). Replaces the legacy
/// `VideoPlayerOverlayControls` standalone struct.
internal struct _OverlayControlsBar: View {
    let player: AVPlayer
    let accentColor: String
    let controls: MeeshyVideoPlayer.ControlSet
    let onExpand: (() -> Void)?

    @State private var currentTime: Double = 0
    @State private var duration: Double = 0
    @State private var isScrubbing: Bool = false
    @State private var timeObserver: Any?

    var body: some View {
        HStack(spacing: 10) {
            if controls.contains(.playPause) { playPauseButton }
            if controls.contains(.scrubber) { scrubber }
            if controls.contains(.duration) { timeLabel }
            if controls.contains(.expand) { expandButton }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(.ultraThinMaterial.opacity(0.7)))
        .onAppear { startObserving() }
        .onDisappear { stopObserving() }
    }

    private var playPauseButton: some View {
        Button {
            if player.timeControlStatus == .playing {
                player.pause()
            } else {
                player.playImmediately(atRate: 1.0)
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: player.timeControlStatus == .playing ? "pause.fill" : "play.fill")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 26, height: 26)
        }
    }

    private var scrubber: some View {
        Slider(value: Binding(
            get: { currentTime },
            set: { newValue in
                isScrubbing = true
                currentTime = newValue
            }
        ), in: 0...max(duration, 0.01)) { editing in
            if !editing {
                let target = CMTime(seconds: currentTime, preferredTimescale: 600)
                player.seek(to: target) { _ in isScrubbing = false }
            }
        }
        .tint(Color(hex: accentColor))
    }

    private var timeLabel: some View {
        Text("\(formatTime(currentTime)) / \(formatTime(duration))")
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .foregroundColor(.white)
    }

    private var expandButton: some View {
        Button {
            onExpand?()
            HapticFeedback.light()
        } label: {
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 26, height: 26)
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite, !seconds.isNaN else { return "0:00" }
        let total = Int(seconds.rounded(.down))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    private func startObserving() {
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
            if !isScrubbing {
                currentTime = time.seconds
            }
            if let item = player.currentItem {
                let dur = item.duration.seconds
                if dur.isFinite, !dur.isNaN { duration = dur }
            }
        }
    }

    private func stopObserving() {
        if let obs = timeObserver {
            player.removeTimeObserver(obs)
            timeObserver = nil
        }
    }
}
