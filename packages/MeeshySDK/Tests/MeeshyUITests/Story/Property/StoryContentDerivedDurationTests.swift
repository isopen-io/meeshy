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

    /// UNE SEULE source de fond (audio, PAS de vidéo) dont la période exige
    /// un arrondi non-trivial (2+ cycles) — `test_backgroundAudioOnly_counted`
    /// ci-dessus ne couvre que le cas où la durée audio == la cible (aucun
    /// arrondi nécessaire). Le fix multi-période doit rester exact pour le
    /// cas mono-source dominant (bg audio seul, sans bg vidéo).
    func test_bgAudioOnly_loopsToTarget() {
        let bgAudio = StoryAudioPlayerObject(id: "a", isBackground: true, duration: 4, loop: true)
        let s = slide(audio: [bgAudio])
        XCTAssertEqual(s.contentDerivedDuration(), 8, accuracy: 0.001,
                       "Audio de fond seul (4s, sans vidéo) doit boucler jusqu'à un multiple " +
                       "exact de 4s pour couvrir la cible auto de 6s → 8s (2 cycles).")
    }

    /// UNE SEULE source de fond (vidéo, PAS d'audio) — symétrique du test
    /// ci-dessus, garde la couverture explicite du cas mono-source vidéo dans
    /// CE fichier (déjà couvert indirectement par `SlideDurationLoopTests`,
    /// mais explicite ici pour documenter les DEUX cas mono-source côte à côte).
    func test_bgVideoOnly_loopsToTarget() {
        var bgVideo = StoryMediaObject(id: "v", postMediaId: "v", kind: .video, aspectRatio: 1)
        bgVideo.isBackground = true
        bgVideo.duration = 4
        let s = slide(media: [bgVideo])
        XCTAssertEqual(s.contentDerivedDuration(), 8, accuracy: 0.001,
                       "Vidéo de fond seule (4s, sans audio) doit boucler jusqu'à un multiple " +
                       "exact de 4s pour couvrir la cible auto de 6s → 8s (2 cycles).")
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

    // MARK: - Facteur de boucle : bg vidéo ET bg audio avec périodes différentes
    //
    // Avant ce fix, `rawMediaDur = bgVideoDur ?? bgAudioDur` ignorait
    // TOTALEMENT la période du bg audio dès qu'un bg vidéo existait — le
    // résultat n'était alors garanti multiple QUE de la période vidéo,
    // laissant l'audio de fond coupé en plein cycle (directive user : « la
    // répétition audio ou vidéo en background TOMBE TOUJOURS en facteur »).

    func test_bgVideoAndBgAudio_audioPeriodExceedsVideoRounding_usesAudioRounding() {
        // bg vidéo (6s) couvre exactement la cible auto (6s) SANS boucler
        // (durée naturelle == cible). bg audio (4s, loop) a besoin de 2 cycles
        // (8s) pour couvrir cette même cible de 6s. Avant ce fix,
        // `rawMediaDur = bgVideoDur ?? bgAudioDur` ignorait totalement la
        // période audio dès que la vidéo existait → résultat = 6 (la vidéo
        // seule), qui n'est PAS un multiple de 4 → l'audio coupé à 2s dans
        // son 2e cycle. Avec le fix, le résultat doit être un multiple exact
        // de 4 (8s).
        var bgVideo = StoryMediaObject(id: "v", postMediaId: "v", kind: .video, aspectRatio: 1)
        bgVideo.isBackground = true
        bgVideo.duration = 6
        let bgAudio = StoryAudioPlayerObject(id: "a", isBackground: true, duration: 4, loop: true)
        let s = slide(media: [bgVideo], audio: [bgAudio])
        let result = s.contentDerivedDuration()
        XCTAssertEqual(result, 8, accuracy: 0.001,
                       "Le résultat doit être arrondi au multiple supérieur de la période " +
                       "du bg audio (4s → 8s), pas seulement de la vidéo (6s, résultat bugué).")
    }

    func test_bgVideoOnly_unaffectedByMultiPeriodFix() {
        // Non-régression : `test_backgroundAudioLongerThanBgVideo_usesLongest`
        // ci-dessus doit rester inchangé (30s) — l'audio ici ne boucle pas
        // (sa durée == la cible, un seul passage suffit), donc le fix
        // multi-période ne doit rien changer à ce résultat déjà correct.
        var bgVideo = StoryMediaObject(id: "v", postMediaId: "v", kind: .video, aspectRatio: 1)
        bgVideo.isBackground = true
        bgVideo.duration = 5
        let bgAudio = StoryAudioPlayerObject(id: "a", isBackground: true, duration: 30, loop: true)
        let s = slide(media: [bgVideo], audio: [bgAudio])
        XCTAssertEqual(s.contentDerivedDuration(), 30, accuracy: 0.001)
    }
}
