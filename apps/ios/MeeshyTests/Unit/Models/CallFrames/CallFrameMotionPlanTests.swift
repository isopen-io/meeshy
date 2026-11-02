import XCTest
@testable import Meeshy

/// LE PLAN DE MOUVEMENT D'UN CADRE (#12683) — quels ornements bougent, comment, et combien au plus.
final class CallFrameMotionPlanTests: XCTestCase {
    private func ornament(_ kind: CallFrameOrnamentKind, motion: CallFrameOrnamentMotion = .loop, layer: CallFrameLayer = .back) -> CallFrameOrnament {
        CallFrameOrnament(kind: kind, color: "#FFFFFF", density: .mid, layer: layer, motion: motion)
    }

    private func look(_ ornaments: [CallFrameOrnament]) throws -> CallFrameLook {
        let base = try XCTUnwrap(CallFrameCatalogue.all.first).look
        return CallFrameLook(
            layout: base.layout, slot: base.slot, background: base.background, pattern: base.pattern, border: base.border,
            ornaments: ornaments, names: base.names, title: base.title, subtitle: base.subtitle
        )
    }

    func test_style_shapesThatCannotMove_stayStill() {
        [CallFrameOrnamentKind.grain, .vignette, .crown, .ribbon, .tape, .cobwebs, .drips, .skulls, .roses].forEach { kind in
            XCTAssertNil(CallFrameMotionPlan.style(for: kind), kind.rawValue)
            XCTAssertFalse(CallFrameMotionPlan.moves(ornament(kind)), kind.rawValue)
        }
    }

    func test_style_particlesFall_bubblesRise_sparklesTwinkle() {
        XCTAssertEqual(CallFrameMotionPlan.style(for: .confetti), .fall(period: 9))
        XCTAssertEqual(CallFrameMotionPlan.style(for: .bubbles), .rise(period: 10))
        XCTAssertEqual(CallFrameMotionPlan.style(for: .sparkles), .twinkle(period: 2.4))
        XCTAssertEqual(CallFrameMotionPlan.style(for: .rec), .blink)
    }

    func test_moves_stillOrnament_doesNotMove() {
        XCTAssertFalse(CallFrameMotionPlan.moves(ornament(.sparkles, motion: .still)))
        XCTAssertTrue(CallFrameMotionPlan.moves(ornament(.sparkles)))
    }

    func test_tracks_keepTheRankOfEachMovingOrnament() throws {
        let tracks = CallFrameMotionPlan.tracks(for: try look([ornament(.grain), ornament(.sparkles, motion: .still), ornament(.confetti), ornament(.rec, motion: .onAppear)]))
        XCTAssertEqual(tracks.map(\.rank), [2, 3])
        XCTAssertEqual(tracks.map(\.repeats), [true, false])
        XCTAssertEqual(CallFrameMotionPlan.animatedRanks(for: try look([ornament(.grain), ornament(.confetti)])), [1])
    }

    func test_tracks_areCappedForTheLiveBudget() throws {
        let many = Array(repeating: ornament(.stars), count: CallFrameMotionPlan.maxTracks + 2)
        XCTAssertEqual(CallFrameMotionPlan.tracks(for: try look(many)).count, CallFrameMotionPlan.maxTracks)
    }

    func test_partitions_twinkleIsStaggeredInThreeGroups_fallIsOneTravelingSheet() {
        let twinkle = CallFrameMotionTrack(rank: 0, ornament: ornament(.sparkles), style: .twinkle(period: 2), repeats: true)
        let fall = CallFrameMotionTrack(rank: 0, ornament: ornament(.confetti), style: .fall(period: 9), repeats: true)
        XCTAssertEqual(twinkle.partitions, 3)
        XCTAssertFalse(twinkle.travels)
        XCTAssertEqual(fall.partitions, 1)
        XCTAssertTrue(fall.travels)
    }

    func test_stylesInSeveralGroups_onlyApplyToScatteredOrnaments() {
        CallFrameOrnamentKind.allCases.forEach { kind in
            guard let style = CallFrameMotionPlan.style(for: kind), CallFrameMotionPlan.partitions(for: style) > 1 else { return }
            XCTAssertTrue(CallFrameMotionPlan.isScattered(kind), kind.rawValue)
        }
    }

    func test_partition_splitsDrawsWithoutLosingAny() {
        let parts = (0 ..< 3).map { CallFrameOrnamentPartition(index: $0, count: 3) }
        (0 ..< 30).forEach { draw in
            XCTAssertEqual(parts.filter { $0.includes(draw) }.count, 1, "\(draw)")
        }
        XCTAssertTrue(CallFrameOrnamentPartition(index: 0, count: 1).includes(7))
    }

    func test_everyFeaturedFrame_movesInLive() {
        let featured = Set(CallFrameCatalogue.spotlight.flatMap(\.featured))
        CallFrameCatalogue.all.filter { featured.contains($0.motif) }.forEach { design in
            XCTAssertFalse(CallFrameMotionPlan.tracks(for: design.look).isEmpty, design.id)
        }
    }
}

/// LES COUCHES ANIMÉES D'UNE SCÈNE (#12683) — les particules, lumières et boucles vidéo qu'une marque déclare.
final class CallFrameSceneMotionPlanTests: XCTestCase {
    private func look(scene: [CallFrameSceneLayer]) throws -> CallFrameLook {
        let base = try XCTUnwrap(CallFrameCatalogue.all.first).look
        return CallFrameLook(layout: base.layout, slot: base.slot, background: base.background, pattern: base.pattern, border: base.border,
                             ornaments: [], names: base.names, title: base.title, subtitle: base.subtitle, scene: scene)
    }

    private func layer(_ id: String, _ kind: CallFrameSceneLayerKind, depth: CallFrameSceneDepth = .back, preset: CallFrameOrnamentKind? = nil, max: Int? = nil) -> CallFrameSceneLayer {
        CallFrameSceneLayer(id: id, kind: kind, depth: depth, src: kind == .videoLoop ? "assets/call-frames/test_loop.mov" : nil,
                            preset: preset, color: "#FFD166", amount: 0.5, maxParticles: max)
    }

    func test_sceneParticles_becomeATrackOfTheirPreset_afterTheOrnaments() throws {
        let tracks = CallFrameMotionPlan.sceneTracks(for: try look(scene: [layer("halo", .light), layer("braises", .particles, depth: .front, preset: .sparkles, max: 120)]))
        XCTAssertEqual(tracks.map(\.rank), [CallFrameMotionPlan.sceneRankOffset + 1])
        XCTAssertEqual(tracks.first?.ornament.kind, .sparkles)
        XCTAssertEqual(tracks.first?.ornament.density, .high)
        XCTAssertEqual(tracks.first?.ornament.layer, .front)
    }

    func test_ambientLayers_areTheLightsAndVideoLoops() throws {
        let scene = [layer("matiere", .image), layer("halo", .light), layer("boucle", .videoLoop), layer("braises", .particles, preset: .snow)]
        XCTAssertEqual(CallFrameMotionPlan.ambientLayers(for: try look(scene: scene)).map(\.id), ["halo", "boucle"])
    }
}
