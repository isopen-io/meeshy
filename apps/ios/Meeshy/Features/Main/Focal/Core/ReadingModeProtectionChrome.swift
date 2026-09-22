import Foundation

/// **Quel fichier rend le chrome de protection, pour CHAQUE mode de lecture**
/// (#7452).
///
/// ## Pourquoi cette table existe
///
/// La directive porteur ne demande pas un décompte dans trois modes : elle
/// demande qu'il y en ait un « en Script, Focal ou bulle **ou tout autre
/// affichage plus tard** ». Un correctif qui ajoute deux badges satisfait la
/// première moitié et rate la seconde — et le relevé sur `dev` 3ff99d3aa3
/// montre exactement comment : Rivière et Résumé sont nés APRÈS la bulle, et
/// personne n'a eu à déclarer, en les écrivant, ce qu'ils faisaient des
/// messages protégés. Rien ne le leur demandait.
///
/// Ce `switch` exhaustif le demande. Un sixième mode ne peut pas naître sans
/// dire quel fichier porte son chrome, et la garde
/// (`ReadingModeProtectionChromeGuardTests`) vérifie que ce fichier le rend
/// vraiment. La table ne REMPLACE pas le rendu — elle rend impossible de
/// l'oublier en silence.
///
/// **Ce n'est pas une liste, c'est un `switch`.** Une liste écrite à la main
/// resterait verte en oubliant un cas ; un `switch` sur
/// `ConversationReadingMode` ne compile pas tant que les cinq cas ne sont pas
/// couverts.
nonisolated enum ReadingModeProtectionChrome {

    /// Le fichier SOURCE qui monte `MessageProtectionChrome` pour ce mode,
    /// relatif à `apps/ios/Meeshy/`.
    static func rendererPath(for mode: ReadingModeOrchestrator.ConversationReadingMode) -> String {
        switch mode {
        // Focal et Script partagent la rangée plate : un seul fichier, deux
        // modes — c'est déjà le cas pour l'identité, la méta et les badges.
        case .focal, .script:
            return "Features/Main/Focal/Row/FocalRow.swift"
        case .bubbles:
            return "Features/Main/Views/Bubble/BubbleStandardLayout.swift"
        case .river:
            return "Features/Main/Riviere/View/RiverBubbleView.swift"
        // Le Résumé ne rend pas de bulle : il ne montre AUCUN texte protégé
        // (le digest est une copie, qu'aucune échéance n'atteint). Il désigne
        // les messages protégés dans leur propre section, avec le même chrome.
        case .summary:
            return "Features/Main/Focal/Summary/SummaryProtectionsView.swift"
        }
    }
}
