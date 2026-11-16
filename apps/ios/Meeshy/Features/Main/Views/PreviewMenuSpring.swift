import SwiftUI
import MeeshyUI

/// Le ressort entre le menu d'appui long et la carte d'aperçu (#18723). Quand
/// le menu s'étend — cran compact vers cran large, ou sous-panneau Favori,
/// Déplacer, Plus —, la carte RECULE : elle se réduit un peu et remonte de
/// quelques points, comme poussée par le menu ; quand il se réduit, elle
/// revient. Tout se lit dans la HAUTEUR du menu, jamais dans un drapeau :
/// une hauteur intermédiaire (le doigt posé à mi-course) donne une pose
/// intermédiaire, et la carte ne peut pas croire le menu ouvert quand il ne
/// l'est pas.
nonisolated enum PreviewMenuSpring {
    /// L'échelle de la carte quand le menu prend sa plus grande hauteur.
    static let widestScale: CGFloat = 0.96
    /// La remontée de la carte, en points, à la plus grande hauteur du menu.
    static let widestLift: CGFloat = 10
    /// Sous « Réduire les animations », la carte ne bouge pas : elle s'estompe
    /// de cette part, assez pour dire qu'elle cède la place au menu.
    static let reducedDimming: Double = 0.08

    /// Ce que la carte reçoit : son échelle, son décalage vertical (négatif =
    /// vers le haut) et son opacité.
    struct Pose: Equatable, Sendable {
        let scale: CGFloat
        let offset: CGFloat
        let opacity: Double

        static let rest = Pose(scale: 1, offset: 0, opacity: 1)

        /// La pose pendant que la carte naît de la ligne ou y revient : au
        /// repos sur la ligne (0), entière à sa place (1). Sans cela, une carte
        /// fermée depuis le cran large rejoindrait sa rangée réduite et
        /// décalée, et la rangée réapparaîtrait d'un saut.
        func onRow(morphProgress: CGFloat) -> Pose {
            let part = min(1, max(0, morphProgress))
            return Pose(
                scale: 1 - (1 - scale) * part,
                offset: offset * part,
                opacity: 1 - (1 - opacity) * Double(part)
            )
        }
    }

    /// La part de la course du menu déjà parcourue, de 0 (compact) à 1 (la
    /// plus grande hauteur), bornée : un menu qui ne peut pas grandir laisse
    /// la carte au repos.
    static func expansion(forMenuHeight height: CGFloat, compact: CGFloat, natural: CGFloat) -> CGFloat {
        guard natural > compact else { return 0 }
        return min(1, max(0, (height - compact) / (natural - compact)))
    }

    static func scale(forMenuHeight height: CGFloat, compact: CGFloat, natural: CGFloat) -> CGFloat {
        1 - (1 - widestScale) * expansion(forMenuHeight: height, compact: compact, natural: natural)
    }

    static func offset(forMenuHeight height: CGFloat, compact: CGFloat, natural: CGFloat) -> CGFloat {
        -widestLift * expansion(forMenuHeight: height, compact: compact, natural: natural)
    }

    /// La pose de la carte pour la hauteur courante du menu. Sous « Réduire
    /// les animations », ni échelle ni déplacement : une opacité seulement.
    static func pose(forMenuHeight height: CGFloat, compact: CGFloat, natural: CGFloat, reduceMotion: Bool) -> Pose {
        let expansion = expansion(forMenuHeight: height, compact: compact, natural: natural)
        guard !reduceMotion else {
            return Pose(scale: 1, offset: 0, opacity: 1 - reducedDimming * Double(expansion))
        }
        return Pose(
            scale: scale(forMenuHeight: height, compact: compact, natural: natural),
            offset: offset(forMenuHeight: height, compact: compact, natural: natural),
            opacity: 1
        )
    }

    /// Le mouvement qui porte la carte vers sa pose. Doigt posé : aucun, la
    /// carte suit le geste à l'image. Pendant le morphisme avec la ligne : celui
    /// de la ligne (`inherited`), pour que la carte la rejoigne dans la même
    /// image. Sinon : le ressort élastique franc du menu, dont la carte est le
    /// maillon suivant — elle arrive après lui et dépasse sa place avant de
    /// s'y poser. Mouvement réduit : le fondu court.
    static func animation(reduceMotion: Bool, isTracking: Bool, isMorphing: Bool, inherited: Animation?) -> Animation? {
        guard !isTracking else { return nil }
        guard !isMorphing else { return inherited }
        return reduceMotion ? MeeshyMotion.reducedFade : MeeshyAnimation.menuSpring
    }
}

nonisolated extension ConversationPeekLayout {
    /// La plus grande hauteur que le menu puisse prendre ici, quel que soit le
    /// panneau affiché : la référence du recul de la carte. Lue sur le panneau
    /// courant, elle suivrait la hauteur du menu et la carte ne reculerait
    /// jamais à l'ouverture d'un sous-panneau.
    var widestMenuHeight: CGFloat {
        ConversationPeekLayout(
            availableHeight: availableHeight,
            availableWidth: availableWidth,
            compactMenuHeight: compactMenuHeight,
            naturalMenuHeight: .greatestFiniteMagnitude
        ).expandedMenuHeight
    }
}
