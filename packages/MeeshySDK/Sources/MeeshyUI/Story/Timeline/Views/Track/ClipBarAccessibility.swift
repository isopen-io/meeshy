import SwiftUI

nonisolated enum ClipBarAction: String, CaseIterable, Sendable {
    case startLater, startEarlier, endLater, endEarlier, inspect, mute, unmute
}

struct ClipBarAccessibility {
    let geometry: TimelineGeometry
    let isLocked: Bool
    let muteLabels: (mute: String, unmute: String)?
    let isMuted: Bool

    var stepPoints: CGFloat {
        geometry.width(for: Float(MeeshyAdjustStep.seconds))
    }

    func moveDelta(_ direction: AccessibilityAdjustmentDirection) -> CGFloat? {
        guard !isLocked,
              let signed = MeeshyAdjustStep.signed(Double(stepPoints), direction) else { return nil }
        return CGFloat(signed)
    }

    var actionKinds: [ClipBarAction] {
        let trims: [ClipBarAction] = isLocked ? [] : [.startLater, .startEarlier, .endLater, .endEarlier]
        let mute: [ClipBarAction] = muteLabels == nil ? [] : [isMuted ? .unmute : .mute]
        return trims + [.inspect] + mute
    }

    func label(for action: ClipBarAction) -> String {
        switch action {
        case .startLater: return String(localized: "story.timeline.a11y.action.startLater", bundle: .module)
        case .startEarlier: return String(localized: "story.timeline.a11y.action.startEarlier", bundle: .module)
        case .endLater: return String(localized: "story.timeline.a11y.action.endLater", bundle: .module)
        case .endEarlier: return String(localized: "story.timeline.a11y.action.endEarlier", bundle: .module)
        case .inspect: return String(localized: "story.timeline.a11y.action.inspect", bundle: .module)
        case .mute: return muteLabels?.mute ?? ""
        case .unmute: return muteLabels?.unmute ?? ""
        }
    }
}

struct ClipBarCallbacks {
    let onTap: () -> Void
    let onDoubleTap: () -> Void
    let onMoveDelta: (CGFloat) -> Void
    let onMoveEnded: () -> Void
    let onTrimStartDelta: (CGFloat) -> Void
    let onTrimEndDelta: (CGFloat) -> Void
    let onToggleMute: (() -> Void)?

    func perform(_ action: ClipBarAction, model: ClipBarAccessibility) {
        let step = model.stepPoints
        switch action {
        case .startLater: onTrimStartDelta(step)
        case .startEarlier: onTrimStartDelta(-step)
        case .endLater: onTrimEndDelta(step)
        case .endEarlier: onTrimEndDelta(-step)
        case .inspect: onDoubleTap()
        case .mute, .unmute: onToggleMute?()
        }
    }

    func adjust(_ direction: AccessibilityAdjustmentDirection, model: ClipBarAccessibility) {
        guard let delta = model.moveDelta(direction) else { return }
        onMoveDelta(delta)
        onMoveEnded()
    }
}

private struct ClipBarAccessibilityModifier: ViewModifier {
    let model: ClipBarAccessibility
    let callbacks: ClipBarCallbacks

    @ViewBuilder
    func body(content: Content) -> some View {
        if model.isLocked {
            actions(content)
        } else {
            actions(content)
                .accessibilityAdjustableAction { direction in
                    callbacks.adjust(direction, model: model)
                }
        }
    }

    private func actions(_ content: Content) -> some View {
        content
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { callbacks.onTap() }
            .accessibilityActions {
                ForEach(model.actionKinds, id: \.self) { kind in
                    Button(model.label(for: kind)) { callbacks.perform(kind, model: model) }
                }
            }
    }
}

extension View {
    func clipBarAccessibility(_ model: ClipBarAccessibility, callbacks: ClipBarCallbacks) -> some View {
        modifier(ClipBarAccessibilityModifier(model: model, callbacks: callbacks))
    }
}
