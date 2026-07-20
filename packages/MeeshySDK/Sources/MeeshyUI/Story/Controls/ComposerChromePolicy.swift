import Foundation

/// Règle UNIQUE de visibilité du chrome plein du composer (C-DIR2, directive
/// user 2026-07-04) : le header (X / strip / visibilité / preview / Publier / ⋯)
/// apparaît sous les MÊMES conditions que la colonne de FABs — canvas plein
/// écran, aucun panneau ouvert, aucune édition de composant en cours, pas de
/// zoom viewport. Pendant l'édition (texte, dessin, panneau band), le chrome
/// est inutile : on n'affiche que ce qui sert à l'instant t.
public nonisolated enum ComposerChromePolicy {

    public static func fullChromeVisible(
        fabsVisible: Bool,
        bandHidden: Bool,
        isTextEditing: Bool,
        isDrawingActive: Bool,
        isViewportZoomed: Bool,
        isTimelineVisible: Bool = false
    ) -> Bool {
        fabsVisible
            && bandHidden
            && !isTextEditing
            && !isDrawingActive
            && !isViewportZoomed
            && !isTimelineVisible
    }
}
