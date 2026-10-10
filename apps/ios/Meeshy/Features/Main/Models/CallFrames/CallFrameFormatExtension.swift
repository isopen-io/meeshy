import Foundation
import MeeshySDK

/// **L'EXTENSION DU FORMAT DES CADRES** (#9197, doc 06 § 3, étape 3.1) — le miroir Swift des clés
/// ajoutées à `apps/web/src/lib/calls/frames/frame-spec.ts` pour les frames en direct et les packs.
/// Toutes FACULTATIVES : `CallFrameCatalogue+Generated.swift` ne les écrit que lorsqu'un cadre les
/// déclare, et un cadre qui ne les porte pas se rend comme avant. `CallFrameRenderer` les reçoit et
/// ignore ce qu'il ne dessine pas encore (looks, mouvement, scène, déclencheurs, éléments libres).
/// Les valeurs brutes sont celles du JSON ; la parité est gardée par
/// `packages/shared/__tests__/call-capture-frames-swift.test.ts`.

/// La bibliothèque de looks Meeshy (spec 02 § 1.2) : le cadre choisit et règle, il n'écrit pas de shader.
nonisolated enum CallFrameSlotLookKind: String, CaseIterable, Equatable, Sendable {
    case instantFilm = "instant-film"
    case filmGrain = "film-grain"
    case oilPaint = "oil-paint"
    case scratchFilm = "scratch-film"
    case halftone
    case vignette
    case bloom
}

/// Un look et ses deux réglages : l'intensité et la taille (grain, touche, trame).
nonisolated struct CallFrameSlotLook: Equatable, Sendable {
    let id: CallFrameSlotLookKind
    let amount: Double?
    let size: Double?
}

nonisolated enum CallFrameOrnamentMotion: String, CaseIterable, Equatable, Sendable {
    case still
    case loop
    case onAppear
}

/// Les formes d'un texte (spec 01 § 2), chacune réservée à SA source.
nonisolated enum CallFrameTextForm: String, CaseIterable, Equatable, Sendable {
    case digital
    case digitalSeconds = "digital-seconds"
    case analog
    case words
    case moment
    case short
    case long
    case dayMonth = "day-month"
    case calendarTile = "calendar-tile"
    case roman
    case inline
    case stacked
    case stamp
    case city
    case cityCountry = "city-country"
    case neighborhood
    case street
    case address
    case countryFlag = "country-flag"
    case coordinates
    case pin
    case mapSilhouette = "map-silhouette"
    case name
    case lineArt = "line-art"
    case badge
    case skyline
    case emoji
    case word
    case colorAura = "color-aura"
    case particles
    case sticker
}

/// Les zones d'un élément libre : le pourtour de la zone des visages, jamais son centre.
nonisolated enum CallFrameElementPlace: String, CaseIterable, Equatable, Sendable {
    case top
    case bottom
    case topLeft = "top-left"
    case topRight = "top-right"
    case bottomLeft = "bottom-left"
    case bottomRight = "bottom-right"
    case centerLeft = "center-left"
    case centerRight = "center-right"
}

/// Un texte ou un pictogramme posé librement, au-delà du titre et du sous-titre (6 au plus).
nonisolated struct CallFrameElement: Equatable, Sendable {
    let source: CallFrameTitleSource
    let form: CallFrameTextForm?
    let place: CallFrameElementPlace
    let font: StoryTextStyle
    let color: String
    let size: CallFrameTextSize
    let effect: CallFrameTextEffect?
    let letterCase: CallFrameLetterCase?
}

nonisolated enum CallFrameWatermarkContent: String, CaseIterable, Equatable, Sendable {
    case brand
    case brandHandle = "brand-handle"
}

nonisolated enum CallFrameWatermarkOrientation: String, CaseIterable, Equatable, Sendable {
    case diagonalUp = "diagonal-up"
    case diagonalDown = "diagonal-down"
    case horizontal
    case vertical
    case cross
}

/// Le filigrane des Imager (« Meeshy @pseudo » en quinconce), orientable ; opacité ≤ 0,08 sur la vidéo.
nonisolated struct CallFrameWatermark: Equatable, Sendable {
    let content: CallFrameWatermarkContent
    let orientation: CallFrameWatermarkOrientation
    let opacity: Double
}

nonisolated enum CallFrameSurface: String, CaseIterable, Equatable, Sendable {
    case capture
    case live
}

nonisolated enum CallFrameCost: String, CaseIterable, Equatable, Sendable {
    case light
    case standard
    case rich
}

/// Qui a fait le cadre et quand — dates `AAAA-MM-JJ`, telles que le JSON les porte.
nonisolated struct CallFrameCredits: Equatable, Sendable {
    let author: String
    let createdAt: String
    let updatedAt: String?
}

nonisolated enum CallFrameSceneLayerKind: String, CaseIterable, Equatable, Sendable {
    case image
    case lottie
    case sprite
    case videoLoop = "video-loop"
    case particles
    case light
}

nonisolated enum CallFrameSceneDepth: String, CaseIterable, Equatable, Sendable {
    case back
    case front
    case effects
}

/// Une couche de scène (spec 02 § 1.1) : un fichier du pack (`assets/…`), des particules, ou une lumière.
nonisolated struct CallFrameSceneLayer: Equatable, Sendable {
    let id: String
    let kind: CallFrameSceneLayerKind
    let depth: CallFrameSceneDepth
    let src: String?
    let preset: CallFrameOrnamentKind?
    let color: String?
    let amount: Double?
    let maxParticles: Int?
}

nonisolated enum CallFrameBehaviorTrigger: String, CaseIterable, Equatable, Sendable {
    case onTap
    case onShake
    case onTilt
    case onSmile
    case onEmotion
    case onTime
    case onSpeaking
    case onCallEvent
}

nonisolated enum CallFrameBehaviorAction: String, CaseIterable, Equatable, Sendable {
    case burst
    case calm
    case tint
    case play
    case stop
    case show
    case hide
    case shake
}

/// Ce que précise `when` : l'émotion (`onEmotion`), le moment du jour (`onTime`), l'événement d'appel (`onCallEvent`).
nonisolated enum CallFrameBehaviorCondition: String, CaseIterable, Equatable, Sendable {
    case joy
    case love
    case pride
    case calm
    case surprise
    case nostalgia
    case party
    case gratitude
    case morning
    case day
    case evening
    case night
    case start
    case end
}

/// Un déclencheur et son action, tous deux pris dans des listes fermées.
nonisolated struct CallFrameBehavior: Equatable, Sendable {
    let trigger: CallFrameBehaviorTrigger
    let when: CallFrameBehaviorCondition?
    let target: String?
    let action: CallFrameBehaviorAction
    let duration: Double?
    let color: String?
}

/// Une couche animée remplacée par un fichier fixe du pack.
nonisolated struct CallFrameFallbackStill: Equatable, Sendable {
    let layer: String
    let src: String
}

/// Ce qu'un palier de repli substitue ; le reste (particules divisées, looks réduits) est la règle du moteur.
nonisolated struct CallFrameFallbackTier: Equatable, Sendable {
    let hide: [String]
    let still: [CallFrameFallbackStill]
}

nonisolated struct CallFrameFallbacks: Equatable, Sendable {
    let reduced: CallFrameFallbackTier?
    let minimal: CallFrameFallbackTier?
}
