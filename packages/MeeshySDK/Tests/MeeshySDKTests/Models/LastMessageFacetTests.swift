import XCTest
@testable import MeeshySDK

/// Les onze champs `lastMessage*` d'une ligne de liste décrivent UN seul
/// message. Les écrire séparément est la source d'une classe de bugs entière :
/// la ligne finit par décrire un MÉLANGE de deux messages — le texte du neuf,
/// l'auteur, la pièce jointe et « Vue unique » de l'ancien — et rien ne signale
/// jamais l'incohérence, donc rien ne la corrige.
///
/// `LastMessageFacet` existe pour rendre cette écriture atomique. Ces témoins
/// verrouillent les DEUX gestes qui la portent, et surtout ce qu'ils EFFACENT :
/// un geste qui poserait ses champs sans retirer ceux du message précédent
/// serait vert sur tout test qui n'assertionne que ce qu'il pose.
final class LastMessageFacetTests: XCTestCase {

    private static let rank = Date(timeIntervalSince1970: 1_700_000_000)

    /// Une ligne qui décrit un message riche : photo, auteur, « Vue unique »,
    /// expiration, position et carte du Prisme. Tout ce qu'un remplaçant doit
    /// emporter avec lui.
    private func makeRowDescribing(_ messageId: String) -> MeeshyConversation {
        var c = MeeshyConversation(
            id: "conv-1",
            identifier: "conv-1",
            type: .direct,
            lastMessageAt: Self.rank,
            lastMessagePreview: "regarde ça"
        )
        c.lastMessageId = messageId
        c.lastMessageTranslations = ["fr": "regarde ça"]
        c.lastMessageOriginalLanguage = "en"
        c.lastMessageSenderName = "Windie"
        c.lastMessageAttachments = [MeeshyMessageAttachment(id: "att-1")]
        c.lastMessageAttachmentCount = 1
        c.lastMessageIsBlurred = true
        c.lastMessageIsViewOnce = true
        c.lastMessageExpiresAt = Date(timeIntervalSince1970: 1_800_000_000)
        c.lastMessageLocation = SharedPlace(latitude: 48.85, longitude: 2.29, name: "Tour Eiffel")
        return c
    }

    // MARK: - applyLastMessage : le remplacement EN BLOC

    /// Le contrat dont dépend `ConversationSyncEngine`
    /// (`recomputeLastMessagePreviewAfterDeletion`) : poser la facette d'un
    /// survivant NU doit dépouiller la ligne de tout ce que décrivait le
    /// message supprimé. Un `applyLastMessage` qui n'écrirait que les champs
    /// renseignés laisserait exactement le mélange que la facette existe pour
    /// interdire.
    func test_applyLastMessage_withABareSurvivor_erasesWhatThePreviousMessageLeft() {
        var conv = makeRowDescribing("msg-supprime")
        let survivor = MeeshyMessage(
            id: "msg-precedent",
            conversationId: "conv-1",
            content: "salut",
            createdAt: Date(timeIntervalSince1970: 1_699_999_000)
        )

        conv.applyLastMessage(LastMessageFacet(message: survivor, preview: survivor.content))

        XCTAssertEqual(conv.lastMessageId, "msg-precedent")
        XCTAssertEqual(conv.lastMessagePreview, "salut")
        XCTAssertEqual(conv.lastMessageAt, survivor.createdAt,
                       "le rang de la ligne suit le message qu'elle décrit désormais")
        XCTAssertNil(conv.lastMessageSenderName)
        XCTAssertTrue(conv.lastMessageAttachments.isEmpty)
        XCTAssertEqual(conv.lastMessageAttachmentCount, 0)
        XCTAssertFalse(conv.lastMessageIsBlurred)
        XCTAssertFalse(conv.lastMessageIsViewOnce)
        XCTAssertNil(conv.lastMessageExpiresAt)
        XCTAssertNil(conv.lastMessageLocation)
        XCTAssertNil(conv.lastMessageTranslations,
                     "le résolveur PRÉFÈRE la carte à l'aperçu : garder celle du supprimé rendrait SON texte")
    }

    /// Et il emporte bien ce que le survivant, lui, porte vraiment.
    func test_applyLastMessage_withARichSurvivor_carriesItsOwnDescription() {
        var conv = makeRowDescribing("msg-supprime")
        var survivor = MeeshyMessage(
            id: "msg-precedent",
            conversationId: "conv-1",
            content: "",
            attachments: [MeeshyMessageAttachment(id: "att-9")],
            senderName: "Sandra",
            senderUsername: "sandra"
        )
        survivor.isViewOnce = true

        conv.applyLastMessage(LastMessageFacet(message: survivor, preview: "📷 Photo"))

        XCTAssertEqual(conv.lastMessageSenderName, "Sandra")
        XCTAssertEqual(conv.lastMessageAttachments.map(\.id), ["att-9"])
        XCTAssertEqual(conv.lastMessageAttachmentCount, 1)
        XCTAssertTrue(conv.lastMessageIsViewOnce)
        XCTAssertEqual(conv.lastMessagePreview, "📷 Photo")
    }

    // MARK: - adoptLastMessage : quand le payload ne porte QU'une part

    /// Le geste du chemin reçu : `conversation:updated` recalculé nomme un
    /// autre message et n'en donne que l'identité, le texte et le Prisme. Tout
    /// ce qui décrivait le précédent doit partir — l'appelant repose ensuite ce
    /// que le payload porte vraiment.
    func test_adoptLastMessage_anotherMessage_stripsThePreviousDescription() {
        var conv = makeRowDescribing("msg-supprime")

        XCTAssertTrue(conv.adoptLastMessage(id: "msg-precedent"))

        XCTAssertEqual(conv.lastMessageId, "msg-precedent")
        XCTAssertNil(conv.lastMessagePreview)
        XCTAssertNil(conv.lastMessageTranslations)
        XCTAssertNil(conv.lastMessageOriginalLanguage)
        XCTAssertNil(conv.lastMessageSenderName)
        XCTAssertTrue(conv.lastMessageAttachments.isEmpty)
        XCTAssertEqual(conv.lastMessageAttachmentCount, 0)
        XCTAssertFalse(conv.lastMessageIsBlurred)
        XCTAssertFalse(conv.lastMessageIsViewOnce)
        XCTAssertNil(conv.lastMessageExpiresAt)
        XCTAssertNil(conv.lastMessageLocation)
    }

    /// Le RANG ne bouge pas : `lastMessageAt` est tenu par les règles de
    /// monotonie de l'appelant (et par le drapeau `previewRecalculated` du
    /// serveur), jamais par l'identité. Le reculer ici ferait plonger la ligne
    /// au fond de la liste sur des payloads qui n'en parlent même pas.
    func test_adoptLastMessage_leavesTheRowsRankToItsCaller() {
        var conv = makeRowDescribing("msg-supprime")

        conv.adoptLastMessage(id: "msg-precedent")

        XCTAssertEqual(conv.lastMessageAt, Self.rank)
    }

    /// La borne, sans laquelle le geste serait destructeur : une ÉDITION et une
    /// TRADUCTION nomment le MÊME message. Ses pièces jointes, son auteur et
    /// ses drapeaux restent vrais — le payload les tait parce qu'ils n'ont pas
    /// changé, pas parce qu'ils ont disparu.
    func test_adoptLastMessage_sameMessage_isANoop() {
        var conv = makeRowDescribing("msg-1")

        XCTAssertFalse(conv.adoptLastMessage(id: "msg-1"),
                       "rien n'a changé : republier la ligne serait un rendu pour rien")

        XCTAssertEqual(conv.lastMessagePreview, "regarde ça")
        XCTAssertEqual(conv.lastMessageSenderName, "Windie")
        XCTAssertEqual(conv.lastMessageAttachmentCount, 1)
        XCTAssertTrue(conv.lastMessageIsViewOnce)
        XCTAssertEqual(conv.lastMessageTranslations, ["fr": "regarde ça"])
    }

    /// Une ligne qui ne nommait aucun message peut malgré tout en décrire un
    /// (aperçu hydraté sans identité par un chemin plus ancien). Adopter une
    /// identité doit donc dépouiller là aussi — sinon la description orpheline
    /// survit au message qu'elle ne décrit plus.
    func test_adoptLastMessage_fromAnUnnamedMessage_stillStrips() {
        var conv = makeRowDescribing("msg-1")
        conv.lastMessageId = nil

        XCTAssertTrue(conv.adoptLastMessage(id: "msg-2"))
        XCTAssertNil(conv.lastMessageSenderName)
        XCTAssertNil(conv.lastMessagePreview)
    }
}
