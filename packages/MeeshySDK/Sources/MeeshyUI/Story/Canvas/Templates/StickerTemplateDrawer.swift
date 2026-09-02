import Foundation
import UIKit
import MeeshySDK

// MARK: - Sticker Template Drawer

/// **Ce qu'un gabarit SAIT FAIRE côté `MeeshyUI`** — se nommer, se mesurer,
/// se dessiner — enregistré UNE fois par gabarit, dans le fichier de sa
/// famille (#4820).
///
/// ## Pourquoi un registre et plus un `switch`
///
/// Le renderer portait deux `switch` sur l'id — un pour la mesure, un pour le
/// dessin — et la palette un troisième pour le nom. À douze gabarits c'était
/// lisible ; à deux cents, trois listes de deux cents cas qu'il faut tenir
/// d'accord à la main, et un fichier hors budget. Ici chaque famille déclare
/// ses dessinateurs à côté de son dessin, et le renderer les agrège : ajouter
/// un gabarit, c'est ajouter UNE entrée, à UN endroit.
///
/// ## Ce que le registre ne décide pas
///
/// Le CATALOGUE (`StickerTemplateCatalog`, `MeeshySDK`, pur) reste la source
/// de vérité de ce qui EXISTE — nature, emplacements, repli, échelle de pose.
/// Le registre dit comment ça se DESSINE. Un témoin d'inventaire exige que les
/// deux ensembles d'ids coïncident : un gabarit catalogué sans dessinateur, ou
/// un dessinateur sans gabarit, rougit.
public struct StickerTemplateDrawer {

    /// La taille qu'occupera le gabarit, sans le rasteriser — partagée avec
    /// les cibles de tap du reader (cf. `StickerTemplateRenderer`).
    public typealias Measure = @MainActor ([String: String], StickerTemplateMetrics) -> CGSize
    /// Le gabarit rasterisé, prêt pour `CALayer.contents`, et sa taille.
    public typealias Draw = @MainActor ([String: String], StickerTemplateMetrics, CGFloat) -> (UIImage?, CGSize)
    /// Le nom LOCALISÉ du gabarit — VoiceOver et libellés. Une fermeture, pas
    /// une chaîne : la locale se lit au moment de parler, pas au démarrage.
    public typealias Name = @MainActor () -> String

    public let id: String
    public let name: Name
    public let measure: Measure
    public let draw: Draw

    public init(id: String,
                name: @escaping Name,
                measure: @escaping Measure,
                draw: @escaping Draw) {
        self.id = id
        self.name = name
        self.measure = measure
        self.draw = draw
    }
}
