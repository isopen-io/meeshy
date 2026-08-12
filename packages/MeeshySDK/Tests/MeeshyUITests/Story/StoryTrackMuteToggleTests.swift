import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Mute d'auteur UN-BOUTON des pistes vidéo / audio.
///
/// Convention persistée : `volume == 0` EST l'état muet (aucun booléen
/// séparé). Le mémento (`mutedVolumeMemento`) ne sert qu'à restaurer le
/// niveau quitté à l'unmute — invariant : `memento != nil ⟹ volume == 0`.
final class StoryTrackMuteToggleTests: XCTestCase {

    // MARK: - Sémantique du toggle (média vidéo)

    func test_media_toggleMute_storesMementoAndSilences() {
        var media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.0, volume: 0.6)
        media.toggleMute()
        XCTAssertEqual(media.volume, 0)
        XCTAssertEqual(media.mutedVolumeMemento, 0.6)
        XCTAssertTrue(media.isMuted)
    }

    func test_media_toggleMuteTwice_restoresPreviousVolume_notForcedOne() {
        var media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.0, volume: 0.4)
        media.toggleMute()
        media.toggleMute()
        XCTAssertEqual(media.volume, 0.4, accuracy: 0.001,
                       "l'unmute doit RESTAURER 0.4, pas forcer 1.0")
        XCTAssertNil(media.mutedVolumeMemento)
        XCTAssertFalse(media.isMuted)
    }

    func test_media_unmuteWithoutMemento_fallsBackToNominal() {
        var media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.0, volume: 0)
        media.toggleMute()
        XCTAssertEqual(media.volume, 1.0, "piste créée muette / draft legacy → 1.0")
        XCTAssertNil(media.mutedVolumeMemento)
    }

    func test_media_manualVolumeChange_clearsMemento() {
        var media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.0, volume: 0.9)
        media.toggleMute()
        media.setVolumePreservingMuteMemento(0.3)
        XCTAssertEqual(media.volume, 0.3, accuracy: 0.001)
        XCTAssertNil(media.mutedVolumeMemento,
                     "un réglage manuel audible prime sur l'historique de mute")
    }

    func test_media_sliderToZero_behavesAsMute() {
        var media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.0, volume: 0.7)
        media.setVolumePreservingMuteMemento(0)
        XCTAssertTrue(media.isMuted)
        XCTAssertEqual(media.mutedVolumeMemento, 0.7)
        media.toggleMute()
        XCTAssertEqual(media.volume, 0.7, accuracy: 0.001)
    }

    // MARK: - Sémantique du toggle (piste audio)

    func test_audio_toggleMute_roundTripRestoresVolume() {
        var audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pm", volume: 0.35)
        audio.toggleMute()
        XCTAssertTrue(audio.isMuted)
        XCTAssertEqual(audio.mutedVolumeMemento, 0.35)
        audio.toggleMute()
        XCTAssertEqual(audio.volume, 0.35, accuracy: 0.001)
        XCTAssertNil(audio.mutedVolumeMemento)
    }

    // MARK: - Codable round-trip + rétro-compat

    func test_media_codableRoundTrip_preservesMemento() throws {
        var media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.0, volume: 0.6)
        media.toggleMute()
        let data = try JSONEncoder().encode(media)
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: data)
        XCTAssertEqual(decoded.volume, 0)
        XCTAssertEqual(decoded.mutedVolumeMemento, 0.6)
    }

    func test_audio_codableRoundTrip_preservesMemento() throws {
        var audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pm", volume: 0.8)
        audio.toggleMute()
        let data = try JSONEncoder().encode(audio)
        let decoded = try JSONDecoder().decode(StoryAudioPlayerObject.self, from: data)
        XCTAssertEqual(decoded.volume, 0)
        XCTAssertEqual(decoded.mutedVolumeMemento, 0.8)
    }

    func test_legacyPayloadWithoutMementoKey_decodesNil() throws {
        let mediaJSON = Data(#"{"id":"m1","mediaType":"video","volume":0.5}"#.utf8)
        let media = try JSONDecoder().decode(StoryMediaObject.self, from: mediaJSON)
        XCTAssertNil(media.mutedVolumeMemento)
        XCTAssertEqual(media.volume, 0.5)

        let audioJSON = Data(#"{"id":"a1","postMediaId":"pm","placement":"overlay","x":0.5,"y":0.8,"volume":1,"waveformSamples":[]}"#.utf8)
        let audio = try JSONDecoder().decode(StoryAudioPlayerObject.self, from: audioJSON)
        XCTAssertNil(audio.mutedVolumeMemento)
    }

    func test_encodedMediaWithoutMute_omitsMementoKey() throws {
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.0, volume: 0.5)
        let data = try JSONEncoder().encode(media)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertFalse(json.contains("mutedVolumeMemento"))
    }

    // MARK: - Publication : le mémento reste auteur-local

    func test_effectsToJSON_neverPublishesMemento() {
        var media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.0, volume: 0.6)
        media.toggleMute()
        var audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pm", volume: 0.8)
        audio.toggleMute()
        var effects = StoryEffects()
        effects.mediaObjects = [media]
        effects.audioPlayerObjects = [audio]

        let json = effects.toJSON()
        let mediaDicts = json["mediaObjects"] as? [[String: Any]] ?? []
        let audioDicts = json["audioPlayerObjects"] as? [[String: Any]] ?? []
        XCTAssertEqual(mediaDicts.first?["volume"] as? Float, 0)
        XCTAssertNil(mediaDicts.first?["mutedVolumeMemento"])
        XCTAssertEqual(audioDicts.first?["volume"] as? Float, 0)
        XCTAssertNil(audioDicts.first?["mutedVolumeMemento"])
    }

    // MARK: - Commande timeline `.volume` : invariant du mémento sous undo/redo

    func test_setClipPropertyCommand_muteThenUndo_keepsMementoInvariant() throws {
        var media = StoryMediaObject(id: "clip-1", postMediaId: "clip-1", kind: .video, aspectRatio: 1.0)
        media.volume = 0.8
        var project = TimelineProject(
            slideId: "slide-1", slideDuration: 10,
            mediaObjects: [media], audioPlayerObjects: [],
            textObjects: [], clipTransitions: []
        )
        let cmd = SetClipPropertyCommand(clipId: "clip-1", kind: .video,
                                         property: .volume(old: 0.8, new: 0))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].volume, 0)
        XCTAssertEqual(project.mediaObjects[0].mutedVolumeMemento, 0.8)

        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects[0].volume, 0.8)
        XCTAssertNil(project.mediaObjects[0].mutedVolumeMemento,
                     "revenir audible efface le mémento — sinon un unmute futur restaurerait un niveau périmé")
    }

    func test_setClipPropertyCommand_audioUnmute_appliesMemento() throws {
        var audio = StoryAudioPlayerObject(id: "audio-1", postMediaId: "audio-1", volume: 0.5)
        audio.toggleMute()
        var project = TimelineProject(
            slideId: "slide-1", slideDuration: 10,
            mediaObjects: [], audioPlayerObjects: [audio],
            textObjects: [], clipTransitions: []
        )
        let cmd = SetClipPropertyCommand(clipId: "audio-1", kind: .audio,
                                         property: .volume(old: 0, new: 0.5))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].volume, 0.5)
        XCTAssertNil(project.audioPlayerObjects[0].mutedVolumeMemento)
    }

    // MARK: - Reader : le chip reflète l'OU des deux mutes

    @MainActor
    func test_chipShowsMuted_authorMuteOrViewerMute() {
        let audible = StoryAudioPlayerObject(id: "a1", postMediaId: "pm", volume: 0.8)
        var authorMuted = audible
        authorMuted.toggleMute()

        XCTAssertFalse(AudioForegroundReaderOverlay.chipShowsMuted(viewerMuted: false, audio: audible))
        XCTAssertTrue(AudioForegroundReaderOverlay.chipShowsMuted(viewerMuted: true, audio: audible))
        XCTAssertTrue(AudioForegroundReaderOverlay.chipShowsMuted(viewerMuted: false, audio: authorMuted),
                      "une piste coupée par l'AUTEUR doit s'afficher coupée chez le viewer")
        XCTAssertTrue(AudioForegroundReaderOverlay.chipShowsMuted(viewerMuted: true, audio: authorMuted))
    }
}
