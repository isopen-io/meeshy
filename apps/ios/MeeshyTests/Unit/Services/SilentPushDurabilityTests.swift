import XCTest
@testable import Meeshy

/// **#3945 — le réveil silencieux écrit avant de rendre la main.**
///
/// Même classe de défaut que #3894, sur un chemin bien plus fréquent : là où la
/// révocation ne concernait qu'un push de service, celui-ci porte **chaque
/// message reçu app fermée**.
///
/// Ce que ces témoins gardent est en deux moitiés, et les deux comptent :
/// la RÈGLE (combien de temps le flush a le droit de prendre) s'éprouve comme
/// une fonction ; l'ORDRE (le flush précède `finish()`) ne s'éprouve que par la
/// source — `didReceiveRemoteNotification` n'est pas hostable en XCTest, et une
/// garde qui ne mesurerait que la règle laisserait l'appel disparaître du
/// délégué sans un mot.
final class SilentPushDurabilityTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_000_000)

    // MARK: - La règle

    func test_leFlush_prendSurLeBudgetRESTANT_moinsSaMarge() {
        let deadline = SilentPushDurability.flushDeadline(now: now, backgroundTimeRemaining: 3)
        XCTAssertEqual(
            deadline.timeIntervalSince(now), 2, accuracy: 0.001,
            "3 s restantes − 1 s de marge = 2 s au flush. La marge existe pour que `finish()` s'exécute "
                + "APRÈS la deadline du flush, et non pendant qu'iOS nous coupe."
        )
    }

    func test_leFlush_estPLAFONNE_memeQuandLeBudgetEstEntier() {
        let deadline = SilentPushDurability.flushDeadline(now: now, backgroundTimeRemaining: 25)
        XCTAssertEqual(
            deadline.timeIntervalSince(now), SilentPushDurability.cap, accuracy: 0.001,
            "Le flush ne doit pas devenir une seconde raison de tenir le processus éveillé : au-delà du "
                + "plafond, c'est un problème de volume, pas une durée à financer ici."
        )
    }

    func test_budgetEpuise_donneUneDeadlineDEJA_passee_etNonUneAttente() {
        for restant in [0.0, 0.5, 1.0] {
            let deadline = SilentPushDurability.flushDeadline(now: now, backgroundTimeRemaining: restant)
            XCTAssertLessThanOrEqual(
                deadline.timeIntervalSince(now), 0,
                "Avec \(restant) s restantes, il n'y a rien à financer : `flushAll(deadline:)` rend la "
                    + "main tout de suite. Servir une durée positive ferait attendre un flush qu'iOS va couper."
            )
        }
    }

    /// `backgroundTimeRemaining` vaut `.greatestFiniteMagnitude` hors tâche
    /// d'arrière-plan — et pendant les premières millisecondes qui suivent
    /// `beginBackgroundTask`. Le lire comme « du temps infini » ferait du flush
    /// une attente SANS BORNE sur le chemin qui doit précisément rendre la main.
    func test_budgetInfini_neSignifiePas_attenteInfinie() {
        let deadline = SilentPushDurability.flushDeadline(
            now: now, backgroundTimeRemaining: .greatestFiniteMagnitude
        )
        XCTAssertEqual(deadline.timeIntervalSince(now), SilentPushDurability.cap, accuracy: 0.001)

        let infini = SilentPushDurability.flushDeadline(now: now, backgroundTimeRemaining: .infinity)
        XCTAssertEqual(
            infini.timeIntervalSince(now), SilentPushDurability.cap, accuracy: 0.001,
            "`.infinity` n'est pas fini : même traitement, et surtout pas une deadline `.distantFuture`."
        )
    }

    // MARK: - L'ordre, qui ne s'éprouve que par la source

    /// **Le témoin qui rougit si on annule le correctif.** C'est le critère de
    /// fin que l'issue demande : « revert manuel → test rouge ».
    ///
    /// Il ne cherche pas la seule présence du flush — un flush écrit APRÈS
    /// `finish()` compilerait, passerait une garde de présence, et ne
    /// protégerait rien : le budget serait déjà rendu.
    func test_leFlush_precede_finish_dansLeDelegue() throws {
        let code = AppSourceGuard.stripComments(try appDelegateSource())

        guard let flush = code.range(of: "CacheCoordinator.shared.flushAll("),
              let finish = code.range(of: "state.finish()") else {
            return XCTFail(
                "Le flush ou le `finish()` du réveil silencieux est introuvable — la garde ne "
                    + "mesurerait RIEN. Si le chemin a bougé, la RE-POINTER, pas la supprimer."
            )
        }
        XCTAssertLessThan(
            flush.lowerBound, finish.lowerBound,
            "Le flush doit PRÉCÉDER `state.finish()`. Placé après, il s'exécuterait une fois le budget "
                + "d'arrière-plan rendu — donc peut-être jamais, ce qui est exactement le défaut #3945."
        )
        XCTAssertTrue(
            code.contains("await CacheCoordinator.shared.flushAll("),
            "… et il doit être ATTENDU. Un `Task { … }` détaché rendrait la main avant l'écriture — "
                + "la forme exacte que #3894 a dû corriger sur le canal de révocation."
        )
    }

    /// Le fusible : sans lui, la garde ci-dessus passerait au vert sur une
    /// source vide le jour où le chemin du fichier change.
    func test_laGardeLitBienLeDelegue() throws {
        let code = try appDelegateSource()
        XCTAssertGreaterThan(code.count, 5000)
        XCTAssertTrue(code.contains("didReceiveRemoteNotification"))
    }

    private func appDelegateSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/AppDelegate.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
