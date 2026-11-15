import Foundation
import MeeshySDK

/// **Ce que la vignette d'une slide propose d'ÉDITER** (#5041).
///
/// > Directive porteur : « Longpress editer sur la miniature des slide permet
/// > d'ouvrir le background ».
///
/// ## Le manque
///
/// Le `contextMenu` de `slideThumb` offrait *Supprimer* et *Dupliquer*. Le FOND
/// d'une slide n'avait donc aucune porte depuis la bande : pour le régler, il
/// fallait le trouver sur le canvas — c'est-à-dire savoir qu'un fond EST un
/// objet, ce que rien à l'écran n'enseigne. La vignette est pourtant l'endroit
/// où l'on pense à une slide comme à une image.
///
/// ## Pourquoi une règle, pour ce qui ressemble à une ligne
///
/// Parce qu'elle décide d'une **ABSENCE**. Une slide de texte, de dessin ou
/// vierge n'a rien à ouvrir, et une entrée « Éditer » qui n'ouvrirait rien est
/// la loi 4 prise en défaut — pire qu'absente, puisqu'elle a l'air de marcher
/// jusqu'au tap. Une condition écrite dans le `body` du menu ne serait
/// éprouvable qu'en montant la vue ; ici, chaque cas se mesure.
///
/// Elle porte trois refus distincts, et aucun n'est une précaution de style :
///
/// | refus | pourquoi |
/// |---|---|
/// | aucun média | rien à ouvrir |
/// | un média de PREMIER PLAN | le canvas sépare déjà `itemsContainer` de `backgroundLayer` ; la vignette doit s'aligner sur la même frontière, sans quoi elle ouvrirait un sticker photo en croyant ouvrir la scène |
/// | identifiant vide | l'éditeur s'ouvrirait sur un objet introuvable — un écran vide est pire que pas d'entrée |
///
/// ## L'hôte est un FAIT, comme pour l'appui long
///
/// `hostServesEditor` reprend la clause qui gouverne déjà
/// `StoryCanvasBackgroundLongPress` : un composant partagé reste inerte chez qui
/// ne le branche pas. La différence tient au verdict de repli — là-bas le geste
/// retombe sur le viseur, ici l'entrée **n'apparaît pas**. Ce n'est pas une
/// incohérence : un geste a toujours besoin d'une réponse, une entrée de menu
/// peut simplement ne pas exister.
///
/// ## Ce que cette règle ne voit PAS, et qui est correct
///
/// Le fond **legacy** (`StorySlide.mediaURL`) ne vit pas dans `StoryEffects` —
/// son doc-comment le dit : « cet `effects` ne le porte pas ». Une slide qui n'a
/// qu'un fond legacy n'offre donc pas l'entrée, et c'est juste : il n'y a
/// aucun `MeeshySceneObject` à ouvrir, donc rien que l'éditeur d'objet saurait
/// régler.
nonisolated enum SlideThumbEditAffordance {

    /// L'identifiant du fond à ouvrir, ou `nil` — auquel cas la vignette
    /// n'offre aucune entrée d'édition.
    static func editableBackgroundId(in effects: StoryEffects,
                                     hostServesEditor: Bool) -> String? {
        guard hostServesEditor,
              let fond = effects.resolvedBackgroundMedia,
              !fond.id.isEmpty else { return nil }
        return fond.id
    }
}
