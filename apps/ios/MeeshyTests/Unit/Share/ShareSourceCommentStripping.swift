import Foundation

/// Retrait des commentaires `//` et `/* */` d'une source Swift, pour que les
/// gardes de source de l'extension de partage ne jugent que du code
/// RÉELLEMENT exécuté — pas un commentaire qui cite, en toutes lettres, le
/// motif cherché.
///
/// Round 3 de revue (Minor) : `ShareCancelCommitGuardTests` ne filtrait AUCUN
/// commentaire avant ce round — remplacer, dans `ShareViewController.swift`,
/// `.disabled(!ShareCancelPolicy.isCancelAllowed(sendWasAttempted: sendWasAttempted))`
/// par `.disabled(isSending) // ShareCancelPolicy.isCancelAllowed(sendWasAttempted: sendWasAttempted) — désactivé temporairement`
/// aurait fait disparaître le verrou réel tout en laissant la garde verte,
/// puisqu'elle cherchait la sous-chaîne n'importe où dans le fichier aplati,
/// commentaires compris. Extrait de l'implémentation déjà utilisée par
/// `ShareExtensionSourceGuardTests` plutôt que d'en écrire une seconde — voir
/// `ShareCancelCommitGuardTests.condensed(_:)` pour le second appelant.
///
/// **Constat (round 3)** : ne retire PAS le contenu des littéraux de chaîne,
/// malgré ce que l'ancienne documentation de cette fonction (dans
/// `ShareExtensionSourceGuardTests`) affirmait. Seuls `//` et `/* */` sont
/// reconnus ; il n'y a aucun état « dans une chaîne ». Un `"http://…"` ou un
/// `"// pas un commentaire"` À L'INTÉRIEUR d'un littéral serait donc, à tort,
/// traité comme le début d'un commentaire. Vérifié : aucune source actuelle
/// de `MeeshyShareExtension` ne contient un tel littéral, donc le risque
/// n'est pas matérialisé aujourd'hui — mais la fonction ne fait pas ce que sa
/// documentation d'origine annonçait.
enum ShareSourceCommentStripping {
    static func strippingComments(_ source: String) -> String {
        var output = ""
        var iterator = source.startIndex
        var inLineComment = false
        var inBlockComment = false

        while iterator < source.endIndex {
            let remaining = source[iterator...]
            if inLineComment {
                if source[iterator] == "\n" { inLineComment = false; output.append("\n") }
                iterator = source.index(after: iterator)
                continue
            }
            if inBlockComment {
                if remaining.hasPrefix("*/") {
                    inBlockComment = false
                    iterator = source.index(iterator, offsetBy: 2)
                    continue
                }
                iterator = source.index(after: iterator)
                continue
            }
            if remaining.hasPrefix("//") {
                inLineComment = true
                iterator = source.index(iterator, offsetBy: 2)
                continue
            }
            if remaining.hasPrefix("/*") {
                inBlockComment = true
                iterator = source.index(iterator, offsetBy: 2)
                continue
            }
            output.append(source[iterator])
            iterator = source.index(after: iterator)
        }
        return output
    }
}
