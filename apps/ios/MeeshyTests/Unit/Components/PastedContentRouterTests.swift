import XCTest
import UniformTypeIdentifiers
import MeeshySDK
@testable import Meeshy

/// **Ce qu'on colle part toujours** (#9037) : l'OBJET collé devient une pièce
/// jointe, jamais son chemin ; un texte qui ferait dépasser la limite d'un
/// message (2000, comme les frontends) devient un document `.txt`, et le champ reste intact.
final class PastedContentRouterTests: XCTestCase {

    // MARK: - La limite : UNE source, celle des frontends (`@meeshy/shared`)

    func test_maxMessageLength_mirrorsTheSharedFrontendLimit() {
        XCTAssertEqual(MessageLimits.maxMessageLength, 2000, "MAX_MESSAGE_LENGTH de @meeshy/shared — décision porteur 2026-10-01")
    }

    func test_length_countsUTF16UnitsLikeTheGateway() {
        XCTAssertEqual(PastedContentRouter.length("é"), 1)
        XCTAssertEqual(PastedContentRouter.length("👍"), 2, "JavaScript compte `content.length` en unités UTF-16")
    }

    // MARK: - Texte

    func test_decide_textThatFits_insertsText() {
        let decision = PastedContentRouter.decide(.text(String(repeating: "a", count: 100)), currentLength: 10, limit: MessageLimits.maxMessageLength)
        XCTAssertEqual(decision, .insertText)
    }

    func test_decide_textOf2000IntoAnEmptyField_insertsText() {
        let decision = PastedContentRouter.decide(.text(String(repeating: "a", count: 2000)), currentLength: 0, limit: MessageLimits.maxMessageLength)
        XCTAssertEqual(decision, .insertText)
    }

    func test_decide_textOf2001IntoAnEmptyField_attachesText() {
        let decision = PastedContentRouter.decide(.text(String(repeating: "a", count: 2001)), currentLength: 0, limit: MessageLimits.maxMessageLength)
        XCTAssertEqual(decision, .attachText)
    }

    func test_decide_textOneUnitPastTheLimitWithWhatIsTyped_attachesText() {
        let decision = PastedContentRouter.decide(.text(String(repeating: "a", count: 1991)), currentLength: 10, limit: MessageLimits.maxMessageLength)
        XCTAssertEqual(decision, .attachText)
    }

    func test_decide_textReplacingASelection_countsWhatRemains() {
        let decision = PastedContentRouter.decide(.text(String(repeating: "a", count: 1000)), currentLength: 1900, replacedLength: 900, limit: MessageLimits.maxMessageLength)
        XCTAssertEqual(decision, .insertText, "la sélection remplacée libère sa place")
    }

    // MARK: - Médias et documents

    func test_decide_media_attachesMediaWhateverTheLength() {
        XCTAssertEqual(PastedContentRouter.decide(.media(.image), currentLength: 0, limit: 2000), .attachMedia(.image))
        XCTAssertEqual(PastedContentRouter.decide(.media(.video), currentLength: 1999, limit: 2000), .attachMedia(.video))
        XCTAssertEqual(PastedContentRouter.decide(.media(.audio), currentLength: 0, limit: 2000), .attachMedia(.audio))
        XCTAssertEqual(PastedContentRouter.decide(.media(.file), currentLength: 0, limit: 2000), .attachMedia(.file))
    }

    // MARK: - Classement des types collés

    func test_classify_image_isMediaImage() {
        XCTAssertEqual(PastedContentRouter.classify([UTType.png]), .media(.image))
        XCTAssertEqual(PastedContentRouter.classify([UTType.jpeg, UTType.url]), .media(.image), "une image copiée depuis Safari porte aussi son adresse : l'image gagne")
    }

    func test_classify_movieAndAudio_areMedia() {
        XCTAssertEqual(PastedContentRouter.classify([UTType.mpeg4Movie]), .media(.video))
        XCTAssertEqual(PastedContentRouter.classify([UTType.mp3]), .media(.audio))
    }

    func test_classify_documentOrFileURL_isMediaFile() {
        XCTAssertEqual(PastedContentRouter.classify([UTType.pdf]), .media(.file))
        XCTAssertEqual(PastedContentRouter.classify([UTType.fileURL]), .media(.file), "un fichier copié depuis Fichiers part en pièce jointe, jamais en chemin")
    }

    func test_classify_plainTextOrWebLink_isText() {
        XCTAssertEqual(PastedContentRouter.classify([UTType.utf8PlainText]), .text)
        XCTAssertEqual(PastedContentRouter.classify([UTType.url]), .text, "un lien web reste un lien")
        XCTAssertEqual(PastedContentRouter.classify([UTType.rtf, UTType.utf8PlainText]), .text)
    }

    func test_classify_richTextCarryingAnImage_staysText() {
        XCTAssertEqual(PastedContentRouter.classify([UTType.utf8PlainText, UTType.png]), .text, "un passage de Notes illustré se colle comme du texte")
    }

    func test_classify_nothingKnown_isText() {
        XCTAssertEqual(PastedContentRouter.classify([]), .text)
    }

    // MARK: - Ce qui a été inséré d'un coup

    func test_insertion_findsTheInsertedRun() {
        let run = PastedContentRouter.insertion(from: "Bonjour !", to: "Bonjour COLLÉ !")
        XCTAssertEqual(run?.inserted, "COLLÉ ")
        XCTAssertEqual(run?.restored, "Bonjour !")
    }

    func test_insertion_ofNothing_isNil() {
        XCTAssertNil(PastedContentRouter.insertion(from: "abc", to: "abc"))
        XCTAssertNil(PastedContentRouter.insertion(from: "abcd", to: "abc"), "un effacement n'est pas une insertion")
    }

    // MARK: - Le document `.txt`

    func test_textFileName_isReadableAndTimestamped() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let date = Date(timeIntervalSince1970: 1_790_000_000)
        XCTAssertEqual(PastedTextFile.fileName(at: date, calendar: calendar), "texte-colle-20260921-141320.txt")
    }

    func test_write_createsAUTF8TextFileHoldingTheText() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let text = "Ligne 1 — é 👍\nLigne 2"

        let ingest = try PastedTextFile.write(text, at: Date(timeIntervalSince1970: 0), in: directory)

        guard case let .file(url, name, mime) = ingest else { return XCTFail("un .txt est une pièce jointe fichier") }
        XCTAssertEqual(mime, "text/plain")
        XCTAssertTrue(name.hasPrefix("texte-colle-") && name.hasSuffix(".txt"))
        XCTAssertEqual(url.lastPathComponent, name)
        XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), text)
        XCTAssertEqual(ComposerIngestRouter.route(mime: mime), .file)
    }
}
