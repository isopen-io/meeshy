import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — l'en-tête (#19410)
//
// Planches `Autre-Vitrine`, `Autre-Publications`, `Autre-Commun`, `Autre-Actions`, `Etat-HorsLigne` : l'en-tête est
// fait du kit (loi 12). K28 `MeeshyCollapsingHero` replie bannière, avatar et nom dans sa barre de verre — mini-avatar,
// nom, pilule de relation — ; sans photo ni décor, la bannière est K27 `MeeshyLivingBanner`. Les valeurs vivent dans
// `ProfileHeroPlan`.

extension UserProfileSheet {

    // MARK: - Le défilement sous le héros

    /// Ce qui défile, sous le héros épinglé : il vit DANS le défilement (le doigt posé sur la bannière fait défiler)
    /// et se contre-décale pour rester en haut, pendant que K28 se replie.
    func heroScrollView<Content: View>(_ content: Content) -> some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                Color.clear.frame(height: CGFloat(ProfileHeroPlan.contentTop))
                heroDetails
                content
            }
            // Le haut de ce qui défile, lu dans l'espace du défilement : son minY vaut −contentOffset (iOS 16–17 ;
            // iOS 18 passe par `trackScrollContentOffset`). Tiré vers le bas, il est positif : seule la bannière s'étire.
            .background(alignment: .top) {
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named("profileScroll")).minY
                    )
                }
            }
            .overlay(alignment: .top) {
                ScrollOffsetReader(relay: scrollRelay) { offset in
                    profileHero(progress: ProfileHeroPlan.progress(scrollOffset: Double(offset)))
                        .offset(y: -offset)
                }
            }
        }
        .coordinateSpace(name: "profileScroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }
        .trackScrollContentOffset { scrollRelay.offset = -$0 }
        .background(theme.backgroundPrimary)
        .ignoresSafeArea(edges: .top)
    }

    // MARK: - Le héros (K28)

    func profileHero(progress: Double) -> some View {
        MeeshyCollapsingHero(
            progress: progress,
            title: displayUser.resolvedDisplayName,
            subtitle: "@\(displayUser.username)",
            alignment: .leading,
            expandedHeight: ProfileHeroPlan.expandedHeight,
            collapsedHeight: ProfileHeroPlan.collapsedHeight,
            topInset: ProfileHeroPlan.topInset,
            isLoading: phase == .skeleton,
            banner: { heroBanner(progress: progress) },
            leading: { heroCloseButton },
            trailing: { heroTrailing(progress: progress) },
            avatar: { size in heroAvatar(size: size) }
        )
    }

    /// « Fermer », un bouton de verre du kit (K02) ; la feuille joue son propre retour haptique.
    var heroCloseButton: some View {
        MeeshyGlassButton(
            systemImage: "chevron.down",
            label: String(localized: "common.close", defaultValue: "Fermer", bundle: .module),
            hint: String(localized: "profile.close.a11y", defaultValue: "Ferme le profil", bundle: .module),
            haptic: .none,
            action: { closeSheet() }
        )
    }

    /// La pilule de relation rejoint la barre repliée, une fois la barre maîtresse de l'identité.
    @ViewBuilder
    func heroTrailing(progress: Double) -> some View {
        if ProfileHeroPlan.barShowsRelation(progress: progress) {
            relationPillSlot
        }
    }

    // MARK: - Banner

    func heroBanner(progress: Double) -> some View {
        heroBannerPaint(progress: progress)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .overlay {
                // #10935 — le cadre équipé se pose PAR-DESSUS la photo ou le fond, centre transparent ; il ne reçoit pas le doigt.
                if let frame = shownBannerFrame {
                    BannerFrameView(design: frame)
                        .equatable()
                        .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .bottom) {
                bannerGameBadge
                    .padding(.bottom, CGFloat(ProfileHeroPlan.bannerBottomInset))
            }
    }

    @ViewBuilder
    func heroBannerPaint(progress: Double) -> some View {
        switch ProfileHeroPlan.banner(shownBannerPaint, isBlockedByTarget: isBlockedByTarget) {
        case .design(let design):
            // #10632, #10933 — la bannière de design ne se peint qu'en l'absence de photo ; décorative, rien ne s'ouvre.
            BannerDesignView(design: design, isDark: theme.mode.isDark, accentHex: profileAccent)
                .frame(height: CGFloat(ProfileHeroPlan.bannerHeight(progress: progress)))
                .allowsHitTesting(false)
        case .photo(let bannerURL):
            // CachedAsyncImage (DiskCacheStore persistant) : téléchargée une fois par installation. Échec silencieux
            // (D2, no-retry-on-avatars) : la bannière vivante prend sa place, sans bouton « Réessayer ».
            CachedAsyncImage(url: bannerURL, showsStatusOverlays: false) {
                livingBanner(isMuted: isBlockedByTarget, progress: progress)
            }
            .scaledToFill()
            .frame(height: CGFloat(ProfileHeroPlan.bannerHeight(progress: progress)))
            .frame(maxWidth: .infinity)
            .clipped()
            .contentShape(Rectangle())
            .onTapGesture {
                openFullscreenImage(url: bannerURL, fallback: displayUser.resolvedDisplayName)
            }
        case .living(let isMuted):
            livingBanner(isMuted: isMuted, progress: progress)
        }
    }

    /// Sans photo ni décor : la bannière vivante du kit (K27), éteinte quand il m'a bloqué ; décorative.
    func livingBanner(isMuted: Bool, progress: Double) -> some View {
        MeeshyLivingBanner(tint: Color(hex: isMuted ? MeeshyColors.blockedNeutralHex : resolvedAccent),
                           height: ProfileHeroPlan.bannerHeight(progress: progress),
                           isMuted: isMuted)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    /// L'adresse de la photo de bannière, quand il y en a une à ouvrir : K28 tait sa bannière au lecteur d'écran,
    /// l'avatar offre donc l'action.
    var bannerPhotoURL: String? {
        if case .photo(let url) = ProfileHeroPlan.banner(shownBannerPaint, isBlockedByTarget: isBlockedByTarget) {
            return url
        }
        return nil
    }

    /// #10093, #10231, #10601 — le niveau et le rang du membre, posés sur sa bannière par l'app (`profileGameSection`) :
    /// ce que SA visibilité autorise, rien sinon. L'app occupe toute la bannière — le niveau à l'angle bas du début, le
    /// rang à l'angle bas de la fin, leurs cadres posés sur le bord bas, loin du bouton Fermer. Le doigt le traverse —
    /// toucher la bannière l'ouvre toujours en plein écran.
    @ViewBuilder
    var bannerGameBadge: some View {
        if !isBlocked, !isBlockedByTarget, let userId = resolvedUserId, !userId.isEmpty, let gameSection {
            gameSection.build(userId, displayUser.displayName ?? displayUser.username)
                .allowsHitTesting(false)
        }
    }

    /// Ce que la bannière peint (#10933) : la photo gagne toujours, le design équipé ne vient qu'à son défaut.
    var shownBannerPaint: ProfileBannerPaint {
        ProfileDecorResolver.bannerPaint(photo: displayUser.bannerURL, decor: isBlockedByTarget ? nil : displayUser.profileDecor?.banner)
    }

    /// Le cadre de bannière équipé (#10935) ; `nil` ⇒ la bannière d'avant. Masqué comme le reste du décor.
    var shownBannerFrame: BannerFrameDesign? {
        isBlockedByTarget ? nil : ProfileDecorResolver.bannerFrame(displayUser.profileDecor?.bannerFrame)
    }

    /// Le contour d'avatar équipé ; `nil` ⇒ avatar nu, comme avant.
    var shownAvatarRing: AvatarRingDesign? {
        isBlockedByTarget ? nil : ProfileDecorResolver.ring(displayUser.profileDecor?.avatarRing)
    }

    // MARK: - Identity

    /// Sous l'identité de K28 : sa ville déclarée et sa présence datée, telles que le serveur me les a servies
    /// (planches `Autre-Inconnu`, `Etat-HorsLigne`), puis la pilule de relation. Rien de servi ⇒ la ligne s'en passe.
    var heroDetails: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            heroStatusLine
            relationPillSlot
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, MeeshySpacing.xl)
    }

    @ViewBuilder
    var heroStatusLine: some View {
        if displayUser.city != nil || displayUser.lastActiveAt != nil {
            HStack(spacing: MeeshySpacing.xs) {
                if let city = displayUser.city {
                    Image(systemName: "mappin")
                        .foregroundStyle(theme.textSecondary)
                        .accessibilityHidden(true)
                    Text(verbatim: city)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                        .accessibilityIdentifier("profile.header.city")
                }
                // Présence datée — rendue seulement si le serveur l'a jugée montrable (lastActiveAt non nil pour cet
                // observateur : rien sous Ami).
                if let lastActive = displayUser.lastActiveAt {
                    if displayUser.city != nil {
                        Text(verbatim: "·").foregroundStyle(theme.textSecondary).accessibilityHidden(true)
                    }
                    Text(RelativeTimeFormatter.lastSeenString(for: lastActive))
                        .foregroundStyle(presenceColor(for: lastActive))
                }
            }
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            .accessibilityElement(children: .combine)
        }
    }

    /// La pilule de relation de l'app (loi 3) : le cercle commun, et le chemin vers « Notre cercle ».
    @ViewBuilder
    var relationPillSlot: some View {
        if RelationFace.showsRelationPill(isCurrentUser: isCurrentUser, isBlocked: isBlocked || isBlockedByTarget),
           let relationPill, let userId = resolvedUserId, !userId.isEmpty {
            relationPill.build(userId, displayUser.resolvedDisplayName)
        }
    }

    /// Une photo à ouvrir en plein écran — sans elle, toucher l'avatar à initiales n'ouvre rien (#10093).
    var hasAvatarPhoto: Bool {
        ProfileFullscreenImage.opening(displayUser.avatarURL, fallbackText: "") != nil
    }

    /// L'avatar du héros, à la taille que K28 lui donne : grand sous la bannière, mini dans la barre repliée. L'anneau
    /// de story ne tient que sur le grand ; toucher la photo l'ouvre en plein écran.
    func heroAvatar(size: CGFloat) -> some View {
        let avatarName = displayUser.resolvedDisplayName
        let showRing = !isBlockedByTarget && !isBlocked
        // App câblée → état réel (pas d'anneau sans story active) ; legacy (nil) → anneau décoratif historique.
        let ringState = ProfileHeroPlan.storyRing(showRing ? (storyRingState ?? .read) : .none, avatarSize: Double(size))
        let context = AvatarContext.custom(size)
        let photoHint = String(localized: "profile.avatar.viewFullscreen.a11y", defaultValue: "Ouvre la photo en plein écran", bundle: .module)

        return MeeshyLivePresence { MeeshyAvatar(
            name: avatarName,
            context: context,
            accentColor: isBlockedByTarget ? MeeshyColors.blockedNeutralHex : profileAccent,
            avatarURL: displayUser.avatarURL,
            storyState: ringState,
            moodEmoji: shownMoodEmoji,
            presenceState: isBlockedByTarget ? nil : resolvedPresence,
            onViewStory: ringState != .none ? onViewStory : nil,
            onMoodTap: shownMoodEmoji == nil ? nil : onMoodTap
        ) }
        .avatarRing(
            shownAvatarRing,
            avatarSize: context.size,
            storyRingSize: ringState == .none ? nil : context.ringSize
        )
        .overlay { ProfileAvatarListening(userId: isBlockedByTarget || isCurrentUser ? nil : resolvedUserId) }
        .bounceOnAppear()
        .onTapGesture {
            openFullscreenImage(url: displayUser.avatarURL, fallback: avatarName)
        }
        // Expose the avatar tap to VoiceOver (a raw onTapGesture isn't) — seulement quand une photo s'ouvre.
        .accessibilityAddTraits(hasAvatarPhoto ? .isButton : [])
        .accessibilityHint(hasAvatarPhoto ? photoHint : "")
        .accessibilityAction {
            openFullscreenImage(url: displayUser.avatarURL, fallback: avatarName)
        }
        .accessibilityActions {
            if let bannerURL = bannerPhotoURL {
                Button(String(localized: "profile.banner.label", defaultValue: "Bannière de profil", bundle: .module)) {
                    openFullscreenImage(url: bannerURL, fallback: avatarName)
                }
            }
        }
    }

    /// L'humeur peinte sur l'avatar — le grand en-tête ET la barre compacte
    /// (#10529) : celle que l'app remet, sauf si la cible m'a bloqué. Une
    /// chaîne vide n'est pas une humeur.
    public nonisolated static func shownMood(_ emoji: String?, isBlockedByTarget: Bool) -> String? {
        guard !isBlockedByTarget, let emoji, !emoji.isEmpty else { return nil }
        return emoji
    }

    var shownMoodEmoji: String? {
        Self.shownMood(moodEmoji, isBlockedByTarget: isBlockedByTarget)
    }

    /// Présence affichée sur l'avatar (grand header + barre compacte).
    /// Priorité au `presenceProvider` injecté par l'app — même source temps
    /// réel que la liste de conversations — puis fallback sur le snapshot
    /// REST `isOnline` + `lastActiveAt` du profil chargé quand l'utilisateur
    /// n'est pas suivi (provider absent ou retour `nil`).
    var resolvedPresence: PresenceState {
        if let presenceProvider,
           let userId = resolvedUserId, !userId.isEmpty,
           let live = presenceProvider(userId) {
            return live
        }
        return UserPresence(
            isOnline: displayUser.isOnline ?? false,
            lastActiveAt: displayUser.lastActiveAt
        ).state
    }

    /// Couleur du libellé de présence — dérive l'état via la règle canonique
    /// (`UserPresence.state`) puis le mapping couleur central (PresenceStyle) :
    /// vert actif (<= 5 min), orange away (5-30 min), gris texte au-delà.
    /// Miroir de `presenceColorClass` (web).
    func presenceColor(for date: Date, now: Date = Date()) -> Color {
        let state = UserPresence(isOnline: false, lastActiveAt: date).state(now: now)
        if state == .offline { return theme.textSecondary }
        return state.dotColor
    }

    // MARK: - Close button (Liquid Glass, top-leading)

    /// Floating close affordance using the adaptive Liquid Glass helper
    /// (`glassEffect` on iOS 26+, `.ultraThinMaterial` fallback below). Sits over
    /// the reduced banner so the sheet is always dismissible even mid-scroll.
    var closeButton: some View {
        Button {
            HapticFeedback.light()
            onDismiss?()
            dismiss()
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: MeeshyIconSize.sm, weight: .semibold))
                .foregroundStyle(theme.textPrimary)
                .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                .adaptiveGlass(in: Circle())
                .meeshyTapTarget()
        }
        .padding(EdgeInsets(top: MeeshySpacing.mdPlus - MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.regular), leading: MeeshySpacing.lg - MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.regular), bottom: 0, trailing: 0))
        .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .module))
        .accessibilityHint(String(localized: "profile.close.a11y", defaultValue: "Ferme le profil", bundle: .module))
    }
}
