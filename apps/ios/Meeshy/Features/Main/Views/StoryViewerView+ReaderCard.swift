import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La carte du lecteur de stories — la SCÈNE, et la scène est 9:16**
/// (décision porteur du 2026-09-17 sur #6896, lot #6904).
///
/// Ce fichier portait la moitié LECTEUR de #6636 : « si rien ne sort des cadres
/// de l'image, il ne faut pas afficher le canvas ». La décision du 2026-09-17
/// la supplante — une scène ne change plus de forme selon ce qu'elle contient,
/// et le lecteur ne consulte donc plus `StoryImageOnlyPresentation` ni son
/// mesureur `StorySceneFootprint`. Les deux restent au SDK, avec leurs témoins
/// (`StoryImageOnlyPresentationTests`, `StorySceneFootprintTests`) : ce sont des
/// lois PURES, mesurées, sans consommateur de production depuis ce lot — ce qui
/// se dit, et ne se cache pas.
///
/// Ce que le lecteur en fait aujourd'hui :
///
/// - **la carte est le 9:16 entier**, arrondi au rayon de la carte, quelle que
///   soit la scène — un panorama y occupe une bande, et la bande est une
///   surface de composition (directive porteur 2026-08-31), pas un défaut de
///   cadrage ;
/// - **un seul peintre habille cette bande, et c'est le PLATEAU du lecteur** :
///   `SceneBackdropView`, posé SOUS le canvas et DANS la carte. Le canvas ne
///   sert plus son propre remplissage (`servesLetterboxFill: false` aux quatre
///   montages) — il peignait le MÊME hachage que le fond plein écran, étiré
///   dans un autre cadre, et la carte devenait invisible sur le repère F6
///   (#6797, mesuré au simulateur le 2026-09-17) ;
/// - **le fond de la carte est une couleur PLATE** (`.thumbHashDominantColor`).
///   C'est ce qui la distingue du flou plein écran : deux flous du même hachage
///   se ressemblent toujours, une couleur unie ne peut pas ressembler à un
///   dégradé.
///
/// La légende, la barre de réaction, la barre latérale et les gestes ne lisent
/// rien d'ici : ils se placent par rapport au PLATEAU, comme avant (#6141).
///
/// Sorti de `StoryViewerView+Canvas.swift`, hors budget : on n'y ajoute pas, on
/// extrait d'abord.
extension StoryCardView {

    /// **Le fond que le lecteur pose SOUS la scène.**
    ///
    /// La loi nomme les trois possibles et ne choisit pas — elle ne sait pas
    /// s'il existe un hachage à étirer. Le lecteur, lui, en a toujours un sous
    /// la main, et il a une raison de préférer la couleur dominante : son fond
    /// plein écran EST déjà ce hachage, flouté. Reprendre le flou dans la carte
    /// ne peint aucun pixel de plus — il peint le même deux fois.
    static var readerSceneBackdrop: SceneShape.Backdrop { .thumbHashDominantColor }

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

/// La compensation d'échelle du rayon — tout ce qui reste de la forme, une fois
/// le rectangle de l'image retiré du chemin.
enum StoryReaderCard {
    /// Le clip vit dans l'espace NON mis à l'échelle : le rayon se compense pour
    /// rendre, après `scaleEffect`, le rayon de la carte.
    static func unscaledCornerRadius(for framing: StoryCanvasFraming.Result) -> CGFloat {
        framing.scale > 0 ? framing.cornerRadius / framing.scale : framing.cornerRadius
    }
}

extension View {

    /// **Le cadrage « carte → plein écran » d'une couche du canvas, et le fond
    /// qu'elle porte.**
    ///
    /// `background` AVANT `clipShape` : le fond est une couche de la carte, donc
    /// il se rogne avec elle. `clipShape` AVANT `scaleEffect`/`offset` :
    /// appliqué après, le clip restait sur les bornes NON déplacées — le contenu
    /// décalé vers le bas gardait un bord haut carré et se faisait rogner en bas
    /// par les coins du rectangle d'origine (bug user 2026-07-11 « haut carré,
    /// bas à moitié arrondi »).
    ///
    /// Les trois couches qui suivent la carte — le canvas sortant, le canvas
    /// courant, le chargeur — le partagent : un clip qui diverge entre elles
    /// ferait sauter la forme au moment où le chargement se retire, et un fond
    /// qui diverge ferait clignoter la bande.
    func readerCard(framing: StoryCanvasFraming.Result,
                    backdrop: SceneShape.Backdrop,
                    thumbHash: String?) -> some View {
        background(SceneBackdropView(backdrop: backdrop, thumbHash: thumbHash))
            .clipShape(RoundedRectangle(cornerRadius: StoryReaderCard.unscaledCornerRadius(for: framing),
                                        style: .continuous))
            .scaleEffect(framing.scale)
            .offset(y: framing.offset.height)
    }
}
