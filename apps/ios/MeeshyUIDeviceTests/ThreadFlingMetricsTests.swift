import XCTest

/// **Le fling du fil se mesure sur appareil RÉEL (#3950).**
///
/// La partie IDLE de l'audit de fluidité (#3917) a pu être mesurée au Time
/// Profiler ; la partie GESTE ne l'a pas pu, faute d'un moyen de produire un
/// geste sur un iPhone connecté. Ce qui a été essayé et écarté le 2026-08-27 :
/// `xcrun devicectl` (aucune sous-commande d'entrée tactile), `idb` (ne voit
/// que les simulateurs), `simctl` (simulateurs uniquement — et `CLAUDE.md`
/// § Pilotage interdit de conclure sur le simulateur seul pour la fluidité),
/// les liens profonds (ouvrent, ne défilent pas).
///
/// Le seul moyen supporté par Apple de produire un `swipe` sur un appareil est
/// un bundle XCUITest. C'est ce que cette cible est.
///
/// **Elle ne tourne pas dans le gate.** Le scheme `Meeshy` reste câblé sur
/// `MeeshyTests` seul : une mesure de fluidité au simulateur ne veut rien dire,
/// et une cible UI dans le gate le rendrait long et instable. Elle s'exécute à
/// la demande, sur son propre scheme :
///
/// ```
/// xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme MeeshyDeviceMetrics \
///   -destination "platform=iOS,id=<udid>" -allowProvisioningUpdates \
///   -resultBundlePath /tmp/fling.xcresult
/// ```
///
/// Le `.xcresult` porte alors les trois métriques Apple — hitches de
/// décélération, croissance mémoire après `pop`, CPU — et la mesure devient un
/// CHIFFRE rejouable plutôt qu'une lecture d'écran.
/// `nonisolated` : le projet compile en isolation MainActor par DÉFAUT (Swift 6.2),
/// et `XCTestCase` déclare `setUp()`, `init(invocation:)` et consorts comme
/// `nonisolated`. Sans ce modificateur, chaque override change l'isolation de
/// ce qu'il redéfinit et la cible ne compile pas — un défaut que le gate ne
/// peut PAS voir, puisque cette cible est délibérément hors du scheme `Meeshy`.
/// C'est la contrepartie de l'avoir sortie du gate, et elle se paie ici.
nonisolated final class ThreadFlingMetricsTests: XCTestCase {

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    /// Le fling soutenu, dans les deux sens, sur la conversation ouverte.
    ///
    /// `scrollDecelerationMetric` est la métrique qui porte le SYMPTÔME : elle
    /// compte les hitches pendant la décélération, c'est-à-dire exactement le
    /// moment où une cellule qui entre à sa mauvaise hauteur se rétracte
    /// (#4041). Les deux autres accompagnent : la mémoire dit ce que le fil
    /// RETIENT, le CPU ce qu'il brûle pour poser une image.
    func test_sustainedFling_reportsHitchesMemoryAndCPU() throws {
        let app = try openBusiestThread()

        measure(metrics: [
            XCTOSSignpostMetric.scrollDecelerationMetric,
            XCTMemoryMetric(application: app),
            XCTCPUMetric(application: app)
        ]) {
            let thread = app.collectionViews.firstMatch
            for _ in 0..<4 {
                thread.swipeUp(velocity: .fast)
            }
            for _ in 0..<4 {
                thread.swipeDown(velocity: .fast)
            }
        }
    }

    /// Ce que la mesure du fling ne dit pas : ce que le fil LAISSE derrière lui.
    /// Un `pop` puis un retour, répétés, révèlent une rétention que le seul
    /// défilement ne montre pas (dimension 3 de la roadmap).
    func test_openingAndPoppingTheThread_doesNotGrowMemory() throws {
        let app = try openBusiestThread()

        measure(metrics: [XCTMemoryMetric(application: app)]) {
            app.navigationBars.buttons.element(boundBy: 0).tap()
            _ = app.collectionViews.firstMatch.waitForExistence(timeout: 5)
            app.collectionViews.cells.element(boundBy: 0).tap()
            _ = app.collectionViews.firstMatch.waitForExistence(timeout: 5)
        }
    }

    // MARK: - Mise en place

    /// Lance l'app et ouvre la première conversation de la liste.
    ///
    /// Le test SAUTE plutôt que d'échouer quand l'appareil n'est pas connecté
    /// à un compte : un rouge signifierait « le fling a régressé », et ce
    /// serait faux. Un skip dit ce qui est vrai — la mesure n'a pas pu être
    /// prise.
    ///
    /// Les identifiants ne sont JAMAIS dans le dépôt : ils viennent de
    /// l'environnement du processus de test (`apps/ios/fastlane/.env`, hors
    /// dépôt, ou les secrets GitHub Actions — cf. `apps/ios/fastlane/SECRETS.md`).
    private func openBusiestThread() throws -> XCUIApplication {
        let app = XCUIApplication()
        app.launch()

        try signInIfNeeded(app)

        let list = app.collectionViews.firstMatch
        guard list.waitForExistence(timeout: 20) else {
            throw XCTSkip("Aucune liste de conversations à l'écran — l'appareil n'est pas dans l'état attendu.")
        }
        let firstThread = app.collectionViews.cells.element(boundBy: 0)
        guard firstThread.waitForExistence(timeout: 10) else {
            throw XCTSkip("Le compte de test n'a aucune conversation : rien à faire défiler.")
        }
        firstThread.tap()

        guard app.collectionViews.firstMatch.waitForExistence(timeout: 15) else {
            throw XCTSkip("Le fil ne s'est pas ouvert dans le délai imparti.")
        }
        return app
    }

    private func signInIfNeeded(_ app: XCUIApplication) throws {
        let username = app.textFields.firstMatch
        guard username.waitForExistence(timeout: 5) else { return }   // déjà connecté

        let environment = ProcessInfo.processInfo.environment
        guard let user = environment["DEMO_USER"], let password = environment["DEMO_PASSWORD"] else {
            throw XCTSkip(
                "L'app demande une connexion et DEMO_USER / DEMO_PASSWORD ne sont pas dans "
                + "l'environnement. Les charger depuis apps/ios/fastlane/.env (hors dépôt) avant "
                + "de lancer la mesure — jamais les écrire ici."
            )
        }

        username.tap()
        username.typeText(user)
        let secure = app.secureTextFields.firstMatch
        secure.tap()
        secure.typeText(password)
        app.buttons.matching(NSPredicate(format: "isEnabled == true")).firstMatch.tap()
    }
}
