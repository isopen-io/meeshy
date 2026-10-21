import CoreGraphics
import Foundation

// MARK: - Story Filter

public enum StoryFilter: String, Codable, CaseIterable, Sendable {
    case vintage
    case bw
    case warm
    case cool
    case dramatic
    case vivid
    case fade
    case chrome

    public var displayName: String {
        switch self {
        case .vintage: return "Vintage"
        case .bw: return "N&B"
        case .warm: return "Chaud"
        case .cool: return "Froid"
        case .dramatic: return "Dramatic"
        case .vivid: return "Vivid"
        case .fade: return "Fade"
        case .chrome: return "Chrome"
        }
    }

    public var ciFilterName: String {
        switch self {
        case .vintage: return "CIPhotoEffectTransfer"
        case .bw: return "CIPhotoEffectMono"
        case .warm: return "CITemperatureAndTint"
        case .cool: return "CITemperatureAndTint"
        case .dramatic: return "CIPhotoEffectProcess"
        case .vivid: return "CIColorControls"
        case .fade: return "CIPhotoEffectFade"
        case .chrome: return "CIPhotoEffectChrome"
        }
    }
}
