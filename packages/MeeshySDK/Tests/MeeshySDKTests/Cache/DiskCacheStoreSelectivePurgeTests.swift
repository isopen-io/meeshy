import XCTest
@testable import MeeshySDK

/// Primitives de purge sélective du cache disque : mesurer et détruire un
/// SOUS-ENSEMBLE de clés, sans toucher au reste.
final class DiskCacheStoreSelectivePurgeTests: XCTestCase {

    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("DiskCachePurgeTests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    private func makeStore() -> DiskCacheStore {
        DiskCacheStore(policy: .mediaImages, baseDirectory: tempDir)
    }

    // MARK: - Mesure

    /// La taille affichée doit être MESURÉE. On écrit des charges de tailles
    /// connues et on exige la somme exacte, pas un ordre de grandeur.
    func test_diskBytes_forURLs_isTheExactMeasuredSize() async {
        let store = makeStore()
        await store.save(Data(repeating: 0xAB, count: 1000), for: "https://cdn.test/a.jpg")
        await store.save(Data(repeating: 0xCD, count: 2500), for: "https://cdn.test/b.jpg")
        await store.save(Data(repeating: 0xEF, count: 400), for: "https://cdn.test/autre.jpg")

        let bytes = await store.diskBytes(forURLs: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"])

        XCTAssertEqual(bytes, 3500, "La mesure doit être la somme exacte des deux fichiers visés")
    }

    /// Une URL attribuée mais absente du disque ne doit RIEN promettre :
    /// annoncer des octets qu'on ne libérera pas est le mensonge le plus
    /// facile à commettre ici.
    func test_diskBytes_ignoresURLsThatAreNotCached() async {
        let store = makeStore()
        await store.save(Data(repeating: 0xAB, count: 1000), for: "https://cdn.test/a.jpg")

        let bytes = await store.diskBytes(forURLs: [
            "https://cdn.test/a.jpg",
            "https://cdn.test/jamais-telecharge.jpg"
        ])

        XCTAssertEqual(bytes, 1000)
    }

    /// Le résidu non attribuable doit être compté, sinon la somme des cases
    /// serait inférieure à la taille réelle du cache.
    func test_unattributedDiskBytes_countsWhatNoDomainClaims() async {
        let store = makeStore()
        await store.save(Data(repeating: 0xAB, count: 1000), for: "https://cdn.test/attribue.jpg")
        await store.save(Data(repeating: 0xCD, count: 700), for: "https://cdn.test/orphelin.jpg")

        let residue = await store.unattributedDiskBytes(excluding: ["https://cdn.test/attribue.jpg"])

        XCTAssertEqual(residue, 700)
    }

    // MARK: - Purge ciblée

    func test_purge_removesOnlyTargetedURLs() async {
        let store = makeStore()
        await store.save(Data(repeating: 0xAB, count: 100), for: "https://cdn.test/cible.jpg")
        await store.save(Data(repeating: 0xCD, count: 100), for: "https://cdn.test/epargne.jpg")

        let freed = await store.purge(urls: ["https://cdn.test/cible.jpg"])

        XCTAssertEqual(freed, 100, "La purge doit rapporter les octets réellement libérés")
        let purged = await store.isCached("https://cdn.test/cible.jpg")
        let survivor = await store.isCached("https://cdn.test/epargne.jpg")
        XCTAssertFalse(purged, "La cible doit avoir disparu")
        XCTAssertTrue(survivor, "Un média non visé ne doit PAS être emporté")
    }

    func test_purgeUnattributed_removesOnlyTheResidue() async {
        let store = makeStore()
        await store.save(Data(repeating: 0xAB, count: 100), for: "https://cdn.test/connu.jpg")
        await store.save(Data(repeating: 0xCD, count: 300), for: "https://cdn.test/orphelin.jpg")

        let freed = await store.purgeUnattributed(excluding: ["https://cdn.test/connu.jpg"])

        XCTAssertEqual(freed, 300)
        let known = await store.isCached("https://cdn.test/connu.jpg")
        let orphan = await store.isCached("https://cdn.test/orphelin.jpg")
        XCTAssertTrue(known, "Un média attribué ne fait pas partie du résidu")
        XCTAssertFalse(orphan)
    }

    // MARK: - Purge pendant un téléchargement en vol

    /// Le cas qui défait silencieusement une purge : la tâche réseau se
    /// termine APRÈS la suppression et son `save()` réécrit le fichier.
    /// L'utilisateur voit le cache regrossir tout seul.
    func test_purge_cancelsInFlightDownload_soItCannotRewriteTheFile() async throws {
        let store = makeStore()
        let url = "https://cdn.test/en-vol.jpg"

        // Un téléchargement « lent » : il tente d'écrire dans le cache après
        // un délai, exactement comme le ferait une vraie requête réseau.
        let download = Task<Data, Error> {
            try await Task.sleep(nanoseconds: 300_000_000)
            let payload = Data(repeating: 0x99, count: 500)
            await store.save(payload, for: url)
            return payload
        }
        let registered = await store.registerInFlightDownload(download, for: url)
        XCTAssertTrue(registered, "Le téléchargement doit être enregistré")

        // Purge alors que le téléchargement est encore en vol.
        _ = await store.purge(urls: [url])

        let stillTracked = await store.hasInFlightDownload(forURL: url)
        XCTAssertFalse(stillTracked, "Le registre doit être vidé pour cette clé")
        XCTAssertTrue(download.isCancelled, "La tâche en vol doit être annulée")

        // On laisse au téléchargement le temps qu'il aurait mis à aboutir.
        _ = await download.result
        try await Task.sleep(nanoseconds: 500_000_000)

        let resurrected = await store.isCached(url)
        XCTAssertFalse(resurrected, "Le fichier ne doit PAS réapparaître après la purge")
    }
}
