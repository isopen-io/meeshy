import XCTest
import Combine
@testable import Meeshy

/// La scène de vitrine (#8855) ne s'ouvre qu'une fois la racine découverte : posté sous le voile
/// du lancement, l'ordre d'ouverture n'aurait encore aucun abonné, et « prêt » tomberait sur la
/// liste.
@MainActor
final class VitrineStageTests: XCTestCase {
    func test_attendreLaRacine_returnsOnlyOnceTheLaunchVeilIsGone() async {
        let voile = LaunchSplashController(elapsed: { .seconds(10) }, sleep: { _ in })
        let attente = Task { @MainActor in
            let ouvert = await VitrineStage.attendreLaRacine(voile.$phase.values)
            return (ouvert, voile.phase)
        }
        for _ in 0..<5 { await Task.yield() }
        XCTAssertEqual(voile.phase, .covering)

        await voile.markReady()

        let (ouvert, phaseALOuverture) = await attente.value
        XCTAssertTrue(ouvert)
        XCTAssertEqual(phaseALOuverture, .gone)
    }
}
