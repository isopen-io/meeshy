import XCTest
@testable import MeeshySDK

/// **Ce que le crédit d'un son emprunté sait de lui, et ce qu'une republication
/// JOUE** (#9677).
///
/// Deux données, une chacune :
/// - la DATE du son, gravée au choix depuis `APISound.createdAt` — elle tient la
///   place du titre quand l'auteur n'en a pas donné ; elle doit survivre au fil
///   (JSON) et au pont v1⇄v3, et ne jamais casser le décodage d'une story
///   publiée avant elle ;
/// - les EFFETS qu'une publication joue : une republication vide joue sa source,
///   et la carte, le détail et le lecteur doivent annoncer ce son-là.
final class BorrowedSoundCreditDataTests: XCTestCase {

    private func borrowed(createdAt: String? = "2026-03-12T09:30:00Z") -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: "bg", isBackground: true, name: nil,
                               soundId: "6a97198de19ad1985081d6a6",
                               soundAuthorUsername: "lume",
                               soundCreatedAt: createdAt)
    }

    private func effects(_ audio: StoryAudioPlayerObject) -> StoryEffects {
        var e = StoryEffects()
        e.audioPlayerObjects = [audio]
        return e
    }

    // MARK: - La date du son

    func test_soundCreatedAtStamp_writesAnIsoInstant_andReadsItBack() throws {
        let instant = Date(timeIntervalSince1970: 1_773_307_800)
        let stamp = try XCTUnwrap(StoryAudioPlayerObject.soundCreatedAtStamp(instant))
        let audio = StoryAudioPlayerObject(soundCreatedAt: stamp)
        XCTAssertEqual(audio.soundReleaseDate, instant)
    }

    func test_soundReleaseDate_readsFractionalSeconds() {
        let audio = StoryAudioPlayerObject(soundCreatedAt: "2026-03-12T09:30:00.250Z")
        XCTAssertNotNil(audio.soundReleaseDate)
    }

    func test_soundReleaseDate_isNil_whenAbsentOrUnreadable() {
        XCTAssertNil(StoryAudioPlayerObject().soundReleaseDate)
        XCTAssertNil(StoryAudioPlayerObject(soundCreatedAt: "hier").soundReleaseDate)
        XCTAssertNil(StoryAudioPlayerObject.soundCreatedAtStamp(nil))
    }

    /// Une story publiée AVANT ce champ se décode toujours — la clé est absente.
    func test_aStoryPublishedBeforeTheField_stillDecodes() throws {
        let json = #"{"id":"a","postMediaId":"","placement":"overlay","x":0.5,"y":0.5,"volume":1,"waveformSamples":[],"soundId":"6a97198de19ad1985081d6a6"}"#
        let audio = try JSONDecoder().decode(StoryAudioPlayerObject.self, from: Data(json.utf8))
        XCTAssertNil(audio.soundCreatedAt)
        XCTAssertEqual(audio.soundId, "6a97198de19ad1985081d6a6")
    }

    func test_theDate_survivesTheWire() throws {
        let data = try JSONEncoder().encode(borrowed())
        let back = try JSONDecoder().decode(StoryAudioPlayerObject.self, from: data)
        XCTAssertEqual(back.soundCreatedAt, "2026-03-12T09:30:00Z")
    }

    // Le pont v1⇄v3 : `CanvasV3ExhaustivityTests` peuple `soundCreatedAt` et
    // exige qu'il revienne — un témoin de plus ici redirait le sien.

    // MARK: - Ce qu'une republication JOUE

    func test_anEmptyRepublication_playsItsSource() {
        let source = effects(borrowed())
        let played = StoryEffects.played(own: nil, ownMediaIsEmpty: true, source: source)
        XCTAssertEqual(played?.audioPlayerObjects?.first?.id, "bg")
    }

    func test_aRepublicationWithItsOwnEffects_playsThem() {
        var own = StoryEffects()
        own.audioPlayerObjects = [StoryAudioPlayerObject(id: "mine", isBackground: true)]
        let played = StoryEffects.played(own: own, ownMediaIsEmpty: true, source: effects(borrowed()))
        XCTAssertEqual(played?.audioPlayerObjects?.first?.id, "mine")
    }

    /// Un média propre suffit à faire de l'enveloppe une publication à part
    /// entière : ses médias et la source ne se mêlent jamais.
    func test_aRepublicationWithItsOwnMedia_neverBorrowsTheSourceEffects() {
        let played = StoryEffects.played(own: nil, ownMediaIsEmpty: false, source: effects(borrowed()))
        XCTAssertNil(played)
    }

    func test_feedPost_playedStoryEffects_fallsBackOnTheRepublishedStory() {
        var post = FeedPost(author: "A", type: "POST", content: "")
        post.repost = RepostContent(author: "B", content: "", type: "STORY",
                                    storyEffects: effects(borrowed()))
        XCTAssertEqual(post.playedStoryEffects?.audioPlayerObjects?.first?.soundId,
                       "6a97198de19ad1985081d6a6")
        XCTAssertEqual(StoryItem(feedPost: post).storyEffects?.audioPlayerObjects?.first?.id, "bg",
                       "le détail (StoryItem(feedPost:)) et la carte lisent le MÊME repli")
    }

    /// Seule une STORY republiée prête sa scène : un post cité garde la sienne.
    func test_feedPost_playedStoryEffects_ignoresARepublishedPost() {
        var post = FeedPost(author: "A", type: "POST", content: "")
        post.repost = RepostContent(author: "B", content: "", type: "POST",
                                    storyEffects: effects(borrowed()))
        XCTAssertNil(post.playedStoryEffects)
    }

    // MARK: - Le baffle du lecteur de story ne double pas la note (#9677)

    func test_theStorySoundButton_steps_aside_whenTheBackgroundSoundIsTheOnlySound() {
        XCTAssertFalse(StoryAudioAvailability.needsSoundButton(
            effects: effects(borrowed()), videoAudioTracks: [:], backgroundSoundIsAnnounced: true),
            "la note du crédit coupe le fond : un baffle de plus coupe le MÊME son")
        XCTAssertTrue(StoryAudioAvailability.needsSoundButton(
            effects: effects(borrowed()), videoAudioTracks: [:], backgroundSoundIsAnnounced: false),
            "sans annonce, la règle d'avant tient")
    }

    func test_theStorySoundButton_stays_forAVoiceNoteOrAVideoTrack() {
        var withVoice = effects(borrowed())
        withVoice.voiceAttachmentId = "voice-1"
        XCTAssertTrue(StoryAudioAvailability.needsSoundButton(
            effects: withVoice, videoAudioTracks: [:], backgroundSoundIsAnnounced: true))

        var withVideo = effects(borrowed())
        withVideo.mediaObjects = [StoryMediaObject(id: "v1", mediaType: "video", aspectRatio: 1)]
        XCTAssertTrue(StoryAudioAvailability.needsSoundButton(
            effects: withVideo, videoAudioTracks: ["v1": true], backgroundSoundIsAnnounced: true),
            "la piste PROPRE d'une vidéo garde son contrôle")
    }
}
