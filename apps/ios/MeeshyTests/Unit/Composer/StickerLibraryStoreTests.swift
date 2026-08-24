import XCTest
import MeeshySDK
@testable import Meeshy

/// C5a — le magasin « Mes stickers » (règle O12, `PasteDestination.libraryWrite`).
///
/// `DiskCacheStore` (MeeshySDK) fait déjà l'éviction LRU disque mais
/// n'énumère jamais ses clés — aucune de ses 34 méthodes publiques ne liste
/// le contenu du dossier. Cette suite pin donc un comportement que le store
/// SDK ne peut pas fournir seul : un index ORDONNÉ des récents, persistant,
/// robuste à l'absence ou à la corruption du sidecar.
final class StickerLibraryStoreTests: XCTestCase {

    // MARK: - V3-5 — le magasin est instancié EN PRODUCTION, `libraryWrite` a un lecteur

    /// GARDE POSITIVE. Avant ce lot, `StickerLibraryStore` n'était construit
    /// que par les tests ci-dessous — aucun site sous `apps/ios/Meeshy` ne
    /// l'instanciait. Un magasin jamais instancié en production est un magasin
    /// qui ne retient jamais rien, quelle que soit la qualité de sa suite de
    /// tests unitaires.
    func test_aProductionSite_instantiatesTheStore() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        guard let enumerateur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            return XCTFail("Arborescence app introuvable à \(racine.path)")
        }
        var found = false
        for case let url as URL in enumerateur
            where url.pathExtension == "swift" && url.lastPathComponent != "StickerLibraryStore.swift" {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            if source.contains("StickerLibraryStore()") {
                found = true
                break
            }
        }
        XCTAssertTrue(
            found,
            "Aucun site de PRODUCTION (hors la déclaration elle-même) n'instancie "
                + "StickerLibraryStore() — le magasin reste de l'infrastructure morte."
        )
    }

    /// GARDE POSITIVE. `PasteDestinationTests` prouve la VALEUR de
    /// `libraryWrite` (vrai sur `.stickers`, faux sur `.scene`) — mais une
    /// valeur jamais LUE en production ne décide de rien. Avant ce lot, le
    /// champ était calculé et jeté : aucun site ne le consultait pour décider
    /// d'écrire dans le magasin.
    func test_libraryWrite_hasAReaderInProduction() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        guard let enumerateur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            return XCTFail("Arborescence app introuvable à \(racine.path)")
        }
        var found = false
        for case let url as URL in enumerateur
            where url.pathExtension == "swift" && url.lastPathComponent != "PasteDestination.swift" {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            if source.contains(".libraryWrite") {
                found = true
                break
            }
        }
        XCTAssertTrue(
            found,
            "Aucun site de PRODUCTION (hors la déclaration du champ) ne lit `.libraryWrite` — "
                + "le champ reste calculé et jamais consulté."
        )
    }

    private func makeStore(budgetBytes: Int = StickerLibraryStore.defaultBudgetBytes) -> (StickerLibraryStore, URL) {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("MeeshyTests/sticker-lib-\(UUID().uuidString)", isDirectory: true)
        return (StickerLibraryStore(baseDirectory: dir, budgetBytes: budgetBytes), dir)
    }

    // MARK: - Ordre des récents

    /// Un sticker jamais recollé garde son rang d'insertion : le plus récent
    /// en tête.
    func test_save_ordersMostRecentFirst() async {
        let (store, _) = makeStore()
        await store.save(Data([0x01]), id: "a")
        await store.save(Data([0x02]), id: "b")
        await store.save(Data([0x03]), id: "c")

        let ids = await store.recentIDs()
        XCTAssertEqual(ids, ["c", "b", "a"])
    }

    /// Recoller un sticker déjà présent le REMONTE en tête — jamais de
    /// doublon dans la liste des récents.
    func test_save_reinsertingExistingSticker_movesItToFront() async {
        let (store, _) = makeStore()
        await store.save(Data([0x01]), id: "a")
        await store.save(Data([0x02]), id: "b")
        await store.save(Data([0x03]), id: "c")

        await store.save(Data([0xFF]), id: "a")

        let ids = await store.recentIDs()
        XCTAssertEqual(ids, ["a", "c", "b"])
    }

    // MARK: - Budget 64 Mo (paramétrable en test)

    /// Franchir le budget évince le PLUS ANCIEN — jamais le plus récent, et
    /// jamais un élément du milieu tant que l'ancien suffit à repasser sous
    /// le seuil.
    func test_save_overBudget_evictsTheOldest() async {
        let (store, _) = makeStore(budgetBytes: 250)
        await store.save(Data(repeating: 0xAA, count: 100), id: "oldest")
        await store.save(Data(repeating: 0xBB, count: 100), id: "middle")
        await store.save(Data(repeating: 0xCC, count: 100), id: "newest")

        let ids = await store.recentIDs()
        XCTAssertEqual(ids, ["newest", "middle"])
        let survivingBytes = await store.totalBytes()
        XCTAssertLessThanOrEqual(survivingBytes, 250)
    }

    /// L'évincé disparaît aussi du disque, pas seulement de l'index.
    func test_save_overBudget_deletesTheEvictedFileFromDisk() async {
        let (store, _) = makeStore(budgetBytes: 150)
        await store.save(Data(repeating: 0xAA, count: 100), id: "oldest")
        await store.save(Data(repeating: 0xBB, count: 100), id: "newest")

        let evicted = await store.data(forID: "oldest")
        XCTAssertNil(evicted)
    }

    // MARK: - Survie au redémarrage

    /// Un second store pointé sur le même dossier retrouve l'index persisté
    /// par le premier — c'est la survie au relaunch de l'app.
    func test_index_survivesReload() async {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("MeeshyTests/sticker-lib-\(UUID().uuidString)", isDirectory: true)
        let first = StickerLibraryStore(baseDirectory: dir)
        await first.save(Data([0x01]), id: "a")
        await first.save(Data([0x02]), id: "b")

        let reloaded = StickerLibraryStore(baseDirectory: dir)
        let ids = await reloaded.recentIDs()
        XCTAssertEqual(ids, ["b", "a"])

        let payload = await reloaded.data(forID: "a")
        XCTAssertEqual(payload, Data([0x01]))
    }

    // MARK: - Robustesse

    /// Aucun sidecar n'existe encore (première utilisation) : la bibliothèque
    /// démarre vide, jamais un crash.
    func test_missingIndex_startsEmpty() async {
        let (store, _) = makeStore()
        let ids = await store.recentIDs()
        XCTAssertEqual(ids, [])
    }

    /// Sidecar présent mais illisible (JSON tronqué) : la bibliothèque
    /// repart vide plutôt que de propager l'erreur de décodage.
    func test_corruptIndex_startsEmptyInsteadOfCrashing() async {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("MeeshyTests/sticker-lib-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let indexURL = dir.appendingPathComponent(".sticker-index.json")
        try? Data("{ not valid json".utf8).write(to: indexURL)

        let store = StickerLibraryStore(baseDirectory: dir)
        let ids = await store.recentIDs()
        XCTAssertEqual(ids, [])
    }

    // MARK: - S5 — la SECONDE alimentation : un sticker REÇU

    /// GARDE POSITIVE. La décision « quels stickers de ce contenu sont
    /// enregistrables » vit dans le SDK (`StoryStickerLibrary.savable`) : sans
    /// lecteur dans l'app, elle resterait une décision que personne ne prend,
    /// et le geste « enregistrer ce sticker » n'existerait nulle part.
    func test_savableStickers_hasAReaderInProduction() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        guard let enumerateur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            return XCTFail("Arborescence app introuvable à \(racine.path)")
        }
        var found = false
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            if source.contains("StoryStickerLibrary.savable(") {
                found = true
                break
            }
        }
        XCTAssertTrue(
            found,
            "Aucun site de PRODUCTION ne lit StoryStickerLibrary.savable(in:) — recevoir un "
                + "sticker n'ouvre alors aucun geste d'enregistrement."
        )
    }

    private func savable(id: String = "media-1", url: String = "https://cdn/sticker.png")
        -> StoryStickerLibrary.Savable {
        StoryStickerLibrary.Savable(
            id: StoryStickerLibrary.libraryID(forPostMediaID: id) ?? id,
            mediaURLString: url
        )
    }

    /// Le sticker reçu entre dans LA bibliothèque — la même que le collage,
    /// jamais une seconde : ses octets se relisent par `data(forID:)` et son
    /// id apparaît dans les récents.
    @MainActor
    func test_receivedSticker_isDownloadedThenStoredInTheLibrary() async {
        let (store, _) = makeStore()
        let bytes = Data([0x89, 0x50, 0x4E, 0x47])

        let outcome = await StickerLibraryReceive.save(
            savable(), into: store, download: { _ in bytes }
        )

        XCTAssertEqual(outcome, .saved)
        let stored = await store.data(forID: self.savable().id)
        XCTAssertEqual(stored, bytes)
        let ids = await store.recentIDs()
        XCTAssertEqual(ids, [self.savable().id])
    }

    /// Un sticker déjà enregistré n'est ni retéléchargé ni dupliqué : son id
    /// de bibliothèque est dérivé du `postMediaId`, donc le même geste vise la
    /// même entrée.
    @MainActor
    func test_receivedSticker_alreadyInTheLibrary_isNeitherDownloadedAgainNorDuplicated() async {
        let (store, _) = makeStore()
        var requested: [String] = []
        let download: @MainActor (String) async -> Data? = { url in
            requested.append(url)
            return Data([0x01])
        }

        let first = await StickerLibraryReceive.save(savable(), into: store, download: download)
        let second = await StickerLibraryReceive.save(savable(), into: store, download: download)

        XCTAssertEqual(first, .saved)
        XCTAssertEqual(second, .alreadyInLibrary)
        XCTAssertEqual(requested, ["https://cdn/sticker.png"],
                       "Le second geste a retéléchargé une image déjà en bibliothèque.")
        let ids = await store.recentIDs()
        XCTAssertEqual(ids.count, 1)
    }

    /// Téléchargement impossible : rien n'entre en bibliothèque, et l'échec
    /// est RENDU à l'appelant — un geste muet passerait pour un succès.
    @MainActor
    func test_receivedSticker_whenTheDownloadFails_storesNothing_andReportsFailure() async {
        let (store, _) = makeStore()

        let outcome = await StickerLibraryReceive.save(
            savable(), into: store, download: { _ in nil }
        )

        XCTAssertEqual(outcome, .failed)
        let ids = await store.recentIDs()
        XCTAssertEqual(ids, [])
    }

    // MARK: - Ce que l'utilisateur s'entend dire

    func test_announcement_isNil_whenNothingWasAttempted() {
        XCTAssertNil(StickerLibraryReceive.announcement(for: []))
    }

    func test_announcement_countsWhatWasActuallyAdded() {
        XCTAssertEqual(StickerLibraryReceive.announcement(for: [.saved]), .saved(1))
        XCTAssertEqual(
            StickerLibraryReceive.announcement(for: [.saved, .alreadyInLibrary, .saved]),
            .saved(2)
        )
    }

    func test_announcement_saysAlreadyPresent_whenNothingNewWasAdded() {
        XCTAssertEqual(
            StickerLibraryReceive.announcement(for: [.alreadyInLibrary, .alreadyInLibrary]),
            .alreadyInLibrary
        )
    }

    /// L'échec PARLE, même noyé dans des succès : c'est la seule des trois
    /// annonces qui demande une action de l'utilisateur (réessayer).
    func test_announcement_surfacesAFailure_evenAlongsideASuccess() {
        XCTAssertEqual(StickerLibraryReceive.announcement(for: [.saved, .failed]), .failed)
    }
}
