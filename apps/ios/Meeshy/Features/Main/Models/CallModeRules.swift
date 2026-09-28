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
