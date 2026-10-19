import UIKit

/// La section unique de la liste de messages : une rangée pleine largeur à
/// hauteur ESTIMÉE (l'estimation vient du mode rendu, voir
/// `MessageListViewController.currentRowHeightEstimate`).
enum MessageListSectionLayout {
    static func section(estimate: CGFloat, horizontalInset: CGFloat) -> NSCollectionLayoutSection {
        let itemSize = NSCollectionLayoutSize(
            widthDimension: .fractionalWidth(1),
            heightDimension: .estimated(estimate)
        )
        let item = NSCollectionLayoutItem(layoutSize: itemSize)
        let groupSize = NSCollectionLayoutSize(
            widthDimension: .fractionalWidth(1),
            heightDimension: .estimated(estimate)
        )
        let group = NSCollectionLayoutGroup.vertical(layoutSize: groupSize, subitems: [item])
        let section = NSCollectionLayoutSection(group: group)
        section.interGroupSpacing = 0
        // 12pt horizontal breathing room so bubbles don't kiss the screen
        // edge — identique dans TOUS les modes depuis le retrait de la
        // loupe (spec §5 réancrée : échelle ≤ 1, aucune réserve à payer ;
        // la date de l'élu retrouve au passage sa pleine largeur).
        section.contentInsets = NSDirectionalEdgeInsets(
            top: 8,
            leading: horizontalInset,
            bottom: 8,
            trailing: horizontalInset
        )
        return section
    }
}
