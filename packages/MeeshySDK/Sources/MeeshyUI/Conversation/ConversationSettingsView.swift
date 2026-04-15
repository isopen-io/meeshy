import SwiftUI
import Combine
import PhotosUI
import MeeshySDK

public struct ConversationSettingsView: View {
    @StateObject private var viewModel: ConversationSettingsViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    @State private var avatarItem: PhotosPickerItem? = nil
    @State private var bannerItem: PhotosPickerItem? = nil
    @State private var showDeleteForMeAlert = false

    public var onUpdated: ((MeeshyConversation) -> Void)? = nil
    public var onLeft: (() -> Void)? = nil

    public init(
        conversation: MeeshyConversation,
        currentUserRole: MemberRole = .member,
        onUpdated: ((MeeshyConversation) -> Void)? = nil,
        onLeft: (() -> Void)? = nil
    ) {
        _viewModel = StateObject(wrappedValue: ConversationSettingsViewModel(
            conversation: conversation,
            currentUserRole: currentUserRole
        ))
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

                        if viewModel.currentUserRole.hasMinimumRole(.admin) {
                            permissionsSection
                        }

                        membersSection

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
            Text(String(localized: "conversation.settings.leave.confirm.message", defaultValue: "Vous ne recevrez plus de messages. Votre historique restera lisible.", bundle: .module))
        }
        .alert("Supprimer pour moi ?", isPresented: $showDeleteForMeAlert) {
            Button("Annuler", role: .cancel) {}
            Button("Supprimer", role: .destructive) {
                Task {
                    try? await ConversationService.shared.deleteForMe(conversationId: viewModel.conversationId)
                    onLeft?()
                    dismiss()
                }
            }
        } message: {
            Text("Cette conversation disparaitra definitivement de votre liste. Les autres membres ne seront pas affectes.")
        }
        .alert(String(localized: "conversation.settings.delete.confirm.title", defaultValue: "Supprimer la conversation", bundle: .module), isPresented: $viewModel.showDeleteConversation) {
            Button(String(localized: "conversation.settings.delete.button", defaultValue: "Supprimer", bundle: .module), role: .destructive) {
                Task {
                    await viewModel.deleteConversationForAll()
                    onLeft?()
                    dismiss()
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
        } message: {
            Text("Cette conversation sera fermee pour tous les membres. Plus personne ne pourra ecrire.")
        }
        .entityImagePickerFlow(pickerItem: $avatarItem, context: .avatar, accentColor: viewModel.accentColor, maxSizeKB: 500) { data in
            Task { await viewModel.uploadCompressedAvatar(data) }
        }
        .entityImagePickerFlow(pickerItem: $bannerItem, context: .banner, accentColor: viewModel.accentColor, maxSizeKB: 800) { data in
            Task { await viewModel.uploadCompressedBanner(data) }
        }
        .task {
            await viewModel.loadMembers()
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

    // MARK: - Visual Section (Hero Banner + Avatar)

    private var visualSection: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottomTrailing) {
                bannerView
                    .frame(height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                PhotosPicker(selection: $bannerItem, matching: .images) {
                    Label(String(localized: "conversation.settings.banner.edit", defaultValue: "Modifier", bundle: .module), systemImage: "photo.fill")
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
                    name: viewModel.title.isEmpty ? viewModel.conversationName : viewModel.title,
                    context: .profileSheet,
                    kind: .entity,
                    accentColor: viewModel.accentColor,
                    avatarURL: viewModel.avatarUrl.isEmpty ? nil : viewModel.avatarUrl
                )
                .overlay(
                    Circle()
                        .stroke(theme.backgroundPrimary, lineWidth: 4)
                )

                PhotosPicker(selection: $avatarItem, matching: .images) {
                    Image(systemName: "pencil.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(Color(hex: viewModel.accentColor))
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

            Text(viewModel.title.isEmpty ? viewModel.conversationName : viewModel.title)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .padding(.top, 8)
        }
    }

    @ViewBuilder
    private var bannerView: some View {
        if !viewModel.bannerUrl.isEmpty, let url = URL(string: viewModel.bannerUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    bannerPlaceholder
                }
            }
        } else {
            bannerPlaceholder
        }
    }

    private var bannerPlaceholder: some View {
        LinearGradient(
            colors: [Color(hex: viewModel.accentColor).opacity(0.6), Color(hex: viewModel.accentColor).opacity(0.2)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
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

    // MARK: - Permissions Section

    private var permissionsSection: some View {
        VStack(spacing: 16) {
            sectionHeader("Permissions")

            VStack(spacing: 12) {
                settingsField(label: "Qui peut ecrire") {
                    Picker("", selection: $viewModel.defaultWriteRole) {
                        Text("Tout le monde").tag("everyone")
                        Text("Membres").tag("member")
                        Text("Moderateurs").tag("moderator")
                        Text("Admins").tag("admin")
                    }
                    .pickerStyle(.segmented)
                    .disabled(viewModel.isAnnouncementChannel)
                }

                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Mode annonce")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundColor(theme.textPrimary)
                        Text("Seuls les admins peuvent ecrire")
                            .font(.system(size: 11, design: .rounded))
                            .foregroundColor(theme.textMuted)
                    }
                    Spacer()
                    Toggle("", isOn: $viewModel.isAnnouncementChannel)
                        .labelsHidden()
                        .tint(Color(hex: viewModel.accentColor))
                }
                .padding(12)
                .background(theme.backgroundSecondary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 10))

                settingsField(label: "Mode lent") {
                    Picker("", selection: $viewModel.slowModeSeconds) {
                        Text("Desactive").tag(0)
                        Text("10s").tag(10)
                        Text("30s").tag(30)
                        Text("1min").tag(60)
                        Text("5min").tag(300)
                    }
                    .pickerStyle(.segmented)
                }

                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Traduction automatique")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundColor(theme.textPrimary)
                        Text("Les messages sont traduits automatiquement")
                            .font(.system(size: 11, design: .rounded))
                            .foregroundColor(theme.textMuted)
                    }
                    Spacer()
                    Toggle("", isOn: $viewModel.autoTranslateEnabled)
                        .labelsHidden()
                        .tint(Color(hex: viewModel.accentColor))
                }
                .padding(12)
                .background(theme.backgroundSecondary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    // MARK: - Members Section

    private var membersSection: some View {
        VStack(spacing: 16) {
            sectionHeader("Membres (\(viewModel.totalMemberCount))")

            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.textMuted)
                    TextField("Rechercher un membre...", text: $viewModel.memberSearchText)
                        .font(.system(size: 14, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    if !viewModel.memberSearchText.isEmpty {
                        Button { viewModel.memberSearchText = "" } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(theme.textMuted)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)

                if viewModel.isLoadingMembers && viewModel.participants.isEmpty {
                    ProgressView()
                        .padding(.vertical, 20)
                } else {
                    let filtered = filteredMembers
                    if filtered.isEmpty {
                        Text("Aucun membre trouve")
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundColor(theme.textMuted)
                            .padding(.vertical, 20)
                    } else {
                        ForEach(Array(filtered.enumerated()), id: \.element.id) { index, participant in
                            memberRow(participant)
                            if index < filtered.count - 1 {
                                Divider().padding(.leading, 60).opacity(0.4)
                            }
                        }
                    }
                }
            }
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var filteredMembers: [APIParticipant] {
        let query = viewModel.memberSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return viewModel.participants }
        return viewModel.participants.filter { $0.name.lowercased().contains(query) }
    }

    private func memberRow(_ participant: APIParticipant) -> some View {
        let displayName = participant.name
        let role = MemberRole(rawValue: participant.effectiveRole) ?? .member

        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: displayName,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(displayName),
                avatarURL: participant.resolvedAvatar
            )
            .frame(width: 36, height: 36)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(displayName)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                memberRoleBadge(role)
            }

            Spacer()

            if viewModel.currentUserRole > role {
                Menu {
                    memberActions(for: participant, targetRole: role)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private func memberRoleBadge(_ role: MemberRole) -> some View {
        switch role {
        case .creator:
            HStack(spacing: 3) {
                Image(systemName: "crown.fill").font(.system(size: 9))
                Text("Creator").font(.system(size: 11, weight: .medium))
            }.foregroundColor(Color(hex: "F8B500"))
        case .admin:
            HStack(spacing: 3) {
                Image(systemName: "shield.fill").font(.system(size: 9))
                Text("Admin").font(.system(size: 11, weight: .medium))
            }.foregroundColor(Color(hex: "3B82F6"))
        case .moderator:
            HStack(spacing: 3) {
                Image(systemName: "checkmark.shield.fill").font(.system(size: 9))
                Text("Moderateur").font(.system(size: 11, weight: .medium))
            }.foregroundColor(Color(hex: "4ECDC4"))
        case .member:
            EmptyView()
        }
    }

    @ViewBuilder
    private func memberActions(for participant: APIParticipant, targetRole: MemberRole) -> some View {
        let participantId = participant.id
        let userId = participant.userId ?? participant.id

        if viewModel.currentUserRole == .creator && targetRole < .admin {
            Button { Task { await viewModel.updateRole(participantId: participantId, newRole: "ADMIN") } } label: {
                Label("Promouvoir Admin", systemImage: "shield.fill")
            }
        }
        if viewModel.currentUserRole.hasMinimumRole(.admin) && targetRole == .member {
            Button { Task { await viewModel.updateRole(participantId: participantId, newRole: "MODERATOR") } } label: {
                Label("Promouvoir Moderateur", systemImage: "checkmark.shield.fill")
            }
        }
        if viewModel.currentUserRole > targetRole && targetRole > .member {
            Button { Task { await viewModel.updateRole(participantId: participantId, newRole: "MEMBER") } } label: {
                Label("Retrograder Membre", systemImage: "person.fill")
            }
        }
        Button(role: .destructive) { Task { await viewModel.expelParticipant(participantId: participantId) } } label: {
            Label("Expulser", systemImage: "person.fill.xmark")
        }
        if viewModel.currentUserRole.hasMinimumRole(.admin) {
            Button(role: .destructive) { Task { await viewModel.banParticipant(userId: userId) } } label: {
                Label("Bannir", systemImage: "hand.raised.fill")
            }
        }
    }

    // MARK: - Danger Section

    private var dangerSection: some View {
        VStack(spacing: 12) {
            sectionHeader(String(localized: "conversation.settings.section.danger", defaultValue: "Zone dangereuse", bundle: .module))

            Button(role: .destructive) {
                showDeleteForMeAlert = true
            } label: {
                HStack {
                    Image(systemName: "eye.slash")
                    Text("Supprimer pour moi")
                }
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(MeeshyColors.error)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(MeeshyColors.error.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            if viewModel.currentUserRole == .creator {
                Button {
                    viewModel.showDeleteConversation = true
                } label: {
                    HStack {
                        Image(systemName: "trash.fill")
                        Text("Supprimer pour tous")
                    }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(MeeshyColors.error)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(MeeshyColors.error.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            } else {
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
public final class ConversationSettingsViewModel: ObservableObject {
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

    public let conversationId: String
    let conversationName: String
    let accentColor: String
    public let currentUserRole: MemberRole

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

    init(conversation: MeeshyConversation, currentUserRole: MemberRole = .member) {
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

            postToast(message: String(localized: "conversation.settings.toast.updated", defaultValue: "Conversation mise a jour", bundle: .module), isSuccess: true)
            return apiConversation.toConversation(currentUserId: AuthManager.shared.currentUser?.id ?? "")
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
            postToast(message: String(localized: "conversation.settings.toast.avatarUploaded", defaultValue: "Avatar televerse", bundle: .module), isSuccess: true)
        } else {
            postToast(message: String(localized: "conversation.settings.toast.avatarFailed", defaultValue: "Echec du telechargement de l'avatar", bundle: .module), isSuccess: false)
        }
    }

    func uploadCompressedBanner(_ data: Data) async {
        isUploadingBanner = true
        defer { isUploadingBanner = false }
        if let url = await uploadCompressedImage(data, prefix: "conversation_banner") {
            bannerUrl = url
            postToast(message: String(localized: "conversation.settings.toast.bannerUploaded", defaultValue: "Banniere televersee", bundle: .module), isSuccess: true)
        } else {
            postToast(message: String(localized: "conversation.settings.toast.bannerFailed", defaultValue: "Echec du telechargement de la banniere", bundle: .module), isSuccess: false)
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

    public func updateRole(participantId: String, newRole: String) async {
        do {
            try await ConversationService.shared.updateParticipantRole(
                conversationId: conversationId,
                participantId: participantId,
                role: newRole
            )
            postToast(message: "Role mis a jour", isSuccess: true)
            await loadMembers()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    public func expelParticipant(participantId: String) async {
        do {
            try await ConversationService.shared.removeParticipant(
                conversationId: conversationId,
                participantId: participantId
            )
            postToast(message: "Membre expulse", isSuccess: true)
            await loadMembers()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    public func banParticipant(userId: String) async {
        do {
            try await ConversationService.shared.banParticipant(
                conversationId: conversationId,
                userId: userId
            )
            postToast(message: "Membre banni", isSuccess: true)
            await loadMembers()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
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

    private func postToast(message: String, isSuccess: Bool) {
        NotificationCenter.default.post(
            name: Notification.Name("meeshy.showToast"),
            object: nil,
            userInfo: ["message": message, "isSuccess": isSuccess]
        )
    }
}
