import Foundation
import MeeshySDK

/// LE HÉRO DE PROGRESSION (#5841) — ce que la loi dit au héro, avant qu'il le dessine.
///
/// « Comment gagner » ne contient AUCUNE chaîne recopiée : c'est le barème
/// (`EngagementCatalog.familyWeights`, miroir de `ENGAGEMENT_AXIS_WEIGHTS`) qui fait la liste,
/// triée par poids décroissant. Régler un poids change ce que le héro énumère sans toucher un
/// mot — c'est exactement ce qui était arrivé à la fixture de démonstration (#5762), dont la
/// phrase en dur s'était périmée au premier réglage. Miroir de `apps/web/src/routes/progression-hero.tsx`.
enum GameHero {

    /// Une puce de « Comment gagner » : une famille d'actions et ce qu'elle rapporte par geste.
    struct EarnItem: Equatable, Identifiable {
        let family: EngagementAxisFamily
        let weight: Int

        var id: String { family.rawValue }
    }

    /// La règle du carnet que chaque puce ouvre : « Chaque geste rapporte » (règle 1).
    static let earnRule = 1
    /// La règle du carnet que « Comment frapper » ouvre : « On frappe des Meeshes » (règle 3).
    static let mintRule = 3

    /// Une puce par famille, triée par poids décroissant. À poids égal, l'ordre du catalogue
    /// décide : la liste ne danse pas d'un lancement à l'autre (un dictionnaire n'a pas d'ordre).
    static func earnItems(weights: [EngagementAxisFamily: Int] = EngagementCatalog.familyWeights) -> [EarnItem] {
        EngagementAxisFamily.allCases.enumerated()
            .compactMap { index, family in weights[family].map { (index, EarnItem(family: family, weight: $0)) } }
            .sorted { lhs, rhs in lhs.1.weight != rhs.1.weight ? lhs.1.weight > rhs.1.weight : lhs.0 < rhs.0 }
            .map(\.1)
    }

    /// La ligne que Mee dit dans le coin du héro : celle du guide du moment, en version COURTE.
    /// Une étape d'intégration ou une première fois (version complète) garde sa carte entière,
    /// avec ses boutons — le coin ne dit que ce que le joueur connaît déjà.
    static func cornerLine(for card: GuideCard?) -> String? {
        guard let card, card.step == nil, card.presentation == .short else { return nil }
        return card.copy.short
    }
}

extension GuideCard {
    /// La même carte dans une autre présentation : le toucher sur Mee ouvre la version COMPLÈTE.
    func presenting(_ presentation: GuidePresentation) -> GuideCard {
        GuideCard(
            key: key, speaker: speaker, mood: mood, copy: copy, action: action,
            presentation: presentation, step: step, photo: photo
        )
    }
}
