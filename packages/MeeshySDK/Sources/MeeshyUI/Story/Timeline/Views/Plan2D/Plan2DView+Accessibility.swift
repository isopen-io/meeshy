import SwiftUI

nonisolated enum Plan2DTrackAction: Hashable, Sendable {
    case startLater, startEarlier, endLater, endEarlier
    case moveUp, moveDown
    case selectKeyframe(id: String, time: Double)
}

struct Plan2DTrackHandlers {
    let onSelectTrack: (String) -> Void
    let onSelectKeyframe: (String) -> Void
    let onReorder: (String, Int) -> Void
    let onTrimStart: (String, Double) -> Void
    let onTrimEnd: (String, Double) -> Void
    let onMove: (String, Double) -> Void
    let onMoveEnded: (String) -> Void
}

struct Plan2DTrackAccessibility {
    let track: Plan2DTrack
    let index: Int
    let count: Int

    private var isTrimmable: Bool {
        guard !track.isLocked, case .timed = track.bar else { return false }
        return true
    }

    var actionKinds: [Plan2DTrackAction] {
        let trims: [Plan2DTrackAction] = isTrimmable ? [.startLater, .startEarlier, .endLater, .endEarlier] : []
        let order: [Plan2DTrackAction] = (index > 0 ? [.moveUp] : []) + (index < count - 1 ? [.moveDown] : [])
        let keyframes = track.keyframes.map { Plan2DTrackAction.selectKeyframe(id: $0.id, time: $0.time) }
        return trims + order + keyframes
    }

    func adjustSeconds(_ direction: AccessibilityAdjustmentDirection) -> Double? {
        guard isTrimmable else { return nil }
        return MeeshyAdjustStep.signed(Plan2DView.accessibilityStepSeconds, direction)
    }

    var value: String {
        guard case .timed(let start, let end) = track.bar else { return "" }
        return String(format: String(localized: "story.timeline.a11y.clip.displayedRange", bundle: .module),
                      Float(start), Float(end))
    }

    func label(for action: Plan2DTrackAction) -> String {
        switch action {
        case .startLater: return String(localized: "story.timeline.a11y.action.startLater", bundle: .module)
        case .startEarlier: return String(localized: "story.timeline.a11y.action.startEarlier", bundle: .module)
        case .endLater: return String(localized: "story.timeline.a11y.action.endLater", bundle: .module)
        case .endEarlier: return String(localized: "story.timeline.a11y.action.endEarlier", bundle: .module)
        case .moveUp: return String(localized: "story.timeline.a11y.action.moveUp", bundle: .module)
        case .moveDown: return String(localized: "story.timeline.a11y.action.moveDown", bundle: .module)
        case .selectKeyframe(_, let time):
            return String(format: String(localized: "story.timeline.a11y.keyframe", bundle: .module),
                          MeeshyAccessibleValue.seconds(time))
        }
    }

    func perform(_ action: Plan2DTrackAction, handlers: Plan2DTrackHandlers) {
        let step = Plan2DView.accessibilityStepSeconds
        switch action {
        case .startLater: handlers.onTrimStart(track.id, step)
        case .startEarlier: handlers.onTrimStart(track.id, -step)
        case .endLater: handlers.onTrimEnd(track.id, step)
        case .endEarlier: handlers.onTrimEnd(track.id, -step)
        case .moveUp: handlers.onReorder(track.id, index - 1)
        case .moveDown: handlers.onReorder(track.id, index + 1)
        case .selectKeyframe(let id, _): handlers.onSelectKeyframe(id)
        }
    }

    func adjust(_ direction: AccessibilityAdjustmentDirection, handlers: Plan2DTrackHandlers) {
        guard let seconds = adjustSeconds(direction) else { return }
        handlers.onMove(track.id, seconds)
        handlers.onMoveEnded(track.id)
    }
}

extension Plan2DView {

    static let accessibilityStepSeconds = MeeshyAdjustStep.seconds

    var accessibilityHandlers: Plan2DTrackHandlers {
        Plan2DTrackHandlers(onSelectTrack: onSelectTrack, onSelectKeyframe: onSelectKeyframe,
                            onReorder: onReorder, onTrimStart: onTrimStart, onTrimEnd: onTrimEnd,
                            onMove: onMove, onMoveEnded: onMoveEnded)
    }
}

struct Plan2DTrackAccessibilityModifier: ViewModifier {
    let accessibility: Plan2DTrackAccessibility
    let handlers: Plan2DTrackHandlers
    let label: String

    init(plan: Plan2DView, track: Plan2DTrack, index: Int, label: String) {
        accessibility = Plan2DTrackAccessibility(track: track, index: index, count: plan.tracks.count)
        handlers = plan.accessibilityHandlers
        self.label = label
    }

    @ViewBuilder
    func body(content: Content) -> some View {
        if accessibility.adjustSeconds(.increment) == nil {
            described(content)
        } else {
            described(content)
                .accessibilityAdjustableAction { direction in
                    accessibility.adjust(direction, handlers: handlers)
                }
        }
    }

    private func described(_ content: Content) -> some View {
        content
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityValue(accessibility.value)
            .accessibilityAction { handlers.onSelectTrack(accessibility.track.id) }
            .accessibilityActions {
                ForEach(accessibility.actionKinds, id: \.self) { kind in
                    Button(accessibility.label(for: kind)) {
                        accessibility.perform(kind, handlers: handlers)
                    }
                }
            }
    }
}
