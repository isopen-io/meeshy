import SwiftUI

/// Transport row shared by Quick & Pro containers. Strict primitive `let` API
/// — no @ObservedObject — so SwiftUI can skip body re-evaluation when nothing
/// the bar cares about changed.
public struct TransportBar: View {

    public let isPlaying: Bool
    public let currentTime: Float
    public let duration: Float
    public let zoomScale: CGFloat
    public let mode: TimelineMode
    public let isMuted: Bool
    public let onPlayToggle: () -> Void
    public let onMuteToggle: () -> Void
    public let onZoomIn: () -> Void
    public let onZoomOut: () -> Void
    public let onZoomReset: () -> Void
    public let onModeSwitch: () -> Void

    public init(isPlaying: Bool, currentTime: Float, duration: Float,
                zoomScale: CGFloat, mode: TimelineMode, isMuted: Bool,
                onPlayToggle: @escaping () -> Void,
                onMuteToggle: @escaping () -> Void,
                onZoomIn: @escaping () -> Void,
                onZoomOut: @escaping () -> Void,
                onZoomReset: @escaping () -> Void,
                onModeSwitch: @escaping () -> Void) {
        self.isPlaying = isPlaying; self.currentTime = currentTime; self.duration = duration
        self.zoomScale = zoomScale; self.mode = mode; self.isMuted = isMuted
        self.onPlayToggle = onPlayToggle; self.onMuteToggle = onMuteToggle
        self.onZoomIn = onZoomIn; self.onZoomOut = onZoomOut; self.onZoomReset = onZoomReset
        self.onModeSwitch = onModeSwitch
    }

    public static func formatTime(seconds: Float) -> String {
        let total = max(0, seconds)
        let minutes = Int(total) / 60
        let remainder = total - Float(minutes * 60)
        return String(format: "%d:%06.3f", minutes, remainder)
    }

    public static func zoomLabel(scale: CGFloat) -> String {
        "\(Int(scale * 100))%"
    }

    public static func modeSwitchLabel(currentMode: TimelineMode) -> String {
        switch currentMode {
        case .quick: return "PRO ↗"
        case .pro:   return "QUICK ↗"
        }
    }

    public var body: some View {
        HStack(spacing: 12) {
            playButton
            timeReadout
            Spacer(minLength: 6)
            zoomCluster
            muteButton
            modeButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minHeight: 44)
        .background(.ultraThinMaterial)
    }

    // MARK: - Sub-views

    private var playButton: some View {
        Button(action: onPlayToggle) {
            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                .font(.title3.weight(.semibold))
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.plain)
        .foregroundStyle(MeeshyColors.indigo500)
        .accessibilityLabel(String(localized: isPlaying
            ? "story.timeline.transport.pause"
            : "story.timeline.transport.play",
            bundle: .module))
    }

    private var timeReadout: some View {
        let now = Self.formatTime(seconds: currentTime)
        let total = Self.formatTime(seconds: duration)
        return Text("\(now) / \(total)")
            .font(.system(.caption, design: .monospaced).weight(.semibold))
            .lineLimit(1)
            .accessibilityLabel(String(format: String(localized: "story.timeline.transport.timeReadout",
                                                     bundle: .module), now, total))
    }

    private var zoomCluster: some View {
        HStack(spacing: 6) {
            Button(action: onZoomOut) {
                Image(systemName: "minus.magnifyingglass")
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.transport.zoomOut", bundle: .module))

            Button(action: onZoomReset) {
                Text(Self.zoomLabel(scale: zoomScale))
                    .font(.caption2.weight(.semibold))
                    .frame(minWidth: 36, minHeight: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.transport.zoomReset", bundle: .module))

            Button(action: onZoomIn) {
                Image(systemName: "plus.magnifyingglass")
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.transport.zoomIn", bundle: .module))
        }
        .foregroundStyle(MeeshyColors.indigo600)
    }

    private var muteButton: some View {
        Button(action: onMuteToggle) {
            Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
        .foregroundStyle(isMuted ? MeeshyColors.error : MeeshyColors.indigo500)
        .accessibilityLabel(String(localized: isMuted
            ? "story.timeline.transport.unmute"
            : "story.timeline.transport.mute",
            bundle: .module))
    }

    private var modeButton: some View {
        Button(action: onModeSwitch) {
            Text(Self.modeSwitchLabel(currentMode: mode))
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(MeeshyColors.indigo500.opacity(0.18))
                )
                .foregroundStyle(MeeshyColors.indigo700)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: mode == .quick
            ? "story.timeline.mode.switchToPro"
            : "story.timeline.mode.switchToQuick",
            bundle: .module))
    }
}
