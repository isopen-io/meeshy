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
/// **Le champ vaut ce que dit CELUI QUI A ENVOYÉ — et qui a envoyé se DIT, il
/// ne se devine pas** (#9311).
///
/// - `.host` — l'hôte a fourni `onCustomSend:` (la conversation) : il prend le
///   texte de SA source et la vide lui-même. Il a vidé ⇒ le champ se vide ; il
///   n'a pas bougé (donc il a refusé) ⇒ le champ garde ce qu'on venait d'y
///   pousser.
/// - `.composer` — la barre a envoyé elle-même (`onSendMessage:` / `onSend:`) :
///   `handleSend` a déjà vidé son état, ou l'a laissé intact s'il a refusé. La
///   source de l'hôte ne dit alors RIEN de l'envoi : les hôtes de commentaires,
///   de canvas de story et de réponse média ne la vident jamais. Y lire un
///   refus ressuscitait le texte qu'on venait d'envoyer (#9311).
nonisolated enum ComposerFieldAfterSend {

    /// Qui a pris l'envoi — et donc le vidage — en charge.
    enum Sender: Equatable {
        case host
        case composer

        /// `onCustomSend` fourni ⇒ l'hôte ; absent ⇒ la barre.
        init(hasCustomSend: Bool) {
            self = hasCustomSend ? .host : .composer
        }
    }

    /// - Parameters:
    ///   - local: le texte que la barre porte dans son `@State`, après `handleSend`.
    ///   - host: la valeur du `textBinding` APRÈS l'envoi — `nil` quand aucun
    ///     hôte n'en tient.
    ///   - sender: qui a envoyé (`Sender(hasCustomSend:)`).
    static func resolve(local: String, host: String?, sender: Sender) -> String {
        switch sender {
        case .host: host ?? local
        case .composer: local
        }
    }
}
