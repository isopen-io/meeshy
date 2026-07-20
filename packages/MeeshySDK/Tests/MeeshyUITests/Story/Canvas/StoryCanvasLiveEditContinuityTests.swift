import XCTest
import AVFoundation
import CoreMedia
import QuartzCore
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Contrats de continuité du canvas composer en mode `.edit` (impératif user
/// 2026-07-11) :
///
/// 1. **Manipuler un élément ne fait pas sauter les vidéos qui jouent.** Le
///    cache de layers est actif en `.edit` avec une empreinte de CONTENU par
///    élément : muter le texte (fontSize, couleur, échelle…) ne recrée QUE la
///    layer du texte — la `StoryMediaLayer` d'une vidéo intouchée est réutilisée
///    à l'identique (même instance, même `AVPlayer`, même `AVPlayerItem`).
/// 2. **Manipuler la vidéo elle-même ne la redémarre pas.** Un changement de
///    géométrie (scale/position/rotation) RECONFIGURE la layer existante au
///    lieu d'en rebâtir une, et `attachPlayer` est idempotent à URL constante
///    (pas de `replaceCurrentItem`, pas de seek à zéro).
/// 3. **Le zoom/dézoom d'un texte est rendu en temps réel.** Pendant le geste,
///    la layer texte reçoit un transform d'échelle (ratio modèle/cuit) — le
///    re-rendu net à la nouvelle fontSize arrive à la fin du geste.
@MainActor
final class StoryCanvasLiveEditContinuityTests: XCTestCase {

    // MARK: - StoryRendererCache : empreinte de contenu

    func test_cacheLayer_sameContentHash_hits() {
        let cache = StoryRendererCache()
        let item = LiveEditFixtures.text(id: "t1")

        let l1 = cache.layer(for: item, at: 0, languages: [], contentHash: 42) { _ in CALayer() }
        let l2 = cache.layer(for: item, at: 0, languages: [], contentHash: 42) { _ in CALayer() }

        XCTAssertTrue(l1 === l2, "Même signature + même contentHash = cache hit")
        XCTAssertEqual(cache.cacheHitCount, 1)
    }

    func test_cacheLayer_contentHashChange_rebuilds() {
        let cache = StoryRendererCache()
        let item = LiveEditFixtures.text(id: "t1")

        let l1 = cache.layer(for: item, at: 0, languages: [], contentHash: 1) { _ in CALayer() }
        let l2 = cache.layer(for: item, at: 0, languages: [], contentHash: 2) { _ in CALayer() }

        XCTAssertFalse(l1 === l2,
                       "Un contentHash différent (mutation de contenu à géométrie constante) doit rebâtir la layer")
        XCTAssertEqual(cache.cacheMissCount, 2)
    }

    // MARK: - StoryRendererCache : reconfiguration in-place

    func test_cacheLayer_reconfigure_receivesCachedLayer_andCachesResult() {
        let cache = StoryRendererCache()
        let original = LiveEditFixtures.video(id: "v1", scale: 1.0)
        let scaled = LiveEditFixtures.video(id: "v1", scale: 2.0)

        let l1 = cache.layer(for: original, at: 0, languages: []) { _ in CALayer() }

        var receivedExisting: CALayer?
        let l2 = cache.layer(for: scaled, at: 0, languages: [], reconfigure: { _, existing in
            receivedExisting = existing
            return existing
        }) { _ in
            XCTFail("build ne doit pas être appelé quand reconfigure adopte la layer existante")
            return CALayer()
        }

        XCTAssertTrue(receivedExisting === l1, "reconfigure doit recevoir la layer précédemment cachée")
        XCTAssertTrue(l2 === l1, "La layer réutilisée doit être retournée telle quelle")

        // La nouvelle signature est bien celle stockée : un 3e appel identique = hit.
        let l3 = cache.layer(for: scaled, at: 0, languages: []) { _ in CALayer() }
        XCTAssertTrue(l3 === l1, "La signature re-stockée par reconfigure doit servir les hits suivants")
    }

    func test_cacheLayer_reconfigureReturnsNil_fallsBackToBuild() {
        let cache = StoryRendererCache()
        let original = LiveEditFixtures.text(id: "t1")
        let mutated = LiveEditFixtures.text(id: "t1", x: 0.8)

        _ = cache.layer(for: original, at: 0, languages: []) { _ in CALayer() }
        let fresh = CALayer()
        let l2 = cache.layer(for: mutated, at: 0, languages: [], reconfigure: { _, _ in nil }) { _ in fresh }

        XCTAssertTrue(l2 === fresh, "reconfigure → nil doit retomber sur build")
    }

    // MARK: - StoryMediaLayer : continuité AVPlayer à URL constante

    func test_mediaLayer_configureTwice_sameURL_keepsPlayerItem() {
        let layer = StoryMediaLayer()
        let media = LiveEditFixtures.video(id: "v1", scale: 1.0)
        let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))

        layer.configure(with: media, geometry: geometry, mode: .edit)
        guard let player1 = layer.avPlayer, let item1 = player1.currentItem else {
            return XCTFail("Le premier configure doit attacher un player + item (URL file:// résolue en sync)")
        }

        var scaled = media
        scaled.scale = 2.0
        layer.configure(with: scaled, geometry: geometry, mode: .edit)

        XCTAssertTrue(layer.avPlayer === player1,
                      "Reconfigurer la même URL ne doit pas recréer l'AVPlayer")
        XCTAssertTrue(layer.avPlayer?.currentItem === item1,
                      "Reconfigurer la même URL ne doit PAS replaceCurrentItem — la lecture en cours repartirait de zéro")
    }

    func test_mediaLayer_configure_differentURL_swapsItem() {
        let layer = StoryMediaLayer()
        let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))

        layer.configure(with: LiveEditFixtures.video(id: "v1", fileName: "continuity-a.mp4"),
                        geometry: geometry, mode: .edit)
        let item1 = layer.avPlayer?.currentItem

        layer.configure(with: LiveEditFixtures.video(id: "v1", fileName: "continuity-b.mp4"),
                        geometry: geometry, mode: .edit)

        XCTAssertNotNil(layer.avPlayer?.currentItem)
        XCTAssertFalse(layer.avPlayer?.currentItem === item1,
                       "Une URL différente doit bien swapper l'item (c'est le cas légitime de replaceCurrentItem)")
    }

    // MARK: - StoryRenderer .edit : intégration

    func test_renderEdit_textMutation_reusesUntouchedVideoLayer() {
        let cache = StoryRendererCache()
        let video = LiveEditFixtures.video(id: "v1", scale: 1.0)
        var slide = LiveEditFixtures.slide(media: [video],
                                           texts: [LiveEditFixtures.text(id: "t1")])
        let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))
        cache.invalidateIfNeeded(slideId: slide.id, languages: [], mode: .edit)

        let root1 = StoryRenderer.render(slide: slide, into: geometry, at: .zero,
                                         mode: .edit, languages: [], cache: cache)
        let videoLayer1 = root1.sublayers?.first { $0.name == "v1" }
        let textLayer1 = root1.sublayers?.first { $0.name == "t1" }
        XCTAssertNotNil(videoLayer1)
        XCTAssertNotNil(textLayer1)

        // Mutation de CONTENU du texte à géométrie constante (fontSize) —
        // exactement ce que l'ancienne signature ne capturait pas.
        slide.effects.textObjects[0].fontSize = 64

        let root2 = StoryRenderer.render(slide: slide, into: geometry, at: .zero,
                                         mode: .edit, languages: [], cache: cache)
        let videoLayer2 = root2.sublayers?.first { $0.name == "v1" }
        let textLayer2 = root2.sublayers?.first { $0.name == "t1" }

        XCTAssertTrue(videoLayer1 === videoLayer2,
                      "La vidéo intouchée doit garder SA layer (donc son AVPlayer) quand le texte mute")
        XCTAssertFalse(textLayer1 === textLayer2,
                       "Le texte muté doit être re-rendu (nouvelle layer, fontSize à jour)")
    }

    func test_renderEdit_videoGeometryChange_reconfiguresSameLayer() {
        let cache = StoryRendererCache()
        let video = LiveEditFixtures.video(id: "v1", scale: 1.0)
        var slide = LiveEditFixtures.slide(media: [video], texts: [])
        let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))
        cache.invalidateIfNeeded(slideId: slide.id, languages: [], mode: .edit)

        let root1 = StoryRenderer.render(slide: slide, into: geometry, at: .zero,
                                         mode: .edit, languages: [], cache: cache)
        guard let mediaLayer1 = root1.sublayers?.first(where: { $0.name == "v1" }) as? StoryMediaLayer else {
            return XCTFail("La layer vidéo doit être une StoryMediaLayer nommée v1")
        }
        let item1 = mediaLayer1.avPlayer?.currentItem
        let widthBefore = mediaLayer1.bounds.width
        XCTAssertNotNil(item1)

        slide.effects.mediaObjects?[0].scale = 2.4

        let root2 = StoryRenderer.render(slide: slide, into: geometry, at: .zero,
                                         mode: .edit, languages: [], cache: cache)
        let mediaLayer2 = root2.sublayers?.first { $0.name == "v1" }

        XCTAssertTrue(mediaLayer1 === mediaLayer2,
                      "Un changement de géométrie sur la vidéo doit RECONFIGURER sa layer, pas la rebâtir")
        XCTAssertTrue(mediaLayer1.avPlayer?.currentItem === item1,
                      "La lecture ne doit pas repartir de zéro pendant un pinch sur la vidéo")
        XCTAssertGreaterThan(mediaLayer1.bounds.width, widthBefore,
                             "La reconfiguration in-place doit bien appliquer la nouvelle géométrie (scale 1.0 → 2.4)")
    }

    // MARK: - Scope du cache : taille de rendu

    func test_invalidateIfNeeded_renderSizeChange_flushesCache() {
        // Les layers cachées sont projetées en RENDER-SPACE (bounds/position en
        // pixels écran). Un changement de taille du canvas (fond 16:9 imposé,
        // resize) doit donc flusher le cache — sinon les layers réutilisées
        // gardent la projection de l'ancienne taille.
        let cache = StoryRendererCache()
        let item = LiveEditFixtures.text(id: "t1")

        cache.invalidateIfNeeded(slideId: "s", languages: [], mode: .edit,
                                 renderSize: CGSize(width: 390, height: 693))
        let l1 = cache.layer(for: item, at: 0, languages: []) { _ in CALayer() }

        cache.invalidateIfNeeded(slideId: "s", languages: [], mode: .edit,
                                 renderSize: CGSize(width: 693, height: 390))
        let l2 = cache.layer(for: item, at: 0, languages: []) { _ in CALayer() }

        XCTAssertFalse(l1 === l2, "Un resize du canvas doit produire une layer fraîche re-projetée")
    }

    func test_invalidateIfNeeded_sameRenderSize_keepsCache() {
        let cache = StoryRendererCache()
        let item = LiveEditFixtures.text(id: "t1")
        let size = CGSize(width: 390, height: 693)

        cache.invalidateIfNeeded(slideId: "s", languages: [], mode: .edit, renderSize: size)
        let l1 = cache.layer(for: item, at: 0, languages: []) { _ in CALayer() }
        cache.invalidateIfNeeded(slideId: "s", languages: [], mode: .edit, renderSize: size)
        let l2 = cache.layer(for: item, at: 0, languages: []) { _ in CALayer() }

        XCTAssertTrue(l1 === l2, "À scope constant (slide/langues/mode/taille), le cache doit servir")
    }

    // MARK: - Zoom texte temps réel (transform de geste)

    func test_liveTextGestureTransform_scalesByModelOverBakedRatio() {
        let t = StoryCanvasUIView.liveTextGestureTransform(rotationDegrees: 0,
                                                           modelScale: 2.0,
                                                           bakedScale: 1.0)
        XCTAssertEqual(t.m11, 2.0, accuracy: 0.0001,
                       "Pendant le pinch, la layer texte doit refléter le ratio scale modèle / scale cuit")
        XCTAssertEqual(t.m22, 2.0, accuracy: 0.0001)
    }

    func test_liveTextGestureTransform_preservesRotation() {
        let t = StoryCanvasUIView.liveTextGestureTransform(rotationDegrees: 90,
                                                           modelScale: 3.0,
                                                           bakedScale: 1.5)
        // rotation 90° : m11 = ratio·cos(90°) ≈ 0, m12 = ratio·sin(90°) = ratio.
        XCTAssertEqual(t.m11, 0.0, accuracy: 0.0001)
        XCTAssertEqual(t.m12, 2.0, accuracy: 0.0001)
    }

    func test_liveTextGestureTransform_invalidBakedScale_fallsBackToRotationOnly() {
        let t = StoryCanvasUIView.liveTextGestureTransform(rotationDegrees: 0,
                                                           modelScale: 2.0,
                                                           bakedScale: 0)
        XCTAssertEqual(t.m11, 1.0, accuracy: 0.0001,
                       "bakedScale invalide (≤ 0) → pas de ratio, rotation seule")
    }
}

// MARK: - Fixtures

private enum LiveEditFixtures {

    static func text(id: String, x: Double = 0.5, y: Double = 0.5) -> StoryTextObject {
        StoryTextObject(id: id, text: "Hello", x: x, y: y, fontSize: 32.0)
    }

    /// Vidéo foreground avec URL file:// résolue SYNCHRONEMENT par
    /// `StoryMediaLayer.configureVideo` (fast-path isFileURL) — le player est
    /// attaché dès le retour de `configure`, sans await. Le fichier n'a pas
    /// besoin d'exister : `AVPlayerItem(url:)` est inerte tant qu'on ne joue pas.
    static func video(id: String,
                      scale: Double = 1.0,
                      fileName: String = "continuity.mp4") -> StoryMediaObject {
        var media = StoryMediaObject(id: id,
                                     postMediaId: "",
                                     mediaType: "video",
                                     placement: "media",
                                     aspectRatio: 1.0,
                                     startTime: 0,
                                     duration: 5)
        media.mediaURL = "file:///tmp/\(fileName)"
        media.scale = scale
        media.isBackground = false
        return media
    }

    static func slide(media: [StoryMediaObject], texts: [StoryTextObject]) -> StorySlide {
        var effects = StoryEffects()
        effects.mediaObjects = media
        effects.textObjects = texts
        return StorySlide(id: "slide-continuity", effects: effects, duration: 5, order: 0)
    }
}
