import SwiftUI
import PhotosUI
import MeeshySDK

public struct ConversationSettingsView: View {
    @StateObject private var viewModel: ConversationSettingsViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    @State private var avatarItem: PhotosPickerItem? = nil
    @State private var bannerItem: PhotosPickerItem? = nil

    public var onUpdated: ((MeeshyConversation) -> Void)? = nil
    public var onLeft: (() -> Void)? = nil

    public init(conversation: MeeshyConversation, onUpdated: ((MeeshyConversation) -> Void)? = nil, onLeft: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: ConversationSettingsViewModel(conversation: conversation))
        self.onUpdated = onUpdated
        self.onLeft = onLeft
    }

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                settingsHeader

                ScrollView {
                    VStack(spacing: 20) {
                        visualSection
                        editSection
                        dangerSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
        }
        .alert(String(localized: "conversation.settings.error.title", defaultValue: "Erreur", bundle: .module), isPresented: $viewModel.showError) {
            Button(String(localized: "common.ok", defaultValue: "OK", bundle: .module)) {}
        } message: {
            Text(viewModel.errorMessage ?? String(localized: "conversation.settings.error.default", defaultValue: "Une erreur s'est produite", bundle: .module))
        }
        .alert(String(localized: "conversation.settings.leave.confirm.title", defaultValue: "Quitter la conversation", bundle: .module), isPresented: $viewModel.showLeaveConfirm) {
            Button(String(localized: "conversation.settings.leave.button", defaultValue: "Quitter", bundle: .module), role: .destructive) {
                Task {
                    await viewModel.leaveConversation()
                    onLeft?()
                    dismiss()
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
        } message: {
            Text(String(localized: "conversation.settings.leave.confirm.message", defaultValue: "Vous n'aurez plus acces aux messages de cette conversation.", bundle: .module))
        }
        .onChange(of: avatarItem) { item in
            guard let item = item else { return }
            Task { await viewModel.uploadAvatar(item) }
        }
        .onChange(of: bannerItem) { item in
            guard let item = item else { return }
            Task { await viewModel.uploadBanner(item) }
        }
    }

    // MARK: - Header

    private var settingsHeader: some View {
        HStack {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module)) { dismiss() }
                .font(.system(size: 16, design: .rounded))
                .foregroundColor(theme.textSecondary)

            Spacer()

            Text(String(localized: "conversation.settings.title", defaultValue: "Reglages", bundle: .module))
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                Task {
                    let updated = await viewModel.save()
                    if let updated {
                        onUpdated?(updated)
                        dismiss()
                    }
                }
            } label: {
                if viewModel.isSaving {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(MeeshyColors.indigo500)
                } else {
                    Text(String(localized: "common.save", defaultValue: "Sauvegarder", bundle: .module))
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .foregroundColor(viewModel.hasChanges ? MeeshyColors.indigo500 : theme.textMuted)
                }
            }
            .disabled(!viewModel.hasChanges || viewModel.isSaving)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(theme.backgroundPrimary)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(theme.textMuted.opacity(0.2))
                .frame(height: 0.5)
        }
    }

    // MARK: - Visual Section

    private var visualSection: some View {
        VStack(spacing: 16) {
            sectionHeader(String(localized: "conversation.settings.section.appearance", defaultValue: "Apparence", bundle: .module))

            VStack(spacing: 12) {
                settingsField(label: String(localized: "conversation.settings.avatar", defaultValue: "Avatar", bundle: .module)) {
                    HStack {
                        MeeshyAvatar(
                            name: viewModel.title.isEmpty ? viewModel.conversationName : viewModel.title,
                            context: .custom(40),
                            kind: .entity,
                            accentColor: viewModel.accentColor,
                            avatarURL: viewModel.avatarUrl.isEmpty ? nil : viewModel.avatarUrl
                        )

                        PhotosPicker(selection: $avatarItem, matching: .images) {
                            Text(viewModel.isUploadingAvatar ? String(localized: "common.uploading", defaultValue: "Upload en cours...", bundle: .module) : String(localized: "conversation.settings.avatar.change", defaultValue: "Changer l'avatar", bundle: .module))
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundColor(MeeshyColors.indigo400)
                        }
                        .disabled(viewModel.isUploadingAvatar)

                        if !viewModel.avatarUrl.isEmpty {
                            Spacer()
                            Button(role: .destructive) {
                                viewModel.avatarUrl = ""
                            } label: {
                                Image(systemName: "trash")
                            }
                        }
                    }
                }

                settingsField(label: String(localized: "conversation.settings.banner", defaultValue: "Banniere", bundle: .module)) {
                    HStack {
                        if !viewModel.bannerUrl.isEmpty {
                            AsyncImage(url: URL(string: viewModel.bannerUrl)) { image in
                                image.resizable().scaledToFill().frame(width: 60, height: 30).clipShape(RoundedRectangle(cornerRadius: 6))
                            } placeholder: {
                                RoundedRectangle(cornerRadius: 6).fill(theme.backgroundSecondary).frame(width: 60, height: 30)
                            }
                        }

                        PhotosPicker(selection: $bannerItem, matching: .images) {
                            Text(viewModel.isUploadingBanner ? String(localized: "common.uploading", defaultValue: "Upload en cours...", bundle: .module) : String(localized: "conversation.settings.banner.change", defaultValue: "Changer la banniere", bundle: .module))
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundColor(MeeshyColors.indigo400)
                        }
                        .disabled(viewModel.isUploadingBanner)

                        if !viewModel.bannerUrl.isEmpty {
                            Spacer()
                            Button(role: .destructive) {
                                viewModel.bannerUrl = ""
                            } label: {
                                Image(systemName: "trash")
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Edit Section

    private var editSection: some View {
        VStack(spacing: 16) {
            sectionHeader(String(localized: "conversation.settings.section.info", defaultValue: "Infos", bundle: .module))

            VStack(spacing: 12) {
                settingsField(label: String(localized: "conversation.settings.field.title", defaultValue: "Titre", bundle: .module)) {
                    TextField(String(localized: "conversation.settings.field.title.placeholder", defaultValue: "Titre de la conversation", bundle: .module), text: $viewModel.title)
                        .font(.system(size: 16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                }

                settingsField(label: String(localized: "conversation.settings.field.description", defaultValue: "Description", bundle: .module)) {
                    TextField(String(localized: "conversation.settings.field.description", defaultValue: "Description", bundle: .module), text: $viewModel.descriptionText, axis: .vertical)
                        .font(.system(size: 16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(3...6)
                }
            }
        }
    }

    // MARK: - Danger Section

    private var dangerSection: some View {
        VStack(spacing: 12) {
            sectionHeader(String(localized: "conversation.settings.section.danger", defaultValue: "Zone dangereuse", bundle: .module))

            Button {
                viewModel.showLeaveConfirm = true
            } label: {
                HStack {
                    Image(systemName: "arrow.right.square.fill")
                    Text(String(localized: "conversation.settings.leave.label", defaultValue: "Quitter la conversation", bundle: .module))
                }
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(.orange)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.orange.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundColor(theme.textMuted)
            .textCase(.uppercase)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func settingsField<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textSecondary)
            content()
                .textFieldStyle(.plain)
                .padding(12)
                .background(theme.backgroundSecondary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}

// MARK: - ViewModel

@MainActor
final class ConversationSettingsViewModel: ObservableObject {
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

    let conversationId: String
    let conversationName: String
    let accentColor: String

    private let originalTitle: String
    private let originalDescription: String
    private let originalAvatarUrl: String
    private let originalBannerUrl: String

    var hasChanges: Bool {
        title != originalTitle ||
        descriptionText != originalDescription ||
        avatarUrl != originalAvatarUrl ||
        bannerUrl != originalBannerUrl
    }

    init(conversation: MeeshyConversation) {
        self.conversationId = conversation.id
        self.conversationName = conversation.name
        self.accentColor = conversation.accentColor

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
    }

    func save() async -> MeeshyConversation? {
        isSaving = true
        defer { isSaving = false }

        do {
            let newTitle = title != originalTitle ? (title.isEmpty ? nil : title) : nil
            let newDescription = descriptionText != originalDescription ? descriptionText : nil
            let newAvatar = avatarUrl != originalAvatarUrl ? (avatarUrl.isEmpty ? nil : avatarUrl) : nil
            let newBanner = bannerUrl != originalBannerUrl ? (bannerUrl.isEmpty ? nil : bannerUrl) : nil

            let apiConversation = try await ConversationService.shared.update(
                conversationId: conversationId,
                title: newTitle,
                description: newDescription,
                avatar: newAvatar,
                banner: newBanner
            )

            postToast(message: String(localized: "conversation.settings.toast.updated", defaultValue: "Conversation mise a jour", bundle: .module), isSuccess: true)
            return apiConversation.toConversation(currentUserId: AuthManager.shared.currentUser?.id ?? "")
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }

    func uploadAvatar(_ item: PhotosPickerItem) async {
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }
        if let url = await uploadPhotoItem(item) {
            avatarUrl = url
            postToast(message: String(localized: "conversation.settings.toast.avatarUploaded", defaultValue: "Avatar televerse", bundle: .module), isSuccess: true)
        } else {
            postToast(message: String(localized: "conversation.settings.toast.avatarFailed", defaultValue: "Echec du telechargement de l'avatar", bundle: .module), isSuccess: false)
        }
    }

    func uploadBanner(_ item: PhotosPickerItem) async {
        isUploadingBanner = true
        defer { isUploadingBanner = false }
        if let url = await uploadPhotoItem(item) {
            bannerUrl = url
            postToast(message: String(localized: "conversation.settings.toast.bannerUploaded", defaultValue: "Banniere televersee", bundle: .module), isSuccess: true)
        } else {
            postToast(message: String(localized: "conversation.settings.toast.bannerFailed", defaultValue: "Echec du telechargement de la banniere", bundle: .module), isSuccess: false)
        }
    }

    func leaveConversation() async {
        do {
            try await ConversationService.shared.deleteForMe(conversationId: conversationId)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func uploadPhotoItem(_ item: PhotosPickerItem) async -> String? {
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return nil }
            let fileName = "conversation_upload_\(UUID().uuidString).jpg"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try data.write(to: tempURL)

            let serverOrigin = MeeshyConfig.shared.serverOrigin
            guard let baseURL = URL(string: serverOrigin),
                  let token = APIClient.shared.authToken else { return nil }

            let manager = TusUploadManager(baseURL: baseURL)
            let result = try await manager.uploadFile(fileURL: tempURL, mimeType: "image/jpeg", token: token)
            try? FileManager.default.removeItem(at: tempURL)
            return result.fileUrl
        } catch {
            await MainActor.run {
                self.errorMessage = error.localizedDescription
                self.showError = true
            }
            return nil
        }
    }

    private func postToast(message: String, isSuccess: Bool) {
        NotificationCenter.default.post(
            name: Notification.Name("meeshy.showToast"),
            object: nil,
            userInfo: ["message": message, "isSuccess": isSuccess]
        )
    }
}
