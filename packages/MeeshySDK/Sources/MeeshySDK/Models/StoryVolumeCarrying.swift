import CoreGraphics
import Foundation

// MARK: - Mute d'auteur un-bouton (piste vidéo / audio)

/// Piste dont le volume d'auteur est PERSISTÉ dans le modèle et peut être
/// coupée d'un seul bouton.
///
/// Convention unique sur toute la chaîne (composer, timeline, previewer,
/// reader, export) : **`volume == 0` EST l'état muet persistant** — aucun
/// booléen séparé (règle CLAUDE.md « no redundant boolean »). Le mémento ne
/// sert qu'à restaurer le niveau précédent à l'unmute ; son invariant est
/// `mutedVolumeMemento != nil ⟹ volume == 0`.
public protocol StoryVolumeCarrying {
    var volume: Float { get set }
    var mutedVolumeMemento: Float? { get set }
}

extension StoryVolumeCarrying {
    /// `true` quand l'AUTEUR a coupé la piste (volume nul persistant).
    public var isMuted: Bool { volume <= 0 }

    /// Écrit `volume` en maintenant l'invariant du mémento : passer à 0 depuis
    /// un niveau audible mémorise ce niveau ; tout niveau audible efface le
    /// mémento (le réglage manuel prime sur l'historique de mute).
    public mutating func setVolumePreservingMuteMemento(_ newVolume: Float) {
        let clamped = max(0, newVolume)
        if clamped <= 0 {
            if volume > 0 { mutedVolumeMemento = volume }
        } else {
            mutedVolumeMemento = nil
        }
        volume = clamped
    }

    /// Toggle un-bouton : mute → `volume = 0` (niveau mémorisé) ; unmute →
    /// restaure le mémento, `1.0` en dernier recours (piste créée muette ou
    /// draft antérieur au mémento).
    public mutating func toggleMute() {
        if isMuted {
            let restored = mutedVolumeMemento ?? 1.0
            setVolumePreservingMuteMemento(restored > 0 ? restored : 1.0)
        } else {
            setVolumePreservingMuteMemento(0)
        }
    }
}

extension StoryMediaObject: StoryVolumeCarrying {}

extension StoryAudioPlayerObject: StoryVolumeCarrying {}
