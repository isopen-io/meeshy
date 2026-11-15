import XCTest
@testable import MeeshyUI

/// Le contrat de `Debouncer` (#7034) : **un seul apaisement vivant à la fois**,
/// et une action qui ne part que si personne ne l'a réarmée entre-temps.
///
/// Ces témoins mesurent le CONTRAT. La propriété que le type existe pour
/// garantir — qu'aucune chaîne de `DispatchWorkItem` ne se forme — n'est pas
/// mesurable ici : il faudrait ~3 000 maillons et une vraie pile de 1008 Ko pour
/// la voir tomber, ce qui est le plantage lui-même. C'est la garde
/// `NoWorkItemInViewStateGuardTests` qui interdit sa condition nécessaire, en
/// lisant la source.
final class DebouncerTests: XCTestCase {

    func test_uneActionArmee_partApresSonDelai() {
        let d = Debouncer()
        let partie = expectation(description: "l'action différée s'exécute")
        d.arm(after: 0.02) { partie.fulfill() }
        wait(for: [partie], timeout: 2)
    }

    func test_unREARMEMENT_annuleLePrecedent_uneSeuleActionPart() {
        let d = Debouncer()
        let premiere = expectation(description: "la PREMIÈRE action ne doit PAS partir")
        premiere.isInverted = true
        let seconde = expectation(description: "la seconde action part")

        d.arm(after: 0.05) { premiere.fulfill() }
        d.arm(after: 0.05) { seconde.fulfill() }

        wait(for: [premiere, seconde], timeout: 2)
    }

    func test_annuler_empecheLActionDePartir() {
        let d = Debouncer()
        let jamais = expectation(description: "une action annulée ne part pas")
        jamais.isInverted = true

        d.arm(after: 0.05) { jamais.fulfill() }
        d.cancel()

        wait(for: [jamais], timeout: 1)
    }

    /// **Au plus UN work item retenu.** C'est la moitié mesurable de la
    /// propriété anti-chaîne : le debouncer lui-même ne cumule pas. L'autre
    /// moitié — qu'aucun BLOC ne retienne un work item — est structurelle.
    func test_apresMilleArmements_unSEULworkItemEstRetenu() {
        let d = Debouncer()
        var dernier: DispatchWorkItem?
        for _ in 0..<1000 {
            d.arm(after: 30) { }
            let courant = d.pendingForTests
            XCTAssertFalse(
                courant === dernier,
                "Chaque armement doit produire un NOUVEAU work item, sinon la mesure ne dit rien."
            )
            dernier = courant
        }
        XCTAssertTrue(
            d.pendingForTests === dernier,
            """
            Le debouncer ne retient pas le DERNIER work item armé : il en garde \
            un autre, donc il en cumule. C'est la forme qui produit la chaîne \
            de #7034.
            """
        )
        d.cancel()
        XCTAssertNil(d.pendingForTests, "Annuler doit relâcher le work item retenu.")
    }

    func test_laDeinit_annuleLApaisementEnAttente() {
        let jamais = expectation(description: "un debouncer détruit ne laisse pas partir son action")
        jamais.isInverted = true
        do {
            let d = Debouncer()
            d.arm(after: 0.05) { jamais.fulfill() }
        }
        wait(for: [jamais], timeout: 1)
    }
}
