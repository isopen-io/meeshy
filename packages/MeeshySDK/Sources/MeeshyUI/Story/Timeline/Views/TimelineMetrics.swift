import CoreGraphics

/// Constantes de layout partagées par les vues de la timeline.
///
/// `laneHeight` n'existait qu'en LITTÉRAL (52), répété à quatre sites d'appel
/// dans `StoryTimelineView.swift` (le conteneur mono-piste). Extraite ici pour
/// que le plan 2D (`Plan2DView`, D2) et le conteneur historique dessinent des
/// lanes de la MÊME hauteur sans faire dériver deux littéraux indépendants.
public nonisolated enum TimelineMetrics {
    public static let laneHeight: CGFloat = 52
}
