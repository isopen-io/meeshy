import UIKit

// Le PiP système vu des écrans : des transmetteurs d'une ligne vers
// `CallSystemPiPController`, qui porte la configuration AVKit et ses rappels
// (#8435, #11522).

extension CallManager {
    func attachSystemPiP(sourceView: UIView) { systemPiP.attachSystemPiP(sourceView: sourceView) }

    func startSystemPiP() { systemPiP.startSystemPiP() }

    func stopSystemPiP() { systemPiP.stopSystemPiP() }

    func detachSystemPiP() { systemPiP.detachSystemPiP() }
}
