import XCTest
import UniformTypeIdentifiers

/// **Le média d'abord, jamais son chemin** (#11134). Google Photos remet, pour
/// chaque photo, une URL de FICHIER (`public.file-url`, conforme à `public.url`)
/// à côté de sa représentation image. L'extension prenait l'URL pour un lien :
/// le destinataire recevait un chemin, pas la photo.
final class ShareItemRepresentationTests: XCTestCase {

    /// La cause : une URL de fichier EST une URL. Tout prédicat « conforme à
    /// `public.url` ⇒ lien » prend donc le chemin d'une photo pour un lien.
    func test_aFileURL_conformsToURL_whichIsWhyTheOldTestTookItForALink() {
        XCTAssertTrue(UTType.fileURL.conforms(to: .url))
    }

    func test_choose_googlePhotosFileURLBesideAJpeg_picksTheJpeg() {
        XCTAssertEqual(
            ShareItemRepresentation.choose(from: ["public.file-url", "public.url", "public.jpeg"]),
            .media(typeIdentifier: "public.jpeg")
        )
    }

    func test_choose_fileURLBesideAMovie_picksTheMovie() {
        XCTAssertEqual(
            ShareItemRepresentation.choose(from: ["public.url", "public.file-url", "public.mpeg-4"]),
            .media(typeIdentifier: "public.mpeg-4")
        )
    }

    func test_choose_everyUsualMediaIdentifier_isMedia() {
        let usual = [
            "public.image", "public.jpeg", "public.heic", "public.heif", "public.png",
            "com.compuserve.gif", "org.webmproject.webp", "public.tiff",
            "public.movie", "public.video", "public.mpeg-4", "com.apple.quicktime-movie",
            "com.apple.m4v-video", "public.3gpp", "public.avi",
        ]

        usual.forEach { identifier in
            XCTAssertEqual(
                ShareItemRepresentation.choose(from: ["public.file-url", identifier]),
                .media(typeIdentifier: identifier),
                "\(identifier) doit être lu comme un média"
            )
        }
    }

    func test_choose_aConcreteMediaType_winsOverTheAbstractOneRegisteredFirst() {
        XCTAssertEqual(
            ShareItemRepresentation.choose(from: ["public.image", "public.heic"]),
            .media(typeIdentifier: "public.heic")
        )
    }

    func test_choose_onlyAnAbstractMediaType_isStillMedia() {
        XCTAssertEqual(ShareItemRepresentation.choose(from: ["public.image"]), .media(typeIdentifier: "public.image"))
    }

    func test_choose_amongConcreteMediaTypes_theFirstRegisteredWins() {
        XCTAssertEqual(
            ShareItemRepresentation.choose(from: ["public.png", "public.jpeg"]),
            .media(typeIdentifier: "public.png")
        )
    }

    func test_choose_aFileURLAlone_loadsTheFileNeverTheLink() {
        XCTAssertEqual(ShareItemRepresentation.choose(from: ["public.file-url", "public.url"]), .fileURL)
    }

    func test_choose_aDocumentWithItsFileURL_loadsTheDocument() {
        XCTAssertEqual(
            ShareItemRepresentation.choose(from: ["public.file-url", "com.adobe.pdf"]),
            .file(typeIdentifier: "com.adobe.pdf")
        )
    }

    func test_choose_aTextFileWithItsFileURL_isAFileNotText() {
        XCTAssertEqual(
            ShareItemRepresentation.choose(from: ["public.plain-text", "public.file-url"]),
            .file(typeIdentifier: "public.plain-text")
        )
    }

    func test_choose_aWebLink_isALink() {
        XCTAssertEqual(ShareItemRepresentation.choose(from: ["public.url"]), .link)
        XCTAssertEqual(ShareItemRepresentation.choose(from: ["public.url", "public.plain-text"]), .link)
    }

    func test_choose_plainText_isText() {
        XCTAssertEqual(ShareItemRepresentation.choose(from: ["public.plain-text"]), .text)
        XCTAssertEqual(ShareItemRepresentation.choose(from: ["public.utf8-plain-text"]), .text)
    }

    func test_choose_aLinkBesideADocumentWithoutFileURL_staysALink() {
        XCTAssertEqual(ShareItemRepresentation.choose(from: ["public.url", "com.apple.webarchive"]), .link)
    }

    func test_choose_aBareDocument_isAFile() {
        XCTAssertEqual(ShareItemRepresentation.choose(from: ["com.adobe.pdf"]), .file(typeIdentifier: "com.adobe.pdf"))
    }

    func test_choose_nothingRegistered_isUnsupported() {
        XCTAssertEqual(ShareItemRepresentation.choose(from: []), .unsupported)
    }

    func test_fileExtension_withoutSourceExtension_followsTheMime() {
        XCTAssertEqual(ShareMediaStaging.fileExtension(sourceExtension: "", mime: "image/jpeg"), "jpeg")
        XCTAssertEqual(ShareMediaStaging.fileExtension(sourceExtension: "", mime: "video/mp4"), "mp4")
    }

    func test_fileExtension_keepsTheSourceExtensionLowercased() {
        XCTAssertEqual(ShareMediaStaging.fileExtension(sourceExtension: "MOV", mime: "video/quicktime"), "mov")
    }

    func test_fileExtension_withNothingUsable_isBin() {
        XCTAssertEqual(ShareMediaStaging.fileExtension(sourceExtension: "", mime: "application/octet-stream"), "bin")
    }
}
