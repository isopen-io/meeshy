import Foundation

enum CallEffectsCopy {
    static var blur: String {
        String(localized: "call.effects.blur", defaultValue: "Flou du fond", bundle: .main)
    }

    static var smoothingStrength: String {
        String(localized: "call.effects.smoothingStrength", defaultValue: "Force du lissage", bundle: .main)
    }

    static var brightness: String {
        String(localized: "call.effects.brightness", defaultValue: "Luminosité", bundle: .main)
    }

    static var appliedTitle: String {
        String(localized: "call.mode.effects.applied.title", defaultValue: "Effets appliqués", bundle: .main)
    }

    static func cancelLayer(_ name: String) -> String {
        String(format: String(localized: "call.mode.effects.applied.cancel", defaultValue: "Annuler %@", bundle: .main), name)
    }

    /// « Visage · Crapaud » : le genre de la couche, puis son choix.
    static func layerTitle(_ layer: CallEffectLayer) -> String {
        "\(layerKindName(layer.kind)) · \(layerChoiceName(layer))"
    }

    static func layerKindName(_ kind: CallEffectKind) -> String {
        switch kind {
        case .frame: return CallLiveFrameCopy.caption
        case .color: return CallModeCopy.categoryName(.color)
        case .face: return CallModeCopy.categoryName(.face)
        case .landscape, .voice: return kind.rawValue
        }
    }

    static func layerChoiceName(_ layer: CallEffectLayer) -> String {
        switch layer.kind {
        case .frame: return CallFrameCopy.choiceName(.frame(layer.choice))
        case .color: return VideoFilterPreset(rawValue: layer.choice).map(presetName) ?? layer.choice
        case .face: return CallFaceEffect(rawValue: layer.choice).map(name) ?? layer.choice
        case .landscape, .voice: return layer.choice
        }
    }

    static func layerSymbol(_ kind: CallEffectKind) -> String {
        switch kind {
        case .frame: return "photo.artframe"
        case .color: return "camera.filters"
        case .face: return "face.smiling"
        case .landscape: return "mountain.2"
        case .voice: return "waveform"
        }
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
        case .golden: return String(localized: "video.filter.preset.golden", defaultValue: "Doré", bundle: .main)
        case .film: return String(localized: "video.filter.preset.film", defaultValue: "Pellicule", bundle: .main)
        case .softNight: return String(localized: "video.filter.preset.softNight", defaultValue: "Nuit douce", bundle: .main)
        case .bright: return String(localized: "video.filter.preset.bright", defaultValue: "Clair", bundle: .main)
        case .velvet: return String(localized: "video.filter.preset.velvet", defaultValue: "Velours", bundle: .main)
        case .sky: return String(localized: "video.filter.preset.sky", defaultValue: "Ciel", bundle: .main)
        case .monochrome: return String(localized: "video.filter.preset.monochrome", defaultValue: "Noir et blanc", bundle: .main)
        }
    }

    static func presetSymbol(_ preset: VideoFilterPreset) -> String {
        switch preset {
        case .natural: return "leaf"
        case .warm: return "sun.max"
        case .cool: return "snowflake"
        case .vivid: return "sparkles"
        case .muted: return "cloud"
        case .golden: return "sun.horizon"
        case .film: return "film"
        case .softNight: return "moon.stars"
        case .bright: return "sun.min"
        case .velvet: return "sparkle"
        case .sky: return "cloud.sun"
        case .monochrome: return "circle.lefthalf.filled"
        }
    }
}
