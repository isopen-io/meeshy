import CoreGraphics

/// **Ce que le clavier cache réellement de la fenêtre du composeur de story.**
///
/// La hauteur BRUTE de la trame (`keyboardFrameEndUserInfoKey`) n'est vraie que pour un clavier d'iPhone ancré sous
/// une fenêtre plein écran. Sur iPad : un clavier flottant ou scindé ne recouvre pas le bas de la fenêtre, une fenêtre
/// Stage Manager s'arrête au-dessus du bas de l'écran, et un clavier physique n'annonce que sa barre de raccourcis.
/// Les deux trames sont en coordonnées d'écran.
nonisolated enum StoryKeyboardOverlap {
    /// - Parameters:
    ///   - keyboardEndFrame: trame de FIN annoncée par la notification (coordonnées d'écran).
    ///   - windowFrame: trame de la fenêtre du composeur, en coordonnées d'écran ; `nil` sans fenêtre résolue.
    ///   - current: le soulèvement en cours — gardé quand la trame est dégénérée (elle n'annonce rien).
    ///   - screenBounds: repli quand la fenêtre n'est pas résolue.
    static func height(keyboardEndFrame keyboard: CGRect, windowFrame: CGRect?, current: CGFloat,
                       screenBounds: CGRect? = nil) -> CGFloat {
        guard keyboard.width > 0, keyboard.height > 0 else { return current }
        let area = windowFrame ?? screenBounds ?? CGRect(x: 0, y: 0, width: keyboard.maxX, height: keyboard.maxY)
        // Un clavier qui ne descend pas jusqu'au bas de la fenêtre flotte : il ne soulève rien.
        guard keyboard.maxY >= area.maxY - 1, keyboard.minY < area.maxY else { return 0 }
        return min(area.maxY - max(keyboard.minY, area.minY), area.height)
    }
}
