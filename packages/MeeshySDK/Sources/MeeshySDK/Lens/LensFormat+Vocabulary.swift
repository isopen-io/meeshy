// GÉNÉRÉ — ne pas éditer; source: packages/shared/types/lens-format.ts
// Régénérer : `cd packages/shared && bun run generate:lens-format`.
// Fraîcheur gardée par packages/shared/__tests__/lens-format-swift.test.ts ;
// comportement gardé par packages/shared/fixtures/lens-v1/vectors.json (vitest ET Swift).

import Foundation

/// Là où une lens se peint : la capture, ou le direct (l'appel).
public enum LensSurface: String, Sendable, CaseIterable {
    case capture = "capture"
    case live = "live"
}

/// Le coût de rendu déclaré par la lens, pour la dégradation par palier.
public enum LensCost: String, Sendable, CaseIterable {
    case light = "light"
    case standard = "standard"
    case rich = "rich"
}

/// Les points nommés du visage ; chaque plateforme les fait correspondre à ses repères.
public enum LensFacePoint: String, Sendable, CaseIterable {
    case topOfHead = "top-of-head"
    case forehead = "forehead"
    case leftEyebrow = "left-eyebrow"
    case rightEyebrow = "right-eyebrow"
    case leftEye = "left-eye"
    case rightEye = "right-eye"
    case noseTip = "nose-tip"
    case mouth = "mouth"
    case chin = "chin"
    case leftCheek = "left-cheek"
    case rightCheek = "right-cheek"
    case leftEar = "left-ear"
    case rightEar = "right-ear"
}

/// Les préréglages de particules.
public enum LensParticlePreset: String, Sendable, CaseIterable {
    case sparkles = "sparkles"
    case confetti = "confetti"
    case hearts = "hearts"
    case stars = "stars"
    case snow = "snow"
    case petals = "petals"
    case bubbles = "bubbles"
    case fireflies = "fireflies"
}

/// La densité des particules.
public enum LensDensity: String, Sendable, CaseIterable {
    case low = "low"
    case mid = "mid"
    case high = "high"
}

/// Ce qui déclenche une action.
public enum LensTriggerEvent: String, Sendable, CaseIterable {
    case onTap = "onTap"
    case onSmile = "onSmile"
    case onMouthOpen = "onMouthOpen"
    case onBrowRaise = "onBrowRaise"
    case onBlink = "onBlink"
    case onTime = "onTime"
    case onSpeaking = "onSpeaking"
}

/// Ce qu'un déclencheur fait à sa couche cible.
public enum LensTriggerAction: String, Sendable, CaseIterable {
    case show = "show"
    case hide = "hide"
    case burst = "burst"
    case play = "play"
    case stop = "stop"
}

/// Les polices des cadres : une liste fermée, jamais téléchargée par une lens.
public enum LensFont: String, Sendable, CaseIterable {
    case manrope = "Manrope"
    case cinzel = "Cinzel"
    case cinzelDecorative = "Cinzel Decorative"
    case cormorantGaramond = "Cormorant Garamond"
    case fraunces = "Fraunces"
    case caveat = "Caveat"
}

extension LensFormat {
    public static let schemaVersion = 1
    public static let maxLayers = 12
    public static let maxDeclaredLayers = 32
    public static let maxTriggers = 8
    public static let maxDeclaredTriggers = 24
    public static let maxNameLength = 80
    public static let maxTextLength = 80
    public static let maxAuthorLength = 80
    public static let maxCountries = 50
    public static let maxCommunities = 20
    public static let maxHidden = 12
    public static let maxDepth = 16
    public static let maxIdLength = 24
    /// Les sept langues du Prisme ; le français est la langue de repli.
    public static let languages: [String] = ["fr", "en", "es", "pt", "de", "it", "ar"]
    /// Les cinq primitives de la v1.
    public static let layerKinds: [String] = ["lut", "frame", "sticker", "text", "particles"]
    /// Les deux ancres : l'écran, le visage.
    public static let anchorTypes: [String] = ["screen", "face"]
    /// Les clés qu'aucun niveau d'un document v1 ne porte.
    static let forbiddenKeys: [String] = ["shader", "shaders", "script", "scripts", "url", "urls", "href", "endpoint", "network", "model3d", "mesh", "scene3d"]
    /// Les genres de couche refusés (et non ignorés).
    static let forbiddenLayerKinds: [String] = ["shader", "script", "model3d", "mesh", "scene3d", "3d", "network"]
    /// Les schémas d'URL qui s'écrivent sans « :// ».
    static let bareUrlSchemes: [String] = ["data:", "javascript:", "blob:", "file:"]
    static let fractionRange: ClosedRange<Double> = 0...1
    static let offsetRange: ClosedRange<Double> = -1...1
    static let stickerSizeRange: ClosedRange<Double> = 0.02...2
    static let rotationRange: ClosedRange<Double> = -180...180
    static let textSizeRange: ClosedRange<Double> = 0.02...0.3
    static let delayRange: ClosedRange<Double> = 0...60
    static let patterns = (
        id: #"\A[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\z"#,
        asset: #"\A[0-9a-f]{16}\.(?:webp|png|json)\z"#,
        motif: #"\A[a-z-]+\.[a-z0-9-]+\z"#,
        color: #"\A#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?\z"#,
        country: #"\A[A-Z]{2}\z"#,
        community: #"\A[0-9a-f]{24}\z"#
    )
}
