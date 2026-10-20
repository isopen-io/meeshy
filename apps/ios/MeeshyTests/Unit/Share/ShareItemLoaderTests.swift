import XCTest
import UniformTypeIdentifiers

/// Le chargement RÉEL, à travers de vrais `NSItemProvider` : ce que reçoit
/// l'écran est le fichier COPIÉ dans le conteneur, jamais son chemin (#11134).
final class ShareItemLoaderTests: XCTestCase {

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-loader-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func makeFile(named name: String, bytes: Int, in directory: URL) throws -> URL {
        let url = directory.appendingPathComponent(name)
        try Data((0..<bytes).map { UInt8($0 % 251) }).write(to: url)
        return url
    }

    /// La forme que remet Google Photos : l'URL du fichier d'abord, puis la
    /// représentation média.
    private func googlePhotosProvider(file: URL, typeIdentifier: String) -> NSItemProvider {
        let provider = NSItemProvider()
        provider.registerObject(file as NSURL, visibility: .all)
        provider.registerFileRepresentation(forTypeIdentifier: typeIdentifier, fileOptions: [], visibility: .all) { completion in
            completion(file, false, nil)
            return nil
        }
        return provider
    }

    private func load(_ providers: [NSItemProvider], into root: URL) async -> ShareGathered {
        await ShareItemLoader.start(providers, shareId: "share-1", prepareMediaRoot: { shareId in
            try? FileManager.default.createDirectory(at: root.appendingPathComponent(shareId), withIntermediateDirectories: true)
            return root
        }).gather()
    }

    func test_gather_googlePhotosPhotoAndVideo_copiesBothMediaAndSendsNoPath() async throws {
        let source = try makeDirectory()
        let root = try makeDirectory()
        let photo = try makeFile(named: "IMG_0001.jpg", bytes: 2048, in: source)
        let video = try makeFile(named: "VID_0002.mp4", bytes: 4096, in: source)

        let gathered = await load([
            googlePhotosProvider(file: photo, typeIdentifier: UTType.jpeg.identifier),
            googlePhotosProvider(file: video, typeIdentifier: UTType.mpeg4Movie.identifier),
        ], into: root)

        XCTAssertNil(gathered.content, "aucun chemin ne doit partir en texte")
        XCTAssertNil(gathered.failure)
        XCTAssertEqual(gathered.media.map(\.mime), ["image/jpeg", "video/mp4"])
        XCTAssertEqual(gathered.media.map(\.bytes), [2048, 4096])
        XCTAssertEqual(Set(gathered.media.map(\.relPath)).count, 2, "chaque copie a son nom")
        XCTAssertEqual(
            try Data(contentsOf: root.appendingPathComponent(gathered.media[1].relPath)),
            try Data(contentsOf: video)
        )
    }

    func test_gather_aBareFileURL_copiesTheFile() async throws {
        let source = try makeDirectory()
        let root = try makeDirectory()
        let photo = try makeFile(named: "photo.heic", bytes: 512, in: source)
        let provider = NSItemProvider()
        provider.registerObject(photo as NSURL, visibility: .all)

        let gathered = await load([provider], into: root)

        XCTAssertNil(gathered.content)
        XCTAssertEqual(gathered.media.count, 1)
        XCTAssertEqual(gathered.media.first?.ext, "heic")
        XCTAssertEqual(gathered.media.first?.bytes, 512)
    }

    func test_gather_aWebLinkAndText_composeTheContentWithoutAnyFile() async throws {
        let root = try makeDirectory()
        let link = NSItemProvider()
        link.registerObject(try XCTUnwrap(URL(string: "https://meeshy.me/a")) as NSURL, visibility: .all)
        let text = NSItemProvider(object: "Regarde" as NSString)

        let gathered = await load([text, link], into: root)

        XCTAssertEqual(gathered.content, "Regarde\nhttps://meeshy.me/a")
        XCTAssertEqual(gathered.media, [])
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: root.path), [], "aucun dossier pour un partage sans fichier")
    }
}
