import XCTest
@testable import MeeshySDK

private struct TestItem: Codable, Equatable {
    let id: String
    let name: String
}

private struct TestDated: Decodable, Equatable {
    let id: String
    let createdAt: Date
}

final class APIResponseTests: XCTestCase {

    private let decoder = JSONDecoder()

    /// Mirrors the date decoding strategy used by APIClient (static cached formatters).
    private nonisolated(unsafe) static let isoFormatterWithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private nonisolated(unsafe) static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private func makeDateDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            if let date = APIResponseTests.isoFormatterWithFractional.date(from: dateStr) { return date }
            if let date = APIResponseTests.isoFormatter.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
        return d
    }

    // MARK: - APIResponse<T>

    func testAPIResponseDecodesSuccessWithData() throws {
        let json = makeJSON("""
        {"success": true, "data": {"id": "abc123", "name": "Test"}}
        """)

        let response = try decoder.decode(APIResponse<TestItem>.self, from: json)

        XCTAssertTrue(response.success)
        XCTAssertEqual(response.data.id, "abc123")
        XCTAssertEqual(response.data.name, "Test")
        XCTAssertNil(response.error)
    }

    func testAPIResponseDecodesWithError() throws {
        let json = makeJSON("""
        {"success": false, "data": {"id": "", "name": ""}, "error": "Not found"}
        """)

        let response = try decoder.decode(APIResponse<TestItem>.self, from: json)

        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "Not found")
    }

    func testAPIResponseDecodesWithNilError() throws {
        let json = makeJSON("""
        {"success": true, "data": {"id": "x", "name": "Y"}}
        """)

        let response = try decoder.decode(APIResponse<TestItem>.self, from: json)

        XCTAssertNil(response.error)
    }

    // MARK: - SimpleAPIResponse

    func testSimpleAPIResponseDecodesWithMessage() throws {
        let json = makeJSON("""
        {"success": true, "message": "OK"}
        """)

        let response = try decoder.decode(SimpleAPIResponse.self, from: json)

        XCTAssertTrue(response.success)
        XCTAssertEqual(response.message, "OK")
        XCTAssertNil(response.error)
    }

    func testSimpleAPIResponseDecodesWithNilMessage() throws {
        let json = makeJSON("""
        {"success": true}
        """)

        let response = try decoder.decode(SimpleAPIResponse.self, from: json)

        XCTAssertTrue(response.success)
        XCTAssertNil(response.message)
    }

    func testSimpleAPIResponseDecodesWithError() throws {
        let json = makeJSON("""
        {"success": false, "error": "Failed"}
        """)

        let response = try decoder.decode(SimpleAPIResponse.self, from: json)

        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "Failed")
    }

    // MARK: - PaginatedAPIResponse<T>

    func testPaginatedResponseDecodesWithPagination() throws {
        let json = makeJSON("""
        {
            "success": true,
            "data": [{"id": "1", "name": "First"}, {"id": "2", "name": "Second"}],
            "pagination": {"nextCursor": "abc", "hasMore": true, "limit": 20}
        }
        """)

        let response = try decoder.decode(PaginatedAPIResponse<[TestItem]>.self, from: json)

        XCTAssertTrue(response.success)
        XCTAssertEqual(response.data.count, 2)
        XCTAssertEqual(response.data[0], TestItem(id: "1", name: "First"))
        XCTAssertEqual(response.data[1], TestItem(id: "2", name: "Second"))
        XCTAssertEqual(response.pagination?.nextCursor, "abc")
        XCTAssertEqual(response.pagination?.hasMore, true)
        XCTAssertEqual(response.pagination?.limit, 20)
    }

    func testPaginatedResponseDecodesWithoutPagination() throws {
        let json = makeJSON("""
        {"success": true, "data": []}
        """)

        let response = try decoder.decode(PaginatedAPIResponse<[TestItem]>.self, from: json)

        XCTAssertTrue(response.success)
        XCTAssertTrue(response.data.isEmpty)
        XCTAssertNil(response.pagination)
    }

    // MARK: - CursorPagination

    func testCursorPaginationDecodesAllFields() throws {
        let json = makeJSON("""
        {"nextCursor": "cursor_xyz", "hasMore": true, "limit": 25}
        """)

        let pagination = try decoder.decode(CursorPagination.self, from: json)

        XCTAssertEqual(pagination.nextCursor, "cursor_xyz")
        XCTAssertTrue(pagination.hasMore)
        XCTAssertEqual(pagination.limit, 25)
    }

    func testCursorPaginationDecodesLastPage() throws {
        let json = makeJSON("""
        {"nextCursor": null, "hasMore": false, "limit": 20}
        """)

        let pagination = try decoder.decode(CursorPagination.self, from: json)

        XCTAssertNil(pagination.nextCursor)
        XCTAssertFalse(pagination.hasMore)
        XCTAssertEqual(pagination.limit, 20)
    }

    // MARK: - OffsetPagination

    func testOffsetPaginationDecodesAllFields() throws {
        let json = makeJSON("""
        {"total": 100, "hasMore": true, "limit": 15, "offset": 30}
        """)

        let pagination = try decoder.decode(OffsetPagination.self, from: json)

        XCTAssertEqual(pagination.total, 100)
        XCTAssertTrue(pagination.hasMore)
        XCTAssertEqual(pagination.limit, 15)
        XCTAssertEqual(pagination.offset, 30)
    }

    func testOffsetPaginationDecodesWithNilTotal() throws {
        let json = makeJSON("""
        {"total": null, "hasMore": false, "limit": 10, "offset": 0}
        """)

        let pagination = try decoder.decode(OffsetPagination.self, from: json)

        XCTAssertNil(pagination.total)
        XCTAssertFalse(pagination.hasMore)
        XCTAssertEqual(pagination.limit, 10)
        XCTAssertEqual(pagination.offset, 0)
    }

    // MARK: - OffsetPaginatedAPIResponse<T>

    func testOffsetPaginatedResponseDecodesFullPayload() throws {
        let json = makeJSON("""
        {
            "success": true,
            "data": [{"id": "a", "name": "Alpha"}],
            "pagination": {"total": 50, "hasMore": true, "limit": 10, "offset": 0}
        }
        """)

        let response = try decoder.decode(OffsetPaginatedAPIResponse<[TestItem]>.self, from: json)

        XCTAssertTrue(response.success)
        XCTAssertEqual(response.data.count, 1)
        XCTAssertEqual(response.data[0].id, "a")
        XCTAssertEqual(response.pagination?.total, 50)
        XCTAssertEqual(response.pagination?.hasMore, true)
        XCTAssertEqual(response.pagination?.limit, 10)
        XCTAssertEqual(response.pagination?.offset, 0)
        XCTAssertNil(response.error)
    }

    func testOffsetPaginatedResponseDecodesWithoutPagination() throws {
        let json = makeJSON("""
        {"success": true, "data": [{"id": "b", "name": "Beta"}]}
        """)

        let response = try decoder.decode(OffsetPaginatedAPIResponse<[TestItem]>.self, from: json)

        XCTAssertTrue(response.success)
        XCTAssertEqual(response.data.count, 1)
        XCTAssertNil(response.pagination)
    }

    func testOffsetPaginatedResponseDecodesWithError() throws {
        let json = makeJSON("""
        {"success": false, "data": [], "error": "Forbidden"}
        """)

        let response = try decoder.decode(OffsetPaginatedAPIResponse<[TestItem]>.self, from: json)

        XCTAssertFalse(response.success)
        XCTAssertTrue(response.data.isEmpty)
        XCTAssertEqual(response.error, "Forbidden")
    }

    // MARK: - Date Decoding (ISO8601 — static cached formatters in APIClient)

    func test_dateDecoding_withFractionalSeconds_decodesCorrectly() throws {
        let json = makeJSON("""
        {"id": "msg1", "createdAt": "2024-03-15T10:30:45.123Z"}
        """)
        let dateDecoder = makeDateDecoder()

        let item = try dateDecoder.decode(TestDated.self, from: json)

        XCTAssertEqual(item.id, "msg1")
        // Verify the date components are correct (UTC)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(cal.component(.year, from: item.createdAt), 2024)
        XCTAssertEqual(cal.component(.month, from: item.createdAt), 3)
        XCTAssertEqual(cal.component(.day, from: item.createdAt), 15)
        XCTAssertEqual(cal.component(.hour, from: item.createdAt), 10)
        XCTAssertEqual(cal.component(.minute, from: item.createdAt), 30)
        XCTAssertEqual(cal.component(.second, from: item.createdAt), 45)
    }

    func test_dateDecoding_withoutFractionalSeconds_decodesCorrectly() throws {
        let json = makeJSON("""
        {"id": "msg2", "createdAt": "2024-03-15T10:30:45Z"}
        """)
        let dateDecoder = makeDateDecoder()

        let item = try dateDecoder.decode(TestDated.self, from: json)

        XCTAssertEqual(item.id, "msg2")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(cal.component(.year, from: item.createdAt), 2024)
        XCTAssertEqual(cal.component(.month, from: item.createdAt), 3)
        XCTAssertEqual(cal.component(.day, from: item.createdAt), 15)
        XCTAssertEqual(cal.component(.hour, from: item.createdAt), 10)
        XCTAssertEqual(cal.component(.minute, from: item.createdAt), 30)
        XCTAssertEqual(cal.component(.second, from: item.createdAt), 45)
    }

    func test_dateDecoding_withInvalidDate_throwsDecodingError() throws {
        let json = makeJSON("""
        {"id": "msg3", "createdAt": "not-a-date"}
        """)
        let dateDecoder = makeDateDecoder()

        XCTAssertThrowsError(try dateDecoder.decode(TestDated.self, from: json)) { error in
            XCTAssertTrue(error is DecodingError, "Expected DecodingError, got \(error)")
        }
    }

    func test_dateDecoding_fractionalAndWholeSecondsAreEqual() throws {
        // "2024-06-01T12:00:00.000Z" and "2024-06-01T12:00:00Z" must map to the same instant
        let jsonFractional = makeJSON("{\"id\":\"a\",\"createdAt\":\"2024-06-01T12:00:00.000Z\"}")
        let jsonWhole      = makeJSON("{\"id\":\"b\",\"createdAt\":\"2024-06-01T12:00:00Z\"}")
        let dateDecoder = makeDateDecoder()

        let itemFractional = try dateDecoder.decode(TestDated.self, from: jsonFractional)
        let itemWhole      = try dateDecoder.decode(TestDated.self, from: jsonWhole)

        XCTAssertEqual(
            itemFractional.createdAt.timeIntervalSince1970,
            itemWhole.createdAt.timeIntervalSince1970,
            accuracy: 0.001
        )
    }

    // MARK: - Helpers

    private func makeJSON(_ string: String) -> Data {
        Data(string.utf8)
    }
}
