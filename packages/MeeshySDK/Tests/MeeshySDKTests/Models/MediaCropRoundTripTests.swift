import XCTest
@testable import MeeshySDK

/// #5085 — **le recadrage voyage, et son absence se restitue.**
///
/// Ce que ces témoins gardent n'est pas la sérialisation : c'est le CONTRAT
/// implicite du payload v3, qui est permissif (`z.record(string, unknown)`)
/// et n'oppose donc AUCUN garde-fou à une clé mal orthographiée ou à moitié
/// écrite. Rien ne rougirait côté schéma ; le média arriverait simplement non
/// recadré chez le lecteur, ce que personne ne remarquerait avant de le voir.
final class MediaCropRoundTripTests: XCTestCase {

    private func media(crop: MediaCropRect?) -> StoryMediaObject {
        var m = StoryMediaObject(id: "m1", aspectRatio: 1)
        m.crop = crop
        return m
    }

    /// L'aller-retour REEL du dépôt : `CanvasV3(migrating:)` puis
    /// `StoryEffects(rendering:sceneIndex:)`. C'est le chemin que la
    /// publication emprunte, pas une sérialisation de test.
    private func roundTrip(_ effets: StoryEffects) -> StoryEffects {
        StoryEffects(rendering: CanvasV3(migrating: effets), sceneIndex: 0)
    }

    private func effects(with media: StoryMediaObject) -> StoryEffects {
        var e = StoryEffects()
        e.mediaObjects = [media]
        return e
    }

    /// Le cas nominal : un recadrage survit à l'aller-retour.
    func test_unRecadrage_survitÀLAllerRetour() throws {
        let posé = MediaCropRect(x: 0.1, y: 0.2, width: 0.5, height: 0.6)
        let rendu = roundTrip(effects(with: media(crop: posé)))
        let relu = try XCTUnwrap(rendu.mediaObjects?.first?.crop)
        XCTAssertEqual(relu.x, 0.1, accuracy: 0.0001)
        XCTAssertEqual(relu.y, 0.2, accuracy: 0.0001)
        XCTAssertEqual(relu.width, 0.5, accuracy: 0.0001)
        XCTAssertEqual(relu.height, 0.6, accuracy: 0.0001)
    }

    /// **Le cadre ENTIER est omis du fil, et son absence le restitue.** C'est la
    /// doctrine de ce convertisseur pour tous ses défauts ; l'écrire quand même
    /// gonflerait chaque objet média d'une publication de quatre nombres qui ne
    /// disent rien.
    func test_leCadreEntier_neVoyagePas_etSonAbsenceLeRestitue() throws {
        for posé in [MediaCropRect.full, nil] {
            let rendu = roundTrip(effects(with: media(crop: posé)))
            XCTAssertNil(rendu.mediaObjects?.first?.crop,
                         "un cadre entier ne doit pas voyager")
        }
    }

    /// **Un rectangle qui déborde est RAMENÉ à la lecture.** Le payload v3 est
    /// permissif par contrat : un producteur tiers, ou une version future, peut
    /// y écrire n'importe quoi sans que le schéma s'y oppose. La borne se pose
    /// donc chez le LECTEUR, seul endroit qui la garantisse.
    func test_unRectangleAberrant_estRamenéÀLaLecture() throws {
        let rendu = roundTrip(effects(with: media(
            crop: MediaCropRect(x: -1, y: 0.5, width: 9, height: 9))))
        let relu = try XCTUnwrap(rendu.mediaObjects?.first?.crop)
        XCTAssertGreaterThanOrEqual(relu.x, 0)
        XCTAssertLessThanOrEqual(relu.x + relu.width, 1.0001)
        XCTAssertLessThanOrEqual(relu.y + relu.height, 1.0001)
    }
}
