import Foundation
import Combine
import MeeshySDK

@MainActor
public protocol CommunityListModeling: ObservableObject {
    var communities: [MeeshyCommunity] { get }
    var isLoading: Bool { get }
    var hasMore: Bool { get }
    var searchText: String { get set }

    func loadIfNeeded() async
    func refresh() async
    func loadMore() async
}

@MainActor
public protocol CommunityDetailModeling: ObservableObject {
    var communityId: String { get }
    var community: MeeshyCommunity? { get }
    var conversations: [APIConversation] { get }
    var conversationTitles: [String: String] { get }
    var isMember: Bool { get }
    var isCreator: Bool { get }
    var isAdmin: Bool { get }
    var isLoading: Bool { get }
    var errorMessage: String? { get }

    func load() async
    func joinCommunity() async
    func leaveCommunity() async
}

@MainActor
public protocol CommunityCreateModeling: ObservableObject {
    var name: String { get set }
    var identifier: String { get set }
    var description: String { get set }
    var selectedEmoji: String { get set }
    var isPrivate: Bool { get set }
    var isCreating: Bool { get }
    var showError: Bool { get set }
    var errorMessage: String? { get }
    var memberSearch: String { get set }
    var searchResults: [UserSearchResult] { get }
    var selectedMembers: [UserSearchResult] { get set }
    var isSearchingMembers: Bool { get }
    var accentColor: String { get }
    var isValid: Bool { get }

    func createCommunity() async -> MeeshyCommunity?
}

@MainActor
public protocol CommunityInviteModeling: ObservableObject {
    var searchText: String { get set }
    var searchResults: [UserSearchResult] { get }
    var isSearching: Bool { get }
    var invitedUserIds: Set<String> { get }
    var recentlyInvited: [UserSearchResult] { get }
    var invitingUserId: String? { get }

    func searchUsers() async
    func inviteUser(userId: String) async
}

@MainActor
public protocol CommunityMembersModeling: ObservableObject {
    var sections: [CommunityMemberSection] { get }
    var isEmpty: Bool { get }
    var isLoading: Bool { get }
    var hasMore: Bool { get }
    var isCurrentUserAdmin: Bool { get }
    var canInvite: Bool { get }

    func loadIfNeeded() async
    func refresh() async
    func loadMore() async
    func updateRole(memberId: String, role: MemberRole) async
    func removeMember(userId: String) async
}

@MainActor
public protocol CommunitySettingsModeling: ObservableObject {
    var name: String { get set }
    var descriptionText: String { get set }
    var isPrivate: Bool { get set }
    var localColor: String { get set }
    var localEmoji: String { get set }
    var avatarUrl: String { get }
    var bannerUrl: String { get }
    var isUploadingAvatar: Bool { get }
    var isUploadingBanner: Bool { get }
    var isSaving: Bool { get }
    var showError: Bool { get set }
    var errorMessage: String? { get }
    var showDeleteConfirm: Bool { get set }
    var showLeaveConfirm: Bool { get set }
    var isCreator: Bool { get }
    var hasChanges: Bool { get }

    func save() async -> MeeshyCommunity?
    func uploadCompressedAvatar(_ data: Data) async
    func uploadCompressedBanner(_ data: Data) async
    func deleteCommunity() async
    func leaveCommunity() async
}

@MainActor
public protocol CommunityAddChannelModeling: ObservableObject {
    var conversations: [APIConversation] { get }
    var titles: [String: String] { get }
    var isLoading: Bool { get }
    var isLoadingMore: Bool { get }
    var hasMore: Bool { get }
    var isAdding: String? { get }
    var errorMessage: String? { get }
    var searchText: String { get set }
    var showMoveConfirm: Bool { get set }
    var pendingMoveConversation: APIConversation? { get }

    func load() async
    func loadMore() async
    func handleTap(_ conversation: APIConversation)
    func confirmMove()
    func cancelMove()
}

public struct CommunitySettingsActions {
    public let onUpdated: (MeeshyCommunity) -> Void
    public let onDeleted: () -> Void
    public let onLeft: () -> Void

    public init(
        onUpdated: @escaping (MeeshyCommunity) -> Void,
        onDeleted: @escaping () -> Void,
        onLeft: @escaping () -> Void
    ) {
        self.onUpdated = onUpdated
        self.onDeleted = onDeleted
        self.onLeft = onLeft
    }
}

public nonisolated enum CommunitySettingsCopy {
    @MainActor public static var updatedToast: String { updatedToast(in: .module) }
    @MainActor public static var avatarUploadedToast: String { avatarUploadedToast(in: .module) }
    @MainActor public static var avatarFailedToast: String { avatarFailedToast(in: .module) }
    @MainActor public static var bannerUploadedToast: String { bannerUploadedToast(in: .module) }
    @MainActor public static var bannerFailedToast: String { bannerFailedToast(in: .module) }

    nonisolated static func updatedToast(in bundle: Bundle) -> String {
        String(localized: "community.settings.toast.updated", defaultValue: "Communauté mise à jour", bundle: bundle)
    }

    nonisolated static func avatarUploadedToast(in bundle: Bundle) -> String {
        String(localized: "community.settings.toast.avatarUploaded", defaultValue: "Avatar téléversé", bundle: bundle)
    }

    nonisolated static func avatarFailedToast(in bundle: Bundle) -> String {
        String(localized: "community.settings.toast.avatarFailed", defaultValue: "Échec du téléchargement de l'avatar", bundle: bundle)
    }

    nonisolated static func bannerUploadedToast(in bundle: Bundle) -> String {
        String(localized: "community.settings.toast.bannerUploaded", defaultValue: "Bannière téléversée", bundle: bundle)
    }

    nonisolated static func bannerFailedToast(in bundle: Bundle) -> String {
        String(localized: "community.settings.toast.bannerFailed", defaultValue: "Échec du téléchargement de la bannière", bundle: bundle)
    }
}
