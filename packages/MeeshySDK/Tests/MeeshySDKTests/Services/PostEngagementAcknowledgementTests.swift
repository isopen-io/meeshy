import XCTest
@testable import MeeshySDK

/// **Un « Aimer » ou un « Enregistrer » réussi se lisait comme un échec**
/// (#15994).
///
/// La passerelle répond à `POST /posts/:id/like` par `{ liked, reactionSummary }`
/// (un commentaire y ajoute `likeCount`) et à `POST /posts/:id/bookmark` par `{ bookmarked, bookmarkCount }` (relevé
/// sur le staging le 2026-11-04). `PostService` décodait ces deux charges en
/// `[String: String]` : un booléen, un nombre ou un objet n'est pas une chaîne,
/// le décodeur jetait, et l'appelant voyait une ERREUR sur un geste que le
/// serveur venait d'écrire — retour arrière de la carte et toast d'erreur.
///
/// Aucun appelant ne lit ces charges : le 2xx EST la confirmation, et le total
/// voyage par le socket (`post:liked`, `post:bookmarked`). Elles se décodent
/// donc en `DiscardedResponseBody`, qui accepte toute forme sans la lire.
final class PostEngagementAcknowledgementTests: XCTestCase {

    private static let gatewayAcks = [
        #"{"success":true,"data":{"liked":true,"reactionSummary":{"❤️":1}}}"#,
        #"{"success":true,"data":{"liked":false,"reactionSummary":{}}}"#,
        #"{"success":true,"data":{"liked":true,"likeCount":2,"reactionSummary":{"❤️":2}}}"#,
        #"{"success":true,"data":{"bookmarked":true,"bookmarkCount":1}}"#,
        #"{"success":true,"data":{"bookmarked":false,"bookmarkCount":0}}"#,
        #"{"success":true,"data":{"shareCount":4,"shortUrl":"https://meeshy.me/l/abc"}}"#,
    ]

    func test_lesAccusesServisParLaPasserelle_seDecodentTous() throws {
        for json in Self.gatewayAcks {
            let response = try JSONDecoder().decode(
                APIResponse<DiscardedResponseBody>.self, from: Data(json.utf8)
            )
            XCTAssertTrue(response.success, json)
        }
    }

    func test_leDecodageEnDictionnaireDeChaines_rejetaitCesMemesAccuses() {
        for json in Self.gatewayAcks {
            XCTAssertThrowsError(
                try JSONDecoder().decode(APIResponse<[String: String]>.self, from: Data(json.utf8)),
                "Le témoin du défaut ne mesure plus rien : \(json)"
            )
        }
    }

    func test_leDecodage_accepteAussiUneChargeAbsenteNulleOuScalaire() throws {
        for json in [#"{"success":true,"data":null}"#, #"{"success":true,"data":[1]}"#, #"{"success":true,"data":"ok"}"#] {
            XCTAssertTrue(try JSONDecoder().decode(APIResponse<DiscardedResponseBody>.self, from: Data(json.utf8)).success, json)
        }
    }
}
