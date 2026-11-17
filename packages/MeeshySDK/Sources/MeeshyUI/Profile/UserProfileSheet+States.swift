import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — les états de la fiche (#18873)
//
// Planches `Etat-Chargement`, `Etat-Erreur`, `Etat-HorsLigne`, `Etat-Bloque`, `Etat-Introuvable`. Tout est fait du kit
// (loi 12) : le squelette K38 sur cache vide seulement, le bloc d'état K38 pour l'erreur, le refus, « Personne ici » et
// la bande « hors ligne » posée sur une fiche que le cache sert (loi 8).

extension UserProfileSheet {

    /// L'écran que la fiche rend, lu dans le chargeur ; mon blocage est connu localement.
    var phase: ProfileSheetPhase {
        loader.phase(isBlockedByMe: isBlocked)
    }

    /// « Personne ici » : la croix de la fiche, et rien d'autre de la fiche.
    var unavailableLayout: some View {
        ProfileUnavailableView(onBack: { closeSheet() })
            .overlay(alignment: .topLeading) { closeButton }
    }

    /// Le bloc d'erreur ou la bande « hors ligne » relancent la même ouverture.
    func retryFromState() {
        Task { await retryProfile() }
    }

    func closeSheet() {
        HapticFeedback.light()
        onDismiss?()
        dismiss()
    }

    // MARK: - Je l'ai bloqué

    /// La fiche réduite : l'identité grisée, ce que le blocage ferme, « Débloquer », « Signaler aussi », et ce qui
    /// reste — son lien, nos conversations en lecture seule.
    var blockedLayout: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                bannerSection
                identitySection(offset: 0)
                    .padding(.top, -40)
                MeeshyStateBlock(
                    kind: .denied,
                    title: ProfileStatesCopy.blockedTitle(displayUser.resolvedDisplayName),
                    primary: MeeshyStateBlockAction(title: ProfileStatesCopy.unblock) {
                        HapticFeedback.medium()
                        Task { await unblockUser() }
                    },
                    secondary: MeeshyStateBlockAction(title: ProfileStatesCopy.reportToo) { showReportSheet = true },
                    art: .none,
                    consequences: ProfileStatesCopy.blockedConsequences,
                    systemImage: "nosign"
                )
                .padding(.top, MeeshySpacing.lg)
                blockedRemains
                    .padding(.top, MeeshySpacing.xxl)
            }
            .padding(.bottom, MeeshySpacing.xxl)
        }
        .background(theme.backgroundPrimary)
        .ignoresSafeArea(edges: .top)
        .overlay(alignment: .topLeading) { closeButton }
        .task { await loadConversationsIfNeeded() }
    }

    private var blockedRemains: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileStatesCopy.remainsTitle)
                .padding(.horizontal, MeeshySpacing.xl)
            if let link = ProfileLink(username: displayUser.username) {
                MeeshyActionGrid {
                    MeeshyLabeledAction(
                        title: String(localized: "profile.relation.action.copyLink", defaultValue: "Copier son lien", bundle: .module),
                        systemImage: "doc.on.doc",
                        tint: theme.textMuted,
                        hint: link.displayText,
                        action: { copyProfileLink(link) }
                    )
                }
                .padding(.horizontal, MeeshySpacing.xl)
            }
            conversationsTab
        }
    }
}

// MARK: - Les états, faits du kit (loi 12)

/// Premier chargement, cache vide : la silhouette de la Vitrine — lignes, langues, cartes. Elle se tait pour le lecteur
/// d'écran, qui entend une seule phrase « Chargement de la fiche ».
struct ProfileSkeletonFace: View {
    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            MeeshySkeleton(shape: .line(widthRatio: 0.7))
            MeeshySkeleton(shape: .line(widthRatio: 0.45))
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(0..<3, id: \.self) { _ in MeeshySkeleton(shape: .pill(width: 84)) }
            }
            ForEach(0..<2, id: \.self) { _ in
                MeeshySkeleton(shape: .card(aspect: 3.2, radius: Double(MeeshyRadius.lg)))
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ProfileStatesCopy.loading)
    }
}

/// Rien en cache et la synchronisation a échoué : le bloc d'état dit pourquoi, et « Réessayer » relance tout.
struct ProfileFailedState: View {
    let failure: ProfileLoadFailure
    let onRetry: () -> Void

    var body: some View {
        MeeshyStateBlock(
            kind: failure == .offline ? .offline : .error,
            title: ProfileStatesCopy.failedTitle,
            message: ProfileStatesCopy.failedMessage(failure),
            primary: MeeshyStateBlockAction(title: ProfileStatesCopy.retry, systemImage: "arrow.clockwise", perform: onRetry),
            art: .none,
            systemImage: failure == .offline ? "wifi.slash" : "exclamationmark.icloud"
        )
        .padding(.vertical, MeeshySpacing.xl)
    }
}

/// Hors ligne ou serveur muet, le cache répond : une bande compacte dit de quand date la fiche, et « Réessayer ».
struct ProfileCacheFallbackBanner: View {
    let fallback: ProfileCacheFallback
    let onRetry: () -> Void

    var body: some View {
        MeeshyStateBlock(
            kind: .offline,
            title: ProfileStatesCopy.fallbackTitle(fallback),
            primary: MeeshyStateBlockAction(title: ProfileStatesCopy.retry, perform: onRetry),
            size: .compact,
            systemImage: fallback.failure == .offline ? "icloud.slash" : "exclamationmark.icloud"
        )
        .padding(.horizontal, MeeshySpacing.xl)
    }
}

/// Introuvable, privé, ou il m'a bloqué : le même écran pour les trois (loi 9), sans rien de lui — ni nom, ni photo,
/// ni bannière. Rien ne dit qu'on est bloqué.
struct ProfileUnavailableView: View {
    let onBack: () -> Void
    @ResolvedThemePalette private var theme

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: MeeshySpacing.xxl)
            MeeshyStateBlock(
                kind: .empty,
                title: ProfileStatesCopy.unavailableTitle,
                message: ProfileStatesCopy.unavailableMessage,
                primary: MeeshyStateBlockAction(title: ProfileStatesCopy.back, perform: onBack),
                art: .none,
                tint: theme.textMuted,
                systemImage: "person.crop.circle.badge.questionmark"
            )
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.backgroundPrimary)
    }
}

// MARK: - Les mots des états

enum ProfileStatesCopy {
    static var loading: String {
        String(localized: "profile.state.loading", defaultValue: "Chargement de la fiche", bundle: .module)
    }

    static var retry: String {
        String(localized: "common.retry", defaultValue: "Réessayer", bundle: .module)
    }

    static var back: String {
        String(localized: "profile.state.back", defaultValue: "Retour", bundle: .module)
    }

    static var failedTitle: String {
        String(localized: "profile.state.failed.title", defaultValue: "Impossible d'ouvrir cette fiche pour l'instant", bundle: .module)
    }

    static func failedMessage(_ failure: ProfileLoadFailure) -> String {
        switch failure {
        case .offline:
            return String(localized: "profile.state.failed.offline",
                          defaultValue: "Tu es hors ligne, et cette fiche n'est pas encore gardée sur ton téléphone.",
                          bundle: .module)
        case .unreachable:
            return String(localized: "profile.state.failed.unreachable",
                          defaultValue: "Ta connexion va bien. Le souci est de notre côté, et ça ne dure jamais longtemps.",
                          bundle: .module)
        }
    }

    /// « Hors ligne · fiche gardée il y a 3 h » : l'âge relatif dans la langue du téléphone.
    static func fallbackTitle(_ fallback: ProfileCacheFallback, now: Date = Date()) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        formatter.dateTimeStyle = .named
        let ago = formatter.localizedString(for: now.addingTimeInterval(-fallback.age), relativeTo: now)
        let format: String
        switch fallback.failure {
        case .offline:
            format = String(localized: "profile.state.fallback.offline", defaultValue: "Hors ligne · fiche gardée %@", bundle: .module)
        case .unreachable:
            format = String(localized: "profile.state.fallback.unreachable", defaultValue: "Serveur injoignable · fiche gardée %@", bundle: .module)
        }
        return String(format: format, ago)
    }

    static var unavailableTitle: String {
        String(localized: "profile.state.unavailable.title", defaultValue: "Personne ici", bundle: .module)
    }

    static var unavailableMessage: String {
        String(localized: "profile.state.unavailable.message",
               defaultValue: "Ce profil n'existe pas, ou il n'est pas visible pour toi.", bundle: .module)
    }

    static func blockedTitle(_ name: String) -> String {
        String(format: String(localized: "profile.state.blocked.title", defaultValue: "Tu as bloqué %@", bundle: .module), name)
    }

    static var blockedConsequences: [String] {
        [
            String(localized: "profile.state.blocked.noMessages", defaultValue: "Il ne peut plus t'écrire ni t'appeler", bundle: .module),
            String(localized: "profile.state.blocked.noProfile", defaultValue: "Il ne voit plus ton profil ni tes publications", bundle: .module),
            String(localized: "profile.state.blocked.notNotified", defaultValue: "Il n'est pas prévenu", bundle: .module)
        ]
    }

    static var unblock: String {
        String(localized: "profile.blocked.unblock", defaultValue: "Débloquer", bundle: .module)
    }

    static var reportToo: String {
        String(localized: "profile.state.blocked.reportToo", defaultValue: "Signaler aussi", bundle: .module)
    }

    static var remainsTitle: String {
        String(localized: "profile.state.blocked.remains", defaultValue: "Ce qui reste", bundle: .module)
    }

    static var readOnly: String {
        String(localized: "profile.state.blocked.readOnly", defaultValue: "Lecture seule", bundle: .module)
    }
}
