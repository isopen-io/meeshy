import XCTest
import SwiftUI
import MapKit
@testable import MeeshySDK
@testable import MeeshyUI

/// #7598 — la carte d'un lieu débordait sur le message précédent en Script,
/// Focal et Bulles.
///
/// Deux défauts de géométrie, tous deux dans la carte elle-même, donc
/// communs aux trois modes :
/// 1. sa LARGEUR était fixe (`.frame(width: 260)`) : avec les 28 pt de marge
///    d'une bulle, 288 pt — au-delà du plafond de 70 % (281 pt sur un écran
///    de 402 pt) et de la colonne d'une rangée plate. Un cadre `maxWidth`
///    parent ne borne pas un enfant plus large que lui : il s'ÉTEND ;
/// 2. sa HAUTEUR dépendait des données : la barre « nom · adresse » ne se
///    montait que si l'un des deux existait, soit ~40 pt apparus APRÈS la
///    mesure de la cellule quand le lieu se complète (écho serveur).
///
/// La carte a désormais une taille FIXE, connue avant toute tuile et toute
/// donnée : hauteur constante, largeur plafonnée à la proposition du parent.
@MainActor
final class LocationCardGeometryTests: XCTestCase {

    private struct NoTileProvider: LocationMapThumbnailProviding {
        func thumbnail(coordinate: CLLocationCoordinate2D, size: CGSize, isDark: Bool) async -> UIImage? { nil }
    }

    private func makePlace(name: String? = nil, address: String? = nil) -> SharedPlace {
        SharedPlace(latitude: 48.8566, longitude: 2.3522, name: name, address: address)
    }

    private func renderedSize(of place: SharedPlace, proposedWidth: CGFloat) -> CGSize {
        let host = UIHostingController(rootView: LocationMessageView(place: place, thumbnailProvider: NoTileProvider()))
        return host.sizeThatFits(in: CGSize(width: proposedWidth, height: .greatestFiniteMagnitude))
    }

    // MARK: - Loi pure

    func test_size_withoutProposal_isTheIdealCard() {
        let size = LocationCardMetrics.size(proposedWidth: nil)
        XCTAssertEqual(size.width, LocationCardMetrics.idealWidth)
        XCTAssertEqual(size.height, LocationCardMetrics.height)
    }

    func test_size_narrowerProposal_bordersTheWidth_neverExtends() {
        let size = LocationCardMetrics.size(proposedWidth: 223)
        XCTAssertEqual(size.width, 223)
    }

    func test_size_widerProposal_staysAtTheIdealWidth() {
        let size = LocationCardMetrics.size(proposedWidth: 900)
        XCTAssertEqual(size.width, LocationCardMetrics.idealWidth)
    }

    func test_size_heightNeverDependsOnTheProposal() {
        let heights = [nil, 120, 223, 260, 900].map { LocationCardMetrics.size(proposedWidth: $0).height }
        XCTAssertEqual(Set(heights), [LocationCardMetrics.height])
    }

    func test_size_infiniteProposal_fallsBackToTheIdealWidth() {
        XCTAssertEqual(LocationCardMetrics.size(proposedWidth: .infinity).width, LocationCardMetrics.idealWidth)
    }

    func test_height_reservesTheMapAndTheInfoBar() {
        XCTAssertEqual(LocationCardMetrics.height, LocationCardMetrics.mapHeight + LocationCardMetrics.infoBarHeight)
    }

    // MARK: - Lignes « lieu · adresse »

    func test_infoLines_nameAndAddress_titleIsTheName_subtitleTheAddress() {
        let lines = LocationCardMetrics.infoLines(name: "Tour Eiffel", address: "Champ de Mars")
        XCTAssertEqual(lines.title, "Tour Eiffel")
        XCTAssertEqual(lines.subtitle, "Champ de Mars")
    }

    func test_infoLines_addressOnly_isPromotedToTitle_neverSaidTwice() {
        let lines = LocationCardMetrics.infoLines(name: nil, address: "Champ de Mars")
        XCTAssertEqual(lines.title, "Champ de Mars")
        XCTAssertNil(lines.subtitle)
    }

    func test_infoLines_blankValues_countAsAbsent() {
        let lines = LocationCardMetrics.infoLines(name: "  ", address: "")
        XCTAssertNil(lines.title)
        XCTAssertNil(lines.subtitle)
    }

    // MARK: - Rendu réel

    func test_renderedCard_heightIsTheSame_withOrWithoutPlaceDetails() {
        let bare = renderedSize(of: makePlace(), proposedWidth: 400)
        let named = renderedSize(of: makePlace(name: "Tour Eiffel", address: "Champ de Mars, Paris"), proposedWidth: 400)
        XCTAssertEqual(bare.height, LocationCardMetrics.height, accuracy: 0.5)
        XCTAssertEqual(named.height, LocationCardMetrics.height, accuracy: 0.5)
    }

    /// Le cas du défaut : une bulle de 281 pt (70 % de 402) retire ses 28 pt
    /// de marge et propose 253 pt à son corps. La carte doit y TENIR.
    func test_renderedCard_insideABubbleBody_neverExceedsTheProposedWidth() {
        let size = renderedSize(of: makePlace(name: "Tour Eiffel"), proposedWidth: 253)
        XCTAssertLessThanOrEqual(size.width, 253)
        XCTAssertEqual(size.height, LocationCardMetrics.height, accuracy: 0.5)
    }
}
