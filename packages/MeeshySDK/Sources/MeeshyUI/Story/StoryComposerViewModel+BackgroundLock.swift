import UIKit
import MeeshySDK

// MARK: - Le fond figé d'une story recomposée d'autrui (#9994)

/// Le verrou se pose UNE fois, à la graine de scène, quand la story recomposée
/// n'est pas celle de l'utilisateur. Il se fait respecter à deux niveaux :
///
/// - **à chaque écriture** de `slides` et de `slideImages` (leurs `didSet`) :
///   toute modification du fond de la slide verrouillée est défaite, quel que
///   soit le chemin qui l'a faite — geste du canvas, panneau Cadre, palette,
///   menu du fond, annulation ;
/// - **aux commandes qui ont des effets de bord** hors de la slide (suppression
///   d'un objet, d'une slide, bascule fond/premier plan) : elles refusent avant
///   d'agir, pour ne pas libérer un actif que le verrou remettrait ensuite.
///
/// L'hôte lit `isBackgroundLocked` pour retirer les commandes du fond : un
/// bouton qui ne fait rien serait un contrôle inerte.
extension StoryComposerViewModel {

    public var isBackgroundLocked: Bool { backgroundLock != nil }

    /// L'objet est-il le média de fond figé ?
    public func isLockedBackground(objectId: String) -> Bool {
        backgroundLock?.backgroundObjectId == objectId
    }

    /// La slide porte-t-elle le fond figé ?
    func locksBackground(ofSlideId slideId: String) -> Bool {
        backgroundLock?.slideId == slideId
    }

    func lockBackground(of slide: StorySlide, image: UIImage?) {
        lockedBackgroundImage = image
        backgroundLock = StoryBackgroundLock(locking: slide)
    }

    /// Une remise à zéro emporte la story d'origine : il n'y a plus de fond à
    /// garder, et un bitmap remis sous une slide disparue partirait en faux fond.
    func releaseBackgroundLock() {
        backgroundLock = nil
        lockedBackgroundImage = nil
    }

    func enforceBackgroundLock() {
        guard let lock = backgroundLock,
              let index = slides.firstIndex(where: { $0.id == lock.slideId }),
              let fixed = lock.enforced(slides[index]) else { return }
        slides[index] = fixed
    }

    func enforceLockedBackgroundImage() {
        guard let lock = backgroundLock,
              slideImages[lock.slideId] !== lockedBackgroundImage else { return }
        slideImages[lock.slideId] = lockedBackgroundImage
        hasBackgroundImage = lockedBackgroundImage != nil
    }
}
