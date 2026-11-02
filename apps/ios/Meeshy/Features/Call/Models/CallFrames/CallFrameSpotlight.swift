import Foundation

/// Une ambiance que le carrousel d'appel ouvre d'office, et ses cadres vedettes (identifiants de
/// MOTIF, `ambiance.motif`), dans l'ordre où ils se proposent. La liste vient de
/// `packages/shared/design/call-capture-frames/spotlight.json` (#12683), générée dans
/// `CallFrameSpotlight+Generated.swift`.
nonisolated struct CallFrameSpotlight: Equatable, Sendable {
    let mood: CallFrameMood
    let featured: [String]
}

/// Ce que le carrousel montre : les ambiances ouvertes d'office et leurs vedettes, ou tout le
/// catalogue (« Plus d'ambiances »). Rien n'est retiré du catalogue : la portée ne fait que ranger.
nonisolated enum CallFrameScope: Hashable, Sendable {
    case spotlight
    case all
}

/// **LA MISE EN AVANT DES CADRES** (#12683), en fonctions pures : quelles ambiances, quels cadres,
/// dans quel ordre, selon la portée.
nonisolated enum CallFrameSpotlightRule {
    /// Les ambiances d'une portée qui servent `n`. Ouvertes d'office : dans l'ordre de la mise en
    /// avant ; tout le catalogue : l'ordre canonique, exactement comme avant la mise en avant.
    static func moods(forPeople people: Int, scope: CallFrameScope,
                      in frames: [CallFrameDesign] = CallFrameCatalogue.all,
                      spotlight: [CallFrameSpotlight] = CallFrameCatalogue.spotlight) -> [CallFrameMood] {
        let served = CallFrameCatalogue.moods(forPeople: people, in: frames)
        let featured = spotlight.map(\.mood).filter { served.contains($0) }
        switch scope {
        case .spotlight:
            return featured.isEmpty ? served : featured
        case .all:
            return served
        }
    }

    /// Les cadres d'une ambiance pour `n`. Ouvertes d'office : ses seules vedettes, dans leur ordre
    /// (toute l'ambiance si aucune vedette ne sert `n`) ; tout le catalogue : l'ordre du catalogue.
    static func frames(forPeople people: Int, mood: CallFrameMood, scope: CallFrameScope,
                       in frames: [CallFrameDesign] = CallFrameCatalogue.all,
                       spotlight: [CallFrameSpotlight] = CallFrameCatalogue.spotlight) -> [CallFrameDesign] {
        let served = CallFrameCatalogue.frames(forPeople: people, mood: mood, in: frames)
        let order = spotlight.first { $0.mood == mood }?.featured ?? []
        let featured = order.compactMap { motif in served.first { $0.motif == motif } }
        switch scope {
        case .spotlight:
            return featured.isEmpty ? served : featured
        case .all:
            return served
        }
    }

    /// La portée qu'on montre : celle demandée, sauf si le cadre choisi n'y figure pas — alors tout
    /// le catalogue, pour que le choix en cours reste visible.
    static func scope(showing frameId: String?, people: Int, requested: CallFrameScope,
                      in catalogue: [CallFrameDesign] = CallFrameCatalogue.all,
                      spotlight: [CallFrameSpotlight] = CallFrameCatalogue.spotlight) -> CallFrameScope {
        guard requested == .spotlight, let frameId, let design = CallFrameCatalogue.frame(id: frameId, in: catalogue) else { return requested }
        let visible = moods(forPeople: people, scope: .spotlight, in: catalogue, spotlight: spotlight).contains(design.mood)
            && frames(forPeople: people, mood: design.mood, scope: .spotlight, in: catalogue, spotlight: spotlight).contains { $0.id == CallFrameStyleRule.baseId(of: frameId) }
        return visible ? .spotlight : .all
    }

    /// Ce que « Plus d'ambiances » révélerait pour `n` : des ambiances, ou des cadres, absents de la mise en avant.
    static func hidesFrames(forPeople people: Int,
                            in catalogue: [CallFrameDesign] = CallFrameCatalogue.all,
                            spotlight: [CallFrameSpotlight] = CallFrameCatalogue.spotlight) -> Bool {
        let shown = moods(forPeople: people, scope: .spotlight, in: catalogue, spotlight: spotlight)
            .reduce(0) { $0 + frames(forPeople: people, mood: $1, scope: .spotlight, in: catalogue, spotlight: spotlight).count }
        return shown < CallFrameCatalogue.frames(forPeople: people, in: catalogue).count
    }
}
