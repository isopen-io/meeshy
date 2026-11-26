import Foundation
import QuartzCore
import AVFoundation
import UIKit
import os
import MeeshySDK

extension StoryMediaLayer {

    /// Cale le player foreground sur le playhead unifié de la slide puis lance
    /// la lecture. `seek` UNIQUEMENT si la dérive entre la position courante et
    /// la cible (`max(0, slidePlayheadSeconds − startTime)`) dépasse le seuil :
    /// un resume en place (long-press) ou un démarrage déjà aligné ne provoque
    /// aucun saut. Une vidéo arrivée en retard (réseau) ou une ouverture à `t>0`
    /// est en revanche recalée pour rester en phase avec le reste de la slide.
    /// Thin public seam (WS3.3) routing a canvas « GO » through the single
    /// drift-aware start path. A no-op unless `isPlaybackActive` (the slide is
    /// past content-ready), so the canvas can call it on every foreground media
    /// layer without re-checking each layer's state. Replaces the raw
    /// `forEachAVPlayer { $0.play() }` at GO, which bypassed timeline alignment
    /// and could flash frame 0 on an open-at-t>0. Idempotent: `play()` is a
    /// no-op when already playing and the seek only fires past the drift seuil.
    @MainActor
    public func startAlignedIfActive() {
        guard isPlaybackActive else { return }
        alignToTimelineThenPlay()
    }

    /// Scrub de preview timeline : pause puis cale le player sur le playhead
    /// unifié (`max(0, slidePlayheadSeconds − startTime)`, décalé dans la
    /// fenêtre de rognage courante — cf. `trimmedSeekTarget`) avec une
    /// tolérance large — un seek frame-accurate à la cadence du scrub gèle
    /// sur la décompression GOP. Le seek fire à chaque appel (pas de seuil de
    /// dérive) : en pause, la frame affichée DOIT suivre le doigt.
    @MainActor
    public func alignPausedToSlidePlayhead() {
        guard let player = avPlayer else { return }
        player.pause()
        let target = Self.trimmedSeekTarget(
            bounds: currentTrimBounds,
            slidePlayheadSeconds: slidePlayheadSeconds,
            mediaStartTime: media?.startTime ?? 0
        )
        let tolerance = CMTime(seconds: 0.05, preferredTimescale: 600)
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600),
                    toleranceBefore: tolerance, toleranceAfter: tolerance)
        // Un clip qu'on ramène dans son item n'est plus « joué jusqu'au bout »
        // (#7878) : sans cette remise, reculer au doigt dans la scène du
        // lecteur laissait la couche masquée et `alignToTimelineThenPlay`
        // refusait de la relancer.
        if hasPlayedToEnd {
            hasPlayedToEnd = false
            isHidden = false
        }
    }

    @MainActor
    func alignToTimelineThenPlay() {
        guard let player = avPlayer, !hasPlayedToEnd else { return }
        let target = Self.trimmedSeekTarget(
            bounds: currentTrimBounds,
            slidePlayheadSeconds: slidePlayheadSeconds,
            mediaStartTime: media?.startTime ?? 0
        )
        let current = player.currentTime().seconds
        if Self.shouldSeekToAlign(current: current, target: target) {
            player.seek(to: CMTime(seconds: target, preferredTimescale: 600),
                        toleranceBefore: .zero, toleranceAfter: .zero)
        }
        player.play()
    }

    static func shouldSeekToAlign(current: Double, target: Double) -> Bool {
        StoryMediaLayerRules.shouldSeekToAlign(current: current, target: target)
    }

    static func trimmedSeekTarget(bounds: MediaTrimBounds?,
                                  slidePlayheadSeconds: Double,
                                  mediaStartTime: Double) -> Double {
        StoryMediaLayerRules.trimmedSeekTarget(bounds: bounds,
                                               slidePlayheadSeconds: slidePlayheadSeconds,
                                               mediaStartTime: mediaStartTime)
    }

    /// Charge la durée réelle de la source PUIS résout la fenêtre de rognage —
    /// jamais l'inverse. `MediaTrimRule.resolved` (via `StoryMediaObject.trimBounds`)
    /// a besoin de la durée VRAIE pour rejeter des bornes vieillies (fichier
    /// remplacé, plus court qu'au moment du rognage) ; tant qu'elle n'est pas
    /// connue, `currentTrimBounds` reste `nil` et la couche joue la source
    /// entière — jamais un silence ni une image figée pendant l'attente.
    ///
    /// `asset.load(.duration)` est asynchrone et ne bloque jamais le thread
    /// principal (contrat explicite : un seek initial synchrone qui attendrait
    /// dessus geler l'affichage de CHAQUE vidéo foreground, rognée ou non).
    /// Sans intention de rognage déclarée (`sourceStart`/`sourceEnd` tous deux
    /// `nil`), on ne charge RIEN : c'est le cas de loin le plus fréquent, et le
    /// repli "source entière" est déjà exactement le comportement d'aujourd'hui.
    @MainActor
    func startLoadingTrimWindow(for item: AVPlayerItem) {
        guard let media, media.sourceStart != nil || media.sourceEnd != nil else { return }
        let generation = videoLoadGeneration
        let asset = item.asset
        Task { @MainActor [weak self] in
            do {
                let cmDuration = try await asset.load(.duration)
                let seconds = CMTimeGetSeconds(cmDuration)
                guard seconds.isFinite, seconds > 0 else { return }
                guard let self,
                      self.videoLoadGeneration == generation,
                      self.avPlayerLayer?.player?.currentItem === item
                else { return }
                self.applyResolvedTrimBounds(media.trimBounds(sourceDuration: seconds), to: item)
            } catch {
                Self.logger.error("StoryMediaLayer trim window: asset.load(.duration) failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Pose la fenêtre résolue sur l'item (`forwardPlaybackEndTime` = borne de
    /// fin — mécanisme non destructif, aucun ré-encodage) puis recale la
    /// lecture en cours si elle a démarré AVANT que la fenêtre ne soit connue
    /// (le repli "source entière" pendant le chargement, cf. `currentTrimBounds`).
    /// `alignToTimelineThenPlay()` ne saute que si la dérive dépasse son seuil —
    /// exactement le comportement qu'on veut ici : une fenêtre dont `start` est
    /// proche de zéro ne provoque aucun à-coup visible.
    @MainActor
    private func applyResolvedTrimBounds(_ bounds: MediaTrimBounds, to item: AVPlayerItem) {
        currentTrimBounds = bounds
        item.forwardPlaybackEndTime = CMTime(seconds: bounds.end, preferredTimescale: 600)
        guard avPlayerLayer?.player?.currentItem === item, isPlaybackActive else { return }
        alignToTimelineThenPlay()
    }

    /// Reprise/pause transitoire sur lifecycle d'app (foreground/background),
    /// EXACT pendant du `StoryBackgroundLayer.handleAppLifecycle`. Ne touche
    /// PAS au drapeau d'intention `isPlaybackActive` : un retour foreground ne
    /// relance la vidéo QUE si le canvas l'avait autorisée (slide à l'écran,
    /// non pausée). Sans ce gate, une vidéo foreground d'une slide non visible
    /// (canvas retenu / préempté) rejouait à la réouverture de l'app.
    @MainActor
    public func handleAppLifecycle(active: Bool) {
        guard let player = avPlayer else { return }
        if active {
            guard isPlaybackActive else { return }
            player.play()
        } else {
            player.pause()
        }
    }

    nonisolated static func leavesAtItemEnd(declaredDuration: Double?) -> Bool {
        StoryMediaLayerRules.leavesAtItemEnd(declaredDuration: declaredDuration)
    }

    /// Fin d'item d'un clip en lecture : il reste sur sa dernière image tant que
    /// sa fenêtre est ouverte, et ne part que s'il n'en déclare aucune.
    @MainActor
    func clipDidPlayToEnd() {
        hasPlayedToEnd = true
        guard Self.leavesAtItemEnd(declaredDuration: media?.duration) else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        isHidden = true
        CATransaction.commit()
    }
}
