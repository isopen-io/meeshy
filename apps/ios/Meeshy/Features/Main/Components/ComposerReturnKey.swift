import Foundation

/// **La touche RETOUR du clavier ENVOIE le message** (directive porteur
/// 2026-09-05).
///
/// > « Il faut transformer le clavier virtuel qui s'affiche lors de la réponse
/// > à un message. Le bouton à la ligne doit avoir la couleur primaire et doit
/// > permettre d'envoyer le message ! »
///
/// ## Pourquoi une RÈGLE, alors que `.onSubmit` existe
///
/// Le champ du composer est `TextField(text:axis: .vertical)` — c'est ce qui
/// lui permet de grandir jusqu'à cinq lignes. Sur cet axe, la touche Retour
/// **insère un saut de ligne** ; `.submitLabel(.send)` change son libellé et,
/// selon la version d'iOS, déclenche ou non `onSubmit`. Le comportement n'est
/// pas le même sur toute la plage servie (iOS 16 → 26).
///
/// > Un contrat qui varie avec la version du système ne se garde pas par un
/// > modificateur : il se garde par ce qu'on OBSERVE. Ce que le champ observe
/// > toujours, quelle que soit la version, c'est son propre texte.
///
/// La règle regarde donc la MUTATION du texte et répond à une seule question :
/// *ce saut de ligne vient-il d'un doigt sur la touche Retour ?*
///
/// ## Les deux conditions, et ce que la seconde protège
///
/// 1. le texte se termine par un saut de ligne ;
/// 2. **il a grandi d'EXACTEMENT un caractère.**
///
/// La seconde est celle qui compte. Sans elle, coller un texte à plusieurs
/// lignes se terminant par un retour — le cas d'un copier-coller depuis un
/// e-mail ou une note — enverrait le message sans que personne ne l'ait
/// demandé. Un envoi non demandé est irréversible dans une conversation : il
/// n'y a pas d'annulation, seulement une suppression que le destinataire a
/// déjà vue passer.
///
/// > La direction de l'erreur est choisie : dans le doute, on NE PART PAS.
/// > Rater un envoi coûte une touche de plus ; envoyer par erreur coûte un
/// > message qu'on ne peut pas reprendre.
///
/// Un collage d'UN seul caractère « \n » reste indiscernable d'une frappe, et
/// c'est assumé : les deux ont la même intention lisible.
nonisolated enum ComposerReturnKey {

    /// **Ce changement de texte est-il un appui sur RETOUR ?**
    ///
    /// - Parameters:
    ///   - previous: le texte AVANT la mutation.
    ///   - current: le texte APRÈS.
    ///
    /// Pure et sans état : elle s'éprouve sans monter de champ, ce qu'un test
    /// de saisie réelle ne permet pas — le simulateur ne distingue pas une
    /// frappe d'un collage.
    static func submits(previous: String, current: String) -> Bool {
        guard current.hasSuffix("\n") else { return false }
        return current.count == previous.count + 1
    }

    /// Le texte DÉBARRASSÉ du saut de ligne que la touche vient d'insérer.
    ///
    /// Il se retire ICI et pas au site d'appel : le champ envoie ce que la
    /// règle lui rend, et un `dropLast()` recopié se serait un jour appliqué à
    /// un texte qui ne finit pas par un retour.
    static func stripped(_ text: String) -> String {
        text.hasSuffix("\n") ? String(text.dropLast()) : text
    }
}
