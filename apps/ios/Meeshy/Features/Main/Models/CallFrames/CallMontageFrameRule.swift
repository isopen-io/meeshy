import Foundation

/// Ce que le carrousel du Montage propose : un montage classique, ou un cadre
/// du catalogue (par son identifiant stable, `<ambiance>.<motif>.<tranche>`).
nonisolated enum CallMontageChoice: Hashable, Sendable {
    case classic(CallMontageStyle)
    case frame(String)
}

/// Une puce d'ambiance au-dessus du carrousel (spec § 3) : « Classiques » en
/// tête — les treize montages existants —, puis les ambiances du catalogue.
nonisolated enum CallMontageMoodChip: Hashable, Sendable {
    case classics
    case mood(CallFrameMood)
}

/// **LA NAVIGATION DU MONTAGE** (#8742, spec § 2 et § 3), en fonctions pures :
/// quelles puces pour `n` personnes (moi compris), quels éléments dans le
/// carrousel d'une puce, et où retombe le choix quand `n` change.
nonisolated enum CallMontageFrameRule {
    /// Le dernier recours : le premier classique.
    static let fallback: CallMontageChoice = .classic(.screen)

    /// « Classiques » d'abord, puis les seules ambiances qui ont au moins un cadre pour `n` :
    /// toutes (`.all`, ordre canonique), ou celles ouvertes d'office et leur ordre (`.spotlight`, #12683).
    static func chips(forPeople people: Int, scope: CallFrameScope = .all, in frames: [CallFrameDesign] = CallFrameCatalogue.all) -> [CallMontageMoodChip] {
        [.classics] + CallFrameSpotlightRule.moods(forPeople: people, scope: scope, in: frames).map { CallMontageMoodChip.mood($0) }
    }

    /// Le carrousel d'une puce : les classiques, ou les cadres de l'ambiance qui servent `n` —
    /// tous (`.all`), ou ses seules vedettes (`.spotlight`, #12683).
    static func items(for chip: CallMontageMoodChip, people: Int, scope: CallFrameScope = .all, in frames: [CallFrameDesign] = CallFrameCatalogue.all) -> [CallMontageChoice] {
        switch chip {
        case .classics:
            return CallMontageStyle.allCases.map { CallMontageChoice.classic($0) }
        case .mood(let mood):
            return CallFrameSpotlightRule.frames(forPeople: people, mood: mood, scope: scope, in: frames).map { CallMontageChoice.frame($0.id) }
        }
    }

    /// La portée montrée pour un choix : celle demandée, sauf si le cadre choisi n'y figure pas.
    static func scope(of choice: CallMontageChoice, people: Int, requested: CallFrameScope, in frames: [CallFrameDesign] = CallFrameCatalogue.all) -> CallFrameScope {
        guard case .frame(let id) = choice else { return requested }
        return CallFrameSpotlightRule.scope(showing: id, people: people, requested: requested, in: frames)
    }

    /// La puce qui porte un choix. Un cadre inconnu du catalogue retombe sur les classiques.
    static func chip(of choice: CallMontageChoice, in frames: [CallFrameDesign] = CallFrameCatalogue.all) -> CallMontageMoodChip {
        switch choice {
        case .classic:
            return .classics
        case .frame(let id):
            return design(id: id, in: frames).map { CallMontageMoodChip.mood($0.mood) } ?? .classics
        }
    }

    static func design(id: String, in frames: [CallFrameDesign] = CallFrameCatalogue.all) -> CallFrameDesign? {
        CallFrameCatalogue.frame(id: id, in: frames)
    }

    /// `n` a changé (arrivée, départ) : le même motif dans la nouvelle tranche ; sinon le
    /// premier cadre de la même ambiance ; sinon le premier classique. Un classique ne bouge pas.
    static func reconcile(_ choice: CallMontageChoice, people: Int, in frames: [CallFrameDesign] = CallFrameCatalogue.all) -> CallMontageChoice {
        guard case .frame(let id) = choice else { return choice }
        return CallFrameCatalogue.reconcile(selectedId: id, people: people, in: frames).map { CallMontageChoice.frame($0.id) } ?? fallback
    }

    /// Toucher une puce : le dernier choix fait dans cette ambiance s'il sert encore `n`,
    /// sinon le premier élément de son carrousel.
    static func entering(_ chip: CallMontageMoodChip, people: Int, remembered: CallMontageChoice?, scope: CallFrameScope = .all,
                         in frames: [CallFrameDesign] = CallFrameCatalogue.all) -> CallMontageChoice {
        let offered = items(for: chip, people: people, scope: scope, in: frames)
        if let remembered, offered.contains(remembered) { return remembered }
        return offered.first ?? fallback
    }
}
