import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

/// **Le `0xDEAD10CC` a survécu à son propre correctif** (#7160).
///
/// #7059 a armé `observesSuspensionNotifications` sur `AppDatabase`
/// (`meeshy.sqlite`) et le kill est revenu à l'identique en build **1827**.
/// Le rapport du 20/09 15:15 montre pourquoi : **DEUX** fils
/// `GRDB.DatabasePool.writer` vivants au moment de la suppression — l'un dans
/// `sqlite3_wal_checkpoint_v2` jusqu'à `guarded_pwrite_np`, l'autre dans un
/// `write` synchrone. Le drapeau se pose PAR POOL, et l'application en ouvre un
/// second, sur `meeshy_messages.sqlite`, qui n'écoutait rien.
///
/// C'est le plus exposé des deux : `MessagePersistenceActor` y écrit à chaque
/// message reçu, y compris pendant la transition vers l'arrière-plan.
/// `@MainActor` comme ``DependencyContainerTests`` : le container l'est, donc
/// `reopenReplacingCorruptFile` et `DatabaseInitDiagnostics` le sont aussi.
@MainActor
final class DependencyContainerSuspensionTests: XCTestCase {

    private var dossier: URL!

    override func setUpWithError() throws {
        try super.setUpWithError()
        dossier = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("meeshy-7160-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
    }

    override func tearDown() {
        // La suspension est un état de PROCESSUS : la laisser posée
        // contaminerait toutes les suites qui tournent après celle-ci.
        DatabaseSuspension.resume()
        try? FileManager.default.removeItem(at: dossier)
        dossier = nil
        super.tearDown()
    }

    private func poolDesMessages(_ nom: String = "messages.sqlite") throws -> DatabasePool {
        let pool = try DatabasePool(
            path: dossier.appendingPathComponent(nom).path,
            configuration: DependencyContainer.dbConfig()
        )
        try pool.write { db in
            try db.execute(sql: "CREATE TABLE sonde_7160 (id INTEGER PRIMARY KEY)")
        }
        return pool
    }

    private func ecrire(_ pool: DatabasePool) throws {
        try pool.write { db in
            try db.execute(sql: "INSERT INTO sonde_7160 (id) VALUES (NULL)")
        }
    }

    // MARK: - Le pool de messages écoute la suspension

    func test_uneEcriture_surLeStoreDesMessages_estREFUSEE_pendantLaSuspension() throws {
        let pool = try poolDesMessages()

        DatabaseSuspension.suspend()

        XCTAssertThrowsError(
            try ecrire(pool),
            """
            Une écriture a ABOUTI sur `meeshy_messages.sqlite` pendant la \
            suspension : elle a donc pris un verrou de fichier au moment précis \
            où iOS s'apprête à geler le processus. C'est la configuration exacte \
            du kill 0xDEAD10CC revenu en build 1827, APRÈS le correctif #7059 — \
            qui n'armait que le pool du SDK (#7160).
            """
        ) { erreur in
            XCTAssertTrue(
                DatabaseSuspension.isSuspensionInterruption(erreur),
                """
                Le refus doit venir de la SUSPENSION (SQLITE_INTERRUPT / \
                SQLITE_ABORT), pas d'autre chose — obtenu : \
                \((erreur as? DatabaseError)?.resultCode as Any). Un refus pour \
                une autre raison rendrait ce témoin vert sans que la suspension \
                soit armée.
                """
            )
        }
    }

    /// **CONTRE-ÉPREUVE** — sans quoi le témoin ci-dessus serait vert par
    /// omission : si l'écriture échouait pour une raison quelconque (schéma
    /// absent, chemin illisible), il passerait sans rien prouver.
    func test_laMEMEecriture_aboutit_horsSuspension() throws {
        let pool = try poolDesMessages()
        XCTAssertNoThrow(
            try ecrire(pool),
            "Hors suspension, cette écriture doit aboutir — sinon le témoin de refus ne mesure rien."
        )
    }

    /// La parade ne doit pas AVEUGLER l'écran : en mode WAL une lecture ne prend
    /// aucun verrou d'écriture. Sans cela, la liste des conversations se vide
    /// chaque fois que l'application part en arrière-plan.
    func test_uneLecture_passeENCORE_pendantLaSuspension() throws {
        let pool = try poolDesMessages()
        try ecrire(pool)

        DatabaseSuspension.suspend()

        let compte = try pool.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM sonde_7160") ?? -1
        }
        XCTAssertEqual(compte, 1, "Une lecture WAL doit passer pendant la suspension.")
    }

    // MARK: - Une interruption n'est pas une corruption

    /// **LE DANGER DE LA PARADE ELLE-MÊME.**
    ///
    /// `reopenReplacingCorruptFile` met le fichier en QUARANTAINE et en recrée
    /// un vide — c'est sa raison d'être. Armer la suspension fait apparaître
    /// une erreur que ce chemin n'avait jamais vue : `SQLITE_INTERRUPT`.
    /// `isAccessDenied` ne couvre que AUTH / PERM / CANTOPEN / READONLY, donc
    /// l'interruption tombait dans la branche « corrompu » : **le store de
    /// messages de l'utilisateur partait en quarantaine pendant une simple
    /// fenêtre de suspension.** On aurait troqué une suppression par le système
    /// contre une perte de données — strictement pire.
    func test_uneOuvertureINTERROMPUE_neMetRienEnQuarantaine() throws {
        let chemin = dossier.appendingPathComponent("precieux.sqlite").path
        let octetsPrecieux = Data("les messages que l'utilisateur ne doit jamais perdre".utf8)
        try octetsPrecieux.write(to: URL(fileURLWithPath: chemin))

        var diagnostics = DatabaseInitDiagnostics()
        let pool = DependencyContainer.reopenReplacingCorruptFile(
            at: chemin,
            after: DatabaseError(resultCode: .SQLITE_INTERRUPT),
            config: DependencyContainer.dbConfig(),
            fileManager: .default,
            clock: Date.init,
            diagnostics: &diagnostics
        )

        XCTAssertNil(pool, "Une interruption ne se récupère pas : elle se retente plus tard.")
        XCTAssertFalse(
            diagnostics.recoveryAttempted,
            "Aucune récupération ne doit être TENTÉE sur une interruption."
        )
        XCTAssertNil(
            diagnostics.quarantinedFilePath,
            """
            Le fichier a été mis en QUARANTAINE après une ouverture interrompue \
            par la suspension. « Pas maintenant » a été lu comme « ce fichier \
            est illisible » : la parade au 0xDEAD10CC vient de détruire les \
            données qu'elle devait protéger (#7160).
            """
        )
        XCTAssertEqual(
            try Data(contentsOf: URL(fileURLWithPath: chemin)),
            octetsPrecieux,
            "Le fichier doit rester INTACT, octet pour octet."
        )
    }

    /// **CONTRE-ÉPREUVE de la garde** : elle doit écarter les interruptions,
    /// pas désarmer la quarantaine. Un fichier réellement corrompu doit
    /// toujours partir de côté — sinon la garde aurait remplacé un défaut par
    /// un autre, et le témoin ci-dessus serait vert parce que plus RIEN n'est
    /// jamais mis en quarantaine.
    func test_uneOuvertureCORROMPUE_metTOUJOURSEnQuarantaine() throws {
        let chemin = dossier.appendingPathComponent("corrompu.sqlite").path
        try Data("not a sqlite database at all".utf8).write(to: URL(fileURLWithPath: chemin))

        var diagnostics = DatabaseInitDiagnostics()
        let pool = DependencyContainer.reopenReplacingCorruptFile(
            at: chemin,
            after: DatabaseError(resultCode: .SQLITE_NOTADB),
            config: DependencyContainer.dbConfig(),
            fileManager: .default,
            clock: Date.init,
            diagnostics: &diagnostics
        )

        XCTAssertNotNil(pool, "Un fichier corrompu doit être remplacé par une base neuve et utilisable.")
        XCTAssertTrue(diagnostics.recoveryAttempted)
        XCTAssertNotNil(
            diagnostics.quarantinedFilePath,
            "La garde d'interruption ne doit pas avoir désarmé la quarantaine des vraies corruptions."
        )
    }
}
