import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'audience d'une story publiée, telle que servie (#20179) : l'icône même du sélecteur d'audience à la publication.
/// Tout lecteur voit l'icône ; le détail — à qui elle s'adresse, combien de personnes choisies — n'est dit qu'à
/// l'auteur, seul à qui la passerelle sert la liste (`withAudienceListFor`). Rien sans audience servie.
struct StoryAudiencePlan: Equatable {
    let audience: PostVisibility
    let chosenCount: Int?
    let isAuthor: Bool

    static func make(visibility: String?, userIds: [String]?, isAuthor: Bool) -> StoryAudiencePlan? {
        guard let visibility, !visibility.isEmpty else { return nil }
        let audience = PostVisibility(served: visibility)
        let chosen = isAuthor && audience.requiresUserSelection ? userIds.map(\.count) : nil
        return StoryAudiencePlan(audience: audience, chosenCount: chosen, isAuthor: isAuthor)
    }

    var icon: String { audience.icon }

    /// « Audience : Proches » ; l'auteur entend aussi qui la voit, et combien de personnes il a choisies.
    var spoken: String {
        let named = String(
            format: String(localized: "story.viewer.audience.a11y", defaultValue: "Audience : %@", bundle: .main),
            audience.label
        )
        guard isAuthor else { return named }
        let chosen = chosenCount.map {
            String(format: String(localized: "story.viewer.audience.chosen", defaultValue: "%lld personnes choisies",
                                  bundle: .main), $0)
        }
        return ([named, audience.who] + [chosen].compactMap { $0 }).joined(separator: ", ")
    }
}

/// L'icône posée sur la ligne du nom de l'en-tête, avec le nombre de personnes choisies pour l'auteur d'une audience à
/// liste. Une feuille Equatable : elle ne reçoit que le plan.
struct StoryAudienceBadge: View, Equatable {
    let plan: StoryAudiencePlan

    var body: some View {
        HStack(spacing: MeeshySpacing.xxs) {
            Image(systemName: plan.icon)
                .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
            if let count = plan.chosenCount {
                Text(count, format: .number)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .monospacedDigit()
            }
        }
        .foregroundStyle(MeeshyColors.mediaChromeTertiary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(plan.spoken)
        .accessibilityIdentifier("story.viewer.audience")
    }
}
