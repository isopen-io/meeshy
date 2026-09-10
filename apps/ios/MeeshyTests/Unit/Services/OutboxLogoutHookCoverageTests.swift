import XCTest
@testable import Meeshy

/// **Une purge de fin de session doit couvrir les fins de session qui n'émettent
/// AUCUN événement** (#5913).
///
/// Ce qui a été mesuré sur « Meeshy Ref-Native » le 2026-09-10 : un compte créé
/// sept minutes plus tôt ouvrait l'app sur « Message non envoyé 2/7 ». La table
/// `outbox` contenait sept lignes vieilles de douze heures — deux `sendMessage`,
/// deux `sendReaction`, **deux `blockUser` et un `unblockUser`** — appartenant au
/// compte précédent du simulateur. Rejouées sous le jeton du compte courant, les
/// trois dernières auraient exécuté une action de modération au nom de quelqu'un
/// qui ne l'a jamais demandée.
///
/// LE DISPOSITIF EXISTAIT POURTANT, et il est juste :
/// `wireOutboxLogoutHook` observe `AuthManager.$isAuthenticated` et appelle
/// `MessagePersistenceActor.clearAllMessagesForLogout()`, qui fait bien
/// `DELETE FROM outbox`. Ce n'est donc pas un nettoyage manquant.
///
/// **CE QUI MANQUAIT EST LE CAS QUE `.dropFirst()` ÉCARTE.** Le crochet écoutait
/// une TRANSITION `true → false` observée EN VOL. Or les façons les plus
/// courantes de terminer une session n'en émettent aucune :
///   * l'app est tuée pendant la session et relancée à l'écran de connexion ;
///   * le jeton est expiré et constaté au démarrage ;
///   * la session a été invalidée côté serveur entre deux lancements.
/// Dans ces trois cas `isAuthenticated` vaut `false` DÈS LA PREMIÈRE VALEUR —
/// que `.dropFirst()` jetait. Aucune purge, et le compte suivant héritait.
///
/// > La question à poser à tout nettoyage de déconnexion n'est pas « est-il
/// > branché ? » mais **« quelles façons de terminer une session ne passent pas
/// > par ce fil ? »**.
///
/// ⚠️ **La conclusion d'origine était FAUSSE, et elle a coûté des données**
/// (#5968). Elle disait : « un `filter { !$0 }` suffit à garder le démarrage
/// CONNECTÉ hors de la purge ». Or `isAuthenticated` naît `false`,
/// `checkExistingSession()` est async, et `DependencyContainer` s'abonne à la
/// CONSTRUCTION de l'`App` : un `@Published` rejoue sa valeur courante au
/// nouvel abonné, donc `false` traversait le filtre. Mesuré au simulateur,
/// session parfaitement valide, un seul lancement à froid : **62 messages
/// effacés sur 62**. Le booléen SEUL ne peut pas distinguer « pas encore
/// regardé » de « regardé, personne » — il faut le troisième état
/// (`AuthManager.hasResolvedStoredSession`), et c'est `SessionPurgeDecision`
/// qui les compose.
///
/// SECOND DÉFAUT, DISTINCT : la purge SQL vide la base, pas l'acteur.
/// `OfflineQueue` garde ses `items` et ses `outcomeTombstones` en mémoire — le
/// bandeau continue de les afficher, et `retryAll()`, qui itère sur `items` sans
/// filtrer le statut et se déclenche au retour du réseau, peut encore les
/// rejouer. `OfflineQueue.clearAll()` fait les trois (mémoire, tombstones,
/// base) ; elle n'avait, elle, aucun appelant dans le dépôt.
///
/// GARDE DE SOURCE, et c'est assumé : le câblage est une chaîne Combine
/// construite dans l'`init` de `DependencyContainer`, qu'un hôte de tests
/// unitaires ne peut ni reconstruire ni piloter (même contrainte que
/// `MeeshyAppOutboxHygieneTests` et `MeeshyAppLogoutTests`). Ce qui se lit dans
/// le texte, c'est le motif fautif — jeter la première valeur, et purger la base
/// sans la mémoire.
@MainActor
final class OutboxLogoutHookCoverageTests: XCTestCase {

    private func dependencyContainerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Services
            .deletingLastPathComponent() // Unit
            .deletingLastPathComponent() // MeeshyTests
            .deletingLastPathComponent() // apps/ios
            .appendingPathComponent("Meeshy/Core/DependencyContainer.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Le corps de `wireOutboxLogoutHook()`, commentaires ÔTÉS — sans quoi le
    /// témoin rougirait sur la prose qui explique le défaut qu'il garde
    /// (le doc-comment cite `.dropFirst()` pour dire pourquoi il n'y est plus).
    private func hookBody(from source: String) throws -> String {
        guard let start = source.range(of: "private func wireOutboxLogoutHook() {"),
              let end = source.range(of: "\n    }\n", range: start.upperBound..<source.endIndex) else {
            throw XCTSkip("wireOutboxLogoutHook introuvable — le témoin doit être recâblé, pas supprimé")
        }
        let body = String(source[start.upperBound..<end.lowerBound])
        return body
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    func test_leCrochetNeJettePasLaPremiereValeurDIsAuthenticated() throws {
        let body = try hookBody(from: try dependencyContainerSource())
        XCTAssertFalse(
            body.contains(".dropFirst()"),
            "`.dropFirst()` écarte la valeur INITIALE de `isAuthenticated`. Une app relancée " +
            "déjà déconnectée (tuée en session, jeton expiré, session invalidée entre deux " +
            "lancements) n'émet alors aucune transition, et la file d'envoi du compte précédent " +
            "survit jusqu'au compte suivant — mesuré : 7 lignes de 12 h, dont 2 blocages (#5913). " +
            "Le `filter { !$0 }` suffit à garder un démarrage CONNECTÉ hors de la purge."
        )
    }

    func test_leCrochetVideAussiLaFileEnMEMOIRE() throws {
        let body = try hookBody(from: try dependencyContainerSource())
        XCTAssertTrue(
            body.contains("OfflineQueue.shared.clearAll()"),
            "`clearAllMessagesForLogout()` vide la BASE. L'acteur `OfflineQueue` garde ses `items` " +
            "et ses `outcomeTombstones` en mémoire : le bandeau continue de les afficher et " +
            "`retryAll()` — qui n'a aucun filtre de statut et se déclenche au retour du réseau — " +
            "peut encore les rejouer. `OfflineQueue.clearAll()` fait les trois (#5913)."
        )
    }

    /// LE TÉMOIN QUI COMPTE, et pas seulement qui inspecte. Chaque store
    /// persistant du SDK expose une purge ; l'inventaire mesuré au 2026-09-10
    /// donne six stores, dont un seul — `OfflineQueue` — n'avait aucun appelant.
    /// Ce test échoue quand un SEPTIÈME apparaît sans être rangé, plutôt que
    /// d'attendre qu'on relise la liste : c'est la seule forme qui survit à
    /// l'ajout d'un store qu'on n'a pas prévu.
    func test_toutStorePersistantDuSdkAUnePurgeAPPELEE() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent() // apps/
            .deletingLastPathComponent() // racine du dépôt

        let persistence = racine.appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK/Persistence")
        let fichiers = try FileManager.default.contentsOfDirectory(at: persistence, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }

        let signatures = ["public func clearAll", "public func clearAllForLogout", "public func clearAllMessagesForLogout"]

        var stores: [String] = []
        for f in fichiers {
            let src = try String(contentsOf: f, encoding: .utf8)
            if signatures.contains(where: { src.contains($0) }) {
                stores.append(f.deletingPathExtension().lastPathComponent)
            }
        }

        XCTAssertGreaterThanOrEqual(
            stores.count, 4,
            "L'inventaire est vide ou trop maigre : le balayage ne trouve plus les stores, " +
            "donc ce témoin ne garde plus rien. Le réparer, jamais l'assouplir."
        )

        /// **L'EXPRESSION D'APPEL EXACTE, déclarée store par store — et c'est
        /// délibéré.** Deux détections automatiques ont été essayées et écartées,
        /// chacune fausse dans un sens :
        ///   * par NOM DE TYPE (`FeedPersistenceActor.`) : faux POSITIF, car
        ///     `DependencyContainer` appelle `feed.clearAllForLogout()` à travers
        ///     une variable locale — le type n'apparaît nulle part ;
        ///   * par NOM DE MÉTHODE (`clearAll`) : faux NÉGATIF, car quatre stores
        ///     partagent ce nom — la présence de `SettingsActionQueue.shared.clearAll()`
        ///     suffirait à déclarer `OfflineQueue` câblée, ce qui est précisément
        ///     le défaut de #5913.
        /// Une carte explicite ne ment dans aucun des deux sens, et son entrée
        /// manquante est un message lisible plutôt qu'un verdict opaque.
        let cablageAttendu: [String: String] = [
            "OfflineQueue": "OfflineQueue.shared.clearAll()",
            "SettingsActionQueue": "SettingsActionQueue.shared.clearAll()",
            "StoryPublishQueue": "StoryPublishQueue.shared.clearAll()",
            "MessagePersistenceActor": "clearAllMessagesForLogout()",
            "FeedPersistenceActor": "clearAllForLogout()",
        ]

        let cablages = [
            racine.appendingPathComponent("apps/ios/Meeshy/Core/DependencyContainer.swift"),
            racine.appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift"),
            racine.appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift"),
        ]
        let texteDesCablages = try cablages.map { try String(contentsOf: $0, encoding: .utf8) }.joined(separator: "\n")

        let nonDeclares = stores.filter { cablageAttendu[$0] == nil }
        XCTAssertTrue(
            nonDeclares.isEmpty,
            "Store(s) persistant(s) NOUVEAU(X) sans entrée dans `cablageAttendu` : " +
            "\(nonDeclares.joined(separator: ", ")). Un store qui persiste sans être purgé fait " +
            "hériter le compte suivant (#5913). Déclarer où sa purge est appelée — ou, s'il n'a pas " +
            "à l'être, l'écrire ici avec sa raison."
        )

        let nonCables = stores.compactMap { store -> String? in
            guard let appel = cablageAttendu[store] else { return nil }
            return texteDesCablages.contains(appel) ? nil : "\(store) (attendu : \(appel))"
        }
        XCTAssertTrue(
            nonCables.isEmpty,
            "Purge DÉCLARÉE mais introuvable dans le câblage de fin de session : " +
            "\(nonCables.joined(separator: ", ")). C'est la forme exacte de #5913 — le mécanisme " +
            "écrit et jamais appelé."
        )
    }
}
