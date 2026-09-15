import Foundation
import AVFoundation
import MeeshySDK

/// **La fenêtre de lecture d'un clip audio, pour les DEUX moteurs de MeeshyUI.**
///
/// `AudioMixer` (composition) et `ReaderAudioMixer` (lecture) posent la même
/// question à deux endroits : *quelles frames d'un fichier faut-il rendre,
/// sachant que le clip est rogné à `bounds` et que la timeline est déjà entrée
/// de `elapsedInClip` secondes dans ce clip ?* Chacun l'écrivait chez lui — et
/// un seul des deux savait entrer en cours de piste, ce qui rejouait le fond
/// sonore depuis zéro sous une vidéo déjà à `t` (#6580).
///
/// La loi vit donc ici, une fois. Même motif que `hostTime(forDelaySeconds:)`,
/// centralisé après qu'une divergence eut débordé sur les timebases Intel.
///
/// `nil` en sortie ne veut PAS dire la même chose pour les deux appelants, et
/// c'est volontaire — c'est le contrat de chacun, pas la loi, qui en décide :
/// - `elapsedInClip == 0` ⇒ « rien à fenêtrer » : le lecteur retombe sur
///   `scheduleFile` (la source entière, le comportement d'aujourd'hui) ;
/// - `elapsedInClip > 0` ⇒ « l'ouverture est APRÈS la fin du clip » : on ne
///   planifie RIEN. Rejouer le fichier depuis zéro serait pire que le silence.
///
/// Pure et statique : éprouvable sans `AVAudioEngine` ni fichier réel.
enum TimelineAudioWindow {

    /// Convertit (fenêtre de rognage, écoulé DANS le clip) en position/longueur
    /// de frames pour `AVAudioPlayerNode.scheduleSegment`.
    ///
    /// - origine (secondes) : `(bounds?.start ?? 0) + max(0, elapsedInClip)`
    /// - fin (secondes)     : `bounds?.end ?? fileLength / sampleRate`
    ///
    /// À `elapsedInClip == 0` la fonction rend EXACTEMENT ce que le lecteur
    /// rendait avant #6580, bit à bit — `bounds == nil` compris, qui reste
    /// `nil` pour que `scheduleFile` garde le chemin nominal.
    static func segment(bounds: MediaTrimBounds?,
                        elapsedInClip: Double,
                        sampleRate: Double,
                        fileLength: AVAudioFramePosition)
    -> (startingFrame: AVAudioFramePosition, frameCount: AVAudioFrameCount)? {
        guard sampleRate.isFinite, sampleRate > 0,
              fileLength > 0,
              elapsedInClip.isFinite
        else { return nil }
        if let bounds {
            guard bounds.start.isFinite, bounds.end.isFinite,
                  bounds.start >= 0, bounds.end > bounds.start
            else { return nil }
        } else {
            // Aucun rognage déclaré ET aucun décalage : rien à fenêtrer.
            guard elapsedInClip > 0 else { return nil }
        }
        let originSeconds = (bounds?.start ?? 0) + max(0, elapsedInClip)
        let endSeconds = bounds?.end ?? Double(fileLength) / sampleRate
        let startingFrame = AVAudioFramePosition(originSeconds * sampleRate)
        guard startingFrame >= 0, startingFrame < fileLength else { return nil }
        let endFrame = min(fileLength, AVAudioFramePosition(endSeconds * sampleRate))
        guard endFrame > startingFrame else { return nil }
        return (startingFrame, AVAudioFrameCount(endFrame - startingFrame))
    }
}
