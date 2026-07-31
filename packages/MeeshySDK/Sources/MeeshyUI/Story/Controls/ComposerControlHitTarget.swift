import SwiftUI

/// Métriques partagées des commandes du chrome composer.
public nonisolated enum ComposerControlMetrics {
    /// Diamètre VISUEL de la pastille de verre — le rendu de la pastille ne
    /// bouge pas, seule sa boîte de layout s'élargit sous elle.
    public static let visualDiameter: CGFloat = 36

    /// Côté minimal de la zone de CONTACT (HIG ≥ 44 pt, critère D1). Mesures
    /// avant correction, faites sur le code : pastilles de header Ø36, capsule
    /// d'audience ~27 pt, poignée de restauration du chrome 37 pt (5 + 16 + 16),
    /// reset de zoom 30 pt, chips de couche ~19 pt.
    public static let hitDiameter: CGFloat = 44

    /// Marge transparente ajoutée de CHAQUE côté d'une pastille de 36.
    public static let hitInset: CGFloat = (hitDiameter - visualDiameter) / 2

    /// Interstice de LAYOUT du groupe d'actions du header. Zéro : chaque boîte
    /// de 44 pt porte déjà `hitInset` de marge transparente par côté, donc
    /// l'écart VISUEL entre deux pastilles vaut `2 × hitInset` = 8 pt (6 avant
    /// — écart de rendu de 2 pt assumé) et les cibles sont exactement
    /// jointives, jamais chevauchantes. Un interstice de 6 pt conservé aurait
    /// donné 14 pt d'écart visuel ; un débord sans élargir la boîte de layout
    /// ne fonctionne pas (vérifié au simulateur : un tap 2 pt sous « Aperçu »
    /// traversait vers le canvas).
    public static let groupSpacing: CGFloat = 0

    /// Distance de morphing du verre (`GlassEffectContainer`) — un paramètre
    /// d'EFFET, pas de layout : il doit suivre l'écart visuel réel pour que les
    /// pastilles adjacentes continuent de fusionner sous iOS 26.
    public static let glassBlendSpacing: CGFloat = 2 * hitInset

    /// Interstice de layout de la colonne annuler/rétablir : son écart visuel
    /// de 10 pt est conservé À L'IDENTIQUE (10 − 2 × hitInset).
    public static let columnSpacing: CGFloat = 10 - 2 * hitInset
}

extension View {
    /// Porte la zone de contact à ≥ 44×44 pt sans toucher au RENDU : la pastille
    /// garde son diamètre visuel, seule la boîte de layout qui la porte est
    /// élargie, et les interstices voisins sont réduits d'autant
    /// (`ComposerControlMetrics.groupSpacing` / `.columnSpacing`).
    ///
    /// Élargir la boîte plutôt que déborder par un `.background` est le seul
    /// procédé qui étende réellement le hit-test : SwiftUI ne teste pas les
    /// couches de fond au-delà de la frame de la vue primaire.
    ///
    /// La forme de contact est un rectangle plein et non le cercle inscrit : sur
    /// une pastille circulaire, les coins gagnés restent dans la boîte du
    /// contrôle, et à interstice nul deux voisins sont jointifs sans jamais se
    /// recouvrir.
    func composerHitTarget() -> some View {
        frame(minWidth: ComposerControlMetrics.hitDiameter,
              minHeight: ComposerControlMetrics.hitDiameter)
            .contentShape(Rectangle())
    }
}
