import SwiftUI

extension AudioEditorWaveform {

    enum HandleEdge: Sendable {
        case start, end
    }

    static var playheadLabel: String {
        String(localized: "audio.editor.a11y.playhead", bundle: .module)
    }

    static func handleLabel(edge: HandleEdge, isRemoval: Bool) -> String {
        switch (edge, isRemoval) {
        case (.start, false): return String(localized: "audio.trim.handle.start", bundle: .module)
        case (.end, false): return String(localized: "audio.trim.handle.end", bundle: .module)
        case (.start, true): return String(localized: "audio.split.handle.start", bundle: .module)
        case (.end, true): return String(localized: "audio.split.handle.end", bundle: .module)
        }
    }

    func scrubAdjustment(_ direction: AccessibilityAdjustmentDirection) -> Double? {
        MeeshyAdjustStep.nudgedFraction(progress, direction)
    }

    func selectionStartAdjustment(_ direction: AccessibilityAdjustmentDirection) -> Double? {
        selection.flatMap { MeeshyAdjustStep.nudgedFraction($0.start, direction) }
    }

    func selectionEndAdjustment(_ direction: AccessibilityAdjustmentDirection) -> Double? {
        selection.flatMap { MeeshyAdjustStep.nudgedFraction($0.end, direction) }
    }
}
