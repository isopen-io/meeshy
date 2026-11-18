import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Details tab
//
// La Vitrine de la fiche d'un autre (#18870), faite du kit (loi 12) : la bio et
// les puces vivent sous le nom (`ProfileIdentityChips`, dans l'en-tête), puis
// « Avec lui », « En direct », « Sa voix », « Son jeu », « En chiffres », la
// complétude, « En commun » et « Publications ».

extension UserProfileSheet {

    /// La Vitrine de l'autre (loi 1), dans l'ordre de la planche `Autre-Vitrine` (#19416) : « Avec lui » (K32, vers la
    /// face Actions), « En direct » dès Proche, sa voix, son jeu, ses chiffres, sa complétude, puis ce que les anciens
    /// onglets portaient — ce que nous avons en commun et ses publications (loi 11).
    @ViewBuilder
    var vitrineFace: some View {
        VStack(spacing: MeeshySpacing.xxl + MeeshySpacing.xs) {
            withThemSection.meeshyCascade(rank: 0)
            liveSection.meeshyCascade(rank: 1)
            ProfilePendingSection.of(self).meeshyCascade(rank: 2)
            voiceSection.meeshyCascade(rank: 3)
            gameSectionCard.meeshyCascade(rank: 4)
            figuresSection.meeshyCascade(rank: 5)
            completionSection.meeshyCascade(rank: 6)
            commonSection.meeshyCascade(rank: 7)
            publicationsSection.meeshyCascade(rank: 8)
            ProfileAcquaintanceSection.of(self).meeshyCascade(rank: 9)
        }
        .meeshyCascadeFace()
    }

    // MARK: - En commun (l'ancien onglet Conversations)

    /// Nos conversations, puis nos communautés, amis, médias et notre histoire (#19377, planche `Autre-Commun`).
    /// Bloqué dans un sens ou l'autre, ou sa propre fiche : seulement les conversations, comme avant.
    private var commonSection: some View {
        ProfileInCommonSection(
            userId: isCurrentUser || isInteractionDisabled ? nil : resolvedUserId,
            source: dependencies.inCommon,
            conversationCount: effectiveConversations.count,
            isLoadingConversations: effectiveIsLoadingConversations,
            tint: accentTint,
            accentHex: resolvedAccent,
            onFirstMessage: isCurrentUser || isInteractionDisabled ? nil : { openConversation() },
            onOpenImage: { url in openFullscreenImage(url: url, fallback: "") }
        ) {
            conversationsTab
        }
    }

    // MARK: - Publications (l'ancien onglet Publications)

    @ViewBuilder
    private var publicationsSection: some View {
        if postsContent != nil && !isCurrentUser {
            postsTab.environment(\.meeshyProfileAccent, resolvedAccent)
        } else {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: String(localized: "profile.relation.section.posts", defaultValue: "Publications", bundle: .module))
                    .padding(.horizontal, MeeshySpacing.xl)
                postsTab
            }
        }
    }

    // MARK: - Sa voix (K44 + K35)

    @ViewBuilder
    private var voiceSection: some View {
        if displayUser.voicePublic == true, let url = displayUser.voiceSampleUrl, !url.isEmpty {
            ProfileVoiceSample(url: url, durationMs: displayUser.voiceSampleDurationMs, tint: accentTint)
                .padding(.horizontal, MeeshySpacing.xl)
        }
    }

    // MARK: - En chiffres (K44 + K34)

    private var figuresSection: some View {
        ProfileFiguresSection(memberSince: displayUser.createdAt, stats: effectiveUserStats,
                              isLoadingStats: effectiveIsLoadingStats)
            .padding(.horizontal, MeeshySpacing.xl)
    }

    // MARK: - La complétude (loi 11)

    @ViewBuilder
    private var completionSection: some View {
        if let completionRate = displayUser.profileCompletionRate {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ProfileVitrineCopy.completionTitle)
                ProfileCompletionRing(progress: Double(completionRate) / 100.0)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, MeeshySpacing.xl)
        }
    }
}
