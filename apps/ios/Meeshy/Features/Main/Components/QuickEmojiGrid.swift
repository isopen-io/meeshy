import CoreGraphics

/// **Les emojis rapides de l'emplacement d'action** (#7931, directive porteur
/// 2026-09-25 : « diminue la taille des emoji qu'on peut envoyer rapidement
/// pour avoir 5 emoji 2 par rangée »).
///
/// Cinq emojis sur deux rangées — trois puis deux — dans la hauteur FIXE de
/// 44 pt de l'emplacement : deux cellules de 21 pt et leur gouttière. Chacune
/// passe sous la cible tactile de 44 pt ; c'est l'écart que la directive
/// assume, et l'appui long vers la feuille des emojis en est le recours.
nonisolated enum QuickEmojiGrid {

    static let count = 5
    static let cell: CGFloat = 21
    static let spacing: CGFloat = 2
    static let firstRowCount = 3

    /// La largeur de la rangée la plus longue.
    static var width: CGFloat {
        CGFloat(firstRowCount) * cell + CGFloat(firstRowCount - 1) * spacing
    }

    /// Trois puis deux ; jamais plus de cinq, jamais de rangée vide.
    static func rows(_ emojis: [String]) -> [[String]] {
        let servis = Array(emojis.prefix(count))
        return [Array(servis.prefix(firstRowCount)), Array(servis.dropFirst(firstRowCount))]
            .filter { !$0.isEmpty }
    }
}
