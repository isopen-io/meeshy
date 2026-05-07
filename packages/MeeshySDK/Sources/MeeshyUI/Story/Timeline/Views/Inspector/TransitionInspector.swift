import SwiftUI
import MeeshySDK

/// Contextual sheet shown on tap of a `TransitionBadge`. Edits the underlying
/// `StoryClipTransition` via `ChangeTransitionCommand` / `RemoveTransitionCommand`
/// pushed by the owning timeline.
public struct TransitionInspector: View {

    public struct TransitionSnapshot: Equatable, Sendable {
        public let id: String
        public let fromClipId: String
        public let toClipId: String
        public let kind: StoryTransitionKind
        public let duration: Float
        public init(id: String, fromClipId: String, toClipId: String,
                    kind: StoryTransitionKind, duration: Float) {
            self.id = id; self.fromClipId = fromClipId; self.toClipId = toClipId
            self.kind = kind; self.duration = duration
        }
    }

    public static let durationRange: ClosedRange<Float> = 0.1...2.0

    public let transition: TransitionSnapshot
    public let isAdvancedEnabled: Bool
    public let onKindChanged: (StoryTransitionKind) -> Void
    public let onDurationChanged: (Float) -> Void
    public let onDelete: () -> Void

    @State private var kind: StoryTransitionKind
    @State private var duration: Float

    public init(transition: TransitionSnapshot,
                isAdvancedEnabled: Bool,
                onKindChanged: @escaping (StoryTransitionKind) -> Void,
                onDurationChanged: @escaping (Float) -> Void,
                onDelete: @escaping () -> Void) {
        self.transition = transition
        self.isAdvancedEnabled = isAdvancedEnabled
        self.onKindChanged = onKindChanged
        self.onDurationChanged = onDurationChanged
        self.onDelete = onDelete
        _kind = State(initialValue: transition.kind)
        _duration = State(initialValue: transition.duration)
    }

    public func simulateKindCommit(_ value: StoryTransitionKind) {
        onKindChanged(value)
    }

    public func simulateDurationCommit(value: Float) {
        let clamped = min(Self.durationRange.upperBound, max(Self.durationRange.lowerBound, value))
        onDurationChanged(clamped)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            kindPicker
            durationSlider
            easingDisabledNotice
            deleteButton
        }
        .padding(18)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.a11y.transition", bundle: .module))
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "diamond.fill")
                .foregroundStyle(MeeshyColors.warning)
                .accessibilityHidden(true)
            Text("\(transition.fromClipId) → \(transition.toClipId)")
                .font(.system(.subheadline, design: .monospaced))
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 0)
        }
    }

    private var kindPicker: some View {
        Picker(selection: Binding(
            get: { kind },
            set: { newValue in kind = newValue; onKindChanged(newValue) }
        )) {
            Text(String(localized: "story.timeline.transition.crossfade", bundle: .module))
                .tag(StoryTransitionKind.crossfade)
            Text(String(localized: "story.timeline.transition.dissolve", bundle: .module))
                .tag(StoryTransitionKind.dissolve)
        } label: {
            Text("Kind")
        }
        .pickerStyle(.segmented)
    }

    private var durationSlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "story.timeline.transition.duration", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: $duration, in: Self.durationRange, step: 0.05) { editing in
                if !editing { onDurationChanged(duration) }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue(String(format: "%.2fs", duration))
        }
    }

    @ViewBuilder
    private var easingDisabledNotice: some View {
        if !isAdvancedEnabled {
            Text("Easing: linear")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
    }

    private var deleteButton: some View {
        Button(role: .destructive, action: onDelete) {
            Label(
                String(localized: "story.timeline.transition.delete", bundle: .module),
                systemImage: "trash"
            )
            .font(.subheadline.weight(.semibold))
        }
        .tint(MeeshyColors.error)
    }
}
