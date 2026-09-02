import XCTest
@testable import MeeshySDK

/// **Quitter un compte sans l'oublier.**
///
/// `logout()` efface l'entrée du sélecteur (`removeFromSavedAccounts`) : revenir
/// sur le compte imposait de retaper son identifiant, alors que l'écran de
/// connexion sait déjà le proposer. `logout(forgettingAccount:)` rend ce seul
/// geste optionnel — tout le reste (trousseau, caches par compte, files) est
/// effacé dans les DEUX cas.
///
/// **Ce n'est pas un affaiblissement** : une `SavedAccount` ne porte que
/// l'identité, et `LoginView.attemptAccountLogin` appelle
/// `login(username:password:)`. Revenir sur le compte redemande le mot de
/// passe ; le drapeau épargne la SAISIE de l'identifiant, jamais
/// l'authentification.
///
/// **Pourquoi une garde de SOURCE et non un témoin de comportement.** Le corps
/// de `logout` sort tôt sur `activeUserId`, une propriété PRIVÉE adossée au
/// trousseau : sans session active, la ligne gardée n'est jamais atteinte, et
/// un témoin qui amorcerait `savedAccounts` puis appellerait `logout()`
/// passerait au vert par SORTIE ANTICIPÉE — vert pour les deux valeurs du
/// drapeau, donc aveugle à ce qu'il prétend garder. La moitié comportementale
/// se vérifie au simulateur, sur une session réelle.
final class AuthManagerSwitchAccountGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Auth/
            .deletingLastPathComponent()   // MeeshySDKTests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshySDK/Auth/AuthManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Corps équilibré depuis une signature.
    private func body(of signature: String, in src: String) throws -> String {
        let start = try XCTUnwrap(src.range(of: signature), "signature introuvable : \(signature)")
        var depth = 0, opened = false, out = ""
        for ch in src[start.lowerBound...] {
            out.append(ch)
            if ch == "{" { depth += 1; opened = true }
            if ch == "}" { depth -= 1; if opened && depth == 0 { return out } }
        }
        throw XCTSkip("corps non refermé")
    }

    // MARK: - Le drapeau gouverne la SEULE ligne qui doit différer

    func test_lOubliDuCompteEstGardeParLeDrapeau() throws {
        let corps = try body(of: "public func logout(forgettingAccount: Bool) async {", in: try source())

        XCTAssertTrue(
            corps.contains("if forgettingAccount {"),
            "Sans cette garde, « changer de compte » efface le compte du sélecteur — c'est-à-dire "
            + "exactement ce qu'il existe pour éviter."
        )
        let garde = try XCTUnwrap(corps.range(of: "if forgettingAccount {"))
        let oubli = try XCTUnwrap(
            corps.range(of: "removeFromSavedAccounts(userId: userId)"),
            "L'oubli doit rester présent : le supprimer ferait de la déconnexion un changement de compte."
        )
        XCTAssertTrue(garde.lowerBound < oubli.lowerBound,
                      "L'oubli est SOUS la garde, pas à côté d'elle.")
    }

    /// **Ce que la garde ci-dessus ne peut pas voir** : un second appel, hors
    /// du `if`, rendrait le drapeau inopérant sans la faire tomber.
    func test_leCompteNEstOublieQuAUnSeulEndroitDuLogout() throws {
        let corps = try body(of: "public func logout(forgettingAccount: Bool) async {", in: try source())
        let appels = corps.components(separatedBy: "removeFromSavedAccounts(").count - 1

        XCTAssertEqual(appels, 1,
                       "Un second oubli, hors de la garde, viderait le sélecteur malgré le drapeau.")
    }

    /// La déconnexion COMPLÈTE reste le comportement par défaut : la porte
    /// historique n'a pas changé de sens.
    func test_laDeconnexionSimpleOublieToujoursLeCompte() throws {
        let corps = try body(of: "public func logout() async {", in: try source())

        XCTAssertTrue(corps.contains("logout(forgettingAccount: true)"),
                      "`logout()` doit rester une déconnexion COMPLÈTE — tout appelant existant "
                      + "(réglages, routeur, session révoquée) en dépend.")
    }
}
