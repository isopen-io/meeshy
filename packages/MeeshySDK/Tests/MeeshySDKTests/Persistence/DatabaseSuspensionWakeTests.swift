import XCTest
import GRDB
@testable import MeeshySDK

/// Écriture-sonde, hors de la classe : une closure passée à
/// `duringBackgroundWake` ne doit capturer NI `self` (XCTestCase n'est pas
/// `Sendable`), ni rien d'autre que le pool — qui l'est.
private func ecrireDans(_ pool: DatabasePool) throws {
    try pool.write { base in
        try base.execute(sql: "INSERT INTO sonde_7160 (id) VALUES (NULL)")
    }
}

private func aPuEcrireDans(_ pool: DatabasePool) -> Bool {
    (try? ecrireDans(pool)) != nil
}

/// **Le correctif du `0xDEAD10CC` rendait les réveils d'arrière-plan MUETS**
/// (#7160).
///
/// `DatabaseSuspension.suspend()` est posé à la fin de l'entrée en arrière-plan
/// et `resume()` au retour au premier plan. Entre les deux, le processus est
/// censé être gelé — il ne l'est pas toujours : `BGAppRefreshTask`,
/// `BGProcessingTask` et le filet de flush du cache le réveillent précisément
/// là, et c'est LEUR raison d'être d'écrire.
///
/// Sans parenthèse, toutes ces écritures levaient `SQLITE_INTERRUPT` pendant
/// que les journaux annonçaient un succès. **Un défaut plus difficile à voir
/// que le plantage qu'on venait de corriger : rien ne plante, rien n'arrive.**
///
/// Ces témoins mesurent le COMPORTEMENT — une écriture aboutit ou non — jamais
/// la présence d'un drapeau.
final class DatabaseSuspensionWakeTests: XCTestCase {

    private var url: URL!

    override func setUp() {
        super.setUp()
        url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy_reveil_\(UUID().uuidString).sqlite")
    }

    override func tearDown() {
        // La suspension est un état de PROCESSUS : la laisser posée
        // contaminerait toutes les suites qui tournent après celle-ci dans le
        // même binaire.
        DatabaseSuspension.resume()
        for suffixe in ["", "-wal", "-shm"] {
            try? FileManager.default.removeItem(at: URL(fileURLWithPath: url.path + suffixe))
        }
        url = nil
        super.tearDown()
    }

    /// Un pool armé comme l'application les arme — par `DatabaseSuspension.arm`,
    /// jamais par un drapeau recopié dans le témoin (leçon 630 : un témoin qui
    /// fabrique sa propre configuration mesure le témoin).
    private func pool() throws -> DatabasePool {
        var configuration = Configuration()
        DatabaseSuspension.arm(&configuration)
        let pool = try DatabasePool(path: url.path, configuration: configuration)
        try pool.write { base in
            try base.execute(sql: "CREATE TABLE sonde_7160 (id INTEGER PRIMARY KEY)")
        }
        return pool
    }

    // MARK: - La règle

    func test_unReveil_rendLEcriturePossible_puisLaReferme() async throws {
        let db = try pool()
        DatabaseSuspension.suspend()

        XCTAssertThrowsError(
            try ecrireDans(db),
            "Préalable du témoin : hors réveil, la base suspendue doit refuser d'écrire."
        )

        let aEcrit = await DatabaseSuspension.duringBackgroundWake {
            aPuEcrireDans(db)
        }

        XCTAssertTrue(
            aEcrit,
            """
            L'écriture a été REFUSÉE à l'intérieur d'un réveil d'arrière-plan. \
            C'est l'état dans lequel #7059 a laissé `BGAppRefreshTask` : le \
            drainage de l'outbox, la synchronisation et le préfetch levaient \
            SQLITE_INTERRUPT et le journal annonçait un succès (#7160).
            """
        )

        XCTAssertThrowsError(
            try ecrireDans(db),
            """
            La base est restée OUVERTE après le réveil. Un réveil qui ne repose \
            pas la suspension rend la parade au 0xDEAD10CC inopérante pour tout \
            le reste de l'arrière-plan.
            """
        )
    }

    /// **CONTRE-ÉPREUVE.** Hors suspension, la parenthèse ne doit RIEN changer —
    /// sinon elle fermerait la base d'une application au premier plan.
    func test_unReveil_horsSuspension_neFermeRien() async throws {
        let db = try pool()

        await DatabaseSuspension.duringBackgroundWake { }

        XCTAssertNoThrow(
            try ecrireDans(db),
            """
            Un réveil ouvert alors que l'application n'était PAS suspendue a \
            refermé la base en sortant. La parenthèse doit restituer l'état \
            qu'elle a trouvé, jamais en inventer un.
            """
        )
    }

    /// **Le retour au premier plan GAGNE contre la sortie d'un réveil.**
    ///
    /// Une tâche d'arrière-plan qui se termine après que l'utilisateur a rouvert
    /// l'application ne doit pas refermer la base sous ses doigts : ce serait
    /// une application muette pour le reste de la session, exactement le défaut
    /// que `DatabaseSuspension` documente comme pire qu'un plantage.
    func test_unRetourAuPremierPlan_pendantUnReveil_laisseLaBaseOUVERTE() async throws {
        let db = try pool()
        DatabaseSuspension.suspend()

        await DatabaseSuspension.duringBackgroundWake {
            // L'utilisateur rouvre l'application pendant que la tâche court.
            DatabaseSuspension.resume()
        }

        XCTAssertNoThrow(
            try ecrireDans(db),
            """
            La sortie du réveil a refermé une base que le premier plan venait \
            de rouvrir. L'application serait incapable d'enregistrer quoi que \
            ce soit tant qu'elle n'est pas renvoyée en arrière-plan puis \
            rouverte.
            """
        )
    }

    /// **Deux réveils peuvent se recouvrir** — les deux `BGTask` de
    /// l'application et le filet de flush du cache SDK sont trois tâches
    /// distinctes. Le premier qui sort ne doit pas refermer la base sous le
    /// second.
    func test_deuxReveilsImbriques_neReferment_quALaSortieDuDERNIER() async throws {
        let db = try pool()
        DatabaseSuspension.suspend()

        let mesures = await DatabaseSuspension.duringBackgroundWake { () -> (Bool, Bool) in
            let dansLInterieur = await DatabaseSuspension.duringBackgroundWake {
                aPuEcrireDans(db)
            }
            // Le réveil intérieur est sorti ; l'extérieur court encore.
            return (dansLInterieur, aPuEcrireDans(db))
        }

        XCTAssertTrue(mesures.0, "Préalable : le réveil imbriqué doit lever la suspension.")
        XCTAssertTrue(
            mesures.1,
            """
            La sortie du réveil INTÉRIEUR a refermé la base alors que le réveil \
            extérieur courait encore. Deux tâches d'arrière-plan qui se \
            recouvrent se voleraient mutuellement leurs écritures.
            """
        )
        XCTAssertThrowsError(
            try ecrireDans(db),
            "À la sortie du DERNIER réveil, la suspension doit être reposée."
        )
    }
}
