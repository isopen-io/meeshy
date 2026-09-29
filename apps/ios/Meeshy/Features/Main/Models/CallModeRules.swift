import CoreGraphics
import Foundation

enum CallModeCarouselRule {
    static let selectedScale: CGFloat = 1
    static let neighbourScale: CGFloat = 0.78
    static let selectedOpacity: Double = 1
    static let neighbourOpacity: Double = 0.6

    static func scale(isSelected: Bool) -> CGFloat {
        isSelected ? selectedScale : neighbourScale
    }

    static func opacity(isSelected: Bool) -> Double {
        isSelected ? selectedOpacity : neighbourOpacity
    }

    static func sideInset(containerWidth: CGFloat, itemWidth: CGFloat) -> CGFloat {
        max(0, (containerWidth - itemWidth) / 2)
    }

    static func stepping<Item: Equatable>(_ selection: Item, in items: [Item], by step: Int) -> Item {
        guard let index = items.firstIndex(of: selection) else { return items.first ?? selection }
        return items[min(max(index + step, 0), items.count - 1)]
    }
}

enum CallEffectsCategory: String, CaseIterable, Sendable {
    case face
    case color
}

enum CallEffectsModeRule {
    static let faces: [CallFaceEffect] = CallFaceEffect.allCases
    static let colors: [VideoFilterPreset] = VideoFilterPreset.allCases

    static func colorSelection(of config: VideoFilterConfig) -> VideoFilterPreset {
        config.activePreset ?? .natural
    }

    static func applying(color preset: VideoFilterPreset, to config: VideoFilterConfig) -> VideoFilterConfig {
        config.applyingPreset(preset == .natural ? nil : preset)
    }

    static func exiting(validated: Bool, current: VideoFilterConfig, original: VideoFilterConfig) -> VideoFilterConfig {
        validated ? current : original
    }
}

enum CallModeGesture: CaseIterable, Sendable {
    case tap
    case doubleTap
    case longPress
}

enum CallModeGestureOutcome: Equatable, Sendable {
    case select
    case capturePhoto
    case startRecording
    case none
}

/// #8625 — le style choisi SE déclenche : deux tapes prennent la photo, un
/// appui long filme ; un autre style se choisit d'un simple toucher. Pendant
/// l'enregistrement, seul le bouton stop du gabarit l'arrête.
enum CallModeGestureRule {
    static let longPressDuration: Double = 0.45

    static func outcome(of gesture: CallModeGesture, isSelected: Bool, isRecording: Bool) -> CallModeGestureOutcome {
        guard isSelected else { return .select }
        guard !isRecording else { return .none }
        switch gesture {
        case .tap: return .none
        case .doubleTap: return .capturePhoto
        case .longPress: return .startRecording
        }
    }

    static func listensForShots(isSelected: Bool, isRecording: Bool) -> Bool {
        isSelected && !isRecording
    }

    static func showsHint(hasSeenHint: Bool, isRecording: Bool) -> Bool {
        !hasSeenHint && !isRecording
    }

    static func clock(_ elapsed: TimeInterval) -> String {
        let seconds = elapsed.isFinite ? max(0, Int(elapsed)) : 0
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}
