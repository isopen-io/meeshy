import CoreGraphics
import Foundation

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

    /// Effet posé PAR-DESSUS la police — lueur, ombre portée, relief
    /// (`StoryTextEffect` rawValue). `nil` ⇒ aucun effet.
    ///
    /// Axe DISTINCT de `textStyle`, qui ne choisit qu'une police (#4850) : la
    /// lueur que web et Android prêtaient à « neon » vit ici, et ici seulement
    /// (#4870). Une chaîne plutôt qu'un énuméré, comme ses voisins : un blob
    /// publié par un client plus récent ne doit pas faire échouer le décodage
    /// — `parsedTextEffect` retombe sur `.none`.
    public var textEffect: String?

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
        case borderColor, borderWidth, textEffect
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
                textEffect: String? = nil,
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
        self.textEffect = textEffect
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
        textEffect = try c.decodeIfPresent(String.self, forKey: .textEffect)
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
        try c.encodeIfPresent(textEffect, forKey: .textEffect)
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
