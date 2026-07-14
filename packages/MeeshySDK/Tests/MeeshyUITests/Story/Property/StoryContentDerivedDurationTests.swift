import XCTest
@testable import MeeshySDK

/// Directive user 2026-07-14 : « la timeline prend la durée automatique de la
/// donnée la plus longue (audio, vidéo) ». `contentDerivedDuration()` ne comptait
/// avant que le 1er bg vidéo OU (sinon) le 1er bg audio, plus les fenêtres vidéo
/// foreground — ignorant l'audio foreground et le bg audio quand un bg vidéo
/// coexistait. Ces cas sont désormais couverts.
final class StoryContentDerivedDurationTests: XCTestCase {

    private func slide(media: [StoryMediaObject] = [], audio: [StoryAudioPlayerObject] = []) -> StorySlide {
        var s = StorySlide(id: "s")
        if !media.isEmpty { s.effects.mediaObjects = media }
        if !audio.isEmpty { s.effects.audioPlayerObjects = audio }
        return s
    }

    func test_foregroundAudio_extendsDuration() {
        let voice = StoryAudioPlayerObject(id: "a1", isBackground: false, duration: 20)
        let s = slide(audio: [voice])
        XCTAssertEqual(s.contentDerivedDuration(), 20, accuracy: 0.001,
                       "Un audio foreground de 20 s impose au moins 20 s de timeline")
    }

    func test_backgroundAudioLongerThanBgVideo_usesLongest() {
        var bgVideo = StoryMediaObject(id: "v", postMediaId: "v", kind: .video, aspectRatio: 1)
        bgVideo.isBackground = true
        bgVideo.duration = 5
        let bgAudio = StoryAudioPlayerObject(id: "a", isBackground: true, duration: 30, loop: true)
        let s = slide(media: [bgVideo], audio: [bgAudio])
        XCTAssertEqual(s.contentDerivedDuration(), 30, accuracy: 0.001,
                       "Le bg vidéo (5 s) boucle pour couvrir le bg audio le plus long (30 s)")
    }

    func test_backgroundAudioOnly_counted() {
        let bgAudio = StoryAudioPlayerObject(id: "a", isBackground: true, duration: 15, loop: true)
        let s = slide(audio: [bgAudio])
        XCTAssertEqual(s.contentDerivedDuration(), 15, accuracy: 0.001)
    }

    func test_multipleForegroundMedia_takesLongestWindow() {
        var m1 = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1)
        m1.duration = 8
        var m2 = StoryMediaObject(id: "m2", postMediaId: "m2", kind: .video, aspectRatio: 1)
        m2.duration = 3
        let s = slide(media: [m1, m2])
        XCTAssertEqual(s.contentDerivedDuration(), 8, accuracy: 0.001)
    }

    func test_foregroundAudioWithStartTime_countsFullWindow() {
        let a = StoryAudioPlayerObject(id: "a", isBackground: false, startTime: 5, duration: 10)
        let s = slide(audio: [a])
        XCTAssertEqual(s.contentDerivedDuration(), 15, accuracy: 0.001,
                       "Fenêtre = startTime (5) + duration (10) = 15 s")
    }

    func test_emptySlide_staysStaticDefault() {
        XCTAssertEqual(slide().contentDerivedDuration(), 6, accuracy: 0.001,
                       "Slide vierge conserve la durée statique par défaut (6 s)")
    }
}
