import XCTest
@testable import Meeshy

/// Les lois de la pluie d'emoji de la page d'une humeur (#10814) : une
/// particule grossit, s'efface à mesure qu'elle grossit, est totalement
/// transparente à la moitié de la largeur de l'écran — et elle est alors
/// DÉTRUITE. Le nombre de particules vivantes est borné.
@MainActor
final class MoodEmojiRainTests: XCTestCase {

    private struct SeededGenerator: RandomNumberGenerator {
        var state: UInt64
        mutating func next() -> UInt64 {
            state &+= 0x9E3779B97F4A7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
            z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
            return z ^ (z >> 31)
        }
    }

    private func makeParticle(birth: TimeInterval = 0, lifetime: TimeInterval = 4) -> MoodEmojiParticle {
        MoodEmojiParticle(id: 0, birth: birth, lifetime: lifetime, originX: 0.5, originY: 0.5, phase: 0, amplitude: 0.03)
    }

    func test_frame_atBirth_isSmallAndOpaque() {
        let frame = MoodEmojiRain.frame(of: makeParticle(), at: 0, in: CGSize(width: 400, height: 800))

        XCTAssertEqual(frame.size, MoodEmojiRain.birthSize, accuracy: 0.001)
        XCTAssertEqual(frame.opacity, 1, accuracy: 0.001)
    }

    func test_frame_atEndOfLife_isHalfTheWidthAndFullyTransparent() {
        let frame = MoodEmojiRain.frame(of: makeParticle(lifetime: 4), at: 4, in: CGSize(width: 400, height: 800))

        XCTAssertEqual(frame.size, 200, accuracy: 0.001)
        XCTAssertEqual(frame.opacity, 0, accuracy: 0.001)
    }

    func test_frame_asItGrows_becomesMoreTransparent() {
        let particle = makeParticle(lifetime: 4)
        let canvas = CGSize(width: 400, height: 800)
        let frames = stride(from: 0.0, through: 4.0, by: 0.5).map { MoodEmojiRain.frame(of: particle, at: $0, in: canvas) }

        XCTAssertEqual(frames.map(\.size), frames.map(\.size).sorted())
        XCTAssertEqual(frames.map(\.opacity), frames.map(\.opacity).sorted(by: >))
    }

    func test_frame_oscillatesSideways() {
        let particle = makeParticle(lifetime: 4)
        let canvas = CGSize(width: 400, height: 800)
        let xs = stride(from: 0.0, through: 2.0, by: 0.1).map { MoodEmojiRain.frame(of: particle, at: $0, in: canvas).center.x }

        XCTAssertGreaterThan(xs.max()! - xs.min()!, 10)
    }

    func test_advanced_firstFrame_spawnsOneParticle() {
        var generator = SeededGenerator(state: 1)
        let state = MoodEmojiRainState.empty.advanced(to: 100, using: &generator)

        XCTAssertEqual(state.particles.count, 1)
    }

    func test_advanced_particlePastItsLifetime_isDestroyed() {
        var generator = SeededGenerator(state: 2)
        let born = MoodEmojiRainState.empty.advanced(to: 0, using: &generator)
        let particle = try! XCTUnwrap(born.particles.first)

        let later = born.advanced(to: particle.lifetime + 0.01, using: &generator)

        XCTAssertFalse(later.particles.contains { $0.id == particle.id })
    }

    func test_advanced_overManyFrames_neverExceedsTheCap() {
        var generator = SeededGenerator(state: 3)
        var state = MoodEmojiRainState.empty
        var peak = 0
        for frame in 0..<1200 {
            state = state.advanced(to: Double(frame) / 120, using: &generator)
            peak = max(peak, state.particles.count)
        }

        XCTAssertLessThanOrEqual(peak, MoodEmojiRain.maxParticles)
        XCTAssertGreaterThan(peak, 1)
    }

    func test_advanced_beforeTheSpawnInterval_doesNotSpawn() {
        var generator = SeededGenerator(state: 4)
        let first = MoodEmojiRainState.empty.advanced(to: 0, using: &generator)

        let soon = first.advanced(to: MoodEmojiRain.spawnInterval / 2, using: &generator)

        XCTAssertEqual(soon.particles.count, 1)
    }

    func test_advanced_spawnsAllOverTheScreen() {
        var generator = SeededGenerator(state: 5)
        let particles = (0..<200).map { MoodEmojiRain.makeParticle(id: $0, birth: 0, using: &generator) }

        XCTAssertLessThan(particles.map(\.originX).min()!, 0.25)
        XCTAssertGreaterThan(particles.map(\.originX).max()!, 0.75)
        XCTAssertLessThan(particles.map(\.originY).min()!, 0.25)
        XCTAssertGreaterThan(particles.map(\.originY).max()!, 0.75)
    }

    func test_engineReset_destroysEveryParticle() {
        let engine = MoodEmojiRainEngine()
        _ = engine.advance(to: 0)
        _ = engine.advance(to: 1)

        engine.reset()

        XCTAssertTrue(engine.state.particles.isEmpty)
    }
}
