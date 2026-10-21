import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Collapsible header + pinned tab bar
//
// Split out of UserProfileSheet.swift for readability. All members are
// `extension` computed properties on the single stateful `UserProfileSheet`
// struct — no state is threaded, they read the struct's @State/@Environment
// directly (same module). Preserves every visual effect (bounceOnAppear,
// gradient orbs, avatar ring, fullscreen tap) per the project "do not strip
// effects" rule. Light/Dark adaptive via `theme.textPrimary/textMuted`.

extension UserProfileSheet {

    // MARK: - Big collapsible header

    /// Banner + identity only (réduit). Interpolates between the expanded
    /// state (full banner + avatar + name + @pseudo) and the collapsed state
    /// (banner shrunk toward `collapsedBar`, avatar/name faded — the compact
    /// pinned bar takes over). Bio, languages, country and the rest live in the
    /// Détails tab, not the header. Driven by
    /// `ProfileHeaderMetrics.progress(offset: scrollOffset)`.
    @ViewBuilder
    func bigCollapsibleHeader(offset: CGFloat) -> some View {
        let progress = ProfileHeaderMetrics.progress(offset: offset)
        let bannerHeight = ProfileHeaderMetrics.expandedBanner
            - (ProfileHeaderMetrics.expandedBanner - ProfileHeaderMetrics.collapsedBar) * progress

        VStack(spacing: 0) {
            bannerSection
                .frame(height: bannerHeight)
                .overlay(alignment: .bottom) {
                    bannerGameBadge
                        .opacity(1 - Double(progress))
                }
                .clipped()
                .opacity(1 - Double(progress) * 0.6)

            identitySection(offset: offset)
                .padding(.top, -40)
                // Avatar + name shrink slightly as the header collapses, then
                // the compact pinned bar takes over once mostly collapsed.
                .scaleEffect(1 - 0.12 * progress, anchor: .top)
                .opacity(1 - Double(progress))
        }
    }

    // MARK: - Banner

    var bannerSection: some View {
        ZStack(alignment: .bottom) {
            switch shownBannerPaint {
            case .design(let design):
                // #10632, #10933 — la bannière de design ne se peint qu'en l'absence de photo ; décorative, rien ne s'ouvre.
                BannerDesignView(design: design, isDark: theme.mode.isDark, accentHex: profileAccent)
                    .frame(height: ProfileHeaderMetrics.expandedBanner)
                    .accessibilityHidden(true)
            case .photo(let bannerURL):
                // CachedAsyncImage (DiskCacheStore persistant) plutôt qu'AsyncImage :
                // la bannière n'est téléchargée qu'une fois par installation, et le
                // resolver interne accepte aussi les chemins relatifs du gateway.
                // showsStatusOverlays: false — echec silencieux, degradation
                // vers le gradient deja fourni ci-dessous ; pas de bouton
                // retry sur une banniere decorative (D2, no-retry-on-avatars).
                CachedAsyncImage(url: bannerURL, showsStatusOverlays: false) {
                    defaultBannerGradient
                }
                .scaledToFill()
                .frame(height: ProfileHeaderMetrics.expandedBanner)
                .clipped()
                .contentShape(Rectangle())
                .onTapGesture {
                    openFullscreenImage(url: bannerURL, fallback: displayUser.resolvedDisplayName)
                }
                // Expose the banner tap to VoiceOver (raw onTapGesture isn't).
                .accessibilityElement()
                .accessibilityLabel(String(localized: "profile.banner.label", defaultValue: "Bannière de profil", bundle: .module))
                .accessibilityAddTraits(.isButton)
                .accessibilityAction {
                    openFullscreenImage(url: bannerURL, fallback: displayUser.resolvedDisplayName)
                }
            case .plain:
                defaultBannerGradient
            }
        }
        .overlay {
            // #10935 — le cadre équipé se pose PAR-DESSUS la photo ou le fond, centre transparent ; il ne reçoit pas le doigt.
            if let frame = shownBannerFrame {
                BannerFrameView(design: frame)
                    .equatable()
            }
        }
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

    var defaultBannerGradient: some View {
        LinearGradient(
            colors: isBlockedByTarget
                ? [Color.gray.opacity(MeeshyOpacity.strong), Color.gray.opacity(MeeshyOpacity.medium)]
                : [Color(hex: resolvedAccent).opacity(0.6), Color(hex: resolvedAccent).opacity(0.2)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(height: ProfileHeaderMetrics.expandedBanner)
        .overlay(
            ZStack {
                Circle()
                    .fill(Color(hex: resolvedAccent).opacity(MeeshyOpacity.light))
                    .frame(width: 200)
                    .offset(x: -80, y: -30)
                Circle()
                    .fill(Color(hex: resolvedAccent).opacity(MeeshyOpacity.subtle))
                    .frame(width: 150)
                    .offset(x: 100, y: 20)
            }
            // Decorative ambient orbs — not meaningful to VoiceOver.
            .accessibilityHidden(true)
        )
        .clipped()
        // #10093 — un dégradé n'est pas une image : sans bannière, rien ne s'ouvre en plein écran. Décoratif, il se
        // tait aussi pour VoiceOver.
        .accessibilityHidden(true)
    }

    // MARK: - Identity

    func identitySection(offset: CGFloat) -> some View {
        VStack(spacing: MeeshySpacing.xsPlus) {
            profileAvatar
                .bounceOnAppear()
                .onTapGesture {
                    openFullscreenImage(url: displayUser.avatarURL, fallback: displayUser.resolvedDisplayName)
                }
                // Expose the avatar tap to VoiceOver (a raw onTapGesture isn't) — seulement quand une photo s'ouvre.
                .accessibilityAddTraits(hasAvatarPhoto ? .isButton : [])
                .accessibilityHint(hasAvatarPhoto ? String(localized: "profile.avatar.viewFullscreen.hint", defaultValue: "Ouvre la photo en plein écran", bundle: .module) : "")
                .accessibilityAction {
                    openFullscreenImage(url: displayUser.avatarURL, fallback: displayUser.resolvedDisplayName)
                }

            Text(displayUser.resolvedDisplayName)
                .font(.system(.title3, design: .rounded).weight(.bold))
                .foregroundColor(theme.textPrimary)

            HStack(spacing: MeeshySpacing.xs) {
                Text("@\(displayUser.username)")
                    .foregroundColor(Color(hex: resolvedAccent))
                // Présence datée après le pseudo — rendue seulement si le serveur
                // l'a jugée montrable (lastActiveAt non nil pour cet observateur).
                if let lastActive = displayUser.lastActiveAt {
                    Text(verbatim: "·").foregroundColor(theme.textSecondary)
                    Text(RelativeTimeFormatter.lastSeenString(for: lastActive))
                        .foregroundColor(presenceColor(for: lastActive))
                }
            }
            .font(.system(size: 14, weight: .medium))
        }
        .padding(.top, MeeshySpacing.xs)
        // Gate the expanded identity from VoiceOver once the compact pinned bar
        // becomes the primary (mostly collapsed) — avoids a duplicate name/@user.
        .accessibilityHidden(ProfileHeaderMetrics.progress(offset: offset) > 0.5)
    }

    /// Une photo à ouvrir en plein écran — sans elle, toucher l'avatar à initiales n'ouvre rien (#10093).
    var hasAvatarPhoto: Bool {
        ProfileFullscreenImage.opening(displayUser.avatarURL, fallbackText: "") != nil
    }

    @ViewBuilder
    var profileAvatar: some View {
        let avatarName = displayUser.resolvedDisplayName
        let showRing = !isBlockedByTarget && !isBlocked
        // App câblée → état réel (pas d'anneau sans story active) ;
        // call site legacy (nil) → anneau décoratif historique.
        let ringState: StoryRingState = showRing ? (storyRingState ?? .read) : .none

        MeeshyLivePresence { MeeshyAvatar(
            name: avatarName,
            context: .profileSheet,
            accentColor: isBlockedByTarget ? MeeshyColors.blockedNeutralHex : profileAccent,
            avatarURL: displayUser.avatarURL,
            storyState: ringState,
            moodEmoji: shownMoodEmoji,
            presenceState: isBlockedByTarget ? nil : resolvedPresence,
            onViewStory: (showRing && ringState != .none) ? onViewStory : nil,
            onMoodTap: shownMoodEmoji == nil ? nil : onMoodTap
        ) }
        .avatarRing(
            shownAvatarRing,
            avatarSize: AvatarContext.profileSheet.size,
            storyRingSize: ringState == .none ? nil : AvatarContext.profileSheet.ringSize
        )
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

    // MARK: - Pinned tab bar (section header — pins on scroll)

    @ViewBuilder
    func pinnedTabBar(offset: CGFloat) -> some View {
        let progress = ProfileHeaderMetrics.progress(offset: offset)
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(ProfileTab.allCases, id: \.self) { tab in
                    tabButton(tab)
                }
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.top, MeeshySpacing.md)

            Divider()
                .opacity(MeeshyOpacity.medium)
        }
        // Le fond est posé AVANT le padding : posé après, il remplissait aussi
        // la bande de `collapsedBar` pt d'écart et la rendait hit-testable —
        // cet en-tête de section épinglé flotte AU-DESSUS du contenu, la bande
        // interceptait donc les taps destinés aux cartes (barre d'actions du
        // haut de liste inopérante). La zone d'écart est couverte visuellement
        // par la barre compacte opaque quand elle est épinglée.
        .background(theme.backgroundPrimary)
        // When the big header has scrolled away (progress → 1) the compact
        // identity bar (banner + avatar réduits) pins at the very top; the tabs
        // slide down by its height so they sit JUST BELOW it instead of being
        // covered by the overlay. No gap while expanded (progress 0).
        .padding(.top, ProfileHeaderMetrics.collapsedBar * progress)
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
                .foregroundColor(theme.textPrimary)
                .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                .adaptiveGlass(in: Circle())
                .meeshyTapTarget()
        }
        .padding(EdgeInsets(top: MeeshySpacing.mdPlus - MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.regular), leading: MeeshySpacing.lg - MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.regular), bottom: 0, trailing: 0))
        .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .module))
        .accessibilityHint(String(localized: "profile.close.hint", defaultValue: "Ferme le profil", bundle: .module))
    }

    private func tabButton(_ tab: ProfileTab) -> some View {
        Button {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                selectedTab = tab
            }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                HStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: tab.icon)
                        .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
                    Text(tab.title)
                        .font(.system(size: MeeshyFont.subheadSize, weight: .semibold))
                }
                .foregroundColor(selectedTab == tab ? Color(hex: resolvedAccent) : theme.textMuted)
                .padding(.vertical, MeeshySpacing.smPlus)

                Rectangle()
                    .fill(selectedTab == tab ? Color(hex: resolvedAccent) : Color.clear)
                    .frame(height: 2)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(tab.title)
        .accessibilityAddTraits(selectedTab == tab ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: - Compact pinned bar (overlay, fades in when collapsed)

    /// Small floating identity bar shown at the very top once the big header
    /// scrolls away. Small avatar + name + @pseudo, on the primary background
    /// for legibility. Opacity is driven by the caller (`collapsibleLayout`).
    @ViewBuilder
    var compactPinnedBar: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            MeeshyLivePresence { MeeshyAvatar(
                name: displayUser.resolvedDisplayName,
                context: .custom(32),
                accentColor: isBlockedByTarget ? MeeshyColors.blockedNeutralHex : profileAccent,
                avatarURL: displayUser.avatarURL,
                storyState: .none,
                moodEmoji: shownMoodEmoji,
                presenceState: isBlockedByTarget ? nil : resolvedPresence,
                onMoodTap: shownMoodEmoji == nil ? nil : onMoodTap
            ) }

            VStack(alignment: .leading, spacing: 0) {
                Text(displayUser.resolvedDisplayName)
                    .font(.system(size: MeeshyFont.bodySize, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text("@\(displayUser.username)")
                    .font(.system(size: MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(Color(hex: resolvedAccent))
                    .lineLimit(1)
            }

            Spacer()
        }
        // Leading inset clears the top-left close button (36pt @ leading 16) so
        // the compact avatar/name never sit underneath it when collapsed.
        .padding(.leading, 56)
        .padding(.trailing, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .frame(height: ProfileHeaderMetrics.collapsedBar)
        .background(theme.backgroundPrimary)
        .overlay(alignment: .bottom) {
            Divider().opacity(MeeshyOpacity.medium)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: "\(displayUser.resolvedDisplayName), @\(displayUser.username)"))
    }
}
