import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — les blocs vivants de la Vitrine d'un autre (#19416, planche `Autre-Vitrine`)
//
// « En direct · Entre Proches » (l'app le lit, dès Proche seulement) et « Sa Légende » (l'app le lit, selon la
// visibilité du membre). Aucun ne se pose sur ma propre fiche ni sur une fiche bloquée : rien de lui ne se lit alors, et
// ces blocs n'ont rien à y dire. La carte « Avec X » est partie (#20177) : elle redisait Écrire, Appeler, Vidéo et la
// carte, que le bouton « Parler » et la face Actions portent déjà.

extension UserProfileSheet {

    /// Les blocs qui parlent de LUI à MOI : ni sur ma fiche, ni quand l'un de nous a bloqué l'autre.
    var showsRelationBlocks: Bool {
        !isCurrentUser && !isInteractionDisabled && resolvedUserId?.isEmpty == false
    }

    var vitrineMapRequest: ProfileLocationMapRequest? {
        ProfileBesideTheMap.request(of: self, onCall: offersCall ? { requestCall(isVideo: false) } : nil)
    }

    @ViewBuilder
    var liveSection: some View {
        if showsRelationBlocks, let section = liveSectionSlot, let userId = resolvedUserId {
            ProfileLiveSlot(
                section: section,
                request: ProfileLiveRequest(userId: userId, displayName: displayUser.resolvedDisplayName,
                                            isOnline: resolvedPresence == .online, staleAge: phase.offlineAge,
                                            tint: accentTint, openMap: nil, mood: shownMoodEmoji),
                map: locationMap, mapRequest: vitrineMapRequest
            )
            .padding(.horizontal, MeeshySpacing.xl)
        }
    }

    @ViewBuilder
    var gameSectionCard: some View {
        if showsRelationBlocks, let card = gameSection?.card, let userId = resolvedUserId, !userId.isEmpty {
            card(userId, accentTint)
                .padding(.horizontal, MeeshySpacing.xl)
        }
    }
}

extension ProfileSheetPhase {
    /// L'âge de la fiche lue depuis le cache faute de réseau : « Dernières infos · il y a 3 h » ; `nil` sinon.
    nonisolated var offlineAge: TimeInterval? {
        guard case .shown(let fallback?) = self, fallback.failure == .offline else { return nil }
        return fallback.age
    }
}
