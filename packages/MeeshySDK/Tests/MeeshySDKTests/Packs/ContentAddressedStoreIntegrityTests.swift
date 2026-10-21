import CryptoKit
import Foundation
import Testing
@testable import MeeshySDK

/// Deux demandes simultanées du même fichier partagent UNE requête, mais
/// chacune vérifie les octets contre SA référence (revue de sécurité 2026-10-11).
@Suite("Magasin des packs — chaque demandeur vérifie ses octets")
struct ContentAddressedStoreIntegrityTests {

    private actor GatedFetcher: PackAssetFetching {
        let payload: Data
        private var calls = 0
        private var gate: CheckedContinuation<Void, Never>?
        private var released = false

        init(payload: Data) { self.payload = payload }

        func fetch(file name: String) async throws -> Data {
            calls += 1
            if !released { await withCheckedContinuation { gate = $0 } }
            return payload
        }

        func release() { released = true; gate?.resume(); gate = nil }
        func count() -> Int { calls }
    }

    private static func hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    @Test("la demande à empreinte entière refuse des octets qui ne satisfont que le préfixe d'une autre")
    func joinedRequestStillChecksItsFullDigest() async throws {
        let served = Data("octets altérés en route".utf8)
        let prefix = String(Self.hex(served).prefix(16))
        let claimed = prefix + String(repeating: "0", count: 48)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let fetcher = GatedFetcher(payload: served)
        let store = ContentAddressedStore(directory: directory, fetcher: fetcher)
        let loose = try #require(PackAssetFile(name: "\(prefix).webp"))
        let strict = try #require(PackAssetFile(name: "\(prefix).webp", sha256: claimed))

        let first = Task { try await store.data(for: loose) }
        try await Task.sleep(nanoseconds: 50_000_000)
        let second = Task { try await store.data(for: strict) }
        try await Task.sleep(nanoseconds: 50_000_000)
        await fetcher.release()

        #expect(try await first.value == served)
        await #expect(throws: ContentAddressedStoreError.digestMismatch) { try await second.value }
        #expect(await fetcher.count() == 1)
    }
}
