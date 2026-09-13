import Foundation

/// **Les émojis de réaction rapide — une liste, un site.**
///
/// Elle existait en DEUX exemplaires divergents, et personne ne pouvait le
/// voir depuis l'un ou l'autre :
///
/// | site | liste |
/// |---|---|
/// | `StoryViewerView` | ❤️ 😂 😮 🔥 😢 👏 |
/// | `MeeshyComposerHost+Intake` | 😀 ❤️ 🔥 👍 😂 🎉 |
///
/// Quatre émojis communs sur six, dans un ordre différent — assez proche pour
/// qu'un relecteur passe, assez éloigné pour que le lecteur qui apprend le
/// geste sur une story ne retrouve pas ses repères ailleurs. Un troisième site
/// (le post, le réel) aurait produit une troisième liste.
///
/// L'ordre est celui de la STORY, qui est la surface où le geste s'apprend :
/// le cœur d'abord — c'est lui que le double-tap pose et que les autres
/// surfaces servaient seul.
public enum MeeshyQuickReactions {

    /// **Quinze émojis** (#6117 — « quickEmojis doit avoir plus de
    /// possibilités », directive porteur du 2026-09-12).
    ///
    /// Elle en portait SIX, choisis pour « ce que la rangée montre sans
    /// défiler sur les gabarits les plus étroits ». Cette contrainte ne vaut
    /// plus : **six des huit hôtes montent déjà la rangée en
    /// `scrollable: true`**, et le septième l'a reçu dans le même lot. Une
    /// liste bornée par le pire gabarit privait toutes les autres surfaces de
    /// ce qu'elles pouvaient afficher.
    ///
    /// **Les quinze ne sont pas inventés ici, ils sont REPRIS** : c'est la
    /// liste que `ConversationView` sert déjà au menu d'un message, donc celle
    /// que l'utilisateur connaît. En choisir quinze autres aurait fabriqué une
    /// sixième liste dans un dépôt qui en comptait déjà cinq pour le même
    /// geste — exactement ce que ce fichier existe pour empêcher.
    ///
    /// **Ceci est le REPLI, pas le dernier mot.** Là où l'app peut le faire,
    /// elle sert `EmojiUsageTracker.topEmojis(count:defaults:)` — les émojis
    /// que CET utilisateur emploie, cette liste servant de base quand
    /// l'historique est vide. Le SDK ne peut pas l'appeler (le tracker vit
    /// dans l'app), et c'est le bon sens de la dépendance : une primitive ne
    /// lit pas l'historique d'un utilisateur.
    public static let standard: [String] = [
        "👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉",
        "💯", "😍", "👀", "🤣", "💪", "✨", "🥺",
    ]

    /// L'émoji du geste SIMPLE — double-tap, appui bref sur le cœur.
    ///
    /// Il vivait sous `StoryViewerView.heartEmoji`, et le détail d'un post
    /// comme le lecteur de réels l'empruntaient à cette troisième surface : le
    /// cœur du post dépendait du fichier du lecteur de story, et le lire n'en
    /// disait rien.
    public static let heart: String = "❤️"
}
