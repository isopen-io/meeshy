import CoreGraphics
import Foundation

// Extrait de `StoryModels.swift` — même raison que `StorySticker.swift` : le
// lot des décorations ajoute `styleId` à ce type (#4717), et la directive
// 2026-08-28 interdit d'ajouter à un fichier hors budget.

// MARK: - Story Location Object (pastille de lieu posée sur une slide)

/// Pastille de lieu posée sur une slide. **Mêmes transforms ET même fenêtre de
/// temps qu'un `StoryTextObject`** — elle apparaît et disparaît quand elle veut
/// (directive porteur 2026-08-31, #4591).
///
/// > Ce doc-comment affirmait le contraire — « hors timeline : toujours visible
/// > sur sa slide » — et il était CITÉ par les sites qui en dérivaient leur
/// > propre absence. Une phrase fausse au bon endroit se propage mieux qu'un
/// > correctif.
public struct StoryLocationObject: Codable, Identifiable, Sendable {
    public var id: String
    public var place: SharedPlace
    public var x: Double
    public var y: Double
    public var scale: Double
    public var rotation: Double
    /// Z-order persistent (non-optional; defaults to 0), même convention que
    /// `StoryTextObject.zIndex` / `StorySticker.zIndex`.
    public var zIndex: Int
    /// Pivot point for rotation/scale (normalized 0–1). Default center (0.5, 0.5).
    public var anchor: CGPoint
    /// **Une pastille de lieu APPARAÎT et DISPARAÎT quand elle veut**
    /// (directive porteur 2026-08-31, #4591).
    ///
    /// > « Tout `MeeshySceneObject` peut apparaître et disparaître quand il
    /// > souhaite, y compris la pastille de lieu — différente de la
    /// > localisation du POST ! »
    ///
    /// Elle était la SEULE des cinq familles sans fenêtre de temps, et j'avais
    /// documenté cette absence comme une propriété du domaine (« un lieu n'a
    /// pas de temps propre »). C'était un TROU, et le raisonnement qui l'a
    /// justifié était faux : j'avais lu `timing: optional()` dans
    /// `canvas-v3.ts` comme « cette famille n'a pas de temps ».
    ///
    /// > **`optional` décrit la PRÉSENCE d'un champ, jamais la CAPACITÉ d'une
    /// > famille.** Un objet PEUT ne pas avoir de fenêtre ; aucun ne peut être
    /// > privé du droit d'en avoir une. C'est la deuxième fois du jour qu'une
    /// > absence du modèle Swift est prise pour une intention — et la seconde
    /// > l'a été dans le commit qui prétendait savoir les distinguer.
    ///
    /// Optionnels comme chez les quatre autres familles : le décodeur manuel
    /// les lit par `decodeIfPresent`, donc aucune publication existante ne
    /// change.
    public var startTime: Double?
    public var duration: Double?
    /// Les fondus vont AVEC la fenêtre : `RenderableItem` les lit tous les
    /// quatre, et `MeeshyUI` en fabriquait quatre `nil` EN DUR sur ce type. Un
    /// shim qui rend `nil` sans condition n'est pas une omission — **il OMBRE la
    /// vraie valeur** : les propriétés stockées ci-dessus n'auraient atteint
    /// aucun pixel du canvas tant qu'il vivait.
    public var fadeIn: Double?
    public var fadeOut: Double?

    /// **E3 (#3888) — langue d'origine de l'élément.** Défaut : la langue
    /// DÉCLARÉE au composer (`declaredContentLanguage`), surchargeable par
    /// élément. `nil` sur les brouillons/payloads antérieurs.
    public var sourceLanguage: String?

    /// **Le gabarit qui DÉCORE cette pastille** (#4717).
    ///
    /// `nil` — le cas de toute pastille publiée avant ce lot — rend la pastille
    /// d'aujourd'hui, au pixel près : le repli est
    /// `StickerTemplateCatalog.defaultLocationTemplateID`, et son dessin EST
    /// l'ancien code, déplacé sans être touché.
    ///
    /// Un id INCONNU (publié par une version plus récente) retombe sur le même
    /// repli plutôt que de ne rien dessiner : un lieu s'affiche toujours,
    /// éventuellement moins joliment que chez l'auteur.
    ///
    /// > **Pourquoi ici et pas sur un sticker.** Un lieu porte des coordonnées
    /// > et un id de POI que la PLATEFORME lit (`/posts/nearby`). Le décorer
    /// > par un sticker jumeau ferait vivre deux objets affichant un nom de
    /// > lieu, dont un seul porterait la donnée géographique.
    public var styleId: String?

    enum CodingKeys: String, CodingKey {
        case id, place, x, y, scale, rotation, zIndex, anchor, sourceLanguage
        case styleId
        case startTime, duration, fadeIn, fadeOut
    }

    public init(id: String = UUID().uuidString, place: SharedPlace,
                x: Double = 0.5, y: Double = 0.8, scale: Double = 1.0,
                rotation: Double = 0, zIndex: Int = 0,
                anchor: CGPoint = CGPoint(x: 0.5, y: 0.5),
                sourceLanguage: String? = nil,
                styleId: String? = nil,
                startTime: Double? = nil, duration: Double? = nil,
                fadeIn: Double? = nil, fadeOut: Double? = nil) {
        self.id = id; self.place = place
        self.x = x; self.y = y; self.scale = scale
        self.rotation = rotation; self.zIndex = zIndex; self.anchor = anchor
        self.sourceLanguage = sourceLanguage
        self.styleId = styleId
        self.startTime = startTime; self.duration = duration
        self.fadeIn = fadeIn; self.fadeOut = fadeOut
    }

    // Custom Codable: anchor uses the nested {x,y} container patron shared
    // with StoryTextObject/StorySticker — NOT CGPoint's own synthesized
    // Codable (which would encode as an unkeyed [x,y] array and break the
    // wire format the composer/reader already agree on).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        place = try c.decode(SharedPlace.self, forKey: .place)
        sourceLanguage = try c.decodeIfPresent(String.self, forKey: .sourceLanguage)
        // Absent de toute pastille écrite avant le #4717 : `nil` y signifie
        // « la pastille d'origine », pas « pas de style ».
        styleId = try c.decodeIfPresent(String.self, forKey: .styleId)
        x = try c.decodeIfPresent(Double.self, forKey: .x) ?? 0.5
        y = try c.decodeIfPresent(Double.self, forKey: .y) ?? 0.8
        scale = try c.decodeIfPresent(Double.self, forKey: .scale) ?? 1.0
        rotation = try c.decodeIfPresent(Double.self, forKey: .rotation) ?? 0
        zIndex = try c.decodeIfPresent(Int.self, forKey: .zIndex) ?? 0
        startTime = try c.decodeIfPresent(Double.self, forKey: .startTime)
        duration = try c.decodeIfPresent(Double.self, forKey: .duration)
        fadeIn = try c.decodeIfPresent(Double.self, forKey: .fadeIn)
        fadeOut = try c.decodeIfPresent(Double.self, forKey: .fadeOut)
        if let nested = try? c.nestedContainer(keyedBy: AnchorKeys.self, forKey: .anchor) {
            let ax = try nested.decodeIfPresent(Double.self, forKey: .x) ?? 0.5
            let ay = try nested.decodeIfPresent(Double.self, forKey: .y) ?? 0.5
            anchor = CGPoint(x: ax, y: ay)
        } else {
            anchor = CGPoint(x: 0.5, y: 0.5)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(place, forKey: .place)
        try c.encodeIfPresent(sourceLanguage, forKey: .sourceLanguage)
        try c.encodeIfPresent(styleId, forKey: .styleId)
        try c.encode(x, forKey: .x); try c.encode(y, forKey: .y)
        try c.encode(scale, forKey: .scale); try c.encode(rotation, forKey: .rotation)
        try c.encode(zIndex, forKey: .zIndex)
        try c.encodeIfPresent(startTime, forKey: .startTime)
        try c.encodeIfPresent(duration, forKey: .duration)
        try c.encodeIfPresent(fadeIn, forKey: .fadeIn)
        try c.encodeIfPresent(fadeOut, forKey: .fadeOut)
        var anchorC = c.nestedContainer(keyedBy: AnchorKeys.self, forKey: .anchor)
        try anchorC.encode(Double(anchor.x), forKey: .x)
        try anchorC.encode(Double(anchor.y), forKey: .y)
    }

    private enum AnchorKeys: String, CodingKey { case x, y }
}
