import XCTest
@testable import Meeshy
@testable import MeeshySDK

/**
 **LE REJEU HORS-LIGNE D'UN RÉGLAGE NE PEUT PAS RÉUSSIR S'IL EXIGE LA MAUVAISE
 FORME** — audit de cohérence iOS ↔ passerelle, 2026-09-11.

 ## Ce qui était cassé

 `SettingsActionQueue` persiste une modification de profil faite hors-ligne et
 la rejoue au retour du réseau (`MeeshyApp.swift`, `setFlushHandler`). Le
 gestionnaire décodait la réponse en `APIResponse<MeeshyUser>`, c'est-à-dire
 `{ success, data: <utilisateur> }`.

 Or `PATCH /users/me` ne sert PAS cette forme. Son schéma de réponse
 (`services/gateway/src/routes/users/profile-updates.ts`) déclare
 `data: { user, message }` — l'utilisateur est un CRAN plus bas. Le décodage
 échouait donc **à tous les coups**, sur `keyNotFound(id)`.

 ## Pourquoi le défaut était invisible

 L'échec n'est pas un échec de requête : le serveur a déjà ÉCRIT. Seule la
 lecture de sa réponse tombe — et elle tombe dans le `catch` générique, dont la
 doctrine (juste, pour un vrai 5xx) est « garder en file, on rejouera ». Donc :

 - la modification est appliquée, encore et encore, à chaque retour en ligne ;
 - la file ne se vide JAMAIS ;
 - le compteur « en attente de synchronisation » de `RootView` reste allumé
   pour une action qui a déjà abouti.

 Le symptôme visible est un compteur qui ne redescend pas — jamais une erreur.

 ## Ce que mesure ce fichier

 Le jumeau du site a déjà la bonne forme : `OutboxDispatcher.updateProfile`
 décode `APIResponse<[String: AnyCodable]>` avec, en commentaire, exactement la
 raison ci-dessus. Le rejeu, lui, est GÉNÉRIQUE — il rejoue un chemin lu sur le
 disque, écrit par une version possiblement antérieure de l'app. Il ne peut donc
 EXIGER aucune forme de `data` : ce qu'il lui faut est l'enveloppe seule.
 */
final class SettingsReplayEnvelopeTests: XCTestCase {

    /// La charge que `PATCH /users/me` sert vraiment, réduite à ce qui se mesure.
    /// Forme copiée du `response: { 200: … }` de la route, pas inventée ici.
    private let charge = Data("""
    {
      "success": true,
      "data": {
        "user": {
          "id": "68bf0000000000000000000a",
          "username": "camille",
          "displayName": "Camille Roy",
          "systemLanguage": "fr"
        },
        "message": "Profile updated successfully"
      }
    }
    """.utf8)

    /**
     LE TÉMOIN DE LA RÉGRESSION. Tant que le rejeu demandait cette forme, il ne
     pouvait pas aboutir : l'utilisateur n'est pas `data`, il est `data.user`.
     */
    func test_laFormeQueLeRejeuExigeait_neSaitPasLireCeQueLaRouteSert() {
        XCTAssertThrowsError(
            try JSONDecoder().decode(APIResponse<MeeshyUser>.self, from: charge),
            "Si cette forme devenait décodable, c'est la ROUTE qui aurait changé — "
            + "et le rejeu devrait alors être relu, pas ce témoin."
        ) { erreur in
            guard case DecodingError.keyNotFound(let clef, _) = erreur else {
                return XCTFail("Attendu une clé manquante, obtenu \(erreur)")
            }
            XCTAssertEqual(clef.stringValue, "id")
        }
    }

    /**
     LA FORME JUSTE — et elle l'est pour une raison qui n'est pas « elle passe » :
     un rejeu ne veut RIEN de la réponse, sinon savoir qu'elle a été acceptée.
     `data` n'est pas décodé du tout, donc aucun changement de la route ne peut
     le casser. C'est la seule propriété qui tienne pour un chemin persisté.
     */
    func test_lEnveloppeSeule_litCeQueLaRouteSert_etNExigeRienDeSonContenu() throws {
        let enveloppe = try JSONDecoder().decode(SimpleAPIResponse.self, from: charge)
        XCTAssertTrue(enveloppe.success)
        XCTAssertNil(enveloppe.error)
    }

    /**
     Et elle lit aussi les AUTRES formes que la file peut avoir persistées — un
     `data` tableau, un `data` scalaire, un `data` absent. C'est ce qui fait
     d'elle le type d'un rejeu générique plutôt qu'un second pari sur une route.
     */
    func test_lEnveloppeSeule_toléreToutesLesFormesDeData() throws {
        for corps in [
            #"{"success":true,"data":[]}"#,
            #"{"success":true,"data":"ok"}"#,
            #"{"success":true,"message":"Profile updated successfully"}"#,
        ] {
            let enveloppe = try JSONDecoder().decode(SimpleAPIResponse.self, from: Data(corps.utf8))
            XCTAssertTrue(enveloppe.success, "forme refusée : \(corps)")
        }
    }

    /**
     LE SITE, pas seulement le type. Le gestionnaire est une fermeture en ligne
     dans le bloc `.task` de `MeeshyApp` : aucun test ne peut l'invoquer (même
     contrainte que `MeeshyAppOutboxHygieneTests`, qui épingle le même corps).
     On mesure donc ce qu'on peut mesurer — qu'il ne redemande pas l'utilisateur.
     */
    func test_leRejeuDeMeeshyApp_neDecodePlusLUtilisateur() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent() // Services
                .deletingLastPathComponent() // Unit
                .deletingLastPathComponent() // MeeshyTests
                .deletingLastPathComponent() // apps/ios
                .appendingPathComponent("Meeshy/MeeshyApp.swift"),
            encoding: .utf8
        )
        guard let debut = source.range(of: "await SettingsActionQueue.shared.setFlushHandler"),
              let fin = source.range(of: "\n                    }\n", range: debut.upperBound..<source.endIndex) else {
            return XCTFail("Corps de setFlushHandler introuvable dans MeeshyApp.swift")
        }
        // Les COMMENTAIRES sont retirés avant la mesure : celui qui explique ce
        // correctif NOMME la forme fautive, et un test qui lit le fichier brut
        // ne sait pas distinguer le code de ce qui le documente — il rougirait
        // sur sa propre explication.
        let corps = source[debut.upperBound..<fin.lowerBound]
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")

        XCTAssertFalse(
            corps.contains("APIResponse<MeeshyUser>"),
            "PATCH /users/me sert `data: { user, message }` — exiger `data: <utilisateur>` "
            + "fait échouer CHAQUE rejeu et laisse l'action en file pour toujours."
        )
        XCTAssertTrue(
            corps.contains("SimpleAPIResponse"),
            "Un rejeu de chemin persisté ne doit exiger aucune forme de `data`."
        )
    }
}
