import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - Doubles

@MainActor
private final class RecordingPruning: PackFilePruning {
    private(set) var pruned: [Set<String>] = []
    nonisolated deinit {}

    func prune(_ names: Set<String>) async -> Set<String> {
        pruned.append(names)
        return names
    }

    func all() -> Set<String> { pruned.reduce([]) { $0.union($1) } }
    func calls() -> Int { pruned.count }
}

private final class StickerServiceStub: StickerPackServiceProviding, @unchecked Sendable {
    var installedPacks: [StickerPack] = []

    func catalogue() async throws -> [StickerPack] { installedPacks }
    func installed() async throws -> [StickerPack] { installedPacks }
    func setInstalled(_ installed: Bool, slug: String) async throws -> StickerPack {
        if !installed { installedPacks.removeAll { $0.slug == slug } }
        return StickerPack(slug: slug, name: slug, installed: installed, installCount: installed ? 1 : 0)
    }
}

@MainActor
private final class ShrinkCounter {
    var value = 0
}

@MainActor
private final class MemoryPackCache: PackCaching {
    func load(account: String) async -> CacheResult<PackSnapshot<StickerPack>> { .empty }
    func save(_ snapshot: PackSnapshot<StickerPack>, account: String) async {}
}

/// **Retirer un pack efface ses fichiers du magasin — sauf ce qui sert encore**
/// (§ 5.10.6, #10150) : un fichier référencé par un autre pack installé (par
/// l'un des comptes connus sur l'appareil) ou par un cadre gardé dans un carnet
/// ne part pas, et rien ne part pendant qu'un déroulé photo tient un bail.
@MainActor
final class PackFilePrunerTests: XCTestCase {

    private static let savane = PackFileManifest(
        slug: "savane",
        files: ["aaaaaaaaaaaaaaaa.json", "cccccccccccccccc.webp"],
        frames: ["savane-iv": ["1111111111111111.webp"], "savane-iii": ["2222222222222222.webp"]]
    )
    private static let fleuve = PackFileManifest(
        slug: "fleuve", files: ["dddddddddddddddd.json", "cccccccccccccccc.webp"], frames: [:]
    )

    private func makeSUT(
        manifests: [PackFileManifest],
        retained: Set<String>? = [],
        frames: Set<String>? = []
    ) async -> (PackFilePruner, RecordingPruning, PackFileIndex) {
        let index = PackFileIndex(url: FileManager.default.temporaryDirectory
            .appendingPathComponent("pack-index-\(UUID().uuidString).json"))
        for manifest in manifests { await index.record(manifest) }
        let store = RecordingPruning()
        let pruner = PackFilePruner(index: index, store: store,
                                    retainedPacks: { retained }, referencedFrames: { frames })
        return (pruner, store, index)
    }

    func test_aPackNoAccountKeeps_losesItsFiles_andTheIndexForgetsIt() async {
        let (pruner, store, index) = await makeSUT(manifests: [Self.savane])

        await pruner.requestPrune()

        let pruned = store.all()
        XCTAssertEqual(pruned, ["aaaaaaaaaaaaaaaa.json", "cccccccccccccccc.webp", "1111111111111111.webp", "2222222222222222.webp"])
        let remaining = await index.all().map(\.slug)
        XCTAssertFalse(remaining.contains("savane"))
    }

    func test_aFileSharedWithAnotherInstalledPack_stays() async {
        let (pruner, store, _) = await makeSUT(manifests: [Self.savane, Self.fleuve], retained: ["fleuve"])

        await pruner.requestPrune()

        let pruned = store.all()
        XCTAssertFalse(pruned.contains("cccccccccccccccc.webp"), "la couverture partagée avec un pack installé reste")
        XCTAssertTrue(pruned.contains("1111111111111111.webp"))
    }

    func test_aFrameKeptInANotebook_keepsItsFiles() async {
        let (pruner, store, _) = await makeSUT(manifests: [Self.savane], frames: ["savane-iv"])

        await pruner.requestPrune()

        let pruned = store.all()
        XCTAssertEqual(pruned, ["2222222222222222.webp"])
    }

    func test_anOpenLease_defersThePrune_untilItIsReleased() async {
        let (pruner, store, _) = await makeSUT(manifests: [Self.savane])

        pruner.acquireLease(slug: "savane")
        await pruner.requestPrune()
        let duringLease = store.calls()
        XCTAssertEqual(duringLease, 0, "rien ne part pendant qu'un déroulé tient un bail")

        await pruner.releaseLease(slug: "savane")
        let afterLease = store.all()
        XCTAssertTrue(afterLease.contains("1111111111111111.webp"), "l'élagage différé part à la fin du bail")
    }

    func test_anUnreadableShelfOrNotebook_prunesNothing() async {
        let (shelfUnknown, store1, _) = await makeSUT(manifests: [Self.savane], retained: nil)
        await shelfUnknown.requestPrune()
        let shelfCalls = store1.calls()
        XCTAssertEqual(shelfCalls, 0)

        let (notebookUnknown, store2, _) = await makeSUT(manifests: [Self.savane], frames: nil)
        await notebookUnknown.requestPrune()
        let notebookCalls = store2.calls()
        XCTAssertEqual(notebookCalls, 0)
    }

    func test_aNewVersionOfAnInstalledPack_releasesOnlyTheFilesItNoLongerUses() async {
        let v1 = PackFileManifest(slug: "savane", files: ["aaaaaaaaaaaaaaaa.json", "bbbbbbbbbbbbbbbb.webp"])
        let v2 = PackFileManifest(slug: "savane", files: ["aaaaaaaaaaaaaaaa.json", "eeeeeeeeeeeeeeee.webp"])
        let (pruner, store, index) = await makeSUT(manifests: [v1], retained: ["savane"])
        await index.record(v2)

        await pruner.requestPrune()

        let pruned = store.all()
        XCTAssertEqual(pruned, ["bbbbbbbbbbbbbbbb.webp"])
    }

    func test_theIndex_survivesARestart() async {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("pack-index-\(UUID().uuidString).json")
        await PackFileIndex(url: url).record(Self.savane)

        let reread = await PackFileIndex(url: url).all()

        XCTAssertEqual(reread, [Self.savane])
    }

    // MARK: - Le magasin des packs demande l'élagage quand l'étagère rétrécit

    func test_removingAPack_asksForAPrune_installingDoesNot() async {
        let service = StickerServiceStub()
        service.installedPacks = [StickerPack(slug: "exemple", name: "exemple", installed: true, installCount: 1)]
        let shrinks = ShrinkCounter()
        let store = PackStore<StickerPack>(service: service, cache: MemoryPackCache(), account: { "u1" },
                                           onShelfShrank: { shrinks.value += 1 })
        await store.loadInstalled()
        XCTAssertEqual(shrinks.value, 0)

        await store.toggle(slug: "exemple")

        XCTAssertEqual(shrinks.value, 1)
    }

    func test_aPackRemovedOnAnotherDevice_asksForAPrune_atTheNextRevalidation() async {
        let service = StickerServiceStub()
        service.installedPacks = [StickerPack(slug: "exemple", name: "exemple", installed: true, installCount: 1)]
        let shrinks = ShrinkCounter()
        let store = PackStore<StickerPack>(service: service, cache: MemoryPackCache(), account: { "u1" },
                                           onShelfShrank: { shrinks.value += 1 })
        await store.loadInstalled()

        service.installedPacks = []
        await store.loadInstalled()

        XCTAssertEqual(shrinks.value, 1)
    }

    // MARK: - L'ancien cache non cloisonné disparaît

    /// `Caches/sticker-packs.json` montrait au compte B les packs du compte A :
    /// le premier magasin de stickers le SUPPRIME, sans le migrer (§ 5.10.6).
    func test_theStickerCache_deletesTheLegacyUnpartitionedFile_andNothingElse() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let legacy = directory.appendingPathComponent("sticker-packs.json")
        let partitioned = directory.appendingPathComponent("packs-sticker-u1.json")
        try Data("{}".utf8).write(to: legacy)
        try Data("{}".utf8).write(to: partitioned)

        _ = PackDiskCache<StickerPack>(domain: .sticker, directory: directory)

        XCTAssertFalse(FileManager.default.fileExists(atPath: legacy.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: partitioned.path))
    }
}
