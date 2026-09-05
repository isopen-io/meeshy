// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+Insets.swift

import UIKit

/// La façon dont un inset de liste REJOINT sa nouvelle valeur.
///
/// `nil` (ou l'API sans transition) = pose SÈCHE, à l'ancienne : l'inset saute
/// en une frame. C'est juste quand la cause du changement est elle-même sèche
/// (rotation, montage). Ça ne l'est plus quand la cause est ANIMÉE — le
/// composeur qui grandit d'une ligne, le clavier qui monte : la barre bouge sur
/// sa courbe pendant que le flux, lui, s'est déjà téléporté. Deux mouvements
/// pour un seul événement, c'est exactement ce que l'œil lit comme un à-coup.
///
/// La durée et la courbe viennent donc de l'APPELANT — lui seul connaît
/// l'animation qu'il est en train de jouer (la notification clavier porte les
/// deux, un `withAnimation` SwiftUI les impose). Aucune cote n'est décidée ici.
struct ListInsetTransition: Equatable {
    let duration: TimeInterval
    let curve: UIView.AnimationOptions

    init(duration: TimeInterval, curve: UIView.AnimationOptions) {
        self.duration = duration
        self.curve = curve
    }
}

// MARK: - Insets de la liste

extension MessageListViewController {

    /// Reserves vertical clearance at the visual bottom of the list. Because
    /// the collection view is transformed with `scaleY: -1`, what looks like
    /// the bottom on screen is `contentInset.top` in the underlying scroll
    /// view's coordinate space. Same flip applies to the scroll indicator
    /// inset so the bar isn't hidden under the composer.
    func applyBottomInset(_ inset: CGFloat) {
        guard collectionView != nil else { return }
        if collectionView.contentInset.top != inset {
            collectionView.contentInset.top = inset
            collectionView.verticalScrollIndicatorInsets.top = inset
        }
    }

    /// La MÊME réserve, posée SUR la courbe de l'appelant (#4944).
    ///
    /// L'API sèche ci-dessus reste le chemin par défaut et n'est pas touchée :
    /// `transition == nil` y retombe mot pour mot, une seule règle de pose
    /// pour les deux entrées. Ce qui change, quand une transition est donnée,
    /// est que la variation d'inset appartient à la MÊME animation que ce qui
    /// l'a causée — le flux et la barre arrivent ensemble.
    ///
    /// `beginFromCurrentState` : deux changements qui se chevauchent (le
    /// clavier qui monte pendant que le composeur gagne une ligne) reprennent
    /// depuis la valeur PRÉSENTÉE au lieu de sauter à celle du modèle, et
    /// `allowUserInteraction` laisse le doigt garder la main sur le flux — le
    /// rouleau n'appartient qu'à lui.
    func applyBottomInset(_ inset: CGFloat, transition: ListInsetTransition?) {
        guard let transition else {
            applyBottomInset(inset)
            return
        }
        guard collectionView != nil, collectionView.contentInset.top != inset else { return }
        UIView.animate(
            withDuration: transition.duration,
            delay: 0,
            options: [transition.curve, .beginFromCurrentState, .allowUserInteraction],
            animations: { [weak self] in
                guard let self, self.collectionView != nil else { return }
                self.collectionView.contentInset.top = inset
                self.collectionView.verticalScrollIndicatorInsets.top = inset
            }
        )
    }
}
