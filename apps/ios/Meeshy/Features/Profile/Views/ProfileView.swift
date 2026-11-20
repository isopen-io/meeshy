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
    @State private var city = ""
    @State private var cityCircle: RelationLevel?
    /// L'accent de ma vitrine tel que je le choisis en édition (#19391) ; la bannière le prend en direct.
    @State private var accentChoice: ProfileAccentChoice = .automatic
    @State private var systemLanguage = ""
    @State private var regionalLanguage = ""
    @State private var customDestinationLanguage = ""
    /// Ma voix publique et la traduction automatique, en brouillon jusqu'à « Enregistrer » (#19512).
    @State private var editSettings = ProfileEditSettings(voicePublic: false, autoTranslate: nil)
    /// « ai-je des clés de chiffrement ? » — la dernière réponse connue d'abord, puis la passerelle (#19512).
    @State private var hasSignalKeys: Bool?
    @State private var voiceManagerShown = false

    @State private var isEditing = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var securityFocus: SettingsFocus?
    @State private var stats: UserStats?
    /// Vrai jusqu'à la réponse du cache ou du serveur : la bande « Mon activité » montre son squelette sur un cache vide.
    @State private var statsLoading = true
    /// Vrai quand le dernier chargement de Mon activité a échoué hors ligne.
    @State private var statsOffline = false
    /// La relance de Mon activité en vol : Réessayer l'annule avant d'en lancer une autre.
    @State private var statsTask: Task<Void, Never>?
    @StateObject private var circles = ProfileCirclesViewModel()
    /// #16264 — mon décor d'un pack non embarqué se repeint dès son contrat arrivé.
    @StateObject private var servedAppearance = ServedAppearanceRefresh()
    /// « Ma Légende » (#19630) : mon niveau, mon rang et ce qu'il manque, lus dans le cache du jeu ; rien sous « Jeu masqué ».
    @StateObject private var legend = ProfileLegendStore()
    @ObservedObject private var gamePrefs: GameDevicePrefsStore = .current()

    // Avatar
    @State private var avatarItem: PhotosPickerItem?
    @State private var avatarImageForEditor: UIImage?
    @State private var isUploadingAvatar = false
    /// Les commandes d'image de l'édition (#19548) : « Photo » et l'appareil photo ouvrent le même sélecteur ;
    /// « Retoucher » lit ma photo actuelle avant d'ouvrir la retouche ; « Décor » et ses vignettes ouvrent la feuille.
    @State private var avatarPickerShown = false
    @State private var isLoadingRetouch = false
    @State private var decorShown = false

    // Banner
    @State private var bannerItem: PhotosPickerItem?
    @State private var bannerImageForEditor: UIImage?
    @State private var isUploadingBanner = false
    @State private var bannerPickerShown = false
    @State private var scrollRelay = ScrollOffsetRelay()
    /// Les trois faces (#18869) : la face montrée, et les portes que la Vitrine et la face Actions ouvrent.
    @State private var face: ProfileFace = .vitrine
    @State private var seenAsShown = false
    @State private var shareShown = false
    /// « Créer un lien » touché à côté du sélecteur : la face Liens ouvre son choix de création, puis consomme la demande.
    @State private var linkCreateRequested = false
    @State private var securityShown = false
    @State private var logoutAsked = false
    @State private var moodComposerShown = false
    @Environment(\.meeshyStatusComposer) private var statusComposer
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

            editHeader

            faceSelector

            ProfileEditOfflineBand(isEditing: isEditing)

            if let errorMessage {
                errorBanner(errorMessage)
            }
        }
        .background(InteractivePopEnabler())
        .dismissOnEscape { leaveOrCancel() }
        .modifier(ProfileFacesPresentations(
            user: user, authManager: authManager,
            seenAsShown: $seenAsShown, shareShown: $shareShown, securityShown: $securityShown,
            logoutAsked: $logoutAsked, moodComposerShown: $moodComposerShown, statusComposer: statusComposer,
            onLogout: { logout() }, circleSummary: circles.hasServedLinks ? circles.summary : nil
        ))
        .sheet(item: $securityFocus) { focus in
            SecurityView(focus: focus).environmentObject(authManager).closesForConversationOpening(.sheet)
        }
        .modifier(ProfileEditImagePresentations(avatarPickerShown: $avatarPickerShown, bannerPickerShown: $bannerPickerShown,
            decorShown: $decorShown, avatarItem: $avatarItem, bannerItem: $bannerItem, user: user, onOpenShop: { openPackShop($0) }))
        .onAppear { loadUserData() }
        .task { await loadStats() }
        .task { await circles.load() }
        .task(id: gamePrefs.prefs.hidden) { await legend.activate(hidden: gamePrefs.prefs.hidden) }
        .task(id: user?.id) { await loadEncryption() }
        .sheet(isPresented: $voiceManagerShown, onDismiss: { Task { await authManager.refreshCurrentUserProfile() } }) {
            SettingsSheetContent(sheet: .voiceProfileManage(opensWizardWhenEmpty: true), authManager: authManager)
        }
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
        if stats == nil { statsLoading = true }
        let userId = authManager.currentUser?.id ?? ""
        switch await CacheCoordinator.shared.stats.load(for: userId) {
        case .fresh(let cached, _), .stale(let cached, _):
            stats = cached.first
        case .expired, .empty:
            break
        }
        Task { await authManager.refreshCurrentUserProfile() }
        let end: ProfileActivityBand.LoadEnd
        do {
            let fresh = try await StatsService.shared.fetchStats()
            end = ProfileActivityBand.loadEnd(failure: nil, isCancelled: Task.isCancelled)
            if end == .served {
                stats = fresh
                await bestEffort("profileView.stats.save", category: .cache) { try await CacheCoordinator.shared.stats.save([fresh], for: userId) }
            }
        } catch {
            end = ProfileActivityBand.loadEnd(failure: error, isCancelled: Task.isCancelled)
        }
        switch end {
        case .cancelled: return
        case .served: statsOffline = false
        case .failed: statsOffline = NetworkMonitor.shared.isOffline
        }
        statsLoading = false
    }

    /// Réessayer depuis l'état indisponible de Mon activité : le squelette revient pendant la relance, et une seule
    /// relance est en vol — la précédente est annulée, elle n'éteint plus le squelette de la suivante.
    private func retryStats() {
        statsTask?.cancel()
        statsLoading = true
        statsTask = Task { await loadStats() }
    }

    // MARK: - L'en-tête de ma vitrine (#19589)

    /// En édition, le cadre de mode (K16) tient le haut : « Annuler » rétablit les champs, « Enregistrer » envoie.
    @ViewBuilder
    private var editHeader: some View {
        if ProfileOwnHeroPlan.usesModeHeader(isEditing: isEditing) {
            VStack(spacing: 0) {
                MeeshyModeHeader(
                    label: ProfileOwnHeroPlan.modeLabel,
                    exit: MeeshyModeAction(title: ProfileOwnHeroPlan.cancelTitle, action: { cancelEditing() }),
                    confirm: MeeshyModeAction(title: ProfileOwnHeroPlan.saveTitle, isEnabled: !isUploading,
                                              isBusy: isSaving || isUploading, action: { saveProfile() })
                )
                Spacer(minLength: 0)
            }
            .transition(.opacity)
        }
    }

    /// Le héros de ma vitrine (planche `Main`) : K28 sur la bannière vivante, mené par le seul défilement. Au repos il
    /// reste épinglé et se replie en barre de verre ; en édition il part avec le formulaire.
    private func vitrineHero(scrollOffset: CGFloat) -> some View {
        let progress = ProfileOwnHeroPlan.progress(scrollOffset: Double(scrollOffset), isEditing: isEditing)
        let pinned = ProfileOwnHeroPlan.isPinned(isEditing: isEditing)
        return MeeshyCollapsingHero(
            progress: progress,
            title: heroTitle,
            subtitle: user.map { "@\($0.username)" },
            expandedHeight: ProfileOwnHeroPlan.expandedHeight,
            collapsedHeight: ProfileOwnHeroPlan.collapsedHeight,
            isLoading: user == nil,
            keepsBannerInBar: true,
            avatarSpill: Double(ProfileOwnAvatar.reserveBelow(user, avatarSize: CGFloat(MeeshyCollapsingHeroRecipe.avatarExpanded))),
            banner: { heroBanner(progress: progress) },
            leading: { heroControls(ProfileOwnHeroPlan.leading(isEditing: isEditing)) },
            trailing: { heroControls(ProfileOwnHeroPlan.trailing(isEditing: isEditing, progress: progress)) },
            avatar: { size in heroAvatar(size: size) }
        )
        .overlay(alignment: .topTrailing) {
            if isEditing {
                // « Changer la bannière » (planche `Moi-Edition`) : la capsule de verre libellée du kit (K40), hors de la
                // bannière que K28 tait au lecteur d'écran.
                MeeshyButton(ProfileEditImageCopy.changeBanner, systemImage: "photo", kind: .glass, size: .s36,
                             action: { bannerPickerShown = true })
                    .accessibilityIdentifier("profile.edit.banner")
                    .padding(.top, CGFloat(ProfileOwnHeroPlan.changeBannerTop))
                    .padding(.trailing, MeeshySpacing.lg)
                    .transition(.opacity)
            }
        }
        .offset(y: pinned ? -scrollOffset : -max(scrollOffset, 0))
    }

    /// Mon nom, celui que je suis en train d'écrire en édition.
    private var heroTitle: String {
        let typed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if isEditing, !typed.isEmpty { return typed }
        return user?.displayName ?? user?.username ?? String(localized: "profile.unknown_user", bundle: .main)
    }

    private func heroControls(_ controls: [ProfileOwnHeroControl]) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(controls, id: \.self) { control in
                heroControl(control)
            }
        }
    }

    /// La roue et le crayon sont des boutons ronds de verre (K02) ; « Vue par : Moi ▾ » est la capsule libellée (K40).
    @ViewBuilder
    private func heroControl(_ control: ProfileOwnHeroControl) -> some View {
        switch control {
        case .viewedBy:
            MeeshyButton(ProfileOwnHeroPlan.label(control), systemImage: ProfileOwnHeroPlan.systemImage(control),
                         kind: .glass, size: .s36, tint: Color(hex: accentColor),
                         action: { performHeroControl(control) }) {
                Image(systemName: "chevron.down")
            }
            .accessibilityIdentifier(ProfileOwnHeroPlan.identifier(control))
        case .settings, .edit:
            MeeshyGlassButton(systemImage: ProfileOwnHeroPlan.systemImage(control), label: ProfileOwnHeroPlan.label(control),
                              action: { performHeroControl(control) })
                .accessibilityIdentifier(ProfileOwnHeroPlan.identifier(control))
        }
    }

    private func performHeroControl(_ control: ProfileOwnHeroControl) {
        switch control {
        case .settings: perform(.settings)
        case .viewedBy: perform(.seenAs)
        case .edit: perform(.edit)
        }
    }

    /// La bannière à fond perdu : ma photo, mon décor, ou la bannière vivante du kit (K27) ; toucher la photo l'ouvre
    /// en plein écran. Le jeu n'y est plus : sa synthèse vit dans « Ma Légende », plus bas (#19925).
    private func heroBanner(progress: Double) -> some View {
        let height = CGFloat(ProfileOwnHeroPlan.bannerHeight(progress: progress))
        return photoButton(ProfileOwnBanner.openablePhoto(of: user)) {
            bannerImage(height: height)
                .frame(height: height)
                .frame(maxWidth: .infinity)
                .clipped()
        }
        .overlay {
            if isUploadingBanner {
                Color.black.opacity(0.4).overlay(ProgressView().tint(.white))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    /// Mon avatar, à la taille que K28 lui donne (112 sous la bannière, 36 dans la barre), avec mon humeur. K28 tait sa
    /// bannière au lecteur d'écran : l'avatar offre donc d'ouvrir la photo de bannière.
    private func heroAvatar(size: CGFloat) -> some View {
        ZStack(alignment: .bottomTrailing) {
            // Le cadre se pose HORS du bouton : la source de la transition zoom (iOS 18) découpe à ses bornes ce
            // qu'elle enveloppe, et le film du cadre déborde de la boîte de l'avatar (#19925).
            photoButton(user?.avatar) {
                ProfileOwnAvatar(user: user, accentColor: shownAccentHex, isEditing: isEditing, size: size, wearsRing: false)
            }
            .modifier(ProfileOwnRing(ring: ProfileOwnAvatar.ring(of: user), size: size))

            if isEditing {
                // La pastille d'action de coin du kit (K02, petite taille) : l'appareil photo sur l'avatar modifiable.
                MeeshyGlassButton(systemImage: "camera.fill", label: ProfileEditImageCopy.changePhoto, size: .s32,
                                  action: { avatarPickerShown = true })
                    .accessibilityIdentifier("profile.edit.avatar")
                    .offset(x: 4, y: 4)
                    .transition(.opacity)
            }

            if isUploadingAvatar {
                Circle()
                    .fill(Color.black.opacity(0.4))
                    .overlay(ProgressView().tint(.white))
            }
        }
        .accessibilityActions {
            if opensFullscreen(ProfileOwnBanner.openablePhoto(of: user)) {
                Button(ProfileImageCopy.bannerLabel) { openFullscreen(ProfileOwnBanner.openablePhoto(of: user)) }
            }
        }
    }

    /// Annuler l'édition : les champs reprennent ce que mon compte porte, rien ne part.
    private func cancelEditing() {
        setEditing(false)
        loadUserData()
    }

    /// Le geste d'échappement de VoiceOver : en édition il annule, sinon il ramène en arrière.
    private func leaveOrCancel() {
        if isEditing {
            cancelEditing()
        } else {
            router.pop()
        }
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                Color.clear.frame(height: CGFloat(ProfileOwnHeroPlan.contentTop))

                VStack(spacing: MeeshySpacing.xxl) {
                    // Premier chargement, cache vide (AuthManager n'a encore aucun compte) : le gabarit fait du squelette
                    // du kit (K38, #19594) cède à la fiche par `motion.reveal` (K26, #19528) : même place, fondu croisé.
                    // La fiche se pose sur le THÈME : sans ce ton, le kit prend celui du verre sombre et peint ses rangées
                    // en encre claire sur un fond clair (#19925).
                    MeeshyRevealZone(isRevealed: !MeeshySkeletonLaw.shows(isLoading: true, hasCachedData: user != nil)) {
                        faceContent
                    } placeholder: {
                        ProfileVitrineSkeleton()
                    }
                    .meeshyGlassTone(.theme)
                    Spacer().frame(height: MeeshySpacing.xxxl + 8 + (showsFaceSelector ? Self.faceSelectorRoom : 0))
                }
                .padding(.horizontal, MeeshySpacing.lg)
            }
            // Le haut de ce qui défile, lu dans l'espace du défilement : son minY vaut −contentOffset (iOS 16–17 ;
            // iOS 18 passe par `trackScrollContentOffset`). Seul le lecteur du héros se re-rend au fil du défilement.
            .background(alignment: .top) {
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named("scroll")).minY
                    )
                }
            }
            .overlay(alignment: .top) {
                ScrollOffsetReader(relay: scrollRelay) { offset in
                    vitrineHero(scrollOffset: offset)
                }
            }
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollRelay.offset = -$0 }                               // iOS 18+ (preference path is dead there)
        .ignoresSafeArea(edges: .top)
    }

    private func open(_ door: ProfileDoor) {
        door.open(with: router)
    }

    // MARK: - Les trois faces (#18869)

    /// La place que le sélecteur de faces occupe en bas : le contenu défile jusqu'au-dessus de lui.
    private static let faceSelectorRoom: CGFloat = 72

    private var showsFaceSelector: Bool {
        user != nil && ProfileFace.showsSelector(isEditing: isEditing)
    }

    @ViewBuilder
    private var faceSelector: some View {
        if showsFaceSelector {
            VStack {
                Spacer()
                ProfileFaceSelector(face: $face, canShare: ProfileLink(username: user?.username) != nil,
                                    onAccessory: { performFaceAccessory($0) })
            }
            .meeshyTransition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func performFaceAccessory(_ accessory: ProfileFaceAccessory) {
        switch accessory {
        case .share: shareShown = true
        case .createLink: linkCreateRequested = true
        }
    }

    /// La face montrée glisse dans le sens du geste sur le sélecteur (Vitrine < Liens < Actions, #19606).
    private var faceContent: some View {
        MeeshySegmentedPages(selection: ProfileFace.shown(face, isEditing: isEditing), order: ProfileFace.allCases) { shown in
            facePage(shown)
        }
    }

    @ViewBuilder
    private func facePage(_ shown: ProfileFace) -> some View {
        switch shown {
        case .vitrine:
            VStack(spacing: MeeshySpacing.xxl) { vitrineFace }
                .meeshyCascadeFace()
        case .links:
            ProfileLinksFace(user: user, accentColor: shownAccentHex, createRequested: $linkCreateRequested,
                             onOpen: { router.push($0) })
        case .actions:
            ProfileActionsFace(user: user, stats: stats, accentColor: shownAccentHex,
                               canShare: ProfileLink(username: user?.username) != nil,
                               canSetMood: statusComposer != nil,
                               legend: legend.summary, onAction: { perform($0) }, prefs: UserPreferencesManager.shared)
        }
    }

    /// La Vitrine : qui je suis. Mon contact ne s'y lit qu'en édition (planche `Moi-Edition`) ; hors édition, la face
    /// Actions mène à la Sécurité, qui dit ce qui reste à vérifier.
    @ViewBuilder
    private var vitrineFace: some View {
        if isEditing {
            ProfileEditImageCommands(
                retouchDisabledReason: ProfileEditRetouch.disabledReason(avatar: user?.avatar),
                isRetouchLoading: isLoadingRetouch,
                onPhoto: { avatarPickerShown = true },
                onRetouch: retouchCurrentPhoto,
                onDecor: { decorShown = true }
            )
            .transition(.opacity)
        }
        identityBlock.meeshyCascade(rank: 0)
        // Les blocs montent l'un après l'autre à l'arrivée sur la face (K26, mouvement 08, #19625).
        ProfileCirclesSection(summary: circles.summary, hasServedLinks: circles.hasServedLinks,
                              loadState: circles.loadState, accentHex: accentColor, onOpen: open,
                              onRetry: { Task { await circles.load() } })
            .meeshyCascade(rank: 1)
        if isEditing {
            ProfileAccentSection(choice: $accentChoice, userId: user?.id,
                                 name: user?.displayName ?? user?.username ?? "")
            ProfileEditDecorSection(user: user, accentHex: shownAccentHex, isDark: theme.mode.isDark,
                                    onOpenDecor: { decorShown = true }, onOpenMyPacks: { open(.myPacks) })
            ProfileContactSection(
                email: user?.email, isEmailVerified: user?.emailVerifiedAt != nil,
                phoneNumber: user?.phoneNumber, isPhoneVerified: user?.phoneVerifiedAt != nil,
                accentHex: accentColor, onOpenSecurity: { securityFocus = $0 }
            )
        }
        if languagesMode == .reorderable { languagesSection }
        activitySection.meeshyCascade(rank: 2)
        voiceBlock.meeshyCascade(rank: 3)
        if !isEditing, let userId = user?.id {
            ProfilePublicationsSection(userId: userId, accentColor: accentColor)
                .meeshyCascade(rank: 4)
        }
    }

    /// Le bloc du rang 0, un seul quelle que soit la face : la carte formulaire n'existe qu'en édition (planche
    /// `Moi-Edition`) ; la Vitrine n'en montre aucune et lit l'identité en texte.
    @ViewBuilder
    private var identityBlock: some View {
        if isEditing {
            ProfileIdentitySection(
                isEditing: isEditing, firstName: $firstName, lastName: $lastName,
                displayName: $displayName, bio: $bio, city: $city, cityCircle: $cityCircle,
                username: user?.username, accentColor: accentColor
            )
        } else {
            restingIdentity
        }
    }

    /// Qui je suis, au repos (planche `Main`) : sous le nom et le @pseudo du héros, ma ville et mon ancienneté, ma bio,
    /// mes langues en pastilles, puis la puce de chiffrement — du texte, aucune carte formulaire. La puce qui arrive
    /// après `loadEncryption()` monte par le jeton du kit, jamais d'un coup.
    private var restingIdentity: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            if let membership = membershipLine {
                Text(membership)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
            }
            if let shownBio = Self.restingBio(bio) {
                Text(shownBio)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
                    .foregroundStyle(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("profile.vitrine.bio")
            }
            if languagesMode == .chips { ProfileLanguageChips(languages: prismLanguages) }
            if Self.showsEncryptionBadge(isEditing: isEditing, hasSignalKeys: hasSignalKeys) {
                ProfileE2EEBadge().meeshyTransition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .transition(.opacity)
        .meeshyMotion(.rise, value: hasSignalKeys)
    }

    /// La bio telle que la Vitrine la lit : rien quand elle est vide — jamais un texte d'invite pris pour une valeur.
    static func restingBio(_ bio: String?) -> String? {
        guard let trimmed = bio?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    /// « Ma voix » : le lecteur au repos ; en édition, son interrupteur public et « Réenregistrer », ou de quoi
    /// enregistrer un échantillon (#19512).
    @ViewBuilder
    private var voiceBlock: some View {
        let sample = ProfileVoiceSample.make(user: user)
        switch ProfileVoiceBlock.resolve(sample: sample, isEditing: isEditing) {
        case .listen:
            if let sample { ProfileVoiceSection(sample: sample, accentColor: accentColor) }
        case .edit:
            if let sample {
                ProfileVoiceSection(sample: sample, accentColor: accentColor, editing: ProfileVoiceEditing(
                    isPublic: $editSettings.voicePublic, onRecord: { voiceManagerShown = true }))
            }
        case .record:
            ProfileVoiceRecordPrompt(accentColor: accentColor, onRecord: { voiceManagerShown = true })
        case .none:
            EmptyView()
        }
    }

    /// La puce « Chiffrement activé » ne dit que ce que mes clés prouvent, et l'édition ne la montre pas (#19512).
    static func showsEncryptionBadge(isEditing: Bool, hasSignalKeys: Bool?) -> Bool {
        !isEditing && hasSignalKeys == true
    }

    /// Cache d'abord : la dernière réponse connue se peint, puis la passerelle la confirme ; un échec garde ce qui est
    /// affiché.
    private func loadEncryption() async {
        guard let userId = user?.id else { return }
        let memory = ProfileOwnEncryptionMemory()
        hasSignalKeys = memory.remembered(userId: userId)
        guard let served = try? await AuthService.shared.hasSignalKeys() else { return }
        hasSignalKeys = served
        memory.remember(served, userId: userId)
    }

    private func perform(_ action: ProfileFaceAction) {
        switch action {
        case .share: shareShown = true
        case .seenAs: seenAsShown = true
        case .edit:
            face = .vitrine
            setEditing(true)
        case .mood: moodComposerShown = true
        case .stats: router.push(.userStats)
        case .legend: router.push(.progression)
        case .security: securityShown = true
        case .settings: router.push(.settings)
        case .logout: logoutAsked = true
        case .door(let door): open(door)
        case .route(let route): router.push(route)
        }
    }

    /// La session et les données locales partent, le compte reste listé : comme depuis les Réglages (#8286).
    private func logout() {
        Task { await authManager.logout(forgettingAccount: false) }
    }

    private func openPackShop(_ domain: PackDomain) {
        router.openPackShop(domain: domain)
    }

    /// « Retoucher » : ma photo actuelle entre dans la retouche, comme une photo qu'on vient de choisir ; l'envoi ne
    /// part qu'à « Terminé ». Une photo illisible le dit, et rien ne s'ouvre.
    private func retouchCurrentPhoto() {
        guard ProfileEditRetouch.disabledReason(avatar: user?.avatar) == nil, !isLoadingRetouch else { return }
        isLoadingRetouch = true
        let avatar = user?.avatar
        Task {
            let image = await ProfileEditRetouch.currentPhoto(avatar)
            isLoadingRetouch = false
            guard let image else {
                showError(ProfileEditImageCopy.retouchFailed)
                return
            }
            avatarImageForEditor = image
        }
    }

    /// Ville et ancienneté, dans la langue de l'interface.
    private var membershipLine: String? {
        ProfileMembershipLine.text(city: user?.declaredCity, createdAt: user?.createdAt, locale: Self.interfaceLocale, now: Date())
    }

    /// La langue dans laquelle l'app me parle : le mois de l'ancienneté se dit dans la même langue que sa phrase.
    private static var interfaceLocale: Locale {
        Locale(identifier: Bundle.main.preferredLocalizations.first ?? "fr")
    }

    /// L'accent de ma bannière et de mon avatar ; en édition, celui que je suis en train de choisir (#19391).
    private var shownAccentHex: String {
        Self.vitrineAccentHex(of: user, choosing: isEditing ? accentChoice : nil) ?? accentColor
    }

    private func bannerImage(height: CGFloat) -> some View {
        ProfileOwnBanner(user: user, accentColor: shownAccentHex, isDark: theme.mode.isDark, height: height)
            .task(id: user?.profileDecor) { await servedAppearance.load(decor: user?.profileDecor) }
    }

    // MARK: - Languages (#19534)

    private var prismLanguages: ProfilePrismLanguages {
        ProfilePrismLanguages(system: systemLanguage, regional: regionalLanguage, custom: customDestinationLanguage)
    }

    private var languagesMode: ProfilePrismLanguagesMode {
        ProfilePrismLanguagesMode.resolve(isEditing: isEditing)
    }

    /// En édition, mes langues s'ordonnent dans leur section ; au repos, elles se lisent en pastilles sous ma bio.
    private var languagesSection: some View {
        ProfilePrismLanguagesSection(
            system: $systemLanguage, regional: $regionalLanguage, custom: $customDestinationLanguage,
            autoTranslate: editSettings.autoTranslate, accentColor: accentColor,
            onAutoTranslate: { editSettings.autoTranslate = $0 })
    }

    // MARK: - Activity Section

    /// Mon activité (ex-Statistiques) : la bande des trois nombres ouvre les statistiques détaillées ; dessous, ma
    /// Légende et mon décor, là où je cherche « où j'en suis ».
    private var activitySection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActivityBand.title)
            ProfileActivityBand(stats: stats, isLoading: statsLoading, isOffline: statsOffline, accentColor: accentColor,
                                onOpen: openActivity, onRetry: retryStats)
            progressionEntry
            if !isEditing {
                ProfileDecorEntry(user: user, onOpenShop: { router.openPackShop(domain: $0) }, onPickBanner: { bannerItem = $0 })
            }
        }
    }

    /// Mon activité est un écran de la pile, comme depuis toute autre porte : il entre dans l'historique et, sur iPad,
    /// dans le panneau de droite.
    private func openActivity() {
        router.push(.userStats)
    }

    /// « Ma Légende » (#19925) : la synthèse de mon jeu — palier et niveau, rang et blason, Gloire, progression,
    /// trophées —, la même carte que « Sa Légende » chez un autre, qui ne vit plus sur ma bannière. Toute la carte
    /// mène au tableau de bord Progression ; sans jeu servi, l'entrée d'avant garde le chemin.
    @ViewBuilder
    private var progressionEntry: some View {
        if let userId = user?.id {
            GameProfileBoardSource(
                userId: userId, tint: Color(hex: accentColor), title: ProfileLegendCopy.title,
                onOpen: { router.push(.progression) },
                fallback: .legend(legend.summary)
            )
        } else {
            ProfileProgressionEntry(summary: legend.summary) { router.push(.progression) }
        }
    }

    /// La bannière ou la photo, touchable quand elle s'ouvre en plein écran : elle s'enfonce sous le doigt (voile seul
    /// sous « réduire les animations ») et s'agrandit depuis l'endroit touché. Sinon, ni toucher ni trait bouton.
    private func photoButton<Label: View>(_ url: String?, @ViewBuilder label: () -> Label) -> some View {
        let opens = opensFullscreen(url)
        return Button { openFullscreen(url) } label: { label() }
            .buttonStyle(PressableButtonStyle())
            .allowsHitTesting(opens)
            // Seule une photo qui s'ouvre est la source du zoom : sans elle, la source découperait et voilerait ce
            // qu'elle enveloppe pour rien (#19925).
            .zoomTransitionSource(id: url ?? "", in: opens ? photoZoomSpace : nil)
            .accessibilityHint(opens ? ProfileImageCopy.openFullscreenHint : "")
            .accessibilityRemoveTraits(opens ? [] : .isButton)
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
        city = user?.declaredCity ?? ""
        cityCircle = user?.declaredCityCircle
        accentChoice = ProfileAccentChoice(wire: user?.profileAccentColor)
        systemLanguage = user?.systemLanguage ?? "fr"
        regionalLanguage = user?.regionalLanguage ?? ""
        customDestinationLanguage = user?.customDestinationLanguage ?? ""
        editSettings = ProfileEditSettings.make(user: user)
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
        meeshyWithMotion(.morph, reduceMotion: reduceMotion) { isEditing = editing }
    }

    /// Le bandeau d'erreur paraît et part dans une transaction animée, immédiate sous « réduire les animations ».
    private func showError(_ message: String?) {
        meeshyWithMotion(.morph, reduceMotion: reduceMotion) { errorMessage = message }
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
        let voicePublicEdit = editSettings.voicePublicToSend(original: original)
        let autoTranslateEdit = editSettings.autoTranslateToSend(original: original)
        let optimistic = original.applyingProfileEdits(
            firstName: identityEdits.firstName,
            lastName: identityEdits.lastName,
            displayName: identityEdits.displayName,
            bio: Self.changedOrNil(bio, original: original.bio),
            systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
            regionalLanguage: Self.changedOrNil(regionalLanguage, original: original.regionalLanguage),
            customDestinationLanguage: Self.changedOrNil(customDestinationLanguage, original: original.customDestinationLanguage),
            autoTranslateEnabled: autoTranslateEdit,
            voicePublic: voicePublicEdit
        )
        let cityEdit = Self.cityEditToSend(typed: city, circle: cityCircle, original: original)
        let changesCity = cityEdit.city != nil || cityEdit.circle != nil
        let accentEdit = Self.accentEditToSend(accentChoice, original: original)
        let withCity = changesCity
            ? optimistic.withDeclaredCity(ProfileCity.normalized(city), circle: cityCircle)
            : optimistic
        authManager.currentUser = accentEdit.map { withCity.withProfileAccent($0.wire) } ?? withCity
        setEditing(false)
        HapticFeedback.success()

        let request = UpdateProfileRequest(
            firstName: identityEdits.firstName,
            lastName: identityEdits.lastName,
            displayName: identityEdits.displayName,
            bio: Self.changedOrNil(bio, original: original.bio),
            systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
            regionalLanguage: Self.changedOrNil(regionalLanguage, original: original.regionalLanguage),
            customDestinationLanguage: Self.changedOrNil(customDestinationLanguage, original: original.customDestinationLanguage),
            voicePublic: voicePublicEdit,
            city: cityEdit.city,
            cityCircle: cityEdit.circle,
            profileAccentColor: accentEdit,
            autoTranslateEnabled: autoTranslateEdit
        )
        send(request, rollingBackTo: original)
    }

    /// Offline path — persist the request to SettingsActionQueue so it replays automatically once connectivity
    /// returns. The optimistic UI is already in place; the user gets a confirmation toast.
    private func send(_ request: UpdateProfileRequest, rollingBackTo original: MeeshyUser) {
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
