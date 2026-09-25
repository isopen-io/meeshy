import CoreGraphics

/// **Les emojis rapides de l'emplacement d'action** (#7931, directive porteur
/// 2026-09-25 : « diminue la taille des emoji qu'on peut envoyer rapidement
/// pour avoir 5 emoji 2 par rangée »).
///
/// Cinq emojis sur deux rangées — trois puis deux. Le cadre qui les porte
/// prend TOUT le côté droit du composeur (directive porteur 2026-09-25 :
/// « fais en sorte que le cadre prenne tout le côté droit ») : il monte du bas
/// de la ligne de saisie jusqu'au haut de la barre d'outils, dont la droite
/// est vide tant que le champ l'est. Chaque cellule reste sous la cible
/// tactile de 44 pt ; l'appui long vers la feuille des emojis en est le
/// recours.
nonisolated enum QuickEmojiGrid {

    static let count = 5
    static let cell: CGFloat = 32
    static let spacing: CGFloat = 3
    static let inset: CGFloat = 4
    static let emojiSize: CGFloat = 24
    static let firstRowCount = 3
    /// La hauteur de la ligne de saisie, où le cadre prend pied.
    static let rowHeight: CGFloat = 44
    /// Ce qui sépare la barre d'outils de la ligne de saisie : le bas de l'une
    /// (2) et le haut de l'autre (10).
    static let toolbarGap: CGFloat = 12

    /// La largeur de la rangée la plus longue.
    static var width: CGFloat {
        CGFloat(firstRowCount) * cell + CGFloat(firstRowCount - 1) * spacing
    }

    /// La largeur du cadre de verre, et donc celle que la ligne lui réserve.
    static var frameWidth: CGFloat { width + 2 * inset }

    /// La hauteur des deux rangées.
    static var contentHeight: CGFloat { 2 * cell + spacing }

    /// Le cadre couvre la ligne de saisie ET la barre d'outils mesurée ; sans
    /// barre, il ne descend jamais sous la ligne ni sous ses deux rangées.
    static func frameHeight(toolbarHeight: CGFloat) -> CGFloat {
        guard toolbarHeight > 0 else { return max(rowHeight, contentHeight + 2 * inset) }
        return max(rowHeight + toolbarGap + toolbarHeight, contentHeight + 2 * inset)
    }

    /// Trois puis deux ; jamais plus de cinq, jamais de rangée vide.
    static func rows(_ emojis: [String]) -> [[String]] {
        let servis = Array(emojis.prefix(count))
        return [Array(servis.prefix(firstRowCount)), Array(servis.dropFirst(firstRowCount))]
            .filter { !$0.isEmpty }
    }
}
