import CoreGraphics

/// **La largeur de texte d'un rang de la liste, depuis la colonne MESURÉE.**
///
/// Sur iPad la colonne de liste se redimensionne (320 à 480 pt, `ColumnWidthLaw`) : l'ancienne règle
/// supposait 42 % de la fenêtre. À 30 % d'une fenêtre de 1 024 pt, le rang budgétait ~430 pt pour une colonne de
/// ~307 — les étiquettes débordaient. La liste mesure désormais sa propre largeur ; la fenêtre ne sert que de repli
/// le temps de la première mesure.
nonisolated enum ConversationRowWidthLaw {
    /// Marges internes (32), avatar (52), pastille (28) et espacements (24).
    static let chrome: CGFloat = 32 + 52 + 28 + 24
    static let minimum: CGFloat = 120

    static func textWidth(listWidth: CGFloat, windowWidth: CGFloat, isRegular: Bool) -> CGFloat {
        let column: CGFloat
        if listWidth > 0 {
            column = listWidth - 32
        } else {
            column = isRegular ? min(windowWidth * 0.42, 520) : windowWidth - 32
        }
        return max(minimum, column - chrome)
    }
}
