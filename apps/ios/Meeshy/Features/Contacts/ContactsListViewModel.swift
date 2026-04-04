import SwiftUI
import MeeshySDK
import MeeshyUI

@MainActor
final class ContactsListViewModel: ObservableObject {
    @Published var friends: [FriendRequestUser] = []
    @Published var loadState: LoadState = .idle
    @Published var activeFilter: ContactFilter = .all
    @Published var searchQuery: String = ""

    private let friendService: FriendServiceProviding
    private let currentUserId: String

    var filteredFriends: [FriendRequestUser] {
        var result = friends

        switch activeFilter {
        case .online:
            result = result.filter { $0.isOnline == true }
        case .offline:
            result = result.filter { $0.isOnline != true }
        case .all, .phonebook, .affiliates:
            break
        }

        if !searchQuery.isEmpty {
            let query = searchQuery.lowercased()
            result = result.filter {
                $0.username.lowercased().contains(query) ||
                $0.name.lowercased().contains(query)
            }
        }

        return result
    }

    init(
        friendService: FriendServiceProviding = FriendService.shared,
        currentUserId: String = AuthManager.shared.currentUser?.id ?? ""
    ) {
        self.friendService = friendService
        self.currentUserId = currentUserId
    }

    // MARK: - Load Friends

    func loadFriends() async {
        let cacheKey = "friends_list"
        let cached = await CacheCoordinator.shared.friends.load(for: cacheKey)

        switch cached {
        case .fresh(let data, _):
            friends = data
            loadState = .loaded
            return

        case .stale(let data, _):
            friends = data
            loadState = .loaded
            Task { [weak self] in
                await self?.fetchFriendsFromNetwork(cacheKey: cacheKey)
            }
            return

        case .expired, .empty:
            loadState = friends.isEmpty ? .loading : .loaded
        }

        await fetchFriendsFromNetwork(cacheKey: cacheKey)
    }

    private func fetchFriendsFromNetwork(cacheKey: String) async {
        do {
            async let receivedResponse = friendService.receivedRequests(offset: 0, limit: 100)
            async let sentResponse = friendService.sentRequests(offset: 0, limit: 100)

            let (received, sent) = try await (receivedResponse, sentResponse)

            var friendMap: [String: FriendRequestUser] = [:]

            for request in received.data where request.status == "accepted" {
                if let sender = request.sender, sender.id != currentUserId {
                    friendMap[sender.id] = sender
                } else if let receiver = request.receiver, receiver.id != currentUserId {
                    friendMap[receiver.id] = receiver
                }
            }

            for request in sent.data where request.status == "accepted" {
                if let receiver = request.receiver, receiver.id != currentUserId {
                    friendMap[receiver.id] = receiver
                } else if let sender = request.sender, sender.id != currentUserId {
                    friendMap[sender.id] = sender
                }
            }

            friends = friendMap.values.sorted { a, b in
                let aOnline = a.isOnline ?? false
                let bOnline = b.isOnline ?? false
                if aOnline != bOnline { return aOnline }
                let aDate = a.lastActiveAt ?? .distantPast
                let bDate = b.lastActiveAt ?? .distantPast
                return aDate > bDate
            }

            loadState = .loaded
            await CacheCoordinator.shared.friends.save(friends, for: cacheKey)
        } catch {
            if friends.isEmpty {
                loadState = .error("Erreur lors du chargement")
            }
        }
    }

    // MARK: - Actions

    func setFilter(_ filter: ContactFilter) {
        activeFilter = filter
        HapticFeedback.light()
    }

    func search(_ query: String) {
        searchQuery = query
    }
}
