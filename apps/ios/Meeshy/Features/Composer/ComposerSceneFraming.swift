import CoreGraphics

/// **Ce qui borne la scène par le bas** (#13839, L3).
///
/// Deux obstacles peuvent monter sous la scène : les étages du panneau d'un
/// outil, et une feuille ancrée du compositeur. Ni l'un ni l'autre ne la couvre :
/// la scène se réduit, entière et en 9:16, au-dessus du plus haut des deux
/// (`ComposerSceneFit.lift`). Les obstacles arrivent en coordonnées globales ;
/// le bas visible se rend dans le repère de la zone de la scène.
nonisolated enum ComposerSceneFraming {

    static func visibleBottom(zoneHeight: CGFloat, zoneMinY: CGFloat, obstructionTops: [CGFloat?]) -> CGFloat {
        let bornes = obstructionTops
            .compactMap { $0 }
            .filter(\.isFinite)
            .map { $0 - zoneMinY }
        let bas = ([zoneHeight] + bornes).min() ?? zoneHeight
        return max(bas, 0)
    }

    /// Une feuille ouverte retire les surimpressions du repos : on ne règle
    /// qu'une chose à la fois, et ✕ ou Publier sous le doigt pendant qu'on
    /// choisit un sticker seraient des gestes qu'on n'a pas demandés.
    static func restChromeIsShown(sheetIsOpen: Bool) -> Bool { !sheetIsOpen }
}
