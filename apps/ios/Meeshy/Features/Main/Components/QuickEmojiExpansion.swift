import CoreGraphics

/// **La bande des emojis rapides s'élargit sous le doigt qui la fait défiler**
/// (#11566, directive porteur, #11570).
///
/// Pendant le défilement, la bande gagne vers la gauche ce que le doigt a
/// parcouru vers la gauche depuis le début du geste, et le champ de saisie
/// cède d'autant — progressivement, et le doigt qui revient la rétrécit. Le
/// champ garde toujours son micro (une cible de 44 pt) et le début de son
/// texte d'invite. Au relâcher, la bande reprend sa largeur de repos.
///
/// Les emojis restent sous le doigt : la bande grandit par son bord gauche, son
/// contenu se décale donc d'autant dans le cadre (`contentOffset`).
nonisolated enum QuickEmojiExpansion {

    /// Le micro du champ reste une cible tactile entière.
    static let micFloor: CGFloat = 44
    /// Le début du texte d'invite reste lisible : quelques caractères.
    static let placeholderFloor: CGFloat = 52

    /// Ce que le champ ne cède jamais.
    static var fieldFloor: CGFloat { micFloor + placeholderFloor }

    /// La largeur de la bande.
    ///
    /// - `sharedWidth` : la largeur que le champ et la bande se partagent (leurs
    ///   deux largeurs au repos additionnées).
    /// - `restingWidth` : la largeur de la bande au repos.
    /// - `leftwardTravel` : le défilement vers la gauche depuis le début du geste
    ///   (0 au repos ou quand le doigt revient vers la droite).
    static func bandWidth(sharedWidth: CGFloat,
                          restingWidth: CGFloat,
                          leftwardTravel: CGFloat,
                          micFloor: CGFloat = micFloor,
                          placeholderFloor: CGFloat = placeholderFloor) -> CGFloat {
        let roomLeft = max(sharedWidth - micFloor - placeholderFloor - restingWidth, 0)
        return restingWidth + min(max(leftwardTravel, 0), roomLeft)
    }

    /// Le décalage du contenu DANS la bande, pour qu'à l'écran les emojis
    /// suivent le doigt (`scroll`, borné) pendant que le cadre grandit.
    static func contentOffset(scroll: CGFloat, bandWidth: CGFloat, restingWidth: CGFloat) -> CGFloat {
        scroll + max(bandWidth - restingWidth, 0)
    }
}
