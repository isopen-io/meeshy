import CoreMedia
import MeeshySDK

// **La vidéo de fond se rend comme l'auteur l'a réglée** (#9136) — coupée à sa
// fenêtre de source, et sans piste audio quand elle est muette. Le lecteur
// honorait déjà les bornes ; l'export lisait le fichier depuis zéro et posait
// un son muet à volume nul, qui partait quand même dans le fichier.

extension StoryExporter {

    /// La fenêtre de la SOURCE que l'export lit — bornes vieillies comprises
    /// (`MediaTrimRule.resolved` rend le fichier entier plutôt qu'un vide).
    nonisolated static func backgroundSourceWindow(_ background: StoryMediaObject,
                                                   assetDuration: CMTime) -> CMTimeRange {
        let bornes = background.trimBounds(sourceDuration: max(0, assetDuration.seconds))
        return CMTimeRange(start: CMTime(seconds: bornes.start, preferredTimescale: 600),
                           duration: CMTime(seconds: bornes.duration, preferredTimescale: 600))
    }

    /// Un fond muet n'a pas de son à porter — sauf si une automation de volume
    /// le fait remonter quelque part dans la scène.
    nonisolated static func backgroundCarriesSound(_ background: StoryMediaObject) -> Bool {
        !background.isMuted || (background.keyframes ?? []).contains { ($0.volume ?? 0) > 0 }
    }
}
