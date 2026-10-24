import Foundation
import MeeshySDK

/// **Ce que l'édition d'un texte propose** — les outils de la rangée et les fonds, dans l'ordre où
/// ils sont offerts (#12591). Un atome à paramètres opaques : le composer garde tout, un hôte qui
/// GRAVE le texte dans un média (la retouche de la caméra) en retire ce qui n'a pas d'effet sur
/// une image figée.
public nonisolated struct StoryTextEditProfile: Equatable, Sendable {
    public let tools: [TextEditTool]
    public let backgrounds: [StoryTextBackgroundStyle]

    public init(tools: [TextEditTool], backgrounds: [StoryTextBackgroundStyle]) {
        self.tools = tools
        self.backgrounds = backgrounds
    }

    /// Le composer : les huit outils et les douze fonds.
    public static let composer = StoryTextEditProfile(tools: TextEditTool.all,
                                                      backgrounds: StoryTextBackgroundPresets.all)

    /// **Un texte cuit dans un média** : pas de « Langue » (une langue source ne traduit rien d'un
    /// texte gravé dans les pixels), pas de fond « Verre » (il floute ce qu'il y a dessous, et le
    /// peintre du média ne le floute pas — D3.2).
    public static let bakedIntoMedia = StoryTextEditProfile(
        tools: TextEditTool.all.filter { $0 != .language },
        backgrounds: StoryTextBackgroundPresets.all.filter { style in
            if case .glass = style { return false }
            return true
        })
}
