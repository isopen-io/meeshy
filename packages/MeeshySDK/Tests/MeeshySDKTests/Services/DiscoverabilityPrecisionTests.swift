import XCTest
@testable import MeeshySDK

/// Le grain de découvrabilité DEMANDÉ au serveur — jamais appliqué ici.
///
/// Deux familles de témoins, pour deux affirmations distinctes :
/// 1. les valeurs brutes sont EXACTEMENT celles de l'énumération Zod du
///    gateway (`CreatePostSchema.discoverabilityPrecision`) — une divergence
///    de casse se solderait par un 400 VALIDATION_ERROR silencieux du point de
///    vue de l'utilisateur, qui verrait sa publication échouer sans savoir
///    pourquoi ;
/// 2. le grain REVENDIQUÉ ne peut pas être plus fin que celui de la
///    coordonnée réellement envoyée. Le picker de lieu dégrade déjà le
///    `SharedPlace` selon `LocationPrecision` AVANT de le remettre au composer
///    (`LocationPickerModel.sharedPlace(at:)`) : revendiquer « Exacte » sur un
///    point arrondi à ±11 km écrirait `geoPrecision = "EXACT"` sur une
///    coordonnée qui ne l'est pas. Ce n'est pas une fuite — c'est un MENSONGE
///    de contrat, qui fausse la carte de densité.
///
/// Ce second témoin porte sur le LIBELLÉ, jamais sur un chiffre : rien ici
/// n'arrondit une coordonnée. Le serveur reste le seul juge de la grille.
final class DiscoverabilityPrecisionTests: XCTestCase {

    // MARK: - 1. Contrat de valeurs brutes

    func test_rawValue_matchesGatewayEnum() {
        XCTAssertEqual(DiscoverabilityPrecision.exact.rawValue, "EXACT")
        XCTAssertEqual(DiscoverabilityPrecision.neighborhood.rawValue, "NEIGHBORHOOD")
        XCTAssertEqual(DiscoverabilityPrecision.city.rawValue, "CITY")
        XCTAssertEqual(DiscoverabilityPrecision.region.rawValue, "REGION")
    }

    func test_allCases_areOrderedFinestToCoarsest() {
        XCTAssertEqual(DiscoverabilityPrecision.allCases, [.exact, .neighborhood, .city, .region])
    }

    func test_encodesAsItsGatewayRawString() throws {
        let data = try JSONEncoder().encode(["p": DiscoverabilityPrecision.neighborhood])
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["p"] as? String, "NEIGHBORHOOD")
    }

    // MARK: - 2. Le libellé ne peut pas dépasser la coordonnée envoyée

    func test_allowedTiers_whenSharingPrecisionIsExact_returnsAllFour() {
        XCTAssertEqual(
            DiscoverabilityPrecision.allowedTiers(under: .exact),
            [.exact, .neighborhood, .city, .region]
        )
    }

    func test_allowedTiers_whenSharingPrecisionIsAround_excludesOnlyExact() {
        XCTAssertEqual(
            DiscoverabilityPrecision.allowedTiers(under: .around),
            [.neighborhood, .city, .region]
        )
    }

    func test_allowedTiers_whenSharingPrecisionIsNeighborhood_keepsNeighborhood() {
        XCTAssertEqual(
            DiscoverabilityPrecision.allowedTiers(under: .neighborhood),
            [.neighborhood, .city, .region]
        )
    }

    func test_allowedTiers_whenSharingPrecisionIsCity_excludesExactAndNeighborhood() {
        XCTAssertEqual(
            DiscoverabilityPrecision.allowedTiers(under: .city),
            [.city, .region]
        )
    }

    func test_allowedTiers_neverEmpty_soThereIsAlwaysSomethingToOffer() {
        for sharing in LocationPrecision.allCases {
            XCTAssertFalse(DiscoverabilityPrecision.allowedTiers(under: sharing).isEmpty,
                           "aucun palier offert sous \(sharing.rawValue)")
        }
    }

    func test_clamped_whenMemorizedTierIsFinerThanAllowed_returnsFinestAllowed() {
        XCTAssertEqual(DiscoverabilityPrecision.exact.clamped(under: .city), .city)
        XCTAssertEqual(DiscoverabilityPrecision.neighborhood.clamped(under: .city), .city)
        XCTAssertEqual(DiscoverabilityPrecision.exact.clamped(under: .around), .neighborhood)
    }

    func test_clamped_whenTierIsAlreadyCoarseEnough_isIdentity() {
        XCTAssertEqual(DiscoverabilityPrecision.region.clamped(under: .city), .region)
        XCTAssertEqual(DiscoverabilityPrecision.city.clamped(under: .city), .city)
        XCTAssertEqual(DiscoverabilityPrecision.exact.clamped(under: .exact), .exact)
    }

    /// Le clamp RESTREINT toujours, il n'affine jamais : sous une position
    /// partagée à la ville, aucun chemin ne peut rendre « Exacte ».
    func test_clamped_neverReturnsATierFinerThanAllowed() {
        for sharing in LocationPrecision.allCases {
            let allowed = DiscoverabilityPrecision.allowedTiers(under: sharing)
            for tier in DiscoverabilityPrecision.allCases {
                XCTAssertTrue(allowed.contains(tier.clamped(under: sharing)),
                              "\(tier.rawValue) sous \(sharing.rawValue) rend un palier non autorisé")
            }
        }
    }
}
