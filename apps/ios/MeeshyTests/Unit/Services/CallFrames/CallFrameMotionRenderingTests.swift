import QuartzCore
import XCTest
@testable import Meeshy

/// LES ORNEMENTS ANIMÉS (#12683) — peints une fois, au même endroit que dans les couches fixes,
/// confiés à Core Animation ; les couches fixes de la même scène les omettent.
final class CallFrameMotionRenderingTests: XCTestCase {
    private let size = CGSize(width: 108, height: 192)
    private let texts = CallFrameTexts(groupName: nil, isGroup: false, date: "24 oct. 2026", accentHex: nil)
    private let duo = [
        CallFramePerson(id: "a", name: "Awa", handle: nil, isSelf: true),
        CallFramePerson(id: "b", name: "Karim", handle: nil, isSelf: false),
    ]

    private func animatedDuo() throws -> CallFrameDesign {
        try XCTUnwrap(CallFrameCatalogue.all.first { $0.bucket == .duo && !CallFrameMotionPlan.tracks(for: $0.look).isEmpty })
    }

    private func stage(_ design: CallFrameDesign, excludesMotion: Bool = false) -> CallFrameStage {
        CallFrameStage(frame: design, people: duo, texts: texts, size: size, excludesMotion: excludesMotion)
    }

    func test_renderMotion_oneSpritePerTrack_oneImagePerGroup() throws {
        let design = try animatedDuo()
        let motion = try XCTUnwrap(CallFrameMotionRenderer.renderMotion(stage(design)))
        let tracks = CallFrameMotionPlan.tracks(for: design.look)
        XCTAssertEqual(motion.sprites.count, tracks.count)
        zip(motion.sprites, tracks).forEach { sprite, track in
            XCTAssertEqual(sprite.images.count, track.partitions)
            sprite.images.forEach { XCTAssertEqual(CGSize(width: $0.width, height: $0.height), size) }
        }
        XCTAssertEqual(CGSize(width: motion.mask.width, height: motion.mask.height), size)
    }

    func test_renderMotion_stillFrame_hasNothingToAnimate() throws {
        let still = try XCTUnwrap(CallFrameCatalogue.all.first { CallFrameMotionPlan.tracks(for: $0.look).isEmpty })
        XCTAssertNil(CallFrameMotionRenderer.renderMotion(stage(still)))
    }

    func test_layers_withoutMotion_areCachedApartFromTheCompleteLayers() throws {
        let design = try animatedDuo()
        XCTAssertNotEqual(CallFrameRenderer.layerKey(stage(design)), CallFrameRenderer.layerKey(stage(design, excludesMotion: true)))
    }

    func test_compositor_animates_handsTheMotionToCoreAnimation() throws {
        let design = try animatedDuo()
        let inputs = CallLiveFrameLayerInputs(frameId: design.id, people: duo, texts: texts, size: size, animates: true)
        let painted = try XCTUnwrap(CallLiveFrameCompositor().paint(design: design, inputs: inputs, cachingLayers: false))
        XCTAssertNotNil(painted.motion)
        let still = CallLiveFrameLayerInputs(frameId: design.id, people: duo, texts: texts, size: size)
        XCTAssertNil(try XCTUnwrap(CallLiveFrameCompositor().paint(design: design, inputs: still, cachingLayers: false)).motion)
    }

    func test_animations_fallingSheet_travelsOneCanvasHeightForever() {
        let track = CallFrameMotionTrack(rank: 0, ornament: CallFrameOrnament(kind: .confetti, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                                         style: .fall(period: 9), repeats: true)
        let animation = CallFrameMotionAnimations.animations(for: track, index: 0, size: size, unit: 108).first as? CABasicAnimation
        XCTAssertEqual(animation?.keyPath, "transform.translation.y")
        XCTAssertEqual(animation?.toValue as? Double, Double(size.height))
        XCTAssertEqual(animation?.repeatCount, .infinity)
    }

    func test_animations_twinkleGroups_areOutOfPhase() {
        let track = CallFrameMotionTrack(rank: 0, ornament: CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                                         style: .twinkle(period: 3), repeats: true)
        let offsets = (0 ..< 3).compactMap { CallFrameMotionAnimations.animations(for: track, index: $0, size: size, unit: 108).first?.timeOffset }
        XCTAssertEqual(offsets, [0, 1, 2])
    }

    func test_animations_onAppear_entersOnceThenStays() {
        let track = CallFrameMotionTrack(rank: 0, ornament: CallFrameOrnament(kind: .stars, color: "#FFFFFF", density: .mid, layer: .back, motion: .onAppear),
                                         style: .twinkle(period: 3), repeats: false)
        let animations = CallFrameMotionAnimations.animations(for: track, index: 0, size: size, unit: 108)
        XCTAssertEqual(animations.count, 1)
        XCTAssertEqual(animations.first?.repeatCount, 0)
    }
}

/// LES ILLUSTRATIONS D'UN CADRE (#12683) — la bordure en neuf morceaux garde ses coins intacts.
final class CallFrameSceneImagePainterTests: XCTestCase {
    func test_nineSlice_cornersKeepTheSliceOfTheShortSide_edgesStretch() {
        let pieces = CallFrameSceneImagePainter.nineSlicePieces(source: CGSize(width: 1080, height: 1920), target: CGRect(x: 0, y: 0, width: 400, height: 900), slice: 0.2)
        XCTAssertEqual(pieces.count, 9)
        XCTAssertEqual(pieces[0].source, CGRect(x: 0, y: 0, width: 216, height: 216))
        XCTAssertEqual(pieces[0].target, CGRect(x: 0, y: 0, width: 80, height: 80))
        XCTAssertEqual(pieces[8].target, CGRect(x: 320, y: 820, width: 80, height: 80))
        XCTAssertEqual(pieces[4].target, CGRect(x: 80, y: 80, width: 240, height: 740))
    }
}
