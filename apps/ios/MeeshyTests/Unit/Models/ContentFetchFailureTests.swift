import XCTest
@testable import Meeshy
import MeeshySDK

/// **« Vérifiez votre connexion » n'est pas la réponse à un 500** (#6508).
///
/// Le 2026-09-14, une panne serveur (#6503) a fait dire à chaque ouverture de
/// contenu depuis une notification « Couldn't load this content — Check your
/// connection, then try again ». La connexion était bonne : l'écran MENTAIT sur
/// la cause, parce que l'app ne distinguait que « 404 » et « tout le reste ».
///
/// Les erreurs sont construites comme `APIClient` les LÈVE (`MeeshyError`), et
/// comme les anciens témoins les fabriquaient (`APIError`, `URLError`) : une loi
/// qui ne reconnaîtrait qu'une des deux familles passerait au vert sur ses
/// témoins en restant morte sur le terrain — c'est ce qui était arrivé à la
/// garde 404 de la cible story.
final class ContentFetchFailureTests: XCTestCase {

    func test_unReseauAbsent_estUnEchecReseau() {
        XCTAssertEqual(ContentFetchFailure.classify(MeeshyError.network(.noConnection)), .network)
        XCTAssertEqual(ContentFetchFailure.classify(MeeshyError.network(.timeout)), .network)
        XCTAssertEqual(ContentFetchFailure.classify(MeeshyError.network(.serverUnreachable)), .network)
        XCTAssertEqual(ContentFetchFailure.classify(URLError(.notConnectedToInternet)), .network)
    }

    /// Le cas du 2026-09-14 : le serveur a répondu, et il a échoué.
    func test_un5xx_estUnEchecServeur_jamaisUnEchecDeConnexion() {
        XCTAssertEqual(ContentFetchFailure.classify(MeeshyError.server(statusCode: 500, message: "Erreur serveur")), .server)
        XCTAssertEqual(ContentFetchFailure.classify(MeeshyError.server(statusCode: 502, message: "Bad Gateway")), .server)
        XCTAssertEqual(ContentFetchFailure.classify(APIError.serverError(503, "Service Unavailable")), .server)
    }

    /// `APIClient` rend un corps illisible en `server(0)` : le serveur a
    /// répondu quelque chose que l'app ne sait pas lire — ce n'est pas le réseau.
    func test_unCorpsIndecodable_estUnEchecServeur() {
        XCTAssertEqual(ContentFetchFailure.classify(MeeshyError.server(statusCode: 0, message: "Erreur de decodage")), .server)
        let corrompu = DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "illisible"))
        XCTAssertEqual(ContentFetchFailure.classify(corrompu), .server)
    }

    func test_un403_estUnContenuInterdit() {
        XCTAssertEqual(ContentFetchFailure.classify(MeeshyError.forbidden(reason: "Post privé", body: nil)), .forbidden)
        XCTAssertEqual(ContentFetchFailure.classify(APIError.serverError(403, "Forbidden")), .forbidden)
    }

    func test_un404_estUnContenuIntrouvable() {
        XCTAssertEqual(ContentFetchFailure.classify(MeeshyError.server(statusCode: 404, message: "Post not found")), .notFound)
        XCTAssertEqual(ContentFetchFailure.classify(APIError.serverError(404, "Not Found")), .notFound)
    }

    /// Interdit et introuvable disent la même chose à l'utilisateur : le
    /// contenu n'est pas là pour lui. Réessayer échouerait identiquement.
    func test_seulsInterditEtIntrouvable_disentLAbsence_etSeulsLesAutresSeReessaient() {
        XCTAssertTrue(ContentFetchFailure.forbidden.isAbsence)
        XCTAssertTrue(ContentFetchFailure.notFound.isAbsence)
        XCTAssertFalse(ContentFetchFailure.network.isAbsence)
        XCTAssertFalse(ContentFetchFailure.server.isAbsence)
    }
}
