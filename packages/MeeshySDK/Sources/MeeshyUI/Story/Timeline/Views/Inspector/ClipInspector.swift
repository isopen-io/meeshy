import SwiftUI

/// Per-clip editor surface. Stateless on its own — receives a snapshot, emits
/// callbacks for every field commit. The owning container (`QuickTimelineView`
/// or `ProTimelineView`) wires those callbacks back to `TimelineViewModel`.
///
/// ### State sync contract
/// The inspector holds local `@State` for the slider/toggle values to keep
/// in-flight gestures smooth (a single drag must not be interrupted by an
/// external snapshot push). However, when the upstream `clip` changes for
/// non-edit reasons — most importantly **undo/redo** — the local `@State`
/// MUST resync to the new snapshot, otherwise the UI shows stale values.
///
/// SwiftUI does NOT re-run `init` when only `clip` changes (the view's
/// identity is preserved), so the resync is implemented via `.adaptiveOnChange(of:)`
/// inside `body`. See `test_inspector_clipChanges_stateResyncs`.
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
    /// Precise-edit hook for the clip's start time. Default no-op so legacy
    /// call sites stay source-compatible; the fullscreen edit wiring binds
    /// this to `TimelineViewModel.setClipStartTime(id:startTime:)`.
    public let onStartTimeChanged: (Float) -> Void
    /// Precise-edit hook for the clip's duration. Default no-op so legacy
    /// call sites stay source-compatible; the fullscreen edit wiring binds
    /// this to `TimelineViewModel.setClipDuration(id:duration:)`.
    public let onDurationChanged: (Float) -> Void

    @State private var volume: Float
    @State private var fadeIn: Float
    @State private var fadeOut: Float
    @State private var loop: Bool
    @State private var background: Bool
    @State private var startText: String
    @State private var durationText: String

    public init(presentation: InspectorPresentation,
                clip: ClipSnapshot,
                onVolumeChanged: @escaping (Float) -> Void,
                onFadeInChanged: @escaping (Float) -> Void,
                onFadeOutChanged: @escaping (Float) -> Void,
                onLoopToggled: @escaping (Bool) -> Void,
                onBackgroundToggled: @escaping (Bool) -> Void,
                onAddKeyframe: @escaping () -> Void,
                onDelete: @escaping () -> Void,
                onStartTimeChanged: @escaping (Float) -> Void = { _ in },
                onDurationChanged: @escaping (Float) -> Void = { _ in }) {
        self.presentation = presentation
        self.clip = clip
        self.onVolumeChanged = onVolumeChanged
        self.onFadeInChanged = onFadeInChanged
        self.onFadeOutChanged = onFadeOutChanged
        self.onLoopToggled = onLoopToggled
        self.onBackgroundToggled = onBackgroundToggled
        self.onAddKeyframe = onAddKeyframe
        self.onDelete = onDelete
        self.onStartTimeChanged = onStartTimeChanged
        self.onDurationChanged = onDurationChanged
        _volume = State(initialValue: clip.volume)
        _fadeIn = State(initialValue: clip.fadeInDuration)
        _fadeOut = State(initialValue: clip.fadeOutDuration)
        _loop = State(initialValue: clip.isLooping)
        _background = State(initialValue: clip.isBackground)
        _startText = State(initialValue: Self.formatPreciseSeconds(clip.startTime))
        _durationText = State(initialValue: Self.formatPreciseSeconds(clip.duration))
    }

    // MARK: - Precise-edit helpers

    /// Formats a seconds value with up to three decimals, stripping trailing
    /// zeros so a 2.000 value reads as "2" but a 2.347 keeps its precision.
    /// Locale-neutral (always "." separator) so the parser round-trips.
    public static func formatPreciseSeconds(_ seconds: Float) -> String {
        let clamped = max(0, seconds)
        let raw = String(format: "%.3f", clamped)
        // Trim trailing zeros + dangling decimal point.
        if raw.contains(".") {
            let trimmed = raw.reversed().drop(while: { $0 == "0" })
            let withoutTrailingDot = String(trimmed.drop(while: { $0 == "." }))
            return withoutTrailingDot.isEmpty ? "0" : String(withoutTrailingDot.reversed())
        }
        return raw
    }

    /// Parses a user-entered string (decimal-pad keyboard, possibly with "," in
    /// some locales) into a non-negative `Float`. Returns nil for malformed
    /// input so the caller can revert the field to its prior value.
    public static func parsePreciseSeconds(_ text: String) -> Float? {
        let normalised = text.replacingOccurrences(of: ",", with: ".")
            .trimmingCharacters(in: .whitespaces)
        guard !normalised.isEmpty,
              let value = Float(normalised),
              value.isFinite, value >= 0 else { return nil }
        return value
    }

    // MARK: - Test helpers

    public func simulateVolumeCommit(value: Float) {
        onVolumeChanged(min(1, max(0, value)))
    }

    /// Test-only read of the current local `@State` values. Used by
    /// `ClipInspector_StateSyncTests` to verify that `.adaptiveOnChange(of: clip)`
    /// successfully resyncs after an external snapshot change (e.g. undo).
    public struct _StateProbe: Sendable, Equatable {
        public let volume: Float
        public let fadeIn: Float
        public let fadeOut: Float
        public let loop: Bool
        public let background: Bool
    }

    public var _stateSnapshot: _StateProbe {
        _StateProbe(volume: volume, fadeIn: fadeIn, fadeOut: fadeOut, loop: loop, background: background)
    }

    public static func formatTime(seconds: Float) -> String {
        let total = max(0, seconds)
        let minutes = Int(total) / 60
        let remainder = total - Float(minutes * 60)
        return String(format: "%d:%06.3f", minutes, remainder)
    }

    /// True when the clip's media carries audio playback (`.video` or `.audio`).
    /// Image clips have no audio track — exposing the volume slider or loop
    /// toggle for them would surface controls that have no underlying effect.
    /// Exposed at type-level so tests can assert kind→affordance gating
    /// without driving the SwiftUI view body.
    public static func hasAudioAffordances(kind: ClipSnapshot.Kind) -> Bool {
        switch kind {
        case .video, .audio: return true
        case .image, .text:  return false
        }
    }

    /// True when looping a clip makes sense. Audio + video can loop; still
    /// images and text overlays cannot (no playback to wrap around).
    public static func supportsLoop(kind: ClipSnapshot.Kind) -> Bool {
        switch kind {
        case .video, .audio: return true
        case .image, .text:  return false
        }
    }

    /// VoiceOver label for the inspector container, resolved per clip kind.
    /// Prior to this helper, the label was hardcoded to "Video clip" for every
    /// kind — audio/image/text clips were mis-announced. Exposed at type-level
    /// so tests can assert the kind→label mapping without driving the SwiftUI
    /// view body. See `ClipInspector_AccessibilityKindTests`.
    public static func accessibilityLabel(for kind: ClipSnapshot.Kind) -> String {
        switch kind {
        case .video: return String(localized: "story.timeline.a11y.clip.video", bundle: .module)
        case .audio: return String(localized: "story.timeline.a11y.clip.audio", bundle: .module)
        case .image: return String(localized: "story.timeline.a11y.clip.image", bundle: .module)
        case .text:  return String(localized: "story.timeline.a11y.clip.text",  bundle: .module)
        }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            metadataRow
            if Self.hasAudioAffordances(kind: clip.kind) {
                volumeSlider
            }
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
        .accessibilityLabel(Self.accessibilityLabel(for: clip.kind))
        .adaptiveOnChange(of: clip) { _, newClip in
            volume = newClip.volume
            fadeIn = newClip.fadeInDuration
            fadeOut = newClip.fadeOutDuration
            loop = newClip.isLooping
            background = newClip.isBackground
            startText = Self.formatPreciseSeconds(newClip.startTime)
            durationText = Self.formatPreciseSeconds(newClip.duration)
        }
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
        HStack(spacing: 16) {
            precisionField(
                title: String(localized: "story.timeline.inspector.start", bundle: .module),
                text: $startText,
                lastKnownGood: Self.formatPreciseSeconds(clip.startTime),
                onCommit: { value in onStartTimeChanged(value) }
            )
            precisionField(
                title: String(localized: "story.timeline.inspector.duration", bundle: .module),
                text: $durationText,
                lastKnownGood: Self.formatPreciseSeconds(clip.duration),
                onCommit: { value in
                    // Duration must be strictly positive — a 0 commit is the
                    // same kind of "invalid" as a malformed string, so the
                    // commit handler reverts the field.
                    guard value > 0 else { return }
                    onDurationChanged(value)
                },
                requiresPositive: true
            )
            Spacer(minLength: 0)
        }
    }

    /// Editable seconds field with ms-precision (3 decimals). Reverts the
    /// bound text to `lastKnownGood` when the user submits a malformed or
    /// out-of-range value, so the inspector never holds a value the model
    /// has rejected. `onCommit` is only invoked with a parsed, validated
    /// `Float`.
    @ViewBuilder
    private func precisionField(title: String,
                                text: Binding<String>,
                                lastKnownGood: String,
                                onCommit: @escaping (Float) -> Void,
                                requiresPositive: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            HStack(spacing: 4) {
                TextField("", text: text)
                    .keyboardType(.decimalPad)
                    .font(.system(.body, design: .monospaced))
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 80)
                    .onSubmit { commitPrecisionField(text: text,
                                                    lastKnownGood: lastKnownGood,
                                                    requiresPositive: requiresPositive,
                                                    onCommit: onCommit) }
                    .submitLabel(.done)
                Text("s")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(MeeshyColors.indigo500.opacity(0.10))
            )
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(text.wrappedValue) seconds")
    }

    private func commitPrecisionField(text: Binding<String>,
                                      lastKnownGood: String,
                                      requiresPositive: Bool,
                                      onCommit: (Float) -> Void) {
        guard let parsed = Self.parsePreciseSeconds(text.wrappedValue) else {
            text.wrappedValue = lastKnownGood
            return
        }
        if requiresPositive, parsed <= 0 {
            text.wrappedValue = lastKnownGood
            return
        }
        onCommit(parsed)
        text.wrappedValue = Self.formatPreciseSeconds(parsed)
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

    @ViewBuilder
    private var togglesRow: some View {
        HStack(spacing: 24) {
            if Self.supportsLoop(kind: clip.kind) {
                Toggle(isOn: Binding(
                    get: { loop },
                    set: { loop = $0; onLoopToggled($0) }
                )) {
                    Text(String(localized: "story.timeline.inspector.loop", bundle: .module))
                }
                .toggleStyle(.switch)
                .tint(MeeshyColors.indigo500)
            }

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
