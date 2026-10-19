import CoreGraphics
import Foundation

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

    /// Les kinds que ce build ne sait pas peindre — vide quand la scène est
    /// intégralement rendue. Lecture PUBLIQUE du mémo ci-dessus : le lecteur
    /// vit app-side et doit pouvoir poser la question.
    public var unpaintableKinds: [String] { wireUnpaintableKinds ?? [] }

    /// Wire-only : `wireUnpaintableKinds`, `wireUnpaintableObjects` et
    /// `wireBackgroundTransformCarrierId`, sur le tas — `StoryEffects+WireRepaintMemo.swift`.
    var wireRepaintMemo: WireRepaintMemo.Box?

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

    /// Le fil n'accepte plus que le canvas v3 : la PREMIÈRE scène part TOUJOURS
    /// du runtime courant, jamais du `canvasV3` mémorisé — une composition
    /// neuve (aucun document servi) et une story éditée émettent donc l'une
    /// comme l'autre l'état réel du canvas.
    ///
    /// **Les scènes SUIVANTES, elles, viennent du document** (2026-09-06). Le
    /// runtime ne décrit qu'une slide : partir de lui seul jetait tout ce qui
    /// vivait au-delà — une publication à trois scènes rouverte, éditée puis
    /// renvoyée en émettait UNE. Détail : `CanvasV3.init(migrating:keeping:)`.
    public func encode(to encoder: Encoder) throws {
        try CanvasV3(migrating: self, keeping: canvasV3).encode(to: encoder)
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

    // La résolution AUDIO de `StoryEffects` vit dans
    // `StoryEffects+AudioResolution.swift` — ce fichier est hors budget.
}
