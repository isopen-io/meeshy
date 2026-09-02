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

    /// Six émojis : ce que la rangée montre sans défiler, sur les gabarits les
    /// plus étroits. Au-delà, `EmojiReactionPicker(scrollable:)` prend le
    /// relais — mais la rangée par DÉFAUT ne se décide pas par surface.
    public static let standard: [String] = ["❤️", "😂", "😮", "🔥", "😢", "👏"]

    /// L'émoji du geste SIMPLE — double-tap, appui bref sur le cœur.
    ///
    /// Il vivait sous `StoryViewerView.heartEmoji`, et le détail d'un post
    /// comme le lecteur de réels l'empruntaient à cette troisième surface : le
    /// cœur du post dépendait du fichier du lecteur de story, et le lire n'en
    /// disait rien.
    public static let heart: String = "❤️"
}
