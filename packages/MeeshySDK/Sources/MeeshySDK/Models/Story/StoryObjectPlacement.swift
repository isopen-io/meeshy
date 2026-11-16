import CoreGraphics
import Foundation

/// **Où un objet NEUF se pose sur la scène : au centre** (décision porteur,
/// #18719).
///
/// Texte, média de premier plan, sticker et son posés atterrissent tous au
/// CENTRE, que la scène soit vide ou non. L'auteur les déplace ensuite d'un
/// doigt.
///
/// ## Ce que la règle a remplacé
///
/// #4939 décalait le second objet en cascade vers le bas à droite pour qu'il
/// ne recouvre pas le premier. À l'usage, l'objet neuf atterrissait près de la
/// colonne d'outils, loin de l'endroit où l'œil l'attend, et se lisait comme
/// mal placé. Le centre est prévisible ; un recouvrement se défait d'un geste.
///
/// Les pastilles qui ont une place DESSINÉE (lieu en bas, mention sous le
/// centre) gardent la leur : elles ne sont pas « un objet neuf quelconque ».
public enum StoryObjectPlacement {

    /// Le centre de la scène, en unités de scène (0…1).
    public static let center = CGPoint(x: 0.5, y: 0.5)
}
