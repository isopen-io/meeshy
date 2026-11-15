import XCTest
import GRDB
@testable import MeeshySDK

/// cache-09 (#7146) — **le témoin d'INVENTAIRE**, celui qui manquait.
///
/// `CacheCoordinatorLogoutPurgeTests` énumère les stores à la main, une classe
/// de fuite à la fois : préférences (T5), transcripts d'appel, mapping de noms.
/// C'est exactement la forme qui ne peut pas voir le défaut suivant — le fichier
/// grandit d'un cas à chaque fuite CONSTATÉE, jamais d'un cas à chaque store
/// AJOUTÉ. Résultat mesuré au 2026-09-20 : trois stores déclarés en tête de
/// classe n'étaient cités par aucune des trois énumérations de purge.
///
/// La régression a une date et une cause. `GRDBCacheStore.deleteAllL2()` vidait
/// les tables `cache_entries` / `cache_metadata` EN ENTIER : le premier
/// `invalidateAll()` de n'importe quelle liste emportait déjà tout le reste, et
/// un store absent de la liste disparaissait quand même, par effet de bord. Ce
/// comportement global a été cantonné au namespace du store — correct, et
/// documenté dans `invalidateAll()`. Dès lors, **être déclaré ne suffit plus :
/// il faut être NOMMÉ**. Le lot qui a fait la bascule a ajouté douze stores à la
/// main et en a manqué deux : `phonebook` — que son propre doc-comment appelle
/// « la donnée la plus personnelle du cache » — et `affiliates`.
///
/// Ce témoin ne connaît aucun nom de store. Il lit les propriétés DÉCLARÉES par
/// réflexion et les confronte à l'énumération que les purges parcourent. Un
/// store ajouté demain et oublié dans la liste le fait rougir sans qu'on ait
/// pensé à lui — c'est la seule forme qui tienne dans le temps.
final class CacheCoordinatorPurgeInventoryTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeCoordinator(db: DatabaseQueue) -> CacheCoordinator {
        CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
    }

    /// Les stores GRDB déclarés en tête de `CacheCoordinator`, lus par
    /// réflexion : `(nom de propriété, identité de l'instance)`.
    ///
    /// Passer par `Mirror` est délibéré. Toute autre forme — une liste, un
    /// `switch`, un jeu de noms attendus — devrait être tenue à jour par la
    /// main qui ajoute un store, c'est-à-dire par celle qui vient d'oublier de
    /// tenir la liste à jour. La réflexion est le seul inventaire qu'on ne peut
    /// pas omettre de mettre à jour.
    private func declaredGRDBStores(of coordinator: CacheCoordinator) -> [(name: String, id: ObjectIdentifier)] {
        Mirror(reflecting: coordinator).children.compactMap { child in
            guard let store = child.value as? any GRDBDirtyFlushing else { return nil }
            return (child.label ?? "<sans nom>", ObjectIdentifier(store as AnyObject))
        }
    }

    // MARK: - L'inventaire

    func test_everyDeclaredGRDBStore_isEnumeratedForPurge() async throws {
        let db = try makeDB()
        let coordinator = makeCoordinator(db: db)

        let declared = declaredGRDBStores(of: coordinator)
        let enumerated = Set(await coordinator.allGRDBStores.map { ObjectIdentifier($0 as AnyObject) })

        let missing = declared.filter { !enumerated.contains($0.id) }.map(\.name).sorted()

        XCTAssertEqual(
            missing, [],
            """
            \(missing.count) store(s) GRDB déclaré(s) mais absent(s) de `allGRDBStores` : \
            \(missing.joined(separator: ", ")).
            Depuis que `deleteAllL2()` est cantonné à son namespace, un store non énuméré \
            n'est plus purgé par effet de bord : il SURVIT au logout, et le compte suivant \
            en hérite sur le même appareil. Ajouter le store à `allGRDBStores` — les purges \
            la parcourent, donc c'est le seul endroit à tenir.
            """
        )
    }

    /// Le pendant du précédent : personne n'a le droit d'ajouter à la liste un
    /// objet qui ne serait pas une propriété du coordinateur (doublon, store
    /// construit à la volée). Sans lui, l'inventaire pourrait être satisfait par
    /// une liste qui ne dit plus la vérité.
    func test_everyEnumeratedStore_isADeclaredProperty() async throws {
        let db = try makeDB()
        let coordinator = makeCoordinator(db: db)

        let declared = Set(declaredGRDBStores(of: coordinator).map(\.id))
        let enumerated = await coordinator.allGRDBStores.map { ObjectIdentifier($0 as AnyObject) }

        let orphans = enumerated.filter { !declared.contains($0) }

        XCTAssertTrue(
            orphans.isEmpty,
            "\(orphans.count) entrée(s) de `allGRDBStores` ne correspondent à aucune propriété déclarée du coordinateur."
        )
    }

    // MARK: - Les deux fuites constatées

    /// Le répertoire téléphonique : noms affichés, numéros, adresses e-mail et
    /// correspondances d'utilisateurs, sous UNE clé, sans plafond d'entrées.
    /// C'est la donnée la plus personnelle que le cache détienne, et la seule
    /// dont la fuite ne demande à l'utilisateur B aucune action : ouvrir
    /// l'annuaire suffit.
    func test_reset_purgesPhonebook() async throws {
        let db = try makeDB()
        let coordinator = makeCoordinator(db: db)
        try await coordinator.phonebook.save(
            [DirectoryContact(
                id: "contact-1",
                contactKey: "key-1",
                displayName: "Alice Martin",
                phoneNumbers: ["+33600000000"],
                emails: ["alice@example.com"],
                isOnMeeshy: true
            )],
            for: "all"
        )

        await coordinator.reset()

        let remaining = await coordinator.phonebook.load(for: "all")
        switch remaining {
        case .empty: break
        default:
            XCTFail("Le répertoire du compte sortant survit à reset() — le compte suivant lit son carnet d'adresses. Reçu : \(remaining)")
        }
    }

    func test_reset_purgesAffiliates() async throws {
        let db = try makeDB()
        let coordinator = makeCoordinator(db: db)
        try await coordinator.affiliates.save(
            [AffiliateReferral(id: "ref-1", status: "completed")],
            for: "list"
        )

        await coordinator.reset()

        let remaining = await coordinator.affiliates.load(for: "list")
        switch remaining {
        case .empty: break
        default:
            XCTFail("Les filleuls du compte sortant survivent à reset(). Reçu : \(remaining)")
        }
    }

    func test_invalidateAll_purgesPhonebookAndAffiliates() async throws {
        let db = try makeDB()
        let coordinator = makeCoordinator(db: db)
        try await coordinator.phonebook.save(
            [DirectoryContact(id: "contact-1", contactKey: "key-1", displayName: "Alice Martin", isOnMeeshy: true)],
            for: "all"
        )
        try await coordinator.affiliates.save([AffiliateReferral(id: "ref-1")], for: "list")

        await coordinator.invalidateAll()

        let contacts = await coordinator.phonebook.load(for: "all")
        let referrals = await coordinator.affiliates.load(for: "list")
        switch contacts {
        case .empty: break
        default: XCTFail("phonebook survit à invalidateAll(). Reçu : \(contacts)")
        }
        switch referrals {
        case .empty: break
        default: XCTFail("affiliates survit à invalidateAll(). Reçu : \(referrals)")
        }
    }
}
