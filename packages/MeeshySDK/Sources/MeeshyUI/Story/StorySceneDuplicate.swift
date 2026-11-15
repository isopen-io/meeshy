import Foundation
import MeeshySDK

/// **La copie d'un objet de scène, famille par famille** — une règle pure, que
/// `StoryComposerViewModel.duplicateElement` applique. Chaque copie porte un
/// identifiant neuf et se pose légèrement décalée de sa source : assez pour
/// qu'on VOIE la duplication, assez peu pour qu'elle chevauche encore.
nonisolated enum StorySceneDuplicate {

    /// Le décalage d'un texte vaut 20 pixels de design dans le canvas
    /// 1080×1920 (≈ 2 % en x, ≈ 1 % en y). L'ancien 0,05 (54 px) sautait hors
    /// du cadre de sélection de la source.
    static func text(_ source: StoryTextObject) -> StoryTextObject {
        var copie = source
        copie.id = UUID().uuidString
        copie.x = min(1.0, source.x + 20.0 / 1080.0)
        copie.y = min(1.0, source.y + 20.0 / 1920.0)
        return copie
    }

    /// Le clone d'un média est TOUJOURS au premier plan : dupliquer un fond
    /// créait un second fond (« au plus un fond par slide ») qui couvrait tout
    /// le canvas en ignorant le décalage — un clone invisible.
    static func media(_ source: StoryMediaObject) -> StoryMediaObject {
        var copie = source
        copie.id = UUID().uuidString
        copie.isBackground = false
        copie.x = shifted(source.x)
        copie.y = shifted(source.y)
        return copie
    }

    /// Idem pour un son : un clone de fond violerait « un son de fond par slide ».
    static func audio(_ source: StoryAudioPlayerObject) -> StoryAudioPlayerObject {
        var copie = source
        copie.id = UUID().uuidString
        copie.isBackground = false
        copie.x = shifted(source.x)
        copie.y = shifted(source.y)
        return copie
    }

    /// **Le sticker et le lieu se dupliquent aussi** (#13839, L5) : la barre de
    /// la sélection sert « Dupliquer » à toute famille posée.
    static func sticker(_ source: StorySticker) -> StorySticker {
        var copie = source
        copie.id = UUID().uuidString
        copie.x = shifted(source.x)
        copie.y = shifted(source.y)
        return copie
    }

    static func place(_ source: StoryLocationObject) -> StoryLocationObject {
        var copie = source
        copie.id = UUID().uuidString
        copie.x = shifted(source.x)
        copie.y = shifted(source.y)
        return copie
    }

    private static func shifted(_ value: Double) -> Double { min(1.0, value + 0.05) }
}
