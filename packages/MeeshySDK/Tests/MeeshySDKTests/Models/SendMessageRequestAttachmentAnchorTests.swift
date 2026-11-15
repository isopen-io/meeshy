import XCTest
@testable import MeeshySDK

/// **L'ancre de la pièce citée doit atteindre le CORPS, pas seulement la
/// structure** (#6164, moitié ÉCRITURE — condition de #6165).
///
/// La moitié LECTURE a été livrée d'un bout à l'autre : la passerelle grave
/// `metadata.attachmentReplyTo`, les quatre transports le resservent,
/// `ReplyReference.attachmentId` le porte jusqu'à l'écran. **Aucun client
/// n'en produisait.** Un champ que personne n'émet fait de toute la chaîne de
/// lecture un ornement — la forme du cycle 122, « qui AFFICHE ce qu'il élit »,
/// retournée : ici, qui ÉMET ce que tout le monde sait lire ?
///
/// Le témoin regarde le JSON RÉELLEMENT sérialisé, jamais la structure Swift :
/// c'est le JSON que `messages-send.ts` valide, et un champ présent dans la
/// `struct` mais absent des octets n'a corrigé personne.
final class SendMessageRequestAttachmentAnchorTests: XCTestCase {

    private func encoded(_ request: SendMessageRequest) throws -> [String: Any] {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(request)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func test_uneReponseQuiNommeUnePiece_porteLAncreDansLeCorps() throws {
        let request = SendMessageRequest(
            content: "elle est floue celle-là",
            replyToId: "000000000000000000000042",
            clientMessageId: "cid_test",
            attachmentReplyTo: QuotedAttachmentSend(attachmentId: "aaaaaaaaaaaaaaaaaaaaaaa3")
        )

        let body = try encoded(request)
        let anchor = try XCTUnwrap(body["attachmentReplyTo"] as? [String: Any],
                                   "le corps REST doit porter `attachmentReplyTo`")
        XCTAssertEqual(anchor["attachmentId"] as? String, "aaaaaaaaaaaaaaaaaaaaaaa3")
    }

    /// La NATURE est dérivée du MIME relu par la passerelle
    /// (`attachmentReplyKindFor`), **jamais déclarée par le client** : c'est le
    /// seul fait descriptif qui survit à une protection posée plus tard, donc
    /// le seul qu'un client ne doit pas pouvoir forger. Le type d'écriture ne
    /// l'a même pas comme champ — ce témoin mesure que rien ne l'a réintroduit
    /// par une clé voisine.
    func test_lAncre_neDeclareAucuneNature() throws {
        let request = SendMessageRequest(
            content: "",
            replyToId: "000000000000000000000042",
            clientMessageId: "cid_test",
            attachmentReplyTo: QuotedAttachmentSend(attachmentId: "aaaaaaaaaaaaaaaaaaaaaaa3")
        )

        let body = try encoded(request)
        let anchor = try XCTUnwrap(body["attachmentReplyTo"] as? [String: Any])
        XCTAssertEqual(Set(anchor.keys), ["attachmentId"],
                       "l'ancre ne fige que l'identifiant : `kind` est dérivé du MIME relu côté serveur")
    }

    /// Une réponse ORDINAIRE — qui vise le message entier — ne doit porter
    /// AUCUNE clé : `admitAttachmentReply` refuse un objet mal formé, et une
    /// clé présente à `null` est un objet mal formé pour la voie stricte.
    func test_uneReponseOrdinaire_neChangeRienAuCorps() throws {
        let request = SendMessageRequest(
            content: "bonjour",
            replyToId: "000000000000000000000042",
            clientMessageId: "cid_test"
        )

        let body = try encoded(request)
        XCTAssertNil(body["attachmentReplyTo"],
                     "aucune citation existante ne change de corps")
    }

    /// Le passage de la citation à l'ancre a UN site : une chaîne vide ou
    /// absente ne nomme aucune pièce, et fabriquer une ancre vide ferait
    /// REFUSER l'envoi par la garde serveur (`attachmentId est requis`).
    func test_lAncre_neNaitPasDUneCitationSansPiece() {
        XCTAssertNil(QuotedAttachmentSend(anchor: nil))
        XCTAssertNil(QuotedAttachmentSend(anchor: ""))
        XCTAssertEqual(QuotedAttachmentSend(anchor: "abc")?.attachmentId, "abc")
    }
}
