import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le lieu d'un sticker se choisit à la position EXACTE** (#7922, directive
/// porteur 2026-09-25 : « permet de géolocaliser exactement et de chercher les
/// éléments autour de soi, et un accès à la carte »).
///
/// La section Lieu ne proposait que les points d'intérêt alentour : l'auteur
/// ne pouvait pas dire « ici », seulement « près du café d'à côté ».
@MainActor
final class StickerPlaceExactPositionTests: XCTestCase {

    func test_laPositionExacte_seNommeParSonNumeroEtSaRue() {
        let lieu = StickerNearbyPlaces.exactPlace(latitude: 48.8584, longitude: 2.2945,
                                                  number: "5", street: "Avenue Anatole France",
                                                  locality: "Paris")
        XCTAssertEqual(lieu.name, "5 Avenue Anatole France")
        XCTAssertEqual(lieu.address, "Paris")
        XCTAssertEqual(lieu.latitude, 48.8584, accuracy: 0.000001, "aucun arrondi : la position est EXACTE")
        XCTAssertEqual(lieu.longitude, 2.2945, accuracy: 0.000001)
    }

    func test_sansNumero_laRueSuffit() {
        let lieu = StickerNearbyPlaces.exactPlace(latitude: 1, longitude: 2,
                                                  number: nil, street: "Rue de Rivoli", locality: nil)
        XCTAssertEqual(lieu.name, "Rue de Rivoli")
        XCTAssertNil(lieu.address)
    }

    func test_sansRue_elleSAppelleMaPosition() {
        let lieu = StickerNearbyPlaces.exactPlace(latitude: 1, longitude: 2,
                                                  number: nil, street: nil, locality: "Douala")
        XCTAssertEqual(lieu.name, String(localized: "sticker.place.exact", defaultValue: "Ma position", bundle: .main))
        XCTAssertEqual(lieu.address, "Douala")
    }

    func test_laPositionExacte_passeEnTete_etLesLieuxProchesSuivent() {
        let ici = StickerNearbyPlaces.exactPlace(latitude: 1, longitude: 2, number: nil, street: "Ici", locality: nil)
        let café = SharedPlace(latitude: 1.001, longitude: 2, name: "Café", address: nil, category: nil)
        XCTAssertEqual(StickerNearbyPlaces.merged(exact: ici, nearby: [café]).map(\.name), ["Ici", "Café"])
        XCTAssertEqual(StickerNearbyPlaces.merged(exact: nil, nearby: [café]).map(\.name), ["Café"])
    }

    /// La recherche de la carte couvre ADRESSES et LIEUX nommés (monuments
    /// compris), autour de l'auteur d'abord.
    func test_laRechercheDeLaCarte_couvreAdressesEtLieux_autourDeSoi() {
        XCTAssertEqual(LocationSearchPlan.nearbyRadiusMeters, 1_000)
        XCTAssertEqual(LocationSearchPlan.searchRegionMeters, 20_000)
        XCTAssertEqual(LocationSearchPlan.maxResults, 8)
    }

    /// La feuille de stickers de la CONVERSATION n'injectait pas la carte :
    /// la puce « Ma position… » n'y était jamais rendue.
    func test_laFeuilleDeStickersDeLaConversation_ouvreLaCarte() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertTrue(source.contains(".storyLocationPickerProvided(accentColor: accentColor)"),
                      "la feuille de stickers de la conversation doit fournir la carte (#7922)")
    }
}
