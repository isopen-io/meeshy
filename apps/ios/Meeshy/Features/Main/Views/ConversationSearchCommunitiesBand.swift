import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La bande des communautés de la recherche (#10841)

/// **La bande suit le focus du champ de recherche** (#10841, retour porteur
/// 2026-10-16 : « faire disparaître cette partie lorsqu'on perd le focus du
/// champ de recherche automatiquement »).
///
/// Elle apparaît au focus et se retire, animée, dès qu'il se perd — clavier
/// fermé, toucher ailleurs, défilement qui rend le focus. Le bouton de
/// fermeture et la loupe passent par le focus, jamais à côté : une bande ouverte
/// sur un champ qui n'écoute plus n'existe pas.
nonisolated enum ConversationSearchCommunitiesBandLaw {
    static func isShown(afterFocusChangeTo focused: Bool) -> Bool { focused }

    /// **Des communautés, ou rien** (#10924) : « Communautés · Voir tout »
    /// au-dessus d'une bande vide est un titre qui ment. Sans communauté, le
    /// panneau ne se peint pas — le champ garde le focus, la liste se filtre.
    ///
    /// **Taper replie la bande** (#11036) : dès le premier caractère, elle
    /// laisse la place aux résultats ; le champ vidé, elle revient.
    static func drawsBand(for communities: [MeeshyCommunity], queryIsEmpty: Bool) -> Bool {
        !communities.isEmpty && queryIsEmpty
    }
}

// MARK: - La barre de recherche suit le SENS du défilement (#11036)

/// Défiler vers le BAS escamote la barre ; un défilement vers le HAUT, même
/// partiel, la ramène ; près de la tête de liste, elle est toujours là. Miroir
/// web : `nextSearchBarScroll` (`apps/web/src/lib/view/search-bar-reveal.ts`).
///
/// `offset` est celui de `MeeshyRefreshableScroll` (négatif vers le bas).
/// `anchor` retient l'extrême atteint dans le sens courant — le point le plus
/// BAS tant que la barre est escamotée, le plus HAUT tant qu'elle est là — et
/// une bascule exige `hysteresis` points depuis cet extrême.
nonisolated enum ConversationSearchBarScrollLaw {
    static let topZone: CGFloat = 30
    static let hysteresis: CGFloat = 12

    struct State: Equatable {
        var hidden: Bool
        var anchor: CGFloat
        static let initial = State(hidden: false, anchor: 0)
    }

    static func next(_ state: State, offset: CGFloat) -> State {
        let depth = -offset
        if depth <= topZone { return State(hidden: false, anchor: depth) }
        if state.hidden {
            return state.anchor - depth >= hysteresis
                ? State(hidden: false, anchor: depth)
                : State(hidden: true, anchor: max(state.anchor, depth))
        }
        return depth - state.anchor >= hysteresis
            ? State(hidden: true, anchor: depth)
            : State(hidden: false, anchor: min(state.anchor, depth))
    }
}

/// L'extrême de la loi, retenu SANS abonnement (même famille que
/// `ScrollOffsetRelay`) : l'écrire à chaque image ne ré-évalue aucun body.
final class ConversationSearchBarScrollAnchor {
    var value: CGFloat = 0
    nonisolated deinit {}
}

/// **La carte d'une communauté dans la bande de recherche : la MOITIÉ de sa
/// taille d'avant** (#10841 — « diminuer la card des communautés par 2 »).
/// Le contenu se resserre pour rester lisible : le nom sur deux lignes de
/// caption2 ; les compteurs quittent le visuel et restent dans le libellé
/// d'accessibilité.
nonisolated enum CommunityCardMetrics {
    static let formerWidth: CGFloat = 130
    static let formerHeight: CGFloat = 110
    static let width: CGFloat = formerWidth / 2
    static let height: CGFloat = formerHeight / 2
    static let nameSize: CGFloat = 11
    static let padding: CGFloat = 6
}

/// La bande elle-même — extraite de `ConversationListBottomBar` (fichier hors
/// budget) : titre, « Voir tout », fermeture, et le défilé des cartes.
struct ConversationSearchCommunitiesBand: View {
    let communities: [MeeshyCommunity]
    let onClose: () -> Void

    @EnvironmentObject var router: Router

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack {
                Text(String(localized: "communities.title", defaultValue: "Communautés"))
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.indigo300],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .accessibilityAddTraits(.isHeader)
                Spacer()

                HStack(spacing: MeeshySpacing.md) {
                    Button {
                        router.push(.communityList)
                    } label: {
                        Text(String(localized: "action.see_all", defaultValue: "Voir tout"))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .foregroundColor(MeeshyColors.indigo300)
                    }
                    .accessibilityLabel(String(localized: "accessibility.see_all_communities", defaultValue: "Voir toutes les communautés"))

                    Button {
                        onClose()
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.lg))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [MeeshyColors.error, MeeshyColors.error.opacity(MeeshyOpacity.heavy)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel(String(localized: "accessibility.close_communities", defaultValue: "Fermer les communautés"))
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.sm) {
                    ForEach(communities, id: \.id) { community in
                        ThemedCommunityCard(community: community) {
                            HapticFeedback.light()
                            router.push(.communityDetail(community.id))
                        }
                        .equatable()
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
            }
        }
    }
}
