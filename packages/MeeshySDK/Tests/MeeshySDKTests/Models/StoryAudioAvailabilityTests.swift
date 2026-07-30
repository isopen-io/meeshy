import XCTest
@testable import MeeshySDK

final class StoryAudioAvailabilityTests: XCTestCase {

    // MARK: - Factories

    private func makeVideo(id: String, volume: Float) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "pm-\(id)", mediaType: "video",
                         aspectRatio: 1.0, volume: volume)
    }

    private func makeImage(id: String) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "pm-\(id)", mediaType: "image",
                         aspectRatio: 1.0, volume: 1.0)
    }

    private func makeAudioObject(id: String, volume: Float) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: id, postMediaId: "pm-\(id)", volume: volume)
    }

    // MARK: - Empty / nil

    func test_hasAudibleSound_nilEffects_returnsFalse() {
        XCTAssertFalse(StoryAudioAvailability.hasAudibleSound(effects: nil, videoAudioTracks: [:]))
    }

    func test_hasAudibleSound_emptyEffects_returnsFalse() {
        XCTAssertFalse(StoryAudioAvailability.hasAudibleSound(effects: StoryEffects(), videoAudioTracks: [:]))
    }

    // MARK: - Voice note

    func test_hasAudibleSound_voiceAttachment_returnsTrue() {
        let effects = StoryEffects(voiceAttachmentId: "voice-1")
        XCTAssertTrue(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: [:]))
    }

    // MARK: - Background audio

    func test_hasAudibleSound_backgroundAudio_volumeNil_returnsTrue() {
        let effects = StoryEffects(backgroundAudioId: "bg-1", backgroundAudioVolume: nil)
        XCTAssertTrue(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: [:]))
    }

    func test_hasAudibleSound_backgroundAudio_volumePositive_returnsTrue() {
        let effects = StoryEffects(backgroundAudioId: "bg-1", backgroundAudioVolume: 0.8)
        XCTAssertTrue(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: [:]))
    }

    func test_hasAudibleSound_backgroundAudio_volumeZero_returnsFalse() {
        let effects = StoryEffects(backgroundAudioId: "bg-1", backgroundAudioVolume: 0)
        XCTAssertFalse(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: [:]))
    }

    // MARK: - Audio player objects

    func test_hasAudibleSound_audioObjectWithVolume_returnsTrue() {
        let effects = StoryEffects(audioPlayerObjects: [makeAudioObject(id: "a1", volume: 0.5)])
        XCTAssertTrue(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: [:]))
    }

    func test_hasAudibleSound_audioObjectsAllMuted_returnsFalse() {
        let effects = StoryEffects(audioPlayerObjects: [
            makeAudioObject(id: "a1", volume: 0),
            makeAudioObject(id: "a2", volume: 0)
        ])
        XCTAssertFalse(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: [:]))
    }

    // MARK: - Video — the user-reported case

    func test_hasAudibleSound_videoWithAudioTrack_returnsTrue() {
        let effects = StoryEffects(mediaObjects: [makeVideo(id: "v1", volume: 1.0)])
        XCTAssertTrue(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: ["v1": true]))
    }

    func test_hasAudibleSound_videoWithoutAudioTrack_returnsFalse() {
        let effects = StoryEffects(mediaObjects: [makeVideo(id: "v1", volume: 1.0)])
        XCTAssertFalse(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: ["v1": false]))
    }

    func test_hasAudibleSound_videoNotYetProbed_returnsFalse() {
        let effects = StoryEffects(mediaObjects: [makeVideo(id: "v1", volume: 1.0)])
        XCTAssertFalse(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: [:]))
    }

    func test_hasAudibleSound_videoMutedByAuthor_returnsFalse() {
        let effects = StoryEffects(mediaObjects: [makeVideo(id: "v1", volume: 0)])
        XCTAssertFalse(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: ["v1": true]))
    }

    func test_hasAudibleSound_imageOnly_returnsFalse() {
        let effects = StoryEffects(mediaObjects: [makeImage(id: "i1")])
        XCTAssertFalse(StoryAudioAvailability.hasAudibleSound(effects: effects, videoAudioTracks: [:]))
    }

    func test_hasAudibleSound_oneSilentOneAudibleVideo_returnsTrue() {
        let effects = StoryEffects(mediaObjects: [
            makeVideo(id: "v1", volume: 1.0),
            makeVideo(id: "v2", volume: 1.0)
        ])
        XCTAssertTrue(StoryAudioAvailability.hasAudibleSound(
            effects: effects, videoAudioTracks: ["v1": false, "v2": true]))
    }

    // MARK: - videosNeedingAudioProbe

    func test_videosNeedingAudioProbe_nilEffects_returnsEmpty() {
        XCTAssertTrue(StoryAudioAvailability.videosNeedingAudioProbe(effects: nil).isEmpty)
    }

    func test_videosNeedingAudioProbe_excludesImagesAndMutedVideos() {
        let effects = StoryEffects(mediaObjects: [
            makeImage(id: "i1"),
            makeVideo(id: "v1", volume: 1.0),
            makeVideo(id: "v2", volume: 0)
        ])
        let result = StoryAudioAvailability.videosNeedingAudioProbe(effects: effects)
        XCTAssertEqual(result.map(\.id), ["v1"])
    }

    // MARK: - hasBackgroundAudioTrack (header music-note presence, distinct
    // from hasAudibleSound's sound-button predicate — voice notes / audio
    // objects / audible video must NOT trip this one).

    private func makeBackgroundAudioEntry() -> StoryBackgroundAudioEntry {
        StoryBackgroundAudioEntry(id: "bg-entry", title: "Track", duration: 30, fileUrl: "https://cdn/track.mp3")
    }

    func test_hasBackgroundAudioTrack_nilEffectsAndEntry_returnsFalse() {
        XCTAssertFalse(StoryAudioAvailability.hasBackgroundAudioTrack(effects: nil, backgroundAudio: nil))
    }

    func test_hasBackgroundAudioTrack_storyLevelEntry_returnsTrueRegardlessOfEffects() {
        XCTAssertTrue(StoryAudioAvailability.hasBackgroundAudioTrack(effects: nil, backgroundAudio: makeBackgroundAudioEntry()))
    }

    func test_hasBackgroundAudioTrack_effectsBackgroundAudioId_volumeNil_returnsTrue() {
        let effects = StoryEffects(backgroundAudioId: "bg-1", backgroundAudioVolume: nil)
        XCTAssertTrue(StoryAudioAvailability.hasBackgroundAudioTrack(effects: effects, backgroundAudio: nil))
    }

    func test_hasBackgroundAudioTrack_effectsBackgroundAudioId_volumeZero_returnsFalse() {
        let effects = StoryEffects(backgroundAudioId: "bg-1", backgroundAudioVolume: 0)
        XCTAssertFalse(StoryAudioAvailability.hasBackgroundAudioTrack(effects: effects, backgroundAudio: nil))
    }

    func test_hasBackgroundAudioTrack_voiceAttachmentOnly_returnsFalse() {
        // Distinguishes from hasAudibleSound: a voice note is audible sound
        // but is NOT a "background audio" track for the header icon's purpose.
        let effects = StoryEffects(voiceAttachmentId: "voice-1")
        XCTAssertFalse(StoryAudioAvailability.hasBackgroundAudioTrack(effects: effects, backgroundAudio: nil))
    }

    func test_hasBackgroundAudioTrack_audibleVideoOnly_returnsFalse() {
        let effects = StoryEffects(mediaObjects: [makeVideo(id: "v1", volume: 1.0)])
        XCTAssertFalse(StoryAudioAvailability.hasBackgroundAudioTrack(effects: effects, backgroundAudio: nil))
    }

    func test_hasBackgroundAudioTrack_recordedBackgroundAudioObject_returnsTrue() {
        // Piste enregistrée/importée posée en FOND via l'éditeur (isBackground) :
        // c'est un fond audio au même titre qu'une piste de bibliothèque — la
        // note musicale du header doit la signaler.
        var audio = makeAudioObject(id: "a1", volume: 1.0)
        audio.isBackground = true
        let effects = StoryEffects(audioPlayerObjects: [audio])
        XCTAssertTrue(StoryAudioAvailability.hasBackgroundAudioTrack(effects: effects, backgroundAudio: nil))
    }

    func test_hasBackgroundAudioTrack_recordedBackgroundAudioObject_mutedVolume_returnsFalse() {
        var audio = makeAudioObject(id: "a1", volume: 0)
        audio.isBackground = true
        let effects = StoryEffects(audioPlayerObjects: [audio])
        XCTAssertFalse(StoryAudioAvailability.hasBackgroundAudioTrack(effects: effects, backgroundAudio: nil))
    }

    func test_hasBackgroundAudioTrack_foregroundAudioObjectOnly_returnsFalse() {
        // Les pistes foreground ont leur propre chip dans le reader — elles ne
        // doivent toujours pas déclencher l'indicateur de FOND audio.
        let effects = StoryEffects(audioPlayerObjects: [makeAudioObject(id: "a1", volume: 1.0)])
        XCTAssertFalse(StoryAudioAvailability.hasBackgroundAudioTrack(effects: effects, backgroundAudio: nil))
    }
}

// MARK: - Fusion des résultats de probe

/// Un probe qui échoue ne doit JAMAIS être enregistré comme « vidéo muette » :
/// les appelants sautent toute clé déjà présente, donc un `false` transitoire
/// condamnait le bouton son pour toute la session du viewer.
extension StoryAudioAvailabilityTests {

    func test_merging_probeFailure_leavesTableUntouched() {
        let table = StoryAudioAvailability.merging([:], id: "v1", probedTrackCount: nil)
        XCTAssertNil(table["v1"])
    }

    func test_merging_probeFailure_doesNotOverwriteKnownValue() {
        let table = StoryAudioAvailability.merging(["v1": true], id: "v1", probedTrackCount: nil)
        XCTAssertEqual(table["v1"], true)
    }

    func test_merging_withAudioTrack_recordsTrue() {
        let table = StoryAudioAvailability.merging([:], id: "v1", probedTrackCount: 1)
        XCTAssertEqual(table["v1"], true)
    }

    /// Probe réussi ET zéro piste = vidéo réellement muette : on grave `false`,
    /// ce qui évite de la reprober indéfiniment.
    func test_merging_withoutAudioTrack_recordsFalse() {
        let table = StoryAudioAvailability.merging([:], id: "v1", probedTrackCount: 0)
        XCTAssertEqual(table["v1"], false)
    }

    func test_merging_keepsOtherEntries() {
        let table = StoryAudioAvailability.merging(["other": true], id: "v1", probedTrackCount: 0)
        XCTAssertEqual(table["other"], true)
        XCTAssertEqual(table["v1"], false)
    }
}
