import XCTest
@testable import MeeshySDK

/**
 **UNE TRADUCTION MALFORMÉE NE DOIT PAS EMPORTER LA PAGE** — audit de cohérence
 iOS ↔ passerelle, 2026-09-11.

 `Message.translations` est une colonne JSON Mongo relue SANS validation par la
 passerelle (`transformTranslationsToArray`). Une entrée écrite par une version
 antérieure, ou par un translator tombé entre deux champs, n'a pas forcément de
 `text` ni de `translationModel` — et le schéma wire ne déclarant pas ces
 propriétés `nullable`, `fast-json-stringify` les OMET plutôt que de les servir
 vides.

 Le décodage était alors strict deux fois :

 - `APITextTranslation.translationModel` était non optionnel — un champ que
   AUCUNE surface ne lit (relevé sur tout le dépôt : seuls des tests) ;
 - `translations` se décodait d'un bloc — une entrée refusée faisait échouer le
   message entier, puis `MessagesResponse.data` (`[APIMessage]`, décodé d'un
   bloc lui aussi), donc **toute la page**.

 Une ligne malformée en base ouvrait une conversation VIDE. La passerelle ne
 sert plus d'entrée sans texte (son propre témoin) ; ces témoins-ci mesurent
 l'autre moitié — celle qui protège d'une malformation que personne n'a prévue.

 Le décodeur est celui de la PRODUCTION, comme dans `APIMessageStickerTests`.
 */
final class MessageTranslationsToleranceTests: XCTestCase {

    private func decodeMessage(_ json: String) throws -> APIMessage {
        try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))
    }

    private static let tete = """
    "id":"m1","conversationId":"c1","senderId":"u1","content":"Hello",
    "createdAt":"2026-09-11T10:00:00.000Z"
    """

    private static func traduction(_ corps: String) -> String {
        #"{"id":"m1-x","messageId":"m1","targetLanguage":"xx",\#(corps)}"#
    }

    /**
     LE TÉMOIN DE LA RÉGRESSION. Deux traductions, une infirme : le message
     survit, et la bonne traduction est servie.
     */
    func test_uneTraductionInfirme_estPerdueSeule_jamaisLeMessage() throws {
        let message = try decodeMessage("""
        {\(Self.tete),
         "translations":[
           {"id":"m1-es","messageId":"m1","targetLanguage":"es","translationModel":"premium"},
           {"id":"m1-fr","messageId":"m1","targetLanguage":"fr","translatedContent":"Bonjour","translationModel":"premium"}
         ]}
        """)
        let traductions = try XCTUnwrap(message.translations)
        XCTAssertEqual(traductions.count, 1)
        XCTAssertEqual(traductions[0].targetLanguage, "fr")
        XCTAssertEqual(traductions[0].translatedContent, "Bonjour")
    }

    /**
     ET LA MOITIÉ SYMÉTRIQUE : un MODÈLE absent ne coûte pas la traduction. La
     rendre facultative n'est pas un relâchement — c'est la seule façon de ne
     pas perdre un texte qu'on a pour une étiquette qu'on n'a pas.
     */
    func test_unModeleAbsent_neCouteRien_laTraductionEstServie() throws {
        let message = try decodeMessage("""
        {\(Self.tete),
         "translations":[\(Self.traduction(#""translatedContent":"Ciao""#))]}
        """)
        let traductions = try XCTUnwrap(message.translations)
        XCTAssertEqual(traductions.count, 1)
        XCTAssertEqual(traductions[0].translatedContent, "Ciao")
        XCTAssertNil(traductions[0].translationModel)
    }

    /// Le cas nominal ne bouge pas — c'est ce qu'une garde doit prouver d'abord.
    func test_leCasNominal_decodeToutesLesTraductions() throws {
        let message = try decodeMessage("""
        {\(Self.tete),
         "translations":[
           {"id":"m1-fr","messageId":"m1","targetLanguage":"fr","translatedContent":"Bonjour","translationModel":"premium"},
           {"id":"m1-es","messageId":"m1","targetLanguage":"es","translatedContent":"Hola","translationModel":"basic"}
         ]}
        """)
        XCTAssertEqual(message.translations?.count, 2)
        XCTAssertEqual(message.translations?[1].translationModel, "basic")
    }

    /// Toutes infirmes ⇒ un tableau VIDE, pas `nil` et surtout pas une erreur :
    /// le message reste lisible dans sa langue d'origine.
    func test_toutesInfirmes_rendUnTableauVide_etLeMessageTient() throws {
        let message = try decodeMessage("""
        {\(Self.tete),
         "translations":[{"id":"m1-es","messageId":"m1","targetLanguage":"es"}]}
        """)
        XCTAssertEqual(message.translations?.count, 0)
        XCTAssertEqual(message.content, "Hello")
    }

    /// Clé absente ⇒ `nil`, comme `decodeIfPresent` avant le changement.
    func test_aucuneClefTranslations_resteNil() throws {
        let message = try decodeMessage("{\(Self.tete)}")
        XCTAssertNil(message.translations)
    }

    /**
     LA CITATION AUSSI. `APIMessageReplyTo` enveloppait son décodage dans un
     `try?` : une seule entrée infirme lui faisait perdre TOUTES ses
     traductions, et la citation repassait dans la langue de son auteur sans que
     rien ne le signale. Tolérance par ÉLÉMENT, là aussi.
     */
    func test_laCitation_perdLEntreeInfirme_pasSesAutresTraductions() throws {
        let message = try decodeMessage("""
        {\(Self.tete),
         "replyTo":{"id":"m0","content":"Hi","translations":[
           {"id":"m0-es","messageId":"m0","targetLanguage":"es"},
           {"id":"m0-fr","messageId":"m0","targetLanguage":"fr","translatedContent":"Salut"}
         ]}}
        """)
        let citation = try XCTUnwrap(message.replyTo)
        XCTAssertEqual(citation.translations?.count, 1)
        XCTAssertEqual(citation.translations?[0].translatedContent, "Salut")
    }
}
