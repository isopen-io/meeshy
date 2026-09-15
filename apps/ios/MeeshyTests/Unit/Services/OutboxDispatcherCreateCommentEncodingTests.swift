import XCTest
import MeeshySDK
@testable import Meeshy

/// Le corps de `POST /posts/:postId/comments` tel que la file durable l'émet.
///
/// C'est l'ULTIME saut d'un commentaire rejoué hors-ligne : ce que cet encodeur
/// n'écrit pas n'atteint jamais le serveur, quelle que soit la richesse du
/// payload persisté. Le voyage de la langue d'écriture (#6587) a été câblé de la
/// pastille jusqu'à `CreateCommentPayload.originalLanguage` sans qu'AUCUN témoin
/// n'interroge ce dernier mètre — retirer la clé d'ici ne faisait rougir nulle
/// part, et le serveur serait retombé sur sa devinette de mots
/// (`detectLanguage`) en silence, pour tous les lecteurs de ce commentaire.
///
/// Même patron que `OutboxDispatcherToggleLikePostEncodingTests` et
/// `OutboxDispatcherMarkAsReadEncodingTests` : on interroge les OCTETS, jamais
/// la propriété du payload.
final class OutboxDispatcherCreateCommentEncodingTests: XCTestCase {

    private func makePayload(originalLanguage: String?) -> CreateCommentPayload {
        CreateCommentPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000042",
            postId: "post-1",
            parentCommentId: nil,
            content: "Ceci a tout l'air d'être écrit en français",
            originalLanguage: originalLanguage
        )
    }

    private func json(for payload: CreateCommentPayload) throws -> [String: Any] {
        let data = try CreateCommentBody.encoded(for: payload)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Langue d'écriture (#6587)

    /// Le contenu est du français reconnaissable et la langue DÉCLARÉE est
    /// l'allemand : si la clé n'était pas écrite, le gateway devinerait « fr »
    /// et servirait la mauvaise source à tous les prismes. Le témoin ne peut
    /// donc pas verdir pour un motif étranger à ce qu'il mesure.
    func test_encoded_carriesTheAuthoredLanguage_whenThePayloadDeclaresOne() throws {
        let body = try json(for: makePayload(originalLanguage: "de"))

        XCTAssertEqual(body["originalLanguage"] as? String, "de",
                       "La langue déclarée par la pastille doit atteindre le corps HTTP.")
        XCTAssertEqual(body["content"] as? String, "Ceci a tout l'air d'être écrit en français")
    }

    /// Une ligne d'outbox gravée AVANT le champ se relit avec `originalLanguage
    /// == nil` : elle doit rejouer SANS la clé, pas avec un `null`. Le gateway
    /// applique alors son repli `detectLanguage`, exactement comme avant — un
    /// `null` explicite est une autre valeur, et `CreateCommentSchema` la
    /// refuserait.
    func test_encoded_omitsTheLanguageKey_whenThePayloadCarriesNone() throws {
        let body = try json(for: makePayload(originalLanguage: nil))

        XCTAssertNil(body["originalLanguage"],
                     "Sans langue déclarée, aucune clé ne part : le repli serveur doit s'appliquer.")
        XCTAssertFalse(body.keys.contains("originalLanguage"),
                       "La clé doit être ABSENTE, jamais présente à `null`.")
    }

    // MARK: - Ce qui voyage À CÔTÉ de la langue

    /// Les trois autres champs que ce corps porte ont chacun été perdus à ce
    /// même mètre du fil par le passé. On les épingle ensemble : un encodeur
    /// n'est juste que sur la TOTALITÉ de ce qu'il remet.
    func test_encoded_carriesTheParentAndTheEffects_whenTheyArePresent() throws {
        let payload = CreateCommentPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000043",
            postId: "post-1",
            parentCommentId: "comment-parent",
            content: "une réponse",
            originalLanguage: "en",
            effectFlags: 65536
        )

        let body = try json(for: payload)

        XCTAssertEqual(body["parentId"] as? String, "comment-parent")
        XCTAssertEqual(body["effectFlags"] as? Int, 65536)
        XCTAssertEqual(body["originalLanguage"] as? String, "en")
    }

    /// Un commentaire racine sans effets n'écrit ni `parentId` ni `effectFlags`
    /// — le gateway distingue « absent » de « null » sur les deux.
    func test_encoded_omitsTheOptionalKeys_whenTheyAreAbsent() throws {
        let body = try json(for: makePayload(originalLanguage: "de"))

        XCTAssertFalse(body.keys.contains("parentId"))
        XCTAssertFalse(body.keys.contains("effectFlags"))
        XCTAssertFalse(body.keys.contains("location"))
    }
}
