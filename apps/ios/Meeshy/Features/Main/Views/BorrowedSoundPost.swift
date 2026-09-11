import Foundation
import MeeshySDK

// Sorti de `FeedView+Attachments.swift` avec la feuille (#6040), mais dans son
// PROPRE fichier et non avec elle : c'est le seul des trois types qui serve les
// DEUX surfaces — `FeedView.publishBorrowedSoundPost` (l'extension) et
// `FeedComposerSheet.publishBorrowedSoundFromSheet` (la feuille). Le ranger
// chez l'une en ferait la propriété de celle-là.

// MARK: - Borrowed sound post building

/// Construction PURE d'un post/réel « son emprunté seul », partagée par les
/// deux surfaces de publication (`FeedView.publishBorrowedSoundPost` et
/// `FeedComposerSheet.publishBorrowedSoundFromSheet`).
enum BorrowedSoundPost {
    /// Blob `storyEffects` portant l'unique piste empruntée — exactement la
    /// forme produite par `StoryComposerViewModel.addBorrowedSound` (`soundId`
    /// + `mediaURL` serveur, `postMediaId` vide), pour que lecteur, export et
    /// capture serveur (usage, crédit) suivent le même chemin.
    static func effects(for sound: APISound) -> StoryEffects {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(
                postMediaId: "",
                placement: "overlay",
                x: 0.5,
                y: 0.65,
                volume: 1.0,
                waveformSamples: sound.waveform,
                isBackground: true,
                duration: sound.durationSeconds.map { Float($0) },
                name: sound.hasAuthoredTitle ? sound.title : nil,
                mediaURL: sound.fileUrl,
                soundId: sound.id,
                soundAuthorUsername: sound.uploader?.username
            ),
        ]
        return effects
    }

    /// Un son ≥ 3 s qualifie un RÉEL (`ReelComposition`, miroir de la règle
    /// gateway étendue aux sons empruntés) ; `forcePlainPost` reste respecté.
    static func type(for sound: APISound, forcePlainPost: Bool) -> String {
        let qualifiesAsReel = (sound.durationMs ?? 0) >= ReelComposition.minQualifyingDurationMs
        return (!forcePlainPost && qualifiesAsReel)
            ? PostType.reel.rawValue
            : PostType.post.rawValue
    }
}
