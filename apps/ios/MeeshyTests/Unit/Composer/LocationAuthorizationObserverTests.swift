import XCTest
import CoreLocation
@testable import Meeshy

/// **L'autorisation de localisation s'OBSERVE, elle ne se lit pas une fois** (#5407).
///
/// Retour porteur 2026-09-06 : « bien que la localisation soit activée, ça
/// indique d'activer la localisation ». L'injecteur lisait
/// `CLLocationManager().authorizationStatus` dans une expression de `body` —
/// juste à cet instant, et jamais relue : SwiftUI ne réévalue un `body` que si
/// un état OBSERVÉ change, et un statut système n'en est pas un.
///
/// Ce fichier garde la moitié DÉCIDABLE de la règle. La moitié observée
/// (`@Published status` alimenté par `locationManagerDidChangeAuthorization`)
/// n'est pas éprouvable sans le daemon système ; ce qui l'est, c'est que la
/// décision « sert-on l'onglet ? » soit une fonction PURE du statut, donc
/// interrogeable sur les cinq valeurs — dont `.notDetermined`, le cas où
/// fermer la porte la rendrait impossible à ouvrir.
final class LocationAuthorizationObserverTests: XCTestCase {

    func test_serves_refuseLesDeuxSeulsRefus() {
        XCTAssertFalse(LocationAuthorizationObserver.serves(.denied))
        XCTAssertFalse(LocationAuthorizationObserver.serves(.restricted))
    }

    func test_serves_ouvreLesDeuxAutorisations() {
        XCTAssertTrue(LocationAuthorizationObserver.serves(.authorizedWhenInUse))
        XCTAssertTrue(LocationAuthorizationObserver.serves(.authorizedAlways))
    }

    /// Le rang qui compte : un refus PRÉVENTIF sur `.notDetermined` retirerait
    /// l'onglet AVANT que l'auteur ait pu accorder quoi que ce soit — c'est en
    /// y arrivant que l'alerte système se présente.
    func test_serves_ouvreQuandRienNaEncoreEteDemande() {
        XCTAssertTrue(LocationAuthorizationObserver.serves(.notDetermined))
    }
}
