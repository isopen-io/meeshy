import SwiftUI
import MeeshySDK
import MeeshyUI

enum ContactConnectionStatus: Equatable {
    case connected
    case pendingSent
    case pendingReceived
    case none
}

@MainActor
final class DiscoverViewModel: ObservableObject {
    @Published var searchResults: [UserSearchResult] = []
    @Published var searchQuery: String = ""
    @Published var isSearching = false
    @Published var emailText: String = ""
    @Published var phoneText: String = ""
    @Published var isSendingInvite = false

    private let friendService: FriendServiceProviding
    private let userService: UserServiceProviding

    var friendIds: Set<String> = []
    var sentPendingIds: Set<String> = []
    var receivedPendingIds: Set<String> = []

    init(
        friendService: FriendServiceProviding = FriendService.shared,
        userService: UserServiceProviding = UserService.shared
    ) {
        self.friendService = friendService
        self.userService = userService
    }

    // MARK: - Search

    func performSearch() async {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2 else {
            searchResults = []
            return
        }
        isSearching = true
        do {
            searchResults = try await userService.searchUsers(query: query, limit: 20, offset: 0)
        } catch {
            searchResults = []
        }
        isSearching = false
    }

    func connectionStatus(for userId: String) -> ContactConnectionStatus {
        if friendIds.contains(userId) { return .connected }
        if sentPendingIds.contains(userId) { return .pendingSent }
        if receivedPendingIds.contains(userId) { return .pendingReceived }
        return .none
    }

    // MARK: - Send Friend Request

    func sendRequest(to userId: String) async {
        sentPendingIds.insert(userId)
        objectWillChange.send()
        HapticFeedback.success()
        do {
            _ = try await friendService.sendFriendRequest(receiverId: userId, message: nil)
            ToastManager.shared.showSuccess("Demande envoyee")
        } catch {
            sentPendingIds.remove(userId)
            objectWillChange.send()
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible d'envoyer")
        }
    }

    // MARK: - Email Invitation

    func sendEmailInvitation() async {
        let email = emailText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else { return }
        isSendingInvite = true
        do {
            try await friendService.sendEmailInvitation(email: email)
            ToastManager.shared.showSuccess("Invitation envoyee a \(email)")
            emailText = ""
            HapticFeedback.success()
        } catch {
            ToastManager.shared.showError("Impossible d'envoyer l'invitation")
            HapticFeedback.error()
        }
        isSendingInvite = false
    }

    // MARK: - SMS Message

    var smsMessage: String {
        "Rejoins-moi sur Meeshy ! Telecharge l'app : https://meeshy.me/download"
    }
}
