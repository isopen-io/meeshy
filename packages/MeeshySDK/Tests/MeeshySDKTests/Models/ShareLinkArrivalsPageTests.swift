import XCTest
@testable import MeeshySDK

/// La page des arrivées d'un lien (#7813) : `GET /links/:linkId/arrivals`.
/// Une ligne illisible se saute, la page reste ; le curseur vide vaut la fin.
final class ShareLinkArrivalsPageTests: XCTestCase {

    private func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: raw) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: raw) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
        }
        return decoder
    }

    private func decode(_ json: String) throws -> ShareLinkArrivalsPage {
        try decoder().decode(ShareLinkArrivalsPage.self, from: Data(json.utf8))
    }

    func test_decode_fullPage_readsEveryFieldAndTheCursor() throws {
        let page = try decode("""
        { "arrivals": [
            { "displayName": "Priya", "isAnonymous": true, "country": "IN", "language": "hi", "joinedAt": "2026-10-01T08:00:00.000Z" },
            { "displayName": "Lukas", "isAnonymous": false, "country": null, "language": null, "joinedAt": "2026-09-30T08:00:00Z" }
          ], "nextCursor": "eyJ0IjoxfQ" }
        """)

        XCTAssertEqual(page.arrivals.count, 2)
        XCTAssertEqual(page.arrivals[0].displayName, "Priya")
        XCTAssertTrue(page.arrivals[0].isAnonymous)
        XCTAssertEqual(page.arrivals[0].country, "IN")
        XCTAssertEqual(page.arrivals[0].language, "hi")
        XCTAssertNil(page.arrivals[1].country)
        XCTAssertNil(page.arrivals[1].language)
        XCTAssertEqual(page.nextCursor, "eyJ0IjoxfQ")
    }

    func test_decode_anUnreadableRow_isSkipped_notTheWholePage() throws {
        let page = try decode("""
        { "arrivals": [
            { "displayName": "Priya", "isAnonymous": true, "country": "IN", "language": "hi", "joinedAt": "2026-10-01T08:00:00Z" },
            { "displayName": "Sans date", "isAnonymous": false },
            42,
            { "displayName": "Ana", "isAnonymous": false, "country": "BR", "language": "pt", "joinedAt": "pas une date" },
            { "displayName": "Lukas", "joinedAt": "2026-09-30T08:00:00Z" }
          ], "nextCursor": null }
        """)

        XCTAssertEqual(page.arrivals.map(\.displayName), ["Priya", "Lukas"])
        XCTAssertFalse(page.arrivals[1].isAnonymous, "an absent badge reads as an account holder")
        XCTAssertNil(page.nextCursor)
    }

    func test_decode_missingListAndEmptyCursor_readAsAnEmptyLastPage() throws {
        let page = try decode("{ \"nextCursor\": \"\" }")

        XCTAssertTrue(page.arrivals.isEmpty)
        XCTAssertNil(page.nextCursor, "an empty cursor would loop on the first page")
    }

    func test_entry_fromARecentArrival_keepsWhatTheRowShows() {
        let joined = Date(timeIntervalSince1970: 1_759_000_000)
        let recent = ShareLinkArrivalStats.Arrival(
            participantId: "p1", displayName: "Priya", avatar: "https://x/a.png",
            isAnonymous: true, country: "IN", language: "hi", joinedAt: joined
        )

        let entry = ShareLinkArrivalEntry(recent)

        XCTAssertEqual(entry, ShareLinkArrivalEntry(displayName: "Priya", isAnonymous: true, country: "IN", language: "hi", joinedAt: joined))
    }

    func test_entry_identity_separatesTwoArrivalsOfTheSameName() {
        let a = ShareLinkArrivalEntry(displayName: "Invité", isAnonymous: true, country: nil, language: nil, joinedAt: Date(timeIntervalSince1970: 1))
        let b = ShareLinkArrivalEntry(displayName: "Invité", isAnonymous: true, country: nil, language: nil, joinedAt: Date(timeIntervalSince1970: 2))

        XCTAssertNotEqual(a.id, b.id)
        XCTAssertEqual(a.id, ShareLinkArrivalEntry(displayName: "Invité", isAnonymous: true, country: nil, language: nil, joinedAt: Date(timeIntervalSince1970: 1)).id)
    }
}
