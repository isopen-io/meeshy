import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #18870 — planche `Etat-Demande` : la face Actions dit l'étape de la demande — aucune, envoyée (depuis quand),
/// reçue (avec le mot de l'émetteur), acceptée à l'instant (« Vous êtes amis »), ou déjà amis.
final class ProfileRequestStageTests: XCTestCase {

    private func request(id: String, message: String? = nil, createdAt: Date = Date(timeIntervalSince1970: 1_000)) -> FriendRequest {
        FriendRequest(id: id, senderId: "u-sofia", receiverId: "me", message: message, status: "pending", createdAt: createdAt)
    }

    func test_resolve_sansDemande_estOuverte() {
        XCTAssertEqual(ProfileRequestStage.resolve(connection: .none, request: nil, justAccepted: false), .open)
    }

    func test_resolve_envoyee_portelaDateDeLaDemandeServie() {
        let stage = ProfileRequestStage.resolve(connection: .pendingSent(requestId: "r1"), request: request(id: "r1"), justAccepted: false)

        XCTAssertEqual(stage, .sent(sentAt: Date(timeIntervalSince1970: 1_000)))
    }

    func test_resolve_envoyee_sansDemandeEnCache_neDitPasDeDate() {
        let stage = ProfileRequestStage.resolve(connection: .pendingSent(requestId: "r1"), request: nil, justAccepted: false)

        XCTAssertEqual(stage, .sent(sentAt: nil))
    }

    func test_resolve_ignoreUneDemandeDUnAutreIdentifiant() {
        let sent = ProfileRequestStage.resolve(connection: .pendingSent(requestId: "r1"), request: request(id: "r2"), justAccepted: false)
        let received = ProfileRequestStage.resolve(
            connection: .pendingReceived(requestId: "r1"),
            request: request(id: "r2", message: "Salut"),
            justAccepted: false
        )

        XCTAssertEqual(sent, .sent(sentAt: nil))
        XCTAssertEqual(received, .received(note: nil))
    }

    func test_resolve_recue_porteLeMotRogneDeLEmetteur() {
        let stage = ProfileRequestStage.resolve(
            connection: .pendingReceived(requestId: "r1"),
            request: request(id: "r1", message: "  On s'est croisées au festival !  "),
            justAccepted: false
        )

        XCTAssertEqual(stage, .received(note: "On s'est croisées au festival !"))
    }

    func test_resolve_recue_motVide_neMontreAucuneBulle() {
        let stage = ProfileRequestStage.resolve(
            connection: .pendingReceived(requestId: "r1"),
            request: request(id: "r1", message: "   "),
            justAccepted: false
        )

        XCTAssertEqual(stage, .received(note: nil))
    }

    func test_resolve_connecte_aLInstant_estAcceptee_sinonDejaAmis() {
        XCTAssertEqual(ProfileRequestStage.resolve(connection: .connected, request: nil, justAccepted: true), .accepted)
        XCTAssertEqual(ProfileRequestStage.resolve(connection: .connected, request: nil, justAccepted: false), .connected)
    }

    /// Une acceptation retombée (réseau refusé) ne laisse pas « Vous êtes amis » à l'écran.
    func test_resolve_acceptationRetombee_revientALaDemandeRecue() {
        let stage = ProfileRequestStage.resolve(connection: .pendingReceived(requestId: "r1"), request: nil, justAccepted: true)

        XCTAssertEqual(stage, .received(note: nil))
    }

    @MainActor
    func test_pendingRequest_litLaDemandeParLaFiche() async {
        let social = StubProfileSocialActions()
        social.pendingRequests = ["r1": request(id: "r1", message: "Salut")]
        let actions = ProfileConnectionActions(relationships: SpyProfileRelationshipState(), social: social)

        let found = await actions.pendingRequest("r1")
        let missing = await actions.pendingRequest("r9")

        XCTAssertEqual(found?.message, "Salut")
        XCTAssertNil(missing)
    }
}
