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
    var bigCollapsibleHeader: some View {
        let progress = ProfileHeaderMetrics.progress(offset: scrollOffset)
        let bannerHeight = ProfileHeaderMetrics.expandedBanner
            - (ProfileHeaderMetrics.expandedBanner - ProfileHeaderMetrics.collapsedBar) * progress

        VStack(spacing: 0) {
            bannerSection
                .frame(height: bannerHeight)
                .clipped()
                .opacity(1 - Double(progress) * 0.6)

            identitySection
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
            if let bannerURL = displayUser.bannerURL, !bannerURL.isEmpty, let url = URL(string: bannerURL) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        defaultBannerGradient
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                            .frame(height: ProfileHeaderMetrics.expandedBanner)
                            .clipped()
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
                    case .failure:
                        defaultBannerGradient
                    @unknown default:
                        defaultBannerGradient
                    }
                }
                .frame(height: ProfileHeaderMetrics.expandedBanner)
            } else {
                defaultBannerGradient
            }
        }
    }

    var defaultBannerGradient: some View {
        LinearGradient(
            colors: isBlockedByTarget
                ? [Color.gray.opacity(0.5), Color.gray.opacity(0.3)]
                : [Color(hex: resolvedAccent).opacity(0.6), Color(hex: resolvedAccent).opacity(0.2)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(height: ProfileHeaderMetrics.expandedBanner)
        .overlay(
            ZStack {
                Circle()
                    .fill(Color(hex: resolvedAccent).opacity(0.15))
                    .frame(width: 200)
                    .offset(x: -80, y: -30)
                Circle()
                    .fill(Color(hex: resolvedAccent).opacity(0.1))
                    .frame(width: 150)
                    .offset(x: 100, y: 20)
            }
            // Decorative ambient orbs — not meaningful to VoiceOver.
            .accessibilityHidden(true)
        )
        .clipped()
        .onTapGesture {
            openFullscreenImage(url: displayUser.bannerURL, fallback: displayUser.resolvedDisplayName)
        }
        // Expose the banner tap to VoiceOver (raw onTapGesture isn't).
        .accessibilityElement()
        .accessibilityLabel(String(localized: "profile.banner.label", defaultValue: "Bannière de profil", bundle: .module))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction {
            openFullscreenImage(url: displayUser.bannerURL, fallback: displayUser.resolvedDisplayName)
        }
    }

    // MARK: - Identity

    var identitySection: some View {
        VStack(spacing: 6) {
            profileAvatar
                .bounceOnAppear()
                .onTapGesture {
                    openFullscreenImage(url: displayUser.avatarURL, fallback: displayUser.resolvedDisplayName)
                }
                // Expose the avatar tap to VoiceOver (a raw onTapGesture isn't).
                .accessibilityAddTraits(.isButton)
                .accessibilityHint(String(localized: "profile.avatar.viewFullscreen.hint", defaultValue: "Ouvre la photo en plein écran", bundle: .module))
                .accessibilityAction {
                    openFullscreenImage(url: displayUser.avatarURL, fallback: displayUser.resolvedDisplayName)
                }

            Text(displayUser.resolvedDisplayName)
                .font(.system(.title3, design: .rounded).weight(.bold))
                .foregroundColor(theme.textPrimary)

            HStack(spacing: 5) {
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
        .padding(.top, 4)
        // Gate the expanded identity from VoiceOver once the compact pinned bar
        // becomes the primary (mostly collapsed) — avoids a duplicate name/@user.
        .accessibilityHidden(ProfileHeaderMetrics.progress(offset: scrollOffset) > 0.5)
    }

    @ViewBuilder
    var profileAvatar: some View {
        let avatarName = displayUser.resolvedDisplayName
        let showRing = !isBlockedByTarget && !isBlocked
        // App câblée → état réel (pas d'anneau sans story active) ;
        // call site legacy (nil) → anneau décoratif historique.
        let ringState: StoryRingState = showRing ? (storyRingState ?? .read) : .none

        MeeshyAvatar(
            name: avatarName,
            context: .profileSheet,
            accentColor: isBlockedByTarget ? "888888" : resolvedAccent,
            avatarURL: displayUser.avatarURL,
            storyState: ringState,
            moodEmoji: isBlockedByTarget ? nil : moodEmoji,
            presenceState: isBlockedByTarget ? .offline : resolvedPresence,
            onViewStory: (showRing && ringState != .none) ? onViewStory : nil,
            onMoodTap: isBlockedByTarget ? nil : onMoodTap
        )
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

    /// Couleur du libellé de présence selon l'ancienneté : vert < 5 min,
    /// orange < 30 min, gris sinon. Miroir de `presenceColorClass` (web).
    func presenceColor(for date: Date, now: Date = Date()) -> Color {
        let minutes = now.timeIntervalSince(date) / 60
        if minutes < 5 { return MeeshyColors.success }
        if minutes < 30 { return MeeshyColors.warning }
        return theme.textSecondary
    }

    // MARK: - Pinned tab bar (section header — pins on scroll)

    @ViewBuilder
    var pinnedTabBar: some View {
        let progress = ProfileHeaderMetrics.progress(offset: scrollOffset)
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(ProfileTab.allCases, id: \.self) { tab in
                    tabButton(tab)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            Divider()
                .opacity(0.3)
        }
        // When the big header has scrolled away (progress → 1) the compact
        // identity bar (banner + avatar réduits) pins at the very top; the tabs
        // slide down by its height so they sit JUST BELOW it instead of being
        // covered by the overlay. No gap while expanded (progress 0).
        .padding(.top, ProfileHeaderMetrics.collapsedBar * progress)
        .background(theme.backgroundPrimary)
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
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle())
        }
        .padding(.leading, 16)
        .padding(.top, 14)
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
            VStack(spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: tab.icon)
                        .font(.system(size: 12, weight: .semibold))
                    Text(tab.title)
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundColor(selectedTab == tab ? Color(hex: resolvedAccent) : theme.textMuted)
                .padding(.vertical, 10)

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
        HStack(spacing: 10) {
            MeeshyAvatar(
                name: displayUser.resolvedDisplayName,
                context: .custom(32),
                accentColor: isBlockedByTarget ? "888888" : resolvedAccent,
                avatarURL: displayUser.avatarURL,
                storyState: .none,
                presenceState: isBlockedByTarget ? .offline : resolvedPresence
            )

            VStack(alignment: .leading, spacing: 0) {
                Text(displayUser.resolvedDisplayName)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text("@\(displayUser.username)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color(hex: resolvedAccent))
                    .lineLimit(1)
            }

            Spacer()
        }
        // Leading inset clears the top-left close button (36pt @ leading 16) so
        // the compact avatar/name never sit underneath it when collapsed.
        .padding(.leading, 56)
        .padding(.trailing, 16)
        .padding(.vertical, 8)
        .frame(height: ProfileHeaderMetrics.collapsedBar)
        .background(theme.backgroundPrimary)
        .overlay(alignment: .bottom) {
            Divider().opacity(0.3)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("\(displayUser.resolvedDisplayName), @\(displayUser.username)"))
    }
}
