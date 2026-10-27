import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// Les RÈGLES pures du meuble — éprouvables sans monter la moindre vue, et
// c'est pourquoi elles vivent hors du type qui les lit.


/// Le gate du réel, en UN seul endroit — **nourri de la composition RÉELLE**.
///
/// Il lit la composition que l'auteur a posée, et l'éventail offert s'en
/// déduit.
///
/// **Aucun second prédicat n'est fabriqué ici.** `ReelComposition` reste
/// l'unique juge — miroir du gateway (`reelComposition.ts`) et du web. Ce type
/// ne fait qu'une PROJECTION : traduire les objets d'une diapositive en la
/// liste `(kind, durationMs)` que le prédicat attend. Écrire « une vidéo de
/// plus de 3 s qualifie » une seconde fois côté app aurait donné deux règles à
/// faire diverger, exactement la dette que ce dépôt paie déjà ailleurs.
///
/// **Ce qu'il lit, et ce qu'il ne lit pas.** `currentEffects` est la seule
/// lucarne publique du SDK sur la composition : `slides` et `loadedVideoURLs`
/// sont internes à `MeeshyUI`. Le gate ne voit donc que la diapositive
/// COURANTE. L'erreur est bornée dans un seul sens — il peut MANQUER un réel
/// (deux images réparties sur deux diapositives), jamais en inventer un. C'est
/// le sens sûr : la loi 9 dit que le gate AJOUTE le réel et ne retire jamais le
/// format propre d'une porte, donc un gate qui sous-détecte dégrade l'offre
/// sans jamais publier ce que personne n'a demandé.
nonisolated enum ComposerReelGate {

    static func compositionQualifiesAsReel(_ effects: StoryEffects) -> Bool {
        ReelComposition.qualifiesAsReel(mediaKinds: mediaKinds(of: effects))
    }

    /// Ce que vaut le gate quand il n'y a RIEN à juger. Dérivé du prédicat sur
    /// une composition vide plutôt qu'écrit `false` : le littéral en dur est
    /// précisément ce que V1 a eu à retrouver en deux exemplaires.
    static var withoutComposition: Bool {
        compositionQualifiesAsReel(StoryEffects())
    }

    /// La projection. Les images n'ont jamais de durée (la règle produit ne la
    /// leur demande pas) ; pour une vidéo, la durée NATIVE de l'asset prime sur
    /// sa durée de lecture — c'est celle du fichier téléversé que le serveur
    /// jugera, et un clip de 10 s ramené à 1 s sur la timeline reste une vidéo
    /// de 10 s aux yeux du gateway.
    static func mediaKinds(of effects: StoryEffects) -> [(kind: FeedMediaType, durationMs: Int?)] {
        let visuels: [(kind: FeedMediaType, durationMs: Int?)] = (effects.mediaObjects ?? [])
            .compactMap { objet -> (kind: FeedMediaType, durationMs: Int?)? in
                guard let kind = objet.kind else { return nil }
                switch kind {
                case .image:
                    return (kind: .image, durationMs: nil)
                case .video:
                    return (kind: .video, durationMs: milliseconds(objet.intrinsicDuration ?? objet.duration))
                }
            }
        let sons: [(kind: FeedMediaType, durationMs: Int?)] = (effects.audioPlayerObjects ?? [])
            .map { objet -> (kind: FeedMediaType, durationMs: Int?) in
                (kind: .audio, durationMs: milliseconds(objet.duration.map { Double($0) }))
            }
        return visuels + sons
    }

    /// Une durée nulle ou négative n'est pas une durée : elle rend `nil`, et le
    /// prédicat la traite comme inconnue — donc non qualifiante. Le rendre `0`
    /// aurait dit « connue et trop courte », ce qui est la même conclusion
    /// aujourd'hui mais cesserait de l'être si le plancher passait à zéro.
    private static func milliseconds(_ seconds: Double?) -> Int? {
        guard let seconds, seconds > 0 else { return nil }
        return Int((seconds * 1000).rounded())
    }
}

/// **Ce que le socle MONTRE quand le texte grossit.**
///
/// Ses deux zones nommées portent un pictogramme ET un mot. Aux paliers
/// d'ACCESSIBILITÉ, le mot ne tient plus : en allemand à `accessibility-XXXL`,
/// « Veröffentlichen » se casse en syllabes EMPILÉES — « Ver- / öf- / fent- /
/// li- » — et « Öffentlich » se tronque en « Öffe… ». Le socle, qui est une
/// RANGÉE, deviendrait une colonne de fragments.
///
/// Au-delà de ce seuil, les libellés se réduisent donc à leur ICÔNE. C'est la
/// forme qui préserve la loi 5 (« le socle ne bouge jamais ») : les zones ne se
/// déplacent pas et ne passent pas à la ligne — elles RÉTRÉCISSENT, au même
/// endroit.
///
/// **Ce que la réduction ne touche PAS** : le nom accessible. Un contrôle qui
/// perd son nom en devenant compact est un défaut que la flèche de publication
/// évite en refusant d'échanger son libellé contre un `ProgressView`.
/// VoiceOver et Voice Control lisent le
/// même mot à toutes les tailles ; seul l'ŒIL en est privé, et seulement quand
/// le montrer le rendrait illisible.
///
/// Le seuil est `isAccessibilitySize` et non un palier choisi à la main : c'est
/// la frontière que le système lui-même trace entre « plus grand » et « conçu
/// pour l'accessibilité », et la recopier en dur la ferait diverger.
/// **Deux places, deux NIVEAUX.**
///
/// > « On exploite la place du plateau sans encombrer le canvas. […] Sur la
/// > rangée à gauche, ce sont les features qui apparaissent sur le canvas
/// > visuellement ; on préserve sur la ligne canonique la description du
/// > contenu, l'ajout de son de fond, image et vidéo de fond, mention et
/// > localisation de la publication. »
///
/// - la rangée de GAUCHE porte ce qui **se voit** sur la scène — texte,
///   sticker, son posé, média de premier plan, tracé ;
/// - la LIGNE CANONIQUE porte ce qui appartient à l'**envoi ou à la slide** —
///   description, mention, lieu de la publication.
///
/// **L'axe est l'endroit où le résultat apparaît**, pas le VERBE de la porte
/// (« agit sur la scène » contre « fait entrer de la matière »). Ce second axe
/// classerait le dessin en bas (un tracé ENTRE dans la scène) et la mention à
/// gauche (elle agit sur ce qui est là) — deux rangements défendables qui ne
/// disent rien à l'auteur. La main suit le résultat : le geste part de la
/// colonne et atterrit sur la scène.
///
/// **Aucun rail ne se pose SUR la scène.** Un contrôle flottant vole les
/// touches de la bande qu'il couvre, et l'auteur découvre la zone morte en
/// essayant d'y traîner quelque chose. Le plateau est de la place disponible —
/// la scène est figée en 9:16, l'écran ne l'est pas.
nonisolated enum ComposerSceneFloatingRail {

    /// **La rangée de GAUCHE — ce qui apparaît visuellement sur la scène.**
    ///
    /// Elle se DÉDUIT du niveau de chaque porte, jamais d'une liste. Un littéral
    /// — `[.text, .sticker, .sound, .mention]` — rangerait `.mention` parmi ce
    /// qui vit sur la scène, alors que `ComposerRailDoor` la déclare
    /// `.publication`. Deux répartitions coexisteraient : l'une raisonnée, l'autre
    /// recopiée, et seule la recopiée serait appelée.
    ///
    /// > Une liste écrite à la main À CÔTÉ d'une règle qui décide déjà la même
    /// > chose ne se fait contredire par rien : les deux compilent, et le
    /// > doc-comment de la règle continue d'énoncer une classification juste que
    /// > le produit n'applique pas.
    /// **Le format est un paramètre, pas un détail** : lieu, hashtag, mention et
    /// corpus de texte ne sont du niveau OBJET qu'en Story. Prendre le niveau sans
    /// dire pour quel format rendrait une répartition figée, sans qu'aucun
    /// appelant ne rougisse.
    static func sideRow(from served: [ComposerRailDoor],
                        format: ComposerFormat) -> [ComposerRailDoor] {
        served.filter { $0.level(for: format).appearsOnCanvas }
    }

    /// **La LIGNE CANONIQUE — ce qui appartient à l'envoi ou à la slide.**
    ///
    /// La description du contenu, la mention et le lieu de la publication : rien
    /// de tout cela n'a de place sur la scène, et le bas est déjà la zone de ce
    /// qui décide de l'envoi (loi 5).
    ///
    /// Les deux rangées forment une PARTITION du jeu servi — c'est la
    /// négation du même prédicat, donc aucune porte ne peut se perdre ni
    /// apparaître deux fois. Deux filtres écrits séparément l'auraient permis.
    ///
    /// **Le corps du post n'y est pas** : sa porte vit au SOCLE. Elle reste dans
    /// le jeu SERVI — c'est la rangée basse qui ne la peint pas, pour qu'elle ne
    /// soit pas deux fois à l'écran.
    static func lowRow(from served: [ComposerRailDoor],
                       format: ComposerFormat) -> [ComposerRailDoor] {
        served.filter { !$0.level(for: format).appearsOnCanvas && $0 != socleDoor }
    }

    /// La porte que le SOCLE porte à la place de la rangée basse.
    static let socleDoor: ComposerRailDoor = .content
}


nonisolated enum ComposerSocleDensity {
    static func showsLabels(_ size: DynamicTypeSize) -> Bool {
        !size.isAccessibilitySize
    }
}

/// **Ce qu'un tap sur le FOND de la scène incrustée sélectionne.**
///
/// Règle PURE, hors de tout `body` : une condition posée dans une vue est
/// invisible aux tests, et celle-ci gouverne l'existence même de la zone
/// contextuelle.
///
/// **Pourquoi elle existe.** L'inspecteur est câblé de bout en bout — la
/// scène transmet `onItemTapped`, l'hôte retient la sélection, la surface monte
/// la zone — et serait pourtant INATTEIGNABLE sur l'écran document. En profil
/// Post une slide ne porte qu'UN média, et la règle 4 en fait son FOND ; or le
/// hit-test du canvas n'itère que le conteneur des ITEMS, où un fond ne vit
/// pas. Le tap retomberait donc sur `onBackgroundTapped`, qui efface la
/// sélection : écran identique au bit près.
///
/// **Elle vit côté APP, pas dans le geste du SDK.** Rendre le fond
/// « hit-testable » côté canvas changerait la manipulation de l'atelier plein
/// écran, que ce lot doit laisser intact — c'est la condition même de
/// l'arbitrage porteur (« coquille NEUVE, modèle PARTAGÉ »). Le SDK dit ce qui a
/// été TOUCHÉ ; l'app décide ce que cela SÉLECTIONNE.
nonisolated enum ComposerSceneBackgroundTapPolicy {

    /// `nil` ⇒ aucune sélection ⇒ aucune zone contextuelle (loi 4).
    static func selection(
        currentSelection: StoryCanvasUIView.CanvasItemKind?,
        backgroundIsMedia: Bool
    ) -> StoryCanvasUIView.CanvasItemKind? {
        guard currentSelection == nil, backgroundIsMedia else { return nil }
        return .media
    }

    /// **Sur la SCÈNE, le même toucher ouvre les outils du FOND.**
    ///
    /// Le fond est l'objet du plan `bg` (vue `1c` : trois plans, un seul objet
    /// à la fois) et se sélectionne comme les autres, au toucher : toucher un
    /// objet mène à son édition en place. La règle ci-dessus ne pose qu'un `kind`
    /// sans identifiant, que seule la surface document lit : sur la scène, rien ne
    /// bougerait, et « Réglages » du fond resterait inatteignable. Mêmes
    /// conditions que `selection`, plus une : un carrousel d'effets ouvert, que ce
    /// toucher referme, garde son geste.
    static func backgroundToEdit(currentSelection: StoryCanvasUIView.CanvasItemKind?,
                                 effectIsOpen: Bool,
                                 backgroundMediaId: String?) -> String? {
        guard !effectIsOpen,
              let backgroundMediaId, !backgroundMediaId.isEmpty,
              selection(currentSelection: currentSelection, backgroundIsMedia: true) != nil
        else { return nil }
        return backgroundMediaId
    }
}

/// **Le gate du MOOD — la jumelle de `ComposerReelGate`.**
///
/// Le fan du fil offre `[.post, .story]` et, quand la composition qualifie,
/// `.reel`. Le quatrième format ne serait atteignable que par sa PORTE
/// (`.moodChip`) : un auteur qui vient d'écrire deux lignes dans le composer
/// du fil devrait fermer, revenir par le chip mood et retaper — la loi 9 (le
/// contenu est PRÉSERVÉ à travers les formats) tomberait sur le seul format
/// qu'aucune bascule n'atteindrait.
///
/// **Les deux gates sont MUTUELLEMENT EXCLUSIFS par construction** : le réel
/// exige un média, le mood exige qu'il n'y en ait AUCUN. Aucun `if` ne l'écrit
/// — c'est le prédicat lui-même qui le tient, et un témoin le prouve sur la
/// table plutôt que de le supposer.
///
/// **Pourquoi l'emoji entre dans le prédicat.** Un gate posé sur le seul texte
/// se refermerait sous les doigts de l'auteur qui efface sa phrase pour la
/// réécrire : l'offre perdrait `.status`, le repli
/// (`ComposerFormatFanPolicy.resolvedSelection`) le ramènerait au document, et
/// la surface changerait EN PLEINE FRAPPE. Un emoji déjà posé est la preuve
/// qu'un mood est en cours — il tient le format ouvert le temps de la
/// composition. Il ne rachète pour autant PAS un média : la carte mood n'a
/// nulle part où le mettre.
nonisolated enum ComposerMoodGate {

    /// « Contenu uniquement du texte, non vide » — plus l'échappatoire de
    /// l'emoji ci-dessus.
    static func compositionQualifiesAsMood(
        text: String,
        hasMedia: Bool,
        hasScene: Bool,
        moodEmoji: String?
    ) -> Bool {
        guard !hasMedia, !hasScene else { return false }
        if let moodEmoji, !moodEmoji.isEmpty { return true }
        return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Ce que vaut le gate quand il n'y a RIEN à juger — DÉRIVÉ du prédicat,
    /// jamais écrit `false` : le littéral en dur est précisément ce que V1 a eu
    /// à retrouver en deux exemplaires.
    static var withoutComposition: Bool {
        compositionQualifiesAsMood(text: "", hasMedia: false, hasScene: false, moodEmoji: nil)
    }
}

/// **Le meuble** du composer unifié — plateau, scène, socle permanent.
///
/// Ce que ce type est, et surtout ce qu'il n'est PAS :
///
/// - il **enveloppe** l'atelier de composition du SDK (`StoryComposerView`), il
///   ne le réécrit pas. L'atelier porte des milliers de lignes éprouvées ; en
///   refaire une version app-side ferait diverger deux surfaces sans qu'aucun
///   test ne le dise ;
/// - il **ne construit aucun aperçu**. Loi 6 de la doctrine — « le lecteur EST
///   l'aperçu » : composer et viewers partagent un seul registre de rendu, et un
///   quatrième chemin d'aperçu casserait le WYSIWYG par construction. Le socle
///   ne peint pas d'œil : aucune de ses surfaces n'a de canvas à lire, et un
///   aperçu VIDE ment autant qu'un aperçu maison. L'aperçu est servi par le
///   `⋯`, et c'est l'atelier qui l'exécute ;
/// - il **ne décide de rien** : ce qu'il montre est fonction du
///   `ComposerProfile` que `ComposerIntent` lui donne. Le host lit la
///   table, il ne la double pas ;
/// - il **n'ouvre aucun chemin de publication**. L'unique publieur est la barre
///   du SDK (`StoryComposerView+TopBar.publishButton` → `publishAllSlides()`),
///   qui rabat les effets du canvas sur la diapositive courante avant de
///   rendre la main. Un second chemin app-side publierait un document que
///   personne n'a rabattu.
///
/// **Le socle ne bouge jamais** (loi 5 de la doctrine P1) — et ce que la loi 5
/// interdit n'est pas qu'une zone manque, c'est qu'elle manque SELON LA PORTE.
/// Les zones peintes suivent la SURFACE montée, par une règle pure
/// (`ComposerChromeOwnership.socleZones`), et gardent partout le même ordre de
/// lecture : audience, publication. C'est le point fixe qui fait qu'un
/// composer reste le même objet vu de neuf endroits différents.
/// `MeeshyComposerHostGuardTests` le verrouille par garde de source, faute d'une
/// sortie observable.
///
/// **Aucune UI morte** : une capacité refusée par le profil n'est pas montée
/// puis désactivée, elle est ABSENTE (loi 4 — « rien à l'écran sans raison »).
///
/// ## Équivalence avec le cover de création
///
/// Trois choses que `StoryComposerCover` donne à l'atelier, et qu'un host les
/// perdant rendrait silencieusement moins bon que ce qu'il remplace :
///
/// 1. **l'audience mémorisée** (`initialVisibility`). Le paramètre du SDK a une
///    valeur PAR DÉFAUT (`PostVisibility.friends`) : l'oublier ne casse aucune
///    compilation, la loi 10 disparaît sans un mot. Il est ici un paramètre
///    OBLIGATOIRE du host, et `AppInitWireupTests` vérifie qu'aucun site de
///    création ne monte l'atelier sans le passer ;
/// 2. **l'adoption de brouillon** (`adoptDraft`). Sans elle le composer
///    s'autosauvegarde sous un id neuf et le brouillon repris reste intact à
///    côté, en double ;
/// 3. **les cinq fournisseurs d'environnement** (lieu, caméra, pellicule,
///    presse-papier, bibliothèque de stickers). Sans eux la pastille « Lieu »,
///    les amorces de page blanche et la bibliothèque de stickers
///    disparaissent — sans le moindre signal.
///
/// Ce n'est pas une équivalence à tenir « au cas où » : le cover de création
/// MONTE ce host, et ne pose pas lui-même ce que le host pose. Une des trois
/// qui manquerait ici manquerait à l'écran.
/// Les deux libellés d'ÉTAT de la flèche du socle — ceux que VoiceOver annonce
/// quand la publication est en vol ou refusée.
///
/// Ils ne sont pas dans la vue : un libellé posé en littéral échappe au cliquet
/// de complétude et n'est jamais traduit. Même idiome que `ComposerDocumentCopy`
/// et `ComposerMoodCopy`.
///
/// **Zéro clé neuve.** Les deux sont déjà traduites dans les sept locales
/// livrées, et le socle est leur lecteur : c'est ce qui les empêche de devenir
/// orphelines.
///
/// **Pourquoi `composer.socle.publish` et `status.composer.publish` ne sont
/// pas fondues.** Le socle garde `composer.socle.publish`, qui n'est pas la
/// même phrase — « Publish » contre « Post » en anglais — et fondre les deux
/// serait une édition de catalogue. La clé `status.composer.publish` est
/// absente des sept locales : la laisser ferait rougir la garde des clés
/// mortes (`LocalizationConsistencyTests`).
nonisolated enum ComposerSocleCopy {

    /// L'état TRANSITOIRE, porté par `accessibilityValue` et non par le libellé.
    /// Échanger le libellé contre un `ProgressView` laisserait le bouton sans
    /// nom accessible à l'instant précis où il est occupé — le défaut que
    /// `StatusComposerView` a corrigé et qu'il ne faut pas réintroduire ici.
    static var publishInProgress: String {
        String(localized: "a11y.status.publish.in-progress",
               defaultValue: "Publication en cours", bundle: .main)
    }

    /// Ce qui MANQUE pour publier.
    ///
    /// **Chaque surface dit ce qui lui manque.**
    ///
    /// Une règle qui rendrait `nil` hors du mood laisserait la flèche grise sans
    /// un mot sur le document et sur la scène. La phrase du mood — « choisissez
    /// un emoji » — est fausse d'un document, et **un indice FAUX coûte plus qu'un
    /// indice absent** : chaque surface porte donc une phrase VRAIE de son gate.
    /// Les trois sont au catalogue dans les sept langues :
    ///
    /// | surface | ce que le gate exige | ce que la phrase dit |
    /// |---|---|---|
    /// | `.mood` | un emoji | « choisissez un emoji » |
    /// | `.document` | du texte, un média, un lieu ou un ancrage | « ajoutez du texte, une photo ou un lieu » |
    /// | `.scene` | de la matière posée sur la scène | « posez au moins un élément » |
    ///
    /// > La phrase du document ÉNUMÈRE les trois voies parce que le gate est une
    /// > DISJONCTION : nommer le seul texte ferait croire qu'une photo ne suffit
    /// > pas. L'ancrage (`repostOfId`) n'y figure pas — sous un ancrage la flèche
    /// > n'est jamais grise, donc la phrase ne se lit jamais dans ce cas.
    static func publishBlockedHint(surface: ComposerSurfaceKind,
                                   format: ComposerFormat) -> String? {
        switch surface {
        case .mood:
            return String(localized: "a11y.status.publish.disabled.hint",
                          defaultValue: "Choisissez un emoji pour publier votre status", bundle: .main)
        case .scene:
            return sceneHint
        case .document:
            // **Le FORMAT tranche ici, pas la seule surface.** Une STORY et un RÉEL
            // montent `.document` par le routage (ils se composent dans le meuble) alors
            // que leur matière entre par le CANVAS : `hasMedia` reçoit
            // `ComposerStoryCanvas.hasMatter(...)`.
            //
            // Leur servir « ajoutez du texte, une photo ou un lieu » nommerait
            // donc trois actions que l'auteur d'une story ne fera pas — il pose
            // des objets sur sa scène. La phrase serait VRAIE du gate et FAUSSE
            // du geste, ce qui est la pire des deux façons d'avoir tort : elle
            // envoie chercher ailleurs.
            //
            // > La surface décide de la VUE, le format décide de ce qu'on y
            // > FAIT. Un indice parle du geste, donc il suit le format.
            switch format {
            case .story, .reel: return sceneHint
            case .post, .status: return documentHint
            }
        }
    }

    private static var sceneHint: String {
        String(localized: "composer.socle.blocked.scene",
               defaultValue: "Posez au moins un élément sur la scène pour publier",
               bundle: .main)
    }

    private static var documentHint: String {
        String(localized: "composer.socle.blocked.document",
               defaultValue: "Ajoutez du texte, une photo ou un lieu pour publier",
               bundle: .main)
    }

    /// **L'audience nominative VIDE — le refus le plus opaque des trois, et le
    /// seul qui ne dépende pas de la surface.**
    ///
    /// « Certaines personnes » choisi, personne coché : la flèche grise, et rien
    /// dans l'écran ne rattache ce gris au sélecteur d'audience, qui vit à
    /// l'autre bout du socle et affiche un libellé parfaitement normal.
    ///
    /// C'est ce cas que `publishBlockedHint(surface:)` ne pouvait pas servir :
    /// il aurait rendu la phrase de la SURFACE — « ajoutez du texte » — devant
    /// un composer déjà plein de texte. D'où le `guard` de l'hôte, qui rendait
    /// `""` plutôt que de mentir. Il rend cette phrase-ci.
    static var publishBlockedAudienceHint: String {
        String(localized: "composer.socle.blocked.audience",
               defaultValue: "Choisissez au moins une personne pour publier",
               bundle: .main)
    }
}

/// Une porte qui route vers un composer HISTORIQUE n'ouvre pas le meuble (C1).
///
/// Ce prédicat vit à côté du host plutôt que dedans, et c'est délibéré : c'est
/// l'APPELANT — la porte, tâche C3 — qui décide de présenter le legacy ou le
/// host. Un host qui se saborderait lui-même en rendant `EmptyView` pour ces
/// origines laisserait la porte croire qu'elle a présenté quelque chose.
nonisolated extension ComposerIntent {
    /// `nil` ⇒ la porte ouvre `MeeshyComposerHost`. Non-`nil` ⇒ elle présente
    /// le composer historique nommé, et rien d'autre.
    /// Le gate du réel n'entre PAS dans ce calcul, et ce n'est pas une
    /// approximation : le routage legacy est le même pour les deux valeurs du
    /// gate, sur les huit portes — `ComposerIntentTests` le prouve porte par
    /// porte plutôt que de le laisser se supposer. La composition vide est donc
    /// lue ici pour ce qu'elle est, une valeur neutre, et non recopiée en
    /// littéral : le `false` en dur est exactement ce que V1 a eu à retrouver
    /// en deux exemplaires.
    var routesToLegacy: LegacyComposer? {
        ComposerProfile.profile(
            for: origin,
            compositionQualifiesAsReel: ComposerReelGate.withoutComposition
        ).routesToLegacy
    }
}


/// **Ce que CE meuble sait servir sur la scène** — les portes du rail *leading*
/// et les contrôleurs du rail *trailing*, déclarés UNE fois.
///
/// ## Pourquoi une règle, et pas deux littéraux dans le corps de la vue
///
/// Deux `Set` littéraux écrits à la volée dans l'expression `sceneSurface`
/// seraient INÉPROUVABLES autrement que par une garde de source — et une garde
/// de source sur un littéral est exactement le témoin qui passe au vert le
/// jour où quelqu'un réécrit la liste autrement. Posés ici, les deux ensembles
/// s'interrogent directement : un test demande « la porte sticker est-elle
/// servie ? » et obtient une réponse, pas une sous-chaîne.
///
/// ## La loi 4, et ce qu'elle exige VRAIMENT d'une capacité
///
/// « Un contrôle sans effet est ABSENT, jamais grisé. » Une entrée n'entre donc
/// ici **qu'accompagnée de son chemin** : le meuble doit savoir, pour chacune,
/// ouvrir le portail et poser le résultat. C'est la seule question à se poser
/// avant d'ajouter une ligne — pas « la maquette la dessine-t-elle ? ».
///
/// ## Ce que le niveau d'accès d'une primitive peut cacher
///
/// La porte `sticker` est servie : `StoryComposerViewModel.addSticker(emoji:)`
/// existe, `StickerPickerView` est publique, et le meuble injecte « Mes
/// stickers » (`storyStickerLibraryProvided`). Un chemin qui manque se
/// distingue mal du niveau d'ACCÈS de la primitive : un `internal` ressemble,
/// vu du site d'appel, à une règle produit.
///
/// Même remarque pour l'empilement : `bringForward` / `sendBackward` vivent sur
/// le MODÈLE, pas sur la vue UIKit.
///
/// ## Ce qui n'y est PAS, et pourquoi
///
/// - `edit` — l'inspecteur par kind est la vue `1c`, pas encore montée ;
///   servir l'action ouvrirait un éditeur qui n'existe pas.
/// - `leaveScene` — sortir un objet de la scène demande de décider ce qu'il
///   devient dehors, ce qu'aucune règle du dépôt ne tranche encore.
nonisolated enum ComposerSceneCapabilities {

    /// Les portes du rail *leading*. Passées à `ComposerRailDoor.offered`, qui
    /// leur applique ensuite la règle du FORMAT — une porte de niveau objet
    /// disparaît d'un `status`, qui n'a pas de scène.
    /// **La porte SON est servie** : la scène doit TOUJOURS pouvoir recevoir un
    /// son — en son de fond de la scène, ou en chip redimensionnable posée
    /// dessus. Aucune autre entrée ne le garantit : la palette de constructions
    /// porte cinq onglets — `emoji`, `love`, `time`, `place`, `library` — et pas de
    /// son, et la pastille d'avatar affiche un CRÉDIT, donc ne se peint que s'il y
    /// a déjà un son.
    ///
    /// > **Deux retraits justifiés, chacun renvoyant vers un chemin que l'autre ne
    /// > fournit pas, fermeraient la porte par leur SOMME** — et une somme n'a pas
    /// > de site où rougir. Le témoin qui l'attrape ne peut donc pas interroger un
    /// > retrait : il demande que la scène serve AU MOINS UN chemin vers le son,
    /// > quel qu'il soit.
    ///
    /// La porte ne coûte aucune capacité neuve : `handleRailDoor(.sound)` appelle
    /// `presentSoundSources()`, et la feuille qui s'ouvre porte déjà le CHOIX des
    /// deux destinations (`chosenSoundPlacement` : fond de la scène, ou puce posée
    /// dessus). Ce n'est pas une capacité qui manque, c'est son entrée.
    ///
    /// **`.hashtag` est servie** parce que le meuble possède le chemin complet — le
    /// texte de la publication est à lui (`documentText`), et
    /// `ComposerHashtags.inserting` y écrit. Une porte servie sans son chemin
    /// d'ingestion ouvrirait un sélecteur dont le résultat n'irait nulle part.
    ///
    /// **`.content` est servie** pour la même raison : le meuble possède le chemin
    /// COMPLET — `documentText` est à lui, `postContentEditor` l'écrit, et
    /// `ComposerDocumentDraft.document(text:)` le poste. Une porte servie sans son
    /// chemin ouvrirait un champ dont le texte n'irait nulle part, le défaut que
    /// referment les légendes.
    ///
    /// > **La déclarer ici est le pas qu'on oublie**, et il ne rougit nulle part :
    /// > `offered` filtre sur `served.contains`, si bien qu'une porte entièrement
    /// > écrite — case, niveau, glyphe, libellé, geste, pastille — reste INVISIBLE
    /// > tant que ce jeu ne la nomme pas.
    static let doors: Set<ComposerRailDoor> = [
        .description, .content, .media, .sound, .text, .background, .drawing,
        .sticker, .mention, .hashtag, .place
    ]

    /// Les contrôleurs du rail *trailing*. Passés à
    /// `ComposerTrailingRailPolicy.actions`, qui leur applique ensuite ce que
    /// l'OBJET admet (verrouillé, fond, seul de son plan).
    /// `.trim` y figure : le meuble sait ouvrir la bande
    /// de rognage sous la scène. Ce jeu dit ce que CE meuble sait faire ; ce
    /// qu'un OBJET admet reste à la règle du SDK, qui n'offre le rognage qu'à
    /// une vidéo ou un son (`hasTrimmableSource`).
    static let controllers: Set<StoryCanvasContextAction> = [
        .duplicate, .delete, .bringForward, .sendBackward, .trim,
        .setAsBackground, .replaceBackground
    ]

    /// Les bandes contextuelles du bas de scène. Passées à
    /// `ComposerSceneBand.opened`, qui n'ouvre JAMAIS une bande demandée mais
    /// non servie — sans quoi un contexte déclaré avant d'avoir son contenu
    /// occuperait les ≈ 170 pt que l'encastrement des rails libère.
    ///
    /// **Une seule, et le jeu ne dépend d'aucun état.** Les bandes qui éditent un
    /// objet déjà posé (rognage d'une source, styles d'un texte) ne sont pas
    /// servies : la première vue n'édite pas.
    ///
    /// `opened(_:served:)` refuse toute bande hors de ce jeu. La ligne de partage
    /// entre ce que la première vue sert et ce qui part à l'éditeur vit dans
    /// `ComposerFirstView`.
    static let bands: Set<ComposerSceneBand> = [.palette, .frame]
}


/// **La porte média du rail ouvre la PHOTOTHÈQUE, directement.**
///
/// Une feuille de choix — photothèque, caméra, fichier — coûterait un geste
/// pour une décision que l'écran a prise ailleurs : la CAMÉRA vit sur la scène
/// elle-même (toucher une scène vide prend une photo, la maintenir filme), et
/// c'est la photothèque que
/// l'auteur vient chercher en touchant l'image. Une feuille de choix entre
/// une source attendue et deux autres déjà servies ailleurs est un geste de
/// plus pour zéro décision (loi 7, chemin nominal ≤ 2 gestes).
///
/// La source est une CONSTANTE de la règle, jamais un littéral du meuble :
/// c'est elle que le témoin lit, et une source changée ici change l'écran.
nonisolated enum ComposerMediaSourcePolicy {

    static let railDoorIntake: ComposerMediaIntake = .photoLibrary

    static var cancel: String {
        String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)
    }
}


/// **D'où vient un son posé sur la scène** — et pourquoi la porte en sert
/// plusieurs provenances.
///
/// La porte `sound` du rail ouvre une feuille qui sert toutes les provenances :
/// enregistrer, emprunter à l'étagère, importer un fichier. Une porte qui n'en
/// servirait qu'une ferait mentir le rail, qui dit « Ajouter un son » : rien
/// n'oppose une porte à ce qu'elle PROMET. Le socle de la vue `1b` affiche
/// d'ailleurs un crédit de son (« ♫ NUITS BLANCHES · @lume · 0:28 »), que seul
/// l'emprunt à l'étagère peut produire.
///
/// ## Les deux provenances ne posent pas le même objet, et c'est la doctrine
///
/// La vue `2c` le dit sans détour — « la provenance gouverne l'affichage » :
///
/// | provenance | ce qu'elle pose | conséquence |
/// |---|---|---|
/// | étagère | `addBorrowedSound` → objet audio `isBackground` | allume le crédit et le 🔇 des surfaces de lecture |
/// | micro | une note vocale | **n'est JAMAIS un fond audio** |
///
/// ## Ce que la doctrine « la provenance gouverne l'affichage » ne dit PAS
///
/// Elle ne dit pas que fondre les provenances en un seul geste ferait d'une
/// note vocale la bande-son de la publication : le CRÉDIT et le MIXAGE sont
/// deux champs ORTHOGONAUX de `StoryAudioPlayerObject`.
///
/// | ce qui est en jeu | le champ qui le porte | qui l'écrit |
/// |---|---|---|
/// | le CRÉDIT (« ♫ NUITS BLANCHES · @lume ») | `soundId` + `soundAuthorUsername` | `addBorrowedSound`, et lui seul |
/// | le rôle de MIXAGE | `isBackground` | n'importe quel son |
///
/// Un vocal mis en fond porte donc `isBackground = true` et `soundId = nil` :
/// le bon mixage, sans ligne de crédit mensongère. Un enregistrement personnel
/// ne s'attribue pas le crédit d'une piste empruntée, et l'auteur choisit :
/// « les mettre en background ou en foreground ».
///
/// L'ORDRE suit : la porte « ouvre directement l'enregistrement audio ». Le
/// micro passe devant, et les deux autres provenances sont des entrées SOUS
/// lui, dans la même feuille — pas de choix préalable qui coûterait un geste
/// pour rien.
///
/// ## Aucun gate, et c'est mesuré
///
/// `allowsCapture` ne retire que la CAMÉRA (`ComposerDocumentToolPolicy.visibleTools`
/// filtre `.camera`, jamais `.microphone`) : reprendre un contenu publié
/// n'interdit pas d'y enregistrer un vocal. Et la porte `sound` étant de niveau
/// OBJET, elle n'existe déjà que là où une scène peut recevoir le résultat.
nonisolated enum ComposerSoundSource: Equatable, Hashable, CaseIterable {
    /// L'étagère — un son EMPRUNTÉ, qui devient le fond de la scène.
    case library
    /// Le micro — la surface PRINCIPALE de la feuille.
    case record
    /// Un fichier audio du disque.
    case files
}

/// Les mots du rôle de mixage.
///
/// « Fond » et « premier plan » sont les deux mots du DOMAINE — le modèle les
/// porte déjà sous `isBackground`. On ne dit ni « musique » ni « voix » : le
/// rôle ne dépend pas de ce qu'est le son, mais de la place qu'il occupe.
nonisolated enum ComposerSoundRoleCopy {

    static var title: String {
        String(localized: "composer.sound.role.title",
               defaultValue: "Place du son", bundle: .main)
    }

    /// **Le libellé dépend de la DESTINATION, pas du seul rôle**.
    ///
    /// « Contenu de publication · Pièce jointe du post, avec son lecteur » est
    /// juste sur un post texte, et FAUX sur une scène : là, le même choix pose
    /// une puce sur la toile — déplaçable, redimensionnable, sans lecteur sous
    /// le texte, puisqu'il n'y a pas de texte. Le rôle envoyé au modèle est
    /// pourtant le même (`ComposerAudioRole.foreground`).
    ///
    /// > Un interrupteur dont le libellé décrit ce que l'option fait AILLEURS
    /// > est pire qu'un libellé vague : il est vérifiable, et il est faux.
    /// > L'auteur qui le lit choisit sciemment autre chose que ce qu'il obtient.
    ///
    /// Le paramètre a un DÉFAUT — `.contentCard`, le cas nominal — parce que
    /// deux appelants (`FeedView`) n'offrent aucun placement du tout et n'ont
    /// donc rien à dire là-dessus. Le défaut sert ceux qui ne posent pas la
    /// question, jamais ceux qui la posent : le meuble, lui, passe la
    /// destination qu'il vient de résoudre.
    static func label(_ role: ComposerAudioRole,
                      destination: ComposerSoundDestination = .contentCard) -> String {
        if role == .foreground, destination == .sceneChip {
            return String(localized: "composer.sound.role.foreground.scene",
                          defaultValue: "Puce sur la scène", bundle: .main)
        }
        switch role {
        // **Ce que le son EST**, pas où il se place géométriquement. « En fond » et
        // « au premier plan » décriraient une position ; ce que l'auteur choisit est
        // une NATURE — la slide porte ce son, ou la publication EST ce son.
        //
        // **Et le fond appartient à la SLIDE, pas à la publication.** Le modèle le
        // porte déjà — `StorySlide.effects.audioPlayerObjects` est par slide — et un
        // mot qui dirait le contraire désignerait le mauvais propriétaire : chaque
        // relecteur y lirait la réponse qu'il a en tête.
        case .background:
            return String(localized: "composer.sound.role.background",
                          defaultValue: "Fond de la slide", bundle: .main)
        case .foreground:
            return String(localized: "composer.sound.role.foreground",
                          defaultValue: "Contenu de publication", bundle: .main)
        }
    }

    /// **Ce que le placement VEUT DIRE sur une publication.**
    ///
    /// Deux mots — « fond », « premier plan » — décrivent une géométrie, et le
    /// choix n'en est pas une : c'est un choix de NATURE. Le dire sous chaque
    /// option coûte deux lignes et lève la seule question que l'auteur ne pourrait
    /// pas trancher à l'œil.
    ///
    /// | placement | ce que le lecteur voit et entend |
    /// |---|---|
    /// | fond | le son se joue pendant la lecture ; **aucun lecteur** n'apparaît |
    /// | premier plan | le son devient une **pièce jointe** du post, avec son lecteur — un post audio |
    /// **Et sa définition suit la même destination** — c'est elle qui
    /// porte le mot « redimensionnable », donc la promesse que la directive
    /// fait à l'auteur.
    static func description(_ role: ComposerAudioRole,
                            destination: ComposerSoundDestination = .contentCard) -> String {
        if role == .foreground, destination == .sceneChip {
            return String(localized: "composer.sound.role.foreground.scene.detail",
                          defaultValue: "Posée sur la scène : déplaçable, redimensionnable.",
                          bundle: .main)
        }
        switch role {
        case .background:
            return String(localized: "composer.sound.role.background.detail",
                          defaultValue: "Se joue pendant cette slide, sans lecteur visible.",
                          bundle: .main)
        case .foreground:
            return String(localized: "composer.sound.role.foreground.detail",
                          defaultValue: "Pièce jointe du post, avec son lecteur.",
                          bundle: .main)
        }
    }

    /// **Pourquoi le premier plan est refusé à un son EMPRUNTÉ.**
    ///
    /// Une pièce jointe est un FICHIER de la publication : en faire une à
    /// partir d'un son de la bibliothèque supposerait de le ré-uploader, donc
    /// de le détacher de son `soundId` — et le crédit de son auteur avec lui.
    /// Le fond, lui, référence le son sans le copier : c'est là que le rognage
    /// d'un son emprunté vit, porté par `sourceStart`/`sourceEnd`.
    ///
    /// Désactiver l'option en le DISANT vaut mieux que la masquer : une option
    /// absente se lit comme une capacité qui n'existe pas.
    static var borrowedForegroundRefusal: String {
        String(localized: "composer.sound.role.foreground.borrowed",
               defaultValue: "Un son de la bibliothèque reste crédité à son auteur : il ne peut pas devenir une pièce jointe.",
               bundle: .main)
    }
}

nonisolated enum ComposerSoundSourcePolicy {

    /// L'ordre n'est pas décoratif : **enregistrer d'abord**. La porte ouvre
    /// directement le micro, et les deux autres provenances sont des entrées
    /// offertes SOUS lui, dans la même feuille. L'étagère ne vient pas en tête :
    /// emprunter serait le geste nominal d'un CHOIX préalable, qui n'existe pas.
    static let offered: [ComposerSoundSource] = [.record, .library, .files]

    static func label(_ source: ComposerSoundSource) -> String {
        switch source {
        case .library:
            return String(localized: "composer.rail.sound.library",
                          defaultValue: "Emprunter un son", bundle: .main)
        case .record:
            return String(localized: "composer.rail.sound.record",
                          defaultValue: "Enregistrer un vocal", bundle: .main)
        case .files:
            return String(localized: "composer.rail.sound.files",
                          defaultValue: "Importer un fichier audio", bundle: .main)
        }
    }

    /// Le titre de la feuille est **le libellé de la porte**, comme pour le
    /// média : `composer.rail.sound` dit déjà « Ajouter un son » dans les sept
    /// langues servies.
    static var chooserTitle: String { ComposerRailCopy.label(.sound) }

    static var cancel: String { ComposerMediaSourcePolicy.cancel }
}


/// **Les libellés de l'historique**.
///
/// Ils sont ici, avec les autres règles pures du meuble, et pas dans la barre
/// haute : c'est la barre qui les AFFICHE, mais c'est le meuble qui décide que
/// l'historique existe. Un jour où une seconde surface servira l'historique,
/// elle lira les mêmes mots sans dépendre de la vue qui les portait.
nonisolated enum ComposerHistoryCopy {

    static var undo: String {
        String(localized: "composer.history.undo",
               defaultValue: "Annuler", bundle: .main)
    }

    static var redo: String {
        String(localized: "composer.history.redo",
               defaultValue: "Rétablir", bundle: .main)
    }
}


/// **Qui sert l'historique, et pourquoi pas tout le monde**.
///
/// L'historique du composer photographie `slides` — la SCÈNE et ses objets.
/// Sur l'écran DOCUMENT, ce que l'auteur vient de faire est presque toujours du
/// texte, que le clavier annule déjà par son propre geste ; y montrer un
/// « annuler » qui remonte une pose de fond faite deux écrans plus tôt
/// promettrait d'annuler la frappe et ferait autre chose. **Un contrôle qui
/// défait autre chose que le dernier geste visible est pire qu'absent.**
///
/// La scène, elle, accumule des gestes qui ne se défont par rien d'autre :
/// poser un sticker, avancer un objet d'un plan, changer le fond.
///
/// ## Le piège de deux énumérations au même nom
///
/// Un prédicat qui prendrait un `ComposerSurfaceKind` compilerait, serait
/// testé, et ne pourrait JAMAIS rendre `true` là où il compte : la scène
/// incrustée est un `ComposerSurfaceKind.document` **qui a une scène** — c'est
/// `ComposerMountedView.scene` qui la nomme, et seul lui. Le `.scene` du KIND
/// désigne l'ATELIER, une surface que ce meuble ne monte pas sur ce chemin.
///
/// > **Deux énumérations dont un cas porte le même nom décrivent deux niveaux
/// > différents, et le compilateur ne peut pas dire laquelle on voulait.** Le
/// > témoin qui l'attrape n'est pas un test de plus sur le prédicat — trois
/// > tests verts n'y suffiraient pas — mais un test qui part de l'ÉTAT réel :
/// > « un document AVEC une scène sert-il l'historique ? »
nonisolated enum ComposerHistoryService {

    /// - Parameter view: la vue réellement MONTÉE — jamais le format, jamais le
    ///   kind de surface. C'est la présence de la scène qui décide, et elle
    ///   seule ; `ComposerMountedView` est le seul type qui la porte.
    static func servesHistory(on view: ComposerMountedView) -> Bool {
        view == .scene || view == .atelier
    }
}

/// **Ce qu'une provenance de son EXIGE de la présentation**.
///
/// ## Le défaut que ce type ferme
///
/// `ComposerPortal` a rendu deux feuilles simultanées non représentables : une
/// variable ne porte qu'une valeur, et ouvrir la seconde ferme la première. La
/// règle a tenu — pour les feuilles. **Elle ne dit rien des présentations qui
/// n'en sont pas.**
///
/// Le bouton « Fichiers » de la feuille du son qui poserait
/// `showsFileImporter = true` en laissant `presentedPortal = .sound` monté
/// ferait deux présentations attachées au MÊME corps de vue ; iOS n'en présente
/// pas une seconde depuis un présentateur déjà occupé. **Le bouton serait
/// INERTE** — aucun crash, aucune trace, rien à l'écran.
///
/// Sa voisine `.library` n'a pas ce défaut, et c'est ce qui le cacherait :
/// elle REMPLACE le portail (`.soundLibrary`), donc elle passe par la propriété
/// structurelle du type somme. Les deux branches se ressemblent au point d'être
/// lues comme équivalentes ; elles empruntent deux mécanismes de présentation
/// différents, dont un seul est protégé.
///
/// > **Une garantie STRUCTURELLE ne protège que ce qu'elle représente.** Un
/// > `ComposerPortal?` rend impossibles deux FEUILLES concurrentes ; il ne peut
/// > rien contre une feuille et un sélecteur système, parce que le second n'est
/// > pas une de ses valeurs. Ce qui échappe au type échappe à sa preuve.
nonisolated enum ComposerSoundHandoff: Equatable {

    /// La provenance ouvre un autre PORTAIL — le type somme ferme le premier
    /// tout seul, aucune précaution à prendre.
    case portal

    /// La provenance ouvre une présentation SYSTÈME. Elle ne peut pas paraître
    /// tant qu'une feuille occupe le présentateur : il faut FERMER, puis ouvrir
    /// à la fermeture effective (`onDismiss`), jamais dans la même transaction.
    case systemImporterAfterDismiss

    /// Le micro est la surface de la feuille elle-même — il n'y a rien à ouvrir.
    case sheetSurface

    static func handoff(for source: ComposerSoundSource) -> ComposerSoundHandoff {
        switch source {
        case .library: return .portal
        case .files:   return .systemImporterAfterDismiss
        case .record:  return .sheetSurface
        }
    }
}

/// **Ce que l'importateur de fichiers va RAPPORTER**.
///
/// Le meuble n'a qu'UN `.fileImporter`, et c'est voulu : deux sélecteurs frères
/// rejoueraient exactement le conflit de présentation que `ComposerSoundHandoff`
/// documente. Ce qui change d'une porte à l'autre n'est donc pas le sélecteur
/// mais ce qu'on lui demande — et ce qu'on fait du résultat.
///
/// **La destination est le VRAI correctif.** Même l'importateur ouvert, tout
/// fichier irait dans `documentLocalMedia`, la liste média du DOCUMENT : un
/// audio choisi pour la scène n'y arriverait jamais comme son. L'enregistrement
/// suit la règle inverse (« le résultat va sur la SCÈNE, jamais dans la liste
/// média »), et la branche fichier la suit aussi.
nonisolated enum ComposerFileImportIntent: Equatable {

    /// La rangée du document et la porte média — tout ce qui compose la
    /// publication. Un fichier AUDIO choisi ici devient un son posé sur la
    /// scène (`ComposerImportedFileRoute`).
    case media

    /// La porte SON : un fichier audio, posé sur la scène avec son rôle.
    case sound

    /// **Le filtre suit l'intention.** `.item` sur la porte du son laisserait
    /// choisir un PDF pour un son de fond : une erreur que l'utilisateur
    /// n'apprend qu'après coup, quand rien ne se passe.
    var contentTypes: [UTType] {
        switch self {
        case .media: return [.item]
        case .sound: return [.audio]
        }
    }

    /// Un son de scène est UNIQUE — la scène n'en porte qu'un par rôle. Offrir
    /// la sélection multiple promettrait une pose que le modèle ne tient pas.
    var allowsMultipleSelection: Bool {
        switch self {
        case .media: return true
        case .sound: return false
        }
    }
}
