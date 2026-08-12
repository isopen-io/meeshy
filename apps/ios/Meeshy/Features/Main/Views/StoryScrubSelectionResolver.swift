import SwiftUI

/// Espace de coordonnées commun du système scrub du story viewer : posé sur le
/// ZStack racine du canvas, il aligne les cadres publiés par les tuiles des
/// barres, la position du doigt du DragGesture et le rendu du vol.
nonisolated enum StoryScrubSpace {
    static let name = "storyViewerScrubSpace"
}

/// Ce que le relâchement du doigt en fin de scrub résout.
nonisolated enum StoryScrubRelease: Equatable {
    /// Relâché sur une tuile — la sélectionner.
    case select(index: Int)
    /// Relâché sur la tuile « + » — ouvrir le picker complet.
    case expand
    /// Relâché hors de toute tuile — la barre reste ouverte en mode posé.
    case keepOpen
}

/// Hit-testing PUR des barres scrubbables (réactions, langues) : les tuiles
/// publient leurs cadres dans `StoryScrubSpace` ; la position du doigt est
/// d'abord matchée exactement, puis dans une bande de tolérance verticale pour
/// qu'une petite dérive au-dessus/au-dessous de la barre ne perde jamais le
/// survol. En dernier recours, une position tombant dans l'espace horizontal
/// entre deux tuiles (6pt sur cette barre, les cadres étant publiés sur le
/// glyphe du Text) mais toujours dans l'emprise globale de la barre et la
/// bande de tolérance verticale d'une tuile résout à la tuile la plus proche
/// par centre X — sans quoi un drag traversant un interstice clignotait
/// survol -> nil -> survol (double haptique, tuile qui rebondit) et un
/// relâchement dans l'interstice avalait la sélection. Un point hors de
/// l'emprise de la barre reste sans tuile. Pur et sans effet de bord — testé
/// isolément (pattern StoryGestureDecisions).
nonisolated struct StoryScrubSelectionResolver {

    static func hoveredIndex(
        tileFrames: [Int: CGRect],
        point: CGPoint,
        verticalTolerance: CGFloat
    ) -> Int? {
        guard !tileFrames.isEmpty else { return nil }
        if let exact = tileFrames.first(where: { $0.value.contains(point) })?.key {
            return exact
        }
        if let strict = tileFrames
            .filter({ _, frame in
                point.x >= frame.minX && point.x < frame.maxX
                    && point.y >= frame.minY - verticalTolerance
                    && point.y < frame.maxY + verticalTolerance
            })
            .min(by: { abs(point.y - $0.value.midY) < abs(point.y - $1.value.midY) })?
            .key {
            return strict
        }

        let footprintMinX = tileFrames.values.map(\.minX).min() ?? 0
        let footprintMaxX = tileFrames.values.map(\.maxX).max() ?? 0
        guard point.x >= footprintMinX && point.x < footprintMaxX else { return nil }

        return tileFrames
            .filter { _, frame in
                point.y >= frame.minY - verticalTolerance && point.y < frame.maxY + verticalTolerance
            }
            .min { abs(point.x - $0.value.midX) < abs(point.x - $1.value.midX) }?
            .key
    }

    /// La tuile « + » porte l'index `tileCount` (juste après la dernière tuile).
    static func release(hoveredIndex: Int?, tileCount: Int) -> StoryScrubRelease {
        guard let hoveredIndex else { return .keepOpen }
        if hoveredIndex == tileCount { return .expand }
        guard (0..<tileCount).contains(hoveredIndex) else { return .keepOpen }
        return .select(index: hoveredIndex)
    }
}

/// Cadre du bouton cœur dans `StoryScrubSpace` — cible du vol de réaction.
/// Publié par le bouton (Sidebar), lu par le viewer pour l'overlay de vol.
nonisolated struct StoryHeartFrameKey: PreferenceKey {
    nonisolated static let defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        if next != .zero { value = next }
    }
}
