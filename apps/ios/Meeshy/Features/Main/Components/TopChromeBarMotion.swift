import SwiftUI

/// Comment une barre du haut de l'app ENTRE et SORT. Le mini-lecteur et la barre d'appel partagent
/// ce seul mouvement (#9048).
///
/// Demande porteur 2026-10-01 : « Il ne faut pas faire disparaître mais remonter vers le haut pour
/// que le contenu remonte jusqu'à sortir hors d'écran et disparaître ! »
///
/// AVANT, mesuré en pixels (`TopChromeExitRenderTests`) : à la croix du mini-lecteur, la barre et
/// la bande de l'encart partaient en UNE image et le contenu sautait de toute la hauteur de la
/// barre ; la barre d'appel, elle, ne s'animait pas du tout à la fin d'un appel.
///
/// # Trois couches, et l'ordre de peinture fait le mouvement
///
/// Dans la pile de `CallPresentationLayer` : le contenu de l'app tout en bas, la BANDE de l'encart
/// au-dessus de lui, et la barre qui touche le haut au-dessus de la bande (`layer`).
///
/// • **La dernière barre** — rien ne reste après elle — sort par le haut de l'écran. Elle remonte
///   de sa hauteur PLUS l'encart : `.move(edge:)` seul ne décale une vue que de SA hauteur, et une
///   barre posée sous l'encart (l'heure, la batterie, la Dynamic Island) s'y arrêterait, encore
///   visible. La bande remonte en même temps de sa propre hauteur ; peinte SOUS la barre, elle ne
///   masque jamais son contenu, qui reste lisible jusqu'au bord de l'écran.
/// • **Une barre qui part quand l'autre reste** se range sous sa voisine et sous la bande, de sa
///   seule hauteur. Remonter de l'encart en plus la ferait courir plus vite que le contenu qui la
///   suit, et ouvrirait un trou entre les deux.
///
/// L'arrivée est le mouvement inverse. Le contenu suit dans la même transaction : c'est ce qui le
/// fait glisser au lieu de sauter.
///
/// L'encart (`safeAreaTop`) est MESURÉ par la pile (`TopChromeInsetKey`), jamais lu sur la fenêtre
/// pendant le rendu : une vue qui lit les marges de la fenêtre qu'elle met en page provoque un
/// cycle AttributeGraph, après lequel elle ne se met plus jamais à jour (#8772). Mesuré ici aussi :
/// le mini-lecteur seul ne s'affichait plus.
enum TopChromeBarMotion {
    enum Exit: Equatable {
        /// « Réduire les animations » : aucune translation.
        case fade
        /// La barre remonte de sa hauteur plus `clearance`.
        case slideUp(clearance: CGFloat)
    }

    static func exit(isLastBar: Bool, reduceMotion: Bool, safeAreaTop: CGFloat) -> Exit {
        if reduceMotion { return .fade }
        return .slideUp(clearance: isLastBar ? safeAreaTop : 0)
    }

    /// Le ressort des barres, de la bande ET du contenu qui les suit. Coupé, pas raccourci, sous
    /// « Réduire les animations » : tout apparaît et disparaît sans bouger.
    ///
    /// Amorti CRITIQUE — aucun dépassement. La barre et la bande ne parcourent pas la même
    /// distance (hauteur + encart contre encart seul) : un ressort qui dépasse sa cible les fait
    /// dépasser d'autant, et entre les deux s'ouvrait à l'arrivée un liseré noir de 1 à 2 px,
    /// filmé sur deux images au simulateur et rattrapé par `TopChromeExitRenderTests`.
    static func animation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 1)
    }

    static func transition(isLastBar: Bool, reduceMotion: Bool, safeAreaTop: CGFloat) -> AnyTransition {
        switch Self.exit(isLastBar: isLastBar, reduceMotion: reduceMotion, safeAreaTop: safeAreaTop) {
        case .fade:
            return .opacity
        case let .slideUp(clearance):
            return .move(edge: .top).combined(with: .offset(y: -clearance))
        }
    }

    /// Le rang de la bande dans la pile : au-dessus du contenu (0), qui ignore la safe area et
    /// la recouvrirait sinon.
    static let bandLayer: Double = 1

    /// Le rang d'une barre : la dernière passe DEVANT la bande, pour sortir de l'écran à la vue ;
    /// une barre qui se range passe DESSOUS, et sous la barre d'appel, qui prime sur l'écoute.
    static func layer(isLastBar: Bool, isCall: Bool) -> Double {
        if isLastBar { return 2 }
        return isCall ? 0.6 : 0.5
    }
}

/// Le haut de la pile du chrome, en coordonnées de la fenêtre : l'encart haut, mesuré par la mise
/// en page elle-même.
struct TopChromeInsetKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
