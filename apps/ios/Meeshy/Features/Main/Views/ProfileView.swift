import SwiftUI
import Combine
import PhotosUI
import MeeshySDK
import MeeshyUI

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var router: Router
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var authManager = AuthManager.shared

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var displayName = ""
    @State private var bio = ""
    @State private var systemLanguage = ""
    @State private var regionalLanguage = ""
    @State private var customDestinationLanguage = ""

    @State private var isEditing = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showStats = false
    @State private var stats: UserStats?
    @State private var showSystemLanguagePicker = false
    @State private var showRegionalLanguagePicker = false
    @State private var showCustomLanguagePicker = false
    @State private var pendingRequestCount: Int = 0

    // Avatar
    @State private var avatarItem: PhotosPickerItem?
    @State private var avatarImageForEditor: UIImage?
    @State private var isUploadingAvatar = false

    // Banner
    @State private var bannerItem: PhotosPickerItem?
    @State private var bannerImageForEditor: UIImage?
    @State private var isUploadingBanner = false
    @State private var scrollOffset: CGFloat = 0

    private let accentColor = "A855F7"

    private var user: MeeshyUser? { authManager.currentUser }

    private var isUploading: Bool { isUploadingAvatar || isUploadingBanner }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            scrollContent

            VStack(spacing: 0) {
                header
                Spacer()
            }

            if let errorMessage {
                VStack {
                    Spacer()
                    Text(errorMessage)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(Color.red.opacity(0.9)))
                        .padding(.bottom, 24)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .onAppear {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                        withAnimation { self.errorMessage = nil }
                    }
                }
            }
        }
        .sheet(isPresented: $showStats) {
            UserStatsView()
        }
        .onAppear { loadUserData() }
        .task {
            let userId = authManager.currentUser?.id ?? ""
            let cacheResult = await CacheCoordinator.shared.stats.load(for: userId)
            switch cacheResult {
            case .fresh(let cached, _):
                stats = cached.first
            case .stale(let cached, _):
                stats = cached.first
                if let fresh = try? await StatsService.shared.fetchStats() {
                    stats = fresh
                    await CacheCoordinator.shared.stats.save([fresh], for: userId)
                }
            case .expired, .empty:
                if let fresh = try? await StatsService.shared.fetchStats() {
                    stats = fresh
                    await CacheCoordinator.shared.stats.save([fresh], for: userId)
                }
            }
            pendingRequestCount = FriendshipCache.shared.pendingReceivedCount
        }
        .onChange(of: avatarItem) { _, newItem in
            guard let newItem else { return }
            loadImageForEditor(from: newItem) { image in
                avatarImageForEditor = image
            }
        }
        .onChange(of: bannerItem) { _, newItem in
            guard let newItem else { return }
            loadImageForEditor(from: newItem) { image in
                bannerImageForEditor = image
            }
        }
        .fullScreenCover(item: $avatarImageForEditor) { image in
            MeeshyImagePreviewView(
                image: image,
                context: .avatar,
                onAccept: { edited in
                    avatarImageForEditor = nil
                    uploadAvatar(edited)
                },
                onCancel: {
                    avatarImageForEditor = nil
                    avatarItem = nil
                }
            )
        }
        .fullScreenCover(item: $bannerImageForEditor) { image in
            MeeshyImagePreviewView(
                image: image,
                context: .banner,
                onAccept: { edited in
                    bannerImageForEditor = nil
                    uploadBanner(edited)
                },
                onCancel: {
                    bannerImageForEditor = nil
                    bannerItem = nil
                }
            )
        }
    }

    // MARK: - Header

    private var header: some View {
        CollapsibleHeader(
            title: "Profil",
            scrollOffset: scrollOffset,
            onBack: {
                if isEditing {
                    isEditing = false
                    loadUserData()
                } else {
                    router.pop()
                }
            },
            titleColor: theme.textPrimary,
            backArrowColor: Color(hex: accentColor),
            backgroundColor: theme.backgroundPrimary,
            trailing: {
                if isSaving || isUploading {
                    ProgressView()
                        .tint(Color(hex: accentColor))
                } else {
                    Button {
                        HapticFeedback.light()
                        if isEditing {
                            saveProfile()
                        } else {
                            isEditing = true
                        }
                    } label: {
                        Text(isEditing ? "Enregistrer" : "Modifier")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color(hex: accentColor))
                    }
                }
            }
        )
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetPreferenceKey.self,
                    value: geo.frame(in: .named("scroll")).minY
                )
            }
            .frame(height: 0)

            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

            VStack(spacing: 24) {
                bannerAndAvatarSection
                identitySection
                contactSection
                languagesSection
                statsSection
                friendRequestsSection
                memberSinceSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 0)
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }
    }

    // MARK: - Banner & Avatar Section

    private var bannerAndAvatarSection: some View {
        VStack(spacing: 0) {
            // Banner
            ZStack(alignment: .bottomTrailing) {
                bannerImage
                    .frame(height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                if isEditing {
                    PhotosPicker(selection: $bannerItem, matching: .images) {
                        Label("Modifier", systemImage: "photo.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(Color.black.opacity(0.5)))
                    }
                    .padding(8)
                }

                if isUploadingBanner {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.black.opacity(0.4))
                        .frame(height: 120)
                        .overlay(ProgressView().tint(.white))
                }
            }

            // Avatar overlapping banner
            ZStack(alignment: .bottomTrailing) {
                MeeshyAvatar(
                    name: user?.displayName ?? user?.username ?? "?",
                    context: .profileBanner,
                    accentColor: accentColor,
                    secondaryColor: "4ECDC4",
                    avatarURL: user?.avatar
                )
                .overlay(
                    Circle()
                        .stroke(theme.backgroundGradient, lineWidth: 4)
                )

                if isEditing {
                    let textPrimary = theme.textPrimary
                    PhotosPicker(selection: $avatarItem, matching: .images) {
                        Image(systemName: "pencil.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(Color(hex: accentColor))
                            .background(Circle().fill(textPrimary.opacity(0.1)))
                    }
                    .offset(x: 4, y: 4)
                }

                if isUploadingAvatar {
                    Circle()
                        .fill(Color.black.opacity(0.4))
                        .frame(width: 90, height: 90)
                        .overlay(ProgressView().tint(.white))
                }
            }
            .offset(y: -45)
            .padding(.bottom, -45)

            if !isEditing {
                VStack(spacing: 4) {
                    Text(user?.displayName ?? user?.username ?? "Utilisateur")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    if let username = user?.username {
                        Text("@\(username)")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Color(hex: accentColor))
                    }
                }
                .padding(.top, 8)
            }
        }
    }

    @ViewBuilder
    private var bannerImage: some View {
        if let bannerURL = user?.banner, let url = URL(string: bannerURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    bannerPlaceholder
                default:
                    bannerPlaceholder
                        .overlay(ProgressView().tint(Color(hex: accentColor)))
                }
            }
        } else {
            bannerPlaceholder
        }
    }

    private var bannerPlaceholder: some View {
        LinearGradient(
            colors: [
                Color(hex: accentColor).opacity(0.3),
                Color(hex: "4ECDC4").opacity(0.2)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Identity Section

    private var identitySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(icon: "person.text.rectangle.fill", title: "IDENTITE", color: accentColor)

            VStack(spacing: 0) {
                profileField(icon: "person.fill", title: "Prenom", value: $firstName, placeholder: "Prenom")
                profileField(icon: "person.fill", title: "Nom", value: $lastName, placeholder: "Nom")
                profileInfoRow(icon: "at", title: "Pseudo", value: "@\(user?.username ?? "—")")
                profileField(icon: "person.crop.rectangle.fill", title: "Nom d'affichage", value: $displayName, placeholder: "Nom d'affichage")
                profileField(icon: "text.quote", title: "Bio", value: $bio, placeholder: "Parlez de vous...", isMultiline: true)
            }
            .background(sectionBackground)
        }
    }

    // MARK: - Contact Section

    private var contactSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(icon: "envelope.fill", title: "CONTACT", color: "4ECDC4")

            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    fieldIcon("envelope.fill")
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Email")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                        
                        Text(user?.email ?? "—")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(user?.email != nil ? theme.textPrimary : theme.textMuted)
                    }
                    
                    Spacer()
                    
                    if let email = user?.email, !email.isEmpty {
                        verificationBadge(verified: user?.emailVerifiedAt != nil)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)

                HStack(spacing: 12) {
                    fieldIcon("phone.fill")
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Telephone")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                        
                        Text(user?.phoneNumber ?? "—")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(user?.phoneNumber != nil ? theme.textPrimary : theme.textMuted)
                    }
                    
                    Spacer()
                    
                    if let phone = user?.phoneNumber, !phone.isEmpty {
                        verificationBadge(verified: user?.phoneVerifiedAt != nil)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
            .background(sectionBackground)
        }
    }

    // MARK: - Languages Section

    private var languagesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(icon: "globe", title: "LANGUES", color: "FF6B6B")

            VStack(spacing: 0) {
                languagePickerRow(
                    title: "Langue principale",
                    subtitle: "Le contenu sera traduit dans cette langue",
                    code: systemLanguage,
                    required: true,
                    showPicker: $showSystemLanguagePicker
                )
                languagePickerRow(
                    title: "Langue regionale",
                    subtitle: nil,
                    code: regionalLanguage,
                    required: false,
                    showPicker: $showRegionalLanguagePicker
                )
                languagePickerRow(
                    title: "Langue personnalisee",
                    subtitle: nil,
                    code: customDestinationLanguage,
                    required: false,
                    showPicker: $showCustomLanguagePicker
                )
            }
            .background(sectionBackground)
        }
        .sheet(isPresented: $showSystemLanguagePicker) {
            ProfileLanguagePickerSheet(
                title: "Langue principale",
                languages: LanguageData.allLanguages,
                selectedCode: systemLanguage,
                allowClear: false,
                onSelect: { systemLanguage = $0 }
            )
        }
        .sheet(isPresented: $showRegionalLanguagePicker) {
            ProfileLanguagePickerSheet(
                title: "Langue regionale",
                languages: LanguageData.allLanguages,
                selectedCode: regionalLanguage,
                allowClear: true,
                onSelect: { regionalLanguage = $0 }
            )
        }
        .sheet(isPresented: $showCustomLanguagePicker) {
            ProfileLanguagePickerSheet(
                title: "Langue personnalisee",
                languages: LanguageData.allLanguages,
                selectedCode: customDestinationLanguage,
                allowClear: true,
                onSelect: { customDestinationLanguage = $0 }
            )
        }
    }

    // MARK: - Stats Section

    private var statsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(icon: "chart.bar.fill", title: "STATISTIQUES", color: "4ECDC4")

            Button {
                HapticFeedback.light()
                showStats = true
            } label: {
                HStack(spacing: 12) {
                    statCard(value: "\(stats?.totalMessages ?? 0)", label: "Messages", color: "FF6B6B")
                    statCard(value: "\(stats?.totalConversations ?? 0)", label: "Conversations", color: "4ECDC4")
                    statCard(value: "\(stats?.friendRequestsReceived ?? 0)", label: "Amis", color: "9B59B6")
                }
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Friend Requests Section

    private var friendRequestsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(icon: "person.badge.plus.fill", title: "DEMANDES", color: "E91E63")

            Button {
                HapticFeedback.light()
                router.push(.contacts(.requests))
            } label: {
                HStack(spacing: 12) {
                    fieldIcon("person.2.fill")

                    Text("Demandes d'amis")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    if pendingRequestCount > 0 {
                        Text("\(pendingRequestCount)")
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .frame(minWidth: 22, minHeight: 22)
                            .background(Circle().fill(Color(hex: "E91E63")))
                    }

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(sectionBackground)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Member Since

    private var memberSinceSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(icon: "calendar", title: "MEMBRE DEPUIS", color: "9B59B6")

            HStack {
                Text(user?.createdAt.flatMap { parseAndFormatDate($0) } ?? "—")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(sectionBackground)
        }
    }

    // MARK: - Components

    private func sectionHeader(icon: String, title: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private var sectionBackground: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(theme.surfaceGradient(tint: accentColor))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(theme.border(tint: accentColor), lineWidth: 1)
            )
    }

    private func fieldIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(Color(hex: accentColor))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: accentColor).opacity(0.12))
            )
    }

    private func profileField(
        icon: String,
        title: String,
        value: Binding<String>,
        placeholder: String,
        isMultiline: Bool = false
    ) -> some View {
        HStack(spacing: 12) {
            fieldIcon(icon)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)

                if isEditing {
                    if isMultiline {
                        TextField(placeholder, text: value, axis: .vertical)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(3...6)
                    } else {
                        TextField(placeholder, text: value)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                    }
                } else {
                    Text(value.wrappedValue.isEmpty ? placeholder : value.wrappedValue)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(value.wrappedValue.isEmpty ? theme.textMuted : theme.textPrimary)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func profileInfoRow(icon: String, title: String, value: String) -> some View {
        HStack(spacing: 12) {
            fieldIcon(icon)

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func languagePickerRow(
        title: String,
        subtitle: String?,
        code: String,
        required: Bool,
        showPicker: Binding<Bool>
    ) -> some View {
        Button {
            guard isEditing else { return }
            HapticFeedback.light()
            showPicker.wrappedValue = true
        } label: {
            HStack(spacing: 12) {
                fieldIcon("globe")

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    if let subtitle, !code.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 11))
                            .foregroundColor(theme.textMuted)
                    }
                }

                Spacer()

                if let info = LanguageData.info(for: code) {
                    HStack(spacing: 6) {
                        Text(info.flag)
                            .font(.system(size: 18))
                        Text(info.nativeName)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                } else {
                    Text(required ? "Choisir" : "Aucune")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                if isEditing {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .disabled(!isEditing)
    }

    private func verificationBadge(verified: Bool) -> some View {
        Text(verified ? "Verifie" : "Non verifie")
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(verified ? Color(hex: "4ADE80") : Color(hex: "F59E0B")))
    }

    private func statCard(value: String, label: String, color: String) -> some View {
        VStack(spacing: 6) {
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))

            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: color))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: color), lineWidth: 1)
                )
        )
    }

    // MARK: - Helpers

    private func loadUserData() {
        firstName = user?.firstName ?? ""
        lastName = user?.lastName ?? ""
        displayName = user?.displayName ?? user?.username ?? ""
        bio = user?.bio ?? ""
        systemLanguage = user?.systemLanguage ?? "fr"
        regionalLanguage = user?.regionalLanguage ?? ""
        customDestinationLanguage = user?.customDestinationLanguage ?? ""
    }

    private func loadImageForEditor(from item: PhotosPickerItem, completion: @escaping (UIImage?) -> Void) {
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                completion(nil)
                return
            }
            completion(image)
        }
    }

    // MARK: - Actions

    private func saveProfile() {
        isSaving = true
        Task {
            do {
                let request = UpdateProfileRequest(
                    firstName: firstName.isEmpty ? nil : firstName,
                    lastName: lastName.isEmpty ? nil : lastName,
                    displayName: displayName.isEmpty ? nil : displayName,
                    bio: bio.isEmpty ? nil : bio,
                    systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
                    regionalLanguage: regionalLanguage.isEmpty ? nil : regionalLanguage,
                    customDestinationLanguage: customDestinationLanguage.isEmpty ? nil : customDestinationLanguage
                )
                let updatedUser = try await UserService.shared.updateProfile(request)
                authManager.currentUser = updatedUser
                HapticFeedback.success()
                isEditing = false
            } catch {
                HapticFeedback.error()
                withAnimation { errorMessage = error.localizedDescription }
            }
            isSaving = false
        }
    }

    private func uploadAvatar(_ image: UIImage) {
        isUploadingAvatar = true
        Task {
            do {
                let compressed = ImageCompressor.compress(image, maxSizeKB: 500)
                let uploadedURL = try await UserService.shared.uploadImage(compressed, filename: "avatar.jpg")
                let updatedUser = try await UserService.shared.updateAvatar(url: uploadedURL)
                authManager.currentUser = updatedUser
                HapticFeedback.success()
                ToastManager.shared.showSuccess("Avatar mis a jour")
            } catch {
                HapticFeedback.error()
                ToastManager.shared.showError("Erreur lors du changement d'avatar")
                withAnimation { errorMessage = "Erreur lors du changement d'avatar" }
            }
            isUploadingAvatar = false
            avatarItem = nil
        }
    }

    private func uploadBanner(_ image: UIImage) {
        isUploadingBanner = true
        Task {
            do {
                let compressed = ImageCompressor.compress(image, maxSizeKB: 800)
                let uploadedURL = try await UserService.shared.uploadImage(compressed, filename: "banner.jpg")
                let updatedUser = try await UserService.shared.updateBanner(url: uploadedURL)
                authManager.currentUser = updatedUser
                HapticFeedback.success()
                ToastManager.shared.showSuccess("Banniere mise a jour")
            } catch {
                HapticFeedback.error()
                ToastManager.shared.showError("Erreur lors du changement de banniere")
                withAnimation { errorMessage = "Erreur lors du changement de banniere" }
            }
            isUploadingBanner = false
            bannerItem = nil
        }
    }


    private func parseAndFormatDate(_ dateString: String) -> String? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = iso.date(from: dateString) else { return nil }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.string(from: date)
    }
}

