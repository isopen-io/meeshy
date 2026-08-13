import Foundation
import XCTest
@testable import Meeshy

/// Confrontation mécanique des `meeshy://` ÉCRITS À LA MAIN avec la table de
/// routage réelle.
///
/// Le widget et les App Shortcuts composent leurs URL par interpolation, dans
/// des cibles qui n'importent pas `DeepLinkParser`. Le compilateur les valide,
/// les tests du widget ne les atteignent pas, ceux du routeur ne les
/// connaissent pas : un host qui n'existe dans la table de personne se tape
/// sans rien faire, indéfiniment, sans qu'aucun test ne rougisse.
///
/// Cette garde ferme la boucle : elle EXTRAIT les hosts réellement émis et
/// exige de chacun une classification explicite — routé (avec une URL témoin
/// qui doit résoudre) ou délibérément non routé (avec sa raison). Un nouveau
/// host apparu dans un widget fait rougir l'égalité d'ensembles, donc oblige à
/// trancher au lieu de laisser filer.
@MainActor
final class DeepLinkSurfaceRoutingGuardTests: XCTestCase {

    // MARK: - Classification (relue à chaque évolution des surfaces)

    /// Host → URL témoin qui DOIT résoudre vers une destination in-app.
    /// La forme du témoin est celle réellement émise par la surface.
    private static let routedHosts: [String: String] = [
        "conversation": "meeshy://conversation/conv1",
        "contact": "meeshy://contact/conv1",
        "quickreply": "meeshy://quickreply/conv1?text=OK",
        "send": "meeshy://send?contactId=conv1&message=Salut"
    ]

    /// Hosts émis SANS destination, et pourquoi ils le restent. Chacun demande
    /// une surface produit qui n'existe pas aujourd'hui — les brancher sur une
    /// destination approximative serait pire que l'inaction actuelle.
    private static let deliberatelyUnroutedHosts: Set<String> = [
        // `meeshy://conversations/recent` et `…/unread` (fond des widgets
        // Conversations récentes / Non lus, et App Shortcut « Open Recent
        // Conversation »). « Récente » et « non lue » désignent une
        // conversation que seul l'app-side sait élire ; aucune destination
        // `DeepLink` ne porte cette élection aujourd'hui.
        "conversations",
        // `meeshy://call/mute`, `meeshy://call/end` (boutons de la Live
        // Activity) et `meeshy://call?contactId=…&type=…` (App Shortcut
        // « Call Contact »). Les deux premiers sont hors d'atteinte : le
        // démarrage d'une Live Activity passe par `LiveActivityBridge`, encore
        // un stub. Le troisième demande l'amorçage d'un appel depuis un lien.
        "call",
        // `meeshy://translate?text=…&target=…` (App Shortcut « Translate
        // Text »). Traduire un texte ARBITRAIRE — hors de toute conversation —
        // n'a pas d'écran dans l'app.
        "translate"
    ]

    // MARK: - Surfaces auditées

    private var iosDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Navigation
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    /// Les deux cibles qui écrivent des `meeshy://` à la main sans lier le
    /// routeur : l'extension widget, et les App Intents (compilés dans l'app
    /// mais qui composent leur URL par interpolation, comme le widget).
    private func handwrittenSources() throws -> [(name: String, code: String)] {
        let widgetFiles = try FileManager.default.contentsOfDirectory(
            at: iosDirectory.appendingPathComponent("MeeshyWidgets", isDirectory: true),
            includingPropertiesForKeys: nil
        ).filter { $0.pathExtension == "swift" }

        let intents = iosDirectory
            .appendingPathComponent("Meeshy/Features/Intents/MeeshyAppIntents.swift")

        return try (widgetFiles + [intents]).map {
            (name: $0.lastPathComponent, code: try String(contentsOf: $0, encoding: .utf8))
        }
    }

    /// Retire les commentaires `//` et `/* */`. Les littéraux de chaîne sont
    /// CONSERVÉS : c'est précisément là que vivent les URL cherchées.
    ///
    /// **`://` n'ouvre pas un commentaire.** Un découpeur naïf traite les deux
    /// barres de `meeshy://` comme un `//` de fin de ligne et efface l'URL
    /// elle-même — la garde ne trouverait plus rien et passerait au vert en
    /// n'ayant RIEN vérifié. `test_everyHandwrittenHost_isClassified` refuse
    /// explicitement un balayage vide pour cette raison.
    private func strippingComments(_ source: String) -> String {
        var output = ""
        var cursor = source.startIndex
        var inLineComment = false
        var inBlockComment = false

        while cursor < source.endIndex {
            let remaining = source[cursor...]
            if inLineComment {
                if source[cursor] == "\n" { inLineComment = false; output.append("\n") }
                cursor = source.index(after: cursor)
                continue
            }
            if inBlockComment {
                if remaining.hasPrefix("*/") {
                    inBlockComment = false
                    cursor = source.index(cursor, offsetBy: 2)
                    continue
                }
                cursor = source.index(after: cursor)
                continue
            }
            if remaining.hasPrefix("//"), output.last != ":" {
                inLineComment = true
                cursor = source.index(cursor, offsetBy: 2)
                continue
            }
            if remaining.hasPrefix("/*") {
                inBlockComment = true
                cursor = source.index(cursor, offsetBy: 2)
                continue
            }
            output.append(source[cursor])
            cursor = source.index(after: cursor)
        }
        return output
    }

    private func emittedHosts() throws -> Set<String> {
        let pattern = try NSRegularExpression(pattern: "meeshy://([A-Za-z]+)")
        var hosts: Set<String> = []

        for file in try handwrittenSources() {
            let code = strippingComments(file.code)
            let range = NSRange(code.startIndex..., in: code)
            for match in pattern.matches(in: code, range: range) {
                guard let hostRange = Range(match.range(at: 1), in: code) else { continue }
                hosts.insert(String(code[hostRange]).lowercased())
            }
        }
        return hosts
    }

    // MARK: - Gardes

    /// Tout host émis est classé. Un widget qui invente `meeshy://reaction/…`
    /// fait rougir ici, au lieu de livrer un bouton inerte.
    func test_everyHandwrittenHost_isClassified() throws {
        let emitted = try emittedHosts()
        let classified = Set(Self.routedHosts.keys).union(Self.deliberatelyUnroutedHosts)

        XCTAssertFalse(emitted.isEmpty, "Aucune URL meeshy:// trouvée — le balayage ne lit plus les bonnes sources")
        XCTAssertTrue(
            emitted.subtracting(classified).isEmpty,
            "Hosts émis mais non classés : \(emitted.subtracting(classified).sorted()) — router, ou justifier dans deliberatelyUnroutedHosts"
        )
    }

    /// L'inverse : une classification qui ne correspond plus à aucune surface
    /// est du bruit qui périme la garde. Elle doit être retirée avec le code
    /// qui l'a motivée.
    func test_noClassifiedHost_isOrphaned() throws {
        let emitted = try emittedHosts()
        let classified = Set(Self.routedHosts.keys).union(Self.deliberatelyUnroutedHosts)

        XCTAssertTrue(
            classified.subtracting(emitted).isEmpty,
            "Hosts classés mais plus émis par aucune surface : \(classified.subtracting(emitted).sorted())"
        )
    }

    /// Le cœur du sujet : chaque host déclaré routé résout VRAIMENT. Une
    /// régression du parseur (case supprimé, host renommé) rougit ici même si
    /// la surface émettrice n'a pas bougé.
    func test_everyRoutedHost_resolvesToAnInAppDestination() {
        for (host, sample) in Self.routedHosts {
            let url = URL(string: sample)!
            let destination = DeepLinkParser.parse(url)

            if case .external = destination {
                XCTFail("meeshy://\(host) est déclaré routé mais \(sample) retombe sur .external")
                continue
            }

            // Brouillons isolés : le témoin `quickreply`/`send` DÉPOSE un
            // brouillon, et la garde n'a pas à écrire dans les défauts du
            // simulateur pour vérifier un routage.
            let defaults = UserDefaults(suiteName: "DeepLinkSurfaceRoutingGuard.\(UUID().uuidString)")!
            let router = DeepLinkRouter(
                drafts: DraftStore(userDefaults: defaults, userIdProvider: { "guard" })
            )
            XCTAssertTrue(
                router.handle(url: url),
                "meeshy://\(host) est résolu par le parseur mais refusé par le routeur (\(sample))"
            )
        }
    }

    /// Même famille de défaut, sur la clé plutôt que sur l'URL : `ContactQuery`
    /// lisait `contacts`, qu'aucun écrivain du dépôt ne pose. Un raccourci
    /// enregistré perdait donc son destinataire au deuxième lancement — sans
    /// erreur, une liste vide étant un résultat valide.
    func test_appIntents_doNotReadTheOrphanContactsKey() throws {
        let intents = try String(
            contentsOf: iosDirectory
                .appendingPathComponent("Meeshy/Features/Intents/MeeshyAppIntents.swift"),
            encoding: .utf8
        )

        XCTAssertFalse(
            strippingComments(intents).contains("forKey: \"contacts\""),
            "personne n'écrit la clé App Group « contacts » ; les contacts viennent de favorite_contacts"
        )
        XCTAssertTrue(
            strippingComments(intents).contains("forKey: \"favorite_contacts\""),
            "la seule clé de contacts réellement écrite doit rester lue"
        )
    }

    /// Symétrie : un host déclaré NON routé ne doit pas l'être en douce. Si
    /// quelqu'un le branche, c'est la déclaration qu'il faut mettre à jour —
    /// sinon la liste des trous connus ment.
    func test_everyDeliberatelyUnroutedHost_stillHasNoDestination() {
        let samples = [
            "conversations": "meeshy://conversations/recent",
            "call": "meeshy://call/end",
            "translate": "meeshy://translate?text=bonjour&target=es"
        ]

        for host in Self.deliberatelyUnroutedHosts {
            guard let sample = samples[host] else {
                XCTFail("Host non routé '\(host)' sans URL témoin — ajouter le témoin avec la déclaration")
                continue
            }
            let destination = DeepLinkParser.parse(URL(string: sample)!)
            guard case .external = destination else {
                XCTFail("meeshy://\(host) est désormais routé (\(destination)) — le retirer de deliberatelyUnroutedHosts")
                continue
            }
        }
    }
}
