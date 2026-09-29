import Foundation

nonisolated enum CallFaceEffect: String, CaseIterable, Sendable {
    case none
    case smoothing
    case toad
    case angel
    case demon
    case volcano

    var isStylized: Bool {
        switch self {
        case .none, .smoothing: return false
        case .toad, .angel, .demon, .volcano: return true
        }
    }

    var needsFace: Bool {
        switch self {
        case .none, .volcano: return false
        case .smoothing, .toad, .angel, .demon: return true
        }
    }

    var analyticsName: String? {
        self == .none ? nil : "face:\(rawValue)"
    }
}

nonisolated extension VideoFilterConfig {
    var activeFaceEffect: CallFaceEffect {
        switch faceEffect {
        case .none, .smoothing: return skinSmoothingEnabled ? .smoothing : .none
        case .toad, .angel, .demon, .volcano: return faceEffect
        }
    }

    func selectingFaceEffect(_ effect: CallFaceEffect) -> VideoFilterConfig {
        var next = self
        next.faceEffect = effect
        next.skinSmoothingEnabled = effect == .smoothing
        return next
    }

    func applyingPreset(_ preset: VideoFilterPreset?) -> VideoFilterConfig {
        var next: VideoFilterConfig = {
            guard let preset else {
                var neutral = VideoFilterPreset.natural.config
                neutral.isEnabled = false
                return neutral
            }
            return preset.config
        }()
        next.backgroundBlurEnabled = backgroundBlurEnabled
        next.backgroundBlurRadius = backgroundBlurRadius
        next.skinSmoothingEnabled = skinSmoothingEnabled
        next.skinSmoothingIntensity = skinSmoothingIntensity
        next.faceEffect = faceEffect
        return next
    }

    func withBrightness(_ brightness: Float) -> VideoFilterConfig {
        var next = self
        next.brightness = min(max(brightness, -Self.brightnessLimit), Self.brightnessLimit)
        next.isEnabled = true
        return next
    }

    func withBackgroundBlur(_ isEnabled: Bool) -> VideoFilterConfig {
        var next = self
        next.backgroundBlurEnabled = isEnabled
        return next
    }

    var activePreset: VideoFilterPreset? {
        isEnabled ? VideoFilterPreset.matching(self) : nil
    }

    static let brightnessLimit: Float = 0.3
}
