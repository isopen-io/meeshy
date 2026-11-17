import SwiftUI

/// Les jetons de mouvement de la bannière tirée (#18721). Chacun a sa variante
/// réduite, le fondu court du mode « Réduire les animations ».
public extension MeeshyMotion {

    /// Le retour à ressort de la carte relâchée avant le seuil (l'annulation).
    nonisolated static func bannerPull(reduce: Bool) -> Animation {
        reduce ? reducedFade : MeeshyAnimation.bannerPullReturn
    }

    /// La croissance de la carte jusqu'au cadre de la feuille de la conversation.
    nonisolated static func bannerMorph(reduce: Bool) -> Animation {
        reduce ? reducedFade : MeeshyAnimation.bannerPullMorph
    }

    /// Le temps que la carte met à atteindre le cadre de la feuille : au-delà,
    /// la feuille réelle se pose à sa place.
    nonisolated static var bannerMorphSettle: Duration { .milliseconds(440) }

    /// Le temps que la feuille réelle met à couvrir l'enveloppe : au-delà,
    /// l'enveloppe s'efface dessous.
    nonisolated static var bannerSheetHandoff: Duration { .milliseconds(120) }

    /// La durée du fondu de l'enveloppe (`MeeshyAnimation.bannerMorphFade`) :
    /// au-delà, elle quitte la hiérarchie.
    nonisolated static var bannerMorphFadeOut: Duration { .milliseconds(240) }
}
