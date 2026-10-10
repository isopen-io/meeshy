import CoreGraphics
import Foundation

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
    /// Date de publication du son EMPRUNTÉ dans la bibliothèque (ISO 8601),
    /// gravée au choix du son depuis `APISound.createdAt` (#9677). Elle tient
    /// la place du titre dans le crédit d'un son sans titre : « @auteur · date ».
    /// Chaîne et non `Date` : le décodage d'une story ne doit jamais dépendre de
    /// la stratégie de dates du décodeur qui la lit. `nil` pour une piste propre
    /// et pour tout ce qui a été publié avant ce champ.
    public var soundCreatedAt: String?

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
        case soundCreatedAt
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
                soundCreatedAt: String? = nil,
                sourceStart: Double? = nil,
                sourceEnd: Double? = nil) {
        self.soundId = soundId
        self.soundAuthorUsername = soundAuthorUsername
        self.soundCreatedAt = soundCreatedAt
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
    /// Projection AUDIO de `PrismTranslationResolver` : la piste à jouer est
    /// élue par la MÊME descente que le texte, jamais par une boucle jumelle.
    /// `nil` du résolveur ⇒ `postMediaId`, la piste d'origine.
    ///
    /// `sourceLanguage` — la langue RÉELLEMENT parlée par la piste d'origine —
    /// entre ici dans la descente, ce que la boucle manuscrite ne faisait pas :
    /// une variante générée dans la langue d'origine gagnait sur l'original
    /// lui-même, faisant jouer un doublage synthétique là où la voix de
    /// l'auteur disait déjà la bonne langue.
    public func resolvedPostMediaId(preferredLanguages: [String]) -> String {
        guard let variants = backgroundAudioVariants, !variants.isEmpty else { return postMediaId }
        return PrismTranslationResolver.resolve(
            originalLanguage: sourceLanguage,
            candidates: variants.map { PrismCandidate(language: $0.language, value: $0.postMediaId) },
            preferredLanguages: preferredLanguages
        )?.text ?? postMediaId
    }
}

// MARK: - Date du son emprunté (#9677)

extension StoryAudioPlayerObject {
    /// La forme gravée de `APISound.createdAt` — celle du fil (`WireDate`).
    public static func soundCreatedAtStamp(_ date: Date?) -> String? {
        date.map(WireDate.string(from:))
    }

    /// `soundCreatedAt` relu en date ; `nil` si absent ou illisible — le crédit
    /// se tait alors sur la date plutôt que d'en inventer une.
    public var soundReleaseDate: Date? {
        soundCreatedAt.flatMap(WireDate.date(from:))
    }
}
