import XCTest
@testable import MeeshySDK

/// `MediaFileSaver` copie un média dans un dossier accessible (par défaut le
/// dossier Documents de l'app, exposé dans Fichiers). Doit être robuste :
/// jamais d'écrasement, extension préservée, échec propre si la source manque.
final class MediaFileSaverTests: XCTestCase {

    private var workDir: URL!

    override func setUpWithError() throws {
        workDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("MediaFileSaverTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: workDir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: workDir)
    }

    private func makeSourceFile(_ name: String, contents: String) throws -> URL {
        let url = workDir.appendingPathComponent("src-\(UUID().uuidString)-\(name)")
        try Data(contents.utf8).write(to: url)
        return url
    }

    /// Returns an as-yet-uncreated destination directory — `save` must create it.
    private func freshDestDir() -> URL {
        workDir.appendingPathComponent("dest-\(UUID().uuidString)")
    }

    func test_save_copiesFileIntoDirectory_andContentMatches() throws {
        let source = try makeSourceFile("clip.m4a", contents: "audio-bytes")
        let dest = freshDestDir()

        let saved = try MediaFileSaver.save(source, into: dest)

        XCTAssertEqual(saved.deletingLastPathComponent().path, dest.path)
        XCTAssertTrue(FileManager.default.fileExists(atPath: saved.path))
        XCTAssertEqual(try Data(contentsOf: saved), Data("audio-bytes".utf8))
    }

    func test_save_preservesFileExtension() throws {
        let source = try makeSourceFile("report.pdf", contents: "pdf")

        let saved = try MediaFileSaver.save(source, into: freshDestDir())

        XCTAssertEqual(saved.pathExtension, "pdf")
    }

    func test_save_nameCollision_appendsSuffix_andKeepsBothFiles() throws {
        let dest = freshDestDir()
        let first = try makeSourceFile("song.mp3", contents: "one")
        let second = try makeSourceFile("song.mp3", contents: "two")

        let savedA = try MediaFileSaver.save(first, preferredName: "song.mp3", into: dest)
        let savedB = try MediaFileSaver.save(second, preferredName: "song.mp3", into: dest)

        XCTAssertNotEqual(savedA.lastPathComponent, savedB.lastPathComponent)
        XCTAssertEqual(try Data(contentsOf: savedA), Data("one".utf8))
        XCTAssertEqual(try Data(contentsOf: savedB), Data("two".utf8))
        XCTAssertEqual(savedB.pathExtension, "mp3")
    }

    func test_save_withPreferredName_usesIt() throws {
        let source = try makeSourceFile("tmp123.m4a", contents: "x")

        let saved = try MediaFileSaver.save(
            source, preferredName: "Mon enregistrement.m4a", into: freshDestDir()
        )

        XCTAssertEqual(saved.lastPathComponent, "Mon enregistrement.m4a")
    }

    func test_save_missingSource_throwsSourceMissing() {
        let missing = workDir.appendingPathComponent("does-not-exist.mp4")

        XCTAssertThrowsError(try MediaFileSaver.save(missing, into: freshDestDir())) { error in
            XCTAssertEqual(error as? MediaFileSaver.SaveError, .sourceMissing)
        }
    }

    func test_resolvedFileName_appendsSourceExtension_whenPreferredHasNone() {
        let name = MediaFileSaver.resolvedFileName(
            preferredName: "Voice note", sourceName: "abc.m4a", sourceExtension: "m4a"
        )
        XCTAssertEqual(name, "Voice note.m4a")
    }

    func test_resolvedFileName_stripsPathSeparators() {
        let name = MediaFileSaver.resolvedFileName(
            preferredName: "a/b:c.pdf", sourceName: "x.pdf", sourceExtension: "pdf"
        )
        XCTAssertFalse(name.contains("/"))
        XCTAssertFalse(name.contains(":"))
        XCTAssertEqual(name.hasSuffix(".pdf"), true)
    }
}
