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
                    profileHero(progress: ProfileHeroPlan.progress(scrollOffset: Double(offset), topInset: heroTopInset))
                        .offset(y: -offset)
                }
            }
        }
        .coordinateSpace(name: "profileScroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }
        .trackScrollContentOffset { scrollRelay.offset = -$0 }
        .background(theme.backgroundPrimary)
        .ignoresSafeArea(edges: .top)
        .background { statusBarReader }
    }

    /// Le haut des commandes du héros (#19854) : en plein écran, sous la barre système ; en feuille, `topInset`.
    var heroTopInset: Double {
        ProfileHeroPlan.topInset(statusBar: presentationStyle == .cover ? heroStatusBar : 0)
    }

    /// Lit la barre système sous la fiche, hors du défilement qui l'ignore.
    private var statusBarReader: some View {
        GeometryReader { proxy in
            Color.clear.adaptiveOnChange(of: Double(proxy.safeAreaInsets.top), initial: true) { _, top in
                heroStatusBar = top
            }
        }
    }

    // MARK: - Le héros (K28)

    func profileHero(progress: Double) -> some View {
        MeeshyCollapsingHero(
            progress: progress,
            title: displayUser.resolvedDisplayName,
            subtitle: "@\(displayUser.username)",
            alignment: .leading,
            expandedHeight: ProfileHeroPlan.expandedHeight,
            collapsedHeight: ProfileHeroPlan.collapsedHeight(topInset: heroTopInset),
            topInset: heroTopInset,
            isLoading: phase == .skeleton,
            keepsBannerInBar: true,
            avatarSpill: Double(AvatarRingLayout.paintBeyondAvatar(
                shownAvatarRing, avatarSize: CGFloat(MeeshyCollapsingHeroRecipe.avatarExpanded))),
            banner: { heroBanner(progress: progress) },
            leading: { heroCloseButton },
            trailing: { heroTrailing(progress: progress) },
            avatar: { size in heroAvatar(size: size) }
        )
    }

    /// « Retour » (‹) en plein écran, « Fermer » (⌄) en feuille : un bouton de verre du kit (K02) ; la feuille joue son
    /// propre retour haptique.
    var heroCloseButton: some View {
        MeeshyGlassButton(
            systemImage: presentationStyle.leadingSymbol,
            label: presentationStyle == .cover
                ? String(localized: "common.back", defaultValue: "Retour", bundle: .module)
                : String(localized: "common.close", defaultValue: "Fermer", bundle: .module),
            hint: String(localized: "profile.close.a11y", defaultValue: "Ferme le profil", bundle: .module),
            haptic: .none,
            action: { closeSheet() }
        )
    }

    /// La pilule de relation rejoint la barre repliée, une fois la barre maîtresse de l'identité. Je l'ai bloqué : la
    /// barre dit « Bloqué » (planche `Etat-Bloque`), une pastille du kit (K41) en sens erreur.
    @ViewBuilder
    func heroTrailing(progress: Double) -> some View {
        if phase == .blockedByMe {
            MeeshyBadge(.label(ProfileStatesCopy.blockedChip), leading: .systemImage("nosign"), surface: .glass,
                        kind: .err, size: .s28)
                .accessibilityIdentifier("profile.header.blocked")
        } else if ProfileHeroPlan.barShowsRelation(progress: progress, topInset: heroTopInset) {
            relationPillSlot
        }
    }

    /// Bloqué dans un sens ou l'autre : l'identité se grise (planche `Etat-Bloque`).
    var isIdentityMuted: Bool {
        ProfileHeroPlan.isIdentityMuted(isBlocked: isBlocked, isBlockedByTarget: isBlockedByTarget)
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
    }

    @ViewBuilder
    func heroBannerPaint(progress: Double) -> some View {
        switch ProfileHeroPlan.banner(shownBannerPaint, isMuted: isIdentityMuted) {
        case .design(let design):
            // #10632, #10933 — la bannière de design ne se peint qu'en l'absence de photo ; décorative, rien ne s'ouvre.
            BannerDesignView(design: design, isDark: theme.mode.isDark, accentHex: profileAccent)
                .frame(height: CGFloat(ProfileHeroPlan.bannerHeight(progress: progress)))
                .allowsHitTesting(false)
        case .photo(let bannerURL):
            // CachedAsyncImage (DiskCacheStore persistant) : téléchargée une fois par installation. Échec silencieux
            // (D2, no-retry-on-avatars) : la bannière vivante prend sa place, sans bouton « Réessayer ».
            CachedAsyncImage(url: bannerURL, showsStatusOverlays: false) {
                livingBanner(isMuted: false, progress: progress)
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
        if case .photo(let url) = ProfileHeroPlan.banner(shownBannerPaint, isMuted: isIdentityMuted) {
            return url
        }
        return nil
    }

    /// Ce que la bannière peint (#10933) : la photo gagne toujours, le design équipé ne vient qu'à son défaut.
    var shownBannerPaint: ProfileBannerPaint {
        ProfileDecorResolver.bannerPaint(photo: displayUser.bannerURL, decor: isIdentityMuted ? nil : displayUser.profileDecor?.banner)
    }

    /// Le cadre de bannière équipé (#10935) ; `nil` ⇒ la bannière d'avant. Masqué comme le reste du décor.
    var shownBannerFrame: BannerFrameDesign? {
        isIdentityMuted ? nil : ProfileDecorResolver.bannerFrame(displayUser.profileDecor?.bannerFrame)
    }

    /// Le contour d'avatar équipé ; `nil` ⇒ avatar nu, comme avant.
    var shownAvatarRing: AvatarRingDesign? {
        isIdentityMuted ? nil : ProfileDecorResolver.ring(displayUser.profileDecor?.avatarRing)
    }

    // MARK: - Identity

    /// Sous l'identité de K28 : sa ville déclarée et sa présence datée, telles que le serveur me les a servies
    /// (planches `Autre-Inconnu`, `Etat-HorsLigne`), la pilule de relation, puis sa bio et ses puces (planche
    /// `Autre-Vitrine`). Rien de servi ⇒ la ligne s'en passe ; grisée (bloqué), l'identité ne dit rien de plus.
    var heroDetails: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            heroStatusLine
            relationPillSlot
            if !isIdentityMuted {
                ProfileIdentityChips(user: displayUser)
                    .padding(.top, MeeshySpacing.xs)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, MeeshySpacing.xl)
    }

    /// Grisée (bloqué), l'identité ne dit ni sa ville ni sa présence datée.
    @ViewBuilder
    var heroStatusLine: some View {
        let presence = ProfileHeroPlan.presenceLine(state: ProfileHeroPlan.presence(resolvedPresence, isMuted: isIdentityMuted),
                                                    lastActiveAt: displayUser.lastActiveAt)
        if !isIdentityMuted, displayUser.city != nil || presence != nil {
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
                // La présence dit le MÊME état que le point de l'avatar (#19853) : rien de ce que le serveur n'a pas servi.
                if let presence {
                    if displayUser.city != nil {
                        Text(verbatim: "·").foregroundStyle(theme.textSecondary).accessibilityHidden(true)
                    }
                    presenceText(presence)
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
            relationPill.build(userId, displayUser.resolvedDisplayName, $relationStanding)
        }
    }

    /// Une photo à ouvrir en plein écran — sans elle, toucher l'avatar à initiales n'ouvre rien (#10093).
    var hasAvatarPhoto: Bool {
        ProfileFullscreenImage.opening(shownAvatarURL, fallbackText: "") != nil
    }

    /// Grisée (bloqué), l'identité garde ses initiales : aucune photo ne se peint ni ne s'ouvre.
    var shownAvatarURL: String? {
        isIdentityMuted ? nil : displayUser.avatarURL
    }

    /// L'avatar du héros, à la taille que K28 lui donne : grand sous la bannière, mini dans la barre repliée. L'anneau
    /// de story ne tient que sur le grand ; toucher la photo l'ouvre en plein écran.
    func heroAvatar(size: CGFloat) -> some View {
        let avatarName = displayUser.resolvedDisplayName
        let showRing = !isIdentityMuted
        // App câblée → état réel (pas d'anneau sans story active) ; legacy (nil) → anneau décoratif historique.
        let ringState = ProfileHeroPlan.storyRing(showRing ? (storyRingState ?? .read) : .none, avatarSize: Double(size))
        let context = AvatarContext.custom(size)
        let photoHint = String(localized: "profile.avatar.viewFullscreen.a11y", defaultValue: "Ouvre la photo en plein écran", bundle: .module)

        return MeeshyLivePresence { MeeshyAvatar(
            name: avatarName,
            context: context,
            accentColor: isIdentityMuted ? MeeshyColors.blockedNeutralHex : profileAccent,
            avatarURL: shownAvatarURL,
            storyState: ringState,
            moodEmoji: shownMoodEmoji,
            presenceState: ProfileHeroPlan.presence(resolvedPresence, isMuted: isIdentityMuted),
            onViewStory: ringState != .none ? onViewStory : nil,
            onMoodTap: shownMoodEmoji == nil ? nil : onMoodTap
        ) }
        // Toute la place que le film du cadre demande : il se voit en entier, le nom descend d'autant (#19925).
        .avatarRing(
            shownAvatarRing,
            avatarSize: context.size,
            storyRingSize: ringState == .none ? nil : context.ringSize,
            decorRoom: AvatarRingLayout.fullSpill(shownAvatarRing, box: context.size * 100 / 84)
        )
        .overlay(alignment: .bottomLeading) {
            ProfileAvatarListening(userId: isIdentityMuted || isCurrentUser ? nil : resolvedUserId, avatarSize: size,
                                   tint: accentTint)
        }
        .bounceOnAppear()
        .onTapGesture {
            openFullscreenImage(url: shownAvatarURL, fallback: avatarName)
        }
        // Expose the avatar tap to VoiceOver (a raw onTapGesture isn't) — seulement quand une photo s'ouvre.
        .accessibilityAddTraits(hasAvatarPhoto ? .isButton : [])
        .accessibilityHint(hasAvatarPhoto ? photoHint : "")
        .accessibilityAction {
            openFullscreenImage(url: shownAvatarURL, fallback: avatarName)
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
        Self.shownMood(moodEmoji, isBlockedByTarget: isIdentityMuted)
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

    /// Le texte et sa teinte viennent de l'état du point : vert « En ligne », sinon la date dans la couleur de l'état,
    /// gris texte hors ligne. Miroir de `presenceColorClass` (web).
    @ViewBuilder
    func presenceText(_ line: ProfileHeroPlan.PresenceLine) -> some View {
        switch line {
        case .online:
            Text(RelativeTimeFormatter.lastSeenString(for: Date()))
                .foregroundStyle(PresenceState.online.dotColor)
        case let .seen(date, state):
            Text(RelativeTimeFormatter.lastSeenString(for: date))
                .foregroundStyle(state == .offline ? theme.textSecondary : state.dotColor)
        }
    }
}
