import SwiftUI
import PhotosUI
import MeeshySDK

public struct CommunitySettingsView: View {
    @StateObject private var viewModel: CommunitySettingsViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    @State private var avatarItem: PhotosPickerItem? = nil
    @State private var bannerItem: PhotosPickerItem? = nil

    public var onUpdated: ((MeeshyCommunity) -> Void)? = nil
    public var onDeleted: (() -> Void)? = nil
    public var onLeft: (() -> Void)? = nil

    private let presetColors = [
        "FF2E63", "A855F7", "08D9D6", "FF6B6B",
        "4ECDC4", "45B7D1", "F59E0B", "10B981",
        "6366F1", "EC4899", "14B8A6", "F97316"
    ]

    public init(community: MeeshyCommunity, onUpdated: ((MeeshyCommunity) -> Void)? = nil, onDeleted: (() -> Void)? = nil, onLeft: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunitySettingsViewModel(community: community))
        self.onUpdated = onUpdated
        self.onDeleted = onDeleted
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
                        privacySection
                        dangerSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
        }
        .alert(String(localized: "community.settings.error.title", defaultValue: "Erreur", bundle: .module), isPresented: $viewModel.showError) {
            Button(String(localized: "common.ok", defaultValue: "OK", bundle: .module)) {}
        } message: {
            Text(viewModel.errorMessage ?? String(localized: "community.settings.error.default", defaultValue: "Une erreur s'est produite", bundle: .module))
        }
        .alert(String(localized: "community.settings.delete.confirm.title", defaultValue: "Supprimer la communauté", bundle: .module), isPresented: $viewModel.showDeleteConfirm) {
            Button(String(localized: "community.settings.delete.button", defaultValue: "Supprimer", bundle: .module), role: .destructive) {
                Task {
                    await viewModel.deleteCommunity()
                    onDeleted?()
                    dismiss()
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
        } message: {
            Text(String(localized: "community.settings.delete.confirm.message", defaultValue: "Cette action est irréversible. Tous les membres, canaux et messages seront supprimés définitivement.", bundle: .module))
        }
        .alert(String(localized: "community.settings.leave.confirm.title", defaultValue: "Quitter la communauté", bundle: .module), isPresented: $viewModel.showLeaveConfirm) {
            Button(String(localized: "community.settings.leave.button", defaultValue: "Quitter", bundle: .module), role: .destructive) {
                Task {
                    await viewModel.leaveCommunity()
                    onLeft?()
                    dismiss()
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
        } message: {
            Text(String(localized: "community.settings.leave.confirm.message", defaultValue: "Vous n'aurez plus accès aux canaux et messages de cette communauté.", bundle: .module))
        }
        .entityImagePickerFlow(pickerItem: $avatarItem, context: .avatar, maxSizeKB: 500) { data in
            Task { await viewModel.uploadCompressedAvatar(data) }
        }
        .entityImagePickerFlow(pickerItem: $bannerItem, context: .banner, maxSizeKB: 800) { data in
            Task { await viewModel.uploadCompressedBanner(data) }
        }
    }

    // MARK: - Header

    private var settingsHeader: some View {
        HStack {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module)) { dismiss() }
                .font(.system(size: 16, design: .rounded))
                .foregroundColor(theme.textSecondary)

            Spacer()

            Text(String(localized: "community.settings.title", defaultValue: "Réglages", bundle: .module))
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

    // MARK: - Visual Section (Hero Banner + Avatar)

    private var visualSection: some View {
        VStack(spacing: 16) {
            VStack(spacing: 0) {
                ZStack(alignment: .bottomTrailing) {
                    communityBannerView
                        .frame(height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    PhotosPicker(selection: $bannerItem, matching: .images) {
                        Label(String(localized: "community.settings.banner.edit", defaultValue: "Modifier", bundle: .module), systemImage: "photo.fill")
                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(Color.black.opacity(0.5)))
                    }
                    .disabled(viewModel.isUploadingBanner)
                    .padding(8)

                    if viewModel.isUploadingBanner {
                        RoundedRectangle(cornerRadius: 16)
                            .fill(Color.black.opacity(0.4))
                            .frame(height: 120)
                            .overlay(ProgressView().tint(.white))
                    }
                }

                ZStack(alignment: .bottomTrailing) {
                    MeeshyAvatar(
                        name: viewModel.name,
                        context: .profileSheet,
                        kind: .entity,
                        accentColor: viewModel.localColor,
                        avatarURL: viewModel.avatarUrl.isEmpty ? nil : viewModel.avatarUrl
                    )
                    .overlay(
                        Circle()
                            .stroke(theme.backgroundPrimary, lineWidth: 4)
                    )

                    PhotosPicker(selection: $avatarItem, matching: .images) {
                        Image(systemName: "pencil.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(Color(hex: viewModel.localColor))
                            .background(Circle().fill(theme.backgroundPrimary))
                    }
                    .disabled(viewModel.isUploadingAvatar)
                    .offset(x: 4, y: 4)

                    if viewModel.isUploadingAvatar {
                        Circle()
                            .fill(Color.black.opacity(0.4))
                            .frame(width: 80, height: 80)
                            .overlay(ProgressView().tint(.white))
                    }
                }
                .offset(y: -40)
                .padding(.bottom, -40)

                Text(viewModel.name)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .padding(.top, 8)
            }

            // Color picker
            VStack(alignment: .leading, spacing: 10) {
                Text("Couleur")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textSecondary)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 6), spacing: 10) {
                    ForEach(presetColors, id: \.self) { hex in
                        colorSwatch(hex: hex)
                    }
                }
            }
            .padding(14)
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Emoji picker
            settingsField(label: "Emoji") {
                TextField("🏘️", text: $viewModel.localEmoji)
                    .font(.system(size: 22))
                    .foregroundColor(theme.textPrimary)
                    .onChange(of: viewModel.localEmoji) { newValue in
                        let trimmed = String(newValue.unicodeScalars.prefix(2))
                        if trimmed != newValue { viewModel.localEmoji = trimmed }
                    }
            }
        }
    }

    @ViewBuilder
    private var communityBannerView: some View {
        if !viewModel.bannerUrl.isEmpty, let url = URL(string: viewModel.bannerUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    communityBannerPlaceholder
                }
            }
        } else {
            communityBannerPlaceholder
        }
    }

    private var communityBannerPlaceholder: some View {
        LinearGradient(
            colors: [Color(hex: viewModel.localColor).opacity(0.6), Color(hex: viewModel.localColor).opacity(0.2)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private func colorSwatch(hex: String) -> some View {
        let isSelected = viewModel.localColor == hex
        return Circle()
            .fill(Color(hex: hex))
            .frame(width: 38, height: 38)
            .overlay {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .overlay {
                Circle()
                    .stroke(Color.white.opacity(isSelected ? 0.6 : 0), lineWidth: 2)
                    .padding(2)
            }
            .scaleEffect(isSelected ? 1.1 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isSelected)
            .onTapGesture { viewModel.localColor = hex }
    }

    // MARK: - Edit Section

    private var editSection: some View {
        VStack(spacing: 16) {
            sectionHeader(String(localized: "community.settings.section.info", defaultValue: "Infos", bundle: .module))

            VStack(spacing: 12) {
                settingsField(label: String(localized: "community.settings.field.name", defaultValue: "Nom", bundle: .module)) {
                    TextField(String(localized: "community.settings.field.name.placeholder", defaultValue: "Nom de la communauté", bundle: .module), text: $viewModel.name)
                        .font(.system(size: 16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                }

                settingsField(label: String(localized: "community.settings.field.description", defaultValue: "Description", bundle: .module)) {
                    TextField(String(localized: "community.settings.field.description", defaultValue: "Description", bundle: .module), text: $viewModel.descriptionText, axis: .vertical)
                        .font(.system(size: 16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(3...6)
                }
            }
        }
    }

    // MARK: - Privacy Section

    private var privacySection: some View {
        VStack(spacing: 12) {
            sectionHeader(String(localized: "community.settings.section.privacy", defaultValue: "Confidentialité", bundle: .module))

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "community.settings.privacy.title", defaultValue: "Communauté privée", bundle: .module))
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                    Text(viewModel.isPrivate ? String(localized: "community.settings.privacy.byInvitation", defaultValue: "Sur invitation", bundle: .module) : String(localized: "community.settings.privacy.openToAll", defaultValue: "Ouverte à tous", bundle: .module))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textSecondary)
                }
                Spacer()
                Toggle("", isOn: $viewModel.isPrivate)
                    .tint(MeeshyColors.indigo500)
                    .labelsHidden()
            }
            .padding(14)
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Danger Section

    private var dangerSection: some View {
        VStack(spacing: 12) {
            sectionHeader(String(localized: "community.settings.section.danger", defaultValue: "Zone dangereuse", bundle: .module))

            if viewModel.isCreator {
                Button {
                    viewModel.showDeleteConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "trash.fill")
                        Text(String(localized: "community.settings.delete.label", defaultValue: "Supprimer la communauté", bundle: .module))
                    }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            } else {
                Button {
                    viewModel.showLeaveConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "arrow.right.square.fill")
                        Text(String(localized: "community.settings.leave.label", defaultValue: "Quitter la communauté", bundle: .module))
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
final class CommunitySettingsViewModel: ObservableObject {
    @Published var name: String
    @Published var descriptionText: String
    @Published var isPrivate: Bool
    @Published var avatarUrl: String
    @Published var bannerUrl: String
    @Published var localColor: String
    @Published var localEmoji: String
    @Published var isUploadingAvatar = false
    @Published var isUploadingBanner = false
    @Published var isSaving = false
    @Published var showError = false
    @Published var errorMessage: String?
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

    var hasChanges: Bool {
        name != originalName ||
        descriptionText != originalDescription ||
        isPrivate != originalIsPrivate ||
        avatarUrl != originalAvatarUrl ||
        bannerUrl != originalBannerUrl ||
        localColor != originalLocalColor ||
        localEmoji != originalLocalEmoji
    }

    init(community: MeeshyCommunity) {
        self.communityId = community.id
        self.isCreator = community.createdBy == (AuthManager.shared.currentUser?.id ?? "")

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

        let savedColor = UserDefaults.standard.string(forKey: "community.color.\(community.id)") ?? "4ECDC4"
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
            let apiCommunity = try await CommunityService.shared.update(
                communityId: communityId,
                name: name != originalName ? name : nil,
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
            postToast(message: String(localized: "community.settings.toast.updated", defaultValue: "Communaute mise a jour", bundle: .module), isSuccess: true)
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
            postToast(message: String(localized: "community.settings.toast.avatarUploaded", defaultValue: "Avatar televerse", bundle: .module), isSuccess: true)
        } else {
            postToast(message: String(localized: "community.settings.toast.avatarFailed", defaultValue: "Echec du telechargement de l'avatar", bundle: .module), isSuccess: false)
        }
    }

    func uploadCompressedBanner(_ data: Data) async {
        isUploadingBanner = true
        defer { isUploadingBanner = false }
        if let url = await uploadCompressedImage(data, prefix: "community_banner") {
            bannerUrl = url
            postToast(message: String(localized: "community.settings.toast.bannerUploaded", defaultValue: "Banniere televersee", bundle: .module), isSuccess: true)
        } else {
            postToast(message: String(localized: "community.settings.toast.bannerFailed", defaultValue: "Echec du telechargement de la banniere", bundle: .module), isSuccess: false)
        }
    }

    private func postToast(message: String, isSuccess: Bool) {
        NotificationCenter.default.post(
            name: Notification.Name("meeshy.showToast"),
            object: nil,
            userInfo: ["message": message, "isSuccess": isSuccess]
        )
    }

    private func uploadCompressedImage(_ data: Data, prefix: String) async -> String? {
        do {
            let fileName = "\(prefix)_\(UUID().uuidString).jpg"
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

    func deleteCommunity() async {
        do {
            try await CommunityService.shared.delete(communityId: communityId)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    func leaveCommunity() async {
        do {
            try await CommunityService.shared.leave(communityId: communityId)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}
