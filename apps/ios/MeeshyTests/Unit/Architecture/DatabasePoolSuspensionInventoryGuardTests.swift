import XCTest

/// **Un drapeau par POOL est un inventaire, et un inventaire se périme** (#7160).
///
/// `observesSuspensionNotifications` n'arme que le pool dont la configuration
/// le porte (`DatabasePool.setupSuspension`). #7059 l'a posé sur `AppDatabase`
/// et a laissé intact le pool que l'application ouvre sur
/// `meeshy_messages.sqlite` : le `0xDEAD10CC` est revenu à l'identique en build
/// **1827**, avec DEUX fils `GRDB.DatabasePool.writer` vivants au moment de la
/// suppression.
///
/// Le défaut n'était pas subtil, il était INVISIBLE : rien ne rougit quand un
/// pool s'ouvre sans le drapeau — ni la compilation, ni le démarrage, ni un
/// journal. Ça se voit sur l'appareil du porteur, trois semaines plus tard.
///
/// Cette garde est donc un RELEVÉ, pas une assertion sur deux fichiers connus :
/// elle balaye les sources et interroge ce qu'elle trouve. Le troisième pool
/// ajouté un jour la fera rougir le jour où il est écrit, pas le jour où il tue
/// l'application.
final class DatabasePoolSuspensionInventoryGuardTests: XCTestCase {

    /// La racine du dépôt, lue depuis CE fichier.
    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Architecture
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // <racine>
    }

    /// Les sources du PROCESSUS qui poste `Database.suspendNotification` :
    /// l'application et le SDK qu'elle embarque.
    ///
    /// `MeeshyNotificationExtension` en est ABSENT, et c'est une décision, pas
    /// un oubli : `NotificationCenter` ne traverse pas les processus, et rien
    /// dans l'extension ne poste la notification. Y armer la suspension par
    /// symétrie n'aurait aucun effet et ferait croire à une protection.
    private static let racines = [
        "apps/ios/Meeshy",
        "packages/MeeshySDK/Sources",
    ]

    private func sources() -> [(chemin: String, code: String)] {
        var trouvees: [(String, String)] = []
        for racine in Self.racines {
            let base = Self.repoRoot.appendingPathComponent(racine)
            guard let marcheur = FileManager.default.enumerator(
                at: base, includingPropertiesForKeys: nil
            ) else { continue }
            for cas in marcheur {
                guard let url = cas as? URL, url.pathExtension == "swift" else { continue }
                guard let brut = try? String(contentsOf: url, encoding: .utf8) else { continue }
                let relatif = url.path.replacingOccurrences(
                    of: Self.repoRoot.path + "/", with: ""
                )
                trouvees.append((relatif, AppSourceGuard.stripComments(brut)))
            }
        }
        return trouvees
    }

    /// **Le relevé doit trouver quelque chose.** Sans ce témoin, un chemin faux
    /// rendrait tous les autres verts en ne balayant rien.
    func test_leReleve_lit_desSourcesNonVides() {
        let fichiers = sources()
        XCTAssertGreaterThan(
            fichiers.count, 100,
            "Le relevé ne lit presque rien : les racines ont bougé, et les gardes ci-dessous sont vertes par omission."
        )
        XCTAssertTrue(
            fichiers.contains { $0.chemin.hasSuffix("Persistence/AppDatabase.swift") },
            "Le relevé doit atteindre les sources du SDK, pas seulement celles de l'app."
        )
    }

    /// **La règle.** Tout fichier qui OUVRE un `DatabasePool` doit l'armer.
    ///
    /// `DatabaseQueue` porte le MÊME drapeau (`DatabaseQueue.setupSuspension`)
    /// et le SDK en ouvre trois sur disque — brouillons de story, outbox
    /// d'engagement, outbox d'état de conversation. Elles sont volontairement
    /// hors de ce relevé : **aucun des six rapports d'appareil ne les nomme**
    /// (tous les fils fautifs portent `GRDB.DatabasePool.writer`), et les armer
    /// coûterait le brouillon en cours de l'utilisateur si une sauvegarde
    /// tombait dans la fenêtre de suspension. Ce serait la parade pire que le
    /// défaut, une troisième fois. La mesure d'abord : **#7192**.
    ///
    /// Le silence de cette garde sur les files n'est donc pas un oubli — il est
    /// écrit ici, et il a une issue.
    func test_toutPoolOuvertParLApplication_ecouteLaSuspension() {
        let coupables = sources()
            .filter { $0.code.contains("DatabasePool(") }
            .filter { !$0.code.contains("DatabaseSuspension.arm(") }
            .map(\.chemin)
            .sorted()

        XCTAssertTrue(
            coupables.isEmpty,
            """
            Ces fichiers ouvrent un `DatabasePool` sans armer la suspension :
            \(coupables.joined(separator: "\n"))

            `observesSuspensionNotifications` se pose PAR POOL. Un pool non armé \
            continue de prendre des verrous SQLite pendant que le processus se \
            suspend, et RunningBoard supprime l'application — `0xDEAD10CC`, \
            mesuré en build 1826 PUIS en build 1827 sur l'appareil du porteur.

            Le geste attendu est `DatabaseSuspension.arm(&configuration)` dans le \
            fichier qui construit la configuration. Si la configuration vient \
            d'ailleurs, c'est ce fichier-là qui doit l'armer — et c'est LUI qui \
            doit alors apparaître dans ce relevé.
            """
        )
    }

    /// **Et le drapeau ne se pose QUE par là.** Un site qui l'écrirait à la main
    /// resterait hors du relevé ci-dessus le jour où la règle change (un
    /// `arm(_:)` qui ferait plus que poser un booléen, par exemple), et la
    /// divergence recommencerait exactement comme entre #7059 et #7160.
    func test_leDrapeau_neSePose_queParDatabaseSuspension() {
        let horsSite = sources()
            .filter { $0.code.contains("observesSuspensionNotifications") }
            .filter { !$0.chemin.hasSuffix("Persistence/DatabaseSuspension.swift") }
            .map(\.chemin)
            .sorted()

        XCTAssertTrue(
            horsSite.isEmpty,
            """
            Ces fichiers posent `observesSuspensionNotifications` eux-mêmes :
            \(horsSite.joined(separator: "\n"))

            Le drapeau a UN poseur, `DatabaseSuspension.arm(_:)`. Recopié sur \
            chaque site d'ouverture, il redevient l'inventaire qui a déjà \
            divergé une fois (#7160).
            """
        )
    }
}
