import XCTest
@testable import MeeshySDK

private struct TestItem: Codable, Equatable {
    let id: String
    let name: String
}

final class APIResponseTests: XCTestCase {

    private let decoder = JSONDecoder()

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

    // MARK: - Helpers

    private func makeJSON(_ string: String) -> Data {
        Data(string.utf8)
    }
}
