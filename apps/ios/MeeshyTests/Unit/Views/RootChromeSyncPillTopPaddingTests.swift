import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// La pastille de synchronisation recouvrait le titre « Meeshy Chats » — et,
/// plus largement, tout `CollapsibleHeader` hors conversation. La marge haute
/// décidait sur UN booléen (« suis-je en conversation ? ») qui ne peut pas
/// dire les TROIS cas réels : la racine (qui monte toujours un header), une
/// route poussée qui en déclare un, une route poussée qui n'en déclare aucun
/// (#5944).
@MainActor
final class RootChromeSyncPillTopPaddingTests: XCTestCase {

    func test_syncPillTopPadding_atRoot_matchesTheCollapsibleHeaderHostsMount() {
        // La racine (liste « Meeshy Chats » ou flux « Meeshy Feed ») monte
        // toujours son propre CollapsibleHeader — `currentRoute == nil` ne
        // veut pas dire « aucun chrome fixe ».
        XCTAssertEqual(
            RootChromeLayer.syncPillTopPadding(currentRoute: nil),
            CollapsibleHeaderMetrics.expandedHeight + MeeshySpacing.sm,
            "la racine monte un CollapsibleHeader (« Meeshy Chats » / « Meeshy Feed ») : la pastille doit se poser sous lui, pas par-dessus"
        )
    }

    func test_syncPillTopPadding_onARouteThatDeclaresACollapsibleHeader_clearsIt() {
        let routesWithHeader: [Route] = [
            .settings, .profile, .links, .postDetail("post1"),
            .contacts(.contacts), .peopleDiscovery(.discover)
        ]
        for route in routesWithHeader {
            XCTAssertEqual(
                RootChromeLayer.syncPillTopPadding(currentRoute: route),
                CollapsibleHeaderMetrics.expandedHeight + MeeshySpacing.sm,
                "\(route) monte un CollapsibleHeader de \(CollapsibleHeaderMetrics.expandedHeight) pt : un hôte qui déclare 64 pt doit recevoir 72"
            )
        }
    }

    func test_syncPillTopPadding_onARouteWithoutAHeader_keepsTheMinimalAssise() {
        let routesWithoutHeader: [Route] = [.notifications, .communityList, .userStats, .bookmarks]
        for route in routesWithoutHeader {
            XCTAssertEqual(
                RootChromeLayer.syncPillTopPadding(currentRoute: route),
                MeeshySpacing.sm,
                "\(route) ne monte aucun CollapsibleHeader : un hôte qui ne déclare rien garde 8"
            )
        }
    }

    /// Régression : la version corrigée décide sur TROIS cas distincts. Un
    /// retour au booléen (par exemple « route == nil ⇒ 8, sinon 8 ») rendrait
    /// la racine et une route sans header indiscernables d'une route AVEC
    /// header — ce test exige que les valeurs restent séparées comme il faut.
    func test_syncPillTopPadding_distinguishesTheThreeCases() {
        let atRoot = RootChromeLayer.syncPillTopPadding(currentRoute: nil)
        let withHeader = RootChromeLayer.syncPillTopPadding(currentRoute: .settings)
        let withoutHeader = RootChromeLayer.syncPillTopPadding(currentRoute: .notifications)

        XCTAssertEqual(atRoot, withHeader,
                       "la racine et une route poussée qui déclare le même header reçoivent la même marge")
        XCTAssertNotEqual(withHeader, withoutHeader,
                          "un booléen ne peut pas dire les trois cas — un défaut qui le réintroduirait ferait chevaucher la pastille et le header ici")
    }
}
