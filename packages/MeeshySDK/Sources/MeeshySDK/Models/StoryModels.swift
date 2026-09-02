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
    // ── Extension à 18 familles (2026-08-20) ─────────────────────────────
    // `italic` et `retro` ne sont PAS des inventions : c'est le vocabulaire
    // HISTORIQUE du lecteur (`fontForStyle`, chemin texte simple), que des
    // stories publiées portent déjà sans que le composer sache le produire —
    // sur le canvas ces valeurs retombaient en `.bold` via `parsedTextStyle`.
    // Les cinq autres complètent la famille à 18, toutes sur des polices
    // EMBARQUÉES iOS (vérifiées par test : chaque nom PostScript doit
    // résoudre, sinon le repli serif rendrait la typo invisible).
    // Ajoutées EN QUEUE : l'ordre de `allCases` est l'ordre du cycle
    // d'attributs et des pickers — insérer au milieu déplacerait les habitudes.
    case italic
    case retro
    case elegant
    case poster
    case bubble
    case note
    case brush

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
        case .italic: return "Italique"
        case .retro: return "Rétro"
        case .elegant: return "Élégant"
        case .poster: return "Affiche"
        case .bubble: return "Bulle"
        case .note: return "Note"
        case .brush: return "Pinceau"
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
        case .italic: return "Georgia-Italic"
        case .retro: return "AmericanTypewriter"
        case .elegant: return "Didot"
        case .poster: return "AvenirNextCondensed-Heavy"
        case .bubble: return "ArialRoundedMTBold"
        case .note: return "Noteworthy-Bold"
        case .brush: return "BradleyHandITCTT-Bold"
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
        case .italic: return 400
        case .retro: return 400
        case .elegant: return 400
        case .poster: return 800
        case .bubble: return 700
        case .note: return 700
        case .brush: return 700
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
    case none        // aucune boîte, quels que soient le fond et le liseré
    case rounded     // cornerRadius ≈ 15% of height (default)
    case pill        // full capsule (cornerRadius = 50% of height)
    case rectangle   // near-square corners
    case diamond     // losange (path-based)
    case cloud       // bulle de pensée nuage (path-based)
    case speech      // bulle de conversation BD avec queue (path-based)

    /// Les formes historiques se rendent par `cornerRadius` sur la calque ;
    /// les nouvelles formes passent par un tracé `CGPath` dédié (losange,
    /// nuage, bulle BD). Le renderer et l'export s'appuient sur ce flag pour
    /// choisir le pipeline.
    public var usesCustomPath: Bool {
        switch self {
        case .none, .rounded, .pill, .rectangle: return false
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

    /// Multiplicateur de la marge du cadre — l'espace entre les glyphes et le
    /// bord de la boîte. `nil` ⇒ 1.0, la marge historique. Un multiplicateur
    /// et non des points : la marge automatique vaut « au moins la chasse d'un
    /// *o* », elle dépend donc de la police ET de la taille — une valeur
    /// absolue deviendrait fausse au premier changement de l'une des deux.
    public var framePaddingScale: Double?

    /// Liseré tracé sur le bord de la boîte de cadre, en design-pixels.
    /// `nil` ou `0` ⇒ aucun liseré. À ne pas confondre avec `borderWidth`,
    /// qui contoure les GLYPHES et non la boîte.
    public var frameBorderWidth: Double?
    /// Couleur du liseré de la boîte. `nil` ⇒ blanc dès que la largeur > 0.
    public var frameBorderColor: String?

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
    /// Optional author-assigned clip name (persisted, backward-compatible).
    public var name: String?

    /// `User.id` quand cet objet EST un badge de référence, `nil` pour du texte
    /// libre.
    ///
    /// Sans lui, la dérivation INLINE côté serveur relit le badge comme une
    /// mention de texte et écrase le mode choisi par l'auteur : un badge est un
    /// objet texte portant `@pseudo`, indistinguable d'une phrase. Il sert aussi
    /// au rendu, qui traite un badge comme une étiquette tappable.
    public var referenceUserId: String?

    enum CodingKeys: String, CodingKey {
        case id, text, x, y, scale, rotation, zIndex, anchor
        case fontSize, fontFamily
        case textStyle, textColor, textAlign, textBg, backgroundStyle
        case fontWeight, frameShape
        case framePaddingScale, frameBorderWidth, frameBorderColor
        case borderColor, borderWidth
        case translations, sourceLanguage
        case startTime, duration, fadeIn, fadeOut
        case isLocked, keyframes, name, referenceUserId
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
                framePaddingScale: Double? = nil,
                frameBorderWidth: Double? = nil,
                frameBorderColor: String? = nil,
                borderColor: String? = nil,
                borderWidth: Double? = nil,
                translations: [String: String]? = nil,
                sourceLanguage: String? = nil,
                startTime: Double? = nil,
                duration: Double? = nil,
                fadeIn: Double? = nil,
                fadeOut: Double? = nil,
                isLocked: Bool? = nil,
                keyframes: [StoryKeyframe]? = nil,
                name: String? = nil) {
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
        self.framePaddingScale = framePaddingScale
        self.frameBorderWidth = frameBorderWidth
        self.frameBorderColor = frameBorderColor
        self.borderColor = borderColor; self.borderWidth = borderWidth
        self.translations = translations
        self.sourceLanguage = sourceLanguage
        self.startTime = startTime; self.duration = duration
        self.fadeIn = fadeIn; self.fadeOut = fadeOut
        self.isLocked = isLocked
        self.keyframes = keyframes
        self.name = name
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
        framePaddingScale = try c.decodeIfPresent(Double.self, forKey: .framePaddingScale)
        frameBorderWidth = try c.decodeIfPresent(Double.self, forKey: .frameBorderWidth)
        frameBorderColor = try c.decodeIfPresent(String.self, forKey: .frameBorderColor)
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
        name = try c.decodeIfPresent(String.self, forKey: .name)
        referenceUserId = try c.decodeIfPresent(String.self, forKey: .referenceUserId)
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
        try c.encodeIfPresent(framePaddingScale, forKey: .framePaddingScale)
        try c.encodeIfPresent(frameBorderWidth, forKey: .frameBorderWidth)
        try c.encodeIfPresent(frameBorderColor, forKey: .frameBorderColor)
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
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(referenceUserId, forKey: .referenceUserId)
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

    /// Marge du cadre effectivement appliquée, bornée à 0…3. Le bornage vit
    /// ici et non dans la vue : un JSON hostile ou un curseur futur ne doivent
    /// pas pouvoir faire exploser les bounds du calque.
    public var resolvedFramePaddingScale: Double {
        min(3, max(0, framePaddingScale ?? 1))
    }

    /// Le texte porte-t-il une boîte de cadre ? Source de vérité unique,
    /// partagée par le calque, les tests et les panneaux d'outils.
    ///
    /// La boîte existe dès qu'une forme est choisie ET qu'il y a quelque chose
    /// à voir — un fond, un liseré, ou les deux. C'est ce qui détache le cadre
    /// du fond : avant, sans fond il n'y avait pas de boîte, donc choisir une
    /// forme forçait un fond noir et repeignait le texte sans qu'on l'ait
    /// demandé.
    public var hasFrameBox: Bool {
        guard parsedFrameShape != StoryTextFrameShape.none else { return false }
        if resolvedBackgroundStyle != StoryTextBackgroundStyle.none { return true }
        return (frameBorderWidth ?? 0) > 0
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
    ///
    /// Delegates to the SSOT `MeeshyUser.normalizeLanguageForDedup` — the same
    /// case-fold + region-strip (with primary-subtag fallback) used by the
    /// last-message-preview resolver and mirrored on TS/Kotlin. Kept as a thin
    /// alias rather than a second hand-rolled split: this used to inline its own
    /// `.split(...).first ?? code.lowercased()`, a divergent twin of the
    /// preview resolver's canon that the Prisme forbids (one rule, one site).
    static func base(_ code: String) -> String {
        MeeshyUser.normalizeLanguageForDedup(code)
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
    /// Niveau mémorisé au moment du mute un-bouton (`toggleMute()`), pour que
    /// l'unmute RESTAURE le réglage de l'auteur au lieu de forcer 1.0.
    /// Auteur-local : persiste dans les drafts ET voyage au fil, dans le
    /// payload v3 permissif de l'objet (`CanvasV3Migration.mediaPayload`,
    /// arbitrage 1 — brouillon jamais lossy, constat 4).
    /// `nil` dès que `volume > 0` — l'invariant est maintenu par
    /// `setVolumePreservingMuteMemento(_:)`.
    public var mutedVolumeMemento: Float?

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

    /// Point d'entrée dans la SOURCE, en secondes. `nil` = depuis le début.
    public var sourceStart: Double?
    /// Point de sortie dans la SOURCE, en secondes. `nil` = jusqu'à la fin.
    public var sourceEnd: Double?

    // Heritage (kept)
    public var sourceLanguage: String?
    /// Optional author-assigned clip name (persisted, backward-compatible).
    public var name: String?
    // Timeline V2 — animation keyframes (position/scale/opacity)
    public var keyframes: [StoryKeyframe]?
    /// Coupe l'atténuation automatique de CE clip quand un audio de fond joue
    /// sur la même slide (cf. `StoryVolume.duckingFactor`).
    ///
    /// Optionnel à dessein : aucune story déjà publiée ne porte ce champ, et
    /// son absence doit se lire « atténuation active », le comportement par
    /// défaut. Un dialogue filmé est le cas qui justifie de la couper : la
    /// musique doit alors passer sous la voix, pas l'inverse.
    public var isDuckingDisabled: Bool?
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
        case x, y, scale, rotation, volume, mutedVolumeMemento
        case aspectRatio, anchor, intrinsicDuration
        case isBackground, loop, zIndex
        case startTime, duration, fadeIn, fadeOut
        case sourceStart, sourceEnd
        case sourceLanguage, keyframes, thumbHash, name
        case isDuckingDisabled
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
                thumbHash: String? = nil,
                name: String? = nil,
                isDuckingDisabled: Bool? = nil,
                sourceStart: Double? = nil,
                sourceEnd: Double? = nil) {
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
        self.sourceStart = sourceStart; self.sourceEnd = sourceEnd
        self.sourceLanguage = sourceLanguage
        self.keyframes = keyframes
        self.thumbHash = thumbHash
        self.name = name
        self.isDuckingDisabled = isDuckingDisabled
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
        // Rétro-compat : les drafts antérieurs au mute un-bouton n'ont pas la
        // clé — l'absence se lit « aucun niveau mémorisé ».
        mutedVolumeMemento = try c.decodeIfPresent(Float.self, forKey: .mutedVolumeMemento)
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
        sourceStart = try c.decodeIfPresent(Double.self, forKey: .sourceStart)
        sourceEnd = try c.decodeIfPresent(Double.self, forKey: .sourceEnd)
        sourceLanguage = try c.decodeIfPresent(String.self, forKey: .sourceLanguage)
        keyframes = try c.decodeIfPresent([StoryKeyframe].self, forKey: .keyframes)
        // Decoder clamp : `didSet` ne se déclenche pas pendant init, donc on
        // applique la limite explicitement pour protéger contre un payload
        // malformé / malveillant (slide effects JSON externe → cache disque).
        let rawThumbHash = try c.decodeIfPresent(String.self, forKey: .thumbHash)
        thumbHash = (rawThumbHash?.count ?? 0) > Self.maxThumbHashLength ? nil : rawThumbHash
        name = try c.decodeIfPresent(String.self, forKey: .name)
        isDuckingDisabled = try c.decodeIfPresent(Bool.self, forKey: .isDuckingDisabled)
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
        try c.encodeIfPresent(mutedVolumeMemento, forKey: .mutedVolumeMemento)
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
        try c.encodeIfPresent(sourceStart, forKey: .sourceStart)
        try c.encodeIfPresent(sourceEnd, forKey: .sourceEnd)
        try c.encodeIfPresent(sourceLanguage, forKey: .sourceLanguage)
        try c.encodeIfPresent(keyframes, forKey: .keyframes)
        try c.encodeIfPresent(thumbHash, forKey: .thumbHash)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(isDuckingDisabled, forKey: .isDuckingDisabled)
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
                thumbHash: String? = nil,
                name: String? = nil,
                isDuckingDisabled: Bool? = nil,
                sourceStart: Double? = nil,
                sourceEnd: Double? = nil) {
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
                  thumbHash: thumbHash,
                  name: name,
                  isDuckingDisabled: isDuckingDisabled,
                  sourceStart: sourceStart,
                  sourceEnd: sourceEnd)
    }
}

// MARK: - Story Audio Player Object (player waveform sur canvas)

public struct StoryAudioPlayerObject: Codable, Identifiable, Sendable {
    public var id: String
    public var postMediaId: String      // référence PostMedia en DB
    /// URL de l'asset — miroir de `StoryMediaObject.mediaURL`.
    ///
    /// `postMediaId` seul n'est adressable que par un consommateur qui possède
    /// l'index `postMediaId → URL` (le reader via `postMediaURLResolver`, le
    /// composer via ses caches de session). L'exporteur, lui, ne reçoit qu'un
    /// `StorySlide` : sans cette URL, les chemins « Partager » et « Enregistrer
    /// dans Photos » ne pouvaient pas retrouver le son et bakaient un MP4 muet.
    /// Hydratée depuis `FeedMedia` par `StoryItem.toRenderableSlide` quand elle
    /// n'a pas été persistée.
    public var mediaURL: String?
    public var placement: String        // kept for backward compat; no longer drives rendering
    public var x: CGFloat              // normalisé 0–1
    public var y: CGFloat
    public var volume: Float           // 0.0–1.0
    /// Niveau mémorisé au moment du mute un-bouton — miroir de
    /// `StoryMediaObject.mutedVolumeMemento` (mêmes invariants, cf. le
    /// protocole `StoryVolumeCarrying`). Persiste dans le payload v3 de
    /// l'objet audio (`CanvasV3Migration.audioPayload`), au même titre que
    /// le média (arbitrage 1, brouillon jamais lossy).
    public var mutedVolumeMemento: Float?
    public var waveformSamples: [Float] // ~80 samples extraits à la composition
    /// Quand true, ce player audio joue en fond (boucle infinie, pas de UI pill draggable,
    /// ducking automatique quand un audio foreground joue). Un seul audio peut être en
    /// background par slide. Synthétisé au chargement si la story utilise les anciens
    /// champs `backgroundAudioId/Volume/Start/End`.
    public var isBackground: Bool?
    /// Variantes TTS par langue (rattachées à l'audio background historiquement).
    public var backgroundAudioVariants: [StoryAudioVariant]?
    /// Z-order persistent (cf. `StoryTextObject.zIndex`).
    /// **Tout objet de scène se REDIMENSIONNE et TOURNE** (directive porteur
    /// 2026-08-31, #4591) :
    ///
    /// > « Dans la V3, tout `MeeshySceneObject` a ces détails. Tout objet sur la
    /// > scène peut scale et roter. Il n'existe sur la scène que des
    /// > `MeeshySceneObject`. Il faut donc migrer. »
    ///
    /// **Le contrat V3 le disait déjà**, et depuis toujours :
    /// `packages/shared/types/canvas-v3.ts` déclare `transform: { scale,
    /// rotation, opacity }` en champ REQUIS de tout `ObjectV3`, et le
    /// convertisseur du gateway fabriquait `scale: 1, rotation: 0` pour l'audio
    /// — précisément parce que ce modèle ne les portait pas.
    ///
    /// > L'asymétrie n'était pas une vérité produit, c'était un TROU de ce
    /// > modèle-ci, que le convertisseur bouchait en silence. Documenter un trou
    /// > comme une intention le rend permanent.
    ///
    /// Additif et rétro-compatible : `decodeIfPresent ?? défaut` restitue
    /// exactement ce que le convertisseur fabriquait, donc aucune publication
    /// existante ne change d'apparence.
    /// Optionnels SUR LE FIL, non-optionnels sur la SCÈNE.
    ///
    /// `StoryAudioPlayerObject` n'a pas de codec manuel : le décodeur synthétisé
    /// de Swift **n'utilise pas les valeurs par défaut** d'une propriété — c'est
    /// pourquoi les quatre autres familles ont un `decodeIfPresent(...) ?? 0`
    /// écrit à la main pour `zIndex`. Déclarer `scale: Double = 1` ici l'aurait
    /// rendu OBLIGATOIRE dans le JSON, et toute publication existante aurait
    /// cessé de se décoder.
    ///
    /// `nil` signifie donc « absent du fil », et `MeeshySceneObject` le résout
    /// en `1` et `0` — **les mêmes défauts que le convertisseur V3 du gateway
    /// fabrique déjà** (`num(o.scale, 1)`, `num(o.rotation, 0)`). Le fil ne
    /// change pas ; c'est la SCÈNE qui devient uniforme.
    public var scale: Double?
    public var rotation: Double?

    public var zIndex: Int?

    // Timeline timing
    public var startTime: Float?            // offset en secondes (défaut 0)
    public var duration: Float?             // durée de lecture (nil = jusqu'à la fin)
    public var loop: Bool?                  // boucle automatique
    public var fadeIn: Float?               // fade-in (secondes)
    public var fadeOut: Float?              // fade-out (secondes)
    /// Point d'entrée dans la SOURCE, en secondes. `nil` = depuis le début.
    public var sourceStart: Double?
    /// Point de sortie dans la SOURCE, en secondes. `nil` = jusqu'à la fin.
    public var sourceEnd: Double?
    public var sourceLanguage: String?
    /// Optional author-assigned clip name (persisted, backward-compatible).
    public var name: String?
    /// Automation par keyframes, parité avec `StoryMediaObject.keyframes`.
    /// Seul le canal `volume` a un sens pour un son : sa position `x`/`y`
    /// existe dans le modèle mais ne pilote aucun rendu.
    public var keyframes: [StoryKeyframe]?
    /// Son EMPRUNTÉ à la bibliothèque, quand la piste ne vient pas d'un média
    /// téléversé dans ce post.
    ///
    /// Le serveur s'en sert pour enregistrer un `SoundUsage` **sans** capturer
    /// de nouveau son ni recréditer qui que ce soit : c'est ce qui distingue
    /// « j'utilise le son d'un autre » de « je publie mon son ».
    ///
    /// `postMediaId` reste vide dans ce cas — la résolution de l'URL passe par
    /// `mediaURL`, hydratée depuis le DTO du son.
    public var soundId: String?
    /// @pseudo de l'uploadeur du son EMPRUNTÉ, gravé au moment du choix dans
    /// la bibliothèque : le reader et l'export lisent un `StorySlide`
    /// hors-ligne et ne peuvent pas re-résoudre le crédit à l'affichage.
    /// `nil` pour une piste propre (soundId nil) et pour les stories publiées
    /// avant ce champ.
    public var soundAuthorUsername: String?

    enum CodingKeys: String, CodingKey {
        case id, postMediaId, mediaURL, placement, x, y, volume, waveformSamples
        case mutedVolumeMemento
        case isBackground, backgroundAudioVariants, zIndex
        case scale, rotation
        case startTime, duration, loop, fadeIn, fadeOut, sourceLanguage, name
        case sourceStart, sourceEnd
        case keyframes
        // ⚠ Le `CodingKeys` de ce type est EXPLICITE : ajouter une propriété
        // sans ajouter son `case` compile sans le moindre avertissement, et le
        // champ n'est alors ni encodé ni décodé — le son emprunté serait perdu
        // à la publication, en silence.
        case soundId
        case soundAuthorUsername
    }

    public init(id: String = UUID().uuidString, postMediaId: String = "",
                placement: String = "overlay",
                x: CGFloat = 0.5, y: CGFloat = 0.8,
                volume: Float = 1.0, waveformSamples: [Float] = [],
                isBackground: Bool? = nil,
                backgroundAudioVariants: [StoryAudioVariant]? = nil,
                startTime: Float? = nil, duration: Float? = nil,
                loop: Bool? = nil, fadeIn: Float? = nil, fadeOut: Float? = nil,
                sourceLanguage: String? = nil,
                name: String? = nil,
                keyframes: [StoryKeyframe]? = nil,
                mediaURL: String? = nil,
                soundId: String? = nil,
                soundAuthorUsername: String? = nil,
                sourceStart: Double? = nil,
                sourceEnd: Double? = nil) {
        self.soundId = soundId
        self.soundAuthorUsername = soundAuthorUsername
        self.id = id; self.postMediaId = postMediaId
        self.mediaURL = mediaURL
        self.placement = placement; self.x = x; self.y = y
        self.volume = volume; self.waveformSamples = waveformSamples
        self.isBackground = isBackground
        self.backgroundAudioVariants = backgroundAudioVariants
        self.startTime = startTime; self.duration = duration
        self.loop = loop; self.fadeIn = fadeIn; self.fadeOut = fadeOut
        self.sourceStart = sourceStart; self.sourceEnd = sourceEnd
        self.sourceLanguage = sourceLanguage
        self.name = name
        self.keyframes = keyframes
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

// MARK: - Story Slide

public struct StorySlide: Identifiable, Codable, Sendable {
    public var id: String
    public var mediaURL: String?
    public var mediaData: Data?
    public var content: String?
    public var effects: StoryEffects
    public var duration: TimeInterval
    public var order: Int

    /// Pastilles de lieu posées sur cette slide. Hors timeline (pas de
    /// `startTime`/`duration`) : toujours visibles tant que la slide l'est.
    ///
    /// Simple accès ergonomique : le STOCKAGE est `effects.locationObjects`,
    /// parce que `StoryEffects` est la seule unité que le dépôt persiste
    /// (`StoryDraftStore` n'écrit que `effects_json`) et envoie au serveur
    /// (`PostService.createStory(content:storyEffects:)`). Un champ propre au
    /// `StorySlide` disparaissait à chaque enregistrement de brouillon, à la
    /// publication, et dans les cinq sites qui reconstruisent un slide depuis
    /// ses seuls `storyEffects` (édition, repost, `StoryItem.asSlide`, chargement
    /// de brouillon, cover receveur).
    public var locationObjects: [StoryLocationObject] {
        get { effects.locationObjects }
        set { effects.locationObjects = newValue }
    }

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

extension StoryEffects {
    /// Core "longest data wins" rule, extracted from `StorySlide.contentDerivedDuration()`
    /// so `TimelineProject` (which carries the same three arrays but isn't a
    /// `StorySlide`) can call the identical algorithm during live editing —
    /// see `TimelineViewModel.recomputeSlideDuration()`. Pure function, no
    /// change in behavior versus the code it replaces (design doc 2026-07-18).
    public static func contentDerivedDuration(
        mediaObjects: [StoryMediaObject]?,
        audioPlayerObjects: [StoryAudioPlayerObject]?,
        textObjects: [StoryTextObject]
    ) -> TimeInterval {
        let bgVideoDur = mediaObjects?
            .first(where: { $0.isBackground && $0.kind == .video })?
            .duration
        let bgAudioDur = audioPlayerObjects?
            .first(where: { $0.isBackground == true })?
            .duration
            .map { Double($0) }

        let totalWords = textObjects.reduce(0) { acc, text in
            acc + text.text.split(separator: " ").count
        }
        let textDur: TimeInterval = {
            guard totalWords > StorySlide.longTextThresholdWords else {
                return StorySlide.defaultStaticDuration
            }
            let extraWords = totalWords - StorySlide.longTextThresholdWords
            return StorySlide.defaultStaticDuration
                + Double(extraWords) * StorySlide.longTextSecondsPerWord
        }()

        let mediaWindows = (mediaObjects ?? [])
            .compactMap { media in media.duration.map { (media.startTime ?? 0) + $0 } }
        let audioWindows = (audioPlayerObjects ?? [])
            .compactMap { audio in audio.duration.map { Double($0) + Double(audio.startTime ?? 0) } }
        let longestData = (mediaWindows + audioWindows).max() ?? 0

        let target = max(textDur, StorySlide.defaultStaticDuration, longestData)

        let bgLoopPeriods = [bgVideoDur, bgAudioDur].compactMap { $0 }.filter { $0 > 0.001 }
        let bgResult: TimeInterval = bgLoopPeriods.reduce(target) { effective, period in
            let extended = period >= target ? period : (target / period).rounded(.up) * period
            return max(effective, extended)
        }

        return max(bgResult, longestData)
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
        // Core algorithm lives on `StoryEffects.contentDerivedDuration(...)` so
        // `TimelineProject` (same three arrays, not a `StorySlide`) can call it
        // too during live editing — see `TimelineViewModel.recomputeSlideDuration()`.
        StoryEffects.contentDerivedDuration(
            mediaObjects: effects.mediaObjects,
            audioPlayerObjects: effects.audioPlayerObjects,
            textObjects: effects.textObjects
        )
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

/// Les constantes de rendu ne vivent PAS ici : elles sont sur `StoryRenderer`
/// (`slideTransitionDuration`, `zoomTransitionScale`, `slideTransitionTravelFraction`),
/// lues à l'identique par l'aperçu du composer, le lecteur et l'export.
///
/// Les commentaires de ce bloc ont porté pendant un temps des valeurs propres —
/// 0,3 s / scale 0,92 / décalage Y+30 — héritées de la ré-implémentation SwiftUI
/// du lecteur. Elles CONTREDISAIENT le SDK dans le sens même de l'effet (0,92
/// zoome, quand le SDK dézoome depuis 1,08 ; Y+30 glisse verticalement, quand le
/// SDK glisse horizontalement d'une fraction de la largeur). C'est exactement la
/// divergence que `StoryOpeningParityTests` verrouille. Décrire ici un COMPORTEMENT
/// et non des nombres est ce qui empêche la contradiction de revenir par la doc.
public enum StoryTransitionEffect: String, Codable, CaseIterable, Sendable {
    /// Fondu : l'opacité monte de 0 à 1 à l'entrée, et redescend à la sortie.
    case fade
    /// Zoom : DÉzoome à l'entrée (part au-dessus de 1 et retombe), rezoome à la sortie.
    case zoom
    /// Glissement HORIZONTAL : entre depuis le bord d'attaque, sort par le bord opposé.
    case slide
    /// Révélation circulaire : un masque circulaire s'élargit à l'entrée, se resserre à la sortie.
    case reveal

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
    /// Forme-objet `{type: …}` du convertisseur gateway v3, préservée telle
    /// quelle pour le pont B2 : `slideUp` et consorts n'ont pas de cas enum.
    /// Décodée seulement — jamais ré-encodée dans le JSON v1.
    var openingWire: [String: CanvasJSONValue]?
    var closingWire: [String: CanvasJSONValue]?

    /// Mémos WIRE par objet (clé = id de l'objet) — ce que le DOCUMENT v3
    /// porte et qu'aucune famille runtime v1 ne sait loger. Internes comme
    /// `openingWire` : jamais encodés en v1, jamais persistés hors du pont,
    /// réémis fidèlement au réencodage.
    /// - `wireBandEdge` : une ancre de BANDE n'a pas de position libre ; sans
    ///   mémo, l'aller-retour la convertirait en position libre et détruirait
    ///   la mise en page d'un réel à bandes.
    /// - `wireTimingEnd` : borne de fin, absente des familles v1.
    /// - `wireAnchorPoint` : pivot NOMMÉ tel que le v1/le document le porte —
    ///   sans lui, le pont devrait fabriquer la clé par heuristique.
    /// - `wireMissingZIndex` : ids dont le blob v1 ne portait AUCUN `zIndex`.
    ///   Les familles le décodent à 0, donc l'absence y est indiscernable d'un
    ///   0 posé par l'auteur ; sans mémo le pont ne pourrait pas offrir le
    ///   compteur d'insertion du convertisseur gateway (`z++`) sans écraser un
    ///   rang légitime. Vide par défaut : un runtime COMPOSÉ (jamais décodé)
    ///   porte ses propres rangs et les garde.
    var wireBandEdge: [String: ObjectAnchor.Edge]?
    var wireTimingEnd: [String: Double]?
    var wireAnchorPoint: [String: String]?

    /// **Les kinds d'un document PLUS RÉCENT que ce build** (vue `2j`, #4088).
    ///
    /// Le décodeur les garde en `ObjectKind.reserved(raw)` — « le SDK ne perd
    /// jamais un kind qu'un futur serveur accepterait » — puis la conversion les
    /// SAUTE (`case .mention, .reserved: continue`). Sans ce mémo, le lecteur
    /// reçoit une scène AMPUTÉE et n'a aucun moyen de le savoir : il peint ce
    /// qui reste comme si c'était la composition de l'auteur.
    ///
    /// > C'est le seul des quatre mémos qui ne serve pas la fidélité de
    /// > l'aller-retour, mais **la vérité dite au LECTEUR**. Les trois autres
    /// > empêchent de perdre à l'écriture ; celui-ci empêche de MENTIR à la
    /// > lecture.
    ///
    /// `.mention` n'y entre pas : c'est un kind CONNU que la scène ne peint
    /// délibérément pas (une mention est une métadonnée). Confondre les deux
    /// ferait rougir la sentinelle sur toutes les stories mentionnant quelqu'un.
    var wireUnpaintableKinds: [String]?

    /// Les kinds que ce build ne sait pas peindre — vide quand la scène est
    /// intégralement rendue. Lecture PUBLIQUE du mémo ci-dessus : le lecteur
    /// vit app-side et doit pouvoir poser la question.
    public var unpaintableKinds: [String] { wireUnpaintableKinds ?? [] }

    /// **La scène porte-t-elle du contenu que ce build ne sait pas peindre ?**
    ///
    /// UN seul objet suffit. Peindre la scène amputée serait pire que de dire
    /// la rupture : l'auteur n'a pas composé ça, et rien ne le signalerait.
    public var carriesUnpaintableContent: Bool { !unpaintableKinds.isEmpty }
    var wireMissingZIndex: Set<String>?

    // Objets canvas composites
    public var textObjects: [StoryTextObject]
    /// Pastilles de lieu posées sur la slide (hors timeline). Portées par les
    /// EFFETS — la seule unité que `StoryDraftStore` persiste (`effects_json`)
    /// et que `PostService.createStory` envoie au serveur. Non-optionnel comme
    /// `textObjects` : `[]` quand la clef est absente (stories antérieures).
    public var locationObjects: [StoryLocationObject]
    public var mediaObjects: [StoryMediaObject]?
    public var audioPlayerObjects: [StoryAudioPlayerObject]?
    public var backgroundAudioVariants: [StoryAudioVariant]?
    /// ThumbHash of the composite canvas screenshot (computed client-side at publish time)
    public var thumbHash: String?

    /// Document v3 tel que le FIL l'a servi — SNAPSHOT DE LECTURE, jamais une
    /// source d'encodage : `encode(to:)` repart toujours du runtime courant,
    /// sans quoi une story éditée réémettrait le document d'origine et
    /// perdrait l'édition en silence. `nil` = le fil a servi du legacy v1.
    public var canvasV3: CanvasV3?

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
                locationObjects: [StoryLocationObject] = [],
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
        self.locationObjects = locationObjects
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
        case textObjects, locationObjects, mediaObjects, audioPlayerObjects, backgroundAudioVariants
        case thumbHash, backgroundTransform, slideDuration, timelineDuration, clipTransitions
        case canvasAspectRatio
        case musicTrackId, musicStartTime, musicEndTime
        case v
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let mark = try c.decodeIfPresent(Int.self, forKey: .v), mark >= 3 {
            let document = try CanvasV3(from: decoder)
            self = StoryEffects(rendering: document, sceneIndex: 0)
            canvasV3 = document
            return
        }
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
        let openingDecoded = Self.decodeTransition(c, .opening)
        opening = openingDecoded.effect
        openingWire = openingDecoded.wire
        let closingDecoded = Self.decodeTransition(c, .closing)
        closing = closingDecoded.effect
        closingWire = closingDecoded.wire
        // Lossy per-element decode: one malformed object (another user's story)
        // is skipped rather than dropping the whole collection (or, via the
        // APIPost do/catch above, the whole story's effects).
        textObjects = c.decodeLossyArrayIfPresent([StoryTextObject].self, forKey: .textObjects) ?? []
        locationObjects = c.decodeLossyArrayIfPresent([StoryLocationObject].self, forKey: .locationObjects) ?? []
        mediaObjects = c.decodeLossyArrayIfPresent([StoryMediaObject].self, forKey: .mediaObjects)
        audioPlayerObjects = c.decodeLossyArrayIfPresent([StoryAudioPlayerObject].self, forKey: .audioPlayerObjects)
        backgroundAudioVariants = try c.decodeIfPresent([StoryAudioVariant].self, forKey: .backgroundAudioVariants)
        thumbHash = try c.decodeIfPresent(String.self, forKey: .thumbHash)
        backgroundTransform = try c.decodeIfPresent(StoryBackgroundTransform.self, forKey: .backgroundTransform)
        slideDuration = try c.decodeIfPresent(Float.self, forKey: .slideDuration)
        timelineDuration = try c.decodeIfPresent(Double.self, forKey: .timelineDuration)
        clipTransitions = try c.decodeIfPresent([StoryClipTransition].self, forKey: .clipTransitions)
        canvasAspectRatio = try c.decodeIfPresent(Double.self, forKey: .canvasAspectRatio)
        wireAnchorPoint = Self.stickerAnchorPoints(c)
        wireMissingZIndex = Self.idsWithoutZIndex(c)
    }

    /// Les familles v1 décodent `zIndex` à 0 quand la clé manque : seule une
    /// lecture BRUTE distingue « rang absent » de « rang 0 ».
    private static func idsWithoutZIndex(
        _ c: KeyedDecodingContainer<CodingKeys>
    ) -> Set<String>? {
        let families: [CodingKeys] = [.textObjects, .mediaObjects, .stickerObjects,
                                      .locationObjects, .audioPlayerObjects]
        let ids = families.flatMap { key -> [String] in
            guard let raw = try? c.decodeIfPresent([[String: CanvasJSONValue]].self,
                                                   forKey: key) else { return [] }
            return raw.compactMap { object -> String? in
                guard case .string(let id)? = object["id"] else { return nil }
                if case .number? = object["zIndex"] { return nil }
                return id
            }
        }
        return ids.isEmpty ? nil : Set(ids)
    }

    /// Le pivot NOMMÉ d'un sticker v1 (`anchorPoint`) n'a pas de propriété
    /// dans `StorySticker` : sans cette lecture brute, le pont ne pourrait
    /// que le fabriquer ou le perdre.
    private static func stickerAnchorPoints(
        _ c: KeyedDecodingContainer<CodingKeys>
    ) -> [String: String]? {
        guard let raw = try? c.decodeIfPresent([[String: CanvasJSONValue]].self,
                                               forKey: .stickerObjects) else { return nil }
        let pairs = raw.compactMap { object -> (String, String)? in
            guard case .string(let id)? = object["id"],
                  case .string(let point)? = object["anchorPoint"] else { return nil }
            return (id, point)
        }
        return pairs.isEmpty ? nil : Dictionary(pairs, uniquingKeysWith: { _, last in last })
    }

    /// Une transition v1 Swift est une CHAÎNE (`"fade"`) ; celle du
    /// convertisseur gateway est un OBJET (`{"type":"fade"}`), au vocabulaire
    /// plus large que l'enum. Les deux formes décodent, l'inconnue vaut `nil`
    /// (tolérance) — l'objet est conservé dans `openingWire`/`closingWire`.
    private static func decodeTransition(
        _ c: KeyedDecodingContainer<CodingKeys>,
        _ key: CodingKeys
    ) -> (effect: StoryTransitionEffect?, wire: [String: CanvasJSONValue]?) {
        if let effect = try? c.decodeIfPresent(StoryTransitionEffect.self, forKey: key) {
            return (effect, nil)
        }
        guard let wire = try? c.decodeIfPresent([String: CanvasJSONValue].self, forKey: key) else {
            return (nil, nil)
        }
        guard case .string(let raw)? = wire["type"],
              let effect = StoryTransitionEffect(rawValue: raw) else {
            return (nil, wire)
        }
        return (effect, wire)
    }

    /// Le fil n'accepte plus que le canvas v3 : l'encodage part TOUJOURS du
    /// runtime courant, jamais du `canvasV3` mémorisé — une composition neuve
    /// (aucun document servi) et une story éditée émettent donc l'une comme
    /// l'autre l'état réel du canvas.
    public func encode(to encoder: Encoder) throws {
        try CanvasV3(migrating: self).encode(to: encoder)
    }

    /// Forme v1 COMPLÈTE des effets — l'empreinte LOCALE dont l'écran dépend.
    /// Le canvas v3 absorbe le ratio, le thumbHash et le stylage racine ; le
    /// composer, lui, doit repeindre dès que l'un d'eux bouge. Jamais envoyée
    /// au fil : `encode(to:)` reste la seule voie du réseau.
    public var runtimeSnapshot: RuntimeSnapshot { RuntimeSnapshot(effects: self) }

    public struct RuntimeSnapshot: Encodable {
        public let effects: StoryEffects

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encodeIfPresent(effects.background, forKey: .background)
            try c.encodeIfPresent(effects.textStyle, forKey: .textStyle)
            try c.encodeIfPresent(effects.textColor, forKey: .textColor)
            try c.encodeIfPresent(effects.textPosition, forKey: .textPosition)
            try c.encodeIfPresent(effects.filter, forKey: .filter)
            try c.encodeIfPresent(effects.filterIntensity, forKey: .filterIntensity)
            try c.encodeIfPresent(effects.stickers, forKey: .stickers)
            try c.encodeIfPresent(effects.textAlign, forKey: .textAlign)
            try c.encodeIfPresent(effects.textSize, forKey: .textSize)
            try c.encodeIfPresent(effects.textBg, forKey: .textBg)
            try c.encodeIfPresent(effects.textOffsetY, forKey: .textOffsetY)
            try c.encodeIfPresent(effects.stickerObjects, forKey: .stickerObjects)
            try c.encodeIfPresent(effects.textPositionPoint, forKey: .textPositionPoint)
            try c.encodeIfPresent(effects.drawingData, forKey: .drawingData)
            try c.encodeIfPresent(effects.drawingStrokes, forKey: .drawingStrokes)
            try c.encodeIfPresent(effects.backgroundAudioId, forKey: .backgroundAudioId)
            try c.encodeIfPresent(effects.backgroundAudioVolume, forKey: .backgroundAudioVolume)
            try c.encodeIfPresent(effects.backgroundAudioStart, forKey: .backgroundAudioStart)
            try c.encodeIfPresent(effects.backgroundAudioEnd, forKey: .backgroundAudioEnd)
            try c.encodeIfPresent(effects.voiceAttachmentId, forKey: .voiceAttachmentId)
            try c.encodeIfPresent(effects.voiceTranscriptions, forKey: .voiceTranscriptions)
            try c.encodeIfPresent(effects.opening, forKey: .opening)
            try c.encodeIfPresent(effects.closing, forKey: .closing)
            try c.encode(effects.textObjects, forKey: .textObjects)
            try c.encode(effects.locationObjects, forKey: .locationObjects)
            try c.encodeIfPresent(effects.mediaObjects, forKey: .mediaObjects)
            try c.encodeIfPresent(effects.audioPlayerObjects, forKey: .audioPlayerObjects)
            try c.encodeIfPresent(effects.backgroundAudioVariants, forKey: .backgroundAudioVariants)
            try c.encodeIfPresent(effects.thumbHash, forKey: .thumbHash)
            try c.encodeIfPresent(effects.backgroundTransform, forKey: .backgroundTransform)
            try c.encodeIfPresent(effects.slideDuration, forKey: .slideDuration)
            try c.encodeIfPresent(effects.timelineDuration, forKey: .timelineDuration)
            try c.encodeIfPresent(effects.clipTransitions, forKey: .clipTransitions)
            try c.encodeIfPresent(effects.canvasAspectRatio, forKey: .canvasAspectRatio)
        }
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
}

// MARK: - Post Type

public enum PostType: String, CaseIterable, Sendable {
    case post = "POST"
    case reel = "REEL"
    case story = "STORY"
    case status = "STATUS"

    public var displayName: String {
        switch self {
        case .post: return String(localized: "content.type.post", defaultValue: "Post", bundle: .main)
        case .reel: return String(localized: "content.type.reel", defaultValue: "Réel", bundle: .main)
        case .story: return String(localized: "content.type.story", defaultValue: "Story", bundle: .main)
        case .status: return String(localized: "content.type.status", defaultValue: "Statut", bundle: .main)
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

/// **Comment un post AFFICHE ses médias (directive 2026-08-27).**
///
/// La structure existe **dès maintenant** pour porter la règle, mais elle n'a
/// **aucune interface** et **aucun autre choix** pour l'instant : la présentation
/// se DÉRIVE entièrement du type via `default(for:)` — carousel pour un POST,
/// diapositives horizontales pour un RÉEL. Un futur champ par post pourra la
/// surcharger sans changer ce point unique.
public enum PostMediaPresentation: String, CaseIterable, Sendable, Codable {
    /// Défaut POST — les médias défilent en carrousel.
    case carousel
    /// Défaut RÉEL — les médias défilent en diapositives horizontales.
    case horizontalSlides

    /// La SEULE règle pour l'instant : dérivée du type de post. Aucun autre
    /// choix possible, aucune UI — carousel partout sauf le réel, qui glisse
    /// à l'horizontale.
    public static func `default`(for postType: PostType) -> PostMediaPresentation {
        switch postType {
        case .reel: return .horizontalSlides
        case .post, .story, .status: return .carousel
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
    /// `var` (et non `let`) pour la mise à jour optimiste du menu « Modifier
    /// la visibilité » : muter en place, comme `isViewed`, plutôt que
    /// reconstruire via une init partielle qui droppait ~13 champs.
    public var visibility: String?
    /// Ids ciblés (`ONLY`) ou exclus (`EXCEPT`). Optionnel → les rows GRDB et
    /// payloads antérieurs décodent en `nil` sans migration.
    public var visibilityUserIds: [String]?
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
    /// Horodatage serveur de la dernière édition de CONTENU (texte /
    /// storyEffects / médias) — distinct d'`updatedAt`, qui bouge sur CHAQUE
    /// écriture (compteurs de vues inclus). C'est le SEUL horodatage fiable
    /// pour faire céder la garde « viewed monotone » : une story éditée
    /// APRÈS ma vue locale redevient non-vue (reset d'engagement,
    /// directive 2026-07-29). Optionnel → rétro-compatible cache/payloads.
    public var contentEditedAt: Date?
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

    /// The viewer's right to open THIS story past its `expiresAt` because
    /// they are personally referenced in it — DECLARED by the server
    /// (`APIPost.referenceAccess`), never recomputed from `expiresAt` here.
    /// `nil` mirrors `ReferenceAccess.none`: no reference for this viewer,
    /// `isExpired()` applies normally. Propagated by `toStoryGroups` and
    /// consumed by `StoryViewModel`'s tray filters and
    /// `StoryNotificationTargetViewModel`'s open decision.
    public var referenceAccess: ReferenceAccess?

    /// Les personnes que cette story NOMME, telles que le serveur les sert,
    /// avec leur mode. `nil` = la charge utile ne les portait pas — ce qui
    /// n'est PAS un ensemble vide : le composer d'édition s'y fie pour savoir
    /// s'il a le droit de REMPLACER l'ensemble déclaré ou s'il doit se taire.
    public var mentions: [PostReference]?

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
                visibility: String? = nil, visibilityUserIds: [String]? = nil, audioUrl: String? = nil,
                isViewed: Bool = false, viewedAt: Date? = nil, updatedAt: Date? = nil, contentEditedAt: Date? = nil, translations: [StoryTranslation]? = nil, backgroundAudio: StoryBackgroundAudioEntry? = nil,
                reactionCount: Int = 0, commentCount: Int = 0,
                shareCount: Int? = nil, viewCount: Int? = nil, impressionCount: Int? = nil, repostCount: Int? = nil,
                currentUserReactions: [String]? = nil, referenceAccess: ReferenceAccess? = nil,
                mentions: [PostReference]? = nil) {
        self.id = id; self.content = content; self.media = media; self.storyEffects = storyEffects
        self.createdAt = createdAt; self.expiresAt = expiresAt; self.repostOfId = repostOfId
        self.originalRepostOfId = originalRepostOfId
        self.repostAuthorName = repostAuthorName
        self.repostAuthorUsername = repostAuthorUsername
        self.visibility = visibility; self.visibilityUserIds = visibilityUserIds; self.audioUrl = audioUrl
        self.isViewed = isViewed; self.viewedAt = viewedAt; self.updatedAt = updatedAt
        self.contentEditedAt = contentEditedAt
        self.translations = translations; self.backgroundAudio = backgroundAudio
        self.reactionCount = reactionCount; self.commentCount = commentCount
        self.shareCount = shareCount; self.viewCount = viewCount; self.impressionCount = impressionCount; self.repostCount = repostCount
        self.currentUserReactions = currentUserReactions; self.referenceAccess = referenceAccess
        self.mentions = mentions
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
    /// la constante serveur `EPHEMERAL_POST_TTL_HOURS.STORY` (ephemeralPosts.ts)
    /// et consommée par les fallbacks client `toStoryGroups`/`pinDeadline`.
    /// L'ancien défaut interne de 24 h était un piège dormant : sans effet
    /// tant que le serveur pose toujours `expiresAt`, mais une story au
    /// fallback aurait survécu plus longtemps que sa vie serveur.
    /// 20 h depuis 2026-08-12 (était 21 h) — SSOT serveur :
    /// `services/gateway/src/services/posts/ephemeralPosts.ts`.
    public static let defaultExpiryInterval: TimeInterval = 20 * 60 * 60

    public func isExpired(at now: Date = Date()) -> Bool {
        if let explicit = expiresAt {
            return explicit <= now
        }
        return createdAt.addingTimeInterval(Self.defaultExpiryInterval) <= now
    }

    /// Prisme realtime : traduction du CONTENU de la story (sa légende), que le
    /// gateway diffuse via `post:translation-updated`.
    ///
    /// Distinct de `mergingTextObjectTranslations`, qui ne touche QUE les textes
    /// posés sur le canvas. Sans ce chemin, une traduction demandée depuis la
    /// feuille « Langues » arrivait bien en base mais n'atteignait jamais la
    /// story du lecteur : l'anneau de chargement tournait sans fin sur une
    /// langue pourtant traduite (constaté au simulateur le 2026-07-27).
    ///
    /// La langue est normalisée en minuscules — la feuille compare sur cette
    /// forme. Une langue déjà présente est remplacée, sinon ajoutée.
    public func mergingContentTranslation(language: String, content: String) -> StoryItem {
        let code = language.lowercased()
        guard !code.isEmpty, !content.isEmpty else { return self }
        var merged = (translations ?? []).filter { $0.language.lowercased() != code }
        merged.append(StoryTranslation(language: code, content: content))
        return StoryItem(
            id: id, content: self.content, media: media, storyEffects: storyEffects,
            createdAt: createdAt, expiresAt: expiresAt, repostOfId: repostOfId,
            originalRepostOfId: originalRepostOfId, repostAuthorName: repostAuthorName,
            repostAuthorUsername: repostAuthorUsername,
            visibility: visibility, visibilityUserIds: visibilityUserIds, audioUrl: audioUrl, isViewed: isViewed,
            viewedAt: viewedAt, updatedAt: updatedAt,
            translations: merged,
            backgroundAudio: backgroundAudio,
            reactionCount: reactionCount, commentCount: commentCount,
            shareCount: shareCount, viewCount: viewCount, impressionCount: impressionCount, repostCount: repostCount,
            currentUserReactions: currentUserReactions, referenceAccess: referenceAccess,
            mentions: mentions
        )
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
            visibility: visibility, visibilityUserIds: visibilityUserIds, audioUrl: audioUrl, isViewed: isViewed,
            viewedAt: viewedAt, updatedAt: updatedAt,
            translations: self.translations,
            backgroundAudio: backgroundAudio,
            reactionCount: reactionCount, commentCount: commentCount,
            shareCount: shareCount, viewCount: viewCount, impressionCount: impressionCount, repostCount: repostCount,
            currentUserReactions: currentUserReactions, referenceAccess: referenceAccess,
            mentions: mentions
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

    /// Reuses the story countdown's own catalog keys (`story.viewer.expires*`
    /// in `story.viewer.expiresNow`/`expiresInHours`/`expiresInMinutes`) rather
    /// than minting duplicate ones — a status is the same "ephemeral post"
    /// concept as a story, just without a dedicated seconds-level key, so
    /// anything under a minute collapses into the same "expiring soon" label
    /// (mirrors `StoryViewerView+Content.storyTimeRemaining`, which has no
    /// seconds granularity either). Previously hardcoded the bare English
    /// word "expired" regardless of the user's language — Prisme violation.
    public var timeRemaining: String {
        guard let expires = expiresAt else { return "" }
        let seconds = Int(expires.timeIntervalSinceNow)
        if seconds < 60 {
            return String(localized: "story.viewer.expiresNow", defaultValue: "Expire bientôt", bundle: .main)
        }
        let hours = seconds / 3600
        if hours > 0 {
            return String(localized: "story.viewer.expiresInHours", defaultValue: "Expire dans \(hours)h", bundle: .main)
        }
        let minutes = seconds / 60
        return String(localized: "story.viewer.expiresInMinutes", defaultValue: "Expire dans \(minutes)min", bundle: .main)
    }

    /// Was a hand-rolled French-only relative-time string built from scratch —
    /// re-forging exactly what `RelativeTimeFormatter` (this same module,
    /// already used by `StoryItem`) exists to centralize. Delegates instead so
    /// a StatusEntry gets the same 5-language coverage, day-boundary "hier",
    /// and absolute-date fallback as every other relative timestamp in the app.
    public var timeAgo: String {
        RelativeTimeFormatter.longString(for: createdAt)
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
            // Fallback aligné sur la SSOT serveur (EPHEMERAL_POST_TTL_HOURS.STORY,
            // 20 h depuis 2026-08-12) via l'unique constante iOS — le `Calendar`
            // à 21 h d'avant divergeait ET dépendait du fuseau du process.
            let effectiveExpiresAt = post.expiresAt
                ?? post.createdAt.addingTimeInterval(StoryItem.defaultExpiryInterval)
            let totalReactions = post.reactionSummary?.values.reduce(0, +) ?? 0
            let item = StoryItem(id: post.id, content: post.content, media: media,
                                 storyEffects: hasOwnContent ? post.storyEffects : repostSource?.storyEffects,
                                 createdAt: post.createdAt, expiresAt: effectiveExpiresAt,
                                 repostOfId: post.repostOf?.id,
                                 originalRepostOfId: post.originalRepostOfId,
                                 repostAuthorName: post.repostOf?.author.name,
                                 repostAuthorUsername: post.repostOf?.author.username,
                                 visibility: post.visibility,
                                 visibilityUserIds: post.visibilityUserIds,
                                 audioUrl: post.audioUrl ?? repostSource?.audioUrl,
                                 isViewed: post.isViewedByMe ?? false,
                                 updatedAt: post.updatedAt,
                                 contentEditedAt: post.contentEditedAt,
                                 translations: storyTranslations,
                                 reactionCount: totalReactions, commentCount: post.commentCount ?? 0,
                                 shareCount: post.shareCount,
                                 viewCount: post.viewCount,
                                 impressionCount: post.impressionCount,
                                 repostCount: post.repostCount,
                                 currentUserReactions: post.currentUserReactions,
                                 referenceAccess: post.referenceAccess,
                                 mentions: post.mentions)
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
        // dédiée côté gateway, et il n'y en a jamais eu : `git log -S
        // "viaUsername" -- services/gateway packages/shared` est vide sur
        // toute l'histoire du dépôt). `APIPost.viaUsername` reste décodé
        // (compat descendante d'un champ jamais servi) mais N'EST PLUS lu
        // ici : le préférer à `repostOf.author` offrirait à une charge
        // falsifiée le droit de renommer l'auteur d'une source republiée.
        let via = repostOf?.author.username
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

    /// `authorAvatarUrl` reste nil aux DEUX branches, et ce n'est pas un oubli :
    /// `ReplyContext` porte bien un `authorId`, mais aucune URL d'avatar — son
    /// producteur unique tient l'avatar (`StoryGroup.avatarURL`) sans le lui
    /// passer. Consequence produit ASSUMEE : une citation de story ou d'humeur
    /// n'expose PAS de porte vers le profil de l'auteur ; elle saute au post.
    /// Le jour ou le produit voudra cette porte, la donnee est atteignable —
    /// il faudra elargir `ReplyContext`, pas ce fichier seul.
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

/// Corps de `POST /posts/from-attachment` — publier une pièce jointe DÉJÀ
/// reçue en conversation, sans la retélécharger.
///
/// Miroir de `PublishAttachmentSchema` (services/gateway/src/routes/posts/types.ts).
/// Les trois champs optionnels sont OMIS quand ils sont nils : le serveur
/// applique les mêmes défauts, et une clé absente vaut mieux qu'une
/// affirmation sans contenu.
public struct PublishAttachmentRequest: Encodable {
    /// La pièce jointe à publier. L'appartenance à sa conversation est vérifiée
    /// serveur : un identifiant seul n'autorise rien.
    public let attachmentId: String
    /// `nil` ⇒ la règle partagée choisit d'après le type MIME. Une STORY ne
    /// sort jamais de cette déduction — elle expire, donc elle se demande.
    public let target: String?
    /// Le mot que l'utilisateur ajoute à la publication.
    public let content: String?
    /// Le média sort de la caméra ou du micro de l'app. Le serveur ne s'en sert
    /// pas pour décider — il le journalise.
    public let capturedInApp: Bool?

    public init(attachmentId: String, target: String? = nil, content: String? = nil, capturedInApp: Bool? = nil) {
        self.attachmentId = attachmentId
        self.target = target
        self.content = content
        self.capturedInApp = capturedInApp
    }
}

public struct RepostRequest: Encodable {
    public let content: String?
    public let isQuote: Bool
    public let targetType: String?
    /// Audience choisie par le REPOSTEUR. `nil` ⇒ la gateway hérite de la
    /// visibilité de l'original. Sans ce champ, le sélecteur d'audience du
    /// composer de repost n'atteignait aucune couche : tout repost sortait avec
    /// la visibilité de l'original.
    ///
    /// La phrase « PUBLIC, seule visibilité qu'un original repostable puisse
    /// avoir » qui closait ce commentaire n'est plus vraie depuis le
    /// 2026-08-19 : la republication est ouverte aux originaux non publics. La
    /// valeur envoyée ici est VÉRIFIÉE par le serveur contre la loi d'audience
    /// — même audience ou plus restreinte, jamais plus large (403
    /// `REPOST_AUDIENCE_WIDENING`). Le miroir client de cette loi est
    /// `StoryRepostAudience` (MeeshyUI).
    public let visibility: String?

    public init(content: String? = nil, isQuote: Bool = false,
                targetType: String? = nil, visibility: String? = nil) {
        self.content = content
        self.isQuote = isQuote
        self.targetType = targetType
        self.visibility = visibility
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
            expiresAt: Date().addingTimeInterval(StoryItem.defaultExpiryInterval),
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
    /// TRANSITOIRE — lecture de la forme legacy « média seul » (2026-08-22).
    ///
    /// Un client qui n'annonce pas `X-Canvas-Caps` reçoit d'une story canvas
    /// v3 une forme dégradée : `storyEffects` OMIS, le média porteur seul dans
    /// `media[0]` (gateway, `negotiateWireStoryEffects`, « règle 5 »). Les
    /// stories publiées avant le canvas ont la même forme. Historiquement ce
    /// média partait dans `slide.mediaURL`, que `StoryRenderer.renderBackground`
    /// peint comme une IMAGE — un `.mov` finissait dans ImageIO et l'écran
    /// restait vide (constat du 2026-08-22, story `6a894bd8…`).
    ///
    /// Plutôt que d'enseigner la vidéo à la route legacy, on MIGRE la forme
    /// legacy vers le modèle unique : un `StoryMediaObject` de fond, que le
    /// lecteur sait déjà jouer (AVPlayer, piste son, durée, placeholder
    /// ThumbHash). L'image legacy garde sa route historique, qui fonctionne.
    ///
    /// **Code à retirer** avec la route `slide.mediaURL` de `renderBackground`
    /// le jour où plus aucun client legacy ne lit de story — le modèle unique
    /// est le canvas v3, et cette fonction n'a pas vocation à grandir.
    static func legacyVideoCarrier(in media: [FeedMedia]) -> StoryMediaObject? {
        guard let carrier = media.first, let url = carrier.url, !url.isEmpty else { return nil }
        // `mimeType` est DÉCLARÉ par le client qui téléverse, jamais vérifié :
        // l'extension de l'URL corrige un type absent ou contradictoire.
        guard StoryMediaStoreRouter.effectiveKind(declaredType: carrier.type, urlString: url) == .video else {
            return nil
        }
        return StoryMediaObject(
            id: "legacy-bg-\(carrier.id)",
            postMediaId: carrier.id,
            mediaURL: url,
            mediaType: FeedMediaType.video.rawValue,
            aspectRatio: carrier.aspectRatio ?? 1.0,
            isBackground: true,
            loop: true,
            intrinsicDuration: carrier.duration.map(Double.init),
            duration: carrier.duration.map(Double.init),
            thumbHash: carrier.thumbHash
        )
    }

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
            for i in audios.indices {
                let feed = self.media.first(where: { $0.id == audios[i].postMediaId })
                if audios[i].duration == nil, let dur = feed?.duration, dur > 0 {
                    audios[i].duration = Float(dur)
                }
                // Adresse de l'asset : `postMediaId` n'est résolvable que par un
                // consommateur qui porte l'index des médias. L'exporteur ne reçoit
                // qu'un slide — sans cette URL, « Partager » et « Enregistrer dans
                // Photos » bakaient un MP4 muet. Une URL déjà persistée par le
                // composer gagne : elle est plus fraîche que le repli.
                if audios[i].mediaURL == nil, let url = feed?.url, !url.isEmpty {
                    audios[i].mediaURL = url
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
        } else if let carrier = Self.legacyVideoCarrier(in: self.media) {
            // TRANSITOIRE — forme legacy « média seul ». À SUPPRIMER quand le
            // parc ne sert plus que le canvas v3 (voir `legacyVideoCarrier`).
            effects.mediaObjects = [carrier]
            legacyMediaURL = nil
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
    /// Volume du clip à cet instant, dans `0...StoryVolume.maxGain`.
    ///
    /// 5ᵉ canal optionnel : un point « volume seul » laisse les quatre autres
    /// à `nil` et l'interpolation les ignore alors, exactement comme un point
    /// de position ignore le volume.
    public var volume: Float?
    public var easing: StoryEasing?

    public init(id: String = UUID().uuidString,
                time: Float,
                x: CGFloat? = nil,
                y: CGFloat? = nil,
                scale: CGFloat? = nil,
                opacity: CGFloat? = nil,
                volume: Float? = nil,
                easing: StoryEasing? = nil) {
        self.id = id
        self.time = time
        self.x = x
        self.y = y
        self.scale = scale
        self.opacity = opacity
        self.volume = volume
        self.easing = easing
    }

    enum CodingKeys: String, CodingKey {
        case id, time, x, y, scale, opacity, volume, easing
    }

    /// Un keyframe écrit par le convertisseur gateway (TS `Keyframe`) ne porte
    /// pas d'`id` — fixture gelée `v1-legacy-full.json`. On en génère un
    /// plutôt que de jeter tout l'objet porteur au décodage lossy.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        time = try c.decode(Float.self, forKey: .time)
        x = try c.decodeIfPresent(CGFloat.self, forKey: .x)
        y = try c.decodeIfPresent(CGFloat.self, forKey: .y)
        scale = try c.decodeIfPresent(CGFloat.self, forKey: .scale)
        opacity = try c.decodeIfPresent(CGFloat.self, forKey: .opacity)
        volume = try c.decodeIfPresent(Float.self, forKey: .volume)
        easing = try c.decodeIfPresent(StoryEasing.self, forKey: .easing)
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
    case setSlideDuration(SetSlideDurationCommand)

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
        case .setSlideDuration(let c):  return c
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
        case .setSlideDuration:  return "setSlideDuration"
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
        case "setSlideDuration":
            self = .setSlideDuration(try c.decode(SetSlideDurationCommand.self, forKey: .payload))
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
        case .setSlideDuration(let v):  try c.encode(v, forKey: .payload)
        }
    }
}
