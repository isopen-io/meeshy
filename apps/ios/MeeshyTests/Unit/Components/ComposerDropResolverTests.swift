import XCTest
import UniformTypeIdentifiers
@testable import Meeshy

/// Résolution d'un `NSItemProvider` déposé sur la bande du composer.
///
/// La subtilité que ces tests verrouillent : `loadFileRepresentation` livre
/// une URL temporaire que le système détruit au retour de sa closure. La copie
/// vers notre conteneur doit donc être SYNCHRONE, dans la closure — et ces
/// tests vérifient que la copie existe encore APRÈS le retour de `resolve`.
///
/// Les providers sont construits sur de vrais fichiers temporaires via
/// `NSItemProvider(contentsOf:)` : pas de simulateur requis, pas de mock.
final class ComposerDropResolverTests: XCTestCase {

    private var workDir: URL!

    override func setUpWithError() throws {
        workDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("drop-resolver-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: workDir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: workDir)
        workDir = nil
    }

    // MARK: - Fichier réel

    func test_resolve_realFile_copyExistsAfterReturn() async throws {
        let source = workDir.appendingPathComponent("rapport final.pdf")
        try Data("contenu pdf factice".utf8).write(to: source)
        let provider = try XCTUnwrap(NSItemProvider(contentsOf: source))

        let ingest = await ComposerDropResolver.resolve(provider)

        guard case let .file(url, _, _)? = ingest else {
            XCTFail("Un provider de fichier doit résoudre en .file, obtenu : \(String(describing: ingest))")
            return
        }
        XCTAssertNotEqual(url.path, source.path, "La copie doit vivre dans notre conteneur, pas au chemin source")
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: url.path),
            "La copie doit exister APRÈS le retour de resolve — la fenêtre d'accès du provider est fermée"
        )
        XCTAssertTrue(url.lastPathComponent.hasPrefix("drop_"), "La copie doit suivre le motif drop_<uuid>_<nom>")
        let data = try Data(contentsOf: url)
        XCTAssertEqual(data, Data("contenu pdf factice".utf8), "Les octets d'origine doivent être préservés")
        try? FileManager.default.removeItem(at: url)
    }

    func test_resolve_realFile_nameAndMimeAreCorrect() async throws {
        let source = workDir.appendingPathComponent("rapport final.pdf")
        try Data("contenu pdf factice".utf8).write(to: source)
        let provider = try XCTUnwrap(NSItemProvider(contentsOf: source))

        let ingest = await ComposerDropResolver.resolve(provider)

        guard case let .file(url, name, mime)? = ingest else {
            XCTFail("Un provider de fichier doit résoudre en .file, obtenu : \(String(describing: ingest))")
            return
        }
        XCTAssertEqual(name, "rapport final.pdf")
        XCTAssertEqual(mime, "application/pdf", "Le MIME vient de MimeTypeResolver, la source unique de vérité")
        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - Refus

    func test_resolve_emptyProvider_returnsNil() async {
        let ingest = await ComposerDropResolver.resolve(NSItemProvider())
        XCTAssertNil(ingest, "Un provider sans représentation ne doit produire ni fichier ni texte fantôme")
    }

    func test_resolve_directory_returnsNil() async throws {
        let folder = workDir.appendingPathComponent("Dossier", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try Data("fichier interne".utf8).write(to: folder.appendingPathComponent("interne.txt"))
        let provider = try XCTUnwrap(NSItemProvider(contentsOf: folder))

        let ingest = await ComposerDropResolver.resolve(provider)

        XCTAssertNil(ingest, "Un dossier déposé est refusé, pas ingéré comme fichier")
    }

    func test_resolve_zeroByteFile_returnsNil() async throws {
        let source = workDir.appendingPathComponent("vide.bin")
        FileManager.default.createFile(atPath: source.path, contents: nil)
        let provider = try XCTUnwrap(NSItemProvider(contentsOf: source))

        let ingest = await ComposerDropResolver.resolve(provider)

        XCTAssertNil(ingest, "Un fichier de 0 octet est refusé")
    }
}
