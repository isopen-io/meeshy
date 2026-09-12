import XCTest
import GRDB
@testable import MeeshySDK

/// **LES RÉGLAGES PAR CONNEXION N'ATTEIGNAIENT QUE LE RÉDACTEUR** (#6221, suite).
///
/// `cache_size`, `mmap_size` et `temp_store` sont des PRAGMA de CONNEXION :
/// SQLite les applique à la connexion qui les exécute, pas au fichier. Posés
/// par `applyTuning(on:)` — qui prend le rédacteur via `pool.write` — ils ne
/// touchaient donc **aucune des seize connexions de lecture** du pool, dans une
/// application que son propre commentaire décrit comme « read-heavy ».
///
/// Deux défauts pour le prix d'un, et le second est le plus cher :
///
/// 1. les lecteurs travaillaient sans les 64 Mo de `mmap` ni les ~32 Mo de
///    cache de pages — c'est-à-dire tout le chemin de lecture de l'app ;
/// 2. l'appel se faisait dans une transaction d'ÉCRITURE, au démarrage, sur le
///    thread principal — et la NSE écrit dans le MÊME fichier de groupe
///    d'app, avec `busyMode = .timeout(5)`. Ouvrir l'app depuis une
///    notification pendant que la NSE écrit pouvait bloquer cinq secondes.
///
/// Le dépôt connaissait déjà le bon geste : `DependencyContainer.dbConfig()`
/// pose trois AUTRES pragmas dans `config.prepareDatabase`, qui court sur
/// CHAQUE connexion. Ces trois-ci n'y avaient simplement pas été portés.
final class DatabaseTuningReachesReadersTests: XCTestCase {

    private func pool(tuned: Bool) throws -> DatabasePool {
        var config = Configuration()
        config.maximumReaderCount = 4
        if tuned {
            config.prepareDatabase { db in try DatabaseMaintenance.prepareTuning(db) }
        }
        let dir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return try DatabasePool(path: dir.appendingPathComponent("t.sqlite").path, configuration: config)
    }

    private func pragmas(tuned: Bool) throws -> (mmap: Int, cache: Int, temp: Int) {
        let p = try pool(tuned: tuned)
        return try p.read { db in
            (try Int.fetchOne(db, sql: "PRAGMA mmap_size") ?? -1,
             try Int.fetchOne(db, sql: "PRAGMA cache_size") ?? -1,
             try Int.fetchOne(db, sql: "PRAGMA temp_store") ?? -1)
        }
    }

    /// LE TÉMOIN QUI COMPTE : une connexion de LECTURE porte le réglage.
    ///
    /// L'assertion ne compare PAS à la valeur DEMANDÉE, et c'est une mesure qui
    /// l'impose : `PRAGMA mmap_size = 67108864` rend **20 971 520** sur ce
    /// système. SQLite plafonne à son `SQLITE_MAX_MMAP_SIZE` de compilation et
    /// ne le dit pas — il accepte la demande et sert ce qu'il peut. Le
    /// commentaire « 64 MB » du code d'origine décrivait donc une intention que
    /// la plateforme n'a jamais honorée.
    ///
    /// Ce qu'on garde est le FAIT utile, et le seul que le lot change : le
    /// lecteur reçoit le MÊME réglage que le rédacteur, et il est non nul.
    /// Comparer à une constante aurait fait rougir ce témoin au prochain
    /// changement de plafond système, pour un défaut qui n'existerait pas.
    func test_tuning_reachesAReaderConnection() throws {
        let avant = try pragmas(tuned: false)
        let apres = try pragmas(tuned: true)

        XCTAssertGreaterThan(apres.mmap, 0, "le lecteur n'a aucun mmap")
        XCTAssertNotEqual(apres.mmap, avant.mmap, "le mmap du lecteur ne change pas : le réglage ne l'atteint pas")
        XCTAssertEqual(apres.cache, 8_000, "le lecteur n'a pas le cache de pages (avant : \(avant.cache))")
        XCTAssertEqual(apres.temp, 2, "le lecteur n'a pas `temp_store = MEMORY` (avant : \(avant.temp))")
    }

    /// LE CONTRÔLE — sans lui, le témoin ci-dessus pourrait être vert parce que
    /// SQLite ou GRDB posent déjà ces valeurs, et ne garderait rien du tout.
    func test_withoutPreparation_theReaderIsUntuned() throws {
        let avant = try pragmas(tuned: false)
        XCTAssertEqual(avant.mmap, 0, "SQLite pose déjà un mmap par défaut : le réglage n'apporte rien (mesuré \(avant.mmap))")
        XCTAssertNotEqual(avant.cache, 8_000, "le cache de pages est déjà celui qu'on demande : le témoin ne garde rien")
    }

    /// ET LE RÉGLAGE NE COÛTE PLUS UNE ÉCRITURE : c'est la moitié du défaut,
    /// celle qui pouvait bloquer cinq secondes au démarrage sur la contention
    /// WAL avec la NSE.
    func test_preparation_needsNoWriteTransaction() throws {
        let p = try pool(tuned: true)
        // Une base OUVERTE EN LECTURE SEULE ne peut pas honorer une écriture ;
        // si `prepareTuning` en demandait une, l'ouverture échouerait ici.
        try p.read { db in XCTAssertNoThrow(try Int.fetchOne(db, sql: "PRAGMA temp_store")) }
    }
}
