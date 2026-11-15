import XCTest
@testable import MeeshySDK

/// **Qui a écrit le dernier message, tel que la LIGNE DE LISTE doit le dire.**
///
/// Symptôme rapporté par le porteur : « quand j'envoie un message, dans la liste
/// des conversations le message est affiché mais sans le détail (Toi: <message>) ».
///
/// Le préfixe d'auteur existe et il est rendu ; ce qui manquait est ce qui
/// l'ALIMENTE au moment d'un envoi. `conversation:updated` porte l'auteur
/// (`senderId` et `lastMessageSenderName`, servis par la passerelle), le client
/// ne le lisait pas, et la fusion remettait l'auteur à `nil`.
///
/// ### La garde à NE PAS casser
///
/// Les témoins existants exigent qu'un auteur PÉRIMÉ ne survive pas à un
/// changement de dernier message — sans quoi « Windie : salut » attribuerait au
/// message suivant l'auteur du précédent. Cette règle est juste, et ce
/// résolveur la garde : **il ne pose un auteur que si l'événement le PORTE**.
/// L'absence reste `nil`, comme avant.
final class ConversationListAuthorTests: XCTestCase {

    private let moi = "user-moi"
    private let pair = "user-pair"

    private func resolve(
        senderId: String?,
        senderName: LastMessageSenderName = .unchanged,
        type: MeeshyConversation.ConversationType = .direct,
        peerUserId: String? = "user-pair",
        peerUsername: String? = "Favour"
    ) -> String? {
        raw(senderId: senderId, senderName: senderName, type: type, peerUserId: peerUserId, peerUsername: peerUsername)
            .displayedNameForNewMessage
    }

    /// Le verdict BRUT, pour les témoins qui portent sur la distinction
    /// « rien d'affirmé » vs « pas d'auteur ».
    private func raw(
        senderId: String?,
        senderName: LastMessageSenderName = .unchanged,
        type: MeeshyConversation.ConversationType = .direct,
        peerUserId: String? = "user-pair",
        peerUsername: String? = "Favour"
    ) -> ConversationListAuthor.Resolution {
        ConversationListAuthor.resolve(
            eventSenderId: senderId,
            eventSenderName: senderName,
            currentUserId: moi,
            conversationType: type,
            peerUserId: peerUserId,
            peerUsername: peerUsername,
            youLabel: "Toi"
        )
    }

    // MARK: - Le cas du porteur

    func test_monPropreMessage_seDitToi_memeSansNomServi() {
        XCTAssertEqual(resolve(senderId: moi), "Toi")
    }

    func test_monPropreMessage_seDitToi_memeQuandLeServeurEnvoieMonNom() {
        // « Toi » gagne sur mon propre nom d'affichage : dans MA liste, c'est
        // moi qui lis, et me lire par mon nom est une information que je n'ai
        // pas demandée.
        XCTAssertEqual(resolve(senderId: moi, senderName: .replaced("J. Charles")), "Toi")
    }

    func test_monPropreMessage_dansUnGroupe_seDitToiAussi() {
        XCTAssertEqual(resolve(senderId: moi, type: .group), "Toi")
    }

    // MARK: - Le message d'un autre

    func test_leNomServiParLEvenementEstPrefere() {
        XCTAssertEqual(resolve(senderId: pair, senderName: .replaced("Favour B.")), "Favour B.")
    }

    func test_dansUnGroupe_leNomServiEstLeSeulRecours() {
        XCTAssertEqual(
            resolve(senderId: "user-tiers", senderName: .replaced("Windie"), type: .group, peerUserId: nil, peerUsername: nil),
            "Windie"
        )
    }

    func test_sansNomServi_unDirectRetombeSurLeNomDuPairConnu() {
        XCTAssertEqual(resolve(senderId: pair), "Favour")
    }

    // MARK: - La garde anti-périmé, INTACTE

    func test_evenementQuiNeParlePasDeLAuteur_dansUnGroupe_rendNil() {
        XCTAssertNil(resolve(senderId: "user-tiers", type: .group, peerUserId: nil, peerUsername: nil))
    }

    func test_nomServiVIDE_neFabriquePasUnPrefixe() {
        // `« : message »` serait pire que pas de préfixe du tout.
        XCTAssertNil(resolve(senderId: "user-tiers", senderName: .replaced("   "), type: .group, peerUserId: nil, peerUsername: nil))
    }

    func test_cleServieANull_effaceLAuteur_etNeRetombePasSurLeVoisin() {
        // `.replaced(nil)` DIT qu'il n'y a pas d'auteur à afficher. C'est une
        // affirmation, pas une ignorance : elle ne doit pas réveiller le repli.
        XCTAssertNil(resolve(senderId: pair, senderName: .replaced(nil)))
    }

    func test_aucunSenderId_etAucunNom_rendNil() {
        XCTAssertNil(resolve(senderId: nil))
    }

    // MARK: - « Rien d'affirmé » n'est PAS « pas d'auteur »

    /// Trouvé par un témoin existant, pas par relecture : écrire `nil` quand
    /// l'événement ne dit rien effaçait l'auteur À CHAQUE ÉDITION de légende
    /// (`test_conversationUpdatedEvent_editingTheSameMessage_keepsItsDescription`).
    /// Les deux cas s'arbitrent à l'OPPOSÉ selon le site, d'où les trois états.
    func test_evenementMuetSurLAuteur_rendUnchanged_etNonUnAuteurVide() {
        XCTAssertEqual(raw(senderId: "user-tiers", type: .group, peerUserId: nil, peerUsername: nil), .unchanged)
    }

    func test_cleServieANull_AFFIRME_labsenceDAuteur() {
        // À distinguer du précédent : ici l'événement PARLE, et dit « aucun ».
        XCTAssertEqual(raw(senderId: pair, senderName: .replaced(nil)), .display(nil))
    }

    func test_unAuteurAffirme_seDit_display() {
        XCTAssertEqual(raw(senderId: pair, senderName: .replaced("Favour B.")), .display("Favour B."))
    }

    func test_monPropreMessage_affirmeToi() {
        XCTAssertEqual(raw(senderId: moi), .display("Toi"))
    }

    /// Le repli DM est une AFFIRMATION lui aussi : la ligne connaît le pair,
    /// donc elle sait qui a écrit — ce n'est pas une ignorance.
    func test_lRepliDuPair_estUneAffirmation() {
        XCTAssertEqual(raw(senderId: pair), .display("Favour"))
    }

    // MARK: - Ce qui ne doit pas faire dire « Toi »

    func test_lecteurInconnu_neSeDitJamaisToi() {
        // `currentUserId` nul (auth non résolue) : comparer à `nil` ferait dire
        // « Toi » au premier message dont `senderId` est nul lui aussi.
        XCTAssertNil(
            ConversationListAuthor.resolve(
                eventSenderId: nil,
                eventSenderName: .unchanged,
                currentUserId: nil,
                conversationType: MeeshyConversation.ConversationType.direct,
                peerUserId: nil,
                peerUsername: nil,
                youLabel: "Toi"
            ).displayedNameForNewMessage
        )
    }

    func test_lecteurInconnu_avecUnAuteurServi_serDitParSonNom() {
        XCTAssertEqual(
            ConversationListAuthor.resolve(
                eventSenderId: "user-tiers",
                eventSenderName: .replaced("Windie"),
                currentUserId: nil,
                conversationType: MeeshyConversation.ConversationType.group,
                peerUserId: nil,
                peerUsername: nil,
                youLabel: "Toi"
            ).displayedNameForNewMessage,
            "Windie"
        )
    }
}
