import CoreGraphics
import Foundation

// Extrait de `StoryModels.swift` (4 571 lignes, quatre fois le budget
// 800-1100 de la directive 2026-08-28, qui interdit d'AJOUTER à un fichier
// hors budget). Le lot des décorations ajoute deux champs à `StorySticker`
// (#4716) : on extrait d'abord, on ajoute ensuite.
//
// Découpe par RESPONSABILITÉ : ce fichier tient le sticker et RIEN d'autre —
// sa nature, sa géométrie, sa fenêtre de temps et son codage manuel.

// MARK: - Story Sticker Kind

/// Ce qu'un sticker EST, pour que la condition « image ou emoji » ne soit pas
/// réécrite à chaque site d'appel. Sur un sticker image ou gabarit, `emoji`
/// reste rempli — comme repli de compatibilité, pas comme contenu — et ne peut
/// donc pas servir à trancher.
///
/// **Le RANG compte** : `templateId` gagne sur `postMediaId`, qui gagne sur
/// l'emoji. Un gabarit peut porter les deux autres (son repli emoji, et une
/// image un jour), et c'est lui qui dit ce qu'on dessine.
public enum StoryStickerKind: String, Sendable {
    case emoji
    case image
    /// Une décoration dessinée par l'application depuis un gabarit du
    /// `StickerTemplateCatalog`, dont les emplacements portent une donnée
    /// FIGÉE à la pose (#4716).
    case template
}

// MARK: - Story Sticker

public struct StorySticker: Codable, Identifiable, Sendable {

    /// **L'échelle à laquelle un sticker se POSE** (directive porteur
    /// 2026-08-30 : « les stickers doivent être posés en grand sur le canvas »).
    ///
    /// Le défaut de `scale` est `1.0` — la taille de RÉFÉRENCE du glyphe, qui
    /// donne sur une scène 9:16 un sticker qu'il faut agrandir avant de le
    /// placer. Deux gestes pour un, et le premier n'a aucune valeur : personne
    /// ne pose un sticker pour le laisser minuscule.
    ///
    /// 2,2 plutôt qu'un nombre rond : c'est l'échelle à laquelle un emoji
    /// occupe environ le quart de la largeur d'une scène — visible d'emblée,
    /// et laissant la place à ce qu'il commente.
    public static let posedScale: Double = 2.2

    public var id: String
    public var emoji: String
    /// Image INTÉGRÉE à l'entité publiée : même espace d'ids que tout autre
    /// média du post (cf. `StoryMediaObject.postMediaId`). Vide = sticker emoji.
    /// Aucune URL tierce n'entre ici : l'asset est hébergé par la plateforme.
    public var postMediaId: String
    /// Origine de l'asset — "genmoji", "bitmoji", "thirdParty", "library".
    /// Métadonnée de PROVENANCE : elle ne pilote aucun chargement.
    public var provider: String?
    /// **Gabarit du `StickerTemplateCatalog`** — vide = ce n'est pas une
    /// décoration (#4716). Un id INCONNU (publié par une version plus récente)
    /// ne plante pas : le catalogue rend `nil` et le rendu retombe sur
    /// `wireEmoji`.
    public var templateId: String
    /// **Les valeurs FIGÉES des emplacements du gabarit** — l'heure qu'il était,
    /// le nom du lieu, la date choisie.
    ///
    /// Figées, donc tout lecteur voit ce que l'auteur a composé : rien dans la
    /// chaîne de rendu ne re-résout (`StickerSlotFiller` reçoit son instant, il
    /// ne le lit jamais).
    public var slots: [String: String]
    /// **Le mouvement de la décoration** (#4821) — `nil` = immobile. Une
    /// propriété de la charge, jamais un `kind` neuf (#3956) : web et Android
    /// l'ignorent et rendent la décoration fixe. Un nom inconnu (publié par une
    /// version plus récente) se décode en `nil`, jamais en plantage.
    public var animation: StickerAnimation?
    /// **E3 (#3888) — langue d'origine de l'élément.** Comme sur texte/média/
    /// audio : par défaut la langue DÉCLARÉE au composer (`declaredContentLanguage`),
    /// surchargeable par élément. `nil` sur les brouillons/payloads antérieurs.
    public var sourceLanguage: String?
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

    /// Repli affiché par un lecteur qui ne sait pas rendre l'image du sticker.
    public static let imageFallbackEmoji = "\u{1F5BC}\u{FE0F}"

    /// **Le rang, écrit une fois** : gabarit, puis image, puis emoji.
    public var kind: StoryStickerKind {
        if !templateId.isEmpty { return .template }
        return postMediaId.isEmpty ? .emoji : .image
    }

    /// Emoji tel qu'il doit partir au fil. Un lecteur ancien rend `null` quand
    /// `emoji` est vide (`CanvasV3Scene.tsx`) : un sticker image y
    /// disparaîtrait en silence, d'où le repli.
    ///
    /// Un sticker GABARIT sert le repli déclaré par son gabarit — « 📍 » pour un
    /// lieu, « 🕐 » pour une heure : un lecteur qui ne sait pas le dessiner voit
    /// au moins de quoi il s'agit. La pose remplit déjà `emoji`, cette branche
    /// est la ceinture : un gabarit INCONNU (version plus récente) tombe sur le
    /// repli générique plutôt que sur du vide.
    public var wireEmoji: String {
        if !emoji.isEmpty { return emoji }
        if !templateId.isEmpty {
            return StickerTemplateCatalog.fallbackEmoji(forTemplateID: templateId)
                ?? Self.imageFallbackEmoji
        }
        return Self.imageFallbackEmoji
    }

    enum CodingKeys: String, CodingKey {
        case id, emoji, postMediaId, provider, sourceLanguage, x, y, scale, rotation, zIndex
        case templateId, slots, animation
        case baseSize, anchor
        case startTime, duration, fadeIn, fadeOut
    }

    public init(id: String = UUID().uuidString,
                emoji: String,
                postMediaId: String = "",
                provider: String? = nil,
                templateId: String = "",
                slots: [String: String] = [:],
                animation: StickerAnimation? = nil,
                sourceLanguage: String? = nil,
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
        self.postMediaId = postMediaId; self.provider = provider
        self.templateId = templateId; self.slots = slots
        self.animation = animation
        self.sourceLanguage = sourceLanguage
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
    //   - postMediaId/provider: absent in every document written before the
    //     imported sticker existed — fallback to "" / nil
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        emoji = try c.decode(String.self, forKey: .emoji)
        postMediaId = try c.decodeIfPresent(String.self, forKey: .postMediaId) ?? ""
        provider = try c.decodeIfPresent(String.self, forKey: .provider)
        // Absents de TOUT document écrit avant le gabarit — d'où les défauts,
        // sur le patron de `postMediaId` juste au-dessus.
        templateId = try c.decodeIfPresent(String.self, forKey: .templateId) ?? ""
        slots = try c.decodeIfPresent([String: String].self, forKey: .slots) ?? [:]
        animation = try c.decodeIfPresent(String.self, forKey: .animation)
            .flatMap(StickerAnimation.init(rawValue:))
        sourceLanguage = try c.decodeIfPresent(String.self, forKey: .sourceLanguage)
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
        // Omis quand vides : un brouillon emoji déjà sur disque se réencode
        // alors exactement comme avant.
        if !postMediaId.isEmpty { try c.encode(postMediaId, forKey: .postMediaId) }
        // Même règle : un brouillon emoji déjà sur disque se réencode octet pour
        // octet comme avant ce lot.
        if !templateId.isEmpty { try c.encode(templateId, forKey: .templateId) }
        if !slots.isEmpty { try c.encode(slots, forKey: .slots) }
        try c.encodeIfPresent(animation?.rawValue, forKey: .animation)
        try c.encodeIfPresent(provider, forKey: .provider)
        try c.encodeIfPresent(sourceLanguage, forKey: .sourceLanguage)
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
