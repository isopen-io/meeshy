import Foundation
import MeeshySDK

/// **Ce que le premier écran attend, lancé hors du fil principal dès l'entrée du processus** (#11558, #11587).
///
/// Le premier rendu de la liste a besoin du trousseau (clé de la base, compte
/// actif, liste des comptes, session), du conteneur du groupe d'app (où vit la
/// base) et du client REST (construit par `AuthManager`). Chacun coûte un
/// aller-retour XPC synchrone — `securityd`, `containermanagerd`, `cfprefsd` —
/// que le fil principal payait en série. Lancés ici, avant `UIApplicationMain`,
/// ils courent pendant que UIKit monte la scène ; le fil principal ne fait plus
/// que ramasser des réponses déjà arrivées, et n'attend jamais plus longtemps
/// que la lecture elle-même.
///
/// Rien de ce qui est lu ici ne survit au processus, et rien ne part sous
/// XCTest : les témoins gardent le trousseau qu'ils posent eux-mêmes.
enum LaunchPrefetch {
    /// `starters` lancent leur propre travail sur leur file et rendent la main
    /// aussitôt : appelés ici, en synchrone, ils sont EN VOL avant que le premier
    /// lecteur ne les demande — sans quoi il lirait lui-même, sur le fil principal.
    /// `offMain` s'exécutent sur une file à part.
    nonisolated struct Steps: Sendable {
        let starters: [@Sendable () -> Void]
        let offMain: [@Sendable () -> Void]

        static let production = Steps(
            starters: [
                { KeychainManager.shared.prefetchColdStartSession() },
                { AppGroupContainer.prefetch() },
            ],
            offMain: [
                { _ = APIClient.shared },
            ]
        )
    }

    private static let queue = DispatchQueue(label: "me.meeshy.launch.prefetch", qos: .userInitiated, attributes: .concurrent)

    static func start(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        steps: Steps = .production
    ) {
        guard !AppDatabase.runsUnderTestHarness(environment: environment) else { return }
        steps.starters.forEach { $0() }
        steps.offMain.forEach { step in queue.async(execute: step) }
    }
}

/// Le conteneur du groupe d'app, résolu UNE fois par processus et hors du fil
/// principal quand `LaunchPrefetch` l'a lancé (#11558). Jamais gardé d'un
/// lancement à l'autre : un chemin périmé ouvrirait une base vide.
nonisolated enum AppGroupContainer {
    static let identifier = "group.me.meeshy.apps"

    private static let resolution = PrefetchedValue<URL?> {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }

    static func prefetch() {
        resolution.start(on: .global(qos: .userInitiated))
    }

    static var url: URL? { resolution.value() }
}
