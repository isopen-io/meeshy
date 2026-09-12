// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/CanvasBackgroundIntegrationTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasBackgroundIntegrationTests: XCTestCase {
    func test_canvas_inPlayMode_showsSolidColorBackgroundFromEffects() {
        // StoryEffects.background holds the hex color string
        var effects = StoryEffects()
        effects.background = "#FF0000"  // red hex
        let slide = StorySlide(id: "s", effects: effects)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()

        let bgLayer = findBackgroundLayer(in: view.layer)
        XCTAssertNotNil(bgLayer)
        XCTAssertEqual(bgLayer?.backgroundColor, UIColor.red.cgColor)
    }

    func test_configure_videoSameURLTwice_doesNotReattachPlayerLayer() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        guard let url = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "mp4") else {
            throw XCTSkip("test-1s.mp4 fixture not bundled")
        }
        let resolver: (String) -> URL? = { _ in url }
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        let firstAVLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        let firstPlayer = firstAVLayer?.player

        // Same URL, same transform, same geometry — must be a no-op
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        let secondAVLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        let secondPlayer = secondAVLayer?.player

        XCTAssertTrue(firstAVLayer === secondAVLayer, "AVPlayerLayer must be reused, not reattached")
        XCTAssertTrue(firstPlayer === secondPlayer, "AVPlayer must be reused, not recreated")
    }

    /// **Le double-tap bascule entre DEUX rendus, plus trois valeurs** (#6125).
    ///
    /// Ce témoin assertait `nil → "fit" → "fill" → nil`, et il avait raison
    /// tant que `nil` était le cadrage d'arrivée d'un fond neuf : la boucle se
    /// refermait sur l'état de départ. Depuis que l'ingestion pose `"fit"`
    /// (directive porteur 2026-09-12), `nil` n'est plus un point de départ mais
    /// un **alias** — le renderer le peint exactement comme `"fill"`
    /// (`StoryBackgroundLayer.resolveVideoGravity` : « mode libre : TOUJOURS
    /// `.resizeAspectFill` »).
    ///
    /// > Revenir à `nil` depuis `"fill"` aurait enchaîné **deux appuis au rendu
    /// > identique**. Le troisième tap ci-dessous vérifie précisément ça : il
    /// > doit RAMENER à `"fit"`, pas à l'alias.
    ///
    /// Le témoin garde son entrée sur `nil` — c'est ce que porte toute
    /// composition antérieure au lot, et le cycle doit continuer de la servir.
    /// La règle elle-même est éprouvée à part et sans canvas
    /// (`StoryBackgroundFramingTests`) ; ce test-ci vérifie que le GESTE
    /// l'appelle, et qu'il commit dans le modèle.
    func test_doubleTap_onBg_cyclesVideoFitMode() throws {
        let bgMedia = StoryMediaObject(
            id: "bg-1",
            postMediaId: "bg-1",
            mediaURL: "file:///tmp/test.jpg",
            mediaType: "image",
            aspectRatio: 1.0,
            isBackground: true
        )
        var effects = StoryEffects()
        effects.mediaObjects = [bgMedia]
        let slide = StorySlide(id: "s1", effects: effects)
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.layoutIfNeeded()

        XCTAssertNil(canvas.slide.effects.backgroundTransform?.videoFitMode)
        canvas.performDoubleTapForTesting(targetId: "bg-1")
        XCTAssertEqual(canvas.slide.effects.backgroundTransform?.videoFitMode, "fit",
                       "Depuis l'alias `nil` (qui REMPLIT), l'appui doit ajuster.")
        canvas.performDoubleTapForTesting(targetId: "bg-1")
        XCTAssertEqual(canvas.slide.effects.backgroundTransform?.videoFitMode, "fill")
        canvas.performDoubleTapForTesting(targetId: "bg-1")
        XCTAssertEqual(canvas.slide.effects.backgroundTransform?.videoFitMode, "fit",
                       "Le cycle a DEUX états : revenir à `nil` rendrait deux appuis identiques à l'écran (#6125).")
    }

    func test_bgScale_mutation_routesContentLayerTransform() throws {
        // Depuis l'unification BG/FG (2026-05-29) : le bg utilise les mêmes
        // updateScale/updatePosition/updateRotation que les items FG, qui
        // mutent `mediaObjects[bg]`. Le canvas observe la mutation via
        // `slide.didSet` qui appelle `updateManipulatedItemLayer` qui route
        // le bg vers `backgroundLayer.applyContentTransform` sur le content
        // sublayer (au lieu de chercher dans itemsContainer où le bg n'est
        // pas).
        //
        // Ce test vérifie le bout-à-bout du chemin unifié : muter le slide
        // bg → contentLayer.transform reflète le changement (alignement
        // strict avec le pattern FG qui mute le slide → CALayer reflète).
        let bgMedia = StoryMediaObject(
            id: "bg-1",
            postMediaId: "bg-1",
            mediaURL: "file:///tmp/test.jpg",
            mediaType: "image",
            aspectRatio: 1.0,
            isBackground: true
        )
        var effects = StoryEffects()
        effects.mediaObjects = [bgMedia]
        let slide = StorySlide(id: "s1", effects: effects)
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.layoutIfNeeded()

        let contentLayer = canvas.backgroundLayer.contentLayer
        XCTAssertNotNil(contentLayer, "Image bg should have created contentLayer in configure()")
        let initialTransform = contentLayer?.transform ?? CATransform3DIdentity

        // Simuler ce que `handlePinch.changed` fait : mute mediaObjects[bg].scale.
        // En vrai, ça passe par `updateScale` → slide.didSet → rebuildLayers
        // (sans gesture actif puisque le test n'enchaîne pas un gesture).
        var updatedSlide = canvas.slide
        if var medias = updatedSlide.effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == "bg-1" }) {
            medias[idx].scale = 2.0
            updatedSlide.effects.mediaObjects = medias
        }
        canvas.slide = updatedSlide
        canvas.layoutIfNeeded()

        let newTransform = contentLayer?.transform ?? CATransform3DIdentity
        XCTAssertFalse(CATransform3DEqualToTransform(initialTransform, newTransform),
                      "bg content sublayer transform must reflect mediaObjects[bg].scale change")
        XCTAssertEqual(newTransform.m11, 2.0, accuracy: 1e-9,
                      "scale 2.0 mutated on mediaObjects[bg] should appear on contentLayer.transform.m11")
    }

    private func findBackgroundLayer(in root: CALayer) -> StoryBackgroundLayer? {
        if let bg = root as? StoryBackgroundLayer { return bg }
        for sub in (root.sublayers ?? []) {
            if let found = findBackgroundLayer(in: sub) { return found }
        }
        return nil
    }
}
