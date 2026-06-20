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

    /// Banner + identity + compact details. Interpolates between the expanded
    /// state (full banner + 80pt avatar + name + bio + chips) and the collapsed
    /// state (banner shrunk toward `collapsedBar`, avatar shrunk, details faded)
    /// driven by `ProfileHeaderMetrics.progress(offset: scrollOffset)`.
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

            compactIdentityBlock
                .opacity(1 - Double(progress))
                // Collapse its height to 0 as we scroll so the tab bar reaches
                // the pinned position smoothly.
                .frame(maxHeight: progress > 0.8 ? 0 : nil)
                .clipped()
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
        )
        .clipped()
        .onTapGesture {
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

            Text(displayUser.resolvedDisplayName)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text("@\(displayUser.username)")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: resolvedAccent))
        }
        .padding(.top, 4)
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
            presenceState: isBlockedByTarget ? .offline : presenceFromUser,
            onViewStory: (showRing && ringState != .none) ? onViewStory : nil,
            onMoodTap: isBlockedByTarget ? nil : onMoodTap
        )
    }

    var presenceFromUser: PresenceState {
        displayUser.isOnline == true ? .online : .offline
    }

    // MARK: - Compact identity block (between banner and tab bar)

    /// The condensed details strip that sits under name/@pseudo while expanded:
    /// bio (2 lines) + a compact chips row (languages + country flag + mood).
    /// Fades out as the header collapses. Kept minimal vertically.
    @ViewBuilder
    var compactIdentityBlock: some View {
        VStack(spacing: 8) {
            if let bio = displayUser.bio, !bio.isEmpty {
                Text(bio)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 24)
            }

            compactChipsRow
        }
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    @ViewBuilder
    private var compactChipsRow: some View {
        let sysLang = LanguageDisplay.from(code: displayUser.systemLanguage)
        let regLang = LanguageDisplay.from(code: displayUser.regionalLanguage)
        let hasCountry = displayUser.registrationCountry != nil
        let hasMood = (moodEmoji?.isEmpty == false)

        if sysLang != nil || regLang != nil || hasCountry || hasMood {
            HStack(spacing: 8) {
                languagePills
                if let country = displayUser.registrationCountry {
                    let countryName = CountryFlag.name(for: country) ?? country
                    let flag = CountryFlag.emoji(for: country)
                    infoChip(icon: flag, text: countryName)
                }
                if let mood = moodEmoji, !mood.isEmpty {
                    Text(mood)
                        .font(.system(size: 16))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(theme.surface(tint: resolvedAccent, intensity: 0.12))
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Pinned tab bar (section header — pins on scroll)

    @ViewBuilder
    var pinnedTabBar: some View {
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
        .background(theme.backgroundPrimary)
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
                presenceState: isBlockedByTarget ? .offline : presenceFromUser
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
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(height: ProfileHeaderMetrics.collapsedBar)
        .background(theme.backgroundPrimary)
        .overlay(alignment: .bottom) {
            Divider().opacity(0.3)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("@\(displayUser.username)"))
    }
}
