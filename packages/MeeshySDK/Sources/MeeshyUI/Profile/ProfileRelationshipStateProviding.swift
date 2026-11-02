import Combine
import MeeshySDK

@MainActor
public protocol ProfileRelationshipStateProviding: AnyObject {
    var changes: AnyPublisher<Void, Never> { get }
    func status(for userId: String) -> FriendshipStatus
    func isBlocked(userId: String) -> Bool
    func didSendRequest(to receiverId: String, requestId: String)
    func didCancelRequest(to receiverId: String)
    func didAcceptRequest(from senderId: String)
    func rollbackAccept(senderId: String, requestId: String)
    func didRejectRequest(from senderId: String)
    func rollbackReject(senderId: String, requestId: String)
}
