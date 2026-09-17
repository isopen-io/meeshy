import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La carte du lecteur de stories EST la carte de scène — la même, pas une
/// équivalente** (directive porteur du 2026-09-17, lot #6904).
///
/// > « POURQUOI ne reproduisons-nous pas la même chose que la scène des stories
/// > sur les scènes de POST ? C'est EXACTEMENT le même lecteur et le même
/// > comportement qu'il faut appliquer. »
///
/// Ce fichier portait la moitié LECTEUR de #6636 (« si rien ne sort des cadres
/// de l'image, il ne faut pas afficher le canvas »), puis, au tour précédent du
/// lot, son propre assemblage de carte : `background` + `clipShape` +
/// `scaleEffect` + `offset`. Le plein écran cadré d'un post en avait un autre,
/// équivalent — et les deux avaient déjà divergé sur les deux seules choses
/// qu'un œil voit : le fond (couleur dominante ici, hachage étiré là-bas) et le
/// rayon (22 ici, 20 là-bas). Aucun témoin ne pouvait rougir : chacun était
/// juste chez lui.
///
/// **`SceneCard` (MeeshyUI) fait désormais tout ce qu'une carte de scène
/// fait** — cadrer le contenu aux cotes de la loi, peindre le fond DANS la
/// carte, rogner aux coins de la loi. Ce fichier ne garde que ce qui appartient
/// au LECTEUR :
///
/// - **le fond qu'il choisit** — et il ne le choisit plus : la loi le nomme
///   (`SceneShape.cardedBackdrop`), pour que la carte d'une story et le cadré
///   d'un post ne puissent plus se reconnaître à leur fond ;
/// - **l'empreinte** avec laquelle ce fond se calcule, qui vient de la story ;
/// - **la PLACE et l'ANIMATION** : l'échelle et le décalage que
///   `StoryCanvasFraming` rend, et le rayon COURANT de l'animation — un lecteur
///   ouvre sa carte jusqu'au plein bord, et le rayon y descend à 0. C'est un
///   état de son animation, pas une autre loi de forme.
///
/// La légende, la barre de réaction, la barre latérale et les gestes ne lisent
/// rien d'ici : ils se placent par rapport au PLATEAU, comme avant (#6141).
extension StoryCardView {

    /// **Le fond que le lecteur pose SOUS la scène — celui de la LOI.**
    ///
    /// Il l'élisait lui-même, et la galerie élisait le sien : deux fonds pour
    /// une même carte. La raison de la couleur plate n'a pas changé (#6797) —
    /// deux surfaces qui étirent le MÊME hachage dans deux cadres différents
    /// rendent deux dégradés voisins mais distincts — mais elle est désormais
    /// écrite UNE fois, dans `SceneShape`, là où les deux surfaces la lisent.
    static var readerSceneBackdrop: SceneShape.Backdrop { SceneShape.cardedBackdrop }

    /// L'empreinte avec laquelle ce fond se calcule : celle de la scène, sinon
    /// celle de son média — la même cascade que le fond plein écran
    /// (`resolvedBackdropImage`), pour que les deux surfaces parlent du même
    /// contenu.
    func readerBackdropHash(of story: StoryItem?) -> String? {
        guard let story else { return nil }
        if let hash = story.storyEffects?.thumbHash, !hash.isEmpty { return hash }
        return story.media.compactMap(\.thumbHash).first { !$0.isEmpty }
    }
}

extension View {

    /// **La carte du lecteur : `SceneCard`, plus la place et l'animation.**
    ///
    /// Une ligne de montage, et rien d'autre. Ce qui reste ici est ce que la
    /// carte ne peut pas savoir :
    ///
    /// - `framing.scale` / `framing.offset` — OÙ la carte se pose dans le
    ///   plateau, et à quelle échelle elle s'anime au passage carte → plein
    ///   bord ;
    /// - `framing.cornerRadius` — le rayon COURANT de cette animation, qui vaut
    ///   celui de la loi au repos et 0 au plein bord. La carte le reçoit et le
    ///   compense elle-même pour l'échelle : le clip vit dans l'espace non mis à
    ///   l'échelle, et c'était la dernière ligne d'arithmétique de forme qui
    ///   restait chez un hôte.
    ///
    /// Les trois couches du lecteur — canvas sortant, canvas courant, chargeur —
    /// la partagent : une couche restée sur un autre clip ferait sauter la forme
    /// au moment où le chargement se retire, et un fond qui diverge ferait
    /// clignoter la bande.
    func readerCard(layout: SceneShape.Layout,
                    framing: StoryCanvasFraming.Result,
                    thumbHash: String?) -> some View {
        SceneCard(layout: layout,
                  thumbHash: thumbHash,
                  cornerRadius: framing.cornerRadius,
                  hostScale: framing.scale) { self }
            .scaleEffect(framing.scale)
            .offset(y: framing.offset.height)
    }
}
