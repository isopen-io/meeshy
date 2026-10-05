import CoreGraphics

/// Hauteur du panneau (+) du composeur — source unique, testée dans
/// `ComposerPanelHeightLawTests` (#8869).
///
/// Le panneau prend la place du clavier : il en reprend la dernière hauteur
/// connue pour que la ligne de saisie ne bouge pas au va-et-vient clavier ↔
/// panneau. Deux défauts s'y cumulaient :
/// - l'observateur lisait `fenêtre - endFrame.origin.y` pour TOUTE trame. Une
///   trame nulle (`CGRect.zero`, que UIKit émet à certaines transitions) valait
///   donc un « clavier » de la hauteur de la fenêtre, gravé comme dernière
///   hauteur connue ; un clavier flottant, la distance entre son bord haut et
///   le bas de l'écran ;
/// - rien ne bornait le panneau : cette hauteur périmée le faisait monter
///   jusqu'à pousser le composeur sous la barre d'état.
///
/// `nonisolated` : la cible infère `@MainActor` par défaut, et les tests
/// synchrones non isolés doivent pouvoir appeler la loi (même précédent que
/// `ComposerLibraryHandoff`).
nonisolated enum ComposerPanelHeightLaw {
    /// Le panneau ne dépasse jamais cette fraction de la fenêtre. Un clavier
    /// d'iPhone en portrait en occupe ~38 %, celui d'un iPad ~34 % : 55 % laisse
    /// passer tout clavier réel et arrête toute hauteur aberrante.
    static let maxWindowRatio: CGFloat = 0.55

    /// Ce qui doit rester visible au-dessus du panneau, hors zones sûres : la
    /// barre d'outils du composeur, sa ligne de saisie et un bandeau de
    /// conversation. Sur un écran court (paysage) ce plafond l'emporte.
    static let composerChromeReserve: CGFloat = 180

    /// Hauteur libérée par un clavier, lue sur sa trame de FIN.
    ///
    /// `nil` quand la trame n'est pas une mesure : rectangle dégénéré, ou
    /// clavier qui ne touche pas le bas de la fenêtre (flottant, détaché) — il
    /// ne libère alors aucune hauteur que le panneau pourrait reprendre. `0`
    /// quand le clavier est sous la fenêtre (masqué).
    static func keyboardHeight(endFrame: CGRect, windowHeight: CGFloat) -> CGFloat? {
        guard endFrame.width > 0, endFrame.height > 0 else { return nil }
        guard endFrame.minY < windowHeight else { return 0 }
        guard endFrame.maxY >= windowHeight - 1 else { return nil }
        return min(endFrame.height, windowHeight - endFrame.minY)
    }

    /// Plafond du panneau pour une fenêtre donnée.
    static func ceiling(windowHeight: CGFloat, safeAreaTop: CGFloat, safeAreaBottom: CGFloat) -> CGFloat {
        let usable = windowHeight - safeAreaTop - safeAreaBottom - composerChromeReserve
        return max(0, min(windowHeight * maxWindowRatio, usable))
    }

    /// Hauteur au repos : la dernière hauteur de clavier, jamais sous le
    /// plancher de contenu du panneau, jamais au-dessus du plafond — le
    /// plafond l'emporte sur le plancher, un panneau qui masque le composeur
    /// n'étant pas un panneau.
    static func restingHeight(
        lastKeyboardHeight: CGFloat,
        contentFloor: CGFloat,
        windowHeight: CGFloat,
        safeAreaTop: CGFloat,
        safeAreaBottom: CGFloat
    ) -> CGFloat {
        let ceiling = ceiling(windowHeight: windowHeight, safeAreaTop: safeAreaTop, safeAreaBottom: safeAreaBottom)
        return min(max(lastKeyboardHeight, contentFloor), ceiling)
    }
}
