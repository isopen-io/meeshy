import XCTest
@testable import MeeshyUI

/// **Un rendu à la fois, hors du fil principal, le dernier demandé gagne** (#9873).
///
/// La boucle d'un curseur : le rendu ne tombe jamais sur le MainActor, sa
/// livraison y revient, et les crans arrivés pendant un rendu se replient sur
/// le dernier — aucun rendu périmé ne s'empile sur le GPU.
@MainActor
final class LatestWinsRenderLoopTests: XCTestCase {

    /// Les fils où les rendus ont tourné, relevés hors du MainActor.
    private final class Releve: @unchecked Sendable {
        private let verrou = NSLock()
        private var valeurs: [Int] = []
        private var principal: [Bool] = []

        func noter(_ valeur: Int, surLeFilPrincipal: Bool) {
            verrou.lock()
            valeurs.append(valeur)
            principal.append(surLeFilPrincipal)
            verrou.unlock()
        }

        var rendus: [Int] {
            verrou.lock()
            defer { verrou.unlock() }
            return valeurs
        }

        var fils: [Bool] {
            verrou.lock()
            defer { verrou.unlock() }
            return principal
        }
    }

    @MainActor
    private final class Livraisons {
        var requetes: [Int] = []
        var sorties: [Int] = []
        var surLeFilPrincipal: [Bool] = []
    }

    private func boucle(_ releve: Releve, _ livraisons: Livraisons,
                        porte: DispatchSemaphore? = nil) -> LatestWinsRenderLoop<Int, Int> {
        LatestWinsRenderLoop<Int, Int>(
            render: { valeur in
                releve.noter(valeur, surLeFilPrincipal: Thread.isMainThread)
                if valeur == 1 { porte?.wait() }
                return valeur * 10
            },
            deliver: { requete, sortie in
                livraisons.requetes.append(requete)
                livraisons.sorties.append(sortie)
                livraisons.surLeFilPrincipal.append(Thread.isMainThread)
            })
    }

    func test_leRendu_tourneHorsDuFilPrincipal_etSaLivraisonYRevient() async throws {
        let releve = Releve()
        let livraisons = Livraisons()
        let sut = boucle(releve, livraisons)

        sut.submit(4)

        try await StoryVideoAdjustmentsRenderTests.attendre { livraisons.sorties == [40] }
        XCTAssertEqual(releve.fils, [false], "le rendu d'un cran ne tombe jamais sur le fil principal")
        XCTAssertEqual(livraisons.surLeFilPrincipal, [true], "le résultat se pose sur le MainActor")
    }

    func test_soumettre_neRendRienDansLAppel() {
        let releve = Releve()
        let livraisons = Livraisons()
        let sut = boucle(releve, livraisons)

        sut.submit(4)

        XCTAssertTrue(sut.isBusy)
        XCTAssertTrue(livraisons.sorties.isEmpty, "l'appel rend la main avant tout rendu : le geste ne l'attend pas")
    }

    func test_lesCransArrivesPendantUnRendu_seReplientSurLeDernier() async throws {
        let porte = DispatchSemaphore(value: 0)
        let releve = Releve()
        let livraisons = Livraisons()
        let sut = boucle(releve, livraisons, porte: porte)

        sut.submit(1)
        try await StoryVideoAdjustmentsRenderTests.attendre { releve.rendus == [1] }
        sut.submit(2)
        sut.submit(3)
        sut.submit(4)
        porte.signal()

        try await StoryVideoAdjustmentsRenderTests.attendre { livraisons.requetes == [1, 4] }
        try await StoryVideoAdjustmentsRenderTests.attendre { !sut.isBusy }
        XCTAssertEqual(releve.rendus, [1, 4], "les crans 2 et 3 ne coûtent aucun rendu")
        XCTAssertEqual(livraisons.sorties, [10, 40], "chaque rendu terminé est livré, dans l'ordre")
    }

    func test_uneBoucleRevenueAuRepos_rendLaDemandeSuivante() async throws {
        let releve = Releve()
        let livraisons = Livraisons()
        let sut = boucle(releve, livraisons)

        sut.submit(2)
        try await StoryVideoAdjustmentsRenderTests.attendre { !sut.isBusy }
        sut.submit(3)

        try await StoryVideoAdjustmentsRenderTests.attendre { livraisons.requetes == [2, 3] }
    }

    func test_oublierLaDemandeEnAttente_laisseLivrerLeRenduEnVol() async throws {
        let porte = DispatchSemaphore(value: 0)
        let releve = Releve()
        let livraisons = Livraisons()
        let sut = boucle(releve, livraisons, porte: porte)

        sut.submit(1)
        try await StoryVideoAdjustmentsRenderTests.attendre { releve.rendus == [1] }
        sut.submit(2)
        sut.discardPending()
        porte.signal()

        try await StoryVideoAdjustmentsRenderTests.attendre { !sut.isBusy }
        XCTAssertEqual(livraisons.requetes, [1])
        XCTAssertEqual(releve.rendus, [1])
    }
}
