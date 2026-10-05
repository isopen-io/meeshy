import CoreGraphics
import Foundation

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
    /// **Le ratio MESURÉ sur l'asset — `nil` tant qu'aucune mesure n'est
    /// arrivée** (#5100).
    ///
    /// Avant ce champ, `aspectRatio` était un `Double` non optionnel posé à
    /// `1.0` à la composition puis renseigné une fois l'asset mesuré. **`1.0`
    /// disait donc à la fois « je ne sais pas encore » et « ce média est
    /// carré »**, et aucun consommateur ne pouvait savoir laquelle des deux
    /// valeurs il tenait.
    ///
    /// Le dépôt contournait déjà le problème, et le contournement portait
    /// l'aveu : l'hydratation à la lecture testait `abs(aspectRatio - 1.0) < 0.05`
    /// — la SENTINELLE, pas une propriété du média. Une photo réellement carrée
    /// était réécrite comme si son ratio était inconnu ; le résultat coïncidait
    /// par chance, la règle ne pouvait structurellement pas distinguer les cas.
    ///
    /// > **Une valeur de repli qui vaut aussi une valeur légitime n'est pas un
    /// > repli, c'est une ambiguïté.** Elle ne se corrige pas par un seuil plus
    /// > fin — tout seuil teste la sentinelle — mais en rendant l'absence
    /// > REPRÉSENTABLE.
    ///
    /// Fait de MÉMOIRE, jamais de fil : `aspectRatio` reste le champ sérialisé
    /// (voir `encode(to:)`), et l'écrire en plus ajouterait au contrat un champ
    /// que personne ne lit et que les trois décodeurs devraient apprendre.
    public var measuredAspectRatio: Double?

    /// **Le ratio à SERVIR** — projection de la mesure, avec le repli
    /// historique quand elle manque (#5100).
    ///
    /// Calculée plutôt que stockée : tous les consommateurs existants continuent
    /// de lire `aspectRatio` sans rien changer, et ceux qui ont besoin de savoir
    /// si la valeur est FIABLE lisent `measuredAspectRatio`. Deux questions
    /// distinctes, deux accès — au lieu d'une valeur qui répondait mal aux deux.
    public var aspectRatio: Double {
        get { measuredAspectRatio ?? Self.unmeasuredAspectRatio }
        set { measuredAspectRatio = newValue }
    }

    /// Le repli servi tant qu'aucune mesure n'est arrivée. Nommé pour que les
    /// sites qui le rencontrent puissent le RECONNAÎTRE — un `1.0` écrit en
    /// ligne est indiscernable d'un ratio légitime, ce qui est exactement le
    /// défaut que ce lot ferme.
    public static let unmeasuredAspectRatio: Double = 1.0
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

    /// **Le cadre retenu dans la source** (#5085, vue `2d`) — la jumelle
    /// SPATIALE de `sourceStart`/`sourceEnd`.
    ///
    /// Normalisé (fractions 0–1), donc indépendant de la résolution : c'est ce
    /// qui permet au fichier de partir pendant que l'auteur recadre, comme la
    /// planche `4c` l'exige — « ces trois gestes écrivent des bornes · aucun ne
    /// ré-encode · aucun n'invalide la montée ».
    ///
    /// `nil` ⇒ le cadre entier. La valeur pleine est omise du fil pour la même
    /// raison que les autres défauts de ce modèle : son absence la restitue.
    public var crop: MediaCropRect?

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
    /// **Le filtre de CET objet** (retour porteur 2026-09-28 : « les
    /// modifications impactent cet objet-là et non toute la scène »).
    /// `StoryEffects.filter` est celui du FOND ; un média posé porte le sien,
    /// avec les mêmes valeurs (`StoryFilter.rawValue`). `nil` ⇒ aucun filtre.
    /// Contrat partagé avec le web : `storyEffects.mediaObjects[i].filter`.
    public var filter: String?

    /// Le filtre, typé. Une valeur inconnue (client plus récent) se lit
    /// « aucun filtre » plutôt que de faire échouer le rendu.
    public var parsedFilter: StoryFilter? { filter.flatMap(StoryFilter.init(rawValue:)) }
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
        // #5085 — la jumelle SPATIALE des deux bornes ci-dessus. Sans cette
        // ligne, le champ existe, se règle, se rend… et disparaît au premier
        // encodage : une `CodingKeys` explicite est une liste, donc un
        // inventaire à tenir à jour, et rien ne rougit quand on l'oublie.
        // C'est `CanvasV3ExhaustivityTests` qui l'a attrapé.
        case crop
        case sourceLanguage, keyframes, thumbHash, name
        case isDuckingDisabled
        case filter
    }

    public init(id: String = UUID().uuidString,
                postMediaId: String = "",
                mediaURL: String? = nil,
                mediaType: String = "image",
                placement: String = "media",
                aspectRatio: Double?,                       // `nil` = pas encore mesuré (#5100)
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
        self.measuredAspectRatio = aspectRatio
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
        // **La PRÉSENCE de la clé fait la mesure** (#5100). Une charge qui porte
        // `aspectRatio` a été écrite par quelqu'un qui savait — même quand la
        // valeur vaut 1. Une charge qui ne la porte pas est un legacy dont on
        // ignore tout, et le repli de `aspectRatio` la sert sans mentir.
        measuredAspectRatio = try c.decodeIfPresent(Double.self, forKey: .aspectRatio)
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
        crop = try c.decodeIfPresent(MediaCropRect.self, forKey: .crop)
        sourceLanguage = try c.decodeIfPresent(String.self, forKey: .sourceLanguage)
        keyframes = try c.decodeIfPresent([StoryKeyframe].self, forKey: .keyframes)
        // Decoder clamp : `didSet` ne se déclenche pas pendant init, donc on
        // applique la limite explicitement pour protéger contre un payload
        // malformé / malveillant (slide effects JSON externe → cache disque).
        let rawThumbHash = try c.decodeIfPresent(String.self, forKey: .thumbHash)
        thumbHash = (rawThumbHash?.count ?? 0) > Self.maxThumbHashLength ? nil : rawThumbHash
        name = try c.decodeIfPresent(String.self, forKey: .name)
        isDuckingDisabled = try c.decodeIfPresent(Bool.self, forKey: .isDuckingDisabled)
        filter = try c.decodeIfPresent(String.self, forKey: .filter)
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
        // #5085 — la jumelle SPATIALE des deux bornes ci-dessus. Un
        // `encode(to:)` MANUEL est un inventaire à tenir à jour : le champ
        // existait, se réglait, se rendait — et disparaissait au premier
        // encodage. Trois listes le nomment désormais (la propriété, la clé,
        // cette ligne), et c'est `CanvasV3ExhaustivityTests` qui a compté.
        try c.encodeIfPresent(crop, forKey: .crop)
        try c.encodeIfPresent(sourceLanguage, forKey: .sourceLanguage)
        try c.encodeIfPresent(keyframes, forKey: .keyframes)
        try c.encodeIfPresent(thumbHash, forKey: .thumbHash)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(isDuckingDisabled, forKey: .isDuckingDisabled)
        try c.encodeIfPresent(filter, forKey: .filter)
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
                aspectRatio: Double?,
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
