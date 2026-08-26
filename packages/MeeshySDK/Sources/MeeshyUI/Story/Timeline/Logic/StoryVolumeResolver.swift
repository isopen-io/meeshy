//
// StoryVolumeResolver.swift
// MeeshyUI / Story / Timeline / Logic
//
// Source de vérité UNIQUE du volume d'un clip à un instant donné, partagée par
// la lecture (tick du CADisplayLink), l'export (AVAudioMix) et la preview
// timeline. Pur : aucune dépendance UIKit / SwiftUI.
//
// Spec: docs/superpowers/specs/2026-07-28-story-clip-volume-automation-design.md
//

import Foundation
import MeeshySDK

/// Constantes de volume partagées par toute la chaîne story.
///
/// `nonisolated` porté par le TYPE : sous isolation `@MainActor` par défaut,
/// une annotation méthode par méthode ne suffirait pas aux usages en contexte
/// non isolé (export hors main thread).
public nonisolated enum StoryVolume {

    /// Plafond de gain autorisé. `1.0` = niveau nominal du fichier ; au-delà,
    /// l'auteur amplifie volontairement, quitte à saturer.
    ///
    /// DOIT rester égal au `max(2)` du schéma Zod de la gateway
    /// (`services/gateway/src/routes/posts/types.ts`) : une divergence ferait
    /// rejeter la publication en 400. Ramener ce plafond à `1.0` un jour se
    /// fait ici, plus le miroir côté gateway.
    public static let maxGain: Float = 2.0

    /// Facteur appliqué à la piste audio d'une vidéo tant qu'un audio de fond
    /// joue sur la même slide. Multiplicateur d'affichage : jamais écrit dans
    /// le modèle, donc réversible et applicable aux stories déjà publiées.
    public static let duckingFactor: Float = 0.25
}

/// Résout le volume d'un clip à un instant donné.
public nonisolated enum StoryVolumeResolver {

    /// Volume effectif du clip à `time`, exprimé en fraction du niveau nominal.
    ///
    /// - `base` : volume statique du clip (`StoryMediaObject.volume` /
    ///   `StoryAudioPlayerObject.volume`).
    /// - `keyframes` : keyframes du clip, tous canaux confondus. Seuls ceux
    ///   portant un `volume` comptent ici.
    /// - `time` : position du playhead **relative au `startTime` du clip** —
    ///   c'est la convention déjà appliquée aux autres canaux par
    ///   `StoryRenderer`.
    ///
    /// Retourne `base` quand aucun point de volume n'existe, ou quand le
    /// playhead précède le premier : sans ce gardien, l'ouverture d'une story
    /// sauterait d'un coup à la valeur du premier point.
    public static func effectiveVolume(base: Float,
                                       keyframes: [StoryKeyframe]?,
                                       at time: Float) -> Float {
        // Appelé par clip par tick de display-link : ne trie que si l'ordre
        // d'auteur n'est pas déjà chronologique (contrôle lazy sans allocation).
        let raw = (keyframes ?? [])
            .compactMap { kf -> (time: Float, value: Float, easing: StoryEasing)? in
                guard let v = kf.volume else { return nil }
                return (kf.time, v, kf.easing ?? .linear)
            }
        let points = zip(raw, raw.dropFirst()).allSatisfy({ $0.time <= $1.time })
            ? raw
            : raw.sorted { $0.time < $1.time }

        guard let first = points.first else { return clamp(base) }
        guard time >= first.time else { return clamp(base) }
        guard let value = KeyframeInterpolator.interpolate(keyframes: points, at: time) else {
            return clamp(base)
        }
        return clamp(value)
    }

    /// Applique l'atténuation automatique par-dessus un volume déjà résolu.
    ///
    /// Séparé de `effectiveVolume` à dessein : le ducking dépend du contexte de
    /// la slide (y a-t-il un audio de fond ? la vidéo a-t-elle du son ?), pas
    /// du clip seul, et ne doit jamais contaminer la valeur persistée.
    public static func ducked(_ volume: Float, isDucking: Bool) -> Float {
        isDucking ? clamp(volume * StoryVolume.duckingFactor) : volume
    }

    /// `true` quand l'atténuation s'applique à CE clip.
    ///
    /// Le contexte de la slide ne suffit pas : l'auteur peut la couper clip par
    /// clip (`StoryMediaObject.isDuckingDisabled`). Un dialogue filmé est le cas
    /// qui l'exige — c'est la musique qui doit passer dessous, pas la voix.
    ///
    /// `nil` vaut « atténuation active » : aucune story publiée ne porte le
    /// champ, et lire son absence comme une désactivation annulerait le
    /// bénéfice rétroactif que le ducking tire d'être un simple multiplicateur.
    public static func isDucking(slideDucks: Bool, isDuckingDisabled: Bool?) -> Bool {
        slideDucks && !(isDuckingDisabled ?? false)
    }

    private static func clamp(_ v: Float) -> Float {
        min(StoryVolume.maxGain, max(0, v))
    }
}
