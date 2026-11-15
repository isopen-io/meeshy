import XCTest
@testable import MeeshySDK

/// #18020 — **le réglage fin d'une ambiance** (dose, chaleur, contraste) est un
/// réglage du look comme les autres : gardé au brouillon, relu à l'identique,
/// absent d'un look qui ne le porte pas.
final class StoryMediaLookTuningTests: XCTestCase {

    private func dose() -> StoryMediaLook {
        StoryMediaLook(filterPreset: "golden", filterIntensity: 0.6, warmth: 0.4, contrast: -0.3)
    }

    func test_codable_reglage_seRelitALIdentique() throws {
        let relu = try JSONDecoder().decode(StoryMediaLook.self, from: JSONEncoder().encode(dose()))
        XCTAssertEqual(relu, dose())
    }

    func test_codable_sansReglage_neDeclareAucuneCle() throws {
        let json = String(decoding: try JSONEncoder().encode(StoryMediaLook(filterPreset: "golden")), as: UTF8.self)
        XCTAssertFalse(json.contains("filterIntensity"))
        XCTAssertFalse(json.contains("warmth"))
        XCTAssertFalse(json.contains("contrast"))
    }

    func test_decode_reglageIllisible_gardeLeReste() throws {
        let json = #"{"filterPreset":"golden","warmth":"chaud"}"#
        let relu = try JSONDecoder().decode(StoryMediaLook.self, from: Data(json.utf8))
        XCTAssertEqual(relu.filterPreset, "golden")
        XCTAssertNil(relu.warmth)
    }

    func test_canvasPayload_reglage_faitLAllerRetour() {
        XCTAssertEqual(StoryMediaLook(canvasPayload: dose().canvasPayload), dose())
    }

    func test_documentV3_reglage_faitLAllerRetour() {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.look = dose()
        var effets = StoryEffects()
        effets.mediaObjects = [media]

        let relu = StoryEffects(rendering: CanvasV3(migrating: effets), sceneIndex: 0)

        XCTAssertEqual(relu.mediaObjects?.first?.look, dose())
    }

    func test_isNeutral_chaleurOuContraste_peignent() {
        XCTAssertFalse(StoryMediaLook(warmth: 0.2).isNeutral)
        XCTAssertFalse(StoryMediaLook(contrast: -0.5).isNeutral)
        XCTAssertTrue(StoryMediaLook(warmth: 0, contrast: 0).isNeutral)
    }

    func test_isNeutral_doseSansFiltre_nePeintRien() {
        XCTAssertTrue(StoryMediaLook(filterIntensity: 0.4).isNeutral)
    }

    func test_signature_distingueLeReglage_etGardeCelleDAvant() {
        XCTAssertEqual(StoryMediaLook(filterPreset: "warm").signature, "warm|-|-|-",
                       "un look sans réglage garde la clé d'avant : les caches restent chauds")
        XCTAssertNotEqual(dose().signature, StoryMediaLook(filterPreset: "golden").signature)
        XCTAssertNotEqual(dose().signature,
                          StoryMediaLook(filterPreset: "golden", filterIntensity: 0.6, warmth: 0.5, contrast: -0.3).signature)
    }

    func test_chargePubliee_neContientAucunReglage() throws {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.look = dose()
        var effets = StoryEffects()
        effets.mediaObjects = [media]

        let fil = String(decoding: try JSONEncoder().encode(effets.withoutMediaLooks), as: UTF8.self)

        XCTAssertFalse(fil.contains("warmth"), "le réglage est cuit, il ne part jamais au serveur")
    }
}
