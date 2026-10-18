import Foundation

/// **LE HERO DU SUPPORT** (#10915) — LOIS PURES, miroir de
/// `apps/web/src/lib/export/message-card-hero.ts`.
///
/// Un commentaire de post, de réel ou de story s'image avec le MÉDIA du support
/// en tête de la carte : grand, pleine largeur, AVANT tout texte ; puis la ligne
/// du support (auteur + extrait court), puis le commentaire. Le hero n'est pas
/// un média de la réponse : il a sa place, sa hauteur, et ne compte pas dans la
/// grille du corps.
public enum MessageCardHero {

    /// La marge entre le bord de la carte et le hero, de chaque côté (la colonne de texte en a 96).
    public static let margin: Double = 48
    /// Le rapport hauteur / largeur permis : du 16:9 (0,5625) au 4:5 (1,25) — au-delà, le hero est recadré.
    public static let ratioRange: ClosedRange<Double> = 0.5625...1.25
    /// Le rapport d'un hero dont on ne connaît pas encore les côtés : 4:3.
    public static let unknownRatio: Double = 0.75
    /// La part du budget de hauteur qu'un hero ne dépasse jamais : le texte garde sa place.
    public static let maxShare: Double = 0.45
    /// L'espace entre le hero et la ligne du support.
    public static let gap: Double = 40
    /// L'extrait du support quand il suit un hero : deux lignes, 140 caractères.
    public static let excerptLines = 2
    public static let excerptCharacters = 140

    /// Le cadre horizontal du hero : `x` et `width`. Une colonne d'en-tête verticale
    /// le ramène sur la colonne de texte (`textLeft`, `textWidth`).
    public static func span(canvasWidth: Double, verticalHeader: Bool, textLeft: Double, textWidth: Double) -> (x: Double, width: Double) {
        verticalHeader ? (textLeft, textWidth) : (margin, canvasWidth - 2 * margin)
    }

    /// La hauteur du hero : sa largeur × son rapport (borné à `ratioRange`, `unknownRatio`
    /// sans côtés connus), sans dépasser `maxShare` du budget. Les médias plus hauts sont recadrés.
    public static func height(aspect: Double, aspectKnown: Bool, width: Double, budget: Double) -> Double {
        let ratio: Double
        if aspectKnown, aspect.isFinite, aspect > 0 {
            ratio = min(ratioRange.upperBound, max(ratioRange.lowerBound, 1 / aspect))
        } else {
            ratio = unknownRatio
        }
        return min((width * ratio).rounded(), (budget * maxShare).rounded(.down))
    }
}
