import XCTest
@testable import MeeshySDK

/// #8214 × #8216 — le `409 EMAIL_TAKEN` porte le détenteur MASQUÉ de l'adresse
/// (`emailOwner`), et « Ce n'est pas moi » renvoie la même inscription avec
/// `claimEmail: true`. Même modèle que `suggestions` d'un pseudo pris.
final class EmailTakenOwnerTests: XCTestCase {

    private func rejection(from json: String) throws -> APIRejection {
        let envelope = try JSONDecoder().decode(APIRejectionEnvelope.self, from: Data(json.utf8))
        return envelope.rejection(statusCode: 409, fallbackMessage: "repli")
    }

    func test_envelope_withEmailOwner_decodesTheMaskedOwner() throws {
        let rejection = try rejection(from: """
        {"success":false,"error":"Email déjà utilisé","code":"EMAIL_TAKEN","field":"email",
         "emailOwner":{"maskedDisplayName":"A** L***","maskedUsername":"a**l","avatar":"https://x/a.png"}}
        """)
        XCTAssertEqual(rejection.code, "EMAIL_TAKEN")
        XCTAssertEqual(rejection.emailOwner, APIRejection.EmailOwner(
            maskedDisplayName: "A** L***", maskedUsername: "a**l", avatar: "https://x/a.png"
        ))
    }

    func test_envelope_withoutEmailOwner_isNil() throws {
        let rejection = try rejection(from: #"{"success":false,"error":"x","code":"EMAIL_TAKEN","field":"email"}"#)
        XCTAssertNil(rejection.emailOwner)
        XCTAssertEqual(rejection.field, "email")
    }

    /// Une charge mal formée ne doit pas emporter tout le refus : sans ce
    /// repli, `EMAIL_TAKEN` redeviendrait une erreur serveur générique.
    func test_envelope_malformedEmailOwner_keepsTheRestOfTheRefusal() throws {
        let rejection = try rejection(from: #"{"error":"x","code":"EMAIL_TAKEN","field":"email","emailOwner":{"maskedDisplayName":3}}"#)
        XCTAssertNil(rejection.emailOwner)
        XCTAssertEqual(rejection.code, "EMAIL_TAKEN")
        XCTAssertEqual(rejection.field, "email")
    }

    func test_registerRequest_claimingEmail_carriesTheFlag_andKeepsTheRest() throws {
        let request = RegisterRequest(email: "a@b.co", phoneNumber: "0612345678", phoneCountryCode: "FR")
            .referred(byCode: "aff_42")
            .claimingEmail()
        let dict = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        XCTAssertEqual(dict["claimEmail"] as? Bool, true)
        XCTAssertEqual(dict["affiliateToken"] as? String, "aff_42")
        XCTAssertEqual(dict["phoneNumber"] as? String, "0612345678")
    }

    func test_registerRequest_byDefault_omitsClaimEmail() throws {
        let dict = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(RegisterRequest(email: "a@b.co"))) as? [String: Any])
        XCTAssertNil(dict["claimEmail"])
    }
}
