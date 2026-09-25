import UIKit
import CoreMedia
import MeeshySDK

// MARK: - StoryCanvasUIView + ReaderScrub (#7878)
//
// Le LECTEUR parcourt sa scène au doigt : la barre de progression pointe une
// fraction, le canvas se redessine à l'instant correspondant, puis la lecture
// reprend de là.
//
// C'est la jumelle LECTURE de `+TimelinePreview` (composer) et elle en reprend
// la mécanique, pas une autre :
// - le playhead est `currentTime`, la seule horloge — vidéo (via
//   `slidePlayheadSeconds`), audio (`captureSlideTimelineAnchor`), fenêtres
//   d'objets, keyframes et fermeture la suivent déjà ;
// - chaque mouvement re-rend la slide en `.play` à ce temps (`rebuildLayers`) ;
// - les vidéos restent EN PAUSE, calées par seek tolérant
//   (`alignPausedToSlidePlayhead`) : un seek frame-accurate à la cadence du
//   doigt gèle sur la décompression GOP.
//
// La preview composer vit en `.edit` et son audio appartient au moteur de
// timeline ; ici le canvas est en `.play` et possède son mixer. Au relâcher, la
// passe audio est donc soldée (`audioMixer.stop()`) : la reprise la replanifie
// depuis la NOUVELLE ancre, sans quoi la vidéo repartirait à `t` sous un son
// resté à l'ancienne position.

extension StoryCanvasUIView {

    /// L'instant de la scène que pointe une fraction de sa durée. Borné à la
    /// scène ; une fraction non finie vaut le début.
    nonisolated static func readerScrubSeconds(fraction: Double, duration: Double) -> Double {
        guard fraction.isFinite, duration.isFinite, duration > 0 else { return 0 }
        return min(max(fraction, 0), 1) * duration
    }

    /// Le doigt se pose : la lecture gèle sur place.
    public func beginReaderScrub() {
        guard mode == .play else { return }
        setStoryPlaybackPaused(true)
    }

    /// Le doigt glisse : la scène se redessine à l'instant pointé.
    public func scrubReader(toFraction fraction: Double) {
        guard mode == .play else { return }
        let duration = effectiveSlideTotalDuration
        let seconds = Self.readerScrubSeconds(fraction: fraction, duration: duration)
        currentTime = CMTime(seconds: seconds, preferredTimescale: 600_000)
        pushSlidePlayheadToLayers()
        rebuildLayers()
        StoryRenderer.applyClosing(slide.effects.closing,
                                   rootLayer: rootLayer,
                                   elapsed: seconds,
                                   totalDuration: duration)
        backgroundLayer.alignPausedToSlidePlayhead()
        forEachMediaLayer { $0.alignPausedToSlidePlayhead() }
        StoryReaderPlayheadState.shared.publish(seconds)
    }

    /// Le doigt se lève : la scène reprend DEPUIS la position choisie — ou
    /// reste en pause si l'hôte l'y tenait avant le geste.
    ///
    /// Une scène allée au bout avait arrêté son horloge et consommé sa
    /// complétion : reculer les réarme, sinon elle resterait figée sur la
    /// position choisie.
    public func endReaderScrub(atFraction fraction: Double, resume: Bool) {
        guard mode == .play else { return }
        scrubReader(toFraction: fraction)
        if completionFired, currentTime.seconds < effectiveSlideTotalDuration {
            completionFired = false
            startPlayback()
            displayLink?.isPaused = isPlaybackPaused
        }
        if audioMixer.hasStartedPlayback(slideKey: currentSlideKey) {
            audioMixer.stop()
        }
        setStoryPlaybackPaused(!resume)
    }
}
