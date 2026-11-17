import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #18870 — planche `Etat-Demande` : la face Actions dit l'étape de la demande — aucune, envoyée (depuis quand),
/// reçue (avec le mot de l'émetteur), acceptée à l'instant (« Vous êtes amis »), ou déjà amis.
final class ProfileRequestStageTests: XCTestCase {

    private func request(id: String, message: String? = nil, createdAt: Date = Date(timeIntervalSince1970: 1_000),
                         originalLanguage: String? = nil, translations: [String: String]? = nil) -> FriendRequest {
        FriendRequest(id: id, senderId: "u-sofia", receiverId: "me", message: message, status: "pending", createdAt: createdAt,
                      messageOriginalLanguage: originalLanguage,
                      messageTranslations: translations.map { FriendRequestNoteTranslations($0) })
    }

    private func received(_ request: FriendRequest, prism: [String]) -> ProfileRequestStage {
        ProfileRequestStage.resolve(connection: .pendingReceived(requestId: request.id), request: request,
                                    justAccepted: false, prism: prism)
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

        XCTAssertEqual(stage, .received(note: ProfileReceivedNote(original: "On s'est croisées au festival !")))
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

    /// Planche `Etat-Erreur` vue 2 : une demande qui n'est pas partie remet le bouton comme avant et le dit.
    func test_resolve_envoiRate_sansDemande_estNonPartie() {
        let stage = ProfileRequestStage.resolve(connection: .none, request: nil, justAccepted: false, sendFailed: true)

        XCTAssertEqual(stage, .unsent)
    }

    /// L'échec d'un envoi précédent ne survit pas à une demande partie ensuite.
    func test_resolve_envoiRate_puisDemandeEnvoyee_estEnvoyee() {
        let stage = ProfileRequestStage.resolve(
            connection: .pendingSent(requestId: "r1"), request: nil, justAccepted: false, sendFailed: true
        )

        XCTAssertEqual(stage, .sent(sentAt: nil))
    }

    // MARK: - Le mot traduit (planche `Etat-Demande` étape 3, #19460)

    func test_recue_motTraduitDansLaLanguePrimaire_estServiAvecSaLangueDOrigine() {
        let stage = received(request(id: "r1", message: "التقينا في المهرجان!", originalLanguage: "ar",
                                     translations: ["fr": "On s'est croisées au festival !"]),
                             prism: ["fr", "en"])

        let expected = ProfileReceivedNote(
            original: "التقينا في المهرجان!",
            translation: ProfileReceivedNote.Translation(originalLanguage: "ar", language: "fr",
                                                         text: "On s'est croisées au festival !")
        )
        XCTAssertEqual(stage, .received(note: expected))
    }

    /// Un témoin de RANG s'écrit sur un rang autre que le premier : le rang 1 manque, le rang 2 est servi.
    func test_recue_rangPrimaireAbsent_descendAuRangSuivant() {
        let stage = received(request(id: "r1", message: "مرحبا", originalLanguage: "ar", translations: ["en": "Hi"]),
                             prism: ["fr", "en"])

        XCTAssertEqual(stage, .received(note: ProfileReceivedNote(
            original: "مرحبا",
            translation: ProfileReceivedNote.Translation(originalLanguage: "ar", language: "en", text: "Hi")
        )))
    }

    /// La langue d'origine concourt à son rang : écrite dans ma langue secondaire, mais traduite dans ma primaire,
    /// le mot se lit dans ma primaire ; écrit dans ma primaire, il se lit tel quel.
    func test_recue_langueDOrigine_concourtASonRang() {
        let secondary = received(request(id: "r1", message: "Hello", originalLanguage: "en", translations: ["fr": "Bonjour"]),
                                 prism: ["fr", "en"])
        let primary = received(request(id: "r1", message: "Bonjour", originalLanguage: "FR", translations: ["en": "Hello"]),
                               prism: ["fr", "en"])

        XCTAssertEqual(secondary, .received(note: ProfileReceivedNote(
            original: "Hello",
            translation: ProfileReceivedNote.Translation(originalLanguage: "en", language: "fr", text: "Bonjour")
        )))
        XCTAssertEqual(primary, .received(note: ProfileReceivedNote(original: "Bonjour")))
    }

    func test_recue_sansTraductionDansMesLangues_ouSansLangueDOrigine_serviLOriginal() {
        let foreign = received(request(id: "r1", message: "مرحبا", originalLanguage: "ar", translations: ["de": "Hallo"]),
                               prism: ["fr", "en"])
        let unlabeled = received(request(id: "r1", message: "مرحبا", translations: ["fr": "Salut"]), prism: ["fr"])

        XCTAssertEqual(foreign, .received(note: ProfileReceivedNote(original: "مرحبا")))
        XCTAssertEqual(unlabeled, .received(note: ProfileReceivedNote(original: "مرحبا")))
    }

    func test_motRecu_basculeEntreTraductionEtOriginal() {
        let note = ProfileReceivedNote(
            original: "مرحبا",
            translation: ProfileReceivedNote.Translation(originalLanguage: "ar", language: "fr", text: "Salut")
        )

        XCTAssertEqual(note.text(showingOriginal: false), "Salut")
        XCTAssertEqual(note.text(showingOriginal: true), "مرحبا")
        XCTAssertEqual(ProfileReceivedNote(original: "Bonjour").text(showingOriginal: false), "Bonjour")
    }

    // MARK: - Demandes fermées (planche `Etat-Demande` étape 5, #19460)

    func test_resolve_sansLien_proprietaireFerme_estFermee() {
        let stage = ProfileRequestStage.resolve(connection: .none, request: nil, justAccepted: false, acceptsRequests: false)

        XCTAssertEqual(stage, .closed)
    }

    /// Champ absent ou ouvert ⇒ la carte d'ouverture comme avant.
    func test_resolve_sansLien_champAbsentOuOuvert_estOuverte() {
        XCTAssertEqual(ProfileRequestStage.resolve(connection: .none, request: nil, justAccepted: false, acceptsRequests: nil), .open)
        XCTAssertEqual(ProfileRequestStage.resolve(connection: .none, request: nil, justAccepted: false, acceptsRequests: true), .open)
    }

    /// Fermer les NOUVELLES demandes ne touche ni une demande en cours, ni un lien déjà noué.
    func test_resolve_demandesFermees_neMasqueNiDemandeEnCoursNiLien() {
        let received = ProfileRequestStage.resolve(connection: .pendingReceived(requestId: "r1"), request: nil,
                                                   justAccepted: false, acceptsRequests: false)
        let sent = ProfileRequestStage.resolve(connection: .pendingSent(requestId: "r1"), request: nil,
                                               justAccepted: false, acceptsRequests: false)
        let connected = ProfileRequestStage.resolve(connection: .connected, request: nil, justAccepted: false,
                                                    acceptsRequests: false)

        XCTAssertEqual(received, .received(note: nil))
        XCTAssertEqual(sent, .sent(sentAt: nil))
        XCTAssertEqual(connected, .connected)
    }

    /// « Demander à être amis » (carte d'ouverture, rangée des inconnus) ne se propose plus à une fiche fermée.
    func test_offersRequest_seulementSansLienNiDemandeEtTantQueCEstOuvert() {
        XCTAssertTrue(ProfileRequestStage.open.offersRequest)
        XCTAssertTrue(ProfileRequestStage.unsent.offersRequest)
        XCTAssertFalse(ProfileRequestStage.closed.offersRequest)
        XCTAssertFalse(ProfileRequestStage.sent(sentAt: nil).offersRequest)
        XCTAssertFalse(ProfileRequestStage.received(note: nil).offersRequest)
        XCTAssertFalse(ProfileRequestStage.connected.offersRequest)
    }

    /// Un envoi refusé parce que la personne a fermé ses demandes dit « fermées », pas « réessayer ».
    func test_resolve_envoiRate_demandesFermees_estFermee() {
        let stage = ProfileRequestStage.resolve(connection: .none, request: nil, justAccepted: false, sendFailed: true,
                                                acceptsRequests: false)

        XCTAssertEqual(stage, .closed)
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
