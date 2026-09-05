import UIKit

/// **À qui appartient une touche posée sur le champ de saisie en ligne ?**
/// (#5099)
///
/// ## Le défaut
///
/// > Directive porteur 2026-09-04 : « Il faut rendre coherent le fait de toucher
/// > le placeholder d'avoir le clavier qui s'affiche ! Il faut absolument
/// > permettre de pouvoir d'avoir une cohérence de manipulation totale sur les
/// > vues plein écran ! »
///
/// `StoryCanvasUIView` monte le `StoryInlineTextEditor` en SOUS-VUE et pose ses
/// propres reconnaisseurs sur lui-même. Un `UITapGestureRecognizer` a
/// `cancelsTouchesInView == true` par défaut : dès qu'il se reconnaît, UIKit
/// **annule** les touches en cours dans la hiérarchie qu'il surplombe. Le tap
/// posé sur le champ n'atteignait donc jamais le `UITextView` — et un
/// `UITextView` qui ne reçoit pas son tap ne devient pas premier répondeur,
/// donc **pas de clavier**.
///
/// Le symptôme le plus visible est celui que la directive nomme : sur un texte
/// VIDE, ce qu'on voit est le placeholder, et le toucher ne faisait rien.
/// L'hôte plein écran y ajoutait sa propre garde (`id != objectId`), ce qui
/// donnait l'impression d'une décision d'écran alors que la cause était ici,
/// une couche plus bas, et valait pour **tous** les hôtes du canvas.
///
/// > **Un geste qui ne produit rien n'a pas forcément de destinataire manquant :
/// > il peut en avoir DEUX, dont l'un annule l'autre.** La question à poser
/// > n'est pas seulement « qui écoute ce tap ? » mais **« qui le lui prend ? »**
/// > — et `cancelsTouchesInView` prend sans rien journaliser.
///
/// ## La règle, en une phrase
///
/// **Un champ de saisie possède les touches qui tombent sur lui.** Le canvas ne
/// les lui dispute pas : ni pour sélectionner, ni pour déplacer, ni pour zoomer.
/// C'est le comportement que tout utilisateur d'iOS a déjà appris ailleurs, et
/// le rétablir ne retire aucun geste — les touches posées AILLEURS que sur le
/// champ continuent d'arriver au canvas exactement comme avant, y compris celles
/// qui désignent un autre objet pendant l'édition.
///
/// ## Pourquoi la descendance, et pas l'identité
///
/// `touch.view` n'est presque jamais le `UITextView` lui-même : UIKit rend la
/// sous-vue interne qui porte le texte, la sélection ou le curseur. Comparer par
/// `===` laisserait donc passer le cas nominal — la règle serait posée, verte,
/// et sans effet. C'est la forme exacte d'un contrôle qui ment.
nonisolated enum StoryCanvasInlineEditTouchPolicy {

    /// `true` si le canvas doit recevoir cette touche.
    ///
    /// - `touched` : `UITouch.view`, la vue que UIKit a élue par hit-test.
    /// - `inlineEditor` : le champ monté, ou `nil` quand aucune édition n'est en
    ///   cours — auquel cas rien n'est disputé et tout revient au canvas.
    static func canvasReceives(touched: UIView?, inlineEditor: UIView?) -> Bool {
        guard let inlineEditor, let touched else { return true }
        return !(touched === inlineEditor || touched.isDescendant(of: inlineEditor))
    }
}
