import XCTest
@testable import Meeshy
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

    private func load(
        _ providers: [NSItemProvider],
        into root: URL,
        budget: ShareByteBudget = ShareByteBudget(limit: .max)
    ) async -> ShareGathered {
        await ShareItemLoader.start(providers, shareId: "share-1", prepareMediaRoot: { shareId in
            try? FileManager.default.createDirectory(at: root.appendingPathComponent(shareId), withIntermediateDirectories: true)
            return root
        }, budget: budget).gather()
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

    // MARK: - Plafond d'octets cumulé (#11429)

    /// Trois photos de 4 Kio sous un plafond de 10 Kio : deux sont copiées,
    /// la troisième ne l'est pas, et l'écran le dit.
    func test_gather_beyondTheCumulativeBudget_copiesWhatFits_andTheScreenSaysWhatWasLeft() async throws {
        let source = try makeDirectory()
        let root = try makeDirectory()
        let providers = try (0..<3).map { index in
            googlePhotosProvider(file: try makeFile(named: "IMG_\(index).jpg", bytes: 4096, in: source), typeIdentifier: UTType.jpeg.identifier)
        }

        let gathered = await load(providers, into: root, budget: ShareByteBudget(limit: 10 * 1024))

        XCTAssertEqual(gathered.media.count, 2)
        XCTAssertEqual(gathered.failures.count, 1)
        XCTAssertTrue(gathered.failures.allSatisfy(\.isOverBudget))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent("share-1").path).count, 2)
        let incoming = ShareExtensionIncoming.make(text: nil, media: gathered.media, mediaRoot: root, failures: gathered.failures)
        XCTAssertEqual(incoming.shortfalls, [.overBudget(uncopied: 1)])
    }

    // MARK: - Député abusé (revue de sécurité #11134)

    /// Une app hôte peut annoncer une URL de fichier qui pointe DANS le
    /// conteneur App Group de Meeshy. L'extension, qui a ces droits, ne doit
    /// jamais ouvrir un chemin décodé des données de l'élément : seul ce que le
    /// système remet par `loadFileRepresentation` se copie.
    func test_gather_aFileURLIntoTheAppGroup_isRefused_andNothingIsStaged() async throws {
        let appGroup = try makeDirectory()
        let root = try makeDirectory()
        let secret = try makeFile(named: "share_directory.json", bytes: 256, in: appGroup)
        let provider = NSItemProvider()
        provider.registerObject(secret as NSURL, visibility: .all)

        let gathered = await load([provider], into: root)

        XCTAssertNil(gathered.content, "aucun chemin ne part en texte")
        XCTAssertEqual(gathered.media, [])
        XCTAssertEqual(gathered.failure, .refusedSource)
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: root.path), [])
    }

    func test_gather_aLinkCarryingAFileURL_isRefused() async throws {
        let appGroup = try makeDirectory()
        let root = try makeDirectory()
        let secret = try makeFile(named: "recent_conversations.json", bytes: 64, in: appGroup)
        let provider = NSItemProvider()
        provider.registerItem(forTypeIdentifier: UTType.url.identifier) { completion, _, _ in
            completion?(secret as NSURL, nil)
        }

        let gathered = await load([provider], into: root)

        XCTAssertNil(gathered.content)
        XCTAssertEqual(gathered.media, [])
        XCTAssertEqual(gathered.failure, .refusedSource)
    }

    func test_policy_refusesASealedRoot_aSymlinkIntoIt_andATraversal() throws {
        let sealed = try makeDirectory()
        let elsewhere = try makeDirectory()
        let secret = try makeFile(named: "session.json", bytes: 8, in: sealed)
        let link = elsewhere.appendingPathComponent("photo.jpg")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: secret)
        let traversal = elsewhere.appendingPathComponent("../\(sealed.lastPathComponent)/session.json")
        let policy = ShareSourcePolicy(sealed: [sealed], privateRoots: [], systemCopyRoots: [])

        XCTAssertFalse(policy.admits(secret))
        XCTAssertFalse(policy.admits(link), "un lien symbolique se juge sur sa cible")
        XCTAssertFalse(policy.admits(traversal))
        XCTAssertTrue(policy.admits(try makeFile(named: "ok.jpg", bytes: 8, in: elsewhere)))
    }

    func test_policy_refusesThePrivateArea_exceptTheSystemCopy_butNeverASealedRoot() throws {
        let home = try makeDirectory()
        let tmp = home.appendingPathComponent("tmp", isDirectory: true)
        let systemCopy = tmp.appendingPathComponent("TemporaryItems/.com.apple.Foundation.NSItemProvider.a1b2c3", isDirectory: true)
        let preferences = home.appendingPathComponent("Library/Preferences", isDirectory: true)
        try FileManager.default.createDirectory(at: systemCopy, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: preferences, withIntermediateDirectories: true)
        let sealedInsideTmp = tmp.appendingPathComponent("group", isDirectory: true)
        try FileManager.default.createDirectory(at: sealedInsideTmp, withIntermediateDirectories: true)
        let policy = ShareSourcePolicy(sealed: [sealedInsideTmp], privateRoots: [home], systemCopyRoots: [tmp])

        XCTAssertTrue(policy.admits(try makeFile(named: "copie.jpg", bytes: 8, in: systemCopy)))
        XCTAssertFalse(policy.admits(try makeFile(named: "me.meeshy.plist", bytes: 8, in: preferences)))
        XCTAssertFalse(policy.admits(try makeFile(named: "x.jpg", bytes: 8, in: sealedInsideTmp)))
    }

    // MARK: - Seule la copie du système passe (#11428)

    /// Le faux App Group vit HORS de l'exemption : dans `tmp` mais pas dans un
    /// dossier de copie du système, et dans `Library/Caches`. Les deux
    /// passaient tant que tout `tmp` et tout `Library/Caches` étaient exemptés.
    func test_policy_aFakeAppGroupInTmpOrInTheCaches_isRefused_onlyTheSystemFolderPasses() throws {
        let home = try makeDirectory()
        let tmp = home.appendingPathComponent("tmp", isDirectory: true)
        let fakeGroupInTmp = tmp.appendingPathComponent("group.me.meeshy.apps", isDirectory: true)
        let fakeGroupInCaches = home.appendingPathComponent("Library/Caches/group.me.meeshy.apps", isDirectory: true)
        let lookalike = tmp.appendingPathComponent("com.apple.Foundation.NSItemProvider.x", isDirectory: true)
        let bareSystemFolder = tmp.appendingPathComponent(".com.apple.Foundation.NSItemProvider.", isDirectory: true)
        let directSystemCopy = tmp.appendingPathComponent(".com.apple.Foundation.NSItemProvider.fXwu7y", isDirectory: true)
        try [fakeGroupInTmp, fakeGroupInCaches, lookalike, bareSystemFolder, directSystemCopy].forEach {
            try FileManager.default.createDirectory(at: $0, withIntermediateDirectories: true)
        }
        let policy = ShareSourcePolicy(sealed: [], privateRoots: [home], systemCopyRoots: [tmp])

        XCTAssertFalse(policy.admits(try makeFile(named: "share_directory.json", bytes: 8, in: fakeGroupInTmp)))
        XCTAssertFalse(policy.admits(try makeFile(named: "session.json", bytes: 8, in: fakeGroupInCaches)))
        XCTAssertFalse(policy.admits(try makeFile(named: "a.jpg", bytes: 8, in: lookalike)), "le point initial fait partie du nom")
        XCTAssertFalse(policy.admits(try makeFile(named: "a.jpg", bytes: 8, in: bareSystemFolder)), "un dossier sans suffixe n'est pas une copie")
        XCTAssertFalse(policy.admits(directSystemCopy), "le dossier lui-même n'est pas un fichier remis")
        XCTAssertTrue(policy.admits(try makeFile(named: "IMG.jpg", bytes: 8, in: directSystemCopy)))
        XCTAssertFalse(
            policy.admits(directSystemCopy.appendingPathComponent("../../Library/Caches/group.me.meeshy.apps/session.json")),
            "un `..` ne sort pas du dossier de copie"
        )
    }

    func test_livePolicy_sealsTheAppGroupAndTheAppBundle() {
        let live = ShareSourcePolicy.live
        if let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ShareSession.appGroupIdentifier) {
            XCTAssertFalse(live.admits(group.appendingPathComponent("share_directory.json")))
        }
        XCTAssertFalse(live.admits(Bundle.main.bundleURL.appendingPathComponent("Info.plist")))
    }

    func test_livePolicy_admitsOnlyTheSystemCopy_neverTheRestOfTmpNorTheCaches() {
        let live = ShareSourcePolicy.live
        let tmp = URL(fileURLWithPath: NSTemporaryDirectory())
        let home = URL(fileURLWithPath: NSHomeDirectory())

        XCTAssertFalse(live.admits(tmp.appendingPathComponent("fake-group/share_directory.json")))
        XCTAssertFalse(live.admits(home.appendingPathComponent("Library/Caches/fake-group/session.json")))
        XCTAssertTrue(live.admits(tmp.appendingPathComponent("TemporaryItems/.com.apple.Foundation.NSItemProvider.i7znue/IMG.jpg")))
    }

    /// La MESURE dont dépend la politique : ce que `loadFileRepresentation`
    /// remet est une copie dans le dossier du système, admise, alors que la
    /// source (ici un faux App Group sous `tmp`) ne l'est pas. Si iOS change
    /// l'emplacement de ses copies, ce témoin rougit avant que les partages
    /// ne soient tous refusés.
    func test_loadFileRepresentation_handsACopyInTheSystemFolder_admittedWhereItsSourceIsNot() async throws {
        let fakeGroup = try makeDirectory()
        let photo = try makeFile(named: "IMG.jpg", bytes: 64, in: fakeGroup)
        let provider = googlePhotosProvider(file: photo, typeIdentifier: UTType.jpeg.identifier)
        let live = ShareSourcePolicy.live

        let verdict: (path: String, admitted: Bool) = await withCheckedContinuation { continuation in
            _ = provider.loadFileRepresentation(forTypeIdentifier: UTType.jpeg.identifier) { url, _ in
                continuation.resume(returning: (url?.path ?? "aucune URL", url.map(live.admits) ?? false))
            }
        }

        XCTAssertFalse(live.admits(photo), "la source n'est pas une copie du système")
        XCTAssertTrue(verdict.admitted, "copie remise hors du dossier attendu : \(verdict.path)")
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
