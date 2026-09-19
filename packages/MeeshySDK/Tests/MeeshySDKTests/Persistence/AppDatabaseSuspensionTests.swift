import XCTest
import GRDB
@testable import MeeshySDK

/// **Une écriture en cours au moment de la suspension fait TUER l'application**
/// (#7059, `0xDEAD10CC`).
///
/// Mesuré sur l'iPhone du porteur : cinq suppressions, toutes avec le fil
/// `GRDB.DatabasePool.writer` actif, sur **trois sites d'appel différents** —
/// l'autorisation d'une requête, la construction d'un curseur, l'union de
/// régions observées. Ce n'est donc pas une requête lente qu'on pourrait
/// accélérer : il suffit que *n'importe quel* travail soit en cours sur la file
/// d'écriture quand iOS suspend le processus, parce que ce travail tient un
/// verrou sur le fichier SQLite — et RunningBoard supprime un processus suspendu
/// qui retient un verrou.
///
/// La parade n'est pas d'écrire plus vite, c'est que la base **sache** que
/// l'application se suspend : `observesSuspensionNotifications` fait refuser à
/// GRDB toute prise de verrou pendant la suspension.
///
/// **Ces témoins mesurent le COMPORTEMENT, pas la configuration.** Affirmer
/// `configuration.observesSuspensionNotifications == true` vérifierait qu'un
/// drapeau est posé ; ces témoins vérifient qu'une écriture est effectivement
/// refusée et qu'une lecture passe encore — c'est-à-dire que l'application reste
/// utilisable pendant la fenêtre où elle ne peut plus écrire.
final class AppDatabaseSuspensionTests: XCTestCase {

    private var url: URL!

    override func setUp() {
        super.setUp()
        url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy_suspension_\(UUID().uuidString).sqlite")
    }

    override func tearDown() {
        // La reprise DOIT être postée même si un témoin échoue : la suspension
        // est un état de PROCESSUS, et le laisser posé contaminerait toutes les
        // suites qui tournent après celle-ci dans le même binaire.
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
        for suffixe in ["", "-wal", "-shm"] {
            try? FileManager.default.removeItem(at: URL(fileURLWithPath: url.path + suffixe))
        }
        url = nil
        super.tearDown()
    }

    /// Un pool ouvert comme l'application l'ouvre — c'est le point : le témoin
    /// ne doit pas fabriquer sa propre configuration, sans quoi il mesurerait
    /// une base qui n'existe nulle part (leçon 630, un témoin qui fabrique son
    /// décodeur mesure le runtime).
    private func pool() throws -> DatabasePool {
        let (writer, ephemere) = AppDatabase.openOrRecover(at: url)
        XCTAssertFalse(ephemere, "Le témoin doit mesurer un pool SUR DISQUE — un repli en mémoire n'a pas de verrou de fichier, donc pas de 0xDEAD10CC à prévenir.")
        return try XCTUnwrap(writer as? DatabasePool, "AppDatabase doit servir un DatabasePool.")
    }

    private func suspendre() {
        NotificationCenter.default.post(name: Database.suspendNotification, object: nil)
    }

    private func reprendre() {
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
    }

    // MARK: - La règle

    func test_uneEcriture_estREFUSEE_pendantLaSuspension() throws {
        let db = try pool()

        suspendre()

        XCTAssertThrowsError(
            try db.write { base in
                try base.execute(sql: "CREATE TABLE IF NOT EXISTS sonde_7059 (id INTEGER PRIMARY KEY)")
            },
            """
            Une écriture a ABOUTI pendant la suspension : elle a donc pris un \
            verrou sur le fichier SQLite au moment précis où iOS s'apprête à \
            suspendre le processus. C'est la configuration exacte du kill \
            0xDEAD10CC mesuré cinq fois sur l'appareil du porteur (#7059).
            """
        ) { erreur in
            let code = (erreur as? DatabaseError)?.resultCode
            XCTAssertTrue(
                code == .SQLITE_INTERRUPT || code == .SQLITE_ABORT,
                """
                Le refus doit venir de la SUSPENSION (SQLITE_INTERRUPT ou \
                SQLITE_ABORT), pas d'autre chose — obtenu : \
                \(String(describing: code)). Un refus pour une autre raison \
                rendrait ce témoin vert sans que la suspension soit armée.
                """
            )
        }
    }

    /// **CONTRE-ÉPREUVE — sans quoi le témoin ci-dessus serait vert par
    /// omission.** Si l'écriture échouait pour une raison quelconque (fichier
    /// absent, schéma cassé), le premier témoin passerait sans rien prouver.
    func test_laMEMEecriture_aboutit_horsSuspension() throws {
        let db = try pool()

        XCTAssertNoThrow(
            try db.write { base in
                try base.execute(sql: "CREATE TABLE IF NOT EXISTS sonde_7059 (id INTEGER PRIMARY KEY)")
            },
            "Hors suspension, cette écriture doit aboutir — sinon le témoin de refus ne mesure rien."
        )
    }

    func test_laReprise_rendLEcriturePossibleANouveau() throws {
        let db = try pool()

        suspendre()
        _ = try? db.write { base in
            try base.execute(sql: "CREATE TABLE IF NOT EXISTS sonde_7059 (id INTEGER PRIMARY KEY)")
        }

        reprendre()

        XCTAssertNoThrow(
            try db.write { base in
                try base.execute(sql: "CREATE TABLE IF NOT EXISTS sonde_7059 (id INTEGER PRIMARY KEY)")
            },
            """
            La base est restée muette après la reprise. Une suspension qui ne se \
            lève pas échange un plantage contre une application qui ne peut plus \
            rien enregistrer au retour au premier plan — pire que le défaut \
            qu'elle corrige.
            """
        )
    }

    /// **La suspension ne doit pas AVEUGLER l'application.** GRDB l'écrit dans
    /// sa propre documentation : « All database operations may throw […] except
    /// reads in WAL mode ». C'est ce qui rend la parade acceptable — l'écran
    /// continue d'afficher ce qui est en base pendant la fenêtre de suspension.
    /// **LE DANGER DE LA PARADE ELLE-MÊME, et le témoin qui l'interdit.**
    ///
    /// `openOrRecover` attrape TOUTE erreur de migration et **efface le fichier**
    /// — c'est sa raison d'être : un store corrompu (`SQLITE_CORRUPT`,
    /// `SQLITE_NOTADB`) doit être recréé plutôt que de casser la session entière.
    ///
    /// Mais armer la suspension fait apparaître une erreur qui n'existait pas
    /// avant : `SQLITE_INTERRUPT`. Une ouverture pendant la fenêtre de
    /// suspension — un réveil d'arrière-plan, une tâche BG — verrait sa
    /// migration interrompue, et le code la lirait comme une corruption. **Il
    /// effacerait la base locale de l'utilisateur.**
    ///
    /// On aurait alors troqué une suppression par le système contre une perte
    /// de données, ce qui est strictement pire. Une interruption n'est pas une
    /// corruption : elle dit « pas maintenant », jamais « ce fichier est
    /// illisible ».
    func test_uneMigrationINTERROMPUE_neDetruitPasLaBase() throws {
        // Une base VALIDE, avec une donnée reconnaissable.
        let db = try pool()
        try db.write { base in
            try base.execute(sql: "CREATE TABLE IF NOT EXISTS sonde_7059 (id INTEGER PRIMARY KEY)")
            try base.execute(sql: "INSERT INTO sonde_7059 (id) VALUES (4242)")
        }
        try db.close()

        let tailleAvant = try XCTUnwrap(
            FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int,
            "Le fichier doit exister avant la mesure."
        )

        suspendre()
        let (writer, _) = AppDatabase.openOrRecover(at: url)
        reprendre()

        XCTAssertTrue(
            FileManager.default.fileExists(atPath: url.path),
            """
            La base a été EFFACÉE après une ouverture pendant la suspension. \
            `openOrRecover` a lu un SQLITE_INTERRUPT comme une corruption : la \
            parade au 0xDEAD10CC vient de détruire les données qu'elle devait \
            protéger (#7059).
            """
        )
        let tailleApres = try XCTUnwrap(
            FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int
        )
        XCTAssertGreaterThanOrEqual(
            tailleApres, tailleAvant,
            "Le fichier a RÉTRÉCI : il a été recréé vide plutôt que conservé."
        )

        // Et la donnée est toujours là, une fois la base reprise.
        let retrouve = try (writer as? DatabasePool).map { p in
            try p.read { base in try Int.fetchOne(base, sql: "SELECT id FROM sonde_7059") }
        } ?? {
            let (w, _) = AppDatabase.openOrRecover(at: url)
            return try w.read { base in try Int.fetchOne(base, sql: "SELECT id FROM sonde_7059") }
        }()
        XCTAssertEqual(retrouve, 4242, "La donnée d'avant la suspension doit survivre.")
    }

    func test_uneLecture_passeENCORE_pendantLaSuspension() throws {
        let db = try pool()
        try db.write { base in
            try base.execute(sql: "CREATE TABLE IF NOT EXISTS sonde_7059 (id INTEGER PRIMARY KEY)")
            try base.execute(sql: "INSERT INTO sonde_7059 (id) VALUES (1)")
        }

        suspendre()

        let compte = try db.read { base in
            try Int.fetchOne(base, sql: "SELECT COUNT(*) FROM sonde_7059") ?? -1
        }
        XCTAssertEqual(
            compte, 1,
            """
            Une lecture a échoué pendant la suspension. En mode WAL elle ne prend \
            aucun verrou d'écriture et doit passer : sans cela, l'écran se vide \
            chaque fois que l'application part en arrière-plan.
            """
        )
    }
}
