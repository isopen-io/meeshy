import Foundation

/// Borne d'affichage des noms d'utilisateur dans les surfaces sociales —
/// header du reader de story, identity bar des bulles de conversation.
///
/// Règle produit (directive user 2026-07-30) : un nom d'utilisateur ne dépasse
/// jamais 16 caractères à l'écran ; au-delà on coupe et l'ellipse signale la
/// coupe. `lineLimit(1)` seul ne suffisait pas : il laissait la LARGEUR du nom
/// dicter la mise en page (le pseudo long poussait la méta qui le suit hors
/// champ) au lieu de borner le nom lui-même. La borne est appliquée à la
/// source, pas déléguée au moteur de layout.
///
/// Pur, déterministe, sans dépendance UI : le module core ne porte pas
/// `defaultIsolation(MainActor)`, ces statics sont donc `nonisolated` de fait
/// et appelables depuis n'importe quel acteur (bundle de tests inclus).
public enum DisplayName {

    /// Longueur maximale AFFICHÉE d'un nom d'utilisateur, en caractères.
    public static let maxDisplayLength = 16

    /// `name` tel quel s'il tient dans `limit` caractères, sinon ses `limit`
    /// premiers caractères suivis d'une ellipse.
    ///
    /// Compte des GRAPHÈMES (`String.count`) et non des unités UTF-16 : un
    /// emoji ou une lettre accentuée composée pèse un caractère, jamais deux —
    /// sans quoi « José » ou « 👩‍👩‍👧 » seraient coupés au milieu d'un cluster
    /// et rendus en glyphe cassé.
    public static func truncated(_ name: String,
                                 limit: Int = maxDisplayLength) -> String {
        guard limit > 0 else { return "" }
        guard name.count > limit else { return name }
        // Espaces de fin retirés AVANT l'ellipse : « Jean Baptiste …» flotte,
        // « Jean Baptiste… » colle à la coupe.
        let head = String(name.prefix(limit))
            .replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression)
        return head + "\u{2026}"
    }
}
