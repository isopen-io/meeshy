import Foundation
import MeeshySDK

enum FriendRequestFixture {
    private static let now = ISO8601DateFormatter().string(from: Date())

    static func make(
        id: String = "req-001",
        senderId: String = "sender-001",
        receiverId: String = "receiver-001",
        message: String? = nil,
        status: String = "pending",
        senderUsername: String = "sender",
        receiverUsername: String = "receiver",
        senderIsOnline: Bool = false,
        receiverIsOnline: Bool = false
    ) -> FriendRequest {
        let messageJson = message.map { "\"\($0)\"" } ?? "null"
        let json = """
        {
            "id": "\(id)",
            "senderId": "\(senderId)",
            "receiverId": "\(receiverId)",
            "message": \(messageJson),
            "status": "\(status)",
            "sender": {
                "id": "\(senderId)",
                "username": "\(senderUsername)",
                "firstName": null,
                "lastName": null,
                "displayName": "\(senderUsername)",
                "avatar": null,
                "isOnline": \(senderIsOnline),
                "lastActiveAt": "\(now)"
            },
            "receiver": {
                "id": "\(receiverId)",
                "username": "\(receiverUsername)",
                "firstName": null,
                "lastName": null,
                "displayName": "\(receiverUsername)",
                "avatar": null,
                "isOnline": \(receiverIsOnline),
                "lastActiveAt": "\(now)"
            },
            "respondedAt": null,
            "createdAt": "\(now)",
            "updatedAt": "\(now)"
        }
        """
        return JSONStub.decode(json)
    }

    static func makePaginated(
        requests: [FriendRequest],
        total: Int? = nil,
        hasMore: Bool = false,
        limit: Int = 30,
        offset: Int = 0
    ) -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        let requestsJson = requests.map { req -> String in
            let messageJson = req.message.map { "\"\($0)\"" } ?? "null"
            let senderJson = req.sender.map { s in
                """
                {"id":"\(s.id)","username":"\(s.username)","firstName":null,"lastName":null,"displayName":"\(s.name)","avatar":null,"isOnline":\(s.isOnline ?? false),"lastActiveAt":"\(now)"}
                """
            } ?? "null"
            let receiverJson = req.receiver.map { r in
                """
                {"id":"\(r.id)","username":"\(r.username)","firstName":null,"lastName":null,"displayName":"\(r.name)","avatar":null,"isOnline":\(r.isOnline ?? false),"lastActiveAt":"\(now)"}
                """
            } ?? "null"
            return """
            {"id":"\(req.id)","senderId":"\(req.senderId)","receiverId":"\(req.receiverId)","message":\(messageJson),"status":"\(req.status)","sender":\(senderJson),"receiver":\(receiverJson),"respondedAt":null,"createdAt":"\(now)","updatedAt":"\(now)"}
            """
        }.joined(separator: ",")

        let resolvedTotal = total ?? requests.count
        let json = """
        {
            "success": true,
            "data": [\(requestsJson)],
            "pagination": {
                "total": \(resolvedTotal),
                "hasMore": \(hasMore),
                "limit": \(limit),
                "offset": \(offset)
            }
        }
        """
        return JSONStub.decode(json)
    }
}
