import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **LE crédit d'un son de la bibliothèque, une seule forme partout** (#9677).
///
/// « titre · @auteur » ; sans titre, « @auteur · date du son » quand la date est
/// connue ; jamais la durée. La jumelle web (`apps/web/src/lib/canvas/
/// sound-announcement.ts`, #9678) dit les mêmes cas, au même format.
final class BorrowedSoundCreditLineTests: XCTestCase {

    private let paris = Locale(identifier: "fr_FR")
    private let utc = TimeZone(identifier: "UTC")!
    /// 12 mars 2026, midi UTC — loin de minuit, aucun fuseau ne change le jour.
    private let released = Date(timeIntervalSince1970: 1_773_316_800)

    private func line(_ title: String?, _ username: String?, _ date: Date? = nil) -> String? {
        AudioChipDisplay.creditLine(title: title, username: username, releasedAt: date,
                                    locale: paris, timeZone: utc)
    }

    func test_titleAndAuthor_isTitleDotAuthor() {
        XCTAssertEqual(line("Nuits blanches", "lume"), "Nuits blanches · @lume")
    }

    func test_theDate_neverReplacesAnExistingTitle() {
        XCTAssertEqual(line("Nuits blanches", "lume", released), "Nuits blanches · @lume")
    }

    func test_withoutTitle_theAuthorIsFollowedByTheSoundDate() throws {
        let text = try XCTUnwrap(line(nil, "lume", released))
        let date = AudioChipDisplay.creditDate(released, locale: paris, timeZone: utc)
        XCTAssertEqual(text, "@lume · \(date)")
        XCTAssertTrue(date.contains("2026"), date)
        XCTAssertTrue(date.contains("12"), date)
    }

    func test_withoutTitleNorDate_theAuthorStandsAlone() {
        XCTAssertEqual(line(nil, "@lume"), "@lume")
        XCTAssertEqual(line("  ", "lume"), "@lume")
    }

    func test_aDateWithoutAuthor_saysNothingOnItsOwn() {
        XCTAssertNil(line(nil, nil, released))
    }

    func test_nothingKnown_isNil_andTheChipFallsBackToTheGenericCredit() {
        XCTAssertNil(line(nil, nil))
        XCTAssertEqual(
            AudioChipDisplay.display(for: .credit(title: nil, username: nil, duration: nil)),
            .marquee(text: AudioChipDisplay.genericCredit))
        XCTAssertEqual(AudioChipDisplay.genericCredit, "♫ —")
    }

    func test_theDurationIsNeverPartOfTheCredit() {
        let display = AudioChipDisplay.display(
            for: .credit(title: "Nuits blanches", username: "lume", duration: 28))
        XCTAssertEqual(display, .marquee(text: "Nuits blanches · @lume"))
    }

    /// La date voyage dans l'annonce : le résolveur la reçoit et la rend.
    func test_backgroundAnnouncement_carriesTheReleaseDate() {
        let sound = BackgroundSoundV3(source: .library(soundId: "6a97198de19ad1985081d6a6"), volume: 1)
        XCTAssertEqual(
            AudioChipDisplay.backgroundAnnouncement(sound: sound, libraryTitle: nil,
                                                    libraryUsername: "lume", libraryDuration: nil,
                                                    libraryReleasedAt: released),
            .credit(title: nil, username: "lume", duration: nil, releasedAt: released))
    }
}
