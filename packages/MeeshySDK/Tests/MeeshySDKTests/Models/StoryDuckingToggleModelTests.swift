import XCTest
@testable import MeeshySDK

/// L'atténuation automatique était imposée : le modèle n'avait aucun moyen de
/// la couper. Un dialogue filmé passait sous la musique, ce qui est exactement
/// l'inverse du besoin.
final class StoryDuckingToggleModelTests: XCTestCase {

    // MARK: - Persistance

    func test_mediaObject_duckingFlagRoundTripsThroughCodable() throws {
        let media = StoryMediaObject(postMediaId: "m1", kind: .video,
                                     aspectRatio: 9.0 / 16.0,
                                     isDuckingDisabled: true)
        let data = try JSONEncoder().encode(media)
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: data)

        XCTAssertEqual(decoded.isDuckingDisabled, true)
    }

    /// Aucune story publiée ne porte ce champ. Son absence DOIT se décoder en
    /// `nil` — la lire comme `false` serait exact, mais la lire comme `true`
    /// couperait rétroactivement l'atténuation de toutes les stories.
    func test_mediaObject_absentFlagDecodesAsNil() throws {
        let json = #"{"id":"v1","mediaType":"video","aspectRatio":1.0}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: json)

        XCTAssertNil(decoded.isDuckingDisabled)
    }

    /// Un média qui ne coupe rien n'écrit pas la clé : le JSON des stories
    /// existantes reste octet pour octet le même.
    func test_mediaObject_nilFlagIsNotEncoded() throws {
        let media = StoryMediaObject(postMediaId: "m1", kind: .video, aspectRatio: 1.0)
        let data = try JSONEncoder().encode(media)
        let dict = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(dict["isDuckingDisabled"])
    }

    // MARK: - Commande annulable

    func test_command_setsAndRevertsTheFlag() throws {
        var project = TimelineProject(
            slideId: "s1", slideDuration: 5,
            mediaObjects: [StoryMediaObject(id: "v1", postMediaId: "m1", kind: .video,
                                            aspectRatio: 1.0)]
        )
        let cmd = SetClipPropertyCommand(clipId: "v1", kind: .video,
                                         property: .isDuckingDisabled(old: nil, new: true))

        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.first?.isDuckingDisabled, true)

        try cmd.revert(from: &project)
        XCTAssertNil(project.mediaObjects.first?.isDuckingDisabled)
    }

    /// La pile d'annulation se persiste : un cas non encodé se perdrait au
    /// rechargement du brouillon et l'annulation sauterait cette étape.
    func test_commandProperty_roundTripsThroughCodable() throws {
        let property = SetClipPropertyCommand.ClipProperty.isDuckingDisabled(old: false, new: true)
        let data = try JSONEncoder().encode(property)
        let decoded = try JSONDecoder()
            .decode(SetClipPropertyCommand.ClipProperty.self, from: data)

        XCTAssertEqual(decoded, property)
    }

    /// Le ducking atténue la piste des VIDÉOS. Appliquée à un audio, la
    /// commande ne doit rien écrire — pas même lever.
    func test_command_leavesAudioClipsUntouched() throws {
        var project = TimelineProject(
            slideId: "s1", slideDuration: 5,
            audioPlayerObjects: [StoryAudioPlayerObject(id: "a1", postMediaId: "m1")]
        )
        let cmd = SetClipPropertyCommand(clipId: "a1", kind: .audio,
                                         property: .isDuckingDisabled(old: nil, new: true))

        XCTAssertNoThrow(try cmd.apply(to: &project))
        XCTAssertEqual(project.audioPlayerObjects.first?.id, "a1")
    }
}
