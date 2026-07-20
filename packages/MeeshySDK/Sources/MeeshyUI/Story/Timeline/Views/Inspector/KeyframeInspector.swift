import SwiftUI

/// Contextual sheet shown on tap of a `KeyframeMarkerView`. Uses the same
/// snapshot/callback contract as `ClipInspector` — the owner translates each
/// commit into a `MoveKeyframeCommand` / `DeleteKeyframeCommand` via
/// `TimelineViewModel`.
public struct KeyframeInspector: View {

    public enum Easing: String, CaseIterable, Sendable, Equatable, Identifiable {
        case linear, easeIn, easeOut, easeInOut, spring
        public var id: String { rawValue }
        public var displayName: String {
            switch self {
            case .linear:    return "Linear"
            case .easeIn:    return "Ease In"
            case .easeOut:   return "Ease Out"
            case .easeInOut: return "Ease In/Out"
            case .spring:    return "Spring"
            }
        }
    }

    public struct KeyframeSnapshot: Equatable, Sendable {
        public let id: String
        public let absoluteTime: Float
        public let x: CGFloat
        public let y: CGFloat
        public let scale: CGFloat
        public let opacity: CGFloat
        public init(id: String, absoluteTime: Float,
                    x: CGFloat, y: CGFloat, scale: CGFloat, opacity: CGFloat) {
            self.id = id; self.absoluteTime = absoluteTime
            self.x = x; self.y = y; self.scale = scale; self.opacity = opacity
        }
    }

    /// At launch only `.linear` is exposed in the picker. Advanced easings stay
    /// gated behind `isAdvancedEnabled` so the data model already supports them
    /// when product unlocks the surface.
    public static let exposedEasingsAtLaunch: [Easing] = [.linear]

    public static func exposedEasings(advanced: Bool) -> [Easing] {
        advanced ? Easing.allCases : exposedEasingsAtLaunch
    }

    public let keyframe: KeyframeSnapshot
    public let isAdvancedEnabled: Bool
    public let onPositionChanged: (CGFloat, CGFloat) -> Void
    public let onScaleChanged: (CGFloat) -> Void
    public let onOpacityChanged: (CGFloat) -> Void
    public let onEasingChanged: (Easing) -> Void
    public let onDelete: () -> Void
    /// Ferme l'inspecteur (désélection) — même affordance que ClipInspector /
    /// TransitionInspector.
    public let onClose: () -> Void

    @State private var posX: CGFloat
    @State private var posY: CGFloat
    @State private var scale: CGFloat
    @State private var opacity: CGFloat
    @State private var easing: Easing

    public init(keyframe: KeyframeSnapshot,
                isAdvancedEnabled: Bool,
                onPositionChanged: @escaping (CGFloat, CGFloat) -> Void,
                onScaleChanged: @escaping (CGFloat) -> Void,
                onOpacityChanged: @escaping (CGFloat) -> Void,
                onEasingChanged: @escaping (Easing) -> Void,
                onDelete: @escaping () -> Void,
                onClose: @escaping () -> Void = {}) {
        self.keyframe = keyframe
        self.isAdvancedEnabled = isAdvancedEnabled
        self.onPositionChanged = onPositionChanged
        self.onScaleChanged = onScaleChanged
        self.onOpacityChanged = onOpacityChanged
        self.onEasingChanged = onEasingChanged
        self.onDelete = onDelete
        self.onClose = onClose
        _posX = State(initialValue: keyframe.x)
        _posY = State(initialValue: keyframe.y)
        _scale = State(initialValue: keyframe.scale)
        _opacity = State(initialValue: keyframe.opacity)
        _easing = State(initialValue: .linear)
    }

    public func simulatePositionCommit(x: CGFloat, y: CGFloat) {
        onPositionChanged(x, y)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            positionSliders
            scaleSlider
            opacitySlider
            easingPicker
            deleteButton
        }
        .padding(14)
        // Même composition que ClipInspector/TransitionInspector : matériau
        // sous le contenu (jamais glassEffect, le verre ne peut pas
        // échantillonner du verre — artefacts iOS 26).
        .background(
            RoundedRectangle(cornerRadius: 14).fill(.ultraThinMaterial)
        )
        .frame(maxWidth: 360, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(format: String(localized: "story.timeline.a11y.keyframe", bundle: .module),
                                   String(format: "%.2fs", keyframe.absoluteTime)))
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "diamond.fill")
                .foregroundStyle(MeeshyColors.warning)
                .accessibilityHidden(true)
            Text(String(format: "%.2fs", keyframe.absoluteTime))
                .font(.system(.headline, design: .monospaced))
            Spacer(minLength: 0)
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .contentShape(Rectangle().inset(by: -8))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.inspector.close", bundle: .module))
        }
    }

    private var positionSliders: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(String(localized: "story.timeline.keyframe.position", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            HStack(spacing: 12) {
                axisSlider(label: "X", value: $posX, range: 0...1) {
                    onPositionChanged(posX, posY)
                }
                axisSlider(label: "Y", value: $posY, range: 0...1) {
                    onPositionChanged(posX, posY)
                }
            }
        }
    }

    private func axisSlider(label: String, value: Binding<CGFloat>, range: ClosedRange<CGFloat>, onCommit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption.weight(.semibold))
            Slider(value: value, in: range) { editing in
                if !editing { onCommit() }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue(String(format: "%.2f", value.wrappedValue))
        }
    }

    private var scaleSlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "story.timeline.keyframe.scale", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: $scale, in: 0.1...4.0, step: 0.05) { editing in
                if !editing { onScaleChanged(scale) }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue(String(format: "%.2fx", scale))
        }
    }

    private var opacitySlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "story.timeline.keyframe.opacity", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: $opacity, in: 0...1, step: 0.01) { editing in
                if !editing { onOpacityChanged(opacity) }
            }
            .tint(MeeshyColors.indigo400)
            .accessibilityValue("\(Int(opacity * 100))%")
        }
    }

    private var easingPicker: some View {
        let exposed = Self.exposedEasings(advanced: isAdvancedEnabled)
        return Picker(selection: Binding(
            get: { easing },
            set: { newValue in easing = newValue; onEasingChanged(newValue) }
        )) {
            ForEach(exposed) { kind in
                Text(kind.displayName).tag(kind)
            }
        } label: {
            Text("Easing")
        }
        .pickerStyle(.segmented)
        .disabled(exposed.count == 1)
    }

    private var deleteButton: some View {
        Button(role: .destructive, action: onDelete) {
            Label(
                String(localized: "story.timeline.keyframe.delete", bundle: .module),
                systemImage: "trash"
            )
            .font(.subheadline.weight(.semibold))
        }
        .tint(MeeshyColors.error)
    }
}
