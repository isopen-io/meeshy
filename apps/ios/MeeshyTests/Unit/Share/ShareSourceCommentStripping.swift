import Foundation

/// Retrait des commentaires `//`/`/* */` ET des littéraux de chaîne d'une
/// source Swift, pour que les gardes de source de l'extension de partage ne
/// jugent que du code RÉELLEMENT exécuté — pas un commentaire qui cite, en
/// toutes lettres, le motif cherché, ni un littéral qui contient
/// accidentellement `//`.
///
/// Round 3 de revue (Minor) : `ShareCancelCommitGuardTests` ne filtrait AUCUN
/// commentaire avant ce round — remplacer, dans `ShareViewController.swift`,
/// `.disabled(!ShareCancelPolicy.isCancelAllowed(sendWasAttempted: sendWasAttempted))`
/// par `.disabled(isSending) // ShareCancelPolicy.isCancelAllowed(sendWasAttempted: sendWasAttempted) — désactivé temporairement`
/// aurait fait disparaître le verrou réel tout en laissant la garde verte,
/// puisqu'elle cherchait la sous-chaîne n'importe où dans le fichier aplati,
/// commentaires compris.
///
/// **Round 4 de revue (Important) — le trou n'était pas théorique.** Le
/// round 3 avait extrait une implémentation maison qui ne reconnaissait que
/// `//`/`/* */`, sans état « dans une chaîne », et affirmait à tort qu'aucune
/// source actuelle de `MeeshyShareExtension` ne contenait de `"https://…"`.
/// Faux : `ShareSession.swift` (`"https://gate.meeshy.me"` et consorts) et
/// `ShareViewController.swift:418`
/// (`content.hasPrefix("http://") || content.hasPrefix("https://")`) en
/// contiennent — sur cette dernière ligne, le `//` de `"http://"` était pris
/// pour un commentaire et effaçait ` || content.hasPrefix("https://")`, du
/// code réel. Corrigé en déléguant à `DeclarationBodyScanner.mask(_:)`
/// (`MeeshyTests/Helpers/DeclarationBodyScanner.swift`), le seul masqueur du
/// dépôt qui gère correctement l'état « dans une chaîne » (échappements
/// compris) — plutôt que d'entretenir une seconde implémentation aux
/// sémantiques différentes.
enum ShareSourceCommentStripping {
    static func strippingComments(_ source: String) -> String {
        DeclarationBodyScanner.mask(source)
    }
}
