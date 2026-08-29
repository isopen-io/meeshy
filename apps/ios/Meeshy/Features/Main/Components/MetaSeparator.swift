import SwiftUI

/// **Le point qui sépare — décoratif PAR CONSTRUCTION.**
///
/// Le point médian qui articule une rangée méta (« Marie · il y a 3 min ·
/// 🇫🇷 ») est une ponctuation VISUELLE : il dit à l'œil où finit un champ et où
/// commence le suivant. À VoiceOver, il ne dit rien — il s'annonce, et le
/// lecteur entend « point » entre chaque information des surfaces les plus
/// denses du produit (fil, détail d'une publication, reels, stories, fiche de
/// conversation).
///
/// Le dépôt CONNAISSAIT la règle : huit sites posaient déjà
/// `.accessibilityHidden(true)`, dont un sous le commentaire
/// « decorative separator — not announced to VoiceOver ». **Vingt autres ne la
/// posaient pas.** Le savoir était écrit, daté, exact — et n'avait voyagé que
/// vers huit sites sur vingt-huit.
///
/// > C'est la forme, côté arbre d'accessibilité, du défaut que 250i a nommé sur
/// > la géométrie : une règle appliquée à la main se répand aussi loin que la
/// > mémoire de celui qui la pose, jamais plus loin. **Une règle qu'on peut
/// > oublier de poser doit devenir une chose qu'on ne peut pas écrire
/// > autrement.** Ici, le point ne s'écrit plus qu'à cet endroit, et il naît
/// > muet.
///
/// ### Pourquoi aucun paramètre
///
/// Les vingt-huit sites stylaient leur point différemment (`.caption`,
/// `MeeshyFont.relative(10…13)`, `theme.textMuted`, `.white.opacity(0.55)`…).
/// Le composant n'en prend AUCUN : les modificateurs chaînés du site
/// s'appliquent à lui exactement comme ils s'appliquaient au `Text` — `.font` et
/// `.foregroundColor` se propagent par l'environnement jusqu'au `Text` interne.
///
/// C'est délibéré, et la première écriture faisait l'inverse : un
/// `MetaSeparator(font:color:)` qui posait `.font(font)` avec un `font` nil.
/// **`.font(nil)` n'hérite pas — il REMET la police d'environnement à nil**, et
/// aurait donc effacé le style des huit sites qui ne fixaient que la couleur.
/// Un composant sans paramètre rend la conversion mécanique et sans risque :
/// seul le jeton `Text("·")` change.
struct MetaSeparator: View {

    /// Le glyphe, unique : le point médian que les vingt-huit sites écrivaient,
    /// sous sa forme littérale (`·`) ou échappée (`\u{00B7}`).
    static let glyph = "\u{00B7}"

    var body: some View {
        Text(Self.glyph)
            .accessibilityHidden(true)
    }
}
