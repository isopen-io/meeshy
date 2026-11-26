import AVFoundation
import AVKit
import Combine
import SwiftUI
import MeeshySDK

// MARK: - Shared AV Player Manager — boucle

extension SharedAVPlayerManager {
    /// **La boucle est une FILE, pas un retour en arrière.** Revenir au
    /// début par `seek` à la notification de fin coûte un saut de fil, une
    /// purge du décodeur et une image-clé à redécoder : ≈ 0,1 s de trou à
    /// chaque tour (mesuré : claps à 8,10–8,13 s
    /// pour un média de 8,00 s). Avec un successeur du MÊME média déjà en file,
    /// `.advance` l'enchaîne sans couture — c'est ce que fait `AVPlayerLooper`,
    /// sans vider la file ni perdre l'élément déjà préparé.
    ///
    /// Sans successeur en file (lecteur qui n'est pas une file, insertion
    /// refusée), `.advance` viderait le lecteur : `.none`, et le retour au
    /// début par `seek` reste le repli.
    public nonisolated static func actionAtItemEnd(looping: Bool, successorQueued: Bool = false) -> AVPlayer.ActionAtItemEnd {
        guard looping else { return .pause }
        return successorQueued ? .advance : .none
    }

    func applyLoop(to player: AVPlayer) {
        var queued = false
        if shouldLoop {
            let outcome = PlaybackLoopQueue.queueSuccessor(on: player)
            queued = outcome.queued
            if let inserted = outcome.inserted { engineItems.insert(ObjectIdentifier(inserted)) }
        } else {
            PlaybackLoopQueue.dropSuccessors(of: player)
        }
        player.actionAtItemEnd = Self.actionAtItemEnd(looping: shouldLoop, successorQueued: queued)
    }
}
