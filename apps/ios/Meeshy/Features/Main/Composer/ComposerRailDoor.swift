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
    /// **La SCÈNE elle-même** — ni la publication, ni une slide, ni un objet
    /// (#4092).
    ///
    /// Le dessin a exigé ce niveau : ses traits vivent dans
    /// `slide.effects.drawingStrokes`, donc le ranger en `.slide` était
    /// tentant. Mais `.slide` est le niveau des portes qui survivent à un
    /// format SANS scène — c'est ce que `offered` en déduit —, et dessiner sur
    /// un `status` n'a aucun sens : il n'y a pas de toile.
    ///
    /// Le classer `.object` aurait été faux dans l'autre sens : un dessin n'est
    /// pas un objet sélectionnable, empilable et minutable, et le rail
    /// *trailing* lui proposerait des contrôleurs qui ne s'appliquent pas.
    /// (#4092 veut qu'il le DEVIENNE ; ce niveau disparaîtra alors, et sa
    /// disparition sera le témoin que la promesse est tenue.)
    case scene

    /// **Ce que la porte fait naître se VOIT-il sur la scène ?**
    ///
    /// C'est cette question — et elle seule — qui décide de quel côté la porte
    /// se pose (directive porteur 2026-08-31) :
    ///
    /// > « Sur la rangée à gauche, ce sont les features qui apparaissent sur le
    /// > canvas visuellement ; on préserve sur la ligne canonique la description
    /// > du contenu, l'ajout de son de fond, image et vidéo de fond, mention et
    /// > localisation de la publication. »
    ///
    /// Le `switch` est exhaustif à dessein : un cinquième niveau ne compilera
    /// pas tant qu'il n'aura pas dit s'il se voit. C'est exactement la question
    /// qu'on oublie de se poser en ajoutant un bouton — et l'oublier avait
    /// produit deux répartitions, l'une raisonnée par niveau, l'autre recopiée
    /// dans un littéral (#4561).
    var appearsOnCanvas: Bool {
        switch self {
        case .object, .scene:      return true
        case .publication, .slide: return false
        }
    }
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

    /// **Le LIEU de la publication — d'où l'on publie.**
    ///
    /// Son doc-comment a longtemps annoncé « une pastille de lieu POSÉE sur la
    /// scène, distincte du LIEU de la publication ». La mesure dit l'inverse :
    /// `handleRailDoor(.place)` appelle `handleDocumentTool(.place)`, dont
    /// l'effet est `.attachesLocation` et qui ouvre `presentedPortal = .location`
    /// — le sélecteur de la PUBLICATION. Aucun objet n'est posé sur la scène.
    ///
    /// > Un doc-comment qui décrit ce que la porte DEVRAIT faire ne se fait
    /// > contredire par rien : il est juste dans son intention, il occupe le bon
    /// > endroit, et le lecteur suivant s'y fie. C'est la troisième occurrence
    /// > du motif dans cette famille de fichiers (« selection markers » de
    /// > `editOverlayLayer`, « Internal recording » de la barre universelle).
    ///
    /// La pastille de lieu SUR la scène reste à faire ; le jour où elle arrive,
    /// elle sera une porte de plus, pas une seconde lecture de celle-ci.
    case place

    /// **Le DESSIN** — le premier outil de la vue `3b`, et le seul qui n'ajoute
    /// rien : il ouvre un MODE. Tant qu'il est actif, le doigt trace au lieu de
    /// déplacer.
    case drawing

    /// **Le TEXTE** — un `StoryTextObject` du plan `fg` (#4401).
    ///
    /// La vue `3b` ne le dessine pas dans sa rangée d'outils, et la vue `1c` le
    /// montre pourtant SÉLECTIONNÉ, avec son inspecteur. La contradiction se
    /// lève en regardant `1b` : le texte y est déjà sur la scène. Aucune des
    /// trois vues ne dit par où on le POSE — d'où cette porte, qui manquait au
    /// plateau alors que l'atelier l'a depuis toujours.
    ///
    /// Elle pose une coquille VIDE et ouvre l'éditeur en ligne. Une coquille
    /// restée vide est supprimée à la fermeture (`exitTextEditingMode`) : un
    /// texte annulé ne laisse rien derrière lui.
    case text

    /// **Le HASHTAG de la publication** (#4636, directive porteur 2026-08-31 :
    /// « mettre l'outil hashtag dans la liste des outils d'un slide ou d'une
    /// publication »).
    ///
    /// Elle est la JUMELLE de `.mention`, et pas seulement par le glyphe : les
    /// deux désignent une entité que le serveur DÉRIVE du texte. C'est pourquoi
    /// elle n'ouvre pas un objet de scène mais écrit dans le contenu — voir
    /// `ComposerHashtags`, qui porte la raison en entier.
    ///
    /// Niveau `.publication`, donc ligne canonique du bas : un hashtag n'apparaît
    /// pas sur la scène, il classe ce qui part.
    case hashtag

    /// Le niveau du modèle sur lequel la porte agit.
    ///
    /// `switch` exhaustif : une septième porte ne compile pas tant qu'elle n'a
    /// pas dit sur quoi elle agit — ce qui est exactement la question qu'on
    /// oublie de se poser en ajoutant un bouton.
    /// **Le niveau dépend de DEUX termes : la porte ET le format** (#4893,
    /// directive porteur 2026-09-02).
    ///
    /// > « Il faut placer l'outil géolocalisation, hashtag, corpus de texte et
    /// > mention à GAUCHE lorsqu'on est en mode Story afin de fixer chaque
    /// > position à chaque story, et on laisse en bas pour chaque Réel et
    /// > Post. »
    ///
    /// La raison est dans la directive : **en Story ces quatre outils POSENT
    /// quelque chose de positionnable** — « fixer chaque position à chaque
    /// story ». Un lieu, un hashtag, une mention et un corpus de texte y sont
    /// des objets qu'on place, qu'on agrandit et qu'on tourne, donc du niveau
    /// OBJET, donc le rail gauche. Hors Story, les mêmes outils QUALIFIENT ce
    /// qui part — ils ne se posent nulle part — donc la rangée canonique.
    ///
    /// > C'est le MÊME outil qui change de niveau, pas deux outils homonymes.
    /// > Le glyphe, le libellé et la feuille qu'il ouvre ne changent pas ; ce
    /// > qui change est ce que le format permet d'en faire.
    ///
    /// Le `switch` reste EXHAUSTIF sur la porte : une dixième porte ne compile
    /// pas tant qu'elle n'a pas dit sur quoi elle agit — et, désormais, si
    /// cela dépend du format.
    func level(for format: ComposerFormat) -> ComposerRailLevel {
        switch self {
        case .description:
            return .slide
        // Les quatre outils que la directive DÉPLACE. Le prédicat porte sur le
        // format et non sur une liste de formats « autres » : ajouter un
        // cinquième format le rangera du bon côté sans qu'on y pense, et c'est
        // le sens de la règle — seule la Story pose.
        case .mention, .place, .hashtag, .text:
            return format == .story ? .object : .publication
        // La MATIÈRE se pose toujours, quel que soit le format : une image de
        // premier plan, une piste et un sticker sont des objets par nature.
        case .media, .sound, .sticker:
            return .object
        case .drawing:
            return .scene
        }
    }

    /// L'ordre du rail, de haut en bas. Écrit en toutes lettres plutôt que
    /// déduit d'`allCases` : l'ordre de déclaration peut bouger sans que
    /// personne le décide, la position que les doigts apprennent, non.
    static let canonicalRail: [ComposerRailDoor] = [
        .description, .media, .sound, .text, .drawing, .sticker, .mention, .hashtag, .place
    ]

    /// Jeu SF LIGNE, cohérent avec la rangée du document — chaque glyphe DIT le
    /// verbe (loi 7). `text.alignleft` pour la description plutôt qu'un `pencil`
    /// générique : ce n'est pas « éditer », c'est « décrire ».
    var symbolName: String {
        switch self {
        case .description: return "text.alignleft"
        case .media:       return "photo"
        case .sound:       return "music.note"
        // **Pas un smiley** (directive porteur 2026-09-01) : cette porte
        // n'ouvre pas un clavier d'emoji, elle ouvre une palette de
        // CONSTRUCTIONS (#4579) — lieu, heure, décorations, « Mes stickers ».
        // Un visage y dirait le contenu d'un seul de ses cinq onglets.
        //
        // Aucun glyphe Apple ne s'appelle « sticker » ni « peel » — vérifié
        // dans `CoreGlyphs.bundle`, noms ET index de recherche, zéro
        // correspondance. `rectangle.portrait.on.rectangle.portrait.angled`
        // est le seul qui DIT le geste : deux rectangles portrait, celui de
        // devant incliné — la feuille qui se soulève de la planche.
        //
        // iOS 16.0, soit notre plancher exact : aucune garde de version. Et
        // style LIGNE, comme les huit autres portes.
        case .sticker:     return "rectangle.portrait.on.rectangle.portrait.angled"
        case .mention:     return "at"
        // `number` — le glyphe SYSTÈME du `#`. Posé à côté du `at` de la
        // mention, il dit la parenté : deux références dérivées du texte.
        case .hashtag:     return "number"
        case .place:       return "mappin.and.ellipse"
        // `scribble.variable` plutôt qu'un `pencil` générique : ce n'est pas
        // « éditer », c'est TRACER — et le glyphe DIT le verbe (loi 7).
        case .drawing:     return "scribble.variable"
        // `textformat` et non `textbox` : ce qu'on pose est du TEXTE, pas un
        // cadre. La description, elle, porte `text.alignleft` — deux glyphes
        // distincts pour deux niveaux du modèle (la slide, l'objet).
        case .text:        return "textformat"
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
            guard !removedFromFormat(format).contains(porte) else { return false }
            guard !sceneExists else { return true }
            // Sans toile, ce qui APPARAÎT sur elle n'a rien à poser : la même
            // question qui range la porte à gauche décide aussi qu'elle ne
            // survit pas à un format sans scène. Une seule règle, deux effets.
            guard !porte.level(for: format).appearsOnCanvas else { return false }
            return !removedFromStatus.contains(porte)
        }
    }

    /// **Ce que le format retire du rail, en plus de ce que la toile décide.**
    ///
    /// En STORY, le paragraphe n'a pas de place — non parce qu'une story se
    /// passerait de texte, mais parce qu'elle n'a pas de LÉGENDE distincte à
    /// écrire : `ComposerRailDoor.description` le dit depuis #4045, « en S/R
    /// cette description EST le contenu de la publication ». Une porte qui
    /// promettrait d'ajouter une légende à côté du contenu ouvrirait un second
    /// champ pour un seul texte.
    ///
    /// > « À la place de paragraphe c'est donc le corpus de texte qu'on doit
    /// > afficher en mode story » — directive porteur 2026-09-02.
    ///
    /// Le corpus (`.text`) prend donc la place, et il y est POSABLE : c'est la
    /// même bascule que `level(for:)`, vue depuis la présence plutôt que
    /// depuis le niveau.
    private static func removedFromFormat(_ format: ComposerFormat) -> Set<ComposerRailDoor> {
        format == .story ? [.description] : []
    }

    /// **Ce que le profil MOOD retire EN PLUS, et pour une autre raison.**
    ///
    /// Planche `2k` : « photo · caméra · lieu · micro — **indisponibles en
    /// Mood** ». Le lieu ne disparaît pas faute de toile — il n'en a jamais eu
    /// besoin, puisqu'il vise la publication : il disparaît parce qu'« une
    /// humeur d'une heure ne dit pas d'où elle est écrite ». C'est un choix
    /// produit, et il se déclare.
    ///
    /// > **Ce retrait a longtemps tenu par ACCIDENT.** Le lieu était classé
    /// > `.object`, donc écarté par la règle de la toile — un effet de bord
    /// > d'une classification fausse. Corriger la classification (#4561) a
    /// > rendu la porte au Mood, et seul le témoin l'a vu.
    ///
    /// La leçon vaut au-delà de ce cas : **une règle générale qui remplace un
    /// effet de bord doit vérifier ce que cet effet de bord PROTÉGEAIT.** Une
    /// protection non déclarée ne se signale pas quand on la retire — elle
    /// n'était écrite nulle part.
    ///
    /// **`.text` y entre au #4893, et c'est la leçon ci-dessus rejouée sur une
    /// autre porte.** Le corpus de texte était tenu hors du Mood par ACCIDENT :
    /// il était `.object`, donc écarté par la règle de la toile. La bascule par
    /// format le rend `.publication` hors Story — la protection tombe, et le
    /// Mood se retrouverait avec DEUX champs de texte, le sien
    /// (`ComposerMoodSurface.text`) et une porte qui en ouvre un second.
    ///
    /// > La règle est écrite deux paragraphes plus haut, elle a coûté une
    /// > régression à `.place`, et elle vient d'être payée une seconde fois par
    /// > le lot qui la cite. **Une protection non déclarée ne se signale pas
    /// > quand on la retire** — seul `test_laPorteTexte_disparaitDunStatus` l'a
    /// > vue.
    private static let removedFromStatus: Set<ComposerRailDoor> = [.place, .text]
}
