import Foundation
import MeeshySDK

/// Les fonds de texte proposés, dans l'ordre où ils sont offerts.
///
/// Le panneau d'options ET la rotation au tap lisent cette liste : deux
/// sources séparées divergeraient au premier fond ajouté, et la rotation
/// deviendrait incapable d'atteindre une valeur que le panneau propose.
///
/// `nonisolated` sur le TYPE : le package pose `.defaultIsolation(MainActor
/// .self)` (SE-0466), qui isolerait `all` sur le main actor et la rendrait
/// illisible depuis `StoryTextAttributeCycle`, qui est pur. Seul `label(for:)`
/// est ramené sur le main actor — `Bundle.module` l'exige.
nonisolated enum StoryTextBackgroundPresets {

    static let all: [StoryTextBackgroundStyle] = [
        .none,
        .glass(radius: 24),
        .solid(hex: "000000"),
        .solid(hex: "000000A6"),
        .solid(hex: "FFFFFF"),
        .solid(hex: "FFFFFFA6"),
        .solid(hex: "6366F1"),
        .solid(hex: "6366F1A6"),
        .solid(hex: "F472B6"),
        .solid(hex: "34D399"),
        .solid(hex: "FBBF24"),
        .solid(hex: "F87171")
    ]

    @MainActor
    static func label(for style: StoryTextBackgroundStyle) -> String {
        switch style {
        case .none:
            return String(localized: "story.composer.noEffect", defaultValue: "Aucun", bundle: .module)
        case .glass:
            return String(localized: "story.textEdit.bg.glass", defaultValue: "Verre", bundle: .module)
        case .solid(let hex):
            return solidLabel(hex)
        }
    }

    @MainActor
    private static func solidLabel(_ hex: String) -> String {
        switch hex.uppercased() {
        case "000000":   return String(localized: "story.textEdit.bg.black", defaultValue: "Noir", bundle: .module)
        case "000000A6": return String(localized: "story.textEdit.bg.black65", defaultValue: "Noir 65%", bundle: .module)
        case "FFFFFF":   return String(localized: "story.textEdit.bg.white", defaultValue: "Blanc", bundle: .module)
        case "FFFFFFA6": return String(localized: "story.textEdit.bg.white65", defaultValue: "Blanc 65%", bundle: .module)
        case "6366F1":   return String(localized: "story.textEdit.bg.indigo", defaultValue: "Indigo", bundle: .module)
        case "6366F1A6": return String(localized: "story.textEdit.bg.indigo65", defaultValue: "Indigo 65%", bundle: .module)
        case "F472B6":   return String(localized: "story.textEdit.bg.pink", defaultValue: "Rose", bundle: .module)
        case "34D399":   return String(localized: "story.textEdit.bg.green", defaultValue: "Vert", bundle: .module)
        case "FBBF24":   return String(localized: "story.textEdit.bg.amber", defaultValue: "Ambre", bundle: .module)
        case "F87171":   return String(localized: "story.textEdit.bg.red", defaultValue: "Rouge", bundle: .module)
        default:         return hex
        }
    }
}
