import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ContactsListViewModelTests: XCTestCase {

    private func makeSUT(currentUserId: String = "me") -> (sut: ContactsListViewModel, mock: MockFriendService) {
        let mock = MockFriendService()
        let sut = ContactsListViewModel(friendService: mock, currentUserId: currentUserId)
        return (sut, mock)
    }

    // MARK: - Load Friends

    func test_loadFriends_filtersAcceptedOnly() async {
        let (sut, mock) = makeSUT()
        let accepted = FriendRequestFixture.make(id: "r1", senderId: "other1", receiverId: "me", status: "accepted", senderUsername: "alice")
        let pending = FriendRequestFixture.make(id: "r2", senderId: "other2", receiverId: "me", status: "pending", senderUsername: "bob")
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [accepted, pending]))
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: []))

        await sut.loadFriends()

        XCTAssertEqual(sut.friends.count, 1)
        XCTAssertEqual(sut.friends.first?.username, "alice")
    }

    func test_loadFriends_mergesSentAndReceived() async {
        let (sut, mock) = makeSUT()
        let received = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice")
        let sent = FriendRequestFixture.make(id: "r2", senderId: "me", receiverId: "bob", status: "accepted", receiverUsername: "bob")
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [received]))
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [sent]))

        await sut.loadFriends()

        XCTAssertEqual(sut.friends.count, 2)
        let usernames = Set(sut.friends.map(\.username))
        XCTAssertTrue(usernames.contains("alice"))
        XCTAssertTrue(usernames.contains("bob"))
    }

    func test_loadFriends_deduplicates() async {
        let (sut, mock) = makeSUT()
        let fromReceived = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice")
        let fromSent = FriendRequestFixture.make(id: "r2", senderId: "me", receiverId: "alice", status: "accepted", receiverUsername: "alice")
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [fromReceived]))
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [fromSent]))

        await sut.loadFriends()

        XCTAssertEqual(sut.friends.count, 1)
    }

    // MARK: - Filtering

    func test_filterOnline_showsOnlyOnlineUsers() async {
        let (sut, mock) = makeSUT()
        let online = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice", senderIsOnline: true)
        let offline = FriendRequestFixture.make(id: "r2", senderId: "bob", receiverId: "me", status: "accepted", senderUsername: "bob", senderIsOnline: false)
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [online, offline]))
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: []))

        await sut.loadFriends()
        sut.setFilter(.online)

        XCTAssertEqual(sut.filteredFriends.count, 1)
        XCTAssertEqual(sut.filteredFriends.first?.username, "alice")
    }

    func test_filterOffline_showsOnlyOfflineUsers() async {
        let (sut, mock) = makeSUT()
        let online = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice", senderIsOnline: true)
        let offline = FriendRequestFixture.make(id: "r2", senderId: "bob", receiverId: "me", status: "accepted", senderUsername: "bob", senderIsOnline: false)
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [online, offline]))
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: []))

        await sut.loadFriends()
        sut.setFilter(.offline)

        XCTAssertEqual(sut.filteredFriends.count, 1)
        XCTAssertEqual(sut.filteredFriends.first?.username, "bob")
    }

    // MARK: - Search

    func test_search_filtersLocallyByUsername() async {
        let (sut, mock) = makeSUT()
        let alice = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice")
        let bob = FriendRequestFixture.make(id: "r2", senderId: "bob", receiverId: "me", status: "accepted", senderUsername: "bob")
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [alice, bob]))
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: []))

        await sut.loadFriends()
        sut.search("ali")

        XCTAssertEqual(sut.filteredFriends.count, 1)
        XCTAssertEqual(sut.filteredFriends.first?.username, "alice")
    }

    // MARK: - Sorting

    func test_sorting_onlineFirst() async {
        let (sut, mock) = makeSUT()
        let offline = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice", senderIsOnline: false)
        let online = FriendRequestFixture.make(id: "r2", senderId: "bob", receiverId: "me", status: "accepted", senderUsername: "bob", senderIsOnline: true)
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [offline, online]))
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: []))

        await sut.loadFriends()

        XCTAssertEqual(sut.filteredFriends.first?.username, "bob")
    }
}
