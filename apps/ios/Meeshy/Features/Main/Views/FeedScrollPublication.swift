import CoreGraphics
import MeeshyUI

/// **Ce que le fil REPUBLIE de sa géométrie pendant le défilement** (#7625).
///
/// Deux flux partaient à chaque image de défilement : l'offset relayé à
/// l'en-tête (`ScrollOffsetRelay`, DEUX fois par image — la préférence ET
/// `onScrollGeometryChange` de `MeeshyRefreshableScroll`, pour la même valeur)
/// et la frame de chaque réel / scène rapportée au coordinateur d'autoplay
/// (`ReelVisibilityPreferenceKey`). Chaque écriture force une mise à jour du
/// graphe SwiftUI pendant que les rangées qui entrent à l'écran attendent
/// d'être peintes. Ces lois gardent ce que leurs lecteurs lisent, rien de plus.
nonisolated enum FeedScrollPublication {

    /// Le pas des frames de réels : l'élection du réel le plus centré ne change
    /// pas de gagnant pour quelques points, et chaque valeur nouvelle réveille
    /// l'agrégation de préférences de tout le fil.
    static let frameStep: CGFloat = 24

    static func reportedMidY(_ midY: CGFloat) -> CGFloat {
        (midY / frameStep).rounded() * frameStep
    }
}

extension ScrollOffsetRelay {
    /// Relaie l'offset du fil, et n'écrit RIEN quand il n'a pas changé :
    /// `offset` publie sur `willSet`, valeur changée ou non, et le fil
    /// l'écrivait deux fois par image pour la même valeur. Le relais reste une
    /// boîte qui publie chaque écriture (`LentilleFocusElectionCadenceTests`) —
    /// c'est le fil qui écrit moins.
    func relayFeedOffset(_ value: CGFloat) {
        guard value != offset else { return }
        offset = value
    }
}
