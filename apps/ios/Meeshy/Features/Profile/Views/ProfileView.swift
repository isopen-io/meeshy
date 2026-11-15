import SwiftUI
import Combine
import PhotosUI
import MeeshySDK
import MeeshyUI
import os

/// Ma propre fiche (#18590) : elle RENSEIGNE, les Réglages règlent. De haut en bas — la tête (bannière, avatar, nom,
/// @pseudo, ancienneté), mes cercles, mon identité, mon contact, mes langues, mon activité, mes contenus. Chaque section
/// neuve vit dans son fichier et reçoit des valeurs et des portes ; la fiche ne garde que l'édition et ses feuilles.
struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.routerCommands) private var router
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
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
    @State private var securityFocus: SettingsFocus?
    @State private var stats: UserStats?
    @State private var showSystemLanguagePicker = false
    @State private var showRegionalLanguagePicker = false
    @State private var showCustomLanguagePicker = false
    @StateObject private var circles = ProfileCirclesViewModel()
    /// #16264 — mon décor d'un pack non embarqué se repeint dès son contrat arrivé.
    @StateObject private var servedAppearance = ServedAppearanceRefresh()

    // Avatar
    @State private var avatarItem: PhotosPickerItem?
    @State private var avatarImageForEditor: UIImage?
    @State private var isUploadingAvatar = false

    // Banner
    @State private var bannerItem: PhotosPickerItem?
    @State private var bannerImageForEditor: UIImage?
    @State private var isUploadingBanner = false
    @State private var scrollRelay = ScrollOffsetRelay()
    /// #10093 — la bannière ou la photo ouverte en plein écran (son URL).
    @State private var fullscreenImage: IdentifiedString?
    /// La vignette touchée et son plein écran sont liés : la photo s'agrandit depuis l'endroit touché (iOS 18+).
    @Namespace private var photoZoom

    private let accentColor = MeeshyColors.purple500Hex

    private var user: MeeshyUser? { authManager.currentUser }

    private var isUploading: Bool { isUploadingAvatar || isUploadingBanner }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    /// Sous « réduire les animations », système ou forcé dans Meeshy, la photo ne s'agrandit plus depuis la vignette :
    /// le plein écran paraît par la transition standard.
    private var photoZoomSpace: Namespace.ID? {
        reduceMotion ? nil : photoZoom
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            scrollContent

            VStack(spacing: 0) {
                header
                Spacer()
            }

            if let errorMessage {
                errorBanner(errorMessage)
            }
        }
        .background(InteractivePopEnabler())
        .sheet(isPresented: $showStats) {
            UserStatsView()
        }
        .sheet(item: $securityFocus) { focus in
            SecurityView(focus: focus).environmentObject(authManager)
        }
        .onAppear { loadUserData() }
        .task { await loadStats() }
        .task { await circles.load() }
        .fullScreenCover(item: $fullscreenImage) { image in
            FullscreenImageView(
                imageURL: image.value,
                fallbackText: user?.displayName ?? user?.username ?? "",
                accentColor: accentColor
            )
            .zoomTransitionDestination(sourceID: image.value, in: photoZoomSpace).closesForConversationOpening(.profilePhoto)
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
        // La retouche de la capture caméra (#17251) : annuler ne pose ni n'envoie rien.
        .fullScreenCover(item: $avatarImageForEditor) { image in
            EntityImageRetouch(image: image, format: .avatar, onDone: { edited in
                avatarImageForEditor = nil
                avatarItem = nil
                uploadAvatar(edited)
            }, onCancel: {
                avatarImageForEditor = nil
                avatarItem = nil
            })
        }
        .fullScreenCover(item: $bannerImageForEditor) { image in
            EntityImageRetouch(image: image, format: .banner, onDone: { edited in
                bannerImageForEditor = nil
                bannerItem = nil
                uploadBanner(edited)
            }, onCancel: {
                bannerImageForEditor = nil
                bannerItem = nil
            })
        }
    }

    /// Le bandeau d'erreur monte du bas ; sous « réduire les animations », il ne fait qu'apparaître en fondu.
    private func errorBanner(_ message: String) -> some View {
        VStack {
            Spacer()
            Text(message)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundStyle(Color.white)
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.smPlus)
                .background(Capsule().fill(MeeshyColors.error.opacity(0.9)))
                .padding(.bottom, MeeshySpacing.xxl)
        }
        .meeshyTransition(.move(edge: .bottom).combined(with: .opacity))
        .task {
            _ = await cancellableSleep(for: .seconds(3))
            showError(nil)
        }
    }

    /// #10093 — le cache se peint, puis la page se synchronise dès l'ouverture, cache frais compris ; un échec garde ce
    /// qui est affiché.
    private func loadStats() async {
        let userId = authManager.currentUser?.id ?? ""
        switch await CacheCoordinator.shared.stats.load(for: userId) {
        case .fresh(let cached, _), .stale(let cached, _):
            stats = cached.first
        case .expired, .empty:
            break
        }
        Task { await authManager.refreshCurrentUserProfile() }
        if let fresh = try? await StatsService.shared.fetchStats() {
            stats = fresh
            await bestEffort("profileView.stats.save", category: .cache) { try await CacheCoordinator.shared.stats.save([fresh], for: userId) }
        }
    }

    // MARK: - Header

    private var header: some View {
        // Seul ce reader se re-rend au fil du scroll — la racine écrit
        // `scrollRelay.offset` sans s'y abonner (P1-1).
        ScrollOffsetReader(relay: scrollRelay) { offset in
        CollapsibleHeader(
            title: String(localized: "profile.title", bundle: .main),
            scrollOffset: offset,
            onBack: {
                if isEditing {
                    setEditing(false)
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
                            setEditing(true)
                        }
                    } label: {
                        Text(isEditing
                             ? String(localized: "profile.save", bundle: .main)
                             : String(localized: "profile.edit", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                            .foregroundColor(Color(hex: accentColor))
                    }
                }
            }
        )
        }
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
                    ProfileCirclesSection(summary: circles.summary, hasServedLinks: circles.hasServedLinks,
                                          accentHex: accentColor, onOpen: open)
                    ProfileIdentitySection(
                        isEditing: isEditing, firstName: $firstName, lastName: $lastName,
                        displayName: $displayName, bio: $bio, username: user?.username, accentColor: accentColor
                    )
                    ProfileContactSection(
                        email: user?.email, isEmailVerified: user?.emailVerifiedAt != nil,
                        phoneNumber: user?.phoneNumber, isPhoneVerified: user?.phoneVerifiedAt != nil,
                        accentHex: accentColor, onOpenSecurity: { securityFocus = $0 }
                    )
                    languagesSection
                    activitySection
                    if ProfilePackShortcuts.isShown(viewerId: authManager.currentUser?.id, profileUserId: user?.id) {
                        ProfileSavedContentRows(accentHex: accentColor, onOpen: open)
                    }
                }
                Spacer().frame(height: MeeshySpacing.xxxl + 8)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, 0)
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollRelay.offset = -$0 }                               // iOS 18+ (preference path is dead there)
    }

    private func open(_ door: ProfileDoor) {
        door.open(with: router)
    }

    // MARK: - Banner & Avatar Section

    private var bannerAndAvatarSection: some View {
        VStack(spacing: 0) {
            bannerBlock
            avatarBlock
                .offset(y: -45)
                .padding(.bottom, -45 + ProfileOwnAvatar.reserveBelow(user))
            if !isEditing {
                nameBlock.transition(.opacity)
            }
        }
    }

    private var bannerBlock: some View {
        ZStack(alignment: .bottomTrailing) {
            bannerImage
                .frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                .zoomTransitionSource(id: ProfileOwnBanner.openablePhoto(of: user) ?? "", in: photoZoomSpace)
                .onTapGesture { openFullscreen(ProfileOwnBanner.openablePhoto(of: user)) }
                .accessibilityElement()
                .accessibilityLabel(ProfileImageCopy.bannerLabel)
                .accessibilityHint(opensFullscreen(ProfileOwnBanner.openablePhoto(of: user)) ? ProfileImageCopy.openFullscreenHint : "")
                .accessibilityAddTraits(opensFullscreen(ProfileOwnBanner.openablePhoto(of: user)) ? .isButton : [])
                .accessibilityAction { openFullscreen(ProfileOwnBanner.openablePhoto(of: user)) }
                .overlay {
                    // #10601 — le niveau et le rang aux angles BAS : la découpe de la bannière s'applique aussi à
                    // eux, leurs coins bas suivent donc l'arrondi de ses angles, sans débord ni jour.
                    if !isEditing, let userId = user?.id {
                        GameBannerBadge(userId: userId)
                            .allowsHitTesting(false)
                            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                            .transition(.opacity)
                    }
                }

            if isEditing {
                PhotosPicker(selection: $bannerItem, matching: .images) {
                    Label(String(localized: "profile.edit", bundle: .main), systemImage: "photo.fill")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                        .background(Capsule().fill(Color.black.opacity(0.5)))
                }
                .padding(MeeshySpacing.sm)
                .transition(.opacity)
            }

            if isUploadingBanner {
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(Color.black.opacity(0.4))
                    .frame(height: 120)
                    .overlay(ProgressView().tint(.white))
            }
        }
    }

    private var avatarBlock: some View {
        ZStack(alignment: .bottomTrailing) {
            ProfileOwnAvatar(user: user, accentColor: user?.profileAccentHex ?? accentColor, isEditing: isEditing)
            .overlay(
                Circle()
                    .stroke(theme.backgroundGradient, lineWidth: 4)
            )
            .zoomTransitionSource(id: user?.avatar ?? "", in: photoZoomSpace)
            .onTapGesture { openFullscreen(user?.avatar) }
            .accessibilityHint(opensFullscreen(user?.avatar) ? ProfileImageCopy.openFullscreenHint : "")
            .accessibilityAddTraits(opensFullscreen(user?.avatar) ? .isButton : [])
            .accessibilityAction { openFullscreen(user?.avatar) }

            if isEditing {
                let textPrimary = theme.textPrimary
                PhotosPicker(selection: $avatarItem, matching: .images) {
                    Image(systemName: "pencil.circle.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.xxxl))
                        .foregroundStyle(Color(hex: accentColor))
                        .background(Circle().fill(textPrimary.opacity(0.1)))
                }
                .accessibilityLabel(String(localized: "profile.avatar.edit", bundle: .main))
                .offset(x: 4, y: 4)
                .transition(.opacity)
            }

            if isUploadingAvatar {
                Circle()
                    .fill(Color.black.opacity(0.4))
                    .frame(width: 90, height: 90)
                    .overlay(ProgressView().tint(.white))
            }
        }
    }

    /// Nom, @pseudo et ancienneté : l'ancienneté se lit en un mot sous mon nom, plus dans une section à elle.
    private var nameBlock: some View {
        VStack(spacing: MeeshySpacing.xs) {
            Text(user?.displayName ?? user?.username ?? String(localized: "profile.unknown_user", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                .foregroundStyle(theme.textPrimary)

            if let username = user?.username {
                Text("@\(username)")
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                    .foregroundStyle(Color(hex: accentColor))
            }

            if let membership = ProfileMembershipLine.text(createdAt: user?.createdAt, locale: Self.interfaceLocale, now: Date()) {
                Text(membership)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
            }
        }
        .padding(.top, MeeshySpacing.sm)
    }

    /// La langue dans laquelle l'app me parle : le mois de l'ancienneté se dit dans la même langue que sa phrase.
    private static var interfaceLocale: Locale {
        Locale(identifier: Bundle.main.preferredLocalizations.first ?? "fr")
    }

    private var bannerImage: some View {
        ProfileOwnBanner(user: user, accentColor: user?.profileAccentHex ?? accentColor, isDark: theme.mode.isDark)
            .task(id: user?.profileDecor) { await servedAppearance.load(decor: user?.profileDecor) }
    }

    // MARK: - Languages Section

    private var languagesSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ProfileSectionHeader(icon: "globe", title: String(localized: "profile.section.languages", bundle: .main), color: MeeshyColors.error)

            Text(String(localized: "profile.language.intro", defaultValue: "Meeshy te montre tout dans ta langue principale, sinon dans la suivante.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 0) {
                languageRow(title: String(localized: "profile.language.primary", bundle: .main), subtitle: nil,
                            code: systemLanguage, isRequired: true) { showSystemLanguagePicker = true }
                languageRow(title: String(localized: "profile.language.regional", bundle: .main),
                            subtitle: String(localized: "profile.language.regional.rank", defaultValue: "2e choix", bundle: .main),
                            code: regionalLanguage, isRequired: false) { showRegionalLanguagePicker = true }
                languageRow(title: String(localized: "profile.language.custom", bundle: .main),
                            subtitle: String(localized: "profile.language.custom.rank", defaultValue: "3e choix", bundle: .main),
                            code: customDestinationLanguage, isRequired: false) { showCustomLanguagePicker = true }
            }
            .background(ProfileSectionCard(tintHex: accentColor))
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

    private func languageRow(title: String, subtitle: String?, code: String, isRequired: Bool,
                             onPick: @escaping () -> Void) -> some View {
        ProfileLanguageRow(title: title, subtitle: subtitle, code: code, isRequired: isRequired,
                           isEditing: isEditing, accentHex: accentColor, onPick: onPick)
    }

    // MARK: - Activity Section

    /// Mon activité (ex-Statistiques) : la bande des trois nombres ouvre les statistiques détaillées ; dessous, ma
    /// Légende et mon décor, là où je cherche « où j'en suis ».
    private var activitySection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ProfileSectionHeader(icon: "chart.bar.fill", title: ProfileActivityBand.title, color: MeeshyColors.indigo300)
            ProfileActivityBand(stats: stats, onOpen: openActivity)
            progressionEntry
            ProfileDecorEntry(user: user, onOpenShop: { router.openPackShop(domain: $0) }, onPickBanner: { bannerItem = $0 })
        }
    }

    private func openActivity() {
        showStats = true
    }

    /// L'entrée du tableau de bord des streaks & badges (#5698) — sous mon activité, là où l'utilisateur cherche « où
    /// j'en suis ». #10093 — plus de carte de jeu sur le profil : le niveau et le rang vivent sur la bannière.
    private var progressionEntry: some View {
        ProfileProgressionEntry { router.push(.progression) }
    }

    /// Ouvre la bannière ou la photo en plein écran — hors édition, où toucher l'image sert à la changer.
    private func opensFullscreen(_ url: String?) -> Bool {
        !isEditing && !(url ?? "").isEmpty
    }

    private func openFullscreen(_ url: String?) {
        guard opensFullscreen(url), let url else { return }
        HapticFeedback.light()
        fullscreenImage = IdentifiedString(url)
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
            guard let data = try? await PickedMedia.loadImageData(item),
                  let image = UIImage(data: data) else {
                completion(nil)
                return
            }
            completion(image)
        }
    }

    /// Entrer en édition et en sortir font paraître et partir le nom, les sélecteurs d'image et les chevrons : la
    /// bascule passe par une transaction animée, immédiate sous « réduire les animations ».
    private func setEditing(_ editing: Bool) {
        meeshyWithAnimation(MeeshyAnimation.springDefault, reduceMotion: reduceMotion) { isEditing = editing }
    }

    /// Le bandeau d'erreur paraît et part dans une transaction animée, immédiate sous « réduire les animations ».
    private func showError(_ message: String?) {
        meeshyWithAnimation(MeeshyAnimation.springDefault, reduceMotion: reduceMotion) { errorMessage = message }
    }

    // MARK: - Actions

    /// Hors ligne : la requête est mise en file (`SettingsActionQueue`) et
    /// rejouée au retour du réseau ; l'apply optimiste reste en place.
    private func queueOfflineSave(_ request: UpdateProfileRequest, rollingBackTo original: MeeshyUser) {
        do {
            let payload = try JSONEncoder().encode(request)
            // The gateway route is `PATCH /users/me` (services/gateway/src/routes/users/profile.ts) —
            // `/users/me/profile` does not exist and 404s forever on replay.
            // `SettingsAction` PERSISTE ce chemin pour le rejouer plus tard :
            // il lui faut une chaîne, pas une adresse typée. Elle est DÉRIVÉE
            // du catalogue plutôt qu'écrite — sinon ce site redeviendrait le
            // seul endroit du dépôt où un chemin s'écrit à la main, et le
            // commentaire ci-dessus dit ce que ça coûte.
            let action = SettingsAction(
                endpoint: APIClient.shared.legacyPath(for: UsersEndpoint.me),
                httpMethod: "PATCH",
                payload: payload
            )
            Task { await SettingsActionQueue.shared.enqueue(action) }
            FeedbackToastManager.shared.showSuccess(String(
                localized: "profile.save.queued",
                defaultValue: "Enregistré, envoi au retour du réseau",
                bundle: .main
            ))
        } catch {
            // Encoding failure means nothing was queued — the optimistic
            // apply made by the caller must not be left standing as a silent lie.
            Logger.settings.error("Offline profile save failed to encode payload: \(error.localizedDescription, privacy: .public)")
            authManager.currentUser = original
            setEditing(true)
            HapticFeedback.error()
            showError(String(localized: "profile.save.error", defaultValue: "Erreur lors de l'enregistrement", bundle: .main))
        }
    }

    private func saveProfile() {
        guard let original = authManager.currentUser else { return }

        let identityEdits = (
            firstName: Self.identityValueToSend(firstName, original: original.firstName),
            lastName: Self.identityValueToSend(lastName, original: original.lastName),
            displayName: Self.identityValueToSend(displayName, original: original.displayName)
        )
        if let refusal = Self.identityRefusalMessage(
            firstName: identityEdits.firstName,
            lastName: identityEdits.lastName,
            displayName: identityEdits.displayName
        ) {
            HapticFeedback.error()
            showError(refusal)
            return
        }

        // Optimistic update — apply the edits to the local user immediately
        // so the UI reflects them without waiting for the round-trip. Server
        // response replaces this with the canonical form on success; on
        // failure we roll back to the snapshot and re-open the editor.
        let optimistic = original.applyingProfileEdits(
            firstName: identityEdits.firstName,
            lastName: identityEdits.lastName,
            displayName: identityEdits.displayName,
            bio: Self.changedOrNil(bio, original: original.bio),
            systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
            regionalLanguage: Self.changedOrNil(regionalLanguage, original: original.regionalLanguage),
            customDestinationLanguage: Self.changedOrNil(customDestinationLanguage, original: original.customDestinationLanguage)
        )
        authManager.currentUser = optimistic
        setEditing(false)
        HapticFeedback.success()

        let request = UpdateProfileRequest(
            firstName: identityEdits.firstName,
            lastName: identityEdits.lastName,
            displayName: identityEdits.displayName,
            bio: Self.changedOrNil(bio, original: original.bio),
            systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
            regionalLanguage: Self.changedOrNil(regionalLanguage, original: original.regionalLanguage),
            customDestinationLanguage: Self.changedOrNil(customDestinationLanguage, original: original.customDestinationLanguage)
        )

        // Offline path — persist the request to SettingsActionQueue so it
        // replays automatically once connectivity returns. The optimistic
        // UI is already in place; the user gets a confirmation toast.
        if NetworkMonitor.shared.isOffline {
            queueOfflineSave(request, rollingBackTo: original)
            return
        }

        isSaving = true
        Task {
            do {
                let updatedUser = try await UserService.shared.updateProfile(request)
                authManager.currentUser = Self.mergingServerUser(updatedUser, onto: authManager.currentUser)
            } catch {
                // Rollback to the pre-edit snapshot so the user can fix the issue.
                authManager.currentUser = original
                setEditing(true)
                HapticFeedback.error()
                showError(error.localizedDescription)
            }
            isSaving = false
        }
    }

    private func uploadAvatar(_ image: UIImage) {
        upload(image, as: .avatar)
    }

    private func uploadBanner(_ image: UIImage) {
        upload(image, as: .banner)
    }

    /// La photo ou la bannière part, puis le compte servi se fond sur l'utilisateur courant ; un échec le dit deux
    /// fois (toast et bandeau), comme avant.
    private func upload(_ image: UIImage, as slot: ProfileImageSlot) {
        setUploading(true, slot)
        Task {
            do {
                let updatedUser = try await ProfileImageUploader().upload(image, as: slot)
                authManager.currentUser = Self.mergingServerUser(updatedUser, onto: authManager.currentUser)
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(slot == .avatar
                    ? String(localized: "profile.avatar.updated", bundle: .main)
                    : String(localized: "profile.banner.updated", bundle: .main))
            } catch {
                let failure = slot == .avatar
                    ? String(localized: "profile.avatar.error", bundle: .main)
                    : String(localized: "profile.banner.error", bundle: .main)
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(failure)
                showError(failure)
            }
            setUploading(false, slot)
        }
    }

    private func setUploading(_ uploading: Bool, _ slot: ProfileImageSlot) {
        switch slot {
        case .avatar:
            isUploadingAvatar = uploading
            if !uploading { avatarItem = nil }
        case .banner:
            isUploadingBanner = uploading
            if !uploading { bannerItem = nil }
        }
    }
}
