import Foundation

/// Disposition de la grille d'un appel de groupe (#3585) : des tuiles de même
/// taille, la tuile locale comprise, remplies ligne par ligne dans l'ordre
/// d'arrivée. 1 → plein écran ; 2 → empilées (côte à côte en paysage) ;
/// 3-4 → 2×2 ; 5-6 → 2×3 en portrait, 3×2 en paysage. Au-delà du plafond
/// du maillage, la grille reste celle de 6.
struct GroupCallGridLayout: Equatable, Sendable {
    let columns: Int
    let rows: Int

    var capacity: Int { columns * rows }

    static func layout(tileCount: Int, isLandscape: Bool) -> GroupCallGridLayout {
        switch max(1, tileCount) {
        case 1:
            return GroupCallGridLayout(columns: 1, rows: 1)
        case 2:
            return isLandscape ? GroupCallGridLayout(columns: 2, rows: 1) : GroupCallGridLayout(columns: 1, rows: 2)
        case 3, 4:
            return GroupCallGridLayout(columns: 2, rows: 2)
        default:
            return isLandscape ? GroupCallGridLayout(columns: 3, rows: 2) : GroupCallGridLayout(columns: 2, rows: 3)
        }
    }
}
