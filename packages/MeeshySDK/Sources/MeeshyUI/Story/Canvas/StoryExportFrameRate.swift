import CoreMedia
import Foundation

/// Débit unique du pipeline d'export de story.
///
/// Les trois étages qui composent le MP4 livré — le bake
/// (`StoryExporter.export`), le préambule de marque
/// (`StoryExportIntro.prepend`) et la carte de fin (`StoryExportOutro.append`)
/// — DOIVENT partager cette valeur.
///
/// Historique : le bake portait un master à 60 fps là où les deux passes de
/// marque ré-encodaient à 30. Comme elles s'appliquent APRÈS lui et
/// ré-échantillonnent l'intégralité de la story, une frame sur deux rendue par
/// l'étage le plus coûteux du pipeline — le compositor custom, qui repasse par
/// `StoryRenderer` et une rasterisation CPU plein cadre à chaque frame — était
/// encodée puis jetée. Le fichier livré n'a jamais dépassé 30 fps.
///
/// Une constante unique plutôt que trois littéraux : la divergence précédente
/// tenait précisément à ce que rien ne reliait les trois sites entre eux.
/// `nonisolated` sur le TYPE : `MeeshyUI` compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, or ces constantes sont lues
/// depuis le contexte async non-isolé de `StoryExporter.export` et depuis les
/// bundles de tests, qui eux sont `nonisolated`.
public nonisolated enum StoryExportFrameRate {
    /// Images par seconde du MP4 livré.
    public static let fps: Double = 30

    /// La même cadence exprimée pour `AVMutableVideoComposition.frameDuration`.
    public static let frameDuration = CMTime(value: 1, timescale: 30)
}
