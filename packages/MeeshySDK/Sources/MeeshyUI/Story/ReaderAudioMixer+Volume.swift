import Foundation
import AVFoundation
import os
import MeeshySDK

@MainActor
extension ReaderAudioMixer {
    // MARK: - Volume / mute

    public func setVolume(_ volume: Float, for audioId: String) {
        // Plafond partagé : un gain au-delà de 100 % doit survivre jusqu'au
        // chemin d'amplification, le borner ici le rendrait inaudible.
        let clamped = max(0, min(StoryVolume.maxGain, volume))
        guard var entry = entries[audioId] else { return }
        entry.targetVolume = clamped
        entries[audioId] = entry
        entry.node.volume = effectiveVolume(for: entry)
    }

    public func setMute(_ muted: Bool) {
        isMuted = muted
        for entry in entries.values {
            entry.node.volume = effectiveVolume(for: entry)
        }
        if let bg = backgroundEntry {
            bg.player.volume = muted ? 0 : bg.targetVolume
        }
    }

    /// Volume courant du clip de fond, indépendant du mute global.
    ///
    /// Le mixer n'exposait que `setVolume(_:for:)`, réservé aux clips
    /// d'avant-plan indexés par id : le slot de fond, unique et sans id
    /// exposé, restait figé sur la valeur posée à `configureBackground`.
    /// L'automation de volume a besoin de le piloter à chaque tick.
    public func setBackgroundVolume(_ volume: Float) {
        guard var bg = backgroundEntry else { return }
        let clamped = min(StoryVolume.maxGain, max(0, volume))
        guard bg.targetVolume != clamped else { return }
        bg.targetVolume = clamped
        backgroundEntry = bg
        bg.player.volume = isMuted ? 0 : clamped
    }

    /// Mute / unmute a single foreground clip without touching the global
    /// `isMuted` flag (used by the per-chip tap action in the reader). The
    /// background slot is not exposed here — the bg has no dedicated chip.
    public func setMute(_ muted: Bool, for audioId: String) {
        guard var entry = entries[audioId] else { return }
        entry.isUserMuted = muted
        entries[audioId] = entry
        entry.node.volume = effectiveVolume(for: entry)
    }

    public func isMuted(audioId: String) -> Bool {
        entries[audioId]?.isUserMuted ?? false
    }

    /// Volume CIBLE d'un clip d'avant-plan tel que le mixer le tient (avant
    /// mute global / per-piste). Miroir de `AudioMixer.intendedVolume(for:)` —
    /// seam d'observation : c'est ce qui permet de prouver qu'un mute d'auteur
    /// (`volume = 0` dans le modèle) atteint réellement le moteur.
    public func intendedVolume(for audioId: String) -> Float? {
        entries[audioId]?.targetVolume
    }

    /// Volume cible du slot de fond (nil si aucun fond configuré).
    public func intendedBackgroundVolume() -> Float? {
        backgroundEntry?.targetVolume
    }

    /// Volume RÉELLEMENT porté par le node d'un clip — distinct de
    /// `intendedVolume(for:)`, qui rend la CIBLE. Seam d'observation de
    /// l'enveloppe : c'est lui qui prouve qu'un clip entré en cours de piste
    /// n'est pas rendu muet par une montée rejouée depuis zéro.
    func appliedVolume(for audioId: String) -> Float? {
        entries[audioId]?.node.volume
    }

    func effectiveVolume(for entry: Entry) -> Float {
        (isMuted || entry.isUserMuted) ? 0 : entry.targetVolume
    }
}
