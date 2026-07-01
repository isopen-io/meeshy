import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + Core

extension StoryCanvasUIView {
    /// Latest drawing data captured from `drawingCanvas`. The composer VC reads
    /// this on toggle-off and persists it into `slide.effects.drawingData`.
    public var currentDrawingData: Data? {
        drawingCanvas?.drawing.dataRepresentation()
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        // Wrap les assignations de frame des sublayers : sans
        // `CATransaction.setDisableActions(true)`, un parent qui anime un
        // resize / reposition (présentation modale, rotation, transition de
        // mode `.edit` → `.play`) anime IMPLICITEMENT la position des
        // sublayers, ce qui révèle 1-2 frames du fond pendant l'interpolation
        // et flashe à l'écran. `rebuildLayers()` a son propre wrapper interne
        // mais ce dernier ne protège pas l'assignation du frame ci-dessous.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        rootLayer.frame = bounds
        itemsContainer.frame = bounds
        editOverlayLayer.frame = bounds
        CATransaction.commit()
        rebuildLayers()
    }

    /// `CanvasGeometry` derived from the current bounds. Tests, `StoryRenderer`,
    /// gestures and `StoryAVCompositor` all consume this as the single source
    /// of design→render projection.
    public var geometry: CanvasGeometry {
        CanvasGeometry(renderSize: bounds.size)
    }

    /// Enables or disables PencilKit drawing on top of the canvas. While drawing
    /// is enabled, item gestures (pan/pinch/rotation) are suspended so PKCanvasView
    /// can capture every touch. The composer VC is responsible for reading
    /// `currentDrawingData` on toggle-off and writing it into the slide model.
    /// Re-enabling the mode restores the previous strokes from
    /// `slide.effects.drawingData`.
    public func setDrawingMode(_ enabled: Bool, tool: PKTool? = nil) {
        guard isDrawingMode != enabled else { return }
        isDrawingMode = enabled

        panRecognizer.isEnabled = !enabled
        pinchRecognizer.isEnabled = !enabled
        rotationRecognizer.isEnabled = !enabled

        if enabled {
            let canvas = PKCanvasView(frame: bounds)
            canvas.drawingPolicy = .anyInput
            canvas.tool = tool ?? PKInkingTool(.pen, color: .systemPink, width: 4)
            canvas.backgroundColor = .clear
            canvas.isOpaque = false
            canvas.translatesAutoresizingMaskIntoConstraints = false
            // Restore prior strokes if any so re-entering drawing mode picks
            // up where the user left off.
            if let data = slide.effects.drawingData,
               let drawing = try? PKDrawing(data: data) {
                canvas.drawing = drawing
            }
            addSubview(canvas)
            NSLayoutConstraint.activate([
                canvas.topAnchor.constraint(equalTo: topAnchor),
                canvas.leadingAnchor.constraint(equalTo: leadingAnchor),
                canvas.trailingAnchor.constraint(equalTo: trailingAnchor),
                canvas.bottomAnchor.constraint(equalTo: bottomAnchor),
            ])
            drawingCanvas = canvas
        } else {
            drawingCanvas?.removeFromSuperview()
            drawingCanvas = nil
        }
    }

    /// Injects runtime params for mode `.play` reader playback (Prisme Linguistique,
    /// mute state, completion callback). Idempotent — safe to call from `updateUIView`.
    public func setReaderContext(_ context: StoryReaderContext) {
        readerContext = context
        isAudioMuted = context.mute
        audioMixer.setMute(context.mute)
        // Propagation immédiate aux video media layers : `rebuildLayers()` qui
        // suit peut recréer des layers, mais celles qui survivent (cache LRU
        // live) doivent voir leur AVPlayer.isMuted basculer maintenant. Les
        // nouvelles layers consommeront `isMuted` via leur propre
        // `attachPlayer()` au moment du re-stamping.
        forEachMediaLayer { $0.isMuted = context.mute }
        backgroundLayer.isMuted = context.mute
        rebuildLayers()
        // The context carries `postMediaURLResolver` / `preferredLanguages`,
        // both inputs to audio URL resolution. A context swap (e.g. `.empty`
        // placeholder → real resolver) must force a mixer reload, so drop the
        // revision gate and reconfigure when already playing.
        if mode == .play {
            lastAudioConfigRevision = nil
            reconfigureAudioForPlayback()
            startAudioPlayback()
        }
    }

    public func setMode(_ newMode: RenderMode, time: CMTime = .zero) {
        let wasPlay = mode == .play
        let didChange = mode != newMode
        mode = newMode
        currentTime = time
        if newMode == .play {
            completionFired = false
        }
        // Flush du cache CALayer à chaque transition de mode : en `.edit`
        // les mutations modèle ne sont pas toutes capturées par le fingerprint
        // signature ; en repartant en `.play` on doit reconstruire from scratch
        // pour ne pas servir un layer obsolète.
        if didChange { rendererCache.invalidate() }
        rebuildLayers()
        // Apply slide opening animation when transitioning edit→play at t=0.
        // Runs after rebuildLayers() so the layer tree is fresh.
        if newMode == .play && !wasPlay {
            StoryRenderer.applyOpening(slide.effects.opening,
                                       rootLayer: rootLayer,
                                       elapsed: time.seconds)
        }
        if didChange {
            switch newMode {
            case .play:
                // Préemption canvas-wide : on coupe les autres canvases en
                // `.play` AVANT de démarrer notre propre playback. Évite la
                // double-lecture pendant le swap visible↔outgoing du
                // cross-fade quand SwiftUI tarde à détruire l'ancien canvas.
                registerAsActiveAndPreemptOthers()
                stopEditDisplayLink()
                startPlayback()
                reconfigureAudioForPlayback()
                startAudioPlayback()
            case .edit:
                unregisterFromActive()
                stopPlayback()
                audioMixer.pause()
                releasePlaybackSessionIfNeeded()
                startEditDisplayLinkIfNeeded()
            }
        }
    }
}
