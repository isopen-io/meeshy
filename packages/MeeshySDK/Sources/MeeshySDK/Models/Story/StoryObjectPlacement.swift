import CoreGraphics
import Foundation

/// **Où un objet NEUF se pose sur la scène** (#4939).
///
/// ## Le défaut
///
/// Les quatre familles qui posent — texte, média, son, sticker — écrivaient
/// chacune `CGPoint(x: 0.5, y: 0.5)` : le centre EXACT, sans terme de décalage,
/// sans regarder ce qui s'y trouve déjà. Deux textes se superposaient au pixel
/// près et se lisaient comme un seul texte cassé.
///
/// Pire que le chevauchement : **l'auteur ne voyait pas qu'il avait DEUX
/// objets.** Le compte de la flèche (#4935) annonçait « 2 objets » pendant que
/// l'œil n'en voyait qu'un — deux surfaces du même écran qui se contredisent.
///
/// ## Ce que cette règle ne fait PAS
///
/// Elle ne met rien en page. L'auteur POSE où il veut — c'est la doctrine de la
/// scène, et l'issue le dit. Elle décide seulement du POINT DE DÉPART, et
/// uniquement quand le centre est déjà pris.
///
/// > Sur une scène vide, le premier objet reste au centre. La règle ne déplace
/// > que ce qui aurait recouvert — sans quoi elle punirait le cas nominal pour
/// > protéger le second.
///
/// ## Pourquoi une cascade plutôt que « le premier emplacement libre »
///
/// Le second demanderait une notion de RECOUVREMENT que le modèle n'a pas : un
/// objet n'a ni largeur ni hauteur en unités de scène — un texte les tire de sa
/// police, un sticker de son gabarit. La cascade, elle, ne demande que des
/// positions, que les cinq familles exposent (`MeeshySceneObject.x` / `.y`).
///
/// C'est le motif « nouvelle fenêtre » des éditeurs de bureau : prévisible,
/// réversible d'un geste, et il n'a jamais besoin de savoir ce qu'il décale.
public enum StoryObjectPlacement {

    /// Le centre — ce que les quatre sites écrivaient en dur.
    public static let center = CGPoint(x: 0.5, y: 0.5)

    /// Le pas de la cascade, en unités de scène (0…1).
    ///
    /// 0,06 vaut ≈ 24 pt de large et ≈ 42 pt de haut sur une scène 9:16 de 390
    /// pt — assez pour que deux objets se distinguent au doigt, assez peu pour
    /// que le second reste manifestement « à côté » du premier et non ailleurs.
    public static let step: CGFloat = 0.06

    /// **La marge que la cascade ne franchit pas.**
    ///
    /// Un objet posé hors du cadre serait pire que deux objets superposés : le
    /// second au moins se voit. La cascade REVIENT donc au centre quand elle
    /// atteint le bord, plutôt que de continuer vers l'extérieur.
    public static let margin: CGFloat = 0.18

    /// Deux positions sont « au même endroit » en deçà de cette distance.
    ///
    /// La moitié du pas : plus grand, la cascade sauterait des places libres ;
    /// plus petit, deux objets posés à un cheveu l'un de l'autre passeraient
    /// pour distincts alors qu'ils se recouvrent à l'œil.
    public static let tolerance: CGFloat = step / 2

    /// Le point où poser un objet neuf, en évitant ceux qui sont déjà là.
    ///
    /// - Parameter occupied: les positions des objets POSÉS. Un fond n'en a pas
    ///   — il occupe toute la scène — et n'a donc rien à faire ici : le site
    ///   d'appel le filtre, comme `ComposerSceneObjectCount` le fait déjà.
    public static func next(avoiding occupied: [CGPoint]) -> CGPoint {
        var candidat = center
        var rang = 0
        // Le nombre de rangs est BORNÉ : au-delà, la cascade a fait le tour de
        // la zone utile et recommence au centre. Une boucle non bornée sur une
        // scène très chargée tournerait sans fin — et la superposition qu'elle
        // évite est moins grave qu'un gel.
        let rangMax = 12
        while rang < rangMax, occupied.contains(where: { proche($0, candidat) }) {
            rang += 1
            let delta = step * CGFloat(rang)
            candidat = CGPoint(x: center.x + delta, y: center.y + delta)
            if candidat.x > 1 - margin || candidat.y > 1 - margin {
                // Revenu au bord : on repart du centre en remontant vers le haut
                // à gauche, ce qui remplit l'autre diagonale avant d'abandonner.
                let retour = step * CGFloat(rang - rangMax / 2)
                candidat = CGPoint(x: center.x - retour, y: center.y - retour)
            }
        }
        return CGPoint(x: min(max(candidat.x, margin), 1 - margin),
                       y: min(max(candidat.y, margin), 1 - margin))
    }

    private static func proche(_ a: CGPoint, _ b: CGPoint) -> Bool {
        abs(a.x - b.x) < tolerance && abs(a.y - b.y) < tolerance
    }
}
