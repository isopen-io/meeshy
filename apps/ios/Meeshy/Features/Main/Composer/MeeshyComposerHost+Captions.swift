import Foundation
import MeeshySDK
import MeeshyUI

// **La remise des LÉGENDES au publieur** (#4890, seconde moitié).
//
// Fichier à part, et pour une raison de budget autant que de responsabilité :
// `MeeshyComposerHost.swift` porte 1184 lignes contre un plafond DUR de 1200, et
// la directive du 2026-08-28 dit d'extraire AVANT d'ajouter. La coupe suit une
// question entière — « comment la légende saisie sort-elle du composer ? » — et
// n'a aucun appelant commun avec la scène, le document ou l'humeur.
//
// Le glob `MeeshyComposerHost+*.swift` d'`AppSourceGuard.unitURLs` l'attrape
// sans qu'aucune adresse soit à tenir à jour : c'est exactement pourquoi le nom
// porte celui du type hôte.

extension MeeshyComposerHost {

    /// **Ce que le composer ajoute à la charge d'accessibilité de l'atelier.**
    ///
    /// ## Le défaut mesuré le 2026-09-04
    ///
    /// `documentMediaCaptions` avait un ÉCRIVAIN (`sceneDescriptionBinding` en
    /// rôle `.caption`, #4890) et **aucun lecteur hors de son propre getter**.
    /// La légende qu'un auteur tape sur la scène d'un post ne quittait jamais
    /// l'écran : ni `performSoclePublish`, ni la télécommande, ni la porte ne la
    /// consultaient. Elle s'affichait, se validait, et mourait à la fermeture.
    ///
    /// > Le défaut est invisible depuis le site qui l'a introduit. #4890 a SÉPARÉ
    /// > deux rôles au bon endroit — le binding — et n'a mis à jour ni l'un ni
    /// > l'autre des deux avals. Le rôle `.content` a perdu son écrivain vers
    /// > `slide.content`, le rôle `.caption` n'a jamais gagné son lecteur.
    ///
    /// ## Pourquoi une FUSION, et dans ce sens-là
    ///
    /// Deux portes écrivent aujourd'hui la même colonne `PostMedia.caption` :
    /// le panneau d'accessibilité de l'atelier (`MediaAccessibilityStore`, dans
    /// le SDK) et le volet de description de la scène (ici). Deux stores pour un
    /// champ — la dérive que ce dépôt nomme partout, et qu'on ne peut pas fermer
    /// depuis l'app seule : `StoryComposerView.accessibilityStore` est un
    /// `@StateObject` privé de la vue SDK, que le meuble ne peut ni lire ni
    /// injecter. Le suivi est ouvert et nommé plutôt que masqué.
    ///
    /// En attendant, **le composer l'emporte là où il a écrit**. La raison n'est
    /// pas « le dernier gagne » (on ne sait pas lequel a été touché en dernier)
    /// mais : le volet de la scène est le seul des deux qui affiche sa légende
    /// PAR-DESSUS le média qu'elle décrit (#4993). C'est celui dont l'auteur voit
    /// le résultat, et servir l'autre ferait publier un texte qu'aucun écran ne
    /// montrait.
    ///
    /// Un média que le volet n'a jamais touché garde ce que le panneau a mis :
    /// la fusion AJOUTE, elle ne remplace pas la carte.
    func accessibilityCarryingComposerCaptions(
        _ base: ComposerMediaAccessibility,
        slides: [StorySlide]
    ) -> ComposerMediaAccessibility {
        let duComposer = ComposerSlideTextRole.canvasKeyed(
            documentMediaCaptions,
            slideIdByMediaURL: slideIdByMediaURL,
            slides: slides
        )
        guard !duComposer.isEmpty else { return base }
        return ComposerMediaAccessibility(
            mediaAlt: base.mediaAlt,
            mediaCaption: (base.mediaCaption ?? [:]).merging(duComposer) { _, composer in composer },
            allowSoundExtraction: base.allowSoundExtraction
        )
    }
}
