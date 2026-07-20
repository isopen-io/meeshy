import SwiftUI
import Combine
import PhotosUI
import MeeshySDK
import MeeshyUI

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var router: Router
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var authManager: AuthManager

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

    private let accentColor = MeeshyColors.purple500Hex

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
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm + 2)
                        .background(Capsule().fill(MeeshyColors.error.opacity(0.9)))
                        .padding(.bottom, MeeshySpacing.xxl)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .task {
                    try? await Task.sleep(for: .seconds(3))
                    withAnimation { self.errorMessage = nil }
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
                    try? await CacheCoordinator.shared.stats.save([fresh], for: userId)
                }
            case .expired, .empty:
                if let fresh = try? await StatsService.shared.fetchStats() {
                    stats = fresh
                    try? await CacheCoordinator.shared.stats.save([fresh], for: userId)
                }
            }
            pendingRequestCount = FriendshipCache.shared.pendingReceivedCount
        }
        .adaptiveOnChange(of: avatarItem) { _, newItem in
            guard let newItem else { return }
            loadImageForEditor(from: newItem) { image in
                avatarImageForEditor = image
            }
        }
        .adaptiveOnChange(of: bannerItem) { _, newItem in
            guard let newItem else { return }
            loadImageForEditor(from: newItem) { image in
                bannerImageForEditor = image
            }
        }
        .fullScreenCover(item: $avatarImageForEditor) { image in
            MeeshyImageEditorView(
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
            MeeshyImageEditorView(
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
            title: String(localized: "profile.title", bundle: .main),
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
                        Text(isEditing
                             ? String(localized: "profile.save", bundle: .main)
                             : String(localized: "profile.edit", bundle: .main))
                            .font(MeeshyFont.relative(14, weight: .semibold))
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

            VStack(spacing: MeeshySpacing.xxl) {
                // Cold-start placeholder: AuthManager has no cached
                // user yet (first run, post-logout). Skip rendering the
                // real banner/avatar/identity sections to avoid the
                // chain of `?? ""` fallback strings flashing on screen.
                if SkeletonVisibilityResolver.shouldShowSkeleton(
                    isLoading: true,
                    hasCachedData: user != nil
                ) {
                    SkeletonProfileHeader()
                        .transition(.opacity)
                } else {
                    bannerAndAvatarSection
                    identitySection
                    contactSection
                    languagesSection
                    statsSection
                    friendRequestsSection
                    memberSinceSection
                }
                Spacer().frame(height: MeeshySpacing.xxxl + 8)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, 0)
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollOffset = -$0 }                               // iOS 18+ (preference path is dead there)
    }

    // MARK: - Banner & Avatar Section

    private var bannerAndAvatarSection: some View {
        VStack(spacing: 0) {
            // Banner
            ZStack(alignment: .bottomTrailing) {
                bannerImage
                    .frame(height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))

                if isEditing {
                    PhotosPicker(selection: $bannerItem, matching: .images) {
                        Label(String(localized: "profile.edit", bundle: .main), systemImage: "photo.fill")
                            .font(MeeshyFont.relative(11, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(Color.black.opacity(0.5)))
                    }
                    .padding(8)
                }

                if isUploadingBanner {
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
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
                    secondaryColor: MeeshyColors.indigo300Hex,
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
                            .font(MeeshyFont.relative(28))
                            .foregroundColor(Color(hex: accentColor))
                            .background(Circle().fill(textPrimary.opacity(0.1)))
                    }
                    .accessibilityLabel(String(localized: "profile.avatar.edit", bundle: .main))
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
                    Text(user?.displayName ?? user?.username ?? String(localized: "profile.unknown_user", bundle: .main))
                        .font(MeeshyFont.relative(20, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    if let username = user?.username {
                        Text("@\(username)")
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundColor(Color(hex: accentColor))
                    }
                }
                .padding(.top, 8)
            }
        }
    }

    @ViewBuilder
    private var bannerImage: some View {
        if let bannerURL = user?.banner, !bannerURL.isEmpty {
            // CachedBannerImage : cache 3-tiers (NSCache -> disque -> reseau) avec
            // warm-sync synchrone depuis le disque a l'init. Le banner reapparait
            // instantanement a chaque retour sur le profil, sans refetch reseau ni
            // re-decodage full-res (l'AsyncImage natif re-fetchait + re-decodait a
            // chaque rendu). Le blur ThumbHash s'affiche en attendant le full image.
            CachedBannerImage(
                urlString: bannerURL,
                thumbHash: user?.bannerThumbHash,
                fallbackColor: accentColor,
                height: 120
            )
        } else {
            bannerPlaceholder
        }
    }

    private var bannerPlaceholder: some View {
        LinearGradient(
            colors: [
                Color(hex: accentColor).opacity(0.3),
                MeeshyColors.indigo300.opacity(0.2)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Identity Section

    private var identitySection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            sectionHeader(icon: "person.text.rectangle.fill", title: String(localized: "profile.section.identity", bundle: .main), color: accentColor)

            VStack(spacing: 0) {
                profileField(icon: "person.fill", title: String(localized: "profile.first_name", bundle: .main), value: $firstName, placeholder: String(localized: "profile.first_name", bundle: .main))
                profileField(icon: "person.fill", title: String(localized: "profile.last_name", bundle: .main), value: $lastName, placeholder: String(localized: "profile.last_name", bundle: .main))
                profileInfoRow(icon: "at", title: String(localized: "profile.username", bundle: .main), value: "@\(user?.username ?? "—")")
                profileField(icon: "person.crop.rectangle.fill", title: String(localized: "profile.display_name", bundle: .main), value: $displayName, placeholder: String(localized: "profile.display_name", bundle: .main))
                profileField(icon: "text.quote", title: String(localized: "profile.bio", bundle: .main), value: $bio, placeholder: String(localized: "profile.bio.placeholder", bundle: .main), isMultiline: true)
            }
            .background(sectionBackground)
        }
    }

    // MARK: - Contact Section

    private var contactSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            sectionHeader(icon: "envelope.fill", title: String(localized: "profile.section.contact", bundle: .main), color: MeeshyColors.indigo300Hex)

            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    fieldIcon("envelope.fill")
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "profile.email", bundle: .main))
                            .font(MeeshyFont.relative(11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                        
                        Text(user?.email ?? "—")
                            .font(MeeshyFont.relative(14, weight: .medium))
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
                        Text(String(localized: "profile.phone", bundle: .main))
                            .font(MeeshyFont.relative(11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                        
                        Text({
                            if let phone = user?.phoneNumber, !phone.isEmpty {
                                return "\(CountryPicker.flag(forPhoneNumber: phone)) \(phone)"
                            }
                            return "—"
                        }())
                            .font(MeeshyFont.relative(14, weight: .medium))
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
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            sectionHeader(icon: "globe", title: String(localized: "profile.section.languages", bundle: .main), color: MeeshyColors.errorHex)

            VStack(spacing: 0) {
                languagePickerRow(
                    title: String(localized: "profile.language.primary", bundle: .main),
                    subtitle: String(localized: "profile.language.primary.subtitle", bundle: .main),
                    code: systemLanguage,
                    required: true,
                    showPicker: $showSystemLanguagePicker
                )
                languagePickerRow(
                    title: String(localized: "profile.language.regional", bundle: .main),
                    subtitle: nil,
                    code: regionalLanguage,
                    required: false,
                    showPicker: $showRegionalLanguagePicker
                )
                languagePickerRow(
                    title: String(localized: "profile.language.custom", bundle: .main),
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
                title: String(localized: "profile.language.primary", bundle: .main),
                languages: LanguageData.allLanguages,
                selectedCode: systemLanguage,
                allowClear: false,
                onSelect: { systemLanguage = $0 }
            )
        }
        .sheet(isPresented: $showRegionalLanguagePicker) {
            ProfileLanguagePickerSheet(
                title: String(localized: "profile.language.regional", bundle: .main),
                languages: LanguageData.allLanguages,
                selectedCode: regionalLanguage,
                allowClear: true,
                onSelect: { regionalLanguage = $0 }
            )
        }
        .sheet(isPresented: $showCustomLanguagePicker) {
            ProfileLanguagePickerSheet(
                title: String(localized: "profile.language.custom", bundle: .main),
                languages: LanguageData.allLanguages,
                selectedCode: customDestinationLanguage,
                allowClear: true,
                onSelect: { customDestinationLanguage = $0 }
            )
        }
    }

    // MARK: - Stats Section

    private var statsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            sectionHeader(icon: "chart.bar.fill", title: String(localized: "profile.section.stats", bundle: .main), color: MeeshyColors.indigo300Hex)

            Button {
                HapticFeedback.light()
                showStats = true
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    statCard(value: "\(stats?.totalMessages ?? 0)", label: String(localized: "profile.stats.messages", bundle: .main), color: MeeshyColors.errorHex)
                    statCard(value: "\(stats?.totalConversations ?? 0)", label: String(localized: "profile.stats.conversations", bundle: .main), color: MeeshyColors.indigo300Hex)
                    statCard(value: "\(stats?.friendRequestsReceived ?? 0)", label: String(localized: "profile.stats.friends", bundle: .main), color: MeeshyColors.indigo600Hex)
                }
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Friend Requests Section

    private var friendRequestsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            sectionHeader(icon: "person.badge.plus.fill", title: String(localized: "profile.section.requests", bundle: .main), color: MeeshyColors.brandPrimaryHex)

            Button {
                HapticFeedback.light()
                router.push(.peopleDiscovery(.requests))
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("person.2.fill")

                    Text(String(localized: "profile.friend_requests", bundle: .main))
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    if pendingRequestCount > 0 {
                        Text("\(pendingRequestCount)")
                            .font(MeeshyFont.relative(12, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .frame(minWidth: 22, minHeight: 22)
                            .background(Circle().fill(MeeshyColors.indigo500))
                    }

                    Image(systemName: "chevron.right")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, MeeshySpacing.md)
                .background(sectionBackground)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Member Since

    private var memberSinceSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            sectionHeader(icon: "calendar", title: String(localized: "profile.section.member_since", bundle: .main), color: MeeshyColors.indigo600Hex)

            HStack {
                Text(user?.createdAt.flatMap { parseAndFormatDate($0) } ?? "—")
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, MeeshySpacing.md)
            .background(sectionBackground)
        }
    }

    // MARK: - Components

    private func sectionHeader(icon: String, title: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title)
                .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private var sectionBackground: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: accentColor))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: accentColor), lineWidth: 1)
            )
    }

    private func fieldIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(MeeshyFont.relative(14, weight: .medium))
            .foregroundColor(Color(hex: accentColor))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm - 2)
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
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)

                if isEditing {
                    if isMultiline {
                        TextField(placeholder, text: value, axis: .vertical)
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(3...6)
                    } else {
                        TextField(placeholder, text: value)
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                    }
                } else {
                    Text(value.wrappedValue.isEmpty ? placeholder : value.wrappedValue)
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(value.wrappedValue.isEmpty ? theme.textMuted : theme.textPrimary)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: "\(title): \(value)"))
    }

    private func profileInfoRow(icon: String, title: String, value: String) -> some View {
        HStack(spacing: 12) {
            fieldIcon(icon)

            Text(title)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(value)
                .font(MeeshyFont.relative(13, weight: .medium))
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
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    if let subtitle, !code.isEmpty {
                        Text(subtitle)
                            .font(MeeshyFont.relative(11))
                            .foregroundColor(theme.textMuted)
                    }
                }

                Spacer()

                if let info = LanguageData.info(for: code) {
                    HStack(spacing: 6) {
                        Text(info.flag)
                            .font(MeeshyFont.relative(18))
                        Text(info.nativeName)
                            .font(MeeshyFont.relative(13, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                } else {
                    Text(required
                         ? String(localized: "profile.language.choose", bundle: .main)
                         : String(localized: "profile.language.none", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                if isEditing {
                    Image(systemName: "chevron.right")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .disabled(!isEditing)
    }

    private func verificationBadge(verified: Bool) -> some View {
        Text(verified
             ? String(localized: "profile.verified", bundle: .main)
             : String(localized: "profile.not_verified", bundle: .main))
            .font(MeeshyFont.relative(10, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(verified ? MeeshyColors.success : MeeshyColors.warning))
    }

    private func statCard(value: String, label: String, color: String) -> some View {
        VStack(spacing: 6) {
            Text(value)
                .font(MeeshyFont.relative(22, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))

            Text(label)
                .font(MeeshyFont.relative(11, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: color))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
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
        guard let original = authManager.currentUser else { return }

        // Optimistic update — apply the edits to the local user immediately
        // so the UI reflects them without waiting for the round-trip. Server
        // response replaces this with the canonical form on success; on
        // failure we roll back to the snapshot and re-open the editor.
        let optimistic = original.applyingProfileEdits(
            firstName: firstName.isEmpty ? nil : firstName,
            lastName: lastName.isEmpty ? nil : lastName,
            displayName: displayName.isEmpty ? nil : displayName,
            bio: bio.isEmpty ? nil : bio,
            systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
            regionalLanguage: regionalLanguage.isEmpty ? nil : regionalLanguage,
            customDestinationLanguage: customDestinationLanguage.isEmpty ? nil : customDestinationLanguage
        )
        authManager.currentUser = optimistic
        isEditing = false
        HapticFeedback.success()

        let request = UpdateProfileRequest(
            firstName: firstName.isEmpty ? nil : firstName,
            lastName: lastName.isEmpty ? nil : lastName,
            displayName: displayName.isEmpty ? nil : displayName,
            bio: bio.isEmpty ? nil : bio,
            systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
            regionalLanguage: regionalLanguage.isEmpty ? nil : regionalLanguage,
            customDestinationLanguage: customDestinationLanguage.isEmpty ? nil : customDestinationLanguage
        )

        // Offline path — persist the request to SettingsActionQueue so it
        // replays automatically once connectivity returns. The optimistic
        // UI is already in place; the user gets a confirmation toast.
        if NetworkMonitor.shared.isOffline {
            if let payload = try? JSONEncoder().encode(request) {
                let action = SettingsAction(
                    endpoint: "/users/me/profile",
                    httpMethod: "PATCH",
                    payload: payload
                )
                Task { await SettingsActionQueue.shared.enqueue(action) }
                FeedbackToastManager.shared.showSuccess(String(
                    localized: "Modifications enregistrees — seront synchronisees au retour en ligne",

                ))
            }
            return
        }

        isSaving = true
        Task {
            do {
                let updatedUser = try await UserService.shared.updateProfile(request)
                authManager.currentUser = updatedUser
            } catch {
                // Rollback to the pre-edit snapshot so the user can fix the issue.
                authManager.currentUser = original
                isEditing = true
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
                let compressed = await ImageCompressor.compressOffMain(image, maxSizeKB: 500)
                let uploadedURL = try await UserService.shared.uploadImage(compressed, filename: "avatar.jpg")
                let updatedUser = try await UserService.shared.updateAvatar(url: uploadedURL)
                authManager.currentUser = updatedUser
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "profile.avatar.updated", bundle: .main))
            } catch {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "profile.avatar.error", bundle: .main))
                withAnimation { errorMessage = String(localized: "profile.avatar.error", bundle: .main) }
            }
            isUploadingAvatar = false
            avatarItem = nil
        }
    }

    private func uploadBanner(_ image: UIImage) {
        isUploadingBanner = true
        Task {
            do {
                let compressed = await ImageCompressor.compressOffMain(image, maxSizeKB: 800)
                let uploadedURL = try await UserService.shared.uploadImage(compressed, filename: "banner.jpg")
                let updatedUser = try await UserService.shared.updateBanner(url: uploadedURL)
                authManager.currentUser = updatedUser
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "profile.banner.updated", bundle: .main))
            } catch {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "profile.banner.error", bundle: .main))
                withAnimation { errorMessage = String(localized: "profile.banner.error", bundle: .main) }
            }
            isUploadingBanner = false
            bannerItem = nil
        }
    }


    private func parseAndFormatDate(_ dateString: String) -> String? {
        guard let date = try? Date(dateString, strategy: .iso8601) else {
            // Tentative sans les secondes fractionnaires si l'ISO8601 standard échoue
            let strategy = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
            guard let dateFrac = try? Date(dateString, strategy: strategy) else { return nil }
            return dateFrac.formatted(date: .abbreviated, time: .omitted)
        }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

// MARK: - Optimistic Profile Builder

private extension MeeshyUser {
    /// Returns a copy with the supplied fields overridden. Used by the
    /// profile editor to apply optimistic local updates before the server
    /// response lands. Only fields that the editor can touch are exposed;
    /// everything else is carried over verbatim.
    func applyingProfileEdits(
        firstName: String? = nil,
        lastName: String? = nil,
        displayName: String? = nil,
        bio: String? = nil,
        systemLanguage: String? = nil,
        regionalLanguage: String? = nil,
        customDestinationLanguage: String? = nil
    ) -> MeeshyUser {
        MeeshyUser(
            id: id,
            username: username,
            email: email,
            firstName: firstName ?? self.firstName,
            lastName: lastName ?? self.lastName,
            displayName: displayName ?? self.displayName,
            bio: bio ?? self.bio,
            avatar: avatar,
            banner: banner,
            role: role,
            systemLanguage: systemLanguage ?? self.systemLanguage,
            regionalLanguage: regionalLanguage ?? self.regionalLanguage,
            isOnline: isOnline,
            lastActiveAt: lastActiveAt,
            createdAt: createdAt,
            updatedAt: updatedAt,
            blockedUserIds: blockedUserIds,
            isActive: isActive,
            deactivatedAt: deactivatedAt,
            isAnonymous: isAnonymous,
            isMeeshyer: isMeeshyer,
            phoneNumber: phoneNumber,
            emailVerifiedAt: emailVerifiedAt,
            phoneVerifiedAt: phoneVerifiedAt,
            customDestinationLanguage: customDestinationLanguage ?? self.customDestinationLanguage,
            autoTranslateEnabled: autoTranslateEnabled,
            timezone: timezone,
            registrationCountry: registrationCountry,
            profileCompletionRate: profileCompletionRate,
            signalIdentityKeyPublic: signalIdentityKeyPublic
        )
    }
}

