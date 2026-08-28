import XCTest
@testable import MeeshySDK

/// La demande de suppression de compte (#4183).
///
/// `deleteAccount` visait `DELETE /me/delete-account` — une route qui ouvrait
/// la demande sans exiger la moindre preuve de présence : un jeton volé
/// suffisait. Ces témoins portent sur la porte qui la remplace.
final class AccountServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: AccountService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = AccountService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - openDeletionRequest

    func test_openDeletionRequest_postsToTheAuthenticatedRoute() async throws {
        let response = APIResponse<AccountDeletionOpened>(
            success: true,
            data: AccountDeletionOpened(message: "Un e-mail a été envoyé"),
            error: nil
        )
        mock.stub("/me/account/deletion", result: response)

        _ = try await service.openDeletionRequest(
            confirmationPhrase: "SUPPRIMER MON COMPTE",
            currentPassword: "motdepasse"
        )

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/account/deletion")
        // `POST`, jamais `DELETE` : la route remplacée n'exigeait aucune
        // ré-authentification, et son verbe portait tout le contrat.
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func test_openDeletionRequest_returnsTheTokenExpiry() async throws {
        let expiration = Date(timeIntervalSince1970: 1_800_000_000)
        let response = APIResponse<AccountDeletionOpened>(
            success: true,
            data: AccountDeletionOpened(message: "Envoyé", tokenExpiresAt: expiration),
            error: nil
        )
        mock.stub("/me/account/deletion", result: response)

        let ouvert = try await service.openDeletionRequest(
            confirmationPhrase: "SUPPRIMER MON COMPTE",
            currentPassword: "motdepasse"
        )

        // Le lien MEURT : l'écran peut donc dire jusqu'à quand il vaut.
        XCTAssertEqual(ouvert.tokenExpiresAt, expiration)
    }

    func test_openDeletionRequest_propagatesServerRefusal() async {
        // 409 `NO_EMAIL` : un compte sans adresse ne peut pas confirmer sa
        // suppression, et ouvrir la demande le rendrait insupprimable.
        mock.errorToThrow = MeeshyError.server(statusCode: 409, message: "NO_EMAIL")

        do {
            _ = try await service.openDeletionRequest(
                confirmationPhrase: "SUPPRIMER MON COMPTE",
                currentPassword: "motdepasse"
            )
            XCTFail("Un refus serveur doit remonter")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 409)
            } else {
                XCTFail("Attendu une erreur serveur, reçu \(error)")
            }
        } catch {
            XCTFail("Attendu MeeshyError, reçu \(type(of: error))")
        }
    }

    func test_openDeletionRequest_propagatesNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.openDeletionRequest(
                confirmationPhrase: "SUPPRIMER MON COMPTE",
                currentPassword: "motdepasse"
            )
            XCTFail("Une panne réseau doit remonter")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // attendu
            } else {
                XCTFail("Attendu network noConnection, reçu \(error)")
            }
        } catch {
            XCTFail("Attendu MeeshyError, reçu \(type(of: error))")
        }
    }

    // MARK: - deletionStatus

    func test_deletionStatus_readsTheAuthenticatedRoute() async throws {
        let response = APIResponse<AccountDeletionStatus>(
            success: true,
            data: AccountDeletionStatus(status: "CONFIRMED"),
            error: nil
        )
        mock.stub("/me/account/deletion", result: response)

        let etat = try await service.deletionStatus()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/account/deletion")
        XCTAssertEqual(etat.status, "CONFIRMED")
    }

    func test_deletionStatus_acceptsAnEmptyState() async throws {
        // « Aucune demande en cours » est une RÉPONSE, pas une absence de
        // ressource : le serveur rend 200 avec `status: null`.
        let response = APIResponse<AccountDeletionStatus>(
            success: true,
            data: AccountDeletionStatus(status: nil),
            error: nil
        )
        mock.stub("/me/account/deletion", result: response)

        let etat = try await service.deletionStatus()

        XCTAssertNil(etat.status)
        XCTAssertNil(etat.gracePeriodEndsAt)
    }
}
