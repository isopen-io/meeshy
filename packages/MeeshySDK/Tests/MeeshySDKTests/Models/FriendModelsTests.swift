import XCTest
@testable import MeeshySDK

final class FriendModelsTests: XCTestCase {

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: dateString) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: dateString) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateString)")
        }
        return decoder
    }

    // MARK: - FriendRequest

    func testFriendRequestDecodingWithNestedUsers() throws {
        let json = """
        {
            "id": "fr1",
            "senderId": "user1",
            "receiverId": "user2",
            "message": "Let's connect!",
            "status": "pending",
            "sender": {
                "id": "user1",
                "username": "alice",
                "firstName": "Alice",
                "lastName": "Wonderland",
                "displayName": "Alice W",
                "avatar": "https://img.test/alice.png",
                "isOnline": true,
                "lastActiveAt": "2026-01-15T10:30:00.000Z"
            },
            "receiver": {
                "id": "user2",
                "username": "bob",
                "firstName": null,
                "lastName": null,
                "displayName": null,
                "avatar": null,
                "isOnline": false,
                "lastActiveAt": null
            },
            "createdAt": "2026-01-15T10:30:00.000Z",
            "updatedAt": "2026-01-15T11:00:00.000Z"
        }
        """.data(using: .utf8)!

        let request = try makeDecoder().decode(FriendRequest.self, from: json)
        XCTAssertEqual(request.id, "fr1")
        XCTAssertEqual(request.senderId, "user1")
        XCTAssertEqual(request.receiverId, "user2")
        XCTAssertEqual(request.message, "Let's connect!")
        XCTAssertEqual(request.status, "pending")
        XCTAssertNotNil(request.sender)
        XCTAssertNotNil(request.receiver)
        XCTAssertNotNil(request.createdAt)
        XCTAssertNotNil(request.updatedAt)
    }

    func testFriendRequestDecodingWithoutOptionalMessage() throws {
        let json = """
        {
            "id": "fr2",
            "senderId": "user3",
            "receiverId": "user4",
            "message": null,
            "status": "accepted",
            "createdAt": "2026-01-15T10:30:00.000Z"
        }
        """.data(using: .utf8)!

        let request = try makeDecoder().decode(FriendRequest.self, from: json)
        XCTAssertNil(request.message)
        XCTAssertEqual(request.status, "accepted")
        XCTAssertNil(request.sender)
        XCTAssertNil(request.receiver)
    }

    // MARK: - FriendRequestUser

    func testFriendRequestUserNameUsesDisplayName() throws {
        let json = """
        {"id":"u1","username":"alice","firstName":"Alice","lastName":"W","displayName":"Alice Wonderland","avatar":null}
        """.data(using: .utf8)!

        let user = try makeDecoder().decode(FriendRequestUser.self, from: json)
        XCTAssertEqual(user.name, "Alice Wonderland")
    }

    func testFriendRequestUserNameFallsBackToFirstAndLastName() throws {
        let json = """
        {"id":"u2","username":"bob","firstName":"Bob","lastName":"Smith","displayName":null,"avatar":null}
        """.data(using: .utf8)!

        let user = try makeDecoder().decode(FriendRequestUser.self, from: json)
        XCTAssertEqual(user.name, "Bob Smith")
    }

    func testFriendRequestUserNameFallsBackToUsername() throws {
        let json = """
        {"id":"u3","username":"charlie","firstName":null,"lastName":null,"displayName":null,"avatar":null}
        """.data(using: .utf8)!

        let user = try makeDecoder().decode(FriendRequestUser.self, from: json)
        XCTAssertEqual(user.name, "charlie")
    }

    func testFriendRequestUserNameWithOnlyFirstName() throws {
        let json = """
        {"id":"u4","username":"delta","firstName":"Delta","lastName":null,"displayName":null,"avatar":null}
        """.data(using: .utf8)!

        let user = try makeDecoder().decode(FriendRequestUser.self, from: json)
        XCTAssertEqual(user.name, "Delta")
    }

    // MARK: - SendFriendRequest

    func testSendFriendRequestEncoding() throws {
        let request = SendFriendRequest(receiverId: "user42", message: "Hey!")
        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["receiverId"] as? String, "user42")
        XCTAssertEqual(dict["message"] as? String, "Hey!")
    }

    func testSendFriendRequestEncodingWithNilMessage() throws {
        let request = SendFriendRequest(receiverId: "user43")
        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["receiverId"] as? String, "user43")
        let messageIsAbsentOrNull = dict["message"] == nil || dict["message"] is NSNull
        XCTAssertTrue(messageIsAbsentOrNull)
    }

    // MARK: - RespondFriendRequest

    func testRespondFriendRequestAccepted() throws {
        let response = RespondFriendRequest(accepted: true)
        let data = try JSONEncoder().encode(response)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["status"] as? String, "accepted")
    }

    func testRespondFriendRequestRejected() throws {
        let response = RespondFriendRequest(accepted: false)
        let data = try JSONEncoder().encode(response)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["status"] as? String, "rejected")
    }
}
