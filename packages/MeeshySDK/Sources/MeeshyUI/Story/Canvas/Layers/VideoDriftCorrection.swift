import CoreMedia

/// Correction de dérive d'une vidéo de scène pendant la lecture (#9702).
///
/// Le calage sur la timeline n'avait lieu qu'au démarrage et à la reprise :
/// une vidéo qui prenait du retard en cours de route (stall réseau d'une vidéo
/// non primaire, décodage en retard) ne revenait jamais sur l'audio. Le canvas
/// la mesure maintenant toutes les ~0,5 s, et ne la recale qu'au-delà du seuil
/// — en deçà, un seek coûterait plus (hoquet) qu'il ne rattraperait.
nonisolated enum VideoDriftCorrection {

    /// Cible du recalage, ou `nil` si la vidéo est assez proche de la timeline.
    static func driftCorrection(expected: Double, actual: Double, threshold: Double) -> CMTime? {
        guard expected.isFinite, actual.isFinite, threshold.isFinite else { return nil }
        guard abs(actual - expected) > threshold else { return nil }
        return CMTime(seconds: max(0, expected), preferredTimescale: 600)
    }
}
