import SwiftUI

/// Les jetons de mouvement de la bannière tirée (#18721). Chacun a sa variante
/// réduite, le fondu court du mode « Réduire les animations ».
public extension MeeshyMotion {

    /// Le retour à ressort de la carte relâchée avant le seuil (l'annulation).
    nonisolated static func bannerPull(reduce: Bool) -> Animation {
        reduce ? reducedFade : MeeshyAnimation.bannerPullReturn
    }

    /// La croissance de la carte jusqu'au cadre de la conversation.
    nonisolated static func bannerMorph(reduce: Bool) -> Animation {
        reduce ? reducedFade : MeeshyAnimation.bannerPullMorph
    }

    /// Le temps que la carte met à atteindre le plein écran : au-delà,
    /// l'enveloppe peinte par la racine s'efface devant la conversation.
    nonisolated static var bannerMorphSettle: Duration { .milliseconds(420) }
}
