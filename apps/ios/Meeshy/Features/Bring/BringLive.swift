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
        // La session `.playback` se pose hors du fil principal (#17038) ; la
        // sonnerie part une fois posée, pour ignorer le bouton silencieux dès
        // la première note.
        MediaSessionCoordinator.shared.activatePlaybackSync(options: [])
        guard let player = try? AVAudioPlayer(contentsOf: url) else { return }
        player.numberOfLoops = -1
        player.volume = 1
        player.prepareToPlay()
        self.player = player
        let token = ObjectIdentifier(player)
        MediaSessionCoordinator.shared.whenSessionSettled { [weak self] in
            guard let player = self?.player, ObjectIdentifier(player) == token else { return }
            player.play()
        }
    }

    func stopRinging() {
        guard player != nil else { return }
        stopPlayer()
        MediaSessionCoordinator.shared.deactivatePlaybackSync()
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

extension CircleReceptionBlockViewModel {
    /// Le câblage de production. Un partage d'écoute accordé allume l'émetteur de cet iPhone (#16803).
    convenience init(userId: String, personSwitch: CirclePersonSwitch) {
        self.init(userId: userId, personSwitch: personSwitch, service: BringService.shared, afterGrant: {
            guard personSwitch == .share(.listeningCategory) else { return nil }
            return await ListeningSharePreference.shared.optIn() ? nil : ListeningShareCopy.accessDenied
        })
    }
}
