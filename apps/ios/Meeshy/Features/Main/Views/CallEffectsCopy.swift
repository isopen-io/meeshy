import Foundation

enum CallEffectsCopy {
    static var blur: String {
        String(localized: "call.effects.blur", defaultValue: "Flou du fond", bundle: .main)
    }

    static var brightness: String {
        String(localized: "call.effects.brightness", defaultValue: "Luminosité", bundle: .main)
    }

    static func name(_ effect: CallFaceEffect) -> String {
        switch effect {
        case .none: return String(localized: "call.effects.face.none", defaultValue: "Aucun", bundle: .main)
        case .smoothing: return String(localized: "call.effects.face.smoothing", defaultValue: "Lissage de peau", bundle: .main)
        case .toad: return String(localized: "call.effects.face.toad", defaultValue: "Crapaud", bundle: .main)
        case .angel: return String(localized: "call.effects.face.angel", defaultValue: "Ange", bundle: .main)
        case .demon: return String(localized: "call.effects.face.demon", defaultValue: "Démon", bundle: .main)
        case .volcano: return String(localized: "call.effects.face.volcano", defaultValue: "Éruption", bundle: .main)
        }
    }

    static func art(_ effect: CallFaceEffect) -> CallPillChipArt {
        switch effect {
        case .none: return .symbol("circle.slash")
        case .smoothing: return .emoji("✨")
        case .toad: return .emoji("🐸")
        case .angel: return .emoji("😇")
        case .demon: return .emoji("😈")
        case .volcano: return .emoji("🌋")
        }
    }

    static func presetName(_ preset: VideoFilterPreset) -> String {
        switch preset {
        case .natural: return String(localized: "video.filter.preset.natural", defaultValue: "Naturel", bundle: .main)
        case .warm: return String(localized: "video.filter.preset.warm", defaultValue: "Chaud", bundle: .main)
        case .cool: return String(localized: "video.filter.preset.cool", defaultValue: "Froid", bundle: .main)
        case .vivid: return String(localized: "video.filter.preset.vivid", defaultValue: "Vif", bundle: .main)
        case .muted: return String(localized: "video.filter.preset.muted", defaultValue: "Doux", bundle: .main)
        }
    }

    static func presetSymbol(_ preset: VideoFilterPreset) -> String {
        switch preset {
        case .natural: return "leaf"
        case .warm: return "sun.max"
        case .cool: return "snowflake"
        case .vivid: return "sparkles"
        case .muted: return "cloud"
        }
    }
}
