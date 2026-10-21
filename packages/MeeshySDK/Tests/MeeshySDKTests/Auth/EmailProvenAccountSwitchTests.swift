import XCTest
@testable import MeeshySDK

/// #10445 — un lien reçu par e-mail ne déconnecte jamais : la preuve rend une
/// session qui n'existe qu'en mémoire, et passer à un AUTRE compte GARDE celui
/// qu'on quitte. Un compte à second facteur ne rend aucune session, et le dit.
final class EmailProvenAccountSwitchTests: XCTestCase {

    private func decodeLogin(_ json: String) throws -> LoginResponseData {
        try JSONDecoder().decode(APIResponse<LoginResponseData>.self, from: Data(json.utf8)).data
    }

    // MARK: - Ce que sert une preuve d'adresse

    func test_served_nominalSession_isTheProvenSession() throws {
        let data = try decodeLogin(#"{"success":true,"data":{"token":"jwt","sessionToken":"sess","user":{"id":"u1","username":"alice"}}}"#)

        let proven = try XCTUnwrap(try EmailProvenSession.served(by: data))

        XCTAssertEqual(proven.token, "jwt")
        XCTAssertEqual(proven.sessionToken, "sess")
        XCTAssertEqual(proven.user.id, "u1")
    }

    func test_served_withoutSession_isNil() throws {
        let data = try decodeLogin(#"{"success":true,"data":{"verified":true}}"#)

        XCTAssertNil(try EmailProvenSession.served(by: data))
    }

    /// Le second facteur n'est pas « adresse vérifiée sans session » : le
    /// confondre affichait « Email vérifié ! » devant un compte resté fermé.
    func test_served_secondFactor_throwsSecondFactorRequired() throws {
        let data = try decodeLogin(#"{"success":true,"data":{"requires2FA":true,"twoFactorToken":"2fa-tok","user":{"id":"u1","username":"alice"}}}"#)

        XCTAssertThrowsError(try EmailProvenSession.served(by: data)) { error in
            XCTAssertEqual(error as? SecondFactorRequired, SecondFactorRequired(twoFactorToken: "2fa-tok"))
        }
    }

    // MARK: - Passer au compte du lien GARDE le compte quitté

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Auth/
            .deletingLastPathComponent()   // MeeshySDKTests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshySDK/Auth/AuthManager+EmailAccess.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

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

    /// Garde de SOURCE : la sortie de session atteint `UNUserNotificationCenter`,
    /// indisponible dans le binaire de test SPM — la moitié comportementale se
    /// vérifie au simulateur et dans `SignInLinkDuringPresentationTests`.
    func test_switchToProvenAccount_suspendsTheCurrentAccount_neverLogsOut() throws {
        let corps = try body(of: "public func switchToProvenAccount(_ proven: EmailProvenSession) async -> ProvenAccountSwitchOutcome {", in: try source())

        XCTAssertTrue(corps.contains("await suspendActiveSession()"),
                      "le compte quitté reste au sélecteur, repris sans mot de passe")
        XCTAssertFalse(corps.contains("logout("), "un lien ne déconnecte jamais")
        XCTAssertFalse(corps.contains("endingIt: true"))
        let suspend = try XCTUnwrap(corps.range(of: "await suspendActiveSession()"))
        let open = try XCTUnwrap(corps.range(of: "try installSession(proven)", options: .backwards))
        XCTAssertTrue(suspend.lowerBound < open.lowerBound, "la session rendue se pose APRÈS la sortie de l'autre")
        // #10518 — la fenêtre se juge AVANT de ranger le compte ouvert.
        let lapse = try XCTUnwrap(corps.range(of: "proven.hasLapsedAdoptionWindow()"))
        XCTAssertTrue(lapse.lowerBound < suspend.lowerBound, "une preuve échue ne range jamais le compte ouvert")
    }

    /// Le comportement (réessais, jeton prouvé) est éprouvé par
    /// `AuthManagerSessionReplacementGuardTests.test_discardProvenSession_retriesUntilTheGatewayCloses`.
    func test_discardProvenSession_closesItServerSide_withItsOwnToken() throws {
        let corps = try body(of: "public func discardProvenSession(_ proven: EmailProvenSession) async {", in: try source())

        XCTAssertTrue(corps.contains("performServerLogoutWithRetries(token: proven.token)"))
        XCTAssertFalse(corps.contains("applySession("), "refuser n'écrit rien sur l'appareil")
    }
}
