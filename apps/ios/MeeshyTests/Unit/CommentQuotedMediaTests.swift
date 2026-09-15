import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// #6578 — **UN COMMENTAIRE CITE LE MÉDIA DU POST DONT IL PARLE.**
///
/// Tous les témoins ci-dessous INSTANCIENT, APPELLENT et observent un EFFET :
/// un objet décodé, une valeur rendue, un magasin qui a changé d'état. Aucun ne
/// lit un texte source — trois vagues de ce chantier ont été réfutées par un
/// correctif neutralisé EN GARDANT les chaînes que les greps cherchaient, sous
/// 100 % de témoins verts.
///
/// Le RANG est load-bearing : les témoins visent le DEUXIÈME média d'un post
/// qui en porte quatre. Écrits sur le premier, ils ne pourraient PAS tomber —
/// au rang 1, « le premier média » et « celui qu'on a nommé » rendent le même
/// verdict (leçon 261).
final class CommentQuotedMediaTests: XCTestCase {

    // MARK: - Fixtures

    private static let deuxieme = "507f1f77bcf86cd799439102"

    /// Un commentaire SERVI par la passerelle, avec les DEUX moitiés de la
    /// citation sous les deux clés que le fil porte réellement.
    private func jsonCommentaire(
        quotedPostMedia: String?,
        quotedMedia: String?
    ) -> Data {
        var morceaux = [
            "\"id\":\"c-1\"",
            "\"content\":\"celle-là est floue\"",
            "\"createdAt\":\"2026-09-15T10:00:00.000Z\"",
            "\"author\":{\"id\":\"u-1\",\"name\":\"Ada\",\"username\":\"ada\"}",
        ]
        if let quotedPostMedia { morceaux.append("\"quotedPostMedia\":\(quotedPostMedia)") }
        if let quotedMedia { morceaux.append("\"quotedMedia\":\(quotedMedia)") }
        return Data(("{" + morceaux.joined(separator: ",") + "}").utf8)
    }

    /// **Le décodeur de la PRODUCTION, jamais un plus strict.** La passerelle
    /// émet ses dates AVEC fractions de seconde (`Date.toISOString()` →
    /// `2026-09-15T10:00:00.000Z`), que la stratégie `.iso8601` de Foundation
    /// REFUSE sur les runtimes livrés — `APIClient.makeAPIPayloadDecoder()` est
    /// `internal` exactement pour cette raison, et son doc-comment le dit.
    ///
    /// Un décodeur fabriqué ici passait sur iOS 26.1 et tombait sur iOS 18.2,
    /// c'est-à-dire sur la moitié basse de la fourchette que le dépôt supporte
    /// (iOS 16→26) : le témoin mesurait alors la tolérance du RUNTIME, pas la
    /// citation.
    private func decode(_ data: Data) throws -> APIPostComment {
        try APIClient.makeAPIPayloadDecoder().decode(APIPostComment.self, from: data)
    }

    // MARK: - Le fil porte DEUX moitiés, et un seul site les recolle

    func test_quotedCitation_recolleLAncreEtLeMediaRelu() throws {
        let json = jsonCommentaire(
            quotedPostMedia: "{\"postMediaId\":\"\(Self.deuxieme)\",\"kind\":\"image\"}",
            quotedMedia: """
            {"id":"\(Self.deuxieme)","mimeType":"image/jpeg","fileUrl":"https://cdn/2.jpg",
             "thumbnailUrl":"https://cdn/2-thumb.jpg","caption":"la deuxième","order":1}
            """
        )
        let citation = try XCTUnwrap(decode(json).quotedCitation)

        XCTAssertEqual(citation.postMediaId, Self.deuxieme)
        XCTAssertEqual(citation.kind, .image)
        XCTAssertEqual(citation.thumbnailURL, "https://cdn/2-thumb.jpg")
        XCTAssertEqual(citation.legende, "la deuxième")
    }

    /// Le cas NOMINAL d'un média supprimé ou détaché : le serveur ne rattrape
    /// que ce qui appartient encore au post commenté.
    func test_mediaDisparu_laCitationResteEtDitSaNATURE() throws {
        let json = jsonCommentaire(
            quotedPostMedia: "{\"postMediaId\":\"\(Self.deuxieme)\",\"kind\":\"video\"}",
            quotedMedia: nil
        )
        let citation = try XCTUnwrap(decode(json).quotedCitation)

        XCTAssertEqual(citation.postMediaId, Self.deuxieme, "l'ancre du saut survit")
        XCTAssertEqual(citation.kind, .video)
        XCTAssertNil(citation.thumbnailURL, "rien de descriptif ne doit fuir")
        XCTAssertEqual(citation.legende, "Une vidéo", "la nature, et rien de plus")
    }

    /// Une nature INCONNUE d'une version ultérieure ne doit pas faire échouer le
    /// décodage du commentaire ENTIER — elle vaut « une pièce jointe ».
    func test_natureInconnue_neCassePasLeDecodageDuCommentaire() throws {
        let json = jsonCommentaire(
            quotedPostMedia: "{\"postMediaId\":\"\(Self.deuxieme)\",\"kind\":\"hologramme\"}",
            quotedMedia: nil
        )
        let commentaire = try decode(json)

        XCTAssertEqual(commentaire.content, "celle-là est floue")
        XCTAssertEqual(commentaire.quotedCitation?.kind, .file)
    }

    func test_nonRegression_unCommentaireSansCitationNEnFabriquePasUne() throws {
        let commentaire = try decode(jsonCommentaire(quotedPostMedia: nil, quotedMedia: nil))
        XCTAssertNil(commentaire.quotedCitation)
    }

    // MARK: - La légende sert le RELU, jamais le figé

    func test_legende_preferLaLegendeRELUE_puisRetombeSurLaNature() {
        let avecLegende = CommentQuotedMedia(
            postMediaId: Self.deuxieme, kind: .image,
            media: FeedMedia(id: Self.deuxieme, type: .image, url: "https://cdn/2.jpg",
                             thumbnailUrl: nil, thumbnailColor: "#000000", caption: "la deuxième")
        )
        XCTAssertEqual(avecLegende.legende, "la deuxième")

        let sansLegende = CommentQuotedMedia(
            postMediaId: Self.deuxieme, kind: .image,
            media: FeedMedia(id: Self.deuxieme, type: .image, url: "https://cdn/2.jpg",
                             thumbnailUrl: nil, thumbnailColor: "#000000", caption: "   ")
        )
        XCTAssertEqual(sansLegende.legende, "Une photo",
                       "une légende blanche n'est pas une légende")
    }

    /// `thumbnailURL` retombe sur l'URL pleine quand la vignette manque — un
    /// média fraîchement téléversé n'a pas encore la sienne, et la citation ne
    /// doit pas s'afficher vide pour autant.
    func test_thumbnailURL_retombeSurLUrlPleine() {
        let citation = CommentQuotedMedia(
            postMediaId: Self.deuxieme, kind: .image,
            media: FeedMedia(id: Self.deuxieme, type: .image, url: "https://cdn/2.jpg",
                             thumbnailUrl: nil, thumbnailColor: "#000000")
        )
        XCTAssertEqual(citation.thumbnailURL, "https://cdn/2.jpg")
    }

    // MARK: - L'égalité DÉCIDE du repaint d'une ligne

    func test_egalite_changeQuandLaVignetteRELUEChange() {
        let avant = CommentQuotedMedia(
            postMediaId: Self.deuxieme, kind: .image,
            media: FeedMedia(id: Self.deuxieme, type: .image, url: nil,
                             thumbnailUrl: "https://cdn/2-thumb.jpg", thumbnailColor: "#000000")
        )
        let apres = CommentQuotedMedia(
            postMediaId: Self.deuxieme, kind: .image,
            media: FeedMedia(id: Self.deuxieme, type: .image, url: nil,
                             thumbnailUrl: "https://cdn/recadree.jpg", thumbnailColor: "#000000")
        )
        XCTAssertNotEqual(avant, apres,
                          "sans cela, une ligne de liste ne repeint JAMAIS une citation relue")
    }

    func test_egalite_changeQuandLaLegendeRELUEChange() {
        let base = FeedMedia(id: Self.deuxieme, type: .image, url: nil,
                             thumbnailUrl: "https://cdn/2-thumb.jpg", thumbnailColor: "#000000")
        var corrigee = base
        corrigee.caption = "légende corrigée"

        XCTAssertNotEqual(
            CommentQuotedMedia(postMediaId: Self.deuxieme, kind: .image, media: base),
            CommentQuotedMedia(postMediaId: Self.deuxieme, kind: .image, media: corrigee)
        )
    }

    // MARK: - Le magasin : DÉSIGNER n'écrit rien, mais doit se retrouver

    @MainActor
    func test_magasin_uneDesignationSeRetrouveSousSonPostEtNULLEPartAilleurs() {
        let magasin = CommentQuotationStore.shared
        magasin.clear(for: "post-A")
        magasin.clear(for: "post-B")

        let citation = CommentQuotedMedia(postMediaId: Self.deuxieme, kind: .image)
        magasin.designate(citation, for: "post-A")

        XCTAssertEqual(magasin.quotation(for: "post-A")?.postMediaId, Self.deuxieme)
        XCTAssertNil(magasin.quotation(for: "post-B"),
                     "deux posts ouverts ne partagent pas de sujet")

        magasin.clear(for: "post-A")
        XCTAssertNil(magasin.quotation(for: "post-A"),
                     "l'envoi DOIT effacer, sinon le commentaire suivant cite le précédent")
    }

    @MainActor
    func test_magasin_uneSecondeDesignationREMPLACELaPremiere() {
        let magasin = CommentQuotationStore.shared
        magasin.clear(for: "post-C")

        magasin.designate(CommentQuotedMedia(postMediaId: "m-1", kind: .image), for: "post-C")
        magasin.designate(CommentQuotedMedia(postMediaId: "m-2", kind: .video), for: "post-C")

        XCTAssertEqual(magasin.quotation(for: "post-C")?.postMediaId, "m-2",
                       "un commentaire cite UN média : accumuler promettrait ce que l'envoi ne tient pas")
        magasin.clear(for: "post-C")
    }

    // MARK: - Ce que la requête MET SUR LE FIL

    /// Le serveur attend un OBJET `quotedPostMedia: { postMediaId }` et REFUSE
    /// en 400 un média étranger au post commenté : une clé plate ferait échouer
    /// l'envoi ENTIER, pas seulement la citation.
    func test_requete_envoieLANCRE_dansUnObjet_etRienDautre() throws {
        let corps = CreateCommentRequest(
            content: "celle-là est floue",
            quotedPostMediaId: Self.deuxieme
        )
        let json = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(corps)
        ) as? [String: Any]

        let ancre = try XCTUnwrap(json?["quotedPostMedia"] as? [String: Any])
        XCTAssertEqual(ancre["postMediaId"] as? String, Self.deuxieme)
        XCTAssertEqual(ancre.count, 1,
                       "la NATURE est dérivée du MIME par le serveur — un client qui la déclarerait pourrait faire dire « un fichier » à une vidéo, pour toujours")
    }

    func test_requete_nEcritAucuneCleQuandOnNeCiteRien() throws {
        let corps = CreateCommentRequest(content: "bravo")
        let json = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(corps)
        ) as? [String: Any]

        XCTAssertNil(json?["quotedPostMedia"],
                     "le champ est OPTIONNEL : aucun commentaire existant ne change de forme")
    }

    /// **N médias joints arrivent tous** — le bandeau ne ment plus.
    func test_requete_porteTOUSLesMediasJoints() throws {
        let trois = ["m-1", "m-2", "m-3"]
        let corps = CreateCommentRequest(content: "mes trois photos", attachmentIds: trois)
        let json = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(corps)
        ) as? [String: Any]

        XCTAssertEqual(json?["attachmentIds"] as? [String], trois)
    }

    // MARK: - La file DURABLE transporte la même ancre

    /// Un commentaire écrit hors ligne doit citer le même média à son rejeu :
    /// la citation ne peut pas se perdre au moment précis où l'utilisateur ne
    /// peut pas la refaire.
    func test_fileDurable_rejoueLaCitationSousLaFormeQueLeServeurLIT() throws {
        let charge = CreateCommentPayload(
            clientMutationId: "cmid-1", postId: "post-1", parentCommentId: nil,
            content: "celle-là est floue", originalLanguage: "fr",
            quotedPostMediaId: Self.deuxieme
        )
        let json = try JSONSerialization.jsonObject(
            with: try CreateCommentBody.encoded(for: charge)
        ) as? [String: Any]

        let ancre = try XCTUnwrap(json?["quotedPostMedia"] as? [String: Any])
        XCTAssertEqual(ancre["postMediaId"] as? String, Self.deuxieme)
    }

    func test_fileDurable_uneLigneGraveeAVANTLeChampRejoueSansLaCle() throws {
        let charge = CreateCommentPayload(
            clientMutationId: "cmid-2", postId: "post-1", parentCommentId: nil,
            content: "bravo", originalLanguage: nil
        )
        let json = try JSONSerialization.jsonObject(
            with: try CreateCommentBody.encoded(for: charge)
        ) as? [String: Any]

        XCTAssertNil(json?["quotedPostMedia"])
    }

    /// La file est relue en `try?` : un champ requis au décodage ferait
    /// disparaître SANS ERREUR toute la file gravée avant la mise à jour.
    func test_fileDurable_relitUnBlobGraveAvantLeChamp() throws {
        let ancien = Data("""
        {"clientMutationId":"cmid-3","postId":"post-1","content":"bravo"}
        """.utf8)
        let charge = try JSONDecoder().decode(CreateCommentPayload.self, from: ancien)

        XCTAssertEqual(charge.content, "bravo")
        XCTAssertNil(charge.quotedPostMediaId)
    }
}
