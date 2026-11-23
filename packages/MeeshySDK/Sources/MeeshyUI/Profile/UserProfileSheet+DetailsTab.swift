import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Details tab
//
// La Vitrine de la fiche d'un autre (#18870), faite du kit (loi 12) : la bio et
// les puces vivent sous le nom (`ProfileIdentityChips`, dans l'en-tête), puis
// « En direct », « Notre histoire », « Sa voix », « Ses adresses », « Sa Légende », « En chiffres »,
// la complétude, « En commun » et « Publications ».

extension UserProfileSheet {

    /// La Vitrine de l'autre (loi 1), dans l'ordre de la planche `Autre-Vitrine` (#19416) : « En direct » dès Proche, sa
    /// voix, où le trouver (ses adresses, ses communautés ouvertes, #20177), son jeu, ses chiffres, sa complétude, puis ce
    /// que les anciens onglets portaient — ce que nous avons en commun et ses publications (loi 11). Écrire vit au bouton
    /// « Parler » du sélecteur, appeler et la carte sur la face Actions : la Vitrine ne les redit pas.
    @ViewBuilder
    var vitrineFace: some View {
        VStack(spacing: MeeshySpacing.xxl + MeeshySpacing.xs) {
            liveSection.meeshyCascade(rank: 0)
            historySection.meeshyCascade(rank: 1)
            ProfilePendingSection.of(self).meeshyCascade(rank: 2)
            voiceSection.meeshyCascade(rank: 3)
            RelationReachSection.of(self).meeshyCascade(rank: 4)
            gameSectionCard.meeshyCascade(rank: 5)
            figuresSection.meeshyCascade(rank: 6)
            completionSection.meeshyCascade(rank: 7)
            commonSection.meeshyCascade(rank: 8)
            publicationsSection.meeshyCascade(rank: 9)
            ProfileAcquaintanceSection.of(self).meeshyCascade(rank: 10)
        }
        .meeshyCascadeFace()
        .task(id: inCommonUserId) {
            guard let userId = inCommonUserId, !userId.isEmpty else { return }
            await inCommon.open(userId: userId, using: dependencies.inCommon)
        }
    }

    // MARK: - En commun (l'ancien onglet Conversations)

    /// Bloqué dans un sens ou l'autre, ou sa propre fiche : pas de document « en commun » à lire.
    private var inCommonUserId: String? {
        isCurrentUser || isInteractionDisabled ? nil : resolvedUserId
    }

    /// Notre histoire, juste sous « En direct » (#20357).
    private var historySection: some View {
        ProfileHistorySection(model: inCommon, tint: accentTint)
    }

    /// Nos conversations, puis nos communautés, amis, médias et notre histoire (#19377, planche `Autre-Commun`).
    /// Bloqué dans un sens ou l'autre, ou sa propre fiche : seulement les conversations, comme avant.
    private var commonSection: some View {
        ProfileInCommonSection(
            model: inCommon,
            userId: inCommonUserId,
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
        ProfileFiguresSection(stats: effectiveUserStats, isLoadingStats: effectiveIsLoadingStats)
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
