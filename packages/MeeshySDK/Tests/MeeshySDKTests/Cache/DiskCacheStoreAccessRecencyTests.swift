import XCTest
@testable import MeeshySDK

/// Les deux passes d'éviction (`evictExpired`, `evictOverBudget`) trient sur
/// `contentModificationDate`. Tant que cette date restait celle du
/// TÉLÉCHARGEMENT, le cache évinçait le média le plus réutilisé avant un média
/// pris la veille et jamais rouvert — soit exactement ce qu'il fallait garder.
///
/// Exigence tenue ici : un même média ne se re-télécharge pas pendant SIX MOIS
/// — la rétention des médias déjà en place, à laquelle les vignettes s'alignent
/// désormais.
final class DiskCacheStoreAccessRecencyTests: XCTestCase {

    /// Répertoire partagé par toutes les ouvertures d'un même test.
    private func makeDirectory() -> (subdir: String, base: URL) {
        let subdir = "test-recency-\(UUID().uuidString)"
        return (subdir, FileManager.default.temporaryDirectory
            .appendingPathComponent("MeeshyTests/\(subdir)", isDirectory: true))
    }

    /// Le `NSCache` mémoire est propre à une INSTANCE. Rouvrir un store sur le
    /// même répertoire est donc le seul moyen honnête de forcer une lecture
    /// disque — sans ça, les tests ci-dessous passeraient sans jamais toucher le
    /// chemin qu'ils prétendent couvrir, et sans qu'on ajoute à la production
    /// une API qui n'existe que pour eux.
    private func open(_ subdir: String, _ base: URL,
                      ttl: TimeInterval = .months(6), maxBytes: Int = 10_000_000) -> DiskCacheStore {
        DiskCacheStore(
            policy: CachePolicy(ttl: ttl, staleTTL: nil, maxItemCount: nil,
                                storageLocation: .disk(subdir: subdir, maxBytes: maxBytes)),
            baseDirectory: base)
    }

    private func modificationDate(_ base: URL, _ key: String) -> Date? {
        let path = base.appendingPathComponent(DiskCacheStore.fileKey(for: key)).path
        return (try? FileManager.default.attributesOfItem(atPath: path))?[.modificationDate] as? Date
    }

    /// Vieillit une entrée en réécrivant sa date de modification.
    private func age(_ base: URL, _ key: String, byDays days: Double) {
        let path = base.appendingPathComponent(DiskCacheStore.fileKey(for: key)).path
        try? FileManager.default.setAttributes(
            [.modificationDate: Date().addingTimeInterval(-.days(days))], ofItemAtPath: path)
    }

    private func isRecent(_ date: Date?) -> Bool {
        guard let date else { return false }
        return Date().timeIntervalSince(date) < .days(1)
    }

    // MARK: - Chemin `load`

    func test_load_surUneEntreeAncienne_rafraichitLaDateDAcces() async {
        let (subdir, base) = makeDirectory()
        await open(subdir, base).save(Data(repeating: 0xAA, count: 64), for: "https://cdn/a.jpg")
        age(base, "https://cdn/a.jpg", byDays: 40)

        _ = await open(subdir, base).load(for: "https://cdn/a.jpg")

        XCTAssertTrue(isRecent(modificationDate(base, "https://cdn/a.jpg")),
                      "relire une entrée de 40 jours doit la faire repasser pour récente")
    }

    func test_load_surUneEntreeRecente_neReecritPasLAttribut() async {
        // Granularité d'un jour : sans elle, un défilement paierait un `utimes`
        // par apparition de cellule pour un gain d'ordonnancement nul.
        let (subdir, base) = makeDirectory()
        await open(subdir, base).save(Data(repeating: 0xAA, count: 64), for: "https://cdn/b.jpg")
        age(base, "https://cdn/b.jpg", byDays: 0.5)
        let before = modificationDate(base, "https://cdn/b.jpg")

        _ = await open(subdir, base).load(for: "https://cdn/b.jpg")

        XCTAssertEqual(modificationDate(base, "https://cdn/b.jpg"), before)
    }

    func test_load_surFichierAbsent_neCreeRien() async {
        let (subdir, base) = makeDirectory()
        let result = await open(subdir, base).load(for: "https://cdn/jamais-vu.jpg")

        if case .empty = result {} else { XCTFail("un fichier absent doit rendre .empty") }
        XCTAssertNil(modificationDate(base, "https://cdn/jamais-vu.jpg"))
    }

    // MARK: - Chemin synchrone (audio / vidéo)

    func test_cachedFileURL_rafraichitAussi_carCEstLeCheminDominantDuMedia() async throws {
        // L'audio et la vidéo se lisent par `cachedFileURL`, jamais par `load` :
        // ne toucher que `load` laissait vieillir tout le média effectivement
        // joué comme s'il n'avait jamais été rouvert.
        let (subdir, base) = makeDirectory()
        let store = open(subdir, base)
        await store.save(Data(repeating: 0xBB, count: 64), for: "https://cdn/c.m4a")
        age(base, "https://cdn/c.m4a", byDays: 40)

        XCTAssertNotNil(store.cachedFileURL(for: "https://cdn/c.m4a"))

        // Le rafraîchissement part sur une tâche détachée : on l'attend plutôt
        // que de supposer un ordre.
        try await waitUntil(timeout: 3.0) { self.isRecent(self.modificationDate(base, "https://cdn/c.m4a")) }
    }

    func test_cachedFileURL_surFichierAbsent_rendNil() {
        let (subdir, base) = makeDirectory()
        XCTAssertNil(open(subdir, base).cachedFileURL(for: "https://cdn/jamais-vu.m4a"))
    }

    // MARK: - Conséquence sur l'éviction

    func test_evictOverBudget_gardeLEntreeREOUVERTE_etEvinceLaJamaisRelue() async {
        // Le scénario complet, celui qui motive tout le reste.
        let (subdir, base) = makeDirectory()
        // Écriture SOUS UN GRAND BUDGET : sous 1 500 o, le second `save` est un
        // « gros write » qui déclenche l'éviction automatique séance tenante et
        // emportait « reutilise » avant même qu'on l'ait vieilli ni relu. Le
        // montage se sabotait lui-même et le test échouait sur du code correct.
        let writer = open(subdir, base)
        await writer.save(Data(repeating: 0x01, count: 1_000), for: "reutilise")
        await writer.save(Data(repeating: 0x02, count: 1_000), for: "jamais-relu")
        // Les deux sont vieux ; « reutilise » a été téléchargé en PREMIER, donc
        // l'ancien tri par date d'écriture l'aurait évincé le premier.
        age(base, "reutilise", byDays: 60)
        age(base, "jamais-relu", byDays: 50)

        let store = open(subdir, base, maxBytes: 1_500)
        _ = await store.load(for: "reutilise")
        await store.evictOverBudget()

        XCTAssertNotNil(store.cachedFileURL(for: "reutilise"),
                        "le média rouvert doit survivre au budget")
        XCTAssertNil(store.cachedFileURL(for: "jamais-relu"),
                     "c'est celui que personne ne rouvre qui doit partir")
    }

    func test_evictExpired_neSupprimePasUnMediaRELU_dansLaFenetreDuTTL() async {
        let (subdir, base) = makeDirectory()
        await open(subdir, base, ttl: .days(30)).save(Data(repeating: 0x03, count: 64), for: "relu")
        age(base, "relu", byDays: 29)

        let store = open(subdir, base, ttl: .days(30))
        _ = await store.load(for: "relu")   // repart pour 30 jours
        await store.evictExpired()

        XCTAssertNotNil(store.cachedFileURL(for: "relu"))
    }

    // MARK: - Politiques

    func test_toutesLesPolitiquesMedia_retiennentAuMoinsSixMois() {
        // La vignette était à 7 jours : la photo restait en cache mais son
        // aperçu se re-téléchargeait au bout de huit jours. Le plancher est
        // celui que l'audio et la vidéo tenaient déjà — pas un mois, six.
        for (name, policy) in [("images", CachePolicy.mediaImages), ("audio", CachePolicy.mediaAudio),
                               ("video", CachePolicy.mediaVideo), ("thumbnails", CachePolicy.thumbnails)] {
            XCTAssertGreaterThanOrEqual(policy.ttl, .months(6),
                                        "\(name) doit retenir au moins six mois")
        }
    }

    // MARK: - Utilitaire

    private func waitUntil(timeout: TimeInterval, _ condition: @escaping () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return }
            try await Task.sleep(nanoseconds: 25_000_000)
        }
        XCTFail("condition jamais atteinte en \(timeout)s")
    }
}
