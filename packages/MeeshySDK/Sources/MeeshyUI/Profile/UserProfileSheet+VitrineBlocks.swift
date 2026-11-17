import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — les blocs vivants de la Vitrine d'un autre (#19416, planche `Autre-Vitrine`)
//
// « Avec Léo · Tout voir » (K32, mène à la face Actions), « En direct · Entre Proches » (l'app le lit, dès Proche
// seulement) et « Son jeu » (l'app le lit, selon la visibilité du membre). Aucun ne se pose sur ma propre fiche ni sur
// une fiche bloquée : rien de lui ne se lit alors, et ces blocs n'ont rien à y dire.

extension UserProfileSheet {

    /// Les blocs qui parlent de LUI à MOI : ni sur ma fiche, ni quand l'un de nous a bloqué l'autre.
    var showsRelationBlocks: Bool {
        !isCurrentUser && !isInteractionDisabled && resolvedUserId?.isEmpty == false
    }

    @ViewBuilder
    var withThemSection: some View {
        if showsRelationBlocks, !ProfileAcquaintanceSection.replacesWithThem(self) {
            ProfileWithThemCard(
                name: displayUser.resolvedDisplayName, isOffline: ProfileTalkReach.isOffline(phase),
                offersCall: offersCall, tint: accentTint, map: locationMap, mapRequest: vitrineMapRequest,
                onWrite: { openConversation() }, onCall: { requestCall(isVideo: $0) }, onSeeAll: { face = .actions }
            )
            .padding(.horizontal, MeeshySpacing.xl)
        }
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
        if showsRelationBlocks, let card = gameSection?.card, let userId = resolvedUserId {
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

/// « Avec Léo · Tout voir » (planches `Autre-Vitrine`, `Etat-HorsLigne`) : Écrire, Appeler, Vidéo et Carte en actions
/// libellées (K32) dans une carte d'accent (K43). « Tout voir » mène à la face Actions. Hors ligne, « Sans réseau » :
/// Écrire « sera envoyé », les appels attendent le réseau, la Carte montre la dernière position connue.
struct ProfileWithThemCard: View {
    let name: String
    let isOffline: Bool
    let offersCall: Bool
    let tint: Color
    let map: ProfileLocationMap?
    let mapRequest: ProfileLocationMapRequest?
    let onWrite: () -> Void
    let onCall: (_ isVideo: Bool) -> Void
    let onSeeAll: () -> Void

    var body: some View {
        MeeshyGroupCard(
            overline: ProfileVitrineCopy.withThemTitle(name),
            surface: .accent, layout: .content, tint: tint, isLocked: false, isFeatured: false,
            isBubble: false, label: nil, onPress: nil,
            accessory: { accessory },
            media: { EmptyView() },
            emblem: { EmptyView() },
            content: {
                MeeshyActionGrid {
                    action(.write, perform: onWrite)
                    if offersCall {
                        action(.call) { onCall(false) }
                        action(.video) { onCall(true) }
                    }
                    if let map, let mapRequest, map.placement(for: mapRequest.userId) != .none {
                        ProfileLocationMapAction(map: map, request: mapRequest, tint: tint,
                                                 value: isOffline ? ProfileVitrineCopy.lastKnownPosition : nil)
                    }
                }
                .padding(.horizontal, MeeshySpacing.sm)
            },
            footer: { EmptyView() }
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.vitrine.withThem")
    }

    @ViewBuilder
    private var accessory: some View {
        if isOffline {
            MeeshyBadge(.label(ProfileVitrineCopy.withoutNetwork), leading: .systemImage("icloud.slash"), size: .s28)
        } else {
            MeeshyButton(ProfileVitrineCopy.seeAll, kind: .text, size: .s44, tint: tint, action: onSeeAll)
                .accessibilityHint(ProfileVitrineCopy.seeAllHint)
                .accessibilityIdentifier("profile.vitrine.withThem.seeAll")
        }
    }

    private func action(_ operation: ProfileRelationAction, perform: @escaping () -> Void) -> some View {
        let reach = ProfileTalkReach.resolve(operation, isOffline: isOffline)
        return MeeshyLabeledAction(
            title: operation.title,
            systemImage: operation.systemImage,
            value: ProfileStatesCopy.reachMention(reach),
            valueKind: reach == .queued ? .accent : .quiet,
            tint: tint,
            action: perform
        )
        .disabled(reach == .needsNetwork)
    }
}
