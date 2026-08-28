/// **Les PORTES du rail *leading*** — ce qui fait ENTRER de la matière dans une
/// scène (#4062, planche rév. 27 § P4, loi 12).
///
/// ## Pourquoi ce type existe à côté de `ComposerDocumentTool`
///
/// Les deux répondent à des questions différentes, et les confondre aurait
/// produit un rail qui ment sur ce qu'il fait.
///
/// `ComposerDocumentTool` parle le vocabulaire du **document** : photo, caméra
/// et fichier y sont TROIS façons d'attacher un fichier à un texte, et `emoji`
/// n'ingère rien — il insère dans le champ. C'est le bon découpage pour une
/// rangée qui sert un post texte-d'abord.
///
/// Le rail parle le vocabulaire de la **scène** : « média » est UNE porte quelle
/// que soit la source, « sticker » POSE un objet là où `emoji` n'en posait
/// aucun, et « description » ne pose rien du tout. Réutiliser le premier
/// découpage aurait mis trois portes là où l'auteur en voit une, et aucune là
/// où il en attend une.
///
/// Ce que le rail RÉEMPLOIE, ce sont les effets et les chemins d'ingestion
/// (`ComposerMediaIntake`, `ComposerDocumentToolEffect`) ; ce qu'il n'emprunte
/// pas, c'est un découpage écrit pour un autre écran.
///
/// ## Ce que le rail range côte à côte, et qui n'est PAS de même nature
///
/// Les six portes se ressemblent à l'écran et agissent sur **trois niveaux
/// différents** du modèle. C'est la première chose qu'un lecteur pressé
/// confondra, et la seule qui change ce qu'il faut écrire derrière.
nonisolated enum ComposerRailLevel: Equatable {
    /// La publication ENTIÈRE — ce qui part.
    case publication
    /// La slide courante.
    case slide
    /// Un objet de la scène.
    case object
}

nonisolated enum ComposerRailDoor: String, CaseIterable, Equatable {

    /// **Ne pose AUCUN objet** : elle donne le focus à la description de la
    /// `MeeshySlide`. En S/R cette description EST le contenu de la
    /// publication ; en P c'est la légende du média courant (#4045).
    case description

    /// Image ou vidéo, quelle que soit la source — photothèque, caméra,
    /// importateur. **Une seule porte**, là où le document en montre trois :
    /// sur une scène, ce que l'auteur choisit est un MÉDIA, pas un chemin
    /// d'accès.
    case media

    /// Une piste : bibliothèque, fichier ou micro.
    case sound

    /// Emoji ou image ≤ 512 px, POSÉE sur la scène — à ne pas confondre avec
    /// l'emoji du document, qui s'insère dans le texte et ne pose rien.
    case sticker

    /// **Vise la `MeeshyPublication`, et c'est mesuré, pas supposé.**
    ///
    /// L'intuition dit « une mention est un objet de scène » — le contrat
    /// déclare d'ailleurs un kind `mention`. Mais ce kind n'a AUCUN producteur
    /// dans le dépôt et la relecture iOS le jette dans le même `case` que les
    /// kinds réservés : une porte qui poserait cet objet réussirait à l'écran
    /// et perdrait son contenu au rechargement.
    ///
    /// La porte livrée ouvre la feuille de MODE (`INLINE` / `NOTE` /
    /// `SILENT`) et son résultat voyage en `CreatePostRequest.mentions` — une
    /// liste de la publication. C'est pourquoi elle survit au format `status`,
    /// qui n'a pas de scène.
    case mention

    /// Une pastille de lieu POSÉE sur la scène — distincte du LIEU de la
    /// publication (d'où l'on publie), qui vit au socle.
    case place

    /// Le niveau du modèle sur lequel la porte agit.
    ///
    /// `switch` exhaustif : une septième porte ne compile pas tant qu'elle n'a
    /// pas dit sur quoi elle agit — ce qui est exactement la question qu'on
    /// oublie de se poser en ajoutant un bouton.
    var level: ComposerRailLevel {
        switch self {
        case .description:                    return .slide
        case .mention:                        return .publication
        case .media, .sound, .sticker, .place: return .object
        }
    }

    /// L'ordre du rail, de haut en bas. Écrit en toutes lettres plutôt que
    /// déduit d'`allCases` : l'ordre de déclaration peut bouger sans que
    /// personne le décide, la position que les doigts apprennent, non.
    static let canonicalRail: [ComposerRailDoor] = [
        .description, .media, .sound, .sticker, .mention, .place
    ]

    /// Jeu SF LIGNE, cohérent avec la rangée du document — chaque glyphe DIT le
    /// verbe (loi 7). `text.alignleft` pour la description plutôt qu'un `pencil`
    /// générique : ce n'est pas « éditer », c'est « décrire ».
    var symbolName: String {
        switch self {
        case .description: return "text.alignleft"
        case .media:       return "photo"
        case .sound:       return "music.note"
        case .sticker:     return "face.smiling"
        case .mention:     return "at"
        case .place:       return "mappin.and.ellipse"
        }
    }

    /// Ce que le rail MONTRE — la loi 4 en une phrase : **une porte non servie
    /// est ABSENTE, jamais grisée.**
    ///
    /// - Parameter served: les portes que le SITE de montage sait réellement
    ///   servir. C'est lui qui possède le chemin d'ingestion ; peindre une
    ///   porte qu'il ne sert pas ouvrirait un sélecteur dont le résultat
    ///   n'aurait nulle part où aller — le défaut que
    ///   `ComposerDocumentToolEffect` a déjà fermé pour la rangée.
    ///
    /// - Parameter format: le format COURANT, jamais celui de la porte
    ///   d'entrée : les capacités se recalculent à chaque bascule (loi 9). Un
    ///   `status` n'a pas de scène, donc aucune porte de niveau OBJET.
    ///
    /// - Parameter allowsCapture: **ne gouverne PAS la porte média**, et c'est
    ///   une distinction mesurée. Le drapeau retire la CAMÉRA à ce qui reprend
    ///   un contenu déjà publié (repost, édition) ; il ne referme ni la
    ///   photothèque ni l'importateur. Le rail n'ayant qu'UNE porte pour les
    ///   trois sources, la gater ici retirerait la bibliothèque avec la caméra
    ///   — un contenu que l'auteur a le droit d'ajouter. Le drapeau est donc
    ///   reçu, documenté, et volontairement sans effet sur cette liste : c'est
    ///   le SÉLECTEUR qu'il gouverne, en aval.
    static func offered(
        served: Set<ComposerRailDoor>,
        format: ComposerFormat,
        allowsCapture: Bool
    ) -> [ComposerRailDoor] {
        let sceneExists = format != .status
        return canonicalRail.filter { porte in
            guard served.contains(porte) else { return false }
            guard porte.level == .object else { return true }
            return sceneExists
        }
    }
}
