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
        .alert("Erreur", isPresented: $viewModel.showError) {
            Button("OK") {}
        } message: {
            Text(viewModel.errorMessage ?? "Une erreur s'est produite")
        }
        .alert("Supprimer la communauté", isPresented: $viewModel.showDeleteConfirm) {
            Button("Supprimer", role: .destructive) {
                Task {
                    await viewModel.deleteCommunity()
                    onDeleted?()
                    dismiss()
                }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Cette action est irréversible. Tous les membres, canaux et messages seront supprimés définitivement.")
        }
        .alert("Quitter la communauté", isPresented: $viewModel.showLeaveConfirm) {
            Button("Quitter", role: .destructive) {
                Task {
                    await viewModel.leaveCommunity()
                    onLeft?()
                    dismiss()
                }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Vous n'aurez plus accès aux canaux et messages de cette communauté.")
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
            Button("Annuler") { dismiss() }
                .font(.system(size: 16, design: .rounded))
                .foregroundColor(theme.textSecondary)

            Spacer()

            Text("Réglages")
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
                        .tint(Color(hex: "FF2E63"))
                } else {
                    Text("Sauvegarder")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .foregroundColor(viewModel.hasChanges ? Color(hex: "FF2E63") : theme.textMuted)
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
            sectionHeader("Apparence")

            VStack(spacing: 12) {
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

                // Avatar
                settingsField(label: "Avatar") {
                    HStack {
                        if !viewModel.avatarUrl.isEmpty {
                            AsyncImage(url: URL(string: viewModel.avatarUrl)) { image in
                                image.resizable().scaledToFill().frame(width: 40, height: 40).clipShape(Circle())
                            } placeholder: {
                                Circle().fill(theme.backgroundSecondary).frame(width: 40, height: 40)
                            }
                        }
                        
                        PhotosPicker(selection: $avatarItem, matching: .images) {
                            Text(viewModel.isUploadingAvatar ? "Upload en cours..." : "Changer l'avatar")
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundColor(Color(hex: "4ECDC4"))
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

                // Banner
                settingsField(label: "Bannière") {
                    HStack {
                        if !viewModel.bannerUrl.isEmpty {
                            AsyncImage(url: URL(string: viewModel.bannerUrl)) { image in
                                image.resizable().scaledToFill().frame(width: 60, height: 30).clipShape(RoundedRectangle(cornerRadius: 6))
                            } placeholder: {
                                RoundedRectangle(cornerRadius: 6).fill(theme.backgroundSecondary).frame(width: 60, height: 30)
                            }
                        }
                        
                        PhotosPicker(selection: $bannerItem, matching: .images) {
                            Text(viewModel.isUploadingBanner ? "Upload en cours..." : "Changer la bannière")
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundColor(Color(hex: "4ECDC4"))
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
            sectionHeader("Infos")

            VStack(spacing: 12) {
                settingsField(label: "Nom") {
                    TextField("Nom de la communauté", text: $viewModel.name)
                        .font(.system(size: 16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                }

                settingsField(label: "Description") {
                    TextField("Description", text: $viewModel.descriptionText, axis: .vertical)
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
            sectionHeader("Confidentialité")

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Communauté privée")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                    Text(viewModel.isPrivate ? "Sur invitation" : "Ouverte à tous")
                        .font(.system(size: 12))
                        .foregroundColor(theme.textSecondary)
                }
                Spacer()
                Toggle("", isOn: $viewModel.isPrivate)
                    .tint(Color(hex: "A855F7"))
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
            sectionHeader("Zone dangereuse")

            if viewModel.isCreator {
                Button {
                    viewModel.showDeleteConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "trash.fill")
                        Text("Supprimer la communauté")
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
                        Text("Quitter la communauté")
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
            return community
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
        }
    }

    func uploadBanner(_ item: PhotosPickerItem) async {
        isUploadingBanner = true
        defer { isUploadingBanner = false }
        if let url = await uploadPhotoItem(item) {
            bannerUrl = url
        }
    }

    private func uploadPhotoItem(_ item: PhotosPickerItem) async -> String? {
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return nil }
            let fileName = "community_upload_\(UUID().uuidString).jpg"
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
