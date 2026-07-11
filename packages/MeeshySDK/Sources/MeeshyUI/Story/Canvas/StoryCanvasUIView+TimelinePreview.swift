import UIKit
import CoreMedia
import AVFoundation
import MeeshySDK

// MARK: - StoryCanvasUIView + TimelinePreview (preview vivante)
//
// Quand la sheet timeline est ouverte (détent 0.45), le canvas composer
// visible derrière EST le moniteur de preview : chaque mouvement du playhead
// (scrub ou tick de lecture engine) re-rend la slide à ce temps-là avec la
// sémantique `.play` — les éléments apparaissent/disparaissent selon leurs
// fenêtres, les keyframes s'appliquent, les transitions intra-slide jouent.
//
// Partage des responsabilités audio/vidéo :
// - AUDIO : le `StoryTimelineEngine` (AudioMixer) est la seule source sonore.
//   Les AVPlayer du canvas sont muets tant que la preview est active.
// - VIDÉO (scrub) : players en pause, calés par seek tolérant (un seek
//   frame-accurate à 60 Hz gèle sur la décompression GOP).
// - VIDÉO (lecture) : players relancés calés sur le playhead (mécanique
//   `slidePlayheadSeconds` + `alignToTimelineThenPlay` existante), muets ;
//   les ticks engine ne re-seekent PAS les players (ils jouent nativement),
//   ils ne rafraîchissent que le rendu des overlays.

extension StoryCanvasUIView {

    var isTimelinePreviewActive: Bool { timelinePreviewSeconds != nil }

    /// Mode de RENDU effectif : `.play` pendant la preview timeline pour que
    /// `StoryRenderer` applique fenêtres/keyframes/transitions, sans toucher
    /// à `mode` (qui continue de gater gestes, overlays d'édition et
    /// display-link du reader).
    var renderMode: RenderMode {
        (mode == .edit && isTimelinePreviewActive) ? .play : mode
    }

    /// Mute effectif re-stampé sur chaque AVPlayer à chaque rebuild : l'engine
    /// timeline possède l'audio pendant la preview.
    var effectiveAudioMuted: Bool { isAudioMuted || isTimelinePreviewActive }

    /// Entre en preview (seconds non-nil), met à jour le playhead, ou en sort
    /// (nil). No-op hors `.edit` — le reader/viewer ne preview jamais.
    public func setTimelinePreview(seconds: Double?) {
        guard mode == .edit else { return }
        let wasActive = isTimelinePreviewActive
        timelinePreviewSeconds = seconds
        guard let seconds else {
            if wasActive { exitTimelinePreview() }
            return
        }
        currentTime = CMTime(seconds: max(0, seconds), preferredTimescale: 600_000)
        rebuildLayers()
        if !timelinePreviewPlaying {
            alignPreviewPlayersPaused()
        }
    }

    /// Suit l'état du transport timeline. En lecture les vidéos du canvas
    /// jouent muettes, calées sur le playhead ; en pause elles gèlent sur
    /// place (le prochain scrub les recale).
    public func setTimelinePreviewPlaying(_ playing: Bool) {
        guard isTimelinePreviewActive else { return }
        guard timelinePreviewPlaying != playing else { return }
        timelinePreviewPlaying = playing
        pushSlidePlayheadToLayers()
        backgroundLayer.isPlaybackActive = playing
        foregroundVideosPlaybackActive = playing
        if !playing {
            alignPreviewPlayersPaused()
        }
    }

    /// Sortie de preview : redonne le canvas au mode édition nominal — les
    /// boucles vidéo du composer (`applyEditPlayback`) reprennent avec leur
    /// audio, le rendu redevient intemporel (tous les éléments visibles).
    private func exitTimelinePreview() {
        timelinePreviewPlaying = false
        backgroundLayer.isPlaybackActive = false
        foregroundVideosPlaybackActive = false
        rebuildLayers()
    }

    private func alignPreviewPlayersPaused() {
        pushSlidePlayheadToLayers()
        backgroundLayer.alignPausedToSlidePlayhead()
        forEachMediaLayer { $0.alignPausedToSlidePlayhead() }
    }
}

// MARK: - StoryCanvasTimelineBridge

/// Pont UIKit entre le `TimelineViewModel` (sheet) et le `StoryCanvasUIView`
/// du composer : les callbacks playhead/lecture poussent directement dans la
/// vue, sans ré-évaluer le body SwiftUI du composer à 60 Hz. Enregistré par
/// `StoryComposerCanvasView.makeUIView`, consommé par le bridge composer.
@MainActor
public final class StoryCanvasTimelineBridge {
    public weak var canvas: StoryCanvasUIView?

    public init() {}

    public func scrub(seconds: Double) {
        canvas?.setTimelinePreview(seconds: seconds)
    }

    public func setPlaying(_ playing: Bool) {
        canvas?.setTimelinePreviewPlaying(playing)
    }

    public func end() {
        canvas?.setTimelinePreview(seconds: nil)
    }
}
