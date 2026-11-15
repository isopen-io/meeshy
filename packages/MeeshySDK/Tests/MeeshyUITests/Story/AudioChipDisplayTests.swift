import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Contenu de la chip audio du reader/preview, à droite de la note.
///
/// Directive user 2026-08-02 : un son EMPRUNTÉ à la bibliothèque s'annonce
/// par un défilement « titre · @pseudo » (le pseudo de l'uploadeur, toujours) ;
/// sans titre, le @pseudo défile seul. La PREMIÈRE publication d'un son —
/// même si la capture l'a versé ensuite à la bibliothèque — garde la
/// sinusoïde d'aujourd'hui : c'est `soundId` qui discrimine, pas l'existence
/// du son en bibliothèque.
final class AudioChipDisplayTests: XCTestCase {

    /// La chaîne que le SEUL appelant de production emprunte
    /// (`Sources/MeeshyUI/Story/Controls/AudioForegroundChip.swift:190`) :
    /// `borrowedSound` adapte le vocabulaire `soundId`,
    /// `backgroundAnnouncement` tranche la provenance, `display(for:)` en tire
    /// la forme. Ces cas passaient par l'adaptateur
    /// `AudioChipDisplay.resolve(soundId:title:authorUsername:)`, retiré du
    /// SDK en E1c faute d'appelant hors tests : la composition qu'il abritait
    /// vit désormais ici, du côté qui en avait seul besoin.
    private func display(soundId: String?, title: String?, authorUsername: String?) -> AudioChipDisplay {
        AudioChipDisplay.display(for: AudioChipDisplay.backgroundAnnouncement(
            sound: AudioChipDisplay.borrowedSound(soundId: soundId),
            libraryTitle: title,
            libraryUsername: authorUsername,
            libraryDuration: nil))
    }

    func test_ownAudio_showsWaveform_evenWithNameAndAuthor() {
        XCTAssertEqual(
            display(soundId: nil, title: "Ma prise", authorUsername: "meeshy"),
            .waveform,
            "La publication d'origine garde la sinusoïde — le son n'est pas un emprunt"
        )
    }

    func test_borrowedSound_withTitleAndAuthor_marqueesTitleDotAuthor() {
        XCTAssertEqual(
            display(soundId: "s1", title: "Meeshy Go", authorUsername: "meeshy"),
            .marquee(text: "Meeshy Go · @meeshy")
        )
    }

    func test_borrowedSound_withoutTitle_marqueesAuthorAlone() {
        XCTAssertEqual(
            display(soundId: "s1", title: nil, authorUsername: "meeshy"),
            .marquee(text: "@meeshy")
        )
        XCTAssertEqual(
            display(soundId: "s1", title: "   ", authorUsername: "meeshy"),
            .marquee(text: "@meeshy"),
            "Un titre fait d'espaces n'est pas un titre"
        )
    }

    func test_borrowedSound_withoutAuthor_marqueesTitleAlone_legacyPayload() {
        XCTAssertEqual(
            display(soundId: "s1", title: "Meeshy Go", authorUsername: nil),
            .marquee(text: "Meeshy Go"),
            "Une story publiée avant le champ auteur affiche ce qu'elle possède"
        )
    }

    /// Cache froid d'une piste EMPRUNTÉE (soundId posé, aucune métadonnée
    /// résolue) : la forme reste CRÉDIT — un marquee générique « ♫ — » —
    /// jamais la sinusoïde, qui mentirait sur la provenance (B3.4, constat 9).
    func test_borrowedSound_withNothing_keepsCreditForm_neverFallsBackToWaveform() {
        XCTAssertEqual(
            display(soundId: "s1", title: nil, authorUsername: nil),
            .marquee(text: "♫ —")
        )
    }

    func test_authorUsername_isNormalizedWithoutLeadingAt() {
        XCTAssertEqual(
            display(soundId: "s1", title: nil, authorUsername: "@meeshy"),
            .marquee(text: "@meeshy"),
            "Un pseudo déjà préfixé ne double pas son arobase"
        )
    }
}

/// Temps restant du secteur audio (directive user 2026-08-02, itération 2) :
/// le contenu défilant se termine par « · M:SS », le temps restant avant la
/// fin de lecture du secteur choisi. La fin de fenêtre est le miroir EXACT de
/// `AudioForegroundReaderOverlay.visibleAudios` : un fond joue jusqu'à la fin
/// de la slide, un foreground jusqu'à `start + duration` (ou fin de slide
/// sans durée propre). Sans fin résoluble → `nil`, et le marquee n'affiche
/// AUCUN segment temps.
final class AudioChipRemainingTimeMathTests: XCTestCase {

    func test_remainingSeconds_background_countsDownToSlideEnd() {
        XCTAssertEqual(
            AudioChipDisplay.remainingSeconds(
                elapsed: 2, startTime: nil, duration: 4, slideDuration: 10, isBackground: true),
            8,
            "le fond joue toute la slide : sa fin = fin de slide, jamais sa durée intrinsèque"
        )
    }

    func test_remainingSeconds_foreground_withDuration_countsDownToWindowEnd() {
        XCTAssertEqual(
            AudioChipDisplay.remainingSeconds(
                elapsed: 6, startTime: 3, duration: 5, slideDuration: 30, isBackground: false),
            2
        )
    }

    func test_remainingSeconds_foreground_withoutDuration_fallsBackToSlideEnd() {
        XCTAssertEqual(
            AudioChipDisplay.remainingSeconds(
                elapsed: 4, startTime: 3, duration: nil, slideDuration: 10, isBackground: false),
            6,
            "miroir de visibleAudios : duration nil → la fenêtre court jusqu'à la fin de slide"
        )
    }

    func test_remainingSeconds_noResolvableEnd_returnsNil() {
        XCTAssertNil(AudioChipDisplay.remainingSeconds(
            elapsed: 1, startTime: 0, duration: nil, slideDuration: nil, isBackground: false))
        XCTAssertNil(AudioChipDisplay.remainingSeconds(
            elapsed: 1, startTime: nil, duration: nil, slideDuration: nil, isBackground: true))
    }

    func test_remainingSeconds_pastEnd_clampsToZero() {
        XCTAssertEqual(
            AudioChipDisplay.remainingSeconds(
                elapsed: 12, startTime: nil, duration: nil, slideDuration: 10, isBackground: true),
            0
        )
    }

    func test_countdownTotalSeconds_foreground_isWindowLength() {
        XCTAssertEqual(
            AudioChipDisplay.countdownTotalSeconds(
                startTime: 3, duration: 5, slideDuration: 30, isBackground: false),
            5
        )
        XCTAssertEqual(
            AudioChipDisplay.countdownTotalSeconds(
                startTime: nil, duration: nil, slideDuration: 10, isBackground: true),
            10
        )
    }

    func test_countdownTotalSeconds_noResolvableEnd_returnsNil() {
        XCTAssertNil(AudioChipDisplay.countdownTotalSeconds(
            startTime: nil, duration: nil, slideDuration: nil, isBackground: false))
    }

    func test_minuteDigits_underTenMinutes_isOne() {
        XCTAssertEqual(AudioChipDisplay.minuteDigits(forTotal: 599.9), 1)
    }

    func test_minuteDigits_tenMinutesOrMore_isTwo() {
        XCTAssertEqual(AudioChipDisplay.minuteDigits(forTotal: 600), 2)
    }

    func test_formatRemaining_zero_rendersZeroZero() {
        XCTAssertEqual(AudioChipDisplay.formatRemaining(0, minuteDigits: 1), "0:00")
    }

    func test_formatRemaining_fractionalSeconds_ceilsToNextSecond() {
        XCTAssertEqual(AudioChipDisplay.formatRemaining(0.4, minuteDigits: 1), "0:01",
                       "« 0:01 » tant que la lecture n'est pas réellement finie")
        XCTAssertEqual(AudioChipDisplay.formatRemaining(59.2, minuteDigits: 1), "1:00")
    }

    func test_formatRemaining_twoDigitTrack_padsMinutes() {
        XCTAssertEqual(AudioChipDisplay.formatRemaining(65, minuteDigits: 2), "01:05")
    }

    func test_formatRemaining_overflowingSingleDigitTrack_clampsToNineFiftyNine() {
        XCTAssertEqual(AudioChipDisplay.formatRemaining(3600, minuteDigits: 1), "9:59",
                       "UNE chasse par piste, constante : plutôt saturer que déformer la largeur")
    }

    func test_formatRemaining_negative_clampsToZero() {
        XCTAssertEqual(AudioChipDisplay.formatRemaining(-5, minuteDigits: 1), "0:00")
    }
}

/// Défilement EN CERCLE sans coupure (directive user 2026-08-02, itération 2) :
/// l'offset du marquee est une fonction PURE du temps — modulo sur un cycle
/// `largeur contenu + gap` — pilotée par un `TimelineView(.animation)` interne
/// à l'atome (patron `AudioForegroundSineWave`). La pause gèle l'offset ; la
/// reprise dérive une epoch pour repartir exactement où le texte s'était
/// arrêté.
final class AudioChipMarqueeScrollMathTests: XCTestCase {

    private let cycle: CGFloat = 140   // largeur contenu + gap
    private let speed: CGFloat = 28    // points / seconde → période = 5 s

    func test_scrollOffset_isPeriodicOverOneCycle() {
        let period = TimeInterval(cycle / speed)
        for t: TimeInterval in [0, 0.37, 1.2, 4.99, 12.345] {
            XCTAssertEqual(
                AudioChipMarquee.scrollOffset(elapsed: t + period, cycle: cycle, speed: speed),
                AudioChipMarquee.scrollOffset(elapsed: t, cycle: cycle, speed: speed),
                accuracy: 0.0001,
                "le défilement recommence sans coupure : offset(t + cycle/vitesse) == offset(t)"
            )
        }
    }

    func test_scrollOffset_staysWithinOneCycleBand() {
        for t in stride(from: 0.0, through: 20.0, by: 0.1) {
            let offset = AudioChipMarquee.scrollOffset(elapsed: t, cycle: cycle, speed: speed)
            XCTAssertLessThanOrEqual(offset, 0)
            XCTAssertGreaterThan(offset, -cycle)
        }
    }

    func test_scrollOffset_frameSteps_neverJumpMoreThanOneStepOrWrapSeamlessly() {
        let dt = 1.0 / 30.0
        let step = speed * CGFloat(dt)
        var previous = AudioChipMarquee.scrollOffset(elapsed: 0, cycle: cycle, speed: speed)
        for frame in 1...600 {
            let current = AudioChipMarquee.scrollOffset(
                elapsed: TimeInterval(frame) * dt, cycle: cycle, speed: speed)
            let delta = current - previous
            let isPlainStep = abs(delta + step) < 0.001
            let isSeamlessWrap = abs(delta + step - cycle) < 0.001
            XCTAssertTrue(isPlainStep || isSeamlessWrap,
                          "saut inattendu au frame \(frame) : delta \(delta)")
            previous = current
        }
    }

    func test_scrollOffset_degenerateCycle_returnsZero() {
        XCTAssertEqual(AudioChipMarquee.scrollOffset(elapsed: 5, cycle: 0, speed: speed), 0)
        XCTAssertEqual(AudioChipMarquee.scrollOffset(elapsed: 5, cycle: -10, speed: speed), 0)
    }

    func test_scrollOffset_negativeElapsed_normalizesIntoBand() {
        let offset = AudioChipMarquee.scrollOffset(elapsed: -0.5, cycle: cycle, speed: speed)
        XCTAssertLessThanOrEqual(offset, 0)
        XCTAssertGreaterThan(offset, -cycle)
    }

    func test_resumeEpoch_resumesExactlyAtFrozenOffset() {
        let frozen: CGFloat = -37.5
        let resumeDate = Date(timeIntervalSinceReferenceDate: 1_000)
        let epoch = AudioChipMarquee.resumeEpoch(at: resumeDate, frozenOffset: frozen, speed: speed)
        XCTAssertEqual(
            AudioChipMarquee.scrollOffset(
                elapsed: resumeDate.timeIntervalSince(epoch), cycle: cycle, speed: speed),
            frozen,
            accuracy: 0.0001,
            "la reprise post-pause (dé-mute) repart exactement où le défilement s'était gelé"
        )
    }
}

/// Le choix d'un son de bibliothèque grave l'auteur dans la piste : le
/// reader et l'export lisent un `StorySlide` hors-ligne, ils ne peuvent pas
/// re-résoudre le crédit au moment de l'affichage.
@MainActor
final class AddBorrowedSoundAuthorTests: XCTestCase {

    func test_addBorrowedSound_persistsUploaderUsername() {
        let vm = StoryComposerViewModel()
        let sound = APISound(
            id: "s-42", title: "Meeshy Go", fileUrl: "/api/v1/static/x.m4a",
            uploader: APISoundUploader(id: "u1", username: "meeshy", displayName: "meeshy sama", avatar: nil)
        )
        let obj = vm.addBorrowedSound(sound)
        XCTAssertEqual(obj?.soundAuthorUsername, "meeshy")
        XCTAssertEqual(obj?.soundId, "s-42")
    }

    func test_audioPlayerObject_roundTripsSoundAuthorUsername() throws {
        var obj = StoryAudioPlayerObject(id: "a1")
        obj.soundId = "s-42"
        obj.soundAuthorUsername = "meeshy"
        let data = try JSONEncoder().encode(obj)
        let back = try JSONDecoder().decode(StoryAudioPlayerObject.self, from: data)
        XCTAssertEqual(back.soundAuthorUsername, "meeshy",
                       "CodingKeys explicite : sans son case, le champ se perdrait en silence à la publication")
    }
}
