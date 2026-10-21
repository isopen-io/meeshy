import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class CommunitySettingsViewModel: ObservableObject, CommunitySettingsModeling {
    nonisolated deinit {}

    @Published var name: String
    @Published var descriptionText: String
    @Published var isPrivate: Bool
    @Published private(set) var avatarUrl: String
    @Published private(set) var bannerUrl: String
    @Published var localColor: String
    @Published var localEmoji: String
    @Published private(set) var isUploadingAvatar = false
    @Published private(set) var isUploadingBanner = false
    @Published private(set) var isSaving = false
    @Published var showError = false
    @Published private(set) var errorMessage: String?
    @Published var showDeleteConfirm = false
    @Published var showLeaveConfirm = false

    let communityId: String
    let isCreator: Bool

    private let originalName: String
    private let originalDescription: String
    private let originalIsPrivate: Bool
    private let originalAvatarUrl: String
    private let originalBannerUrl: String
    private let originalLocalColor: String
    private let originalLocalEmoji: String
    private let service: CommunityServiceProviding
    private let imageUploader: UserServiceProviding

    var hasChanges: Bool {
        name != originalName ||
        descriptionText != originalDescription ||
        isPrivate != originalIsPrivate ||
        avatarUrl != originalAvatarUrl ||
        bannerUrl != originalBannerUrl ||
        localColor != originalLocalColor ||
        localEmoji != originalLocalEmoji
    }

    init(
        community: MeeshyCommunity,
        service: CommunityServiceProviding = CommunityService.shared,
        imageUploader: UserServiceProviding = UserService.shared,
        currentUserId: @MainActor () -> String = { AuthManager.shared.currentUser?.id ?? "" }
    ) {
        self.service = service
        self.imageUploader = imageUploader
        self.communityId = community.id
        self.isCreator = community.createdBy == currentUserId()

        self.name = community.name
        self.descriptionText = community.description ?? ""
        self.isPrivate = community.isPrivate
        self.originalName = community.name
        self.originalDescription = community.description ?? ""
        self.originalIsPrivate = community.isPrivate

        let avatarStr = community.avatar ?? ""
        let bannerStr = community.banner ?? ""
        self.avatarUrl = avatarStr
        self.bannerUrl = bannerStr
        self.originalAvatarUrl = avatarStr
        self.originalBannerUrl = bannerStr

        let savedColor = UserDefaults.standard.string(forKey: "community.color.\(community.id)") ?? MeeshyColors.brandPrimaryHex
        let savedEmoji = UserDefaults.standard.string(forKey: "community.emoji.\(community.id)") ?? ""
        self.localColor = savedColor
        self.localEmoji = savedEmoji
        self.originalLocalColor = savedColor
        self.originalLocalEmoji = savedEmoji
    }

    func save() async -> MeeshyCommunity? {
        isSaving = true
        defer { isSaving = false }

        do {
            let newAvatar = avatarUrl != originalAvatarUrl ? (avatarUrl.isEmpty ? nil : avatarUrl) : nil
            let newBanner = bannerUrl != originalBannerUrl ? (bannerUrl.isEmpty ? nil : bannerUrl) : nil
            let apiCommunity = try await service.update(
                communityId: communityId,
                name: name != originalName ? name : nil,
                identifier: nil,
                description: descriptionText != originalDescription ? descriptionText : nil,
                isPrivate: isPrivate != originalIsPrivate ? isPrivate : nil,
                avatar: newAvatar,
                banner: newBanner
            )

            UserDefaults.standard.set(localColor, forKey: "community.color.\(communityId)")
            UserDefaults.standard.set(localEmoji, forKey: "community.emoji.\(communityId)")

            var community = apiCommunity.toCommunity()
            community.color = localColor
            community.emoji = localEmoji
            postToast(message: CommunitySettingsCopy.updatedToast, isSuccess: true)
            return community
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }

    func uploadCompressedAvatar(_ data: Data) async {
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }
        if let url = await uploadCompressedImage(data, prefix: "community_avatar") {
            avatarUrl = url
            postToast(message: CommunitySettingsCopy.avatarUploadedToast, isSuccess: true)
        } else {
            postToast(message: CommunitySettingsCopy.avatarFailedToast, isSuccess: false)
        }
    }

    func uploadCompressedBanner(_ data: Data) async {
        isUploadingBanner = true
        defer { isUploadingBanner = false }
        if let url = await uploadCompressedImage(data, prefix: "community_banner") {
            bannerUrl = url
            postToast(message: CommunitySettingsCopy.bannerUploadedToast, isSuccess: true)
        } else {
            postToast(message: CommunitySettingsCopy.bannerFailedToast, isSuccess: false)
        }
    }

    private func postToast(message: String, isSuccess: Bool) {
        NotificationCenter.default.post(
            name: Notification.Name("meeshy.showToast"),
            object: nil,
            userInfo: ["message": message, "isSuccess": isSuccess]
        )
    }

    /// L'avatar et la bannière d'une communauté sont des images d'IDENTITÉ,
    /// comme celles d'un profil : elles passent par le même chemin
    /// (`UserService.uploadImage`), jamais par un téléversement TUS sans
    /// contexte, réservé aux pièces jointes de message (#11411).
    private func uploadCompressedImage(_ data: Data, prefix: String) async -> String? {
        do {
            return try await imageUploader.uploadImage(data, filename: "\(prefix)_\(UUID().uuidString).jpg")
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }

    func deleteCommunity() async {
        do {
            try await service.delete(communityId: communityId)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    func leaveCommunity() async {
        do {
            try await service.leave(communityId: communityId)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}
