import XCTest
@testable import MeeshySDK

/// Le volume rejoint les keyframes existants comme 5ᵉ canal optionnel, et
/// l'audio gagne la parité avec le média : sans ces deux champs, aucune
/// automation de volume ne peut être ni posée ni publiée.
final class StoryVolumeKeyframeModelTests: XCTestCase {

    func test_keyframe_volumeOnly_roundTripsThroughCodable() throws {
        let kf = StoryKeyframe(time: 4.2, volume: 0.35)
        let data = try JSONEncoder().encode(kf)
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: data)

        XCTAssertEqual(decoded.time, 4.2)
        XCTAssertEqual(decoded.volume, 0.35)
        // Un point « volume seul » ne doit pas inventer de transformation.
        XCTAssertNil(decoded.x)
        XCTAssertNil(decoded.y)
        XCTAssertNil(decoded.scale)
        XCTAssertNil(decoded.opacity)
    }

    func test_keyframe_withoutVolume_decodesAsNil() throws {
        let json = #"{"id":"k1","time":1.0,"x":0.5}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: json)
        XCTAssertNil(decoded.volume)
    }

    func test_audioPlayerObject_carriesKeyframes() throws {
        let audio = StoryAudioPlayerObject(
            postMediaId: "m1",
            keyframes: [StoryKeyframe(time: 0, volume: 1.0),
                        StoryKeyframe(time: 3, volume: 0.2)]
        )
        let data = try JSONEncoder().encode(audio)
        let decoded = try JSONDecoder().decode(StoryAudioPlayerObject.self, from: data)

        XCTAssertEqual(decoded.keyframes?.count, 2)
        XCTAssertEqual(decoded.keyframes?.last?.volume, 0.2)
    }

    /// Ex-`toJSON()`, retiré (B8f, constat 20) : le juge réel est le pipeline
    /// v3 (`encode(to:)` / `init(from:)`, B7) — les keyframes voyagent via
    /// `timing.keyframes` de l'objet `audio`.
    func test_effectsV3RoundTrip_serialisesAudioKeyframes() throws {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(postMediaId: "m1",
                                   keyframes: [StoryKeyframe(time: 2, volume: 0.5)])
        ]
        let data = try JSONEncoder().encode(effects)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: data)

        XCTAssertEqual(decoded.audioPlayerObjects?.first?.keyframes?.count, 1)
        XCTAssertEqual(decoded.audioPlayerObjects?.first?.keyframes?.first?.volume, 0.5)
    }

    /// La mutation de keyframes refusait explicitement les clips audio —
    /// c'était le verrou qui rendait toute automation sonore impossible.
    /// Exercé par la commande publique plutôt qu'en élargissant la visibilité
    /// du helper `fileprivate` : c'est le chemin réel de l'application.
    func test_addKeyframeCommand_acceptsAudioClips() throws {
        var project = TimelineProject(
            slideId: "s1",
            slideDuration: 5,
            audioPlayerObjects: [StoryAudioPlayerObject(id: "a1", postMediaId: "m1")]
        )
        let cmd = AddKeyframeCommand(clipId: "a1", kind: .audio,
                                     keyframe: StoryKeyframe(time: 2, volume: 0.3))
        try cmd.apply(to: &project)

        XCTAssertEqual(project.audioPlayerObjects.first?.keyframes?.count, 1)
        XCTAssertEqual(project.audioPlayerObjects.first?.keyframes?.first?.volume, 0.3)
    }

    /// L'annulation doit vider proprement le tableau.
    func test_addKeyframeCommand_revertsOnAudioClips() throws {
        var project = TimelineProject(
            slideId: "s1",
            slideDuration: 5,
            audioPlayerObjects: [StoryAudioPlayerObject(id: "a1", postMediaId: "m1")]
        )
        let cmd = AddKeyframeCommand(clipId: "a1", kind: .audio,
                                     keyframe: StoryKeyframe(time: 2, volume: 0.3))
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)

        XCTAssertNil(project.audioPlayerObjects.first?.keyframes)
    }

    /// Un sticker garde son refus : il s'édite sur le canvas.
    func test_addKeyframeCommand_stillRejectsStickers() {
        var project = TimelineProject(slideId: "s1", slideDuration: 5)
        let cmd = AddKeyframeCommand(clipId: "st1", kind: .sticker,
                                     keyframe: StoryKeyframe(time: 1, volume: 0.5))
        XCTAssertThrowsError(try cmd.apply(to: &project))
    }
}
