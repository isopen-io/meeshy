import AVFoundation
import Foundation
import MeeshySDK

/// La sonnerie d'un Bring : `Ringtone.caf`, le son de l'appel entrant, RÉUTILISÉ. La catégorie `.playback` ignore
/// le bouton silencieux — c'est le contrat du Bring (D-3) — et la session est rendue aux autres à l'arrêt, pour
/// qu'aucune musique ne reste baissée. Pendant un appel, le son se tait : l'écran suffit, la session reste à l'appel.
@MainActor
final class BringTone: BringRinging {
    private var player: AVAudioPlayer?
    private let isInCall: () -> Bool

    nonisolated deinit {}

    init(isInCall: @escaping () -> Bool = { CallManager.isCallActiveFlag }) {
        self.isInCall = isInCall
    }

    func startRinging() {
        stopPlayer()
        guard !isInCall(), let url = Bundle.main.url(forResource: "Ringtone", withExtension: "caf") else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [])
        try? session.setActive(true)
        guard let player = try? AVAudioPlayer(contentsOf: url) else { return }
        player.numberOfLoops = -1
        player.volume = 1
        player.prepareToPlay()
        player.play()
        self.player = player
    }

    func stopRinging() {
        guard player != nil else { return }
        stopPlayer()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func stopPlayer() {
        player?.stop()
        player = nil
    }
}

extension BringCenter {
    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = BringCenter(
        service: BringService.shared,
        people: CirclePeopleDirectory.shared,
        ringer: BringTone()
    )
}

extension ProfileBringViewModel {
    convenience init(userId: String) {
        self.init(userId: userId, service: BringService.shared, center: BringCenter.shared)
    }
}

extension CircleBringBlockViewModel {
    convenience init(userId: String) {
        self.init(userId: userId, service: BringService.shared)
    }
}
