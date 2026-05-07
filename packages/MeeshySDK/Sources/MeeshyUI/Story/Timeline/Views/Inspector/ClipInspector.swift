import SwiftUI

/// Per-clip editor surface. Stateless on its own — receives a snapshot, emits
/// callbacks for every field commit. The owning container (`QuickTimelineView`
/// or `ProTimelineView`) wires those callbacks back to `TimelineViewModel`.
public struct ClipInspector: View {

    // MARK: - Snapshot

    public struct ClipSnapshot: Equatable, Sendable {
        public enum Kind: String, Sendable, Equatable { case video, audio, text, image }
        public let id: String
        public let displayName: String
        public let kind: Kind
        public let startTime: Float
        public let duration: Float
        public let volume: Float
        public let fadeInDuration: Float
        public let fadeOutDuration: Float
        public let isLooping: Bool
        public let isBackground: Bool

        public init(id: String, displayName: String, kind: Kind,
                    startTime: Float, duration: Float, volume: Float,
                    fadeInDuration: Float, fadeOutDuration: Float,
                    isLooping: Bool, isBackground: Bool) {
            self.id = id; self.displayName = displayName; self.kind = kind
            self.startTime = startTime; self.duration = duration
            self.volume = volume
            self.fadeInDuration = fadeInDuration; self.fadeOutDuration = fadeOutDuration
            self.isLooping = isLooping; self.isBackground = isBackground
        }
    }

    public static let fadeRange: ClosedRange<Float> = 0...3

    public let presentation: InspectorPresentation
    public let clip: ClipSnapshot
    public let onVolumeChanged: (Float) -> Void
    public let onFadeInChanged: (Float) -> Void
    public let onFadeOutChanged: (Float) -> Void
    public let onLoopToggled: (Bool) -> Void
    public let onBackgroundToggled: (Bool) -> Void
    public let onAddKeyframe: () -> Void
    public let onDelete: () -> Void

    @State private var volume: Float
    @State private var fadeIn: Float
    @State private var fadeOut: Float
    @State private var loop: Bool
    @State private var background: Bool

    public init(presentation: InspectorPresentation,
                clip: ClipSnapshot,
                onVolumeChanged: @escaping (Float) -> Void,
                onFadeInChanged: @escaping (Float) -> Void,
                onFadeOutChanged: @escaping (Float) -> Void,
                onLoopToggled: @escaping (Bool) -> Void,
                onBackgroundToggled: @escaping (Bool) -> Void,
                onAddKeyframe: @escaping () -> Void,
                onDelete: @escaping () -> Void) {
        self.presentation = presentation
        self.clip = clip
        self.onVolumeChanged = onVolumeChanged
        self.onFadeInChanged = onFadeInChanged
        self.onFadeOutChanged = onFadeOutChanged
        self.onLoopToggled = onLoopToggled
        self.onBackgroundToggled = onBackgroundToggled
        self.onAddKeyframe = onAddKeyframe
        self.onDelete = onDelete
        _volume = State(initialValue: clip.volume)
        _fadeIn = State(initialValue: clip.fadeInDuration)
        _fadeOut = State(initialValue: clip.fadeOutDuration)
        _loop = State(initialValue: clip.isLooping)
        _background = State(initialValue: clip.isBackground)
    }

    // MARK: - Test helpers

    public func simulateVolumeCommit(value: Float) {
        onVolumeChanged(min(1, max(0, value)))
    }

    public static func formatTime(seconds: Float) -> String {
        let total = max(0, seconds)
        let minutes = Int(total) / 60
        let remainder = total - Float(minutes * 60)
        return String(format: "%d:%06.3f", minutes, remainder)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            metadataRow
            volumeSlider
            fadeSliders
            togglesRow
            actionsRow
        }
        .padding(presentation == .popover ? 14 : 18)
        .background(
            RoundedRectangle(cornerRadius: presentation == .popover ? 14 : 0)
                .fill(.ultraThinMaterial)
        )
        .frame(maxWidth: presentation == .popover ? 360 : .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.a11y.clip.video", bundle: .module))
    }

    // MARK: - Sub-views

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: kindSystemImage)
                .font(.headline)
                .foregroundStyle(MeeshyColors.indigo500)
                .accessibilityHidden(true)
            Text(clip.displayName)
                .font(.headline)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 0)
        }
    }

    private var metadataRow: some View {
        HStack(spacing: 24) {
            metadataField(
                title: String(localized: "story.timeline.inspector.start", bundle: .module),
                value: Self.formatTime(seconds: clip.startTime)
            )
            metadataField(
                title: String(localized: "story.timeline.inspector.duration", bundle: .module),
                value: Self.formatTime(seconds: clip.duration)
            )
        }
    }

    private func metadataField(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(.body, design: .monospaced))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(value)")
    }

    private var volumeSlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "story.timeline.inspector.volume", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: $volume, in: 0...1, step: 0.01) { editing in
                if !editing { onVolumeChanged(volume) }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue("\(Int(volume * 100))%")
        }
    }

    private var fadeSliders: some View {
        HStack(spacing: 12) {
            fadeSlider(
                title: String(localized: "story.timeline.clip.tooltip.fadeIn", bundle: .module),
                value: $fadeIn,
                onCommit: { onFadeInChanged(fadeIn) }
            )
            fadeSlider(
                title: String(localized: "story.timeline.clip.tooltip.fadeOut", bundle: .module),
                value: $fadeOut,
                onCommit: { onFadeOutChanged(fadeOut) }
            )
        }
    }

    private func fadeSlider(title: String, value: Binding<Float>, onCommit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: value, in: Self.fadeRange, step: 0.05) { editing in
                if !editing { onCommit() }
            }
            .tint(MeeshyColors.indigo400)
            .accessibilityValue(String(format: "%.2fs", value.wrappedValue))
        }
    }

    private var togglesRow: some View {
        HStack(spacing: 24) {
            Toggle(isOn: Binding(
                get: { loop },
                set: { loop = $0; onLoopToggled($0) }
            )) {
                Text(String(localized: "story.timeline.inspector.loop", bundle: .module))
            }
            .toggleStyle(.switch)
            .tint(MeeshyColors.indigo500)

            Toggle(isOn: Binding(
                get: { background },
                set: { background = $0; onBackgroundToggled($0) }
            )) {
                Text(String(localized: "story.timeline.inspector.background", bundle: .module))
            }
            .toggleStyle(.switch)
            .tint(MeeshyColors.indigo500)
        }
    }

    private var actionsRow: some View {
        HStack(spacing: 12) {
            Button(action: onAddKeyframe) {
                Label(
                    String(localized: "story.timeline.keyframe.add", bundle: .module),
                    systemImage: "diamond.fill"
                )
                .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
            .tint(MeeshyColors.indigo500)
            .accessibilityHint(String(localized: "story.timeline.keyframe.add", bundle: .module))

            Spacer(minLength: 0)

            Button(role: .destructive, action: onDelete) {
                Label(
                    String(localized: "story.timeline.clip.delete", bundle: .module),
                    systemImage: "trash"
                )
                .font(.subheadline.weight(.semibold))
            }
            .tint(MeeshyColors.error)
        }
    }

    private var kindSystemImage: String {
        switch clip.kind {
        case .video: return "film"
        case .audio: return "waveform"
        case .text:  return "textformat"
        case .image: return "photo"
        }
    }
}
