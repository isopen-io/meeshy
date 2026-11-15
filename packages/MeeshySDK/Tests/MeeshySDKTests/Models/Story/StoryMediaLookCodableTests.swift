import XCTest
@testable import MeeshySDK

/// #13840 — **le look d'un média est un RÉGLAGE de l'objet, jamais des pixels.**
/// Il se persiste au brouillon (et donc dans l'historique d'annulation), se relit
/// à l'identique, et un brouillon ou une story d'avant ce champ se lit toujours.
final class StoryMediaLookCodableTests: XCTestCase {

    private func encoded(_ media: StoryMediaObject) throws -> [String: Any] {
        let data = try JSONEncoder().encode(media)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func decoded(_ json: String) throws -> StoryMediaObject {
        try JSONDecoder().decode(StoryMediaObject.self, from: Data(json.utf8))
    }

    private func richLook() -> StoryMediaLook {
        StoryMediaLook(filterPreset: "warm", frameId: "frame:joy.confetti.1", faceEffect: "angel",
                       framing: StoryMediaFraming(centerX: 0.4, centerY: 0.6, scale: 1.5))
    }

    func test_encode_lookPose_seRelitALIdentique() throws {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 0.75)
        media.look = richLook()

        let relu = try JSONDecoder().decode(StoryMediaObject.self, from: JSONEncoder().encode(media))

        XCTAssertEqual(relu.look, richLook())
    }

    func test_encode_sansLook_neDeclareAucuneCle() throws {
        let media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        XCTAssertNil(try encoded(media)["look"], "un média sans look garde la charge d'avant #13840")
    }

    func test_encode_lookNeutre_neDeclareAucuneCle() throws {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.look = StoryMediaLook()
        XCTAssertNil(try encoded(media)["look"], "un look revenu au neutre ne porte rien")
    }

    func test_decode_brouillonDAvantLeChamp_lookNil() throws {
        let media = try decoded(#"{"id":"m","mediaType":"image","aspectRatio":1.5,"filter":"vintage"}"#)
        XCTAssertNil(media.look)
        XCTAssertEqual(media.filter, "vintage", "le reste de l'ancien brouillon se lit à l'identique")
    }

    func test_decode_lookIllisible_neFaitPasTomberLeMedia() throws {
        let media = try decoded(#"{"id":"m","mediaType":"image","look":"garbage"}"#)
        XCTAssertEqual(media.id, "m")
        XCTAssertNil(media.look)
    }

    func test_decode_lookNeutre_seLitNil() throws {
        let media = try decoded(#"{"id":"m","mediaType":"image","look":{}}"#)
        XCTAssertNil(media.look)
    }

    func test_decode_identifiantsInconnus_sontGardesTelsQuels() throws {
        let media = try decoded(#"{"id":"m","mediaType":"video","look":{"filterPreset":"futur","frameId":"frame:x"}}"#)
        XCTAssertEqual(media.look?.filterPreset, "futur", "le SDK ne juge pas un identifiant opaque")
        XCTAssertEqual(media.look?.frameId, "frame:x")
    }

    func test_isNeutral_cadrageIdentite_estNeutre() {
        XCTAssertTrue(StoryMediaLook(framing: .identity).isNeutral)
        XCTAssertFalse(StoryMediaLook(framing: StoryMediaFraming(centerX: 0.5, centerY: 0.5, scale: 2)).isNeutral)
        XCTAssertFalse(StoryMediaLook(faceEffect: "toad").isNeutral)
    }

    func test_signature_distingueDeuxLooks() {
        let a = StoryMediaLook(filterPreset: "warm")
        let b = StoryMediaLook(filterPreset: "cool")
        XCTAssertNotEqual(a.signature, b.signature)
        XCTAssertEqual(a.signature, StoryMediaLook(filterPreset: "warm").signature)
    }

    func test_withoutLook_retireLeLookDeChaqueMediaDesEffets() {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.look = richLook()
        var effets = StoryEffects()
        effets.mediaObjects = [media]

        let envoyes = effets.withoutMediaLooks

        XCTAssertNil(envoyes.mediaObjects?.first?.look, "le look ne part jamais au fil")
        XCTAssertNotNil(effets.mediaObjects?.first?.look, "la copie dérivée ne touche pas l'original")
    }

    func test_documentV3_lookDeLAuteur_faitLAllerRetour() {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.look = richLook()
        var effets = StoryEffects()
        effets.mediaObjects = [media]

        let relu = StoryEffects(rendering: CanvasV3(migrating: effets), sceneIndex: 0)

        XCTAssertEqual(relu.mediaObjects?.first?.look, richLook(), "brouillon et annulation gardent le look")
    }

    func test_chargePubliee_neContientAucunLook() throws {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.look = richLook()
        var effets = StoryEffects()
        effets.mediaObjects = [media]

        let fil = String(decoding: try JSONEncoder().encode(effets.withoutMediaLooks), as: UTF8.self)

        XCTAssertFalse(fil.contains("\"look\""), "le look est cuit, il ne part jamais au serveur")
        XCTAssertTrue(String(decoding: try JSONEncoder().encode(effets), as: UTF8.self).contains("\"look\""),
                      "témoin de la mesure : sans retrait, le document de l'auteur le porte")
    }

    // MARK: - Les scènes SUIVANTES d'une publication à plusieurs scènes

    /// Une publication à deux scènes : la seconde vit dans le document v3
    /// gardé (`canvasV3`), et son média porte un look.
    private func deuxScenes() -> StoryEffects {
        var premier = StoryMediaObject(id: "a", kind: .image, aspectRatio: 1)
        premier.look = StoryMediaLook(filterPreset: "cool")
        var second = StoryMediaObject(id: "b", kind: .image, aspectRatio: 1)
        second.look = richLook()
        var sceneA = StoryEffects()
        sceneA.mediaObjects = [premier]
        var sceneB = StoryEffects()
        sceneB.mediaObjects = [second]
        var effets = sceneA
        effets.canvasV3 = CanvasV3(scenes: [CanvasV3(migrating: sceneA).scenes[0],
                                            CanvasV3(migrating: sceneB).scenes[0]])
        return effets
    }

    func test_withoutMediaLooks_sceneSuivanteDuDocument_neDeclareAucunLook() throws {
        let effets = deuxScenes()
        XCTAssertTrue(String(decoding: try JSONEncoder().encode(effets), as: UTF8.self).contains("joy.confetti"),
                      "témoin : le document de l'auteur porte le look de la seconde scène")

        let fil = String(decoding: try JSONEncoder().encode(effets.withoutMediaLooks), as: UTF8.self)

        XCTAssertFalse(fil.contains("\"look\""), "aucune scène ne part au fil avec un look")
        XCTAssertNotNil(effets.canvasV3?.mediaLooks["b"], "la copie dérivée ne touche pas le document de l'auteur")
    }

    func test_sanitizedForServerPublish_retireTousLesLooks() throws {
        let fil = String(decoding: try JSONEncoder().encode(deuxScenes().sanitizedForServerPublish()), as: UTF8.self)
        XCTAssertFalse(fil.contains("\"look\""),
                       "le filet du fil retient le look sur tout chemin de publication, story comme post")
    }

    func test_allMediaLooks_runtimeEtDocument_leRuntimePrime() {
        var effets = deuxScenes()
        effets.mediaObjects?[0].look = nil

        let looks = effets.allMediaLooks

        XCTAssertNil(looks["a"], "le runtime fait foi pour la scène courante, même revenue au neutre")
        XCTAssertEqual(looks["b"], richLook(), "le document fait foi pour les scènes suivantes")
    }
}
