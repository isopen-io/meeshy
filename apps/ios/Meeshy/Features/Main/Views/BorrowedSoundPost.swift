import Foundation
import MeeshySDK

// MARK: - Borrowed sound post building

/// Construction PURE d'un post/réel « son emprunté seul »
/// (`FeedView.publishBorrowedSoundPost`).
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
                soundAuthorUsername: sound.uploader?.username,
                soundCreatedAt: StoryAudioPlayerObject.soundCreatedAtStamp(sound.createdAt)
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
