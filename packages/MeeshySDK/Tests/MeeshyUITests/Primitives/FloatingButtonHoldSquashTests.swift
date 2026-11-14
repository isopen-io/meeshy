import Foundation
import CoreGraphics
import Testing
@testable import MeeshyUI

/// **L'appui long d'un bouton flottant s'annonce par un écrasement des deux côtés** (#18428).
///
/// Pendant que le doigt tient le disque, sa largeur se resserre à mesure que
/// l'appui long approche de l'ouverture de la vue liée, puis revient à l'ouverture
/// ou à l'abandon. Sous « Réduire les animations », aucune déformation : le disque
/// s'estompe brièvement à la place.
@Suite("Écrasement de l'appui long")
struct FloatingButtonHoldSquashTests {

    @Test func au_repos_le_disque_garde_sa_largeur_et_son_opacite() {
        #expect(FloatingButtonHoldSquash.horizontalScale(progress: 0, reduceMotion: false) == 1)
        #expect(FloatingButtonHoldSquash.opacity(progress: 0, reduceMotion: false) == 1)
    }

    @Test func la_largeur_se_resserre_avec_la_progression() {
        let quarter = FloatingButtonHoldSquash.horizontalScale(progress: 0.25, reduceMotion: false)
        let half = FloatingButtonHoldSquash.horizontalScale(progress: 0.5, reduceMotion: false)
        let full = FloatingButtonHoldSquash.horizontalScale(progress: 1, reduceMotion: false)
        #expect(quarter < 1)
        #expect(half < quarter)
        #expect(full < half)
        #expect(full == FloatingButtonHoldSquash.squashedWidth)
    }

    @Test func l_ecrasement_est_franc_mais_garde_le_disque_lisible() {
        #expect(FloatingButtonHoldSquash.squashedWidth < 0.95)
        #expect(FloatingButtonHoldSquash.squashedWidth > 0.75)
    }

    @Test func sans_reduction_l_opacite_ne_bouge_pas() {
        #expect(FloatingButtonHoldSquash.opacity(progress: 1, reduceMotion: false) == 1)
    }

    @Test func la_progression_est_bornee() {
        #expect(FloatingButtonHoldSquash.horizontalScale(progress: -1, reduceMotion: false) == 1)
        #expect(FloatingButtonHoldSquash.horizontalScale(progress: 3, reduceMotion: false) == FloatingButtonHoldSquash.squashedWidth)
        #expect(FloatingButtonHoldSquash.opacity(progress: 3, reduceMotion: true) == FloatingButtonHoldSquash.reducedOpacity)
    }

    @Test func sous_reduction_aucune_deformation_mais_un_fondu() {
        #expect(FloatingButtonHoldSquash.horizontalScale(progress: 1, reduceMotion: true) == 1)
        #expect(FloatingButtonHoldSquash.opacity(progress: 1, reduceMotion: true) == FloatingButtonHoldSquash.reducedOpacity)
        #expect(FloatingButtonHoldSquash.reducedOpacity < 1)
        #expect(FloatingButtonHoldSquash.reducedOpacity >= 0.5)
    }

    @Test func la_progression_suit_le_doigt_tenu_et_retombe_au_relacher() {
        #expect(FloatingButtonHoldSquash.progress(isHolding: true, hasLongPress: true) == 1)
        #expect(FloatingButtonHoldSquash.progress(isHolding: false, hasLongPress: true) == 0)
    }

    @Test func un_bouton_sans_appui_long_ne_s_ecrase_jamais() {
        #expect(FloatingButtonHoldSquash.progress(isHolding: true, hasLongPress: false) == 0)
    }

    @Test func l_ecrasement_dure_exactement_l_appui_long() {
        #expect(FloatingButtonHoldSquash.holdDuration == 0.5)
    }
}
