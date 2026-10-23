import XCTest
import CoreMedia
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// **#9865, tranche 2 — sur le canevas vivant, les keyframes d'un texte sont
/// jouées par Core Animation : le calque se bâtit UNE fois, et chaque image ne
/// pose plus que l'horloge du calque.**
///
/// Avant : la signature du cache contenait la position INTERPOLÉE, donc un
/// texte animé ratait le cache à chaque image — `StoryTextLayer` rebâti, texte
/// remis en page, keyframes réévaluées sur le fil principal, 60 à 120 fois par
/// seconde. L'export (cache sans l'option) garde l'évaluation image par image :
/// `layer.render(in:)` ne joue aucune `CAAnimation`.
@MainActor
final class StoryKeyframeCoreAnimationPlaybackTests: XCTestCase {

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

    private func movingText(keyframes: [StoryKeyframe]? = nil,
                            backgroundStyle: StoryTextBackgroundStyle? = nil,
                            fadeIn: Double? = nil) -> StoryTextObject {
        StoryTextObject(id: "t1", text: "x", x: 0.0, y: 0.5,
                        backgroundStyle: backgroundStyle,
                        fadeIn: fadeIn,
                        keyframes: keyframes ?? [
                            StoryKeyframe(time: 0, x: 0.0, y: 0.5, opacity: 1.0),
                            StoryKeyframe(time: 1.0, x: 1.0, y: 0.5, opacity: 0.2),
                        ])
    }

    private func slide(_ text: StoryTextObject) -> StorySlide {
        StorySlide(id: "s-kf", effects: StoryEffects(textObjects: [text]))
    }

    private func cache(coreAnimation: Bool, mode: RenderMode = .play) -> StoryRendererCache {
        let cache = StoryRendererCache(keyframesPlayedByCoreAnimation: coreAnimation)
        cache.invalidateIfNeeded(slideId: "s-kf", languages: [], mode: mode)
        return cache
    }

    private func textLayer(_ slide: StorySlide, at seconds: Double,
                           cache: StoryRendererCache, mode: RenderMode = .play) -> CALayer? {
        StoryRenderer.render(slide: slide, into: geometry,
                             at: CMTime(seconds: seconds, preferredTimescale: 600_000),
                             mode: mode, languages: [], cache: cache)
            .findFirst(named: "t1")
    }

    private func keyframeAnimations(on layer: CALayer?) -> [CAKeyframeAnimation] {
        (layer?.animationKeys() ?? [])
            .filter { $0.hasPrefix(StoryRenderer.keyframeAnimationKey) }
            .compactMap { layer?.animation(forKey: $0) as? CAKeyframeAnimation }
    }

    // MARK: - Le calque se bâtit une fois

    func test_liveCanvas_aMovingText_isBuiltOnce_acrossTicks() throws {
        let live = cache(coreAnimation: true)
        let story = slide(movingText())

        let first = try XCTUnwrap(textLayer(story, at: 0.25, cache: live))
        let second = textLayer(story, at: 0.5, cache: live)
        let third = textLayer(story, at: 0.75, cache: live)

        XCTAssertTrue(first === second && second === third, "le texte animé n'est plus rebâti à chaque image")
        XCTAssertEqual(live.cacheMissCount, 1)
    }

    func test_liveCanvas_theLayerKeepsItsBase_andCoreAnimationCarriesTheMotion() throws {
        let layer = try XCTUnwrap(textLayer(slide(movingText()), at: 0.5, cache: cache(coreAnimation: true)))

        XCTAssertEqual(layer.position.x, 0, accuracy: 1, "la valeur du modèle reste la base : rien n'est interpolé au CPU")
        XCTAssertEqual(Set(keyframeAnimations(on: layer).compactMap(\.keyPath)), ["position", "opacity"])
    }

    // MARK: - L'horloge du calque suit le playhead (pause, seek, parcours au doigt)

    func test_liveCanvas_eachTick_posesOnlyTheLayerClock() throws {
        let live = cache(coreAnimation: true)
        let story = slide(movingText())

        let layer = try XCTUnwrap(textLayer(story, at: 0.5, cache: live))
        XCTAssertEqual(layer.speed, 0)
        XCTAssertEqual(layer.timeOffset, 0.5, accuracy: 1e-9)

        _ = textLayer(story, at: 0.8, cache: live)
        XCTAssertEqual(layer.timeOffset, 0.8, accuracy: 1e-9, "un seek ou un parcours au doigt repose le temps local")
        XCTAssertEqual(keyframeAnimations(on: layer).count, 2, "les animations sont posées une fois, pas empilées")
    }

    /// Le temps local du calque est exactement le playhead : Core Animation
    /// rend la même valeur que l'évaluateur image par image.
    func test_liveCanvas_theLayerLocalTime_isThePlayhead() throws {
        let layer = try XCTUnwrap(textLayer(slide(movingText()), at: 0.6, cache: cache(coreAnimation: true)))
        let state = StoryAnimationClockState(speed: layer.speed, timeOffset: layer.timeOffset, beginTime: layer.beginTime)

        XCTAssertEqual(StoryAnimationClock.localTime(of: state, atParentTime: 1_000), 0.6, accuracy: 1e-9)
    }

    // MARK: - Ce qui reste image par image

    func test_export_keepsTheFrameByFrameEvaluation() throws {
        let layer = try XCTUnwrap(textLayer(slide(movingText()), at: 0.5, cache: cache(coreAnimation: false)))

        XCTAssertEqual(layer.position.x, 540, accuracy: 1, "layer.render(in:) ne joue aucune CAAnimation")
        XCTAssertTrue(keyframeAnimations(on: layer).isEmpty)
    }

    func test_editMode_neverInstallsAnimations() throws {
        let layer = textLayer(slide(movingText()), at: 0.5, cache: cache(coreAnimation: true, mode: .edit), mode: .edit)

        XCTAssertTrue(keyframeAnimations(on: layer).isEmpty)
    }

    /// Le verre découpe le dessous au cadre du MODÈLE : un texte vitré animé
    /// garde l'évaluation image par image, sinon sa découpe resterait figée.
    func test_glassText_staysFrameByFrame() throws {
        let layer = try XCTUnwrap(textLayer(slide(movingText(backgroundStyle: .glass(radius: 20))), at: 0.5,
                                            cache: cache(coreAnimation: true)))

        XCTAssertTrue(keyframeAnimations(on: layer).isEmpty)
        XCTAssertEqual(layer.position.x, 540, accuracy: 1)
    }

    func test_keyframesCoreAnimationCannotPlayExactly_stayFrameByFrame() throws {
        let inexpressible = movingText(keyframes: [
            StoryKeyframe(time: 0, scale: 1), StoryKeyframe(time: 0, scale: 2), StoryKeyframe(time: 1, scale: 3),
        ])
        let layer = textLayer(slide(inexpressible), at: 0.5, cache: cache(coreAnimation: true))

        XCTAssertTrue(keyframeAnimations(on: layer).isEmpty)
    }

    /// Des keyframes modifiées sous le même identifiant rebâtissent le calque,
    /// et donc ses animations.
    func test_editedKeyframes_rebuildTheLayer() throws {
        let live = cache(coreAnimation: true)
        let before = try XCTUnwrap(textLayer(slide(movingText()), at: 0.5, cache: live))
        let edited = movingText(keyframes: [
            StoryKeyframe(time: 0, x: 0.0, y: 0.5), StoryKeyframe(time: 1.0, x: 0.5, y: 0.5),
        ])

        let after = textLayer(slide(edited), at: 0.5, cache: live)

        XCTAssertFalse(before === after)
    }

    /// Le fondu reste posé sur le MODÈLE ; l'opacité des keyframes est jouée
    /// par l'animation, qui prime dès sa première clé (même ordre qu'avant).
    func test_fadePostPass_writesTheEnvelope_notTheKeyframeOpacity() throws {
        let layer = try XCTUnwrap(textLayer(slide(movingText(fadeIn: 1.0)), at: 0.5, cache: cache(coreAnimation: true)))

        XCTAssertEqual(layer.opacity, 0.5, accuracy: 0.01)
    }
}
