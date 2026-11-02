import AVFoundation
import Combine
import MeeshySDK

// MARK: - La politique média vivante (#9880)
//
// La chaleur et l'économie d'énergie changent PENDANT la lecture : le lecteur
// affiché suit. Ses tampons sont reposés par `MediaPolicyMonitor` (il l'a
// adopté) ; ce moteur, lui, réarme son observateur de temps à la nouvelle
// cadence — chaque tick republie `currentTime` sur le fil principal.

extension SharedAVPlayerManager {

    func observeMediaPolicy() {
        MediaPolicyMonitor.shared.$policy
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] policy in self?.applyMediaPolicy(policy) }
            .store(in: &sessionSignalCancellables)
    }

    /// Réarme l'observateur de temps du lecteur courant à la cadence de
    /// `policy`. Sans lecteur, rien : le prochain la lira au chargement.
    func applyMediaPolicy(_ policy: MediaPolicy) {
        guard let player else { return }
        guard armedTimeObserverInterval != policy.timeObserverInterval else { return }
        armTimeObserver(on: player, interval: policy.timeObserverInterval)
    }
}
