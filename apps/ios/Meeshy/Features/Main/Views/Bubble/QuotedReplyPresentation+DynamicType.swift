import SwiftUI

/// **Le pont entre la taille de texte du lecteur et le budget de la citation**
/// (#5103).
///
/// ## Pourquoi il vit ici, et pas dans la règle
///
/// `QuotedReplyPresentation` ne connaît aucune vue — elle rend des chaînes et
/// des entiers, les peaux les rendent. Une garde l'exige nommément
/// (`test_laRegle_estNonisolated_etNeConnaitAucuneVue`), et elle a raison :
/// une règle pure reste appelable depuis un `Task.detached` comme depuis le
/// rendu, et ses suites n'ont pas à devenir `@MainActor` pour la juger.
///
/// `DynamicTypeSize` est un type SwiftUI. Le poser dans la règle y faisait
/// entrer le rendu — la garde a rougi à la première compilation, et c'était
/// le bon verdict. La traduction vit donc ici, dans un fichier qui assume
/// d'être une vue, et **en un seul site** : les trois peaux l'appellent, aucune
/// ne recopie la table.
extension QuotedReplyPresentation {

    /// Combien de signes une ligne d'aperçu porte, à cette taille de texte.
    ///
    /// Ordres de grandeur mesurés en 12 pt sur la peau `bubble` : ~46 signes à
    /// `large`. Ils n'ont pas à être exacts — une approximation BASSE coupe un
    /// mot trop tôt, ce qui reste lisible ; une approximation haute laisse
    /// `lineLimit` reprendre la main, donc couper au milieu d'un mot. **Le sens
    /// de l'erreur est choisi, pas subi.**
    static func charactersPerLine(for dynamicTypeSize: DynamicTypeSize) -> Int {
        switch dynamicTypeSize {
        case .xSmall, .small, .medium, .large: return 46
        case .xLarge, .xxLarge:                return 38
        case .xxxLarge:                        return 32
        case .accessibility1, .accessibility2: return 26
        default:                               return 20
        }
    }

    /// Le budget d'une peau, à la taille de texte du lecteur.
    static func previewCharacterBudget(for skin: Skin,
                                       dynamicTypeSize: DynamicTypeSize) -> Int {
        previewCharacterBudget(for: skin,
                               charactersPerLine: charactersPerLine(for: dynamicTypeSize))
    }
}
