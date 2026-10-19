import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Rail vivants & stories (LWS-6, drapeau Lentille)

/// Mux de tête de liste. Drapeau OFF : `StoryTrayView`, à l'identique.
/// Drapeau ON : la FUSION — pastille « moi » en tête (arbitrage
/// I-063bis), puis les autres, bornées à `≤ 6` par le rail lui-même.
///
/// Aucune navigation nouvelle : les trois destinations de « moi » sont les
/// chemins existants, appelés depuis ici plutôt que depuis le tray —
/// `StoryTrayActionResolver` décide (même règle, même annonce VoiceOver),
/// la liste « Mes stories » passe par le listener `openMyStories` des
/// RACINES (celui que la tuile Stories du profil emprunte déjà), le
/// composeur de story par `storyViewModel.showStoryComposer` (cover monté
/// aux racines) et le composeur de statut par la sheet que CETTE vue
/// héberge déjà (`showStatusComposer`).
struct ConversationListStoryRail: View {
    let onStoryViewRequest: ((String, Bool) -> Void)?
    @Binding var showStatusComposer: Bool
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel

    @ViewBuilder
    var body: some View {
        if LentilleFeatureFlag.isLentilleListEnabled {
            StoriesVivantsRail(
                selfEntry: lentilleRailSelfEntry,
                entries: lentilleRailEntries,
                onSelect: { userId in onStoryViewRequest?(userId, true) },
                onSelectSelf: { openMyStoriesFromRail() },
                onSelfMoodTap: {
                    showStatusComposer = true
                    HapticFeedback.medium()
                },
                onSelfCreateStory: {
                    storyViewModel.showStoryComposer = true
                    HapticFeedback.medium()
                }
            )
        } else {
            StoryTrayView(viewModel: storyViewModel, onViewStory: { userId in
                onStoryViewRequest?(userId, true)
            }, onAddStatus: {
                showStatusComposer = true
            })
        }
    }

    /// La pastille « moi ». `nil` si aucun utilisateur n'est résolu — le rail
    /// retombe alors sur les seules autres pastilles, et sur `EmptyView` s'il
    /// n'y en a aucune.
    private var lentilleRailSelfEntry: LentilleRailSelfEntry? {
        guard let currentUser = AuthManager.shared.currentUser else { return nil }
        let userId = currentUser.id
        // Un groupe entièrement expiré est traité comme « pas de story » —
        // même règle que le tray, sinon l'anneau promet un viewer qui se
        // refermerait aussitôt.
        let myGroup = storyViewModel.storyGroupForUser(userId: userId).flatMap { $0.isFullyExpired() ? nil : $0 }
        return ConversationListView.railSelfEntry(
            displayName: currentUser.displayName ?? currentUser.username,
            avatarURL: currentUser.avatar,
            accentColor: DynamicColorGenerator.colorForName(currentUser.username),
            // MÊME résolveur que le tray (`MyStoryButton`) : la couverture de
            // ma dernière story, jamais une seconde écriture de la cascade
            // cover locale > thumbnail serveur > image > avatar.
            coverURL: myGroup.flatMap { latestStoryThumbnailURL($0) },
            hasActiveStory: myGroup != nil,
            moodEmoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
            // Le libellé sort de la MÊME règle que le routage ci-dessous : les
            // deux ne peuvent pas diverger (régression déjà vécue côté tray).
            // Le tap ouvre TOUJOURS le listing « Mes stories » (voir
            // `openMyStoriesFromRail`) : l'annonce dit cette destination-là.
            actionLabel: StoryTrayCopy.manageStories
        )
    }

    /// Tap sur « moi » : la décision appartient à `StoryTrayActionResolver`
    /// (règle partagée avec le tray, déjà testée), jamais à cette vue. Les deux
    /// destinations sont celles d'aujourd'hui — la liste « Mes stories » par le
    /// listener des racines, le composeur par le cover des racines.
    /// Tap sur MON avatar du rail ⇒ TOUJOURS le listing « Mes stories »
    /// (stories actives, brouillons, boutons créer / sélectionner) — retour
    /// user 2026-08-21. Créer directement une story est le rôle du (+) de
    /// l'entrée (`onSelfCreateStory`), plus celui d'un avatar sans story.
    private func openMyStoriesFromRail() {
        NotificationCenter.default.post(name: .openMyStories, object: nil)
        HapticFeedback.medium()
    }

    /// Entrées du rail. Même filtrage que le tray (`storyScrollView`) : ni
    /// moi-même, ni un groupe entièrement expiré — un groupe expiré ouvrirait
    /// puis refermerait le viewer (tap-puis-flash déjà documenté côté tray).
    /// La troncature `≤ 6` et le masquage si vide appartiennent au rail
    /// (`LentilleRailPolicy`), pas à cet appelant.
    ///
    /// ÉCART SIGNALÉ : la moitié « vivants » de la fusion reste vide —
    /// `isLive` est toujours `false`, faute de modèle d'appel en cours sur
    /// `Conversation` (contrat §0/E13, même constat que la greffe I-060 qui
    /// passe `liveCall: nil`). Le rail est donc, aujourd'hui, un rail de
    /// stories ; la pastille pulsée s'allumera sans changer cette vue le jour
    /// où la donnée existera.
    private var lentilleRailEntries: [LentilleRailEntry] {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        return ConversationListView.railStoryGroups(storyViewModel.storyGroups, excludingUserId: currentUserId)
            .map { group in
                ConversationListView.railEntry(
                    group: group,
                    // MÊME résolveur que le tray — une seule écriture de la
                    // cascade de couverture dans toute l'app (garde de source
                    // `LentilleChromeSourceGuardTests`).
                    coverURL: latestStoryThumbnailURL(group),
                    moodEmoji: statusViewModel.statusForUser(userId: group.id)?.moodEmoji
                )
            }
    }
}

// MARK: - Mappages purs du rail

/// Sur `ConversationListView` (et non sur le rail) : c'est l'adresse que les
/// témoins de `StoriesVivantsRailTests` appellent depuis l'extraction du rail.
extension ConversationListView {

    /// Mappage PUR de la pastille « moi » — `nonisolated`, donc attaquable
    /// directement par les tests (même convention que `sectionPillTitle`).
    /// La seule décision qu'il porte : la couverture de ma story active PRIME
    /// sur mon avatar, et à défaut c'est l'avatar — parité avec le bouton
    /// « moi » du tray.
    nonisolated static func railSelfEntry(
        displayName: String,
        avatarURL: String?,
        accentColor: String,
        coverURL: String?,
        hasActiveStory: Bool,
        moodEmoji: String?,
        actionLabel: String?
    ) -> LentilleRailSelfEntry {
        LentilleRailSelfEntry(
            displayName: displayName,
            avatarURL: avatarURL,
            previewURL: coverURL ?? avatarURL,
            accentColor: accentColor,
            moodEmoji: moodEmoji,
            hasActiveStory: hasActiveStory,
            actionLabel: actionLabel
        )
    }

    /// Le FILTRE du rail, isolé et PUR (`now` explicite) : ni moi-même, ni un
    /// groupe entièrement expiré — un groupe expiré ouvrirait puis refermerait
    /// le viewer (tap-puis-flash déjà documenté côté tray).
    nonisolated static func railStoryGroups(
        _ groups: [StoryGroup],
        excludingUserId currentUserId: String,
        now: Date = Date()
    ) -> [StoryGroup] {
        groups.filter { $0.id != currentUserId && !$0.isFullyExpired(at: now) }
    }

    /// Mappage PUR d'un groupe vers son entrée de rail. Les deux valeurs que
    /// la vue Chrome ne peut pas aller chercher elle-même (couverture, humeur)
    /// arrivent RÉSOLUES ; tout le reste est lu sur le groupe.
    nonisolated static func railEntry(
        group: StoryGroup,
        coverURL: String?,
        moodEmoji: String?
    ) -> LentilleRailEntry {
        LentilleRailEntry(
            id: group.id,
            displayName: group.username,
            avatarURL: group.avatarURL,
            previewURL: coverURL ?? group.avatarURL,
            moodEmoji: moodEmoji,
            hasUnviewed: group.hasUnviewed,
            accentColor: group.avatarColor,
            isLive: false
        )
    }
}
