import Testing
import Foundation
@testable import MeeshySDK

/// **Une animation ne rend jamais son message illisible.**
///
/// Mesuré en recette le 2026-09-23, sur un message envoyé dans le cadre
/// « Néon » et photographié huit fois en cinq secondes. La carte oscillait
/// entre deux états :
///
/// | phase | fond composé sur le fil | contraste du texte blanc |
/// |---|---|---|
/// | allumée | `(49, 46, 129)` | **11,42 : 1** |
/// | éteinte | `(169, 168, 203)` | **2,29 : 1** |
///
/// Le plancher WCAG AA est de 4,5 : 1 pour du texte normal, 3 : 1 pour du
/// grand texte. Le Néon passait donc **sous le seuil le plus permissif** une
/// fraction de chaque cycle, indéfiniment — et c'était le seul cadre du
/// produit à le faire.
///
/// ## Pourquoi le témoin porte sur l'OPACITÉ et pas sur la couleur
///
/// La couleur était juste : `night` est le même indigo profond que le Badge,
/// qui tient 9,8 : 1. Ce qui cassait la lisibilité était l'**amplitude** —
/// `opacity: 1 - 0.6 * (1 - cos(tour)) / 2` descend à **0,40**, et une carte
/// à 40 % sur le fond clair du fil se délave vers le blanc pendant que le
/// texte blanc, lui, reste blanc. Les deux convergent.
///
/// Ma première mesure, prise sur UNE capture, avait conclu à tort que la carte
/// rendait grise en permanence. Huit captures ont montré l'oscillation. Un
/// état transitoire se mesure sur une série, jamais sur une image.
///
/// ## Pourquoi il ferme la CLASSE
///
/// Le témoin n'interroge pas `.blink` : il interroge **toutes** les animations,
/// sur un cycle complet. Une animation ajoutée demain qui jouerait sur
/// l'opacité tomberait ici sans que personne ait à y penser — c'est la seule
/// forme qui survit à l'ajout d'un cas.
@Suite("Une animation ne rend jamais son sticker illisible")
struct StickerAnimationLegibilityTests {

    /// Le plancher d'opacité sous lequel le texte blanc d'un cadre indigo
    /// passe sous 4,5 : 1 une fois composé sur le fond clair du fil.
    ///
    /// Calculé, pas choisi : à 0,70 le fond composé vaut `(109, 107, 166)` et
    /// le contraste 4,88 : 1 ; à 0,65 il tombe à 4,26 : 1.
    static let plancherLisible = 0.70

    /// Un cycle complet, échantillonné assez finement pour ne pas rater un
    /// creux : `blink` a une période de 1,2 s et son minimum est un point.
    static let échantillons = 400

    @Test("Aucune animation ne descend l'opacité sous le plancher lisible")
    func test_toutesLesAnimations_restentAuDessusDuPlancher() {
        for animation in StickerAnimation.allCases {
            let période = animation.period
            var minimum = 1.0
            var instantDuMinimum = 0.0
            for index in 0...Self.échantillons {
                let t = période * Double(index) / Double(Self.échantillons)
                let pose = animation.pose(at: t)
                if pose.opacity < minimum {
                    minimum = pose.opacity
                    instantDuMinimum = t
                }
            }
            #expect(
                minimum >= Self.plancherLisible,
                """
                L'animation « \(animation) » descend à \(String(format: "%.2f", minimum)) \
                d'opacité à t=\(String(format: "%.2f", instantDuMinimum)) s — sous le \
                plancher \(Self.plancherLisible). Un message rendu dans ce cadre devient \
                illisible une fraction de chaque cycle : texte blanc et carte délavée \
                convergent vers le fond clair du fil. Baisser le plancher n'est pas une \
                option — c'est l'amplitude de l'animation qui se règle.
                """
            )
        }
    }

    /// Le Néon doit rester un Néon : le témoin ci-dessus serait aussi vert avec
    /// une opacité constante à 1, ce qui supprimerait l'effet au lieu de le
    /// borner. Celui-ci garde l'AUTRE moitié de la règle.
    @Test("Le clignotement du Néon reste perceptible")
    func test_blink_garde_une_amplitude_visible() {
        var minimum = 1.0
        var maximum = 0.0
        for index in 0...Self.échantillons {
            let t = StickerAnimation.blink.period * Double(index) / Double(Self.échantillons)
            let o = StickerAnimation.blink.pose(at: t).opacity
            minimum = min(minimum, o)
            maximum = max(maximum, o)
        }
        #expect(maximum - minimum >= 0.15,
                "Le Néon ne clignote plus : amplitude \(maximum - minimum). Le borner ne veut pas dire l'éteindre.")
        #expect(minimum >= Self.plancherLisible)
    }
}
