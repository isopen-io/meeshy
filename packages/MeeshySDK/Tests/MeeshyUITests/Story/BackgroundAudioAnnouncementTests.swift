import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Résolveur de l'annonce du fond audio, promu (B3.4 provenance, B3.5
/// existence) : `.none` sans piste, `.original` si et seulement si la piste
/// est propre (♫〰), `.credit` si la piste vient de la bibliothèque — sans
/// métadonnées, la FORME crédit survit (`.credit(nil, nil, nil)`), jamais un
/// repli vers `.original` qui mentirait sur la provenance.
final class BackgroundAudioAnnouncementTests: XCTestCase {

    func test_noSound_announcesNone() {
        XCTAssertEqual(
            AudioChipDisplay.backgroundAnnouncement(
                sound: nil,
                libraryTitle: "Nuits d'été",
                libraryUsername: "sam",
                libraryDuration: 15),
            .none,
            "Aucune piste : rien à annoncer (existence, B3.5)"
        )
    }

    func test_ownSound_announcesOriginal() {
        let sound = BackgroundSoundV3(source: .original, volume: 1)
        XCTAssertEqual(
            AudioChipDisplay.backgroundAnnouncement(
                sound: sound,
                libraryTitle: nil,
                libraryUsername: nil,
                libraryDuration: nil),
            .original,
            "Piste propre : ♫〰, si et seulement si (provenance, B3.4)"
        )
    }

    func test_librarySound_withMetadata_announcesCredit() {
        let sound = BackgroundSoundV3(source: .library(soundId: "snd_nuits_ete"), volume: 1)
        XCTAssertEqual(
            AudioChipDisplay.backgroundAnnouncement(
                sound: sound,
                libraryTitle: "Nuits d'été",
                libraryUsername: "sam",
                libraryDuration: 15),
            .credit(title: "Nuits d'été", username: "sam", duration: 15)
        )
    }

    func test_librarySound_withoutMetadata_keepsCreditForm_neverFallsBackToOriginal() {
        let sound = BackgroundSoundV3(source: .library(soundId: "snd_inconnu"), volume: 1)
        XCTAssertEqual(
            AudioChipDisplay.backgroundAnnouncement(
                sound: sound,
                libraryTitle: nil,
                libraryUsername: nil,
                libraryDuration: nil),
            .credit(title: nil, username: nil, duration: nil),
            "Cache froid : la vue rend un marquee générique, jamais la note+onde qui mentirait sur la provenance (B3.4, revue Fable n°11)"
        )
    }
}
