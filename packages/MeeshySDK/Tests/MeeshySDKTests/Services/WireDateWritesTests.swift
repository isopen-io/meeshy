import XCTest
@testable import MeeshySDK

/// LES ÉCRITURES DU FIL (#6611) — chaque date envoyée à la passerelle est une
/// date-heure ISO 8601 UTC à MILLISECONDES (`WireDate`). Un `.formatted(.iso8601)`
/// la tronquait à la seconde : sûr pour un `since`, mais une reformulation locale
/// de plus.
///
/// Contrats vérifiés côté passerelle : `updatedSince` des contacts
/// (`format: 'date-time'` + `new Date`), des stories (`new Date` via
/// `dateOptionnelleSiValide`), `historyVisibleFrom`
/// (`z.string().datetime({ offset: true })`) — les trois acceptent les fractions.
final class WireDateWritesTests: XCTestCase {

    private static let instant = Date(timeIntervalSince1970: 1_789_464_863.563)
    private static let servi = "2026-09-15T09:34:23.563Z"

    private func valeur(_ nom: String, dans mock: MockAPIClient) -> String? {
        mock.lastRequest?.queryItems?.first { $0.name == nom }?.value
    }

    func test_contactDirectoryPage_updatedSince_voyageAMillisecondes() async {
        let mock = MockAPIClient()

        _ = try? await ContactDirectoryService(api: mock)
            .page(cursor: nil, limit: 100, filter: .all, query: nil, updatedSince: Self.instant)

        XCTAssertEqual(valeur("updatedSince", dans: mock), Self.servi)
    }

    func test_storyList_updatedSince_voyageAMillisecondes() async {
        let mock = MockAPIClient()

        _ = try? await StoryService(api: mock).list(updatedSince: Self.instant)

        XCTAssertEqual(valeur("updatedSince", dans: mock), Self.servi)
    }

    func test_updateHistoryGrant_historyVisibleFrom_voyageAMillisecondes() async {
        let mock = MockAPIClient()
        let selection = Date(timeIntervalSince1970: 1_768_471_200)

        _ = try? await ConversationService(api: mock)
            .updateHistoryGrant(conversationId: "c1", participantId: "p1", historyVisibleFrom: selection)

        let envoye = mock.lastRequest?.bodyJSON?["historyVisibleFrom"] as? String
        XCTAssertEqual(envoye, WireDate.string(from: ConversationService.historyGrantFloor(for: selection)))
        XCTAssertEqual(envoye?.hasSuffix(".000Z"), true, "le plancher d'un jour garde ses millisecondes : \(envoye ?? "nil")")
    }
}
