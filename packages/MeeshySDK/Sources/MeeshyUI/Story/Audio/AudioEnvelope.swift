import Foundation

/// **L'enveloppe de volume d'un clip ENTRÉ en cours de piste (#6580).**
///
/// La position a suivi l'ouverture ; le volume, lui, était resté à zéro.
/// `TimelineAudioWindow` fait entrer un clip à `elapsedInClip` dans sa source,
/// et deux rampes calculées pour un départ à ZÉRO se posaient par-dessus :
///
/// - le déclencheur du fade-in est PASSÉ ⇒ `delaySeconds` clampe à `0` et la
///   minuterie tire à l'ouverture, rejouant la montée DEPUIS LE SILENCE — un
///   clip entré à mi-course redevenait inaudible pendant toute la durée du
///   fade ;
/// - passé le déclencheur du fade-OUT, les DEUX rampes tirent à l'ouverture et
///   se percutent sur le même `node.volume`, chacune écrivant ses pas à 30 Hz.
///
/// > **« Qu'est-ce qui part À CÔTÉ de ce que je viens de corriger ? »** La
/// > position est ce qu'on regarde quand on fait entrer un clip en cours de
/// > piste ; l'amplitude voyage avec elle, dans le même objet, et ne compose
/// > aucune frame — elle n'apparaît donc dans aucune recherche sur la fenêtre.
///
/// Pure et statique : éprouvable sans `AVAudioEngine`, sans minuterie et sans
/// fichier. Les offsets sont exprimés DEPUIS LE DÉBUT DU CLIP — la même
/// référence que `Entry.startTime`, pour que l'appelant n'ait qu'une addition
/// à faire pour retrouver son heure hôte.
nonisolated struct AudioEnvelope: Equatable, Sendable {

    /// Une rampe de volume à poser.
    struct Ramp: Equatable {
        let from: Float
        let to: Float
        /// Offset (secondes) depuis le DÉBUT du clip où la rampe démarre.
        /// Une rampe déjà commencée démarre à `elapsedInClip` — c'est-à-dire
        /// maintenant.
        let startOffset: Double
        /// Ce qu'il RESTE à parcourir, jamais la durée nominale du fade.
        let duration: Double
    }

    /// Le volume que le node doit porter À L'INSTANT de la planification.
    /// C'est la moitié que l'ancienne écriture perdait : elle laissait le node
    /// au volume posé par `configure(...)` (zéro dès qu'un fade-in existe).
    let initialVolume: Float
    let fadeIn: Ramp?
    let fadeOut: Ramp?

    /// L'enveloppe d'un clip dont la lecture commence à `elapsedInClip`.
    ///
    /// À `elapsedInClip == 0` elle rend EXACTEMENT ce que le lecteur posait
    /// avant #6580 : montée `0 → target` sur `fadeIn`, descente `target → 0`
    /// ancrée à `clipDuration - fadeOut`, et un volume initial nul dès qu'un
    /// fade-in existe.
    static func plan(elapsedInClip: Double,
                     fadeIn: Double,
                     fadeOut: Double,
                     clipDuration: Double,
                     target: Float) -> AudioEnvelope {
        let entered = sanitized(elapsedInClip)
        let rise = sanitized(fadeIn)
        let fall = sanitized(fadeOut)
        let span = sanitized(clipDuration)

        if fall > 0 {
            let fallStart = max(0, span - fall)
            if entered >= fallStart {
                // Le clip est déjà dans sa descente — ou au-delà. La montée
                // n'a plus rien à dire : la planifier ferait tirer deux rampes
                // à la même milliseconde sur le même `node.volume`.
                let travelled = min(fall, entered - fallStart)
                let remaining = fall - travelled
                let from = target * Float(1 - travelled / fall)
                guard remaining > 0 else {
                    return AudioEnvelope(initialVolume: 0, fadeIn: nil, fadeOut: nil)
                }
                return AudioEnvelope(
                    initialVolume: from,
                    fadeIn: nil,
                    fadeOut: Ramp(from: from, to: 0, startOffset: entered, duration: remaining))
            }
        }

        let rising: Ramp?
        let initial: Float
        if rise > 0, entered < rise {
            // L'amplitude de DÉPART suit la position : un clip entré à la
            // moitié de son fade-in est déjà à la moitié de son volume.
            let from = target * Float(entered / rise)
            rising = Ramp(from: from, to: target, startOffset: entered, duration: rise - entered)
            initial = from
        } else {
            rising = nil
            initial = target
        }

        let falling: Ramp? = fall > 0
            ? Ramp(from: target, to: 0, startOffset: max(0, span - fall), duration: fall)
            : nil

        return AudioEnvelope(initialVolume: initial, fadeIn: rising, fadeOut: falling)
    }

    /// Une seconde non finie ou négative vaut zéro — un `NaN` qui traverse une
    /// comparaison rend `false` partout et produirait une enveloppe muette
    /// plutôt qu'une absence de rampe.
    private static func sanitized(_ seconds: Double) -> Double {
        guard seconds.isFinite, seconds > 0 else { return 0 }
        return seconds
    }
}
