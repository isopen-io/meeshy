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

    func test_ownAudio_showsWaveform_evenWithNameAndAuthor() {
        XCTAssertEqual(
            AudioChipDisplay.resolve(soundId: nil, title: "Ma prise", authorUsername: "meeshy"),
            .waveform,
            "La publication d'origine garde la sinusoïde — le son n'est pas un emprunt"
        )
    }

    func test_borrowedSound_withTitleAndAuthor_marqueesTitleDotAuthor() {
        XCTAssertEqual(
            AudioChipDisplay.resolve(soundId: "s1", title: "Meeshy Go", authorUsername: "meeshy"),
            .marquee(text: "Meeshy Go · @meeshy")
        )
    }

    func test_borrowedSound_withoutTitle_marqueesAuthorAlone() {
        XCTAssertEqual(
            AudioChipDisplay.resolve(soundId: "s1", title: nil, authorUsername: "meeshy"),
            .marquee(text: "@meeshy")
        )
        XCTAssertEqual(
            AudioChipDisplay.resolve(soundId: "s1", title: "   ", authorUsername: "meeshy"),
            .marquee(text: "@meeshy"),
            "Un titre fait d'espaces n'est pas un titre"
        )
    }

    func test_borrowedSound_withoutAuthor_marqueesTitleAlone_legacyPayload() {
        XCTAssertEqual(
            AudioChipDisplay.resolve(soundId: "s1", title: "Meeshy Go", authorUsername: nil),
            .marquee(text: "Meeshy Go"),
            "Une story publiée avant le champ auteur affiche ce qu'elle possède"
        )
    }

    func test_borrowedSound_withNothing_fallsBackToWaveform() {
        XCTAssertEqual(
            AudioChipDisplay.resolve(soundId: "s1", title: nil, authorUsername: nil),
            .waveform,
            "Rien à faire défiler : mieux vaut la sinusoïde qu'une capsule vide"
        )
    }

    func test_authorUsername_isNormalizedWithoutLeadingAt() {
        XCTAssertEqual(
            AudioChipDisplay.resolve(soundId: "s1", title: nil, authorUsername: "@meeshy"),
            .marquee(text: "@meeshy"),
            "Un pseudo déjà préfixé ne double pas son arobase"
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
