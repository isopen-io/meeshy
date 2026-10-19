import SwiftUI
import MeeshySDK

extension ClipInspector {

    // MARK: - Snapshot

    public struct ClipSnapshot: Equatable, Sendable {
        public enum Kind: String, Sendable, Equatable {
            case video, audio, text, image, sticker
            /// Pastille de LIEU — sa fiche ne porte que la fenêtre et le nom.
            /// Sans ce cas, `TimelineInspectorHost.clipSnapshot` rendait `nil`,
            /// et toute la chaîne du doigt se coupait trois appels plus haut :
            /// pas de fiche ⇒ pas de sélection ⇒ pas de poignées de rognage
            /// (#4840, moitié manquante).
            case place
        }
        public let id: String
        public let displayName: String
        public let kind: Kind
        public let startTime: Float
        public let duration: Float
        public let volume: Float
        public let fadeInDuration: Float
        public let fadeOutDuration: Float
        public let isLooping: Bool
        public let isBackground: Bool
        /// Nom personnalisé de la piste (nil = utilise `displayName` par défaut).
        public let name: String?
        /// Place de la piste dans le PLAN. Le snapshot ne la transportait pas,
        /// si bien que la fiche restituait le temps mais jamais l'espace : on
        /// ne pouvait ni lire ni corriger une position au chiffre près.
        public let transform: ClipTransform
        /// Points d'automation du volume déjà posés sur ce clip.
        public let volumeKeyframes: [VolumePoint]
        /// L'atténuation automatique est coupée sur ce clip.
        public let isDuckingDisabled: Bool
        /// La slide porte un audio de fond. Sans lui, rien n'est atténué : la
        /// bascule d'atténuation serait un contrôle sans effet.
        public let slideHasBackgroundAudio: Bool
        /// `true` quand `timing == nil` au modèle (O4 — le clip est un
        /// FANTÔME, sa fenêtre suit la durée de la slide). `false` = une
        /// fenêtre explicite a été posée (un bord tiré, typiquement) — c'est
        /// alors que « Suivre la slide » (D3, revue totale U9) redevient
        /// pertinente : la sortie de l'état doit être aussi évidente que son
        /// entrée.
        public let isFollowingSlide: Bool

        /// Un point de la courbe de volume, tel que la fiche l'affiche.
        ///
        /// `absoluteTime` est l'instant sur la TIMELINE, pas l'offset dans le
        /// clip : le modèle stocke du relatif, et l'afficher tel quel sur un
        /// clip qui démarre à 5 s annoncerait un instant faux. Même convention
        /// que `KeyframeInspector.KeyframeSnapshot.absoluteTime`.
        public struct VolumePoint: Equatable, Sendable, Identifiable {
            public let id: String
            public let absoluteTime: Float
            public let volume: Float

            public init(id: String, absoluteTime: Float, volume: Float) {
                self.id = id
                self.absoluteTime = absoluteTime
                self.volume = volume
            }
        }

        public init(id: String, displayName: String, kind: Kind,
                    startTime: Float, duration: Float, volume: Float,
                    fadeInDuration: Float, fadeOutDuration: Float,
                    isLooping: Bool, isBackground: Bool,
                    name: String? = nil,
                    transform: ClipTransform = .identity,
                    volumeKeyframes: [VolumePoint] = [],
                    isDuckingDisabled: Bool = false,
                    slideHasBackgroundAudio: Bool = false,
                    isFollowingSlide: Bool = false) {
            self.id = id; self.displayName = displayName; self.kind = kind
            self.startTime = startTime; self.duration = duration
            self.volume = volume
            self.fadeInDuration = fadeInDuration; self.fadeOutDuration = fadeOutDuration
            self.isLooping = isLooping; self.isBackground = isBackground
            self.name = name
            self.transform = transform
            self.volumeKeyframes = volumeKeyframes
            self.isDuckingDisabled = isDuckingDisabled
            self.slideHasBackgroundAudio = slideHasBackgroundAudio
            self.isFollowingSlide = isFollowingSlide
        }
    }
}
