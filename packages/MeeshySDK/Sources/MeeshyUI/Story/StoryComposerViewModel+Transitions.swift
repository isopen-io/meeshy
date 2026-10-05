import Foundation
import MeeshySDK

// MARK: - Les transitions de la slide (#8792)

extension StoryComposerViewModel {

    /// **L'ouverture et la fermeture de la slide COURANTE, écrites sur la slide
    /// elle-même** — le canvas de la scène les lit tout de suite (`slide.effects`),
    /// et l'atelier relit les mêmes valeurs à sa synchro (`openingEffect` /
    /// `closingEffect`) : aucune des deux sources ne peut rattraper l'autre en
    /// retard.
    ///
    /// Le carrousel d'effets de la scène (app) n'a que la LECTURE de
    /// `currentEffects` ; ce point unique la complète en écriture pour les deux
    /// seuls champs qu'il règle.
    public func setSlideTransitions(opening: StoryTransitionEffect?, closing: StoryTransitionEffect?) {
        openingEffect = opening
        closingEffect = closing
        var effects = currentEffects
        effects.opening = opening
        effects.closing = closing
        currentEffects = effects
    }
}
