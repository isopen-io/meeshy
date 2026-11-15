import UIKit

/// **Le clavier se referme quand un menu de message s'ouvre.**
///
/// Un appui long sur une bulle ouvre un menu ; si le clavier est levé, ce menu
/// s'affiche DERRIÈRE lui — visible en partie, souvent pas du tout, et ses
/// entrées basses restent hors d'atteinte. Le geste a l'air de n'avoir rien
/// fait.
///
/// ### Pourquoi le premier répondeur, et pas un `@FocusState`
///
/// Le fil ouvert porte bien un `@FocusState` (`ConversationView.isTyping`),
/// mais il n'est pas le seul à pouvoir détenir le clavier : la barre de
/// recherche, une légende de média, un champ de réponse dans le viewer. Un
/// site qui fermerait UN de ces champs laisserait les autres ouverts, et la
/// liste de ce qu'il faut penser à fermer grandit à chaque écran ajouté.
/// Relâcher le premier répondeur ferme celui qui détient RÉELLEMENT le clavier,
/// quel qu'il soit, sans que ce site ait à les connaître.
///
/// ### Un seul site, appelé par les DEUX chemins du menu
///
/// Le menu d'un message a deux implémentations mutuellement exclusives — le
/// geste custom en surcouche (< iOS 26) et le `.contextMenu` natif (≥ iOS 26).
/// Poser la fermeture sur le seul chemin custom laisserait les appareils iOS 26
/// avec le défaut intact ; les faire appeler le même site est ce qu'un témoin
/// peut vérifier par un nom unique.
///
/// L'idiome `sendAction(resignFirstResponder)` est écrit à six autres endroits
/// du dépôt (composeur, éditeur d'objet, canvas de story, encart de réponse
/// média). Les y ramener est un lot à part — un correctif de défaut ne réécrit
/// pas six vues qu'il ne touche pas — mais ce site-ci porte désormais la règle
/// pour les menus de message, et il est le seul à le faire.
enum MessageMenuKeyboard {

    /// Referme le clavier s'il est levé. Sans effet s'il ne l'est pas — le
    /// `sendAction` ne trouve alors aucun répondeur et rend `false`, ce qui
    /// n'est pas une erreur : c'est le cas nominal d'un appui long fait
    /// clavier baissé.
    @MainActor
    static func dismiss() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }
}
