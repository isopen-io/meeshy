import Foundation

/// **Ce que la barre de composition fait de son texte quand l'hôte a envoyé**
/// (#5961).
///
/// `UniversalComposerBar.text` est un `@State` LOCAL ; `textBinding` est la
/// source que l'hôte lit et vide. La synchro `text` → `textBinding` est
/// DIFFÉRÉE d'un tour de rendu : sans alignement explicite au moment de
/// l'envoi, elle re-pousse l'ancien texte APRÈS que l'hôte l'a vidé, et le
/// champ ressuscite ce qui vient de partir.
///
/// La règle est PURE parce que c'est la DÉCISION qui se teste — pas le rendu
/// SwiftUI, où la course qu'elle ferme est justement invisible.
enum ComposerSendAlignment {

    /// `true` quand l'hôte a vidé sa source et que la barre porte encore du
    /// texte : elle doit s'aligner.
    ///
    /// - `hostText == nil` : la barre n'a pas d'hôte (composer de story,
    ///   aperçu) — c'est `handleSend` lui-même qui vide, rien à aligner.
    /// - `hostText` non vide : l'hôte a GARDÉ le texte (envoi refusé, édition
    ///   à corriger). S'aligner le détruirait.
    /// - champ déjà vide : ne rien écrire, sinon chaque envoi relance un
    ///   `onChange` pour rien.
    nonisolated static func shouldClearLocalText(hostText: String?, localText: String) -> Bool {
        guard let hostText else { return false }
        return hostText.isEmpty && !localText.isEmpty
    }
}
