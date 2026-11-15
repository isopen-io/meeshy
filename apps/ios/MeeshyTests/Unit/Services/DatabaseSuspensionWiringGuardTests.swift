import XCTest

/// **La base se ferme aux verrous en DERNIER, et se rouvre en PREMIER** (#7059).
///
/// `observesSuspensionNotifications` ne fait rien tant que personne ne poste les
/// notifications : le drapeau arme un mécanisme, le câblage le déclenche. Cette
/// garde mesure le câblage, et surtout son ORDRE — c'est lui qui est fragile.
///
/// Une garde de SOURCE, parce que la règle EST un ordre d'appels dans une
/// méthode de cycle de vie : un témoin de comportement devrait jouer
/// `enterBackground()` en entier — sockets, cache, tâches BG, maintenance — pour
/// observer deux notifications, et mesurerait alors tout sauf la règle.
///
/// Les trois sites, et pourquoi chacun compte :
///
/// - **fin de `enterBackground`** : suspendre plus TÔT ferait échouer les steps
///   qui écrivent, `db.maintenance` en tête, en `SQLITE_INTERRUPT` ;
/// - **gestionnaire d'expiration de `beginBackgroundTask`** : c'est l'instant où
///   l'OS annonce la suspension, donc l'instant exact du `0xDEAD10CC` ;
/// - **début de `resumeFromBackground`** : une reprise tardive laisse les
///   consommateurs NSE écrire sur une base encore fermée — l'application
///   paraîtrait muette au réveil, ce qui se diagnostique plus mal qu'un
///   plantage.
final class DatabaseSuspensionWiringGuardTests: XCTestCase {

    private func coordinateur() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift")
        )
    }

    func test_lEntreeEnArrierePlan_suspendLaBase() throws {
        let code = try coordinateur()
        XCTAssertTrue(
            code.contains("DatabaseSuspension.suspend()"),
            """
            L'entrée en arrière-plan ne suspend pas la base. Sans cet appel, \
            `observesSuspensionNotifications` est un drapeau que personne ne \
            déclenche, et un travail en cours sur `DatabasePool.writer` retient \
            son verrou pendant la suspension — le kill 0xDEAD10CC mesuré cinq \
            fois sur l'appareil du porteur (#7059).
            """
        )
    }

    func test_laSuspension_vientAPRESToutCeQuiEcrit() throws {
        let code = try coordinateur()
        // Il y a DEUX suspensions, et c'est voulu : celle du gestionnaire
        // d'expiration est déclarée en tête de méthode, avant tous les steps.
        // La règle porte sur la suspension du chemin NOMINAL — donc sur la
        // DERNIÈRE. Chercher la première mesurait la déclaration du
        // gestionnaire et rendait la règle insatisfiable.
        let suspension = try XCTUnwrap(
            code.range(of: "DatabaseSuspension.suspend()", options: .backwards),
            "Le chemin nominal doit suspendre la base."
        )
        let maintenance = try XCTUnwrap(
            code.range(of: "db.maintenance"),
            "Le step de maintenance doit exister — c'est le dernier écrivain de la transition."
        )
        XCTAssertTrue(
            maintenance.lowerBound < suspension.lowerBound,
            """
            La base est suspendue AVANT le step de maintenance. Celui-ci écrit \
            (`incremental_vacuum`, `optimize`) : il échouerait en \
            SQLITE_INTERRUPT à chaque passage en arrière-plan. La suspension est \
            le DERNIER geste avant de rendre la garde, jamais un geste d'ouverture.
            """
        )
    }

    func test_leGestionnaireDExpiration_suspendAvantDeRendreLaGarde() throws {
        let code = try coordinateur()
        let handler = try XCTUnwrap(
            code.range(of: "beginBackgroundTask"),
            "La transition doit toujours s'exécuter sous une garde beginBackgroundTask."
        )
        let apres = String(code[handler.lowerBound...].prefix(900))
        XCTAssertTrue(
            apres.contains("DatabaseSuspension.suspend()"),
            """
            Le gestionnaire d'expiration ne suspend pas la base. C'est pourtant \
            LE cas du défaut : l'OS annonce qu'il va geler le processus, et ce \
            qui roule encore sur la file d'écriture tient son verrou pendant le \
            gel. L'appel doit y être SYNCHRONE — un `Task { }` n'est pas garanti \
            de s'exécuter avant le gel.
            """
        )
    }

    func test_leRetourAuPremierPlan_reprendLaBase_avantTouteEcriture() throws {
        let code = try coordinateur()
        let reprise = try XCTUnwrap(
            code.range(of: "DatabaseSuspension.resume()"),
            """
            Le retour au premier plan ne reprend pas la base. Une suspension qui \
            ne se lève jamais ne plante pas : elle rend l'application incapable \
            d'enregistrer quoi que ce soit pour le reste de la session.
            """
        )
        let premierConsommateur = try XCTUnwrap(
            code.range(of: "nse.consumePending"),
            "Le premier consommateur du réveil doit exister."
        )
        XCTAssertTrue(
            reprise.lowerBound < premierConsommateur.lowerBound,
            """
            La base est reprise APRÈS le premier consommateur, qui grave en base \
            dès sa première ligne. Ses écritures tomberaient en SQLITE_INTERRUPT \
            et les messages arrivés par l'extension seraient perdus au réveil.
            """
        )
    }
}
