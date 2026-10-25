import XCTest
@testable import MeeshySDK

/// **Un média local se lit là où il est, sans copie** (#10789).
///
/// Une pièce jointe chiffrée de bout en bout, une fois déchiffrée, vit dans un
/// dossier `NSFileProtectionComplete` de l'app (`EndToEndAttachmentVault`) ; la
/// bulle la désigne par son URL `file://`. Les lecteurs qui passent par le cache
/// (`data(for:)` : lecteur audio, forme d'onde, code) la lisent directement —
/// et ne la RECOPIENT jamais dans le cache typé, qui n'a pas cette protection.
final class DiskCacheStoreLocalFileReadTests: XCTestCase {

    private func makeStore() throws -> (DiskCacheStore, URL) {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("DiskCacheLocal-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return (DiskCacheStore(policy: .mediaAudio, baseDirectory: base.appendingPathComponent("cache", isDirectory: true)), base)
    }

    func test_data_forALocalFileNotInCache_readsIt_withoutCopyingItIntoTheCache() async throws {
        let (store, base) = try makeStore()
        defer { try? FileManager.default.removeItem(at: base) }
        let file = base.appendingPathComponent("vocal.m4a")
        let bytes = Data("vocal déchiffré".utf8)
        try bytes.write(to: file)

        let read = try await store.data(for: file.absoluteString)

        XCTAssertEqual(read, bytes)
        let cached = await store.isCached(file.absoluteString)
        XCTAssertFalse(cached, "le clair d'une pièce protégée ne se recopie pas dans le cache")
    }

    func test_dataWithProgress_forALocalFile_readsIt_withoutCopyingItIntoTheCache() async throws {
        let (store, base) = try makeStore()
        defer { try? FileManager.default.removeItem(at: base) }
        let file = base.appendingPathComponent("doc.pdf")
        let bytes = Data("%PDF".utf8)
        try bytes.write(to: file)

        let read = try await store.data(for: file.absoluteString, progress: { _, _ in })

        XCTAssertEqual(read, bytes)
        let cached = await store.isCached(file.absoluteString)
        XCTAssertFalse(cached)
    }

    func test_data_forAMissingLocalFile_stillFails() async throws {
        let (store, base) = try makeStore()
        defer { try? FileManager.default.removeItem(at: base) }

        do {
            _ = try await store.data(for: base.appendingPathComponent("absent.m4a").absoluteString)
            XCTFail("un fichier absent ne se lit pas")
        } catch {}
    }
}
