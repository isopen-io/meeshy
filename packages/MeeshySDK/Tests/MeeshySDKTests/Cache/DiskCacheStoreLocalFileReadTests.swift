import XCTest
@testable import MeeshySDK

/// **Un média local se lit là où il est, sans copie — et seulement sous la
/// racine que l'app a déclarée** (#10789, revue de sécurité du 2026-10-25).
///
/// Une pièce jointe chiffrée de bout en bout, une fois déchiffrée, vit dans un
/// dossier `NSFileProtectionComplete` de l'app (`EndToEndAttachmentVault`) ; la
/// bulle la désigne par son URL `file://`. Les lecteurs qui passent par le cache
/// (`data(for:)` : lecteur audio, forme d'onde, code) la lisent directement —
/// sans la recopier dans le cache typé, qui n'a pas cette protection. Une URL
/// `file://` venue d'ailleurs (servie par la passerelle ou par un pair) ne fait
/// jamais lire un fichier de l'app hors de cette racine : ni directement, ni par
/// `..`, ni par un lien symbolique posé dans la racine.
final class DiskCacheStoreLocalFileReadTests: XCTestCase {

    private func makeStore() throws -> (DiskCacheStore, URL, URL) {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("DiskCacheLocal-\(UUID().uuidString)", isDirectory: true)
        let root = base.appendingPathComponent("vault", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        DiskCacheStore.allowLocalReads(under: root)
        addTeardownBlock { try? FileManager.default.removeItem(at: base) }
        return (DiskCacheStore(policy: .mediaAudio, baseDirectory: base.appendingPathComponent("cache", isDirectory: true)), base, root)
    }

    private func fails(_ store: DiskCacheStore, _ urlString: String) async -> Bool {
        do {
            _ = try await store.data(for: urlString)
            return false
        } catch {
            return true
        }
    }

    func test_data_forAFileUnderTheDeclaredRoot_readsIt_withoutCopyingItIntoTheCache() async throws {
        let (store, _, root) = try makeStore()
        let file = root.appendingPathComponent("vocal.m4a")
        let bytes = Data("vocal déchiffré".utf8)
        try bytes.write(to: file)

        let read = try await store.data(for: file.absoluteString)

        XCTAssertEqual(read, bytes)
        let cached = await store.isCached(file.absoluteString)
        XCTAssertFalse(cached, "le clair d'une pièce protégée ne se recopie pas dans le cache")
    }

    func test_dataWithProgress_forAFileUnderTheDeclaredRoot_readsIt_withoutCopyingItIntoTheCache() async throws {
        let (store, _, root) = try makeStore()
        let file = root.appendingPathComponent("doc.pdf")
        let bytes = Data("%PDF".utf8)
        try bytes.write(to: file)

        let read = try await store.data(for: file.absoluteString, progress: { _, _ in })

        XCTAssertEqual(read, bytes)
        let cached = await store.isCached(file.absoluteString)
        XCTAssertFalse(cached)
    }

    func test_data_forAFileOutsideTheRoot_readsNothing() async throws {
        let (store, base, _) = try makeStore()
        let secret = base.appendingPathComponent("e2ee.sqlite")
        try Data("stores libsignal".utf8).write(to: secret)

        let refused = await fails(store, secret.absoluteString)
        XCTAssertTrue(refused, "une URL file:// hors de la racine ne lit rien")
    }

    func test_data_escapingTheRootWithDotDot_readsNothing() async throws {
        let (store, base, root) = try makeStore()
        try Data("stores libsignal".utf8).write(to: base.appendingPathComponent("e2ee.sqlite"))

        let refused = await fails(store, root.absoluteString + "../e2ee.sqlite")
        XCTAssertTrue(refused, "un .. ne sort pas de la racine")
    }

    func test_data_throughASymlinkPlacedInTheRoot_readsNothing() async throws {
        let (store, base, root) = try makeStore()
        let secret = base.appendingPathComponent("e2ee.sqlite")
        try Data("stores libsignal".utf8).write(to: secret)
        let link = root.appendingPathComponent("photo.jpg")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: secret)

        let refused = await fails(store, link.absoluteString)
        XCTAssertTrue(refused, "un lien symbolique ne sort pas de la racine")
    }

    func test_data_forAMissingLocalFile_stillFails() async throws {
        let (store, _, root) = try makeStore()

        let refused = await fails(store, root.appendingPathComponent("absent.m4a").absoluteString)
        XCTAssertTrue(refused)
    }
}
