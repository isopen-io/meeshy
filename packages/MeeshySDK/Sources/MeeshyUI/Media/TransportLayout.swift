import Foundation
import CoreGraphics

/// Répartition PURE des contrôles de transport entre la barre unique visible
/// et le menu ⋯ (lifting Liquid Glass 2026-07-11). L'API `ControlSet` reste
/// la seule entrée : les call sites existants n'ont pas changé, seul le rendu
/// des options `.speed`/`.loop`/`.pip` (menu) et `.mute`/`.airplay` (barre)
/// a été déplacé.
public nonisolated enum TransportLayout {
    public enum BarItem: Hashable, Sendable { case mute, airplay }
    public enum MenuItem: Hashable, Sendable { case speed, loop, pip }

    public static func barItems(for controls: MeeshyVideoPlayer.ControlSet) -> [BarItem] {
        var items: [BarItem] = []
        if controls.contains(.mute) { items.append(.mute) }
        if controls.contains(.airplay) { items.append(.airplay) }
        return items
    }

    public static func menuItems(for controls: MeeshyVideoPlayer.ControlSet) -> [MenuItem] {
        var items: [MenuItem] = []
        if controls.contains(.speed) { items.append(.speed) }
        if controls.contains(.loop) { items.append(.loop) }
        if controls.contains(.pip) { items.append(.pip) }
        return items
    }

    public static func showsMenuButton(for controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        !menuItems(for: controls).isEmpty
    }

    // MARK: - Placement — où le transport se rend (#6162)

    /// **Le transport se SÉPARE en deux sur le plateau de lecture.**
    ///
    /// Le lifting de 2026-07-11 avait empilé ses deux moitiés dans une seule
    /// vue : le play/pause au centre du média, la barre en capsule juste
    /// au-dessus du bas. La loi du plateau (#6162, directive porteur
    /// 2026-09-12) les sépare — *« la progression […] doit être en bas juste
    /// au-dessus du rail de défilement […] et le bouton pause/play plus
    /// transparent au centre »* — parce qu'elles ne commandent pas la même
    /// chose : le play/pause est l'affordance première d'un LECTEUR et vit sur
    /// le média ; la progression commande le TEMPS et descend au couloir, avec
    /// tout ce qui contrôle.
    ///
    /// Le placement est un ÉTAT de rendu, pas une option de plus dans le
    /// `ControlSet` : deux hôtes peuvent vouloir le même jeu de contrôles à
    /// deux endroits, et c'est exactement ce que la galerie fait — elle monte
    /// la même vue deux fois.
    public enum Placement: Hashable, Sendable {
        /// Le gabarit historique : centre au milieu, barre capsule en bas, tout
        /// posé sur le média. Réels, plein écran SDK, variantes inline.
        case stacked
        /// Le play/pause SEUL, au centre du média (plateau de lecture).
        case center
        /// La bande du couloir bas : progression pleine largeur, durée discrète
        /// à droite, sans capsule de verre.
        case corridor
    }

    /// **La hauteur RÉELLE de la barre, publiée pour que l'hôte la réserve.**
    ///
    /// Le plateau de lecture prend cette bande à la hauteur AVANT que le cadre
    /// ne prenne le reste (#6162) : il doit donc savoir ce qu'elle mesure. La
    /// recopier côté hôte marcherait aujourd'hui et désaccorderait le cadre et
    /// la bande le jour où la barre change de gabarit — en silence, puisque les
    /// deux resteraient individuellement justes. C'est la leçon du rail
    /// (`FilmstripMetrics.reservedHeight`), rejouée une bande plus haut.
    ///
    /// 48 pt : la cible de 44 pt du scrub, plus le jeu qui l'empêche de toucher
    /// ses voisines.
    public static let barHeight: CGFloat = 48

    public static func showsCenter(placement: Placement) -> Bool {
        placement != .corridor
    }

    public static func showsBar(placement: Placement,
                                controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        guard placement != .center else { return false }
        return controls.contains(.scrubber)
            || controls.contains(.duration)
            || !barItems(for: controls).isEmpty
            || showsMenuButton(for: controls)
    }

    /// **Les ±10 s appartiennent au gabarit empilé, et à lui seul.**
    ///
    /// Ils naissaient de la présence d'un `.scrubber`. Les retirer en retirant
    /// cette option aurait laissé le prochain hôte les ressusciter sans le
    /// savoir — et #6163 les remplace par un GESTE, pas par un autre bouton.
    /// La disparition est donc une loi du placement.
    public static func showsSkip(placement: Placement,
                                 controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        placement == .stacked && controls.contains(.scrubber)
    }

    /// Le temps écoulé double ce que la ligne de progression MONTRE déjà : dans
    /// une bande haute comme une seule cible tactile, il le lui volerait.
    public static func showsElapsedTime(placement: Placement,
                                        controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        placement == .stacked && controls.contains(.duration)
    }

    public static func showsTotalDuration(placement: Placement,
                                          controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        placement != .center && controls.contains(.duration)
    }

    /// Le verre détache un contrôle posé sur une image dont on ne connaît ni la
    /// couleur ni la luminosité. Le couloir est un fond noir CONNU : une capsule
    /// y dessinerait un objet flottant sur rien.
    public static func wrapsBarInGlass(placement: Placement) -> Bool {
        placement == .stacked
    }
}
