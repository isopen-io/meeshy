import XCTest
@testable import MeeshySDK

/// Lot 2 — chaîne d'écriture du lieu. Vérifie le CONTRAT D'ENCODAGE de
/// `SendMessageRequest.location` : la clé JSON `location` est celle que le
/// schéma REST du gateway valide (`routes/conversations/messages.ts`,
/// `parseSharedPlace`), et un lieu nil doit être ABSENT du corps encodé —
/// pas présent en `null`.
final class SendMessageRequestLocationTests: XCTestCase {

    private func encodedJSONObject(_ request: SendMessageRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try XCTUnwrap(
            try JSONSerialization.jsonObject(with: data) as? [String: Any],
            "le corps encodé doit être un objet JSON"
        )
    }

    func test_encode_porteLocationAvecLesCinqChamps() throws {
        let place = SharedPlace(
            latitude: 48.8584,
            longitude: 2.2945,
            name: "Tour Eiffel",
            address: "Champ de Mars, 75007 Paris",
            category: "landmark"
        )
        let request = SendMessageRequest(content: "On se retrouve ici ?", location: place)

        let json = try encodedJSONObject(request)
        let location = try XCTUnwrap(json["location"] as? [String: Any],
                                     "la clé `location` doit porter un objet")

        XCTAssertEqual(try XCTUnwrap(location["latitude"] as? Double), 48.8584, accuracy: 0.000001)
        XCTAssertEqual(try XCTUnwrap(location["longitude"] as? Double), 2.2945, accuracy: 0.000001)
        XCTAssertEqual(location["name"] as? String, "Tour Eiffel")
        XCTAssertEqual(location["address"] as? String, "Champ de Mars, 75007 Paris")
        XCTAssertEqual(location["category"] as? String, "landmark")
    }

    func test_encode_ometLocationQuandNil() throws {
        let request = SendMessageRequest(content: "Sans lieu")

        let json = try encodedJSONObject(request)

        XCTAssertFalse(json.keys.contains("location"),
                       "un `location` nil ne doit PAS apparaître dans le corps — ni en valeur, ni en null")
    }
}
