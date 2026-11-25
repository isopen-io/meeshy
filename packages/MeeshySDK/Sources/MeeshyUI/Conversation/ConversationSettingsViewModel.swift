import SwiftUI
import Combine
import PhotosUI
import MeeshySDK

@MainActor
public final class ConversationSettingsViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var title: String
    @Published var descriptionText: String
    @Published var avatarUrl: String
    @Published var bannerUrl: String
    @Published var isUploadingAvatar = false
    @Published var isUploadingBanner = false
    @Published var isSaving = false
    @Published var showError = false
    @Published var errorMessage: String?
    @Published var showLeaveConfirm = false
    @Published var showDeleteConversation = false

    @Published var defaultWriteRole: String
    @Published var isAnnouncementChannel: Bool
    @Published var slowModeSeconds: Int
    @Published var autoTranslateEnabled: Bool

    @Published public var participants: [APIParticipant] = []
    @Published public var isLoadingMembers = false
    @Published public var memberSearchText: String = ""
    @Published public var totalMemberCount: Int = 0

    /// La conversation telle qu'elle est entrée dans cet écran. Le `PUT` ne rend
    /// que les métadonnées du conteneur — ni rang du lecteur, ni effectif, ni
    /// participants — et `toAPIConversation()` comble ces trous par `nil`.
    /// Rendre cet objet amputé à l'appelant lui ferait perdre son propre rang
    /// juste après une sauvegarde réussie. On repart donc de l'original et on
    /// n'y remplace que ce que le serveur vient de confirmer.
    private let originalConversation: MeeshyConversation

    public let conversationId: String
    let conversationName: String
    public let accentColor: String
    public let currentUserRole: MemberRole

    private let imageUploader: UserServiceProviding

    private let originalTitle: String
    private let originalDescription: String
    private let originalAvatarUrl: String
    private let originalBannerUrl: String
    private let originalDefaultWriteRole: String
    private let originalIsAnnouncementChannel: Bool
    private let originalSlowModeSeconds: Int
    private let originalAutoTranslateEnabled: Bool

    var hasChanges: Bool {
        title != originalTitle ||
        descriptionText != originalDescription ||
        avatarUrl != originalAvatarUrl ||
        bannerUrl != originalBannerUrl ||
        defaultWriteRole != originalDefaultWriteRole ||
        isAnnouncementChannel != originalIsAnnouncementChannel ||
        slowModeSeconds != originalSlowModeSeconds ||
        autoTranslateEnabled != originalAutoTranslateEnabled
    }

    init(
        conversation: MeeshyConversation,
        currentUserRole: MemberRole = .member,
        imageUploader: UserServiceProviding = UserService.shared
    ) {
        self.imageUploader = imageUploader
        self.originalConversation = conversation
        self.conversationId = conversation.id
        self.conversationName = conversation.name
        self.accentColor = conversation.accentColor
        self.currentUserRole = currentUserRole

        self.title = conversation.title ?? ""
        self.descriptionText = conversation.description ?? ""
        self.originalTitle = conversation.title ?? ""
        self.originalDescription = conversation.description ?? ""

        let avatarStr = conversation.avatar ?? ""
        let bannerStr = conversation.banner ?? ""
        self.avatarUrl = avatarStr
        self.bannerUrl = bannerStr
        self.originalAvatarUrl = avatarStr
        self.originalBannerUrl = bannerStr

        let writeRole = conversation.defaultWriteRole ?? "everyone"
        self.defaultWriteRole = writeRole
        self.originalDefaultWriteRole = writeRole

        let announcement = conversation.isAnnouncementChannel
        self.isAnnouncementChannel = announcement
        self.originalIsAnnouncementChannel = announcement

        let slowMode = conversation.slowModeSeconds ?? 0
        self.slowModeSeconds = slowMode
        self.originalSlowModeSeconds = slowMode

        let autoTranslate = conversation.autoTranslateEnabled ?? true
        self.autoTranslateEnabled = autoTranslate
        self.originalAutoTranslateEnabled = autoTranslate

        self.totalMemberCount = conversation.memberCount
    }

    func save() async -> MeeshyConversation? {
        isSaving = true
        defer { isSaving = false }

        do {
            let newTitle = title != originalTitle ? (title.isEmpty ? nil : title) : nil
            let newDescription = descriptionText != originalDescription ? descriptionText : nil
            let newAvatar = avatarUrl != originalAvatarUrl ? (avatarUrl.isEmpty ? nil : avatarUrl) : nil
            let newBanner = bannerUrl != originalBannerUrl ? (bannerUrl.isEmpty ? nil : bannerUrl) : nil
            let newWriteRole = defaultWriteRole != originalDefaultWriteRole ? defaultWriteRole : nil
            let newAnnouncement = isAnnouncementChannel != originalIsAnnouncementChannel ? isAnnouncementChannel : nil
            let newSlowMode = slowModeSeconds != originalSlowModeSeconds ? slowModeSeconds : nil
            let newAutoTranslate = autoTranslateEnabled != originalAutoTranslateEnabled ? autoTranslateEnabled : nil

            let apiConversation = try await ConversationService.shared.update(
                conversationId: conversationId,
                title: newTitle,
                description: newDescription,
                avatar: newAvatar,
                banner: newBanner,
                defaultWriteRole: newWriteRole,
                isAnnouncementChannel: newAnnouncement,
                slowModeSeconds: newSlowMode,
                autoTranslateEnabled: newAutoTranslate
            )

            postToast(message: String(localized: "conversation.settings.toast.updated", defaultValue: "Conversation mise à jour", bundle: .module), isSuccess: true)
            return originalConversation.mergingMetadata(from: apiConversation)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }

    func uploadCompressedAvatar(_ data: Data) async {
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }
        if let url = await uploadCompressedImage(data, prefix: "conversation_avatar") {
            avatarUrl = url
            postToast(message: String(localized: "conversation.settings.toast.avatarUploaded", defaultValue: "Avatar téléversé", bundle: .module), isSuccess: true)
        } else {
            postToast(message: String(localized: "conversation.settings.toast.avatarFailed", defaultValue: "Échec du téléchargement de l'avatar", bundle: .module), isSuccess: false)
        }
    }

    func uploadCompressedBanner(_ data: Data) async {
        isUploadingBanner = true
        defer { isUploadingBanner = false }
        if let url = await uploadCompressedImage(data, prefix: "conversation_banner") {
            bannerUrl = url
            postToast(message: String(localized: "conversation.settings.toast.bannerUploaded", defaultValue: "Bannière téléversée", bundle: .module), isSuccess: true)
        } else {
            postToast(message: String(localized: "conversation.settings.toast.bannerFailed", defaultValue: "Échec du téléchargement de la bannière", bundle: .module), isSuccess: false)
        }
    }

    func leaveConversation() async {
        do {
            try await ConversationService.shared.leave(conversationId: conversationId)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    func deleteConversationForAll() async {
        do {
            try await ConversationService.shared.delete(conversationId: conversationId)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    // MARK: - Member Management

    public func loadMembers() async {
        isLoadingMembers = true
        defer { isLoadingMembers = false }

        do {
            let response = try await ConversationService.shared.getParticipants(
                conversationId: conversationId,
                limit: 50,
                cursor: nil
            )
            participants = response.data
            if response.data.count > totalMemberCount {
                totalMemberCount = response.data.count
            }
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    /// `userId`, jamais un `Participant.id` : la route filtre sur la colonne
    /// `userId` et répond 404 pour un identifiant de participant. Le nom du
    /// paramètre EST la garde — la route voisine des droits attend l'autre.
    public func updateRole(userId: String, newRole: String) async {
        do {
            try await ConversationService.shared.updateParticipantRole(
                conversationId: conversationId,
                userId: userId,
                role: newRole
            )
            postToast(message: String(localized: "conversation.settings.toast.roleUpdated", defaultValue: "Rôle mis à jour", bundle: .module), isSuccess: true)
            await loadMembers()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    /// `key` — un `User.id` pour un compte, un `Participant.id` pour un visiteur
    /// venu par un lien partagé. Le gateway résout la cible sous les DEUX
    /// colonnes ; c'est ce qui rend un visiteur sans compte expulsable.
    public func expelParticipant(key: String) async {
        do {
            try await ConversationService.shared.removeParticipant(
                conversationId: conversationId,
                key: key
            )
            postToast(message: String(localized: "conversation.settings.toast.memberExpelled", defaultValue: "Membre expulsé", bundle: .module), isSuccess: true)
            await loadMembers()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    /// Bannir sort de la conversation ET ferme le lien de partage emprunté —
    /// le gateway invalide `Participant.shareLinkId`. Même clé que l'expulsion.
    public func banParticipant(key: String) async {
        do {
            try await ConversationService.shared.banParticipant(
                conversationId: conversationId,
                key: key
            )
            postToast(message: String(localized: "conversation.settings.toast.memberBanned", defaultValue: "Membre banni", bundle: .module), isSuccess: true)
            await loadMembers()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    /// Le pendant EXACT de `banParticipant` : depuis #4176 la passerelle autorise
    /// la levée à qui pouvait poser le bannissement, pas seulement aux admins.
    /// Sans ce geste, bannir restait irréversible depuis l'app — la moitié
    /// destructrice offerte, la moitié réparatrice absente.
    public func unbanParticipant(key: String) async {
        do {
            try await ConversationService.shared.unbanParticipant(
                conversationId: conversationId,
                key: key
            )
            postToast(message: String(localized: "conversation.settings.toast.memberUnbanned", defaultValue: "Bannissement levé", bundle: .module), isSuccess: true)
            await loadMembers()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    /// L'avatar et la bannière d'une conversation sont des images d'IDENTITÉ :
    /// elles passent par `UserService.uploadImage`, jamais par un TUS sans
    /// contexte, réservé aux pièces jointes de message (#16896).
    private func uploadCompressedImage(_ data: Data, prefix: String) async -> String? {
        do {
            return try await imageUploader.uploadImage(data, filename: "\(prefix)_\(UUID().uuidString).jpg")
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }

    private func postToast(message: String, isSuccess: Bool) {
        FeedbackToastCenter.post(message, isSuccess: isSuccess)
    }
}
