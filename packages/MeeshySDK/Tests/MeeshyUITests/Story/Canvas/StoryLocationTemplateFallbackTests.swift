import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #4717 — **la pastille de lieu devient un gabarit, sans changer un pixel.**
///
/// Le dessin codé en dur dans `StoryLocationLayer` est devenu le gabarit
/// `location.pill` du `StickerTemplateRenderer`. Ce n'est pas un AJOUT à côté
/// de l'ancien chemin : c'est un REMPLACEMENT, et c'est ce qui évite la jumelle
/// — il n'existe pas « l'ancien rendu » quelque part.
///
/// Ces témoins prouvent les deux moitiés : le repli mène au MÊME dessin, et il
/// est fail-closed dans les deux sens où il peut manquer.
@MainActor
final class StoryLocationTemplateFallbackTests: XCTestCase {

    private let canvas = CGSize(width: 402, height: 715)

    private func lieu(styleId: String?) -> StoryLocationObject {
        StoryLocationObject(
            id: "loc-1",
            place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                               name: "Le Marais", address: "Paris"),
            x: 0.5, y: 0.8,
            styleId: styleId)
    }

    private func rendu(_ location: StoryLocationObject) -> Data? {
        let (image, _) = StoryLocationLayer.templateImage(
            for: location,
            geometry: CanvasGeometry(renderSize: canvas),
            screenScale: 2)
        return image?.pngData()
    }

    // MARK: - Le repli mène au même dessin

    /// **Toute pastille publiée avant ce lot porte `styleId == nil`.** Elle doit
    /// rendre EXACTEMENT ce que rend `location.pill` — pas « quelque chose de
    /// semblable » : les mêmes octets, parce que c'est le même chemin.
    func test_nilStyleId_rendersTheVeryPillTemplate() throws {
        let ancien = try XCTUnwrap(rendu(lieu(styleId: nil)))
        let explicite = try XCTUnwrap(rendu(lieu(styleId: "location.pill")))
        XCTAssertEqual(ancien, explicite,
                       "Le repli doit EMPRUNTER le gabarit, pas en imiter un second.")
    }

    func test_nilStyleId_resolvesToThePillTemplateID() {
        XCTAssertEqual(StoryLocationLayer.resolvedTemplateID(nil),
                       StickerTemplateCatalog.defaultLocationTemplateID)
    }

    // MARK: - Fail-closed, dans les DEUX sens où le style peut manquer

    /// Un contenu publié par une version plus récente peut nommer un gabarit que
    /// ce binaire ne connaît pas. Le lieu s'affiche quand même — moins joliment
    /// que chez l'auteur, jamais absent.
    func test_unknownStyleId_fallsBackToThePill() throws {
        XCTAssertEqual(StoryLocationLayer.resolvedTemplateID("venu.du.futur"),
                       StickerTemplateCatalog.defaultLocationTemplateID)
        let inconnu = try XCTUnwrap(rendu(lieu(styleId: "venu.du.futur")))
        let pastille = try XCTUnwrap(rendu(lieu(styleId: "location.pill")))
        XCTAssertEqual(inconnu, pastille)
    }

    /// **Le second sens, celui qu'on oublie** : un `styleId` qui existe mais
    /// nomme une AUTRE famille. « time.digital » sur une pastille de lieu ne
    /// doit pas dessiner une horloge à la place d'un lieu — un id valide n'est
    /// pas un id pertinent.
    func test_styleIdOfAnotherFamily_fallsBackToThePill() throws {
        XCTAssertNotNil(StickerTemplateCatalog.template(id: "time.digital"),
                        "témoin sans objet si l'id n'existe pas")
        XCTAssertEqual(StoryLocationLayer.resolvedTemplateID("time.digital"),
                       StickerTemplateCatalog.defaultLocationTemplateID)
    }

    // MARK: - Les emplacements

    /// Un point posé à la main dont le géocodage inverse n'a rien rendu garde
    /// une étiquette : le repli localisé « Ici » entre au remplissage, pas au
    /// dessin — `MeeshySDK` n'a aucune ressource de localisation.
    func test_namelessPlace_stillCarriesALabel() {
        let sansNom = SharedPlace(latitude: 1, longitude: 1, name: nil, address: nil)
        let emplacements = StoryLocationLayer.templateSlots(for: sansNom)
        XCTAssertFalse((emplacements[StickerSlotFiller.placeNameSlot] ?? "").isEmpty)
    }

    func test_namedPlace_carriesItsNameNotItsAddress() {
        let emplacements = StoryLocationLayer.templateSlots(
            for: SharedPlace(latitude: 1, longitude: 1, name: "Le Marais", address: "Paris"))
        XCTAssertEqual(emplacements[StickerSlotFiller.placeNameSlot], "Le Marais")
    }

    // MARK: - La mesure reste UNE

    /// Le reader pose ses cibles de tap avec `badgeFrame` ; le rendu pose ses
    /// `bounds` avec `templateImage`. Les deux passent par `templateSize` — les
    /// laisser mesurer séparément ferait dériver la zone tapable du pixel
    /// affiché sans qu'aucun témoin ne rougisse.
    func test_measureAndDraw_agreeOnTheSameSize() {
        let location = lieu(styleId: nil)
        let géométrie = CanvasGeometry(renderSize: canvas)
        let mesurée = StoryLocationLayer.templateSize(for: location, geometry: géométrie)
        let (_, dessinée) = StoryLocationLayer.templateImage(for: location,
                                                             geometry: géométrie,
                                                             screenScale: 2)
        XCTAssertEqual(mesurée.width, dessinée.width, accuracy: 0.01)
        XCTAssertEqual(mesurée.height, dessinée.height, accuracy: 0.01)
    }

    /// **Le styleId voyage.** Un champ ajouté au modèle qui ne traverse pas le
    /// codage serait perdu à la première relecture du brouillon.
    func test_styleId_survivesTheRoundTrip() throws {
        let posé = lieu(styleId: "location.postcard")
        let relu = try JSONDecoder().decode(
            StoryLocationObject.self, from: JSONEncoder().encode(posé))
        XCTAssertEqual(relu.styleId, "location.postcard")
    }

    /// Une pastille écrite avant ce lot n'a pas la clé — et se relit sans style.
    func test_legacyPayload_decodesWithoutStyle() throws {
        let json = Data("""
        {"id":"l1","place":{"latitude":1,"longitude":2},"x":0.5,"y":0.8,"scale":1,"rotation":0}
        """.utf8)
        let relu = try JSONDecoder().decode(StoryLocationObject.self, from: json)
        XCTAssertNil(relu.styleId)
    }
}
