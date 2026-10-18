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
    static func drawsBand(for communities: [MeeshyCommunity]) -> Bool { !communities.isEmpty }
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
