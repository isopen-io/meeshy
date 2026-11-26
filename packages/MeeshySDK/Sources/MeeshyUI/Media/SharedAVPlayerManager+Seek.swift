import AVFoundation
import AVKit
import Combine
import SwiftUI
import MeeshySDK

// MARK: - Shared AV Player Manager — déplacement et progression

extension SharedAVPlayerManager {
    /// **La part du média jouée, lue SUR le lecteur à l'instant de l'appel.**
    /// `currentTime` n'est publié que 2 à 5 fois par seconde
    /// (`MediaThermalPolicy.timeObserverInterval`) : une barre qui le lit
    /// avance par à-coups et reprend le tour de boucle jusqu'à une demi-seconde
    /// après l'image. Une barre rafraîchie par l'affichage lit ceci — le temps
    /// de l'élément EN COURS, donc zéro dès que la file enchaîne. Un
    /// déplacement en vol affiche sa cible, pas la tête qu'il quitte.
    public func liveProgress() -> Double {
        guard let player, let item = player.currentItem else { return 0 }
        return PlaybackProgressLaw.fraction(
            itemSeconds: seekInFlight ? currentTime : Self.finiteSeconds(player.currentTime()),
            durationSeconds: PlaybackProgressLaw.heldDuration(
                reported: item.duration.seconds, known: duration, isLoopSuccessor: shouldLoop))
    }

    public func seek(to seconds: Double) {
        seek(to: seconds, precise: true)
    }

    /// **Le déplacement suit le doigt, puis se pose exactement.**
    ///
    /// `precise: false` autorise AVFoundation à s'arrêter à l'image-clé la plus
    /// proche : le décodeur n'a rien à reconstruire, l'image apparaît quasi
    /// immédiatement, et c'est ce qui rend le suivi possible pendant le geste.
    /// `precise: true` (le défaut, et la CONCLUSION du geste) force la frame
    /// exacte, au prix d'un décodage depuis l'image-clé précédente — acceptable
    /// une seule fois, ruineux soixante fois par seconde.
    ///
    /// Les déplacements se COALESCENT : tant qu'un déplacement est en vol, seule
    /// la dernière cible demandée est retenue, et elle part à la complétion. Un
    /// glissement produit ainsi autant de déplacements que le décodeur peut en
    /// servir, jamais autant que le doigt en demande.
    public func seek(to seconds: Double, precise: Bool) {
        // Sans lecteur, la complétion ne viendrait jamais et tout déplacement
        // suivant resterait en attente derrière celui-ci.
        guard player != nil else { return }
        // `Int(_:)` trappe sur une valeur non finie : une position de reprise illisible ne déplace rien.
        guard seconds.isFinite else { return }
        // Relevé AVANT le déplacement : c'est jusque-là que le visionnage a
        // porté. Le traqueur ignore de lui-même un déplacement à l'arrêt.
        stretchTracker.seek(from: positionMs, to: max(0, Int(seconds * 1000)))
        // La tête publiée EST la tête demandée : la barre s'y pose,
        // au lieu de revenir à l'ancienne position jusqu'au tick suivant.
        let head = PlaybackProgressLaw.headAfterSeek(target: seconds, durationSeconds: duration)
        if currentTime != head { currentTime = head }

        guard !seekInFlight else {
            pendingSeek = (seconds, precise)
            return
        }
        seekInFlight = true
        performSeek(to: seconds, precise: precise)
    }

    private func performSeek(to seconds: Double, precise: Bool) {
        qoeObserver?.noteSeek()
        let time = CMTime(seconds: seconds, preferredTimescale: 600)
        let tolerance: CMTime = precise ? .zero : CMTime(seconds: 0.5, preferredTimescale: 600)
        let generation = seekGeneration
        player?.seek(to: time, toleranceBefore: tolerance, toleranceAfter: tolerance) { [weak self] _ in
            guard let self else { return }
            // La complétion d'AVPlayer arrive hors du MainActor ; l'état
            // coalescé lui appartient, on y revient avant de le toucher.
            Task { @MainActor in
                guard generation == self.seekGeneration else { return }
                self.seekInFlight = false
                if let next = self.pendingSeek {
                    self.pendingSeek = nil
                    self.seekInFlight = true
                    self.performSeek(to: next.seconds, precise: next.precise)
                }
            }
        }
    }

    public func skip(seconds: Double) {
        let target = min(max(currentTime + seconds, 0), duration)
        seek(to: target)
    }

    public func setSpeed(_ speed: PlaybackSpeed) {
        playbackSpeed = speed
        if isPlaying {
            player?.rate = Float(speed.rawValue)
        }
    }

    public func cycleSpeed() {
        setSpeed(playbackSpeed.next())
    }
}
