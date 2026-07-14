import CoreGraphics
import Foundation

// MARK: - Story Text Style

public enum StoryTextStyle: String, Codable, CaseIterable, Sendable {
    case bold
    case neon
    case typewriter
    case handwriting
    case classic
    case calligraphy
    case cartoon
    case futuristic
    case fantasy
    case curve
    case tag

    public var displayName: String {
        switch self {
        case .bold: return "Bold"
        case .neon: return "Neon"
        case .typewriter: return "Typewriter"
        case .handwriting: return "Handwriting"
        case .classic: return "Classic"
        case .calligraphy: return "Calligraphie"
        case .cartoon: return "Cartoon"
        case .futuristic: return "Futuriste"
        case .fantasy: return "Fantaisie"
        case .curve: return "Curve"
        case .tag: return "Tag"
        }
    }

    public var fontName: String? {
        switch self {
        case .bold: return nil
        case .neon: return nil
        case .typewriter: return "Courier"
        case .handwriting: return "SnellRoundhand"
        case .classic: return "Georgia"
        case .calligraphy: return "Zapfino"
        case .cartoon: return "ChalkboardSE-Bold"
        case .futuristic: return "Futura-CondensedExtraBold"
        case .fantasy: return "Papyrus"
        case .curve: return "SavoyeLetPlain"
        case .tag: return "MarkerFelt-Wide"
        }
    }

    public var fontWeight: Int {
        switch self {
        case .bold: return 800
        case .neon: return 600
        case .typewriter: return 400
        case .handwriting: return 400
        case .classic: return 500
        case .calligraphy: return 400
        case .cartoon: return 700
        case .futuristic: return 800
        case .fantasy: return 400
        case .curve: return 400
        case .tag: return 700
        }
    }
}

// MARK: - Story Text Weight

/// Independent font-weight override for a `StoryTextObject`. `nil` on the object
/// means "derive the weight from `textStyle`" (legacy behavior); a non-nil value
/// lets the user pick fin / normal / semi-gras / gras regardless of style.
public enum StoryTextWeight: String, Codable, CaseIterable, Sendable {
    case thin       // fin
    case normal     // normal
    case semibold   // semi-gras
    case bold       // gras

    public var displayName: String {
        switch self {
        case .thin: return "Fin"
        case .normal: return "Normal"
        case .semibold: return "Semi"
        case .bold: return "Gras"
        }
    }
}

// MARK: - Story Filter

public enum StoryFilter: String, Codable, CaseIterable, Sendable {
    case vintage
    case bw
    case warm
    case cool
    case dramatic
    case vivid
    case fade
    case chrome

    public var displayName: String {
        switch self {
        case .vintage: return "Vintage"
        case .bw: return "N&B"
        case .warm: return "Chaud"
        case .cool: return "Froid"
        case .dramatic: return "Dramatic"
        case .vivid: return "Vivid"
        case .fade: return "Fade"
        case .chrome: return "Chrome"
        }
    }

    public var ciFilterName: String {
        switch self {
        case .vintage: return "CIPhotoEffectTransfer"
        case .bw: return "CIPhotoEffectMono"
        case .warm: return "CITemperatureAndTint"
        case .cool: return "CITemperatureAndTint"
        case .dramatic: return "CIPhotoEffectProcess"
        case .vivid: return "CIColorControls"
        case .fade: return "CIPhotoEffectFade"
        case .chrome: return "CIPhotoEffectChrome"
        }
    }
}

// MARK: - Story Text Position

public struct StoryTextPosition: Codable, Sendable {
    public var x: CGFloat
    public var y: CGFloat

    public init(x: CGFloat = 0.5, y: CGFloat = 0.5) {
        self.x = x; self.y = y
    }

    public static let center = StoryTextPosition(x: 0.5, y: 0.5)
    public static let top = StoryTextPosition(x: 0.5, y: 0.2)
    public static let bottom = StoryTextPosition(x: 0.5, y: 0.8)
}

// MARK: - Story Voice Transcription

public struct StoryVoiceTranscription: Codable, Sendable {
    public let language: String
    public let content: String

    public init(language: String, content: String) {
        self.language = language
        self.content = content
    }
}

// MARK: - Story Background Audio Entry

public struct StoryBackgroundAudioEntry: Codable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let uploaderName: String?
    public let duration: Int
    public let fileUrl: String
    public let usageCount: Int
    public let isPublic: Bool

    public init(id: String, title: String, uploaderName: String? = nil,
                duration: Int, fileUrl: String, usageCount: Int = 0, isPublic: Bool = true) {
        self.id = id; self.title = title; self.uploaderName = uploaderName
        self.duration = duration; self.fileUrl = fileUrl
        self.usageCount = usageCount; self.isPublic = isPublic
    }
}

// MARK: - Story Translation

public struct StoryTranslation: Codable, Sendable {
    public let language: String
    public let content: String

    public init(language: String, content: String) {
        self.language = language
        self.content = content
    }
}

// MARK: - Story Text Background Style

/// Background style for a `StoryTextObject`.
///
/// Replaces the legacy `textBg: String?` field with a richer surface that can
/// express the glassmorphism material baked into the live composer + export.
/// Legacy `textBg` is preserved on the model for round-trip compatibility: when
/// `backgroundStyle` is `nil` and `textBg` is non-nil, the renderer falls back
/// to `.solid(hex: textBg!)`.
public enum StoryTextBackgroundStyle: Codable, Sendable, Equatable {
    /// No background — text floats directly on the canvas.
    case none
    /// Solid color background (hex). Preferred over the legacy `textBg` field
    /// for new content; the renderer treats both equivalently.
    case solid(hex: String)
    /// Glass material : blurs the canvas region beneath the text bounds at
    /// render time. `radius` is the Gaussian sigma in design pixels (1080×1920
    /// reference), typically 18–32. Wires `StoryBlurFilter` (MPSImageGaussianBlur)
    /// into the render pipeline.
    case glass(radius: Double)

    // MARK: - Codable (tagged union: { type, hex?, radius? })

    private enum CodingKeys: String, CodingKey {
        case type, hex, radius
    }

    private enum Kind: String, Codable {
        case none, solid, glass
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(Kind.self, forKey: .type)
        switch kind {
        case .none:
            self = .none
        case .solid:
            let hex = try c.decode(String.self, forKey: .hex)
            self = .solid(hex: hex)
        case .glass:
            let r = try c.decode(Double.self, forKey: .radius)
            self = .glass(radius: r)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .none:
            try c.encode(Kind.none, forKey: .type)
        case .solid(let hex):
            try c.encode(Kind.solid, forKey: .type)
            try c.encode(hex, forKey: .hex)
        case .glass(let radius):
            try c.encode(Kind.glass, forKey: .type)
            try c.encode(radius, forKey: .radius)
        }
    }
}

// MARK: - Story Text Frame Shape

/// Shape of the framing box drawn behind a `StoryTextObject` when a background
/// (`.solid` / `.glass`) is active. Controls only the corner geometry — the
/// horizontal padding is always ≥ the width of one "o" glyph (see
/// `StoryTextLayer`). `nil` on the object means `.rounded` (legacy default).
public enum StoryTextFrameShape: String, Codable, CaseIterable, Sendable {
    case rounded     // cornerRadius ≈ 15% of height (default)
    case pill        // full capsule (cornerRadius = 50% of height)
    case rectangle   // near-square corners
    case diamond     // losange (path-based)
    case cloud       // bulle de pensée nuage (path-based)
    case speech      // bulle de conversation BD avec queue (path-based)

    public var displayName: String {
        switch self {
        case .rounded: return "Arrondi"
        case .pill: return "Pilule"
        case .rectangle: return "Carré"
        case .diamond: return "Losange"
        case .cloud: return "Nuage"
        case .speech: return "Bulle BD"
        }
    }

    /// Les formes historiques se rendent par `cornerRadius` sur la calque ;
    /// les nouvelles formes passent par un tracé `CGPath` dédié (losange,
    /// nuage, bulle BD). Le renderer et l'export s'appuient sur ce flag pour
    /// choisir le pipeline.
    public var usesCustomPath: Bool {
        switch self {
        case .rounded, .pill, .rectangle: return false
        case .diamond, .cloud, .speech: return true
        }
    }
}

// MARK: - Story Text Object (texte sur canvas)

public struct StoryTextObject: Codable, Identifiable, Sendable {
    public var id: String
    public var text: String              // was: content (RENAMED; legacy "content" accepted by decoder)
    public var x: Double                 // normalisé 0–1
    public var y: Double
    public var scale: Double
    public var rotation: Double          // degrés
    /// Z-order persistent — controle l'ordre de superposition entre composer et reader.
    /// Non-optional: default 0 means "unset / insertion order".
    public var zIndex: Int               // was: Int? (NON-OPTIONAL)
    /// Pivot point for rotation/scale in normalised canvas coords (0..1).
    /// Default: (0.5, 0.5) = centre of the element.
    public var anchor: CGPoint           // NEW; uses CGPoint (x∈0..1, y∈0..1) — NOT UnitPoint (SwiftUI-only)

    // Typography (replace textSize with design-pixel fontSize)
    public var fontSize: Double          // NEW: design pixels (1080-référentiel), default 96 (decoder legacy fallback = 64)
    public var fontFamily: String        // NEW: default "system"

    // Style per-objet (tous optionnels pour backward compat JSON existant)
    public var textStyle: String?        // "bold"|"neon"|"typewriter"|"handwriting"|"classic"
    public var textColor: String?        // hex "FFFFFF"
    public var textAlign: String?        // "left"|"center"|"right"
    /// Legacy solid-color hex background. Preserved for round-trip compat with
    /// stories on disk. New content should populate `backgroundStyle` instead;
    /// the renderer prefers `backgroundStyle` when both are set.
    public var textBg: String?           // hex ou nil (pas de fond)
    /// Rich background style — `.none` / `.solid(hex)` / `.glass(radius)`.
    /// `nil` means "fall back to legacy `textBg`" for backward compat.
    public var backgroundStyle: StoryTextBackgroundStyle?

    /// Independent font-weight override (`StoryTextWeight` rawValue). `nil` ⇒
    /// weight derived from `textStyle` (legacy). Lets the user pick fin / normal
    /// / semi-gras / gras without changing the style family.
    public var fontWeight: String?
    /// Framing box shape (`StoryTextFrameShape` rawValue). Only meaningful when a
    /// background is active. `nil` ⇒ `.rounded` (legacy default).
    public var frameShape: String?

    /// Outline / contour du texte. `borderColor == nil` ⇒ pas de bord
    /// (pas de booléen séparé). Hex "RRGGBB" ou "RRGGBBAA".
    public var borderColor: String?
    /// Épaisseur du contour, en design-pixels (référentiel 1080). `nil` ⇒ défaut 3.0.
    public var borderWidth: Double?

    // Translations (kept)
    public var translations: [String: String]?
    public var sourceLanguage: String?

    // Timeline timing — Double (was Float)
    public var startTime: Double?        // quand le texte apparaît (secondes, défaut 0)
    public var duration: Double?         // was: displayDuration (RENAMED); durée d'affichage (nil = permanent)
    public var fadeIn: Double?           // animation d'entrée (secondes)
    public var fadeOut: Double?          // animation de sortie (secondes)

    /// Lock flag — Patch B.3 : true = composer skips drag/edit/delete (used for repost badge sticker).
    public var isLocked: Bool?
    // Timeline V2 — animation keyframes (position/scale/opacity)
    public var keyframes: [StoryKeyframe]?

    enum CodingKeys: String, CodingKey {
        case id, text, x, y, scale, rotation, zIndex, anchor
        case fontSize, fontFamily
        case textStyle, textColor, textAlign, textBg, backgroundStyle
        case fontWeight, frameShape
        case borderColor, borderWidth
        case translations, sourceLanguage
        case startTime, duration, fadeIn, fadeOut
        case isLocked, keyframes
        // Legacy keys — decoder only
        case content, textSize, displayDuration
    }

    public init(id: String = UUID().uuidString,
                text: String,
                x: Double = 0.5, y: Double = 0.5,
                scale: Double = 1.0, rotation: Double = 0.0,
                zIndex: Int = 0,
                anchor: CGPoint = CGPoint(x: 0.5, y: 0.5),
                fontSize: Double = 96.0,
                fontFamily: String = "system",
                textStyle: String? = "bold",
                textColor: String? = "FFFFFF",
                textAlign: String? = "center",
                textBg: String? = nil,
                backgroundStyle: StoryTextBackgroundStyle? = nil,
                fontWeight: String? = nil,
                frameShape: String? = nil,
                borderColor: String? = nil,
                borderWidth: Double? = nil,
                translations: [String: String]? = nil,
                sourceLanguage: String? = nil,
                startTime: Double? = nil,
                duration: Double? = nil,
                fadeIn: Double? = nil,
                fadeOut: Double? = nil,
                isLocked: Bool? = nil,
                keyframes: [StoryKeyframe]? = nil) {
        self.id = id
        self.text = text
        self.x = x; self.y = y; self.scale = scale; self.rotation = rotation
        self.zIndex = zIndex
        self.anchor = anchor
        self.fontSize = fontSize; self.fontFamily = fontFamily
        self.textStyle = textStyle; self.textColor = textColor
        self.textAlign = textAlign; self.textBg = textBg
        self.backgroundStyle = backgroundStyle
        self.fontWeight = fontWeight; self.frameShape = frameShape
        self.borderColor = borderColor; self.borderWidth = borderWidth
        self.translations = translations
        self.sourceLanguage = sourceLanguage
        self.startTime = startTime; self.duration = duration
        self.fadeIn = fadeIn; self.fadeOut = fadeOut
        self.isLocked = isLocked
        self.keyframes = keyframes
    }

    // MARK: - Custom Codable (backward compat: content→text, textSize→fontSize, displayDuration→duration)

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        // text: prefer new key, fall back to legacy "content"
        if let t = try c.decodeIfPresent(String.self, forKey: .text) {
            text = t
        } else {
            text = try c.decode(String.self, forKey: .content)
        }
        x = try c.decodeIfPresent(Double.self, forKey: .x) ?? 0.5
        y = try c.decodeIfPresent(Double.self, forKey: .y) ?? 0.5
        scale = try c.decodeIfPresent(Double.self, forKey: .scale) ?? 1.0
        rotation = try c.decodeIfPresent(Double.self, forKey: .rotation) ?? 0.0
        zIndex = try c.decodeIfPresent(Int.self, forKey: .zIndex) ?? 0
        // anchor: nested {x,y} container; default (0.5, 0.5) if absent
        if let nested = try? c.nestedContainer(keyedBy: AnchorKeys.self, forKey: .anchor) {
            let ax = try nested.decodeIfPresent(Double.self, forKey: .x) ?? 0.5
            let ay = try nested.decodeIfPresent(Double.self, forKey: .y) ?? 0.5
            anchor = CGPoint(x: ax, y: ay)
        } else {
            anchor = CGPoint(x: 0.5, y: 0.5)
        }
        // fontSize: prefer new key, fall back to legacy textSize
        if let f = try c.decodeIfPresent(Double.self, forKey: .fontSize) {
            fontSize = f
        } else if let legacy = try c.decodeIfPresent(Double.self, forKey: .textSize) {
            fontSize = legacy
        } else {
            fontSize = 64.0
        }
        fontFamily = try c.decodeIfPresent(String.self, forKey: .fontFamily) ?? "system"
        textStyle = try c.decodeIfPresent(String.self, forKey: .textStyle)
        textColor = try c.decodeIfPresent(String.self, forKey: .textColor)
        textAlign = try c.decodeIfPresent(String.self, forKey: .textAlign)
        textBg = try c.decodeIfPresent(String.self, forKey: .textBg)
        backgroundStyle = try c.decodeIfPresent(StoryTextBackgroundStyle.self, forKey: .backgroundStyle)
        fontWeight = try c.decodeIfPresent(String.self, forKey: .fontWeight)
        frameShape = try c.decodeIfPresent(String.self, forKey: .frameShape)
        borderColor = try c.decodeIfPresent(String.self, forKey: .borderColor)
        borderWidth = try c.decodeIfPresent(Double.self, forKey: .borderWidth)
        translations = try c.decodeIfPresent([String: String].self, forKey: .translations)
        sourceLanguage = try c.decodeIfPresent(String.self, forKey: .sourceLanguage)
        startTime = try c.decodeIfPresent(Double.self, forKey: .startTime)
        // duration: prefer new key, fall back to legacy displayDuration
        if let d = try c.decodeIfPresent(Double.self, forKey: .duration) {
            duration = d
        } else if let legacy = try c.decodeIfPresent(Double.self, forKey: .displayDuration) {
            duration = legacy
        } else {
            duration = nil
        }
        fadeIn = try c.decodeIfPresent(Double.self, forKey: .fadeIn)
        fadeOut = try c.decodeIfPresent(Double.self, forKey: .fadeOut)
        isLocked = try c.decodeIfPresent(Bool.self, forKey: .isLocked)
        keyframes = try c.decodeIfPresent([StoryKeyframe].self, forKey: .keyframes)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(text, forKey: .text)
        try c.encode(x, forKey: .x); try c.encode(y, forKey: .y)
        try c.encode(scale, forKey: .scale); try c.encode(rotation, forKey: .rotation)
        try c.encode(zIndex, forKey: .zIndex)
        var anchorC = c.nestedContainer(keyedBy: AnchorKeys.self, forKey: .anchor)
        try anchorC.encode(Double(anchor.x), forKey: .x)
        try anchorC.encode(Double(anchor.y), forKey: .y)
        try c.encode(fontSize, forKey: .fontSize)
        try c.encode(fontFamily, forKey: .fontFamily)
        try c.encodeIfPresent(textStyle, forKey: .textStyle)
        try c.encodeIfPresent(textColor, forKey: .textColor)
        try c.encodeIfPresent(textAlign, forKey: .textAlign)
        try c.encodeIfPresent(textBg, forKey: .textBg)
        try c.encodeIfPresent(backgroundStyle, forKey: .backgroundStyle)
        try c.encodeIfPresent(fontWeight, forKey: .fontWeight)
        try c.encodeIfPresent(frameShape, forKey: .frameShape)
        try c.encodeIfPresent(borderColor, forKey: .borderColor)
        try c.encodeIfPresent(borderWidth, forKey: .borderWidth)
        try c.encodeIfPresent(translations, forKey: .translations)
        try c.encodeIfPresent(sourceLanguage, forKey: .sourceLanguage)
        try c.encodeIfPresent(startTime, forKey: .startTime)
        try c.encodeIfPresent(duration, forKey: .duration)
        try c.encodeIfPresent(fadeIn, forKey: .fadeIn)
        try c.encodeIfPresent(fadeOut, forKey: .fadeOut)
        try c.encodeIfPresent(isLocked, forKey: .isLocked)
        try c.encodeIfPresent(keyframes, forKey: .keyframes)
    }

    private enum AnchorKeys: String, CodingKey { case x, y }

    // MARK: - Computed properties (preserved, non-SwiftUI)

    public var parsedTextStyle: StoryTextStyle {
        guard let raw = textStyle else { return .bold }
        return StoryTextStyle(rawValue: raw) ?? .bold
    }

    /// Independent weight override. `nil` ⇒ derive from `textStyle`.
    public var parsedFontWeight: StoryTextWeight? {
        guard let raw = fontWeight else { return nil }
        return StoryTextWeight(rawValue: raw)
    }

    /// Framing box shape; defaults to `.rounded` when unset.
    public var parsedFrameShape: StoryTextFrameShape {
        guard let raw = frameShape, let shape = StoryTextFrameShape(rawValue: raw) else { return .rounded }
        return shape
    }

    /// Legacy helper — returns design-pixel fontSize.
    public var resolvedSize: Double { fontSize }

    public var hasBg: Bool { textBg != nil || backgroundStyle != nil }

    /// Resolves the effective background style honoring backward compat.
    /// Priority: `backgroundStyle` (new) > `textBg` (legacy) > `.none`.
    public var resolvedBackgroundStyle: StoryTextBackgroundStyle {
        if let s = backgroundStyle { return s }
        if let hex = textBg { return .solid(hex: hex) }
        return .none
    }
}

/// Tolerant language-code matching for the Prisme Linguistique reader chain.
/// `preferredContentLanguages` preserves the original casing of the in-app
/// system/regional/custom codes, while translation keys are ISO 639-1 — so an
/// exact match can miss ("en-US" preferred vs "en" key, "FR" vs "fr"), leaving
/// another user's story text in the AUTHOR's language. These helpers collapse
/// casing + region qualifiers to a base code for a per-language fallback that
/// still honours the chain's priority order.
enum StoryPrismeMatch {
    /// Base language code (lowercased ISO 639-1) for tolerant comparison. Falls
    /// back to a lowercased region-stripped split when the normalizer rejects an
    /// unknown code, so casing/region is still collapsed.
    static func base(_ code: String) -> String {
        if let normalized = MeeshyUser.normalizeLanguageCode(code) { return normalized }
        return code.split(whereSeparator: { $0 == "-" || $0 == "_" })
            .first.map { $0.lowercased() } ?? code.lowercased()
    }
}

extension StoryTextObject {
    /// Resolves the displayable text via the Prisme Linguistique chain.
    /// Falls back to original `text` when no translation matches. Each preferred
    /// language tries an exact key, then a normalized (case/region-insensitive)
    /// match BEFORE moving to the next — so chain priority is preserved.
    public func resolvedText(preferredLanguages: [String]) -> String {
        guard let translations, !preferredLanguages.isEmpty else { return text }
        for lang in preferredLanguages {
            if let t = translations[lang] { return t }
            let target = StoryPrismeMatch.base(lang)
            if let t = translations.first(where: { StoryPrismeMatch.base($0.key) == target })?.value {
                return t
            }
        }
        return text
    }
}

// MARK: - Story Media Kind

/// Type-safe wrapper around `StoryMediaObject.mediaType`. The underlying field stays
/// `String` for forward compatibility with API extensions and existing drafts on disk;
/// callers should compare via `.kind == .video` rather than the raw string.
public enum StoryMediaKind: String, Codable, Sendable {
    case image
    case video
}

// MARK: - Story Media Object (image/vidéo sur canvas)

public struct StoryMediaObject: Codable, Identifiable, Sendable {
    public var id: String
    public var postMediaId: String         // référence PostMedia en DB (kept)
    public var mediaURL: String?           // optional URL (e.g. "fixture://media")
    public var mediaType: String           // raw string, see `kind` for type-safe access
    public var placement: String           // kept for backward compat; no longer drives rendering
    public var x: Double                   // normalisé 0–1
    public var y: Double
    public var scale: Double
    public var rotation: Double
    public var volume: Float               // 0.0–1.0

    // NEW — Phase 1 Canvas Fidelity fields
    public var aspectRatio: Double         // figé à la composition (REQUIRED, fallback 1.0 on legacy decode)
    public var anchor: CGPoint             // pivot rotation/scale, default (0.5, 0.5)
    public var intrinsicDuration: Double?  // durée native de l'asset, peuplée à la composition

    // Promoted to non-optional
    /// Quand true, ce media joue en fond (fullscreen, boucle infinie, sans UI draggable).
    /// Un seul media peut être en background par slide.
    public var isBackground: Bool          // was: Bool?, now non-opt with default false
    public var loop: Bool                  // was: Bool?, now non-opt with default false
    /// Z-order persistent (cf. `StoryTextObject.zIndex`).
    public var zIndex: Int                 // was: Int?, now non-opt with default 0

    // Timeline timing — Double, optional
    public var startTime: Double?          // offset en secondes (défaut 0)
    public var duration: Double?           // durée de lecture (nil = jusqu'à la fin)
    public var fadeIn: Double?             // fade-in (secondes)
    public var fadeOut: Double?            // fade-out (secondes)

    // Heritage (kept)
    public var sourceLanguage: String?
    // Timeline V2 — animation keyframes (position/scale/opacity)
    public var keyframes: [StoryKeyframe]?
    /// ThumbHash du contenu (première frame pour vidéo, image décompressée
    /// pour image). Généré au publish (cf. spec § 2.4). Sert de placeholder
    /// pendant le fetch via `applyThumbHashPlaceholder`. `nil` autorisé
    /// (back-compat stories antérieures, médias sans génération).
    ///
    /// Format attendu : base64 d'un hash ThumbHash (~28-33 chars). Le setter
    /// clamp à `maxThumbHashLength` (100 chars) — defense-in-depth contre un
    /// payload malformé qui pourrait passer un blob de plusieurs MB dans la
    /// slide effects JSON. Si > limite, le field est mis à `nil` (placeholder
    /// noir au render — dégradation visuelle acceptable vs DB blow up).
    public var thumbHash: String? {
        didSet {
            if let hash = thumbHash, hash.count > Self.maxThumbHashLength {
                thumbHash = nil
            }
        }
    }

    /// Longueur max acceptée pour un thumbHash base64. ThumbHash spec produit
    /// 5-25 bytes binaires ≈ 8-36 chars base64. Marge x3 pour tolérance future.
    public static let maxThumbHashLength: Int = 100

    enum CodingKeys: String, CodingKey {
        case id, postMediaId, mediaURL, mediaType, placement
        case x, y, scale, rotation, volume
        case aspectRatio, anchor, intrinsicDuration
        case isBackground, loop, zIndex
        case startTime, duration, fadeIn, fadeOut
        case sourceLanguage, keyframes, thumbHash
    }

    public init(id: String = UUID().uuidString,
                postMediaId: String = "",
                mediaURL: String? = nil,
                mediaType: String = "image",
                placement: String = "media",
                aspectRatio: Double,                        // REQUIRED, no default
                x: Double = 0.5, y: Double = 0.5,
                scale: Double = 1.0, rotation: Double = 0,
                anchor: CGPoint = CGPoint(x: 0.5, y: 0.5),
                volume: Float = 1.0,
                isBackground: Bool = false,
                loop: Bool = false,
                zIndex: Int = 0,
                intrinsicDuration: Double? = nil,
                startTime: Double? = nil,
                duration: Double? = nil,
                fadeIn: Double? = nil,
                fadeOut: Double? = nil,
                sourceLanguage: String? = nil,
                keyframes: [StoryKeyframe]? = nil,
                thumbHash: String? = nil) {
        self.id = id
        self.postMediaId = postMediaId
        self.mediaURL = mediaURL
        self.mediaType = mediaType
        self.placement = placement
        self.x = x; self.y = y
        self.scale = scale; self.rotation = rotation
        self.anchor = anchor
        self.volume = volume
        self.aspectRatio = aspectRatio
        self.isBackground = isBackground
        self.loop = loop
        self.zIndex = zIndex
        self.intrinsicDuration = intrinsicDuration
        self.startTime = startTime; self.duration = duration
        self.fadeIn = fadeIn; self.fadeOut = fadeOut
        self.sourceLanguage = sourceLanguage
        self.keyframes = keyframes
        self.thumbHash = thumbHash
    }

    // Custom init(from decoder:) for legacy backward compat
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        postMediaId = try c.decodeIfPresent(String.self, forKey: .postMediaId) ?? ""
        mediaURL = try c.decodeIfPresent(String.self, forKey: .mediaURL)
        mediaType = try c.decodeIfPresent(String.self, forKey: .mediaType) ?? "image"
        placement = try c.decodeIfPresent(String.self, forKey: .placement) ?? "media"
        x = try c.decodeIfPresent(Double.self, forKey: .x) ?? 0.5
        y = try c.decodeIfPresent(Double.self, forKey: .y) ?? 0.5
        scale = try c.decodeIfPresent(Double.self, forKey: .scale) ?? 1.0
        rotation = try c.decodeIfPresent(Double.self, forKey: .rotation) ?? 0
        volume = try c.decodeIfPresent(Float.self, forKey: .volume) ?? 1.0
        // aspectRatio: REQUIRED but falls back to 1.0 for legacy drafts that predate this field
        aspectRatio = try c.decodeIfPresent(Double.self, forKey: .aspectRatio) ?? 1.0
        if let anchorContainer = try? c.nestedContainer(keyedBy: AnchorKeys.self, forKey: .anchor) {
            let ax = try anchorContainer.decodeIfPresent(Double.self, forKey: .x) ?? 0.5
            let ay = try anchorContainer.decodeIfPresent(Double.self, forKey: .y) ?? 0.5
            anchor = CGPoint(x: ax, y: ay)
        } else {
            anchor = CGPoint(x: 0.5, y: 0.5)
        }
        intrinsicDuration = try c.decodeIfPresent(Double.self, forKey: .intrinsicDuration)
        isBackground = try c.decodeIfPresent(Bool.self, forKey: .isBackground) ?? false
        loop = try c.decodeIfPresent(Bool.self, forKey: .loop) ?? false
        zIndex = try c.decodeIfPresent(Int.self, forKey: .zIndex) ?? 0
        startTime = try c.decodeIfPresent(Double.self, forKey: .startTime)
        duration = try c.decodeIfPresent(Double.self, forKey: .duration)
        fadeIn = try c.decodeIfPresent(Double.self, forKey: .fadeIn)
        fadeOut = try c.decodeIfPresent(Double.self, forKey: .fadeOut)
        sourceLanguage = try c.decodeIfPresent(String.self, forKey: .sourceLanguage)
        keyframes = try c.decodeIfPresent([StoryKeyframe].self, forKey: .keyframes)
        // Decoder clamp : `didSet` ne se déclenche pas pendant init, donc on
        // applique la limite explicitement pour protéger contre un payload
        // malformé / malveillant (slide effects JSON externe → cache disque).
        let rawThumbHash = try c.decodeIfPresent(String.self, forKey: .thumbHash)
        thumbHash = (rawThumbHash?.count ?? 0) > Self.maxThumbHashLength ? nil : rawThumbHash
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(postMediaId, forKey: .postMediaId)
        try c.encodeIfPresent(mediaURL, forKey: .mediaURL)
        try c.encode(mediaType, forKey: .mediaType)
        try c.encode(placement, forKey: .placement)
        try c.encode(x, forKey: .x); try c.encode(y, forKey: .y)
        try c.encode(scale, forKey: .scale); try c.encode(rotation, forKey: .rotation)
        try c.encode(volume, forKey: .volume)
        try c.encode(aspectRatio, forKey: .aspectRatio)
        var anchorContainer = c.nestedContainer(keyedBy: AnchorKeys.self, forKey: .anchor)
        try anchorContainer.encode(Double(anchor.x), forKey: .x)
        try anchorContainer.encode(Double(anchor.y), forKey: .y)
        try c.encodeIfPresent(intrinsicDuration, forKey: .intrinsicDuration)
        try c.encode(isBackground, forKey: .isBackground)
        try c.encode(loop, forKey: .loop)
        try c.encode(zIndex, forKey: .zIndex)
        try c.encodeIfPresent(startTime, forKey: .startTime)
        try c.encodeIfPresent(duration, forKey: .duration)
        try c.encodeIfPresent(fadeIn, forKey: .fadeIn)
        try c.encodeIfPresent(fadeOut, forKey: .fadeOut)
        try c.encodeIfPresent(sourceLanguage, forKey: .sourceLanguage)
        try c.encodeIfPresent(keyframes, forKey: .keyframes)
        try c.encodeIfPresent(thumbHash, forKey: .thumbHash)
    }

    private enum AnchorKeys: String, CodingKey { case x, y }

    /// Type-safe view on `mediaType`. Returns `nil` if the persisted value is unrecognized
    /// (forward compat with future API kinds).
    public var kind: StoryMediaKind? { StoryMediaKind(rawValue: mediaType) }
}

/// Convenience init with typed kind (kept as extension to avoid conflict with main init).
extension StoryMediaObject {
    public init(id: String = UUID().uuidString,
                postMediaId: String = "",
                mediaURL: String? = nil,
                kind: StoryMediaKind,
                placement: String = "media",
                aspectRatio: Double,
                x: Double = 0.5, y: Double = 0.5,
                scale: Double = 1.0, rotation: Double = 0,
                anchor: CGPoint = CGPoint(x: 0.5, y: 0.5),
                volume: Float = 1.0,
                isBackground: Bool = false,
                loop: Bool = false,
                zIndex: Int = 0,
                intrinsicDuration: Double? = nil,
                startTime: Double? = nil,
                duration: Double? = nil,
                fadeIn: Double? = nil,
                fadeOut: Double? = nil,
                sourceLanguage: String? = nil,
                keyframes: [StoryKeyframe]? = nil,
                thumbHash: String? = nil) {
        self.init(id: id,
                  postMediaId: postMediaId,
                  mediaURL: mediaURL,
                  mediaType: kind.rawValue,
                  placement: placement,
                  aspectRatio: aspectRatio,
                  x: x, y: y, scale: scale, rotation: rotation,
                  anchor: anchor,
                  volume: volume,
                  isBackground: isBackground,
                  loop: loop,
                  zIndex: zIndex,
                  intrinsicDuration: intrinsicDuration,
                  startTime: startTime,
                  duration: duration,
                  fadeIn: fadeIn, fadeOut: fadeOut,
                  sourceLanguage: sourceLanguage,
                  keyframes: keyframes,
                  thumbHash: thumbHash)
    }
}

// MARK: - Story Audio Player Object (player waveform sur canvas)

public struct StoryAudioPlayerObject: Codable, Identifiable, Sendable {
    public var id: String
    public var postMediaId: String      // référence PostMedia en DB
    public var placement: String        // kept for backward compat; no longer drives rendering
    public var x: CGFloat              // normalisé 0–1
    public var y: CGFloat
    public var volume: Float           // 0.0–1.0
    public var waveformSamples: [Float] // ~80 samples extraits à la composition
    /// Quand true, ce player audio joue en fond (boucle infinie, pas de UI pill draggable,
    /// ducking automatique quand un audio foreground joue). Un seul audio peut être en
    /// background par slide. Synthétisé au chargement si la story utilise les anciens
    /// champs `backgroundAudioId/Volume/Start/End`.
    public var isBackground: Bool?
    /// Variantes TTS par langue (rattachées à l'audio background historiquement).
    public var backgroundAudioVariants: [StoryAudioVariant]?
    /// Z-order persistent (cf. `StoryTextObject.zIndex`).
    public var zIndex: Int?

    // Timeline timing
    public var startTime: Float?            // offset en secondes (défaut 0)
    public var duration: Float?             // durée de lecture (nil = jusqu'à la fin)
    public var loop: Bool?                  // boucle automatique
    public var fadeIn: Float?               // fade-in (secondes)
    public var fadeOut: Float?              // fade-out (secondes)
    public var sourceLanguage: String?

    enum CodingKeys: String, CodingKey {
        case id, postMediaId, placement, x, y, volume, waveformSamples
        case isBackground, backgroundAudioVariants, zIndex
        case startTime, duration, loop, fadeIn, fadeOut, sourceLanguage
    }

    public init(id: String = UUID().uuidString, postMediaId: String = "",
                placement: String = "overlay",
                x: CGFloat = 0.5, y: CGFloat = 0.8,
                volume: Float = 1.0, waveformSamples: [Float] = [],
                isBackground: Bool? = nil,
                backgroundAudioVariants: [StoryAudioVariant]? = nil,
                startTime: Float? = nil, duration: Float? = nil,
                loop: Bool? = nil, fadeIn: Float? = nil, fadeOut: Float? = nil,
                sourceLanguage: String? = nil) {
        self.id = id; self.postMediaId = postMediaId
        self.placement = placement; self.x = x; self.y = y
        self.volume = volume; self.waveformSamples = waveformSamples
        self.isBackground = isBackground
        self.backgroundAudioVariants = backgroundAudioVariants
        self.startTime = startTime; self.duration = duration
        self.loop = loop; self.fadeIn = fadeIn; self.fadeOut = fadeOut
        self.sourceLanguage = sourceLanguage
    }
}

extension StoryAudioPlayerObject {
    /// Resolves the localized background audio postMediaId via the Prisme
    /// Linguistique chain. Falls back to default `postMediaId` when no variant
    /// matches. Used by the reader pipeline to pick the correct language
    /// variant of a background audio track.
    public func resolvedPostMediaId(preferredLanguages: [String]) -> String {
        guard let variants = backgroundAudioVariants, !variants.isEmpty,
              !preferredLanguages.isEmpty else { return postMediaId }
        for lang in preferredLanguages {
            if let v = variants.first(where: { $0.language == lang }) { return v.postMediaId }
            let target = StoryPrismeMatch.base(lang)
            if let v = variants.first(where: { StoryPrismeMatch.base($0.language) == target }) {
                return v.postMediaId
            }
        }
        return postMediaId
    }
}

// MARK: - Story Audio Variant (TTS auto-généré par langue)

public struct StoryAudioVariant: Codable, Sendable {
    public var postMediaId: String      // référence PostMedia de la variante
    public var language: String         // code langue IETF ex: "fr", "en"
    public var isAutoGenerated: Bool

    enum CodingKeys: String, CodingKey {
        case postMediaId, language, isAutoGenerated
    }

    public init(postMediaId: String, language: String, isAutoGenerated: Bool = true) {
        self.postMediaId = postMediaId; self.language = language
        self.isAutoGenerated = isAutoGenerated
    }
}

// MARK: - Story Sticker

public struct StorySticker: Codable, Identifiable, Sendable {
    public var id: String
    public var emoji: String
    public var x: Double
    public var y: Double
    public var scale: Double
    public var rotation: Double
    /// Z-order persistent (non-optional; defaults to 0).
    public var zIndex: Int

    /// Design-space size in pixels (1080-référentiel). Rendered size = baseSize × scale × scaleFactor.
    public var baseSize: Double
    /// Pivot point for rotation/scale (normalized 0–1). Default center (0.5, 0.5).
    public var anchor: CGPoint

    // Timeline timing
    public var startTime: Double?
    public var duration: Double?
    public var fadeIn: Double?
    public var fadeOut: Double?

    enum CodingKeys: String, CodingKey {
        case id, emoji, x, y, scale, rotation, zIndex
        case baseSize, anchor
        case startTime, duration, fadeIn, fadeOut
    }

    public init(id: String = UUID().uuidString,
                emoji: String,
                x: Double = 0.5, y: Double = 0.5,
                scale: Double = 1.0,
                rotation: Double = 0,
                zIndex: Int = 0,
                baseSize: Double = 140.0,
                anchor: CGPoint = CGPoint(x: 0.5, y: 0.5),
                startTime: Double? = nil,
                duration: Double? = nil,
                fadeIn: Double? = nil,
                fadeOut: Double? = nil) {
        self.id = id; self.emoji = emoji
        self.x = x; self.y = y; self.scale = scale; self.rotation = rotation
        self.zIndex = zIndex
        self.baseSize = baseSize
        self.anchor = anchor
        self.startTime = startTime; self.duration = duration
        self.fadeIn = fadeIn; self.fadeOut = fadeOut
    }

    // Custom Codable for legacy backward compat:
    //   - x/y/scale/rotation: CGFloat on wire decodes fine as Double
    //   - zIndex: was Int? — fallback to 0
    //   - baseSize: absent in legacy payloads — fallback to 140
    //   - anchor: absent in legacy payloads — fallback to center (0.5, 0.5)
    //   - timing fields: absent in legacy payloads — fallback to nil
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        emoji = try c.decode(String.self, forKey: .emoji)
        x = try c.decodeIfPresent(Double.self, forKey: .x) ?? 0.5
        y = try c.decodeIfPresent(Double.self, forKey: .y) ?? 0.5
        scale = try c.decodeIfPresent(Double.self, forKey: .scale) ?? 1.0
        rotation = try c.decodeIfPresent(Double.self, forKey: .rotation) ?? 0
        zIndex = try c.decodeIfPresent(Int.self, forKey: .zIndex) ?? 0
        baseSize = try c.decodeIfPresent(Double.self, forKey: .baseSize) ?? 140.0
        if let anchorContainer = try? c.nestedContainer(keyedBy: AnchorKeys.self, forKey: .anchor) {
            let ax = try anchorContainer.decodeIfPresent(Double.self, forKey: .x) ?? 0.5
            let ay = try anchorContainer.decodeIfPresent(Double.self, forKey: .y) ?? 0.5
            anchor = CGPoint(x: ax, y: ay)
        } else {
            anchor = CGPoint(x: 0.5, y: 0.5)
        }
        startTime = try c.decodeIfPresent(Double.self, forKey: .startTime)
        duration = try c.decodeIfPresent(Double.self, forKey: .duration)
        fadeIn = try c.decodeIfPresent(Double.self, forKey: .fadeIn)
        fadeOut = try c.decodeIfPresent(Double.self, forKey: .fadeOut)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(emoji, forKey: .emoji)
        try c.encode(x, forKey: .x); try c.encode(y, forKey: .y)
        try c.encode(scale, forKey: .scale); try c.encode(rotation, forKey: .rotation)
        try c.encode(zIndex, forKey: .zIndex)
        try c.encode(baseSize, forKey: .baseSize)
        var anchorContainer = c.nestedContainer(keyedBy: AnchorKeys.self, forKey: .anchor)
        try anchorContainer.encode(Double(anchor.x), forKey: .x)
        try anchorContainer.encode(Double(anchor.y), forKey: .y)
        try c.encodeIfPresent(startTime, forKey: .startTime)
        try c.encodeIfPresent(duration, forKey: .duration)
        try c.encodeIfPresent(fadeIn, forKey: .fadeIn)
        try c.encodeIfPresent(fadeOut, forKey: .fadeOut)
    }

    private enum AnchorKeys: String, CodingKey { case x, y }
}

// MARK: - Story Slide

public struct StorySlide: Identifiable, Codable, Sendable {
    public var id: String
    public var mediaURL: String?
    public var mediaData: Data?
    public var content: String?
    public var effects: StoryEffects
    public var duration: TimeInterval
    public var order: Int

    public init(id: String = UUID().uuidString, mediaURL: String? = nil, mediaData: Data? = nil,
                content: String? = nil, effects: StoryEffects = StoryEffects(),
                duration: TimeInterval = 6, order: Int = 0) {
        self.id = id; self.mediaURL = mediaURL; self.mediaData = mediaData
        self.content = content; self.effects = effects
        self.duration = duration; self.order = order
    }

    enum CodingKeys: String, CodingKey {
        case id, mediaURL, content, effects, duration, order
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        mediaURL = try container.decodeIfPresent(String.self, forKey: .mediaURL)
        mediaData = nil
        content = try container.decodeIfPresent(String.self, forKey: .content)
        effects = try container.decodeIfPresent(StoryEffects.self, forKey: .effects) ?? StoryEffects()
        duration = try container.decodeIfPresent(TimeInterval.self, forKey: .duration) ?? 6
        order = try container.decodeIfPresent(Int.self, forKey: .order) ?? 0
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(mediaURL, forKey: .mediaURL)
        try container.encodeIfPresent(content, forKey: .content)
        try container.encode(effects, forKey: .effects)
        try container.encode(duration, forKey: .duration)
        try container.encode(order, forKey: .order)
    }
}

extension StorySlide {
    /// SINGLE SOURCE OF TRUTH pour la durée d'un slide story.
    /// User spec 2026-05-28 : « rassembler les choses dans un seul lieu,
    /// respecter les 6s pour les statics (sauf si trop de long texte) ».
    ///
    /// PRIORITÉ (calculée from scratch — IGNORE `effects.slideDuration`
    /// persisté car les anciennes stories backend portent des valeurs
    /// arbitraires (12 s, etc.) issues du composer qui écrivait
    /// `slides[i].effects.slideDuration = Float(slides[i].duration)` à
    /// chaque publish, contournant cette source de vérité) :
    ///
    /// 1. Background vidéo OU audio présent → durée du media :
    ///    - media ≥ 6 s → exact
    ///    - media < 6 s → loop jusqu'à ≥ 6 s (`ceil(6 / dur) × dur`)
    ///
    /// 2. Texte long (cumul mots > 30) → 6 s + (mots − 30) / 6 secondes
    ///    (1 s par tranche de 6 mots au-delà de 30) pour donner au
    ///    lecteur le temps de lire.
    ///
    /// 3. Slide statique sans long texte → 6 s strict.
    ///
    /// Cette fonction est l'UNIQUE point d'autorité. Utilisée par le
    /// canvas displayLink (auto-advance), le viewer wall-clock (progress
    /// bar) et l'exporter (composition AVFoundation). Personne ne lit
    /// `effects.slideDuration` directement.
    static let defaultStaticDuration: TimeInterval = 6.0
    static let longTextThresholdWords: Int = 30
    static let longTextSecondsPerWord: Double = 1.0 / 6.0

    public func computedTotalDuration() -> TimeInterval {
        // PRIORITÉ 0 — autorité timeline (« la timeline EST la story »). Si l'auteur
        // a configuré la durée du slide via le timeline editor, elle est AUTORITAIRE :
        // elle gagne sur le contenu (un média plus long est rogné). Champ dédié
        // `timelineDuration` (distinct du legacy `slideDuration` aux valeurs backend
        // arbitraires) → `nil` pour tout l'existant = fallback contenu, zéro régression.
        if let pinned = effects.timelineDuration, pinned > 0 {
            return pinned
        }
        return contentDerivedDuration()
    }

    /// Durée dérivée du CONTENU (bg media loop / texte long / 6 s statique), en
    /// IGNORANT le pin timeline. Sert (1) de fallback à `computedTotalDuration()`
    /// quand aucun pin n'est posé, et (2) de référence pour décider si une durée
    /// configurée par le timeline est une vraie surcharge auteur (≠ contenu) ou
    /// juste la valeur auto — cf. `TimelineProject.apply`.
    public func contentDerivedDuration() -> TimeInterval {
        // Règle : MAX(donnée la plus longue, durée lecture texte, 6 s statique).
        // Directive user 2026-07-14 : « la timeline prend la durée automatique
        // de la donnée la plus longue (audio, vidéo) » — TOUTES sources : bg ET
        // fg, vidéo ET audio, chacune mesurée par sa FENÊTRE `startTime + duration`.

        // Composante 1 : média de fond à BOUCLER (vidéo prioritaire, sinon
        // audio de fond). Sa durée naturelle sert de motif de loop pour couvrir
        // la cible sans étirer une image figée.
        let bgVideoDur = effects.mediaObjects?
            .first(where: { $0.isBackground && $0.kind == .video })?
            .duration
        let bgAudioDur = effects.audioPlayerObjects?
            .first(where: { $0.isBackground == true })?
            .duration
            .map { Double($0) }

        // Composante 2 : texte long. >30 mots → 6 s + (mots-30)/6 secondes.
        let totalWords = effects.textObjects.reduce(0) { acc, text in
            acc + text.text.split(separator: " ").count
        }
        let textDur: TimeInterval = {
            guard totalWords > Self.longTextThresholdWords else {
                return Self.defaultStaticDuration
            }
            let extraWords = totalWords - Self.longTextThresholdWords
            return Self.defaultStaticDuration
                + Double(extraWords) * Self.longTextSecondsPerWord
        }()

        // Composante 3 : la donnée la plus longue, TOUTES sources confondues.
        // Chaque piste est mesurée par la fin de sa fenêtre (`startTime + duration`)
        // pour qu'une vidéo/un audio décalé ne soit jamais tronqué. Inclut
        // désormais l'audio FOREGROUND (voix, musique posée) et le bg audio
        // complet — auparavant ignorés (seul le 1er bg vidéo/audio comptait).
        let mediaWindows = (effects.mediaObjects ?? [])
            .compactMap { media in media.duration.map { (media.startTime ?? 0) + $0 } }
        let audioWindows = (effects.audioPlayerObjects ?? [])
            .compactMap { audio in audio.duration.map { Double($0) + Double(audio.startTime ?? 0) } }
        let longestData = (mediaWindows + audioWindows).max() ?? 0

        // Cible = max(texte, 6 s, donnée la plus longue).
        let target = max(textDur, Self.defaultStaticDuration, longestData)

        // Background media bouclé pour atteindre la cible (ou sa durée naturelle si
        // plus longue). TOUTES les périodes de boucle de fond présentes sont
        // considérées (vidéo ET audio si les deux coexistent) — avant ce fix,
        // `bgVideoDur ?? bgAudioDur` ignorait totalement la période audio dès
        // qu'un bg vidéo existait, pouvant laisser l'audio de fond coupé en
        // plein cycle (directive user : « la répétition ... TOMBE TOUJOURS en
        // facteur »). Pour chaque période, on arrondit la cible au multiple
        // supérieur puis on prend le MAX à travers les sources, pour que la
        // source dont la période exige le plus grand arrondi complète son
        // dernier cycle. Ceci ne garantit pas un alignement simultané parfait
        // des DEUX périodes quand elles sont incommensurables (nécessiterait
        // un calcul type PPCM, hors de portée — risquerait de gonfler la
        // durée du slide de façon déraisonnable) ; le cas dominant réel (une
        // seule source de fond bouclée) reste, lui, toujours exact.
        let bgLoopPeriods = [bgVideoDur, bgAudioDur].compactMap { $0 }.filter { $0 > 0.001 }
        let bgResult: TimeInterval = bgLoopPeriods.reduce(target) { effective, period in
            let extended = period >= target ? period : (target / period).rounded(.up) * period
            return max(effective, extended)
        }

        // Le résultat couvre au moins la donnée la plus longue.
        return max(bgResult, longestData)
    }

    /// Effective slide duration that completes any background looping video to a full repetition.
    ///
    /// Examples:
    ///   slide=12s, video=5s → 15s (3 repetitions)
    ///   slide=12s, video=6s → 12s (exact 2 repetitions)
    ///
    /// Now an alias for `computedTotalDuration()`, which covers every element
    /// on the slide — not just looped backgrounds. Kept as a function rather
    /// than removed so out-of-tree callers (tests, fixtures) keep compiling.
    public func effectiveSlideDuration() -> TimeInterval {
        computedTotalDuration()
    }
}

// MARK: - Story Transition Effects

public enum StoryTransitionEffect: String, Codable, CaseIterable, Sendable {
    /// Fondu : opacité 0 → 1 (0.3s easeOut) à l'entrée
    case fade
    /// Zoom doux : scale 0.92 + opacité 0 → 1 (spring) à l'entrée
    case zoom
    /// Glissement vertical : décalage Y+30 + opacité 0 → position normale (spring) à l'entrée
    case slide
    /// Révélation circulaire : clipShape cercle qui s'élargit (0.4s easeOut) à l'entrée
    case reveal

    public var label: String {
        switch self {
        case .fade:   return "Fondu"
        case .zoom:   return "Zoom"
        case .slide:  return "Glissement"
        case .reveal: return "Révélation"
        }
    }

    public var iconName: String {
        switch self {
        case .fade:   return "sun.max"
        case .zoom:   return "arrow.up.left.and.arrow.down.right"
        case .slide:  return "arrow.up"
        case .reveal: return "circle.dashed"
        }
    }
}

// MARK: - Background Transform

public struct StoryBackgroundTransform: Codable, Sendable {
    public var scale: CGFloat?
    public var offsetX: CGFloat?
    public var offsetY: CGFloat?
    public var rotation: Double?
    /// User override for video background gravity. `nil` = auto by orientation
    /// (landscape → letterbox, portrait → aspectFill). `"fit"` = forced letterbox.
    /// `"fill"` = forced aspectFill. Same semantics applied to image backgrounds.
    public var videoFitMode: String?

    public init(scale: CGFloat? = nil, offsetX: CGFloat? = nil,
                offsetY: CGFloat? = nil, rotation: Double? = nil,
                videoFitMode: String? = nil) {
        self.scale = scale; self.offsetX = offsetX
        self.offsetY = offsetY; self.rotation = rotation
        self.videoFitMode = videoFitMode
    }

    public var isIdentity: Bool {
        (scale ?? 1.0) == 1.0 && (offsetX ?? 0) == 0 && (offsetY ?? 0) == 0
            && (rotation ?? 0) == 0 && videoFitMode == nil
    }
}

// MARK: - Story Effects

// MARK: - Story Canvas Aspect (forme du canvas : vertical par défaut, horizontal si fond paysage)

/// Forme du canvas d'une story. Le canvas est **vertical 9:16 par défaut** ;
/// l'import d'une image de fond **paysage** (largeur > hauteur) bascule le canvas
/// en **horizontal 16:9** — « l'import de l'image de fond impose le cadre et forme
/// du Canvas ». Décision pure, sans dépendance UI, réutilisée par le composer.
public enum StoryCanvasAspect: String, Codable, Sendable, CaseIterable {
    case portrait   // 9:16 (défaut)
    case landscape  // 16:9

    /// Ratio largeur / hauteur du canvas (portrait 0.5625, paysage 1.7778).
    public var ratio: Double {
        switch self {
        case .portrait:  return 9.0 / 16.0
        case .landscape: return 16.0 / 9.0
        }
    }

    /// Décide la forme du canvas depuis les dimensions d'une image de fond importée.
    /// Une image plus large que haute → canvas horizontal ; sinon (portrait ou carré,
    /// ou dimensions invalides) → canvas vertical par défaut.
    public static func from(width: Double, height: Double) -> StoryCanvasAspect {
        guard width > 0, height > 0 else { return .portrait }
        return width > height ? .landscape : .portrait
    }

    /// Reconstruit la forme depuis un ratio persisté (`canvasAspectRatio`). `nil`
    /// ou ratio ≤ 1 → portrait ; ratio > 1 → paysage.
    public static func from(ratio: Double?) -> StoryCanvasAspect {
        guard let ratio, ratio > 1 else { return .portrait }
        return .landscape
    }
}

/// Consumes exactly one element from an unkeyed container without inspecting
/// it — used to advance the cursor past a malformed element during lossy decode.
private struct _StorySkippedElement: Decodable {
    init(from decoder: Decoder) throws {}
}

extension KeyedDecodingContainer {
    /// Decodes `[T]` element-by-element, skipping any element that fails to
    /// decode instead of throwing the whole array. A single malformed story
    /// object in another user's payload is dropped rather than blanking the
    /// entire story. Returns `nil` when the key is absent or not an array
    /// (parity with `decodeIfPresent`), `[]` when present but empty/all-invalid.
    func decodeLossyArrayIfPresent<T: Decodable>(_ type: [T].Type, forKey key: Key) -> [T]? {
        guard contains(key),
              var unkeyed = try? nestedUnkeyedContainer(forKey: key) else { return nil }
        var result: [T] = []
        while !unkeyed.isAtEnd {
            if let element = try? unkeyed.decode(T.self) {
                result.append(element)
            } else {
                // A failed `decode(T.self)` leaves the JSONDecoder cursor in
                // place; decoding a throwaway element advances past the bad one.
                _ = try? unkeyed.decode(_StorySkippedElement.self)
            }
        }
        return result
    }
}

public struct StoryEffects: Codable, Sendable {
    public var background: String?
    public var textStyle: String?
    public var textColor: String?
    public var textPosition: String?
    public var filter: String?
    public var filterIntensity: Double?
    public var stickers: [String]?
    public var textAlign: String?
    public var textSize: CGFloat?
    public var textBg: String?
    public var textOffsetY: CGFloat?
    public var stickerObjects: [StorySticker]?
    public var textPositionPoint: StoryTextPosition?
    /// Legacy PencilKit `PKDrawing.dataRepresentation()` — conservé pour decode-only
    /// (rétro-compat des stories publiées avant la refonte 2026-05-30). Le nouveau
    /// format `drawingStrokes` est privilégié à la lecture comme à l'écriture.
    public var drawingData: Data?
    /// Nouveau format de dessin : traits individuels éditables (couleur, épaisseur,
    /// lissage) par le composer. Migration best-effort des `drawingData` legacy
    /// effectuée à `init(from:)` quand seule l'ancienne clé est présente.
    public var drawingStrokes: [StoryDrawingStroke]?
    // Background audio (bibliothèque ou enregistrement)
    public var backgroundAudioId: String?
    public var backgroundAudioVolume: Float?
    public var backgroundAudioStart: TimeInterval?
    public var backgroundAudioEnd: TimeInterval?

    // Audio vocal (transcrit + traduit par Whisper/NLLB)
    public var voiceAttachmentId: String?
    public var voiceTranscriptions: [StoryVoiceTranscription]?

    // Effets de transition (entrée / sortie du slide)
    public var opening: StoryTransitionEffect?
    public var closing: StoryTransitionEffect?

    // Objets canvas composites
    public var textObjects: [StoryTextObject]
    public var mediaObjects: [StoryMediaObject]?
    public var audioPlayerObjects: [StoryAudioPlayerObject]?
    public var backgroundAudioVariants: [StoryAudioVariant]?
    /// ThumbHash of the composite canvas screenshot (computed client-side at publish time)
    public var thumbHash: String?

    // Transform appliqué à l'image/vidéo de fond (scale, offset, rotation)
    public var backgroundTransform: StoryBackgroundTransform?

    /// Ratio (largeur / hauteur) du canvas de CE slide. `nil` = canvas vertical
    /// 9:16 par défaut (toutes les stories antérieures + la valeur par défaut).
    /// L'import d'une image de fond paysage stampe `StoryCanvasAspect.landscape.ratio`
    /// (16:9) ici — « l'import de l'image de fond impose le cadre et forme du Canvas ».
    /// Lu par le composer, le reader et l'export pour reconstruire la forme du canvas.
    public var canvasAspectRatio: Double?

    // Durée totale du slide (sérialisée au publish) — LEGACY : valeurs backend
    // héritées arbitraires, IGNORÉE par `computedTotalDuration()` (cf. doc).
    public var slideDuration: Float?

    /// Durée AUTORITAIRE configurée par le timeline editor (« la timeline EST la
    /// story »). `nil` = aucune autorité timeline (vieilles stories, slide jamais
    /// édité) → `computedTotalDuration()` retombe sur le contenu. Non-`nil` = durée
    /// du slide imposée par le timeline, lue EN PRIORITÉ par `computedTotalDuration()`
    /// (peut être < contenu : le média long est alors rogné). Champ dédié distinct du
    /// legacy `slideDuration` pour ne pas hériter des valeurs backend arbitraires.
    public var timelineDuration: Double?

    // Timeline V2 — transitions between adjacent clips of this slide
    public var clipTransitions: [StoryClipTransition]?

    // Deprecated — conservé pour compatibilité ascendante
    @available(*, deprecated, renamed: "backgroundAudioId")
    public var musicTrackId: String?
    @available(*, deprecated, renamed: "backgroundAudioStart")
    public var musicStartTime: TimeInterval?
    @available(*, deprecated, renamed: "backgroundAudioEnd")
    public var musicEndTime: TimeInterval?

    public init(background: String? = nil, textStyle: String? = nil, textColor: String? = nil,
                textPosition: String? = nil, filter: String? = nil, filterIntensity: Double? = nil, stickers: [String]? = nil,
                textAlign: String? = nil, textSize: CGFloat? = nil, textBg: String? = nil, textOffsetY: CGFloat? = nil,
                stickerObjects: [StorySticker]? = nil, textPositionPoint: StoryTextPosition? = nil,
                drawingData: Data? = nil,
                drawingStrokes: [StoryDrawingStroke]? = nil,
                backgroundAudioId: String? = nil, backgroundAudioVolume: Float? = nil,
                backgroundAudioStart: TimeInterval? = nil, backgroundAudioEnd: TimeInterval? = nil,
                voiceAttachmentId: String? = nil, voiceTranscriptions: [StoryVoiceTranscription]? = nil,
                opening: StoryTransitionEffect? = nil, closing: StoryTransitionEffect? = nil,
                textObjects: [StoryTextObject] = [],
                mediaObjects: [StoryMediaObject]? = nil,
                audioPlayerObjects: [StoryAudioPlayerObject]? = nil,
                backgroundAudioVariants: [StoryAudioVariant]? = nil,
                backgroundTransform: StoryBackgroundTransform? = nil,
                slideDuration: Float? = nil,
                timelineDuration: Double? = nil,
                clipTransitions: [StoryClipTransition]? = nil,
                canvasAspectRatio: Double? = nil) {
        self.background = background; self.textStyle = textStyle; self.textColor = textColor
        self.textPosition = textPosition; self.filter = filter; self.filterIntensity = filterIntensity; self.stickers = stickers
        self.textAlign = textAlign; self.textSize = textSize; self.textBg = textBg; self.textOffsetY = textOffsetY
        self.stickerObjects = stickerObjects; self.textPositionPoint = textPositionPoint
        self.drawingData = drawingData
        self.drawingStrokes = drawingStrokes
        self.backgroundAudioId = backgroundAudioId
        self.backgroundAudioVolume = backgroundAudioVolume
        self.backgroundAudioStart = backgroundAudioStart
        self.backgroundAudioEnd = backgroundAudioEnd
        self.voiceAttachmentId = voiceAttachmentId
        self.voiceTranscriptions = voiceTranscriptions
        self.opening = opening
        self.closing = closing
        self.textObjects = textObjects
        self.mediaObjects = mediaObjects
        self.audioPlayerObjects = audioPlayerObjects
        self.backgroundAudioVariants = backgroundAudioVariants
        self.backgroundTransform = backgroundTransform
        self.slideDuration = slideDuration
        self.timelineDuration = timelineDuration
        self.clipTransitions = clipTransitions
        self.canvasAspectRatio = canvasAspectRatio
    }

    // MARK: - Custom Codable (textObjects non-optional: fallback to [] when absent)

    private enum CodingKeys: String, CodingKey {
        case background, textStyle, textColor, textPosition, filter, filterIntensity
        case stickers, textAlign, textSize, textBg, textOffsetY
        case stickerObjects, textPositionPoint, drawingData, drawingStrokes
        case backgroundAudioId, backgroundAudioVolume, backgroundAudioStart, backgroundAudioEnd
        case voiceAttachmentId, voiceTranscriptions
        case opening, closing
        case textObjects, mediaObjects, audioPlayerObjects, backgroundAudioVariants
        case thumbHash, backgroundTransform, slideDuration, timelineDuration, clipTransitions
        case canvasAspectRatio
        case musicTrackId, musicStartTime, musicEndTime
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        background = try c.decodeIfPresent(String.self, forKey: .background)
        textStyle = try c.decodeIfPresent(String.self, forKey: .textStyle)
        textColor = try c.decodeIfPresent(String.self, forKey: .textColor)
        textPosition = try c.decodeIfPresent(String.self, forKey: .textPosition)
        filter = try c.decodeIfPresent(String.self, forKey: .filter)
        filterIntensity = try c.decodeIfPresent(Double.self, forKey: .filterIntensity)
        stickers = try c.decodeIfPresent([String].self, forKey: .stickers)
        textAlign = try c.decodeIfPresent(String.self, forKey: .textAlign)
        textSize = try c.decodeIfPresent(CGFloat.self, forKey: .textSize)
        textBg = try c.decodeIfPresent(String.self, forKey: .textBg)
        textOffsetY = try c.decodeIfPresent(CGFloat.self, forKey: .textOffsetY)
        stickerObjects = try c.decodeIfPresent([StorySticker].self, forKey: .stickerObjects)
        textPositionPoint = try c.decodeIfPresent(StoryTextPosition.self, forKey: .textPositionPoint)
        drawingData = try c.decodeIfPresent(Data.self, forKey: .drawingData)
        // Prisme migration : si le nouveau format est absent mais l'ancien existe,
        // on convertit best-effort à la lecture. Les écritures futures émettront
        // uniquement `drawingStrokes` (le composer remet `drawingData = nil`).
        if let strokes = try c.decodeIfPresent([StoryDrawingStroke].self, forKey: .drawingStrokes) {
            drawingStrokes = strokes
        } else if let legacy = drawingData, !legacy.isEmpty {
            drawingStrokes = StoryDrawingStroke.fromLegacyPKDrawing(legacy)
        } else {
            drawingStrokes = nil
        }
        backgroundAudioId = try c.decodeIfPresent(String.self, forKey: .backgroundAudioId)
        backgroundAudioVolume = try c.decodeIfPresent(Float.self, forKey: .backgroundAudioVolume)
        backgroundAudioStart = try c.decodeIfPresent(TimeInterval.self, forKey: .backgroundAudioStart)
        backgroundAudioEnd = try c.decodeIfPresent(TimeInterval.self, forKey: .backgroundAudioEnd)
        voiceAttachmentId = try c.decodeIfPresent(String.self, forKey: .voiceAttachmentId)
        voiceTranscriptions = try c.decodeIfPresent([StoryVoiceTranscription].self, forKey: .voiceTranscriptions)
        opening = try c.decodeIfPresent(StoryTransitionEffect.self, forKey: .opening)
        closing = try c.decodeIfPresent(StoryTransitionEffect.self, forKey: .closing)
        // Lossy per-element decode: one malformed object (another user's story)
        // is skipped rather than dropping the whole collection (or, via the
        // APIPost do/catch above, the whole story's effects).
        textObjects = c.decodeLossyArrayIfPresent([StoryTextObject].self, forKey: .textObjects) ?? []
        mediaObjects = c.decodeLossyArrayIfPresent([StoryMediaObject].self, forKey: .mediaObjects)
        audioPlayerObjects = c.decodeLossyArrayIfPresent([StoryAudioPlayerObject].self, forKey: .audioPlayerObjects)
        backgroundAudioVariants = try c.decodeIfPresent([StoryAudioVariant].self, forKey: .backgroundAudioVariants)
        thumbHash = try c.decodeIfPresent(String.self, forKey: .thumbHash)
        backgroundTransform = try c.decodeIfPresent(StoryBackgroundTransform.self, forKey: .backgroundTransform)
        slideDuration = try c.decodeIfPresent(Float.self, forKey: .slideDuration)
        timelineDuration = try c.decodeIfPresent(Double.self, forKey: .timelineDuration)
        clipTransitions = try c.decodeIfPresent([StoryClipTransition].self, forKey: .clipTransitions)
        canvasAspectRatio = try c.decodeIfPresent(Double.self, forKey: .canvasAspectRatio)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(background, forKey: .background)
        try c.encodeIfPresent(textStyle, forKey: .textStyle)
        try c.encodeIfPresent(textColor, forKey: .textColor)
        try c.encodeIfPresent(textPosition, forKey: .textPosition)
        try c.encodeIfPresent(filter, forKey: .filter)
        try c.encodeIfPresent(filterIntensity, forKey: .filterIntensity)
        try c.encodeIfPresent(stickers, forKey: .stickers)
        try c.encodeIfPresent(textAlign, forKey: .textAlign)
        try c.encodeIfPresent(textSize, forKey: .textSize)
        try c.encodeIfPresent(textBg, forKey: .textBg)
        try c.encodeIfPresent(textOffsetY, forKey: .textOffsetY)
        try c.encodeIfPresent(stickerObjects, forKey: .stickerObjects)
        try c.encodeIfPresent(textPositionPoint, forKey: .textPositionPoint)
        try c.encodeIfPresent(drawingData, forKey: .drawingData)
        try c.encodeIfPresent(drawingStrokes, forKey: .drawingStrokes)
        try c.encodeIfPresent(backgroundAudioId, forKey: .backgroundAudioId)
        try c.encodeIfPresent(backgroundAudioVolume, forKey: .backgroundAudioVolume)
        try c.encodeIfPresent(backgroundAudioStart, forKey: .backgroundAudioStart)
        try c.encodeIfPresent(backgroundAudioEnd, forKey: .backgroundAudioEnd)
        try c.encodeIfPresent(voiceAttachmentId, forKey: .voiceAttachmentId)
        try c.encodeIfPresent(voiceTranscriptions, forKey: .voiceTranscriptions)
        try c.encodeIfPresent(opening, forKey: .opening)
        try c.encodeIfPresent(closing, forKey: .closing)
        try c.encode(textObjects, forKey: .textObjects)
        try c.encodeIfPresent(mediaObjects, forKey: .mediaObjects)
        try c.encodeIfPresent(audioPlayerObjects, forKey: .audioPlayerObjects)
        try c.encodeIfPresent(backgroundAudioVariants, forKey: .backgroundAudioVariants)
        try c.encodeIfPresent(thumbHash, forKey: .thumbHash)
        try c.encodeIfPresent(backgroundTransform, forKey: .backgroundTransform)
        try c.encodeIfPresent(slideDuration, forKey: .slideDuration)
        try c.encodeIfPresent(timelineDuration, forKey: .timelineDuration)
        try c.encodeIfPresent(clipTransitions, forKey: .clipTransitions)
        try c.encodeIfPresent(canvasAspectRatio, forKey: .canvasAspectRatio)
    }

    /// Forme du canvas de ce slide, dérivée de `canvasAspectRatio` (défaut portrait).
    public var canvasAspect: StoryCanvasAspect {
        StoryCanvasAspect.from(ratio: canvasAspectRatio)
    }

    public var parsedTextStyle: StoryTextStyle? {
        guard let raw = textStyle else { return nil }
        return StoryTextStyle(rawValue: raw)
    }

    public var parsedFilter: StoryFilter? {
        guard let raw = filter else { return nil }
        return StoryFilter(rawValue: raw)
    }

    public var resolvedTextPosition: StoryTextPosition {
        if let point = textPositionPoint { return point }
        switch textPosition {
        case "top": return .top
        case "bottom": return .bottom
        default: return .center
        }
    }

    public mutating func migrateLegacyText(content: String) {
        guard textObjects.isEmpty else { return }
        let pos = resolvedTextPosition
        textObjects = [StoryTextObject(
            text: content, x: pos.x, y: pos.y,
            fontSize: Double(textSize ?? 28),
            textStyle: textStyle, textColor: textColor,
            textAlign: textAlign, textBg: textBg
        )]
    }

    // MARK: - Background / Foreground resolution

    /// Retourne le media background résolu.
    /// - `isBackground == true` → cet objet (non-optional post-migration).
    /// - Aucun objet avec `isBackground == true` → `nil`.
    public var resolvedBackgroundMedia: StoryMediaObject? {
        guard let objects = mediaObjects, !objects.isEmpty else { return nil }
        return objects.first(where: { $0.isBackground == true })
    }

    /// `true` quand la slide a un fond VISUEL (média image/vidéo en background).
    /// Dans ce cas, aucun fond coloré (`background` solidColor/gradient) ne doit être
    /// peint — le média couvre le canvas (reader, composer, mini-preview, preview).
    /// Le fond coloré ne s'affiche QUE sans média de fond visuel (texte, dessin,
    /// foreground media, son). Source de vérité unique du Prisme visuel des stories
    /// (user 2026-06-03). NB : le fond legacy `StorySlide.mediaURL` est géré au niveau
    /// `StorySlide`/`StoryRenderer.renderBackground` (cet `effects` ne le porte pas).
    public var hasVisualBackgroundMedia: Bool {
        resolvedBackgroundMedia != nil
    }

    /// Retourne tous les media foreground résolus (exclut le background déterminé par `resolvedBackgroundMedia`).
    public var resolvedForegroundMediaObjects: [StoryMediaObject] {
        guard let objects = mediaObjects, !objects.isEmpty else { return [] }
        if let bg = resolvedBackgroundMedia {
            return objects.filter { $0.id != bg.id }
        }
        return objects
    }

    /// Retourne l'audio background résolu.
    /// - Premier `audioPlayerObjects` avec `isBackground == true` → cet objet.
    /// - Sinon, si aucun audioPlayerObject n'a de flag explicite (tous `nil`) ET
    ///   que la story utilise les champs legacy `backgroundAudioId/Volume/Start/End`,
    ///   synthétise un `StoryAudioPlayerObject` virtuel.
    /// - Un `isBackground: false` explicite sur un audioPlayerObject signale que
    ///   l'utilisateur a manipulé les flags — on ne retombe plus sur la synthèse legacy.
    public var resolvedBackgroundAudio: StoryAudioPlayerObject? {
        if let existing = audioPlayerObjects?.first(where: { $0.isBackground == true }) {
            return existing
        }
        let audiosUntouched = (audioPlayerObjects ?? []).allSatisfy { $0.isBackground == nil }
        guard audiosUntouched, let bgId = backgroundAudioId else { return nil }
        let start = backgroundAudioStart.map { Float($0) }
        let end = backgroundAudioEnd.map { Float($0) }
        let duration: Float? = {
            guard let start, let end, end > start else { return nil }
            return end - start
        }()
        return StoryAudioPlayerObject(
            id: "legacy-bg-audio",
            postMediaId: bgId,
            placement: "background",
            volume: backgroundAudioVolume ?? 0.5,
            waveformSamples: [],
            isBackground: true,
            backgroundAudioVariants: backgroundAudioVariants,
            startTime: start,
            duration: duration,
            loop: true
        )
    }

    /// Retourne uniquement les audios foreground (draggable pills avec UI).
    public var resolvedForegroundAudioPlayers: [StoryAudioPlayerObject] {
        (audioPlayerObjects ?? []).filter { $0.isBackground != true }
    }

    public func toJSON() -> [String: Any] {
        var dict: [String: Any] = [:]
        if let bg = background { dict["background"] = bg }
        if let ts = textStyle { dict["textStyle"] = ts }
        if let tc = textColor { dict["textColor"] = tc }
        if let tp = textPositionPoint {
            dict["textPosition"] = ["x": tp.x, "y": tp.y]
        } else if let tp = textPosition {
            dict["textPosition"] = tp
        }
        if let f = filter { dict["filter"] = f }
        if let so = stickerObjects, !so.isEmpty {
            dict["stickers"] = so.map { s in
                ["emoji": s.emoji, "x": s.x, "y": s.y, "scale": s.scale, "rotation": s.rotation] as [String: Any]
            }
        } else if let st = stickers { dict["stickers"] = st }
        if let aid = backgroundAudioId { dict["backgroundAudioId"] = aid }
        if let vol = backgroundAudioVolume { dict["backgroundAudioVolume"] = vol }
        if let start = backgroundAudioStart { dict["backgroundAudioStart"] = start }
        if let end = backgroundAudioEnd { dict["backgroundAudioEnd"] = end }
        if let vid = voiceAttachmentId { dict["voiceAttachmentId"] = vid }
        if let op = opening { dict["opening"] = op.rawValue }
        if let cl = closing { dict["closing"] = cl.rawValue }
        if let objects = mediaObjects, !objects.isEmpty {
            dict["mediaObjects"] = objects.map { o in
                var d: [String: Any] = ["id": o.id, "postMediaId": o.postMediaId, "mediaType": o.mediaType,
                 "placement": o.placement, "x": o.x, "y": o.y,
                 "scale": o.scale, "rotation": o.rotation, "volume": o.volume]
                d["isBackground"] = o.isBackground
                if let st = o.startTime { d["startTime"] = st }
                if let dur = o.duration { d["duration"] = dur }
                d["loop"] = o.loop
                if let fi = o.fadeIn { d["fadeIn"] = fi }
                if let fo = o.fadeOut { d["fadeOut"] = fo }
                return d
            }
        }
        if let players = audioPlayerObjects, !players.isEmpty {
            dict["audioPlayerObjects"] = players.map { p in
                var d: [String: Any] = ["id": p.id, "postMediaId": p.postMediaId, "placement": p.placement,
                 "x": p.x, "y": p.y, "volume": p.volume,
                 "waveformSamples": p.waveformSamples]
                if let bg = p.isBackground { d["isBackground"] = bg }
                if let variants = p.backgroundAudioVariants, !variants.isEmpty {
                    d["backgroundAudioVariants"] = variants.map { v in
                        ["postMediaId": v.postMediaId, "language": v.language,
                         "isAutoGenerated": v.isAutoGenerated] as [String: Any]
                    }
                }
                if let st = p.startTime { d["startTime"] = st }
                if let dur = p.duration { d["duration"] = dur }
                if let lp = p.loop { d["loop"] = lp }
                if let fi = p.fadeIn { d["fadeIn"] = fi }
                if let fo = p.fadeOut { d["fadeOut"] = fo }
                return d
            }
        }
        if let variants = backgroundAudioVariants, !variants.isEmpty {
            dict["backgroundAudioVariants"] = variants.map { v in
                ["postMediaId": v.postMediaId, "language": v.language,
                 "isAutoGenerated": v.isAutoGenerated] as [String: Any]
            }
        }
        if !textObjects.isEmpty {
            dict["textObjects"] = textObjects.map { t in
                var d: [String: Any] = ["id": t.id, "text": t.text,
                 "x": t.x, "y": t.y, "scale": t.scale, "rotation": t.rotation,
                 "zIndex": t.zIndex, "fontSize": t.fontSize, "fontFamily": t.fontFamily,
                 "anchor": ["x": Double(t.anchor.x), "y": Double(t.anchor.y)]]
                if let tr = t.translations, !tr.isEmpty { d["translations"] = tr }
                if let ts = t.textStyle { d["textStyle"] = ts }
                if let tc = t.textColor { d["textColor"] = tc }
                if let ta = t.textAlign { d["textAlign"] = ta }
                if let bg = t.textBg { d["textBg"] = bg }
                if let st = t.startTime { d["startTime"] = st }
                if let dur = t.duration { d["duration"] = dur }
                if let fi = t.fadeIn { d["fadeIn"] = fi }
                if let fo = t.fadeOut { d["fadeOut"] = fo }
                return d
            }
        }
        if let sd = slideDuration { dict["slideDuration"] = sd }
        if let td = timelineDuration { dict["timelineDuration"] = td }
        return dict
    }
}

// MARK: - Post Type

public enum PostType: String, CaseIterable, Sendable {
    case post = "POST"
    case reel = "REEL"
    case story = "STORY"
    case status = "STATUS"

    public var displayName: String {
        switch self {
        case .post: return "Post"
        case .reel: return "Réel"
        case .story: return "Story"
        case .status: return "Status"
        }
    }

    public var icon: String {
        switch self {
        case .post: return "square.and.pencil"
        case .reel: return "play.rectangle.on.rectangle.fill"
        case .story: return "camera.fill"
        case .status: return "face.smiling"
        }
    }
}

// MARK: - Story Item
public struct StoryItem: Identifiable, Codable, Sendable {
    public let id: String
    public let content: String?
    public let media: [FeedMedia]
    public let storyEffects: StoryEffects?
    public let createdAt: Date
    public let expiresAt: Date?
    public let repostOfId: String?
    public let originalRepostOfId: String?
    public let repostAuthorName: String?
    /// @handle de l'auteur original d'une republication — affiché à la suite
    /// du nom de l'auteur (icône repost + "@handle", sans « via »). Optionnel :
    /// les payloads/rows antérieurs décodent en nil et l'UI retombe sur
    /// `repostAuthorName`.
    public let repostAuthorUsername: String?
    public let visibility: String?
    public let audioUrl: String?
    public var isViewed: Bool
    /// R11 — horodatage du « vu » local (règle CLAUDE.md : DateTime nullable
    /// plutôt que boolean seul). Migration DOUCE : `isViewed` reste décodé du
    /// serveur (qui n'envoie qu'un Bool) ; `viewedAt` est posé côté client au
    /// markViewed et survit au cache GRDB (optionnel → rétro-compatible avec
    /// les rows persistés avant ce champ). Consommateurs futurs : tri des
    /// groupes vus, TTL du pin R5 par date de vue.
    public var viewedAt: Date?
    /// R8 — horodatage serveur de la dernière modification (compteurs,
    /// traductions). Alimente le curseur delta-sync `?updatedSince` : le
    /// « since » du refetch silencieux = max(updatedAt) du cache — état
    /// DÉRIVÉ, aucune source de vérité supplémentaire. Optionnel → migration
    /// douce (rows GRDB et payloads antérieurs à ce champ décodent en nil,
    /// qui désactive simplement le delta au profit du full historique).
    public var updatedAt: Date?
    public let translations: [StoryTranslation]?
    public let backgroundAudio: StoryBackgroundAudioEntry?
    public var reactionCount: Int
    public var commentCount: Int

    /// Count of forwards / external shares (Envoyer button label).
    /// `nil` when the gateway payload pre-dates the enrichment.
    public var shareCount: Int?

    /// Count of viewers who opened this story (author-only "Vues" label).
    /// `nil` for anonymous reads or legacy payloads.
    public var viewCount: Int?

    /// Count of impressions — one per slide display, NOT deduped (mirrors
    /// `Post.impressionCount`). Author-only, paired with `viewCount` so the story
    /// viewer reports the SAME 2 metrics as Detail/Reel (unified 2026-07-14).
    /// `nil` for anonymous reads or legacy payloads/caches.
    public var impressionCount: Int?

    /// Count of reposts that pointed back to this story (Partager label).
    /// `nil` when not yet enriched.
    public var repostCount: Int?

    /// Emojis the *current viewer* (logged-in user) has applied to this story.
    /// `nil` for anonymous reads or for legacy payloads / caches that predate
    /// the enrichment. Source of truth: gateway `PostFeedService.getStories`
    /// — see `packages/shared/types/post.ts` `currentUserReactions`.
    public var currentUserReactions: [String]?

    /// True when the *current viewer* has personally reacted to this story.
    /// Drives "is my heart active" UI affordances (sidebar, mini-status).
    /// Distinct from `reactionCount > 0`, which counts ANY reaction by anyone.
    public var currentUserHasReacted: Bool { !(currentUserReactions ?? []).isEmpty }

    public var timeAgo: String {
        RelativeTimeFormatter.shortString(for: createdAt)
    }

    /// Computed convenience used by C.1 / C.2 to gate the Partager button and kebab items.
    /// Defaults to **false** when visibility is nil (unknown) so we don't accidentally expose
    /// non-public content for repost.
    public var isPublic: Bool {
        (visibility ?? "").uppercased() == "PUBLIC"
    }

    /// Résout le contenu dans la langue préférée via le Prisme Linguistique.
    /// Retourne la traduction si disponible, sinon le contenu original.
    /// Pas de fallback implicite vers l'anglais — l'absence de traduction signifie
    /// que le contenu est deja dans la langue de l'utilisateur OU qu'aucune
    /// traduction n'a ete generee. Voir CLAUDE.md "Prisme Linguistique".
    public func resolvedContent(preferredLanguage: String?) -> String? {
        guard let lang = preferredLanguage,
              let translations = translations, !translations.isEmpty else { return content }
        return translations.first { $0.language == lang }?.content ?? content
    }

    /// R10 — résolution du `content` legacy sur la CHAÎNE de langue COMPLÈTE
    /// (parité avec les textObjects qui la parcourent déjà) : première langue
    /// de la chaîne ayant une traduction. Aucun match → ORIGINAL (Prisme
    /// règle n°1 : jamais `translations.first`).
    public func resolvedContent(preferredLanguages: [String]) -> String? {
        guard let translations, !translations.isEmpty else { return content }
        for lang in preferredLanguages {
            if let hit = translations.first(where: { $0.language == lang })?.content {
                return hit
            }
            let target = StoryPrismeMatch.base(lang)
            if let hit = translations.first(where: { StoryPrismeMatch.base($0.language) == target })?.content {
                return hit
            }
        }
        return content
    }

    public init(id: String, content: String? = nil, media: [FeedMedia] = [], storyEffects: StoryEffects? = nil,
                createdAt: Date = Date(), expiresAt: Date? = nil, repostOfId: String? = nil,
                originalRepostOfId: String? = nil, repostAuthorName: String? = nil,
                repostAuthorUsername: String? = nil,
                visibility: String? = nil, audioUrl: String? = nil,
                isViewed: Bool = false, viewedAt: Date? = nil, updatedAt: Date? = nil, translations: [StoryTranslation]? = nil, backgroundAudio: StoryBackgroundAudioEntry? = nil,
                reactionCount: Int = 0, commentCount: Int = 0,
                shareCount: Int? = nil, viewCount: Int? = nil, impressionCount: Int? = nil, repostCount: Int? = nil,
                currentUserReactions: [String]? = nil) {
        self.id = id; self.content = content; self.media = media; self.storyEffects = storyEffects
        self.createdAt = createdAt; self.expiresAt = expiresAt; self.repostOfId = repostOfId
        self.originalRepostOfId = originalRepostOfId
        self.repostAuthorName = repostAuthorName
        self.repostAuthorUsername = repostAuthorUsername
        self.visibility = visibility; self.audioUrl = audioUrl
        self.isViewed = isViewed; self.viewedAt = viewedAt; self.updatedAt = updatedAt
        self.translations = translations; self.backgroundAudio = backgroundAudio
        self.reactionCount = reactionCount; self.commentCount = commentCount
        self.shareCount = shareCount; self.viewCount = viewCount; self.impressionCount = impressionCount; self.repostCount = repostCount
        self.currentUserReactions = currentUserReactions
    }

    /// A5 — returns `true` when the story has aged past its visibility window.
    ///
    /// Resolution order:
    /// 1. If `expiresAt` is set and is `<= now`, the story is expired.
    /// 2. Otherwise, fall back to the product rule of "stories live 24h" and
    ///    consider the story expired when `createdAt + 24h <= now`.
    ///
    /// Used by the viewer to skip past stale stories the cache may have
    /// surfaced (cache TTL > 24h is intentional so we don't redownload
    /// avatars/text on every cold start, but the *content* must not be
    /// rendered).
    /// G6 — durée de vie d'une story SANS `expiresAt` explicite : alignée sur
    /// la constante serveur `STORY_EXPIRY_HOURS = 21` (PostService.ts) et sur
    /// le fallback client de `toStoryGroups`/`pinDeadline` (createdAt + 21 h).
    /// L'ancien défaut interne de 24 h était un piège dormant : sans effet
    /// tant que le serveur pose toujours `expiresAt`, mais une story au
    /// fallback aurait survécu 3 h de plus que sa vie serveur.
    public static let defaultExpiryInterval: TimeInterval = 21 * 60 * 60

    public func isExpired(at now: Date = Date()) -> Bool {
        if let explicit = expiresAt {
            return explicit <= now
        }
        return createdAt.addingTimeInterval(Self.defaultExpiryInterval) <= now
    }

    /// Prisme realtime : le gateway diffuse les traductions PAR text-object via
    /// `story:translation-updated` (payload `{ postId, textObjectIndex, translations }`).
    /// Retourne une copie de la story avec ces traductions fusionnées dans le
    /// text-object à `index` (les langues existantes sont écrasées, les nouvelles
    /// ajoutées). Index hors borne / pas d'effects / dict vide → `self` inchangé.
    /// `storyEffects` étant immuable (`let`), on reconstruit la `StoryItem` via son
    /// init mémberwise — aucune mutation en place.
    public func mergingTextObjectTranslations(at index: Int, translations: [String: String]) -> StoryItem {
        guard !translations.isEmpty, var effects = storyEffects,
              index >= 0, index < effects.textObjects.count else { return self }
        var object = effects.textObjects[index]
        var merged = object.translations ?? [:]
        for (language, text) in translations { merged[language] = text }
        object.translations = merged
        effects.textObjects[index] = object
        return StoryItem(
            id: id, content: content, media: media, storyEffects: effects,
            createdAt: createdAt, expiresAt: expiresAt, repostOfId: repostOfId,
            originalRepostOfId: originalRepostOfId, repostAuthorName: repostAuthorName,
            repostAuthorUsername: repostAuthorUsername,
            visibility: visibility, audioUrl: audioUrl, isViewed: isViewed,
            translations: self.translations,
            backgroundAudio: backgroundAudio,
            reactionCount: reactionCount, commentCount: commentCount,
            shareCount: shareCount, viewCount: viewCount, repostCount: repostCount,
            currentUserReactions: currentUserReactions
        )
    }
}

// MARK: - Story Group
public struct StoryGroup: Identifiable, Codable, Sendable, CacheIdentifiable {
    public let id: String
    public let username: String
    public let avatarColor: String
    public let avatarURL: String?
    public let stories: [StoryItem]

    /// Snapshot serveur de la présence de l'auteur (payload feed stories,
    /// `storyAuthorSelect` gateway). Sert de résolution IMMÉDIATE à
    /// l'interstitiel d'identité au switch de groupe — l'app peut le
    /// raffiner avec le PresenceManager temps réel quand une entrée existe.
    /// Optionnel → migration douce des caches GRDB et payloads antérieurs.
    public let authorPresence: UserPresence?

    public var hasUnviewed: Bool { stories.contains { !$0.isViewed } }
    public var latestStory: StoryItem? { stories.last }

    /// `true` quand TOUTES les stories du groupe sont expirées (ou le groupe est
    /// vide). Le tray (app) filtre ces groupes : sans ce filtre, une vignette de
    /// groupe entièrement expiré (cache TTL > 24h, ou story expirée en cours de
    /// session sans re-fetch) ouvre puis ferme instantanément le viewer via
    /// `skipExpiredStoriesIfNeeded` (tap-puis-flash). Pur + testable via `now`
    /// explicite. Source de vérité d'expiration : `StoryItem.isExpired(at:)`.
    public func isFullyExpired(at now: Date = Date()) -> Bool {
        stories.allSatisfy { $0.isExpired(at: now) }
    }

    public init(id: String, username: String, avatarColor: String, avatarURL: String? = nil,
                stories: [StoryItem], authorPresence: UserPresence? = nil) {
        self.id = id; self.username = username; self.avatarColor = avatarColor; self.avatarURL = avatarURL
        self.stories = stories; self.authorPresence = authorPresence
    }

    public func with(stories: [StoryItem]) -> StoryGroup {
        StoryGroup(id: id, username: username, avatarColor: avatarColor, avatarURL: avatarURL,
                   stories: stories, authorPresence: authorPresence)
    }
}

// MARK: - Status Entry
public struct StatusEntry: Identifiable, Codable, CacheIdentifiable {
    public let id: String
    public let userId: String
    public let username: String
    public let avatarColor: String
    public let moodEmoji: String
    public let content: String?
    public let audioUrl: String?
    public let createdAt: Date
    public let expiresAt: Date?
    public var visibility: String?
    public var reactionSummary: [String: Int]?
    public let viaUsername: String?

    public var timeRemaining: String {
        guard let expires = expiresAt else { return "" }
        let seconds = Int(expires.timeIntervalSinceNow)
        if seconds <= 0 { return "expired" }
        if seconds < 60 { return "\(seconds)s" }
        return "\(seconds / 60)min"
    }

    public var timeAgo: String {
        let seconds = Int(-createdAt.timeIntervalSinceNow)
        if seconds < 5 { return "il y a quelques secondes" }
        if seconds < 60 { return "il y a \(seconds)s" }
        let minutes = seconds / 60
        if minutes < 60 { return "il y a \(minutes)min" }
        let hours = minutes / 60
        let remainingMin = minutes % 60
        if remainingMin == 0 { return "il y a \(hours)h" }
        return "il y a \(hours)h \(remainingMin)min"
    }

    public init(id: String, userId: String, username: String, avatarColor: String, moodEmoji: String,
                content: String? = nil, audioUrl: String? = nil, createdAt: Date = Date(),
                expiresAt: Date? = nil, visibility: String? = nil, reactionSummary: [String: Int]? = nil,
                viaUsername: String? = nil) {
        self.id = id; self.userId = userId; self.username = username; self.avatarColor = avatarColor
        self.moodEmoji = moodEmoji; self.content = content; self.audioUrl = audioUrl
        self.createdAt = createdAt; self.expiresAt = expiresAt; self.visibility = visibility
        self.reactionSummary = reactionSummary; self.viaUsername = viaUsername
    }
}

// MARK: - API -> Story Group Conversion
extension Array where Element == APIPost {
    public func toStoryGroups(currentUserId: String? = nil) -> [StoryGroup] {
        let storyPosts = self.filter { ($0.type ?? "").uppercased() == "STORY" }
        var grouped: [String: (author: APIAuthor, stories: [StoryItem])] = [:]

        for post in storyPosts {
            let authorId = post.author.id
            // A reposted story carries its media / effects / audio on the original
            // (`repostOf`), not on the repost shell — the shell's own `media` is
            // empty. Mirror `StoryReaderRepresentable.init(repost:)` so the
            // full-screen viewer (which renders from `StoryItem.media` /
            // `storyEffects`) plays the original instead of a blank spinner. The
            // feed embed already resolves this via `RepostContent`; this aligns the
            // tray/viewer path. Reported 2026-06-26 « la republication ne joue pas
            // la story comme si c'était la mienne ».
            //
            // `media` et `storyEffects` sont couplés en une seule décision
            // (`hasOwnContent`) — jamais résolus indépendamment. Les
            // `mediaObjects`/`audioPlayerObjects` des effects référencent
            // leurs médias par `postMediaId` ; mélanger des effects de la
            // SOURCE avec des médias PROPRES casserait silencieusement toute
            // résolution audio/vidéo (même durcissement que `StoryItem
            // (feedPost:)` dans FeedModels.swift — single source de la
            // politique de fallback, post-revue 2026-07-13).
            let repostSource = post.repostOf
            let ownMedia = post.media ?? []
            let hasOwnContent = !ownMedia.isEmpty || post.storyEffects != nil
            // Un repost peut avoir son propre snapshot `media` (nouveaux ids,
            // parfois des URLs relatives cassées) alors que son `storyEffects`
            // OWN référence encore les `postMediaId` ORIGINAUX de `repostOf.media`
            // (le repost copie les effects tels quels sans réécrire les
            // références). Le resolver `media.first(where: { $0.id == postMediaId })`
            // (`toRenderableSlide`, canvas playback) ne trouvait donc jamais
            // l'audio/vidéo de fond référencé → lecture bloquée indéfiniment sur
            // le spinner de stall. Fusionner les deux pools (own d'abord, repostOf
            // en complément dédupliqué par id) garantit que le lookup trouve
            // toujours sa cible, quel que soit le set que les effects référencent
            // — sans changer `hasOwnContent`, qui reste la SEULE décision pour
            // choisir quel `storyEffects` afficher (own vs repostOf, cf. commentaire
            // ci-dessus). Bug user-reporté 2026-07-14 « la story repostée ne se lit pas ».
            let ownMediaIds = Set(ownMedia.map(\.id))
            let repostMedia = (repostSource?.media ?? []).filter { !ownMediaIds.contains($0.id) }
            let mediaSource: [APIPostMedia] = hasOwnContent ? ownMedia + repostMedia : (repostSource?.media ?? [])
            let media: [FeedMedia] = mediaSource.map { m in
                // Propage `thumbnailUrl` + `thumbHash` du gateway — sinon le
                // tray (`StoryTrayView.latestStoryThumbnailURL`) tombe sur
                // `url` (souvent une vidéo) ou sur l'avatar du profil.
                // Bug user-reporté 2026-05-27 « la tray doit montrer la
                // miniature de la dernière story du groupe ».
                FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl,
                          thumbnailUrl: m.thumbnailUrl, thumbHash: m.thumbHash,
                          thumbnailColor: "4ECDC4",
                          width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
            }
            let storyTranslations: [StoryTranslation]? = post.translations.map { dict in
                dict.map { lang, entry in StoryTranslation(language: lang, content: entry.text) }
            }
            let effectiveExpiresAt = post.expiresAt
                ?? Calendar.current.date(byAdding: .hour, value: 21, to: post.createdAt)
            let totalReactions = post.reactionSummary?.values.reduce(0, +) ?? 0
            let item = StoryItem(id: post.id, content: post.content, media: media,
                                 storyEffects: hasOwnContent ? post.storyEffects : repostSource?.storyEffects,
                                 createdAt: post.createdAt, expiresAt: effectiveExpiresAt,
                                 repostOfId: post.repostOf?.id,
                                 originalRepostOfId: post.originalRepostOfId,
                                 repostAuthorName: post.repostOf?.author.name,
                                 repostAuthorUsername: post.repostOf?.author.username,
                                 visibility: post.visibility,
                                 audioUrl: post.audioUrl ?? repostSource?.audioUrl,
                                 isViewed: post.isViewedByMe ?? false,
                                 updatedAt: post.updatedAt,
                                 translations: storyTranslations,
                                 reactionCount: totalReactions, commentCount: post.commentCount ?? 0,
                                 shareCount: post.shareCount,
                                 viewCount: post.viewCount,
                                 impressionCount: post.impressionCount,
                                 repostCount: post.repostCount,
                                 currentUserReactions: post.currentUserReactions)
            if var existing = grouped[authorId] {
                existing.stories.append(item); grouped[authorId] = existing
            } else {
                grouped[authorId] = (author: post.author, stories: [item])
            }
        }

        var groups = grouped.map { (authorId, data) in
            StoryGroup(id: authorId, username: data.author.name,
                       avatarColor: DynamicColorGenerator.colorForName(data.author.name),
                       avatarURL: data.author.avatar,
                       stories: data.stories.sorted { $0.createdAt < $1.createdAt },
                       // Présence embarquée par le payload stories (nil sur les
                       // payloads/caches antérieurs à l'enrichissement gateway).
                       authorPresence: data.author.isOnline.map {
                           UserPresence(isOnline: $0, lastActiveAt: data.author.lastActiveAt)
                       })
        }
        groups.sort { a, b in
            if let uid = currentUserId {
                if a.id == uid { return true }; if b.id == uid { return false }
            }
            if a.hasUnviewed != b.hasUnviewed { return a.hasUnviewed }
            return (a.latestStory?.createdAt ?? .distantPast) > (b.latestStory?.createdAt ?? .distantPast)
        }
        return groups
    }
}

// MARK: - API -> Status Entry Conversion
extension APIPost {
    public func toStatusEntry() -> StatusEntry? {
        guard (type ?? "").uppercased() == "STATUS", let emoji = moodEmoji else { return nil }
        // Attribution "via @X" : un status republié pointe la source via
        // `repostOf` (single source of truth — pas de colonne `viaUsername`
        // dédiée côté gateway). On dérive donc l'attribution de l'auteur du
        // repost quand le champ direct est absent.
        let via = viaUsername ?? repostOf?.author.username
        return StatusEntry(id: id, userId: author.id, username: author.name,
                           avatarColor: DynamicColorGenerator.colorForName(author.name),
                           moodEmoji: emoji, content: content, audioUrl: audioUrl, createdAt: createdAt,
                           expiresAt: expiresAt, viaUsername: via)
    }
}

// MARK: - Reply Context
public enum ReplyContext {
    case story(storyId: String, authorId: String, authorName: String, preview: String,
               publishedAt: Date? = nil, reactionCount: Int? = nil, commentCount: Int? = nil, thumbnailUrl: String? = nil)
    case status(statusId: String, authorId: String, authorName: String, emoji: String, content: String?, publishedAt: Date? = nil)

    /// Identifiant de l'auteur cité — utilisé pour résoudre/ouvrir la DM
    /// correspondante avant d'amorcer la réponse.
    public var authorId: String {
        switch self {
        case .story(_, let authorId, _, _, _, _, _, _): return authorId
        case .status(_, let authorId, _, _, _, _): return authorId
        }
    }

    public var toReplyReference: ReplyReference {
        switch self {
        case .story(let storyId, _, let authorName, let preview, let publishedAt, let reactionCount, let commentCount, let thumbnailUrl):
            return ReplyReference(messageId: storyId, authorName: authorName, previewText: preview, isStoryReply: true,
                                  storyPublishedAt: publishedAt, storyReactionCount: reactionCount, storyCommentCount: commentCount, storyThumbnailUrl: thumbnailUrl)
        case .status(let statusId, _, let authorName, let emoji, let content, let publishedAt):
            // Réponse à un mood : le contenu entier va dans previewText, l'emoji
            // et la date sont portés séparément pour un rendu dédié (emoji +
            // contenu + date). `isStoryReply` reste vrai pour router l'envoi via
            // `storyReplyToId` (le mood est un post côté backend).
            return ReplyReference(messageId: statusId, authorName: authorName,
                                  previewText: content ?? "", isStoryReply: true,
                                  storyPublishedAt: publishedAt, moodEmoji: emoji)
        }
    }
}

// MARK: - Request Models
public struct ReactionRequest: Encodable {
    public let emoji: String
    public init(emoji: String) { self.emoji = emoji }
}

public struct RepostRequest: Encodable {
    public let content: String?
    public let isQuote: Bool
    public let targetType: String?

    public init(content: String? = nil, isQuote: Bool = false, targetType: String? = nil) {
        self.content = content
        self.isQuote = isQuote
        self.targetType = targetType
    }
}

public struct StatusCreateRequest: Encodable {
    public let type = "STATUS"
    public let moodEmoji: String
    public let content: String?
    public let visibility: String
    public let visibilityUserIds: [String]?

    public init(moodEmoji: String, content: String?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil) {
        self.moodEmoji = moodEmoji; self.content = content; self.visibility = visibility; self.visibilityUserIds = visibilityUserIds
    }
}

public struct StoryViewRequest: Encodable {
    public let viewed = true
    public init() {}
}

// MARK: - StorySlide Preview Conversion

extension StorySlide {
    /// Convertit un StorySlide (local, non encore publié) en StoryItem pour la preview.
    /// Les médias sont reconstruits depuis mediaObjects/audioPlayerObjects avec les bons types
    /// pour que le reader puisse les résoudre via postMediaId → story.media.
    public func toPreviewStoryItem() -> StoryItem {
        var mediaEntries: [FeedMedia] = []

        // Legacy background image
        if let url = mediaURL {
            mediaEntries.append(FeedMedia(id: id, type: .image, url: url,
                                          thumbnailColor: "4ECDC4", width: nil, height: nil))
        }

        // Canvas media objects (images + videos)
        if let mediaObjects = effects.mediaObjects {
            for obj in mediaObjects {
                let feedType: FeedMediaType = obj.kind == .video ? .video : .image
                mediaEntries.append(FeedMedia(
                    id: obj.postMediaId.isEmpty ? obj.id : obj.postMediaId,
                    type: feedType,
                    thumbnailColor: "4ECDC4"
                ))
            }
        }

        // Canvas audio player objects
        if let audioObjects = effects.audioPlayerObjects {
            for obj in audioObjects {
                mediaEntries.append(FeedMedia(
                    id: obj.postMediaId.isEmpty ? obj.id : obj.postMediaId,
                    type: .audio,
                    thumbnailColor: "9B59B6"
                ))
            }
        }

        return StoryItem(
            id: id,
            content: content,
            media: mediaEntries,
            storyEffects: effects,
            createdAt: Date(),
            expiresAt: Calendar.current.date(byAdding: .hour, value: 21, to: Date()),
            isViewed: false
        )
    }
}

// MARK: - StoryItem → StorySlide reconstruction (Reader runtime)

extension StoryItem {
    /// Reconstructs a renderable `StorySlide` from a published `StoryItem`.
    /// Resolves `content` via the Prisme Linguistique chain when available.
    /// Used by `StoryReaderRepresentable` to feed the canvas.
    ///
    /// `slide.mediaURL` porte l'URL du fond IMAGE/VIDÉO statique consommée par le
    /// chemin BG legacy de `StoryRenderer.renderBackground` (routée via
    /// `directURLIfAny`). Il vaut :
    /// - `media[0].url` pour une story purement legacy (aucun `mediaObject`) ;
    /// - l'URL de la `media` NON référencée par un objet quand des `mediaObject`
    ///   existent (le backdrop statique d'une story moderne) — voir le détail plus
    ///   bas. Il reste `nil` si tous les `media` sont référencés (foreground-only)
    ///   ou si le fond est un `StoryMediaObject isBackground:true` (traité en amont
    ///   par `renderBackground`), de sorte qu'on ne fournit jamais un post id au
    ///   resolver keyé sur `FeedMedia.id`.
    public func toRenderableSlide(preferredLanguages: [String]) -> StorySlide {
        // R10 — chaîne complète (et plus seulement `.first`) : un viewer
        // fr→es voit la traduction es si la fr manque, au lieu de l'original.
        let resolvedContent = self.resolvedContent(preferredLanguages: preferredLanguages)
                              ?? self.content
        var effects = self.storyEffects ?? StoryEffects()

        // Hydrate media durations depuis `self.media` (FeedMedia côté API)
        // vers `StoryMediaObject.duration` quand celle-ci est nil. Sans
        // ça, `StorySlide.computedTotalDuration()` ne voit pas la durée
        // réelle du media bg pour les stories venues du backend (le
        // composer remplit `StoryMediaObject.duration` localement mais
        // le payload backend ne le réécrit pas — la durée vit dans
        // `FeedMedia` côté API). Fix user-reporté 2026-05-28 « il n'y a
        // plus le respect de la durée des média dynamique ».
        if var medias = effects.mediaObjects, !medias.isEmpty {
            for i in medias.indices {
                let feed = self.media.first(where: { $0.id == medias[i].postMediaId })
                if medias[i].duration == nil, let dur = feed?.duration, dur > 0 {
                    medias[i].duration = Double(dur)
                }
                // Hydrate `aspectRatio` (≈1.0, sentinelle) depuis `FeedMedia
                // .width/height`. Ce n'est PAS un simple repli legacy : le
                // composer stampe TOUJOURS `aspectRatio: 1.0` à l'add-media
                // (`StoryComposerViewModel` ~l.1101, TODO Phase 2/3 « compute
                // real aspectRatio from asset »), donc cette hydratation
                // read-time est la source de dimensionnement PRIMAIRE pour
                // quasi toutes les stories actuelles — sans elle un média
                // non-carré s'affiche squishé (carré) dans le reader alors que
                // le canvas/snapshot le dimensionnent via `aspectRatio`. Les
                // (rares) stories portant déjà un ratio réel ≠ 1.0 ne sont
                // jamais touchées — parité avec l'hydratation de `duration`
                // ci-dessus (fix proportions 2026-06-30).
                if abs(medias[i].aspectRatio - 1.0) < 0.05,
                   let w = feed?.width, let h = feed?.height, w > 0, h > 0 {
                    medias[i].aspectRatio = Double(w) / Double(h)
                }
            }
            effects.mediaObjects = medias
        }
        if var audios = effects.audioPlayerObjects, !audios.isEmpty {
            for i in audios.indices where audios[i].duration == nil {
                if let feed = self.media.first(where: { $0.id == audios[i].postMediaId }),
                   let dur = feed.duration, dur > 0 {
                    audios[i].duration = Float(dur)
                }
            }
            effects.audioPlayerObjects = audios
        }

        // `slide.mediaURL` porte le fond IMAGE/VIDÉO statique (chemin BG legacy
        // de `StoryRenderer.renderBackground`, routé via `directURLIfAny`).
        //
        // - Story purement legacy (aucun `mediaObject`) : le fond vit directement
        //   dans `media[0]` → on le garde.
        // - Story moderne (au moins un `mediaObject`) : un fond photo statique est
        //   une entrée `media` qui n'est référencée par AUCUN objet (foreground,
        //   background, audio ou variante TTS). Si une telle entrée existe, c'est
        //   le backdrop → on route son URL (sinon `renderBackground` retombe sur
        //   `.solidColor(.black)` = fond NOIR sur la story d'un autre). Quand
        //   chaque `media` est référencée (story foreground-only), il n'y a pas de
        //   backdrop statique → `nil`, et le fond vient de `effects.background`.
        //
        // Un fond porté par un `StoryMediaObject isBackground:true` référence sa
        // `media`, donc il n'est jamais choisi ici : `renderBackground` le traite
        // en amont (branche isBackground), et `mediaURL` reste `nil` — pas de
        // double routage ni de post id fourni au resolver keyé sur `FeedMedia.id`.
        let legacyMediaURL: String?
        if let mediaObjects = effects.mediaObjects, !mediaObjects.isEmpty {
            var referencedIds = Set(mediaObjects.map(\.postMediaId))
            for audio in effects.audioPlayerObjects ?? [] {
                referencedIds.insert(audio.postMediaId)
                for variant in audio.backgroundAudioVariants ?? [] {
                    referencedIds.insert(variant.postMediaId)
                }
            }
            legacyMediaURL = self.media.first(where: { !referencedIds.contains($0.id) })?.url
        } else {
            legacyMediaURL = self.media.first?.url
        }
        return StorySlide(
            id: self.id,
            mediaURL: legacyMediaURL,
            content: resolvedContent,
            effects: effects
        )
    }
}

// MARK: - Timeline Project (Snapshot for Command Pattern)

/// Snapshot Codable d'un slide pour le pattern Command (undo/redo).
/// Round-trip garanti : `TimelineProject(from: slide).apply(to: &slide)` est no-op.
public struct TimelineProject: Codable, Sendable {
    public var slideId: String
    public var slideDuration: Float
    public var mediaObjects: [StoryMediaObject]
    public var audioPlayerObjects: [StoryAudioPlayerObject]
    public var textObjects: [StoryTextObject]
    public var clipTransitions: [StoryClipTransition]

    public init(slideId: String,
                slideDuration: Float,
                mediaObjects: [StoryMediaObject] = [],
                audioPlayerObjects: [StoryAudioPlayerObject] = [],
                textObjects: [StoryTextObject] = [],
                clipTransitions: [StoryClipTransition] = []) {
        self.slideId = slideId
        self.slideDuration = slideDuration
        self.mediaObjects = mediaObjects
        self.audioPlayerObjects = audioPlayerObjects
        self.textObjects = textObjects
        self.clipTransitions = clipTransitions
    }

    public init(from slide: StorySlide) {
        self.slideId = slide.id
        // Use the deterministic computed length so the timeline ruler,
        // playhead range and progress bar cover every element — not just
        // the user-typed slide.duration. Without this, a foreground video
        // longer than slide.duration would have its tail unreachable by the
        // scrub bar and clipped on playback / export.
        self.slideDuration = Float(slide.computedTotalDuration())
        self.mediaObjects = slide.effects.mediaObjects ?? []
        self.audioPlayerObjects = slide.effects.audioPlayerObjects ?? []
        self.textObjects = slide.effects.textObjects
        self.clipTransitions = slide.effects.clipTransitions ?? []
    }

    public func apply(to slide: inout StorySlide) {
        // Preserve nil-vs-empty-array idempotence: a project with empty
        // collections must round-trip to a slide with `nil` collections, not
        // `[]`, so `TimelineProject(from: slide).apply(to: &slide)` is a true
        // no-op when the slide had `nil` collections to begin with.
        //
        // Update the slide's duration to match the project's duration. The timeline
        // is AUTHORITATIVE (« la timeline EST la story ») : une durée EXPLICITEMENT
        // configurée par l'auteur (≠ durée auto du contenu) est persistée dans
        // `effects.timelineDuration`, lue EN PRIORITÉ par `computedTotalDuration()`
        // (viewer + canvas + exporter) — permettant d'étendre ET de rogner (12s → 5s).
        // Si la durée timeline == la durée auto du contenu, on NE pose PAS de pin
        // (`nil`) : le slide reste auto-dérivé et se recalcule si le contenu change
        // ensuite (évite un pin obsolète qui figerait une vieille valeur).
        // `slide.duration` reste un miroir legacy.
        slide.duration = TimeInterval(slideDuration)

        slide.effects.mediaObjects = mediaObjects.isEmpty ? nil : mediaObjects
        slide.effects.audioPlayerObjects = audioPlayerObjects.isEmpty ? nil : audioPlayerObjects
        slide.effects.textObjects = textObjects
        slide.effects.clipTransitions = clipTransitions.isEmpty ? nil : clipTransitions

        // Calculé APRÈS l'écriture des arrays pour que `contentDerivedDuration()`
        // reflète le contenu du projet (et non l'ancien contenu du slide).
        let content = slide.contentDerivedDuration()
        slide.effects.timelineDuration =
            (abs(Double(slideDuration) - content) > 0.05) ? Double(slideDuration) : nil
    }
}

// MARK: - Edit Command (Pattern Command for Undo/Redo)

/// Atomic, reversible operation on a `TimelineProject`. Each conforming type
/// captures the minimum delta required to apply and to revert the operation.
public protocol EditCommand: Codable, Sendable {
    var id: String { get }
    var timestamp: Date { get }
    func apply(to project: inout TimelineProject) throws
    func revert(from project: inout TimelineProject) throws
}

/// Errors thrown when applying or reverting an `EditCommand` against a project
/// whose state no longer matches the assumptions captured at command creation.
public enum EditCommandError: Error, Sendable, Equatable {
    case clipNotFound(id: String)
    case transitionNotFound(id: String)
    case keyframeNotFound(id: String)
    case invalidState(reason: String)
}

// MARK: - Timeline Clip Kind (target collection identifier)

/// Identifies which collection of a `TimelineProject` a command targets.
/// `video` and `image` both live in `mediaObjects` but the kind is preserved
/// to drive UI / engine routing without re-deriving from `mediaType`.
public enum TimelineClipKind: String, Codable, CaseIterable, Sendable {
    case video
    case image
    case audio
    case text
}

// MARK: - Edit Commands (12 concrete cases)

public struct AddClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let postMediaId: String
    public let kind: TimelineClipKind
    public let startTime: Float
    public let duration: Float
    public let content: String?
    /// Width / height ratio of the source asset, captured by the caller when
    /// the clip is added (image / video). Frozen into the resulting
    /// `StoryMediaObject` so the canvas can letterbox correctly without
    /// re-resolving the asset. Defaults to `1.0` for callers that don't yet
    /// know the dimensions (and for legacy drafts decoded without this field).
    public let aspectRatio: Double

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                postMediaId: String,
                kind: TimelineClipKind,
                startTime: Float,
                duration: Float,
                content: String? = nil,
                aspectRatio: Double = 1.0) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.postMediaId = postMediaId
        self.kind = kind
        self.startTime = startTime
        self.duration = duration
        self.content = content
        self.aspectRatio = aspectRatio
    }

    private enum CodingKeys: String, CodingKey {
        case id, timestamp, clipId, postMediaId, kind, startTime, duration, content, aspectRatio
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        clipId = try c.decode(String.self, forKey: .clipId)
        postMediaId = try c.decode(String.self, forKey: .postMediaId)
        kind = try c.decode(TimelineClipKind.self, forKey: .kind)
        startTime = try c.decode(Float.self, forKey: .startTime)
        duration = try c.decode(Float.self, forKey: .duration)
        content = try c.decodeIfPresent(String.self, forKey: .content)
        // REQUIRED conceptually but falls back to 1.0 for legacy drafts
        // persisted before this field existed (mirrors StoryMediaObject).
        aspectRatio = try c.decodeIfPresent(Double.self, forKey: .aspectRatio) ?? 1.0
    }

    public func apply(to project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            let mediaType = kind == .video ? "video" : "image"
            project.mediaObjects.append(
                StoryMediaObject(id: clipId, postMediaId: postMediaId,
                                 mediaType: mediaType, placement: "media",
                                 aspectRatio: aspectRatio,
                                 startTime: Double(startTime), duration: Double(duration))
            )
        case .audio:
            project.audioPlayerObjects.append(
                StoryAudioPlayerObject(id: clipId, postMediaId: postMediaId,
                                       placement: "overlay",
                                       waveformSamples: [],
                                       startTime: startTime, duration: duration)
            )
        case .text:
            project.textObjects.append(
                StoryTextObject(id: clipId, text: content ?? "",
                                startTime: Double(startTime),
                                duration: Double(duration))
            )
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            project.mediaObjects.removeAll { $0.id == clipId }
        case .audio:
            project.audioPlayerObjects.removeAll { $0.id == clipId }
        case .text:
            project.textObjects.removeAll { $0.id == clipId }
        }
    }
}

public struct DeleteClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let snapshotMedia: StoryMediaObject?
    public let snapshotAudio: StoryAudioPlayerObject?
    public let snapshotText: StoryTextObject?
    public let insertionIndex: Int

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                snapshotMedia: StoryMediaObject?,
                snapshotAudio: StoryAudioPlayerObject?,
                snapshotText: StoryTextObject?,
                insertionIndex: Int) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.snapshotMedia = snapshotMedia
        self.snapshotAudio = snapshotAudio
        self.snapshotText = snapshotText
        self.insertionIndex = insertionIndex
    }

    public func apply(to project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard project.mediaObjects.contains(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.mediaObjects.removeAll { $0.id == clipId }
        case .audio:
            guard project.audioPlayerObjects.contains(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.audioPlayerObjects.removeAll { $0.id == clipId }
        case .text:
            guard project.textObjects.contains(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.textObjects.removeAll { $0.id == clipId }
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard let snap = snapshotMedia else {
                throw EditCommandError.invalidState(reason: "missing media snapshot")
            }
            let idx = min(insertionIndex, project.mediaObjects.count)
            project.mediaObjects.insert(snap, at: idx)
        case .audio:
            guard let snap = snapshotAudio else {
                throw EditCommandError.invalidState(reason: "missing audio snapshot")
            }
            let idx = min(insertionIndex, project.audioPlayerObjects.count)
            project.audioPlayerObjects.insert(snap, at: idx)
        case .text:
            guard let snap = snapshotText else {
                throw EditCommandError.invalidState(reason: "missing text snapshot")
            }
            let idx = min(insertionIndex, project.textObjects.count)
            project.textObjects.insert(snap, at: idx)
        }
    }
}

public struct MoveClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let oldStartTime: Float
    public let newStartTime: Float

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                oldStartTime: Float,
                newStartTime: Float) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.oldStartTime = oldStartTime
        self.newStartTime = newStartTime
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: newStartTime)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: oldStartTime)
    }

    private func mutate(project: inout TimelineProject, startTime: Float) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.mediaObjects[idx].startTime = Double(startTime)
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.audioPlayerObjects[idx].startTime = startTime
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.textObjects[idx].startTime = Double(startTime)
        }
    }
}

public struct TrimClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let oldStartTime: Float
    public let oldDuration: Float
    public let newStartTime: Float
    public let newDuration: Float

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                oldStartTime: Float,
                oldDuration: Float,
                newStartTime: Float,
                newDuration: Float) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.oldStartTime = oldStartTime
        self.oldDuration = oldDuration
        self.newStartTime = newStartTime
        self.newDuration = newDuration
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: newStartTime, duration: newDuration)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: oldStartTime, duration: oldDuration)
    }

    private func mutate(project: inout TimelineProject,
                        startTime: Float, duration: Float) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.mediaObjects[idx].startTime = Double(startTime)
            project.mediaObjects[idx].duration = Double(duration)
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.audioPlayerObjects[idx].startTime = startTime
            project.audioPlayerObjects[idx].duration = duration
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.textObjects[idx].startTime = Double(startTime)
            project.textObjects[idx].duration = Double(duration)
        }
    }
}

public struct SplitClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let splitAtRelativeTime: Float
    public let leftId: String
    public let rightId: String

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                splitAtRelativeTime: Float,
                leftId: String,
                rightId: String) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.splitAtRelativeTime = splitAtRelativeTime
        self.leftId = leftId
        self.rightId = rightId
    }

    public func apply(to project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            let original = project.mediaObjects[idx]
            let originalStart = original.startTime ?? 0
            let originalDuration = original.duration ?? 0
            let splitD = Double(splitAtRelativeTime)
            var left = original
            left.id = leftId
            left.duration = splitD
            var right = original
            right.id = rightId
            right.startTime = originalStart + splitD
            right.duration = max(0, originalDuration - splitD)
            project.mediaObjects.replaceSubrange(idx...idx, with: [left, right])
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            let original = project.audioPlayerObjects[idx]
            let originalStart = original.startTime ?? 0
            let originalDuration = original.duration ?? 0
            var left = original
            left.id = leftId
            left.duration = splitAtRelativeTime
            var right = original
            right.id = rightId
            right.startTime = originalStart + splitAtRelativeTime
            right.duration = max(0, originalDuration - splitAtRelativeTime)
            project.audioPlayerObjects.replaceSubrange(idx...idx, with: [left, right])
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            let original = project.textObjects[idx]
            let originalStart = Float(original.startTime ?? 0)
            let originalDuration = Float(original.duration ?? 0)
            var left = original
            left.id = leftId
            left.duration = Double(splitAtRelativeTime)
            var right = original
            right.id = rightId
            right.startTime = Double(originalStart + splitAtRelativeTime)
            right.duration = Double(max(0, originalDuration - splitAtRelativeTime))
            project.textObjects.replaceSubrange(idx...idx, with: [left, right])
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard let leftIdx = project.mediaObjects.firstIndex(where: { $0.id == leftId }),
                  let rightIdx = project.mediaObjects.firstIndex(where: { $0.id == rightId }) else {
                throw EditCommandError.clipNotFound(id: leftId)
            }
            let left = project.mediaObjects[leftIdx]
            let right = project.mediaObjects[rightIdx]
            var restored = left
            restored.id = clipId
            restored.duration = (left.duration ?? 0) + (right.duration ?? 0)
            let lower = min(leftIdx, rightIdx)
            let upper = max(leftIdx, rightIdx)
            project.mediaObjects.replaceSubrange(lower...upper, with: [restored])
        case .audio:
            guard let leftIdx = project.audioPlayerObjects.firstIndex(where: { $0.id == leftId }),
                  let rightIdx = project.audioPlayerObjects.firstIndex(where: { $0.id == rightId }) else {
                throw EditCommandError.clipNotFound(id: leftId)
            }
            let left = project.audioPlayerObjects[leftIdx]
            let right = project.audioPlayerObjects[rightIdx]
            var restored = left
            restored.id = clipId
            restored.duration = (left.duration ?? 0) + (right.duration ?? 0)
            let lower = min(leftIdx, rightIdx)
            let upper = max(leftIdx, rightIdx)
            project.audioPlayerObjects.replaceSubrange(lower...upper, with: [restored])
        case .text:
            guard let leftIdx = project.textObjects.firstIndex(where: { $0.id == leftId }),
                  let rightIdx = project.textObjects.firstIndex(where: { $0.id == rightId }) else {
                throw EditCommandError.clipNotFound(id: leftId)
            }
            let left = project.textObjects[leftIdx]
            let right = project.textObjects[rightIdx]
            var restored = left
            restored.id = clipId
            restored.duration = (left.duration ?? 0) + (right.duration ?? 0)
            let lower = min(leftIdx, rightIdx)
            let upper = max(leftIdx, rightIdx)
            project.textObjects.replaceSubrange(lower...upper, with: [restored])
        }
    }
}

public struct AddTransitionCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let transition: StoryClipTransition

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                transition: StoryClipTransition) {
        self.id = id
        self.timestamp = timestamp
        self.transition = transition
    }

    public func apply(to project: inout TimelineProject) throws {
        project.clipTransitions.append(transition)
    }

    public func revert(from project: inout TimelineProject) throws {
        project.clipTransitions.removeAll { $0.id == transition.id }
    }
}

public struct RemoveTransitionCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let transitionId: String
    public let snapshot: StoryClipTransition
    public let insertionIndex: Int

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                transitionId: String,
                snapshot: StoryClipTransition,
                insertionIndex: Int) {
        self.id = id
        self.timestamp = timestamp
        self.transitionId = transitionId
        self.snapshot = snapshot
        self.insertionIndex = insertionIndex
    }

    public func apply(to project: inout TimelineProject) throws {
        guard project.clipTransitions.contains(where: { $0.id == transitionId }) else {
            throw EditCommandError.transitionNotFound(id: transitionId)
        }
        project.clipTransitions.removeAll { $0.id == transitionId }
    }

    public func revert(from project: inout TimelineProject) throws {
        let idx = min(insertionIndex, project.clipTransitions.count)
        project.clipTransitions.insert(snapshot, at: idx)
    }
}

public struct ChangeTransitionCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let transitionId: String
    public let previous: StoryClipTransition
    public let updated: StoryClipTransition

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                transitionId: String,
                previous: StoryClipTransition,
                updated: StoryClipTransition) {
        self.id = id
        self.timestamp = timestamp
        self.transitionId = transitionId
        self.previous = previous
        self.updated = updated
    }

    public func apply(to project: inout TimelineProject) throws {
        guard let idx = project.clipTransitions.firstIndex(where: { $0.id == transitionId }) else {
            throw EditCommandError.transitionNotFound(id: transitionId)
        }
        project.clipTransitions[idx] = updated
    }

    public func revert(from project: inout TimelineProject) throws {
        guard let idx = project.clipTransitions.firstIndex(where: { $0.id == transitionId }) else {
            throw EditCommandError.transitionNotFound(id: transitionId)
        }
        project.clipTransitions[idx] = previous
    }
}

// MARK: - Keyframe array helpers (private to this file)

private extension TimelineProject {
    /// Normalises the keyframes array on a clip so that "no keyframes" is
    /// always represented as `nil` (not `[]`). This canonical form lets
    /// `apply -> revert` produce a project byte-equal to the pre-apply state
    /// even when the original clip had `keyframes == nil` and a single add
    /// would otherwise leave it as `[]` after removal.
    mutating func mutateKeyframes(clipId: String,
                                  kind: TimelineClipKind,
                                  block: (inout [StoryKeyframe]) throws -> Void) throws {
        switch kind {
        case .video, .image:
            guard let idx = mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            var arr = mediaObjects[idx].keyframes ?? []
            try block(&arr)
            mediaObjects[idx].keyframes = arr.isEmpty ? nil : arr
        case .text:
            guard let idx = textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            var arr = textObjects[idx].keyframes ?? []
            try block(&arr)
            textObjects[idx].keyframes = arr.isEmpty ? nil : arr
        case .audio:
            throw EditCommandError.invalidState(reason: "audio clips do not support keyframes")
        }
    }
}

public struct AddKeyframeCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let keyframe: StoryKeyframe

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                keyframe: StoryKeyframe) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.keyframe = keyframe
    }

    public func apply(to project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            arr.append(keyframe)
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            arr.removeAll { $0.id == keyframe.id }
        }
    }
}

public struct MoveKeyframeCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let keyframeId: String
    // Time delta — always-encoded, drives the "scrub a keyframe along the
    // timeline" gesture. Other deltas below are optional (nil = no change)
    // and let the same command type carry KeyframeInspector edits
    // (position / scale / opacity / easing) without exploding the
    // AnyEditCommand enum.
    public let oldTime: Float
    public let newTime: Float
    // Optional transform deltas — `nil` means "no change on this axis".
    // Decoded via `decodeIfPresent` so legacy time-only snapshots persisted
    // before this extension still round-trip cleanly.
    public let oldX: CGFloat?
    public let newX: CGFloat?
    public let oldY: CGFloat?
    public let newY: CGFloat?
    public let oldScale: CGFloat?
    public let newScale: CGFloat?
    public let oldOpacity: CGFloat?
    public let newOpacity: CGFloat?
    public let oldEasing: StoryEasing?
    public let newEasing: StoryEasing?

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                keyframeId: String,
                oldTime: Float,
                newTime: Float,
                oldX: CGFloat? = nil, newX: CGFloat? = nil,
                oldY: CGFloat? = nil, newY: CGFloat? = nil,
                oldScale: CGFloat? = nil, newScale: CGFloat? = nil,
                oldOpacity: CGFloat? = nil, newOpacity: CGFloat? = nil,
                oldEasing: StoryEasing? = nil, newEasing: StoryEasing? = nil) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.keyframeId = keyframeId
        self.oldTime = oldTime
        self.newTime = newTime
        self.oldX = oldX; self.newX = newX
        self.oldY = oldY; self.newY = newY
        self.oldScale = oldScale; self.newScale = newScale
        self.oldOpacity = oldOpacity; self.newOpacity = newOpacity
        self.oldEasing = oldEasing; self.newEasing = newEasing
    }

    private enum CodingKeys: String, CodingKey {
        case id, timestamp, clipId, kind, keyframeId
        case oldTime, newTime
        case oldX, newX, oldY, newY
        case oldScale, newScale
        case oldOpacity, newOpacity
        case oldEasing, newEasing
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.timestamp = try c.decode(Date.self, forKey: .timestamp)
        self.clipId = try c.decode(String.self, forKey: .clipId)
        self.kind = try c.decode(TimelineClipKind.self, forKey: .kind)
        self.keyframeId = try c.decode(String.self, forKey: .keyframeId)
        self.oldTime = try c.decode(Float.self, forKey: .oldTime)
        self.newTime = try c.decode(Float.self, forKey: .newTime)
        self.oldX = try c.decodeIfPresent(CGFloat.self, forKey: .oldX)
        self.newX = try c.decodeIfPresent(CGFloat.self, forKey: .newX)
        self.oldY = try c.decodeIfPresent(CGFloat.self, forKey: .oldY)
        self.newY = try c.decodeIfPresent(CGFloat.self, forKey: .newY)
        self.oldScale = try c.decodeIfPresent(CGFloat.self, forKey: .oldScale)
        self.newScale = try c.decodeIfPresent(CGFloat.self, forKey: .newScale)
        self.oldOpacity = try c.decodeIfPresent(CGFloat.self, forKey: .oldOpacity)
        self.newOpacity = try c.decodeIfPresent(CGFloat.self, forKey: .newOpacity)
        self.oldEasing = try c.decodeIfPresent(StoryEasing.self, forKey: .oldEasing)
        self.newEasing = try c.decodeIfPresent(StoryEasing.self, forKey: .newEasing)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(clipId, forKey: .clipId)
        try c.encode(kind, forKey: .kind)
        try c.encode(keyframeId, forKey: .keyframeId)
        try c.encode(oldTime, forKey: .oldTime)
        try c.encode(newTime, forKey: .newTime)
        try c.encodeIfPresent(oldX, forKey: .oldX)
        try c.encodeIfPresent(newX, forKey: .newX)
        try c.encodeIfPresent(oldY, forKey: .oldY)
        try c.encodeIfPresent(newY, forKey: .newY)
        try c.encodeIfPresent(oldScale, forKey: .oldScale)
        try c.encodeIfPresent(newScale, forKey: .newScale)
        try c.encodeIfPresent(oldOpacity, forKey: .oldOpacity)
        try c.encodeIfPresent(newOpacity, forKey: .newOpacity)
        try c.encodeIfPresent(oldEasing, forKey: .oldEasing)
        try c.encodeIfPresent(newEasing, forKey: .newEasing)
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, direction: .forward)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, direction: .backward)
    }

    private enum Direction { case forward, backward }

    private func mutate(project: inout TimelineProject, direction: Direction) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            guard let idx = arr.firstIndex(where: { $0.id == keyframeId }) else {
                throw EditCommandError.keyframeNotFound(id: keyframeId)
            }
            // Time is always tracked (legacy field). Other deltas only mutate
            // when both sides of the pair are non-nil, so a "scale-only" edit
            // doesn't accidentally clear x/y/opacity.
            arr[idx].time = (direction == .forward) ? newTime : oldTime
            if let nx = newX, let ox = oldX { arr[idx].x = (direction == .forward) ? nx : ox }
            if let ny = newY, let oy = oldY { arr[idx].y = (direction == .forward) ? ny : oy }
            if let ns = newScale, let os = oldScale {
                arr[idx].scale = (direction == .forward) ? ns : os
            }
            if let no = newOpacity, let oo = oldOpacity {
                arr[idx].opacity = (direction == .forward) ? no : oo
            }
            if let ne = newEasing, let oe = oldEasing {
                arr[idx].easing = (direction == .forward) ? ne : oe
            }
        }
    }
}

public struct DeleteKeyframeCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let keyframeId: String
    public let snapshot: StoryKeyframe
    public let insertionIndex: Int

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                keyframeId: String,
                snapshot: StoryKeyframe,
                insertionIndex: Int) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.keyframeId = keyframeId
        self.snapshot = snapshot
        self.insertionIndex = insertionIndex
    }

    public func apply(to project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            guard arr.contains(where: { $0.id == keyframeId }) else {
                throw EditCommandError.keyframeNotFound(id: keyframeId)
            }
            arr.removeAll { $0.id == keyframeId }
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            let idx = min(insertionIndex, arr.count)
            arr.insert(snapshot, at: idx)
        }
    }
}

public struct SetClipPropertyCommand: EditCommand {
    public enum ClipProperty: Codable, Sendable, Equatable {
        case volume(old: Float, new: Float)
        case fadeIn(old: Double?, new: Double?)
        case fadeOut(old: Double?, new: Double?)
        case loop(old: Bool?, new: Bool?)
        case isBackground(old: Bool?, new: Bool?)
        case isLocked(old: Bool?, new: Bool?)

        private enum CodingKeys: String, CodingKey {
            case type, oldFloat, newFloat, oldBool, newBool
        }

        private enum Tag: String, Codable {
            case volume, fadeIn, fadeOut, loop, isBackground, isLocked
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let tag = try c.decode(Tag.self, forKey: .type)
            switch tag {
            case .volume:
                let old = try c.decode(Float.self, forKey: .oldFloat)
                let new = try c.decode(Float.self, forKey: .newFloat)
                self = .volume(old: old, new: new)
            case .fadeIn:
                let old = try c.decodeIfPresent(Double.self, forKey: .oldFloat)
                let new = try c.decodeIfPresent(Double.self, forKey: .newFloat)
                self = .fadeIn(old: old, new: new)
            case .fadeOut:
                let old = try c.decodeIfPresent(Double.self, forKey: .oldFloat)
                let new = try c.decodeIfPresent(Double.self, forKey: .newFloat)
                self = .fadeOut(old: old, new: new)
            case .loop:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .loop(old: old, new: new)
            case .isBackground:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isBackground(old: old, new: new)
            case .isLocked:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isLocked(old: old, new: new)
            }
        }

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case .volume(let old, let new):
                try c.encode(Tag.volume, forKey: .type)
                try c.encode(old, forKey: .oldFloat)
                try c.encode(new, forKey: .newFloat)
            case .fadeIn(let old, let new):
                try c.encode(Tag.fadeIn, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldFloat)
                try c.encodeIfPresent(new, forKey: .newFloat)
            case .fadeOut(let old, let new):
                try c.encode(Tag.fadeOut, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldFloat)
                try c.encodeIfPresent(new, forKey: .newFloat)
            case .loop(let old, let new):
                try c.encode(Tag.loop, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isBackground(let old, let new):
                try c.encode(Tag.isBackground, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isLocked(let old, let new):
                try c.encode(Tag.isLocked, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            }
        }
    }

    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let property: ClipProperty

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                property: ClipProperty) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.property = property
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, useNew: true)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, useNew: false)
    }

    private func mutate(project: inout TimelineProject, useNew: Bool) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.mediaObjects[idx], useNew: useNew)
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.audioPlayerObjects[idx], useNew: useNew)
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.textObjects[idx], useNew: useNew)
        }
    }

    private func apply(property: ClipProperty,
                       to media: inout StoryMediaObject,
                       useNew: Bool) {
        switch property {
        case .volume(let old, let new):
            media.volume = useNew ? new : old
        case .fadeIn(let old, let new):
            media.fadeIn = useNew ? new : old
        case .fadeOut(let old, let new):
            media.fadeOut = useNew ? new : old
        case .loop(let old, let new):
            media.loop = (useNew ? new : old) ?? false
        case .isBackground(let old, let new):
            media.isBackground = (useNew ? new : old) ?? false
        case .isLocked:
            break
        }
    }

    private func apply(property: ClipProperty,
                       to audio: inout StoryAudioPlayerObject,
                       useNew: Bool) {
        switch property {
        case .volume(let old, let new):
            audio.volume = useNew ? new : old
        case .fadeIn(let old, let new):
            let val: Double? = useNew ? new : old
            audio.fadeIn = val.map { Float($0) }
        case .fadeOut(let old, let new):
            let val: Double? = useNew ? new : old
            audio.fadeOut = val.map { Float($0) }
        case .loop(let old, let new):
            audio.loop = useNew ? new : old
        case .isBackground(let old, let new):
            audio.isBackground = useNew ? new : old
        case .isLocked:
            break
        }
    }

    private func apply(property: ClipProperty,
                       to text: inout StoryTextObject,
                       useNew: Bool) {
        switch property {
        case .isLocked(let old, let new):
            text.isLocked = useNew ? new : old
        case .fadeIn(let old, let new):
            let val: Double? = useNew ? new : old
            text.fadeIn = val
        case .fadeOut(let old, let new):
            let val: Double? = useNew ? new : old
            text.fadeOut = val
        case .volume, .loop, .isBackground:
            break
        }
    }
}

// MARK: - Story Easing (Timeline V2)

/// Easing curve applied between two interpolated values (transitions, keyframes).
/// All curves map [0, 1] -> [0, 1] monotonically with `apply(0) == 0` and `apply(1) == 1`.
public enum StoryEasing: String, Codable, CaseIterable, Sendable {
    case linear
    case easeIn
    case easeOut
    case easeInOut

    public func apply(_ t: Float) -> Float {
        switch self {
        case .linear:
            return t
        case .easeIn:
            return t * t
        case .easeOut:
            return 1 - (1 - t) * (1 - t)
        case .easeInOut:
            return t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
        }
    }
}

// MARK: - Story Transition Kind (Timeline V2)

/// Kind of inter-clip transition rendered by the timeline compositor.
/// Launch-supported: `crossfade` (opacity ramp) and `dissolve` (CIDissolveTransition mask).
/// Future: `push`, `wipe`, `swipeLeft`, `swipeRight`, `zoomIn`, `zoomOut`.
public enum StoryTransitionKind: String, Codable, CaseIterable, Sendable {
    case crossfade
    case dissolve
}

// MARK: - Story Clip Transition (Timeline V2)

/// Transition between two adjacent clips of the same slide (intra-slide).
/// Distinct from `StoryTransitionEffect` which is the inter-slide opening/closing animation.
public struct StoryClipTransition: Codable, Identifiable, Sendable {
    public let id: String
    public let fromClipId: String
    public let toClipId: String
    public let kind: StoryTransitionKind
    public let duration: Float
    public let easing: StoryEasing?

    public init(id: String = UUID().uuidString,
                fromClipId: String,
                toClipId: String,
                kind: StoryTransitionKind,
                duration: Float,
                easing: StoryEasing? = nil) {
        self.id = id
        self.fromClipId = fromClipId
        self.toClipId = toClipId
        self.kind = kind
        self.duration = duration
        self.easing = easing
    }
}

// MARK: - Story Keyframe (Timeline V2)

/// Single keyframe for animating an object's position / scale / opacity over time.
/// `time` is the offset (seconds) relative to the owning object's `startTime`.
/// All transform fields are optional — only non-nil fields are interpolated.
///
/// Note de déviation par rapport au spec §2.1 : `time` est `var` (mutable) et non
/// `let`, car `MoveKeyframeCommand` (Task 19) doit pouvoir muter ce champ pour
/// l'undo/redo. `id` reste `let`. Aucune propagation visible côté consumer car
/// `StoryKeyframe` reste un value type (les copies sont indépendantes).
public struct StoryKeyframe: Codable, Identifiable, Sendable {
    public let id: String
    public var time: Float
    public var x: CGFloat?
    public var y: CGFloat?
    public var scale: CGFloat?
    public var opacity: CGFloat?
    public var easing: StoryEasing?

    public init(id: String = UUID().uuidString,
                time: Float,
                x: CGFloat? = nil,
                y: CGFloat? = nil,
                scale: CGFloat? = nil,
                opacity: CGFloat? = nil,
                easing: StoryEasing? = nil) {
        self.id = id
        self.time = time
        self.x = x
        self.y = y
        self.scale = scale
        self.opacity = opacity
        self.easing = easing
    }
}

// MARK: - AnyEditCommand (type-erased Codable wrapper)

/// Type-erased wrapper around `EditCommand` allowing the 12 concrete command
/// types to be persisted as a single homogeneous array (`CommandStack`).
/// Encoded as `{"type": "<tag>", "payload": <concrete>}`.
public enum AnyEditCommand: Codable, Sendable {
    case addClip(AddClipCommand)
    case deleteClip(DeleteClipCommand)
    case moveClip(MoveClipCommand)
    case trimClip(TrimClipCommand)
    case splitClip(SplitClipCommand)
    case addTransition(AddTransitionCommand)
    case removeTransition(RemoveTransitionCommand)
    case changeTransition(ChangeTransitionCommand)
    case addKeyframe(AddKeyframeCommand)
    case moveKeyframe(MoveKeyframeCommand)
    case deleteKeyframe(DeleteKeyframeCommand)
    case setClipProperty(SetClipPropertyCommand)

    public var underlying: any EditCommand {
        switch self {
        case .addClip(let c):           return c
        case .deleteClip(let c):        return c
        case .moveClip(let c):          return c
        case .trimClip(let c):          return c
        case .splitClip(let c):         return c
        case .addTransition(let c):     return c
        case .removeTransition(let c):  return c
        case .changeTransition(let c):  return c
        case .addKeyframe(let c):       return c
        case .moveKeyframe(let c):      return c
        case .deleteKeyframe(let c):    return c
        case .setClipProperty(let c):   return c
        }
    }

    public func apply(to project: inout TimelineProject) throws {
        try underlying.apply(to: &project)
    }

    public func revert(from project: inout TimelineProject) throws {
        try underlying.revert(from: &project)
    }

    public var typeTag: String {
        switch self {
        case .addClip:           return "addClip"
        case .deleteClip:        return "deleteClip"
        case .moveClip:          return "moveClip"
        case .trimClip:          return "trimClip"
        case .splitClip:         return "splitClip"
        case .addTransition:     return "addTransition"
        case .removeTransition:  return "removeTransition"
        case .changeTransition:  return "changeTransition"
        case .addKeyframe:       return "addKeyframe"
        case .moveKeyframe:      return "moveKeyframe"
        case .deleteKeyframe:    return "deleteKeyframe"
        case .setClipProperty:   return "setClipProperty"
        }
    }

    private enum CodingKeys: String, CodingKey {
        case type, payload
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let tag = try c.decode(String.self, forKey: .type)
        switch tag {
        case "addClip":
            self = .addClip(try c.decode(AddClipCommand.self, forKey: .payload))
        case "deleteClip":
            self = .deleteClip(try c.decode(DeleteClipCommand.self, forKey: .payload))
        case "moveClip":
            self = .moveClip(try c.decode(MoveClipCommand.self, forKey: .payload))
        case "trimClip":
            self = .trimClip(try c.decode(TrimClipCommand.self, forKey: .payload))
        case "splitClip":
            self = .splitClip(try c.decode(SplitClipCommand.self, forKey: .payload))
        case "addTransition":
            self = .addTransition(try c.decode(AddTransitionCommand.self, forKey: .payload))
        case "removeTransition":
            self = .removeTransition(try c.decode(RemoveTransitionCommand.self, forKey: .payload))
        case "changeTransition":
            self = .changeTransition(try c.decode(ChangeTransitionCommand.self, forKey: .payload))
        case "addKeyframe":
            self = .addKeyframe(try c.decode(AddKeyframeCommand.self, forKey: .payload))
        case "moveKeyframe":
            self = .moveKeyframe(try c.decode(MoveKeyframeCommand.self, forKey: .payload))
        case "deleteKeyframe":
            self = .deleteKeyframe(try c.decode(DeleteKeyframeCommand.self, forKey: .payload))
        case "setClipProperty":
            self = .setClipProperty(try c.decode(SetClipPropertyCommand.self, forKey: .payload))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: c,
                debugDescription: "Unknown AnyEditCommand type: \(tag)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(typeTag, forKey: .type)
        switch self {
        case .addClip(let v):           try c.encode(v, forKey: .payload)
        case .deleteClip(let v):        try c.encode(v, forKey: .payload)
        case .moveClip(let v):          try c.encode(v, forKey: .payload)
        case .trimClip(let v):          try c.encode(v, forKey: .payload)
        case .splitClip(let v):         try c.encode(v, forKey: .payload)
        case .addTransition(let v):     try c.encode(v, forKey: .payload)
        case .removeTransition(let v):  try c.encode(v, forKey: .payload)
        case .changeTransition(let v):  try c.encode(v, forKey: .payload)
        case .addKeyframe(let v):       try c.encode(v, forKey: .payload)
        case .moveKeyframe(let v):      try c.encode(v, forKey: .payload)
        case .deleteKeyframe(let v):    try c.encode(v, forKey: .payload)
        case .setClipProperty(let v):   try c.encode(v, forKey: .payload)
        }
    }
}
