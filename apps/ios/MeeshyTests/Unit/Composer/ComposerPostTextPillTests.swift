import XCTest
import MeeshySDK
@testable import Meeshy

/// #13864 (I1, R2) — « Texte du post » se pose depuis le SOCLE en post et en
/// réel, jamais en story ; la pastille dit ce qui est écrit, ou son nom tant que
/// rien ne l'est ; la porte du fil l'ouvre d'emblée ; le ⋯ ne la double plus.
final class ComposerPostTextPillTests: XCTestCase {

    func test_shows_postEtReelSurLaScene_pasLaStoryNiHorsScene() {
        XCTAssertTrue(ComposerPostTextPill.shows(format: .post, sceneMounted: true))
        XCTAssertTrue(ComposerPostTextPill.shows(format: .reel, sceneMounted: true))
        XCTAssertFalse(ComposerPostTextPill.shows(format: .story, sceneMounted: true))
        XCTAssertFalse(ComposerPostTextPill.shows(format: .post, sceneMounted: false))
    }

    func test_title_sansTexte_ditSonNom() {
        XCTAssertEqual(ComposerPostTextPill.title(for: ""), ComposerPostTextPill.label)
        XCTAssertEqual(ComposerPostTextPill.title(for: "  \n "), ComposerPostTextPill.label)
        XCTAssertTrue(ComposerPostTextPill.isPlaceholder("\n"))
    }

    func test_title_avecTexte_ditSaPremiereLigne() {
        XCTAssertEqual(ComposerPostTextPill.title(for: "\n  Bonjour à tous  \nla suite"), "Bonjour à tous")
        XCTAssertFalse(ComposerPostTextPill.isPlaceholder("Bonjour"))
    }

    func test_opensOnAppear_laPorteDuFil_ouvreLeTexteDuPost() {
        XCTAssertTrue(ComposerPostTextPill.opensOnAppear(opening: .keyboardOnContent, format: .post))
        XCTAssertTrue(ComposerPostTextPill.opensOnAppear(opening: .keyboardOnContent, format: .reel))
        XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: .keyboardOnContent, format: .story))
        XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: .mediaSeeded, format: .post))
        XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: .resume, format: .post))
    }

    func test_lePlusMenu_neDoublePlusLeTexteDuPost() {
        XCTAssertFalse(ComposerMoreMenuEntry.allCases.compactMap(\.door).contains(.content),
                       "« Texte du post » vit au socle ; le ⋯ ne l'ouvre plus")
    }
}
