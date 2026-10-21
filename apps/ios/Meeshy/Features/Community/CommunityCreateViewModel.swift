import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class CommunityCreateViewModel: ObservableObject, CommunityCreateModeling {
    nonisolated deinit {}

    @Published var name = ""
    @Published var identifier = ""
    @Published var description = ""
    @Published var selectedEmoji = ""
    @Published var isPrivate = true
    @Published private(set) var isCreating = false
    @Published var showError = false
    @Published private(set) var errorMessage: String?

    @Published var memberSearch = "" {
        didSet { scheduleSearch() }
    }
    @Published private(set) var searchResults: [UserSearchResult] = []
    @Published var selectedMembers: [UserSearchResult] = []
    @Published private(set) var isSearchingMembers = false

    private var searchTask: Task<Void, Never>?
    private let communityService: CommunityServiceProviding
    private let userService: UserServiceProviding
    private let currentUserId: @MainActor () -> String

    init(
        communityService: CommunityServiceProviding = CommunityService.shared,
        userService: UserServiceProviding = UserService.shared,
        currentUserId: @escaping @MainActor () -> String = { AuthManager.shared.currentUser?.id ?? "" }
    ) {
        self.communityService = communityService
        self.userService = userService
        self.currentUserId = currentUserId
    }

    var accentColor: String {
        DynamicColorGenerator.colorForName(name.isEmpty ? "New" : name)
    }

    var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty }

    private func scheduleSearch() {
        searchTask?.cancel()
        guard memberSearch.count >= 2 else {
            searchResults = []
            isSearchingMembers = false
            return
        }
        searchTask = Task {
            isSearchingMembers = true
            defer { isSearchingMembers = false }
            do {
                let results = try await userService.searchUsers(query: memberSearch, limit: 10, offset: 0)
                guard !Task.isCancelled else { return }
                let readerId = currentUserId()
                searchResults = results.filter { $0.id != readerId }
            } catch {
                if !Task.isCancelled { searchResults = [] }
            }
        }
    }

    func createCommunity() async -> MeeshyCommunity? {
        guard isValid else { return nil }
        isCreating = true
        defer { isCreating = false }

        do {
            let apiCommunity = try await communityService.create(
                name: name.trimmingCharacters(in: .whitespaces),
                identifier: identifier.isEmpty ? nil : identifier,
                description: description.isEmpty ? nil : description,
                isPrivate: isPrivate
            )

            for member in selectedMembers {
                _ = try? await communityService.addMember(
                    communityId: apiCommunity.id,
                    userId: member.id,
                    role: .member
                )
            }

            return apiCommunity.toCommunity()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }
}
