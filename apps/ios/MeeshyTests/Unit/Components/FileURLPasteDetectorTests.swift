import XCTest
@testable import Meeshy

/// Détection des URLs `file://` dans un collage de texte.
///
/// `FileURLPasteDetector.detect(in:)` est la moitié pure du collage de
/// fichiers : elle extrait les occurrences `file://…`, décode le
/// pourcentage-encodage, et rend le texte nettoyé (espaces résiduels
/// normalisés). Elle ne doit JAMAIS produire d'URL pour un `file://` isolé
/// sans chemin — c'est le faux positif de la phrase tapée à la main.
final class FileURLPasteDetectorTests: XCTestCase {

    func test_detect_singleFileURL_extractsURLAndCleansText() {
        let (cleaned, urls) = FileURLPasteDetector.detect(
            in: "Regarde file:///Users/jc/Documents/rapport.pdf stp"
        )
        XCTAssertEqual(urls.count, 1)
        XCTAssertEqual(urls.first?.path, "/Users/jc/Documents/rapport.pdf")
        XCTAssertTrue(urls.first?.isFileURL ?? false)
        XCTAssertEqual(cleaned, "Regarde stp")
    }

    func test_detect_percentEncodedSpaces_decodesPath() {
        let (cleaned, urls) = FileURLPasteDetector.detect(
            in: "file:///tmp/Mon%20Rapport%20Final.pdf"
        )
        XCTAssertEqual(urls.count, 1)
        XCTAssertEqual(urls.first?.path, "/tmp/Mon Rapport Final.pdf")
        XCTAssertEqual(cleaned, "")
    }

    func test_detect_twoURLsInOnePaste_returnsBothInOrder() {
        let (cleaned, urls) = FileURLPasteDetector.detect(
            in: "Voici file:///a/premier.png puis file:///b/second.mov merci"
        )
        XCTAssertEqual(urls.count, 2)
        XCTAssertEqual(urls[0].path, "/a/premier.png")
        XCTAssertEqual(urls[1].path, "/b/second.mov")
        XCTAssertEqual(cleaned, "Voici puis merci")
    }

    func test_detect_bareSchemeWithoutPath_producesNoURLAndKeepsText() {
        let input = "Le préfixe file:// désigne un fichier local"
        let (cleaned, urls) = FileURLPasteDetector.detect(in: input)
        XCTAssertTrue(urls.isEmpty)
        XCTAssertEqual(cleaned, input, "Une phrase tapée contenant « file:// » sans chemin doit rester intacte")
    }

    func test_detect_schemeWithHostButNoPath_producesNoURL() {
        let input = "Essaie file://serveur sans chemin"
        let (cleaned, urls) = FileURLPasteDetector.detect(in: input)
        XCTAssertTrue(urls.isEmpty)
        XCTAssertEqual(cleaned, input)
    }

    func test_detect_textWithoutScheme_passesThroughUntouched() {
        let input = "Bonjour, voici le fichier dont je parlais"
        let (cleaned, urls) = FileURLPasteDetector.detect(in: input)
        XCTAssertTrue(urls.isEmpty)
        XCTAssertEqual(cleaned, input)
    }
}
