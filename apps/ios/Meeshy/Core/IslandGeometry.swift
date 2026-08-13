import CoreGraphics

/// Géométrie de la Dynamic Island, en points, dans le repère de l'ÉCRAN
/// (origine au coin haut-gauche physique, avant toute safe area).
///
/// Source de vérité unique : jusqu'ici `IslandEmergingBanner` portait ses
/// propres constantes `islandWidth/islandHeight/islandTop`, dont `islandTop`
/// figé à 11 pt — juste sur un iPhone 14/15 Pro (inset 59), faux de ~3 pt sur
/// un 16 Pro (inset 62). Une capsule censée naître DANS l'îlot naissait donc à
/// côté, ce que la naissance noir-sur-noir masquait tant que le contenu était
/// invisible — plus depuis qu'il est lisible en blanc dedans.
///
/// L'îlot est **centré verticalement dans l'inset haut de la safe area** : le
/// système réserve la même marge au-dessus et en dessous. `centerY` se réduit
/// donc à `safeAreaTop / 2`, ce qui rend la position exacte sur TOUT matériel
/// à îlot sans table de correspondance par modèle.
enum IslandGeometry {
    /// Largeur de la capsule matérielle. Constante sur toute la gamme Pro
    /// (14 Pro → 16 Pro) : seule la marge autour varie, pas l'îlot.
    static let width: CGFloat = 126
    static let height: CGFloat = 37.33

    /// Inset haut minimal qui atteste d'un îlot. Un notch classique rapporte
    /// 44–50 pt, un îlot 59–62.
    static let minimumSafeAreaTop: CGFloat = 59

    /// Air minimal entre le bas de l'îlot et le haut d'un élément posé
    /// dessous. Une pastille collée à l'îlot se lit comme une excroissance du
    /// matériel, pas comme un élément d'interface (retour user 2026-08-13 :
    /// « SANS Y ETRE COLLE »).
    static let clearanceBelow: CGFloat = 12

    static func isPresent(safeAreaTop: CGFloat) -> Bool {
        safeAreaTop >= minimumSafeAreaTop
    }

    static var size: CGSize { CGSize(width: width, height: height) }

    /// Ordonnée du haut de l'îlot. `max(0, …)` borne le cas dégénéré d'un
    /// inset plus petit que l'îlot (matériel sans îlot) : la géométrie reste
    /// définie, `isPresent` étant le seul juge de sa pertinence.
    static func top(safeAreaTop: CGFloat) -> CGFloat {
        max(0, (safeAreaTop - height) / 2)
    }

    static func bottom(safeAreaTop: CGFloat) -> CGFloat {
        top(safeAreaTop: safeAreaTop) + height
    }

    /// Centre vertical de l'îlot — le point d'où part et où revient toute
    /// capsule émergente.
    static func centerY(safeAreaTop: CGFloat) -> CGFloat {
        top(safeAreaTop: safeAreaTop) + height / 2
    }

    /// Padding à appliquer sous la safe area pour qu'un élément posé respire
    /// d'au moins `clearanceBelow` sous l'îlot.
    ///
    /// La safe area laisse déjà de l'air (inset 59, bas d'îlot ≈ 48) : sur le
    /// matériel courant c'est `minimum` qui l'emporte. Le calcul n'existe que
    /// pour garantir le plancher si un futur matériel resserrait cette marge.
    static func settledTopPadding(safeAreaTop: CGFloat, minimum: CGFloat) -> CGFloat {
        max(minimum, bottom(safeAreaTop: safeAreaTop) + clearanceBelow - safeAreaTop)
    }
}
