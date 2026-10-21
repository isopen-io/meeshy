import XCTest
@testable import MeeshySDK

/// IL8 (#11286) — le store réagit à la pression DISQUE réelle, pas seulement
/// au budget. L'espace libre est injecté : aucun témoin ne remplit un disque.
final class DiskCacheStoreDiskPressureTests: XCTestCase {

    private let comfortableFreeBytes: Int64 = 10 * 1_024 * 1_024 * 1_024
    private let lowFreeBytes: Int64 = 100 * 1_024 * 1_024

    private func makeStore(subdir: String = "test-pressure-\(UUID().uuidString)") -> DiskCacheStore {
        let policy = CachePolicy(
            ttl: 60,
            staleTTL: 30,
            maxItemCount: 1000,
            storageLocation: .disk(subdir: subdir, maxBytes: 10_000_000)
        )
        let baseDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("MeeshyTests/\(subdir)", isDirectory: true)
        return DiskCacheStore(policy: policy, baseDirectory: baseDir)
    }

    func test_evictUnderDiskPressure_ampleSpace_removesNothing() async {
        let store = makeStore()
        await store.save(Data(repeating: 0xAA, count: 400), for: "ample.mp4")
        await store.evictUnderDiskPressure(availableBytes: comfortableFreeBytes)
        let result = await store.load(for: "ample.mp4")
        XCTAssertNotNil(result.snapshot()?.first, "Espace confortable : aucun fichier ne doit partir")
    }

    func test_evictUnderDiskPressure_lowSpace_evictsUnpinnedAndKeepsPinned() async {
        let store = makeStore()
        await store.save(Data(repeating: 0xAA, count: 400), for: "pinned-under-pressure.mp4")
        await store.pin("pinned-under-pressure.mp4", until: Date().addingTimeInterval(3600))
        await store.save(Data(repeating: 0xBB, count: 400), for: "plain-under-pressure.mp4")

        await store.evictUnderDiskPressure(availableBytes: lowFreeBytes)

        let pinned = await store.load(for: "pinned-under-pressure.mp4")
        let plain = await store.load(for: "plain-under-pressure.mp4")
        XCTAssertNotNil(pinned.snapshot()?.first, "Une épingle active survit à la pression disque")
        XCTAssertNil(plain.snapshot()?.first, "Un fichier non protégé est évincé sous pression")
    }

    func test_evictUnderDiskPressure_keepsFileWhoseDownloadIsInFlight() async {
        let store = makeStore()
        await store.save(Data(repeating: 0xCC, count: 400), for: "downloading-now.mp4")
        let download = Task<Data, Error> {
            try await Task.sleep(for: .seconds(30))
            return Data()
        }
        defer { download.cancel() }
        let registered = await store.registerInFlightDownload(download, for: "downloading-now.mp4")
        XCTAssertTrue(registered)

        await store.evictUnderDiskPressure(availableBytes: lowFreeBytes)

        let result = await store.load(for: "downloading-now.mp4")
        XCTAssertNotNil(result.snapshot()?.first, "Un téléchargement en cours n'est jamais évincé")
    }

    func test_evictUnderDiskPressure_keepsFileJustServedToAPlayerByURL() async throws {
        let store = makeStore()
        await store.save(Data(repeating: 0xEE, count: 400), for: "playing-now.mp4")
        await store.save(Data(repeating: 0xEF, count: 400), for: "idle-under-pressure.mp4")
        let playing = try XCTUnwrap(store.cachedFileURL(for: "playing-now.mp4"))

        await store.evictUnderDiskPressure(availableBytes: lowFreeBytes)

        let idle = await store.load(for: "idle-under-pressure.mp4")
        XCTAssertTrue(FileManager.default.fileExists(atPath: playing.path), "Le fichier remis à un player n'est jamais évincé")
        XCTAssertNil(idle.snapshot()?.first, "Le fichier que personne ne lit part sous pression")
    }

    func test_evictUnderDiskPressure_keepsFileServedByLocalFileURL() async throws {
        let store = makeStore()
        await store.save(Data(repeating: 0xEA, count: 400), for: "local-playing.m4a")
        let served = await store.localFileURL(for: "local-playing.m4a")
        let playing = try XCTUnwrap(served)

        await store.evictUnderDiskPressure(availableBytes: lowFreeBytes)

        XCTAssertTrue(FileManager.default.fileExists(atPath: playing.path), "Le fichier remis par localFileURL survit à la pression")
    }

    func test_evictUnderDiskPressure_evictedEntryLoadsEmpty() async {
        let store = makeStore()
        await store.save(Data(repeating: 0xDD, count: 400), for: "gone-under-pressure.mp4")

        await store.evictUnderDiskPressure(availableBytes: lowFreeBytes)

        let result = await store.load(for: "gone-under-pressure.mp4")
        guard case .empty = result else {
            return XCTFail("Attendu .empty après éviction sous pression, obtenu \(result)")
        }
    }
}
