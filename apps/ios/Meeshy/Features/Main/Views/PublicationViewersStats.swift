import SwiftUI
import MeeshyUI

// MARK: - L'en-tête chiffré de la liste des vues (#16386)

/// Un compteur de l'en-tête : vues (œil), réactions, commentaires,
/// impressions — le même glyphe que la carte de « Mes stories ».
struct PublicationViewersStat: Equatable, Identifiable {
    enum Kind: String, Equatable {
        case views
        case reactions
        case comments
        case impressions
    }

    let kind: Kind
    let count: Int
    var id: String { kind.rawValue }

    var systemImage: String {
        switch kind {
        case .views:       return "eye"
        case .reactions:   return "heart"
        case .comments:    return "bubble.left"
        case .impressions: return "chart.bar"
        }
    }

    var label: String {
        switch kind {
        case .views:
            return String(localized: "viewer.stats.views", defaultValue: "Vues", bundle: .main)
        case .reactions:
            return String(localized: "viewer.stats.reactions", defaultValue: "Réactions", bundle: .main)
        case .comments:
            return String(localized: "viewer.stats.comments", defaultValue: "Commentaires", bundle: .main)
        case .impressions:
            return String(localized: "viewer.stats.impressions", defaultValue: "Impressions", bundle: .main)
        }
    }
}

extension PublicationViewersHeader {
    /// Vues, réactions, commentaires, impressions — dans cet ordre. Un
    /// compteur INCONNU (`nil`, serveur antérieur) ne se dessine pas ; un zéro
    /// connu se dit.
    static func stats(views: Int, impressions: Int, reactions: Int?, comments: Int?) -> [PublicationViewersStat] {
        let candidates: [(PublicationViewersStat.Kind, Int?)] = [
            (.views, views),
            (.reactions, reactions),
            (.comments, comments),
            (.impressions, impressions),
        ]
        return candidates.compactMap { kind, count in
            count.map { PublicationViewersStat(kind: kind, count: max($0, 0)) }
        }
    }
}

/// La rangée de compteurs posée en tête de la liste : un glyphe, un nombre,
/// un libellé — lisible d'un coup d'œil, lue d'une phrase par VoiceOver.
struct PublicationViewersStats: View {
    let stats: [PublicationViewersStat]
    let accentColor: Color

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(stats) { stat in
                VStack(spacing: MeeshySpacing.xxs) {
                    HStack(spacing: MeeshySpacing.xxs) {
                        Image(systemName: stat.systemImage)
                            .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                            .foregroundColor(accentColor)
                        Text("\(stat.count)")
                            .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                            .foregroundColor(.primary)
                    }
                    Text(stat.label)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, MeeshySpacing.sm)
        .textCase(nil)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(stats.map { "\($0.count) \($0.label)" }.joined(separator: ", "))
    }
}
