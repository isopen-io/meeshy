import CoreGraphics

/// Traduit un dépôt `Plan2DView.onReorder(id, toIndex)` (D2, gelé — l'index
/// est une position dans `tracks`, TOUS PLANS CONFONDUS, jamais un z relatif
/// à un plan) en un nouveau z ET le plan que la piste rejoint. PUR : ne
/// connaît ni `TimelineViewModel` ni le modèle — l'appelant (D3) décide
/// ensuite QUELLE méthode appeler par famille (`setClipTransform` pour le z,
/// `setClipBackground` pour le plan — cf. doc-comment du site d'appel pour
/// les familles que le ViewModel ne pilote pas encore, sticker et audio).
public nonisolated enum Plan2DReorderResolver {

    public struct Outcome: Equatable {
        public let newZ: Int
        public let newPlane: TrackPlane

        public init(newZ: Int, newPlane: TrackPlane) {
            self.newZ = newZ
            self.newPlane = newPlane
        }
    }

    /// `nil` : identifiant introuvable, une seule piste (aucun voisin), ou
    /// dépôt SANS EFFET (déjà à cette position) — un dépôt sans effet ne doit
    /// déclencher aucune mutation.
    public static func resolve(tracks: [Plan2DTrack], droppedTrackId: String, toIndex: Int) -> Outcome? {
        guard let fromIndex = tracks.firstIndex(where: { $0.id == droppedTrackId }) else { return nil }
        guard tracks.count > 1 else { return nil }
        let clampedIndex = min(max(0, toIndex), tracks.count - 1)
        guard clampedIndex != fromIndex else { return nil }

        let neighbor = tracks[clampedIndex]
        let movedDown = clampedIndex > fromIndex
        // Descendue dans la liste : se glisse juste SOUS le voisin qu'elle a
        // rejoint. Montée : juste AU-DESSUS — même convention que `stacked()`
        // (`Plan2DLayout`, D1) : z décroissant = position croissante à l'écran.
        let newZ = movedDown ? neighbor.z - 1 : neighbor.z + 1
        return Outcome(newZ: newZ, newPlane: neighbor.plane)
    }
}
