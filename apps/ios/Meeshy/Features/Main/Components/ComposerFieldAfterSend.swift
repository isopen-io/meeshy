import Foundation

/// **Ce que vaut le champ APRÈS un envoi — et pourquoi ce n'est pas « rien »**
/// (directive porteur 2026-09-06, #5326 : « lorsqu'on envoie par le bouton du
/// clavier, il faut nettoyer le contenu de la zone de texte »).
///
/// ## Le défaut, qui est une COURSE et pas un oubli
///
/// Le chemin de la touche Retour (`ComposerReturnKey`) retire le saut de ligne
/// puis appelle `handleSend()`. Sur ce chemin, l'hôte — la conversation — prend
/// le texte de SA source (`composerText.text`) et la vide SYNCHRONEMENT. Le
/// `text` local de la barre, lui, vaut encore « Bonjour », et
/// `.adaptiveOnChange(of: text)` le repousse vers `textBinding` au rendu
/// suivant : **le texte ressuscite dans le champ juste après son envoi.** C'est
/// mot pour mot le défaut déjà payé sur `sendQuickEmoji` (2026-08-27, documenté
/// dans `UniversalComposerBar+Send.swift`) ; il n'avait pas été porté ici.
///
/// ## Pourquoi pas `text = ""`
///
/// Parce que l'envoi peut ne pas avoir eu lieu. `sendMessageWithAttachments`
/// refuse sur `isUploading` et sur un contenu jugé vide ; `submitEdit` a ses
/// propres gardes. Vider sans condition effacerait une saisie que PERSONNE n'a
/// envoyée.
///
/// > La direction de l'erreur est choisie, comme pour `ComposerReturnKey` :
/// > laisser un texte de trop coûte une touche ; en perdre un coûte ce que
/// > l'auteur venait d'écrire.
///
/// ## La règle
///
/// **Dès qu'un hôte tient le texte, il EN EST la source — après l'envoi comme
/// avant.** Il a vidé ⇒ le champ se vide ; il n'a pas bougé (donc il a refusé)
/// ⇒ le champ garde ce qu'on venait d'y pousser. Rien à deviner, rien à
/// chronométrer : on LIT ce que l'hôte dit, exactement comme `ComposerReturnKey`
/// lit ce que le champ observe plutôt que d'interroger le clavier.
nonisolated enum ComposerFieldAfterSend {

    /// - Parameters:
    ///   - local: le texte que la barre porte dans son `@State`.
    ///   - host: la valeur du `textBinding` APRÈS l'envoi — `nil` quand aucun
    ///     hôte n'en tient (la barre est alors seule maître, et `handleSend`
    ///     a déjà remis son état à zéro).
    static func resolve(local: String, host: String?) -> String {
        host ?? local
    }
}
