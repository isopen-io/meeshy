import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// Les RÈGLES pures du meuble — éprouvables sans monter la moindre vue, et
// c'est pourquoi elles vivent hors du type qui les lit (#4102).


/// Le gate du réel, en UN seul endroit — **et nourri de la composition RÉELLE
/// depuis V1**.
///
/// Il fut une constante `false`, lue aux deux seuls sites qui construisent un
/// profil : l'éventail était écrit, testé, et débranché. Ce qu'il lit
/// maintenant est la composition que l'auteur a posée.
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

/// **Ce que le socle MONTRE quand le texte grossit (#4057).**
///
/// Ses deux zones nommées portent un pictogramme ET un mot. Aux paliers
/// d'ACCESSIBILITÉ, le mot ne tient plus : mesuré au simulateur le 2026-08-28,
/// en allemand à `accessibility-XXXL`, « Veröffentlichen » se cassait en
/// syllabes EMPILÉES — « Ver- / öf- / fent- / li- » — et « Öffentlich » se
/// tronquait en « Öffe… ». Le socle, qui est une RANGÉE, devenait une colonne
/// de fragments.
///
/// Au-delà de ce seuil, les libellés se réduisent donc à leur ICÔNE. C'est la
/// forme qui préserve la loi 5 (« le socle ne bouge jamais ») : les zones ne se
/// déplacent pas et ne passent pas à la ligne — elles RÉTRÉCISSENT, au même
/// endroit.
///
/// **Ce que la réduction ne touche PAS** : le nom accessible. Un contrôle qui
/// perd son nom en devenant compact est le défaut que `StatusComposerView` a dû
/// corriger, et que la flèche de publication évite déjà en refusant d'échanger
/// son libellé contre un `ProgressView`. VoiceOver et Voice Control lisent le
/// même mot à toutes les tailles ; seul l'ŒIL en est privé, et seulement quand
/// le montrer le rendrait illisible.
///
/// Le seuil est `isAccessibilitySize` et non un palier choisi à la main : c'est
/// la frontière que le système lui-même trace entre « plus grand » et « conçu
/// pour l'accessibilité », et la recopier en dur la ferait diverger.
/// **Le rail qui FLOTTE sur la scène — quatre gestes, bord droit, DEDANS
/// (#4072, arbitrage du 2026-08-28 sur #4061).**
///
/// L'arbitrage a écarté la disposition « deux rails latéraux encastrant la
/// scène » au motif qu'aucune capture ne la montre. Ce que la planche `1b`
/// montre est UN rail, flottant sur le bord DROIT, à quatre actions
/// (✎ ☺ ♫ #) — **et la rangée d'outils basse conservée**.
///
/// **Deux places, deux NIVEAUX** (directive porteur 2026-08-31, #4561).
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
/// **L'axe précédent était « agit sur la scène » contre « fait entrer de la
/// matière ».** Il classait le dessin en bas (un tracé ENTRE dans la scène) et
/// la mention à gauche (elle agit sur ce qui est là) — deux rangements
/// défendables qui ne disaient rien à l'auteur, parce qu'ils décrivent le VERBE
/// de la porte et non l'endroit où son résultat apparaît. La main, elle, suit
/// le résultat : le geste part de la colonne et atterrit sur la scène.
///
/// **Aucun rail ne se pose SUR la scène** (même directive). Un contrôle
/// flottant vole les touches de la bande qu'il couvre, et l'auteur découvre la
/// zone morte en essayant d'y traîner quelque chose. Le plateau est de la place
/// disponible — la scène est figée en 9:16, l'écran ne l'est pas.
nonisolated enum ComposerSceneFloatingRail {

    /// **La rangée de GAUCHE — ce qui apparaît visuellement sur la scène.**
    ///
    /// Elle se DÉDUIT du niveau de chaque porte, jamais d'une liste. Le
    /// littéral qui vivait ici — `[.text, .sticker, .sound, .mention]` — rangeait
    /// `.mention` parmi ce qui vit sur la scène, alors que `ComposerRailDoor`
    /// la déclare `.publication` deux fichiers plus loin. Deux répartitions
    /// coexistaient : l'une raisonnée, l'autre recopiée, et seule la recopiée
    /// était appelée.
    ///
    /// > Une liste écrite à la main À CÔTÉ d'une règle qui décide déjà la même
    /// > chose ne se fait contredire par rien : les deux compilent, et le
    /// > doc-comment de la règle continue d'énoncer une classification juste que
    /// > le produit n'applique pas.
    static func sideRow(from served: [ComposerRailDoor]) -> [ComposerRailDoor] {
        served.filter { $0.level.appearsOnCanvas }
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
    static func lowRow(from served: [ComposerRailDoor]) -> [ComposerRailDoor] {
        served.filter { !$0.level.appearsOnCanvas }
    }
}


nonisolated enum ComposerSocleDensity {
    static func showsLabels(_ size: DynamicTypeSize) -> Bool {
        !size.isAccessibilitySize
    }
}

/// **Ce qu'un tap sur le FOND de la scène incrustée sélectionne (#4035).**
///
/// Règle PURE, hors de tout `body` : une condition posée dans une vue est
/// invisible aux tests, et celle-ci gouverne l'existence même de la zone
/// contextuelle.
///
/// **Pourquoi elle existe.** L'inspecteur était câblé de bout en bout — la
/// scène transmet `onItemTapped`, l'hôte retient la sélection, la surface monte
/// la zone — et pourtant INATTEIGNABLE sur l'écran document. En profil Post une
/// slide ne porte qu'UN média, et la règle 4 en fait son FOND (#4038) ; or le
/// hit-test du canvas n'itère que le conteneur des ITEMS, où un fond ne vit
/// pas. Le tap retombait donc sur `onBackgroundTapped`, qui effaçait la
/// sélection : écran identique au bit près, mesuré au simulateur le 2026-08-28.
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
}

/// **Le gate du MOOD — la jumelle de `ComposerReelGate` (#4030).**
///
/// Le fan du fil offrait `[.post, .story]` et, quand la composition qualifiait,
/// `.reel`. Le quatrième format n'était atteignable que par sa PORTE
/// (`.moodChip`) : un auteur qui venait d'écrire deux lignes dans le composer
/// du fil devait fermer, revenir par le chip mood et retaper — la loi 9 (le
/// contenu est PRÉSERVÉ à travers les formats) tombait sur le seul format
/// qu'aucune bascule n'atteignait.
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

/// **Le meuble** du composer unifié (C2) — plateau, scène, socle permanent.
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
///   ne peint plus d'œil du tout depuis le lot 4.9 : aucune de ses deux surfaces
///   n'a de canvas à lire, et un aperçu VIDE ment autant qu'un aperçu maison.
///   L'œil de l'atelier, lui, est intact — c'est l'atelier qui le peint ;
/// - il **ne décide de rien** : ce qu'il montre est fonction du
///   `ComposerProfile` que `ComposerIntent` lui donne (C1). Le host lit la
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
/// lecture : audience, œil, publication. C'est le point fixe qui fait qu'un
/// composer reste le même objet vu de neuf endroits différents.
/// `MeeshyComposerHostGuardTests` le verrouille par garde de source, faute d'une
/// sortie observable.
///
/// **Aucune UI morte** : une capacité refusée par le profil n'est pas montée
/// puis désactivée, elle est ABSENTE (loi 4 — « rien à l'écran sans raison »).
///
/// ## Équivalence avec le cover de création (C3)
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
/// Depuis V3-2, ce n'est plus une équivalence à tenir « au cas où » : le cover
/// de création MONTE ce host, et a cessé de poser lui-même ce que le host pose.
/// Une des trois qui manquerait ici manquerait désormais à l'écran.
/// Les deux libellés d'ÉTAT de la flèche du socle — ceux que VoiceOver annonce
/// quand la publication est en vol ou refusée.
///
/// Ils ne sont pas dans la vue : un libellé posé en littéral échappe au cliquet
/// de complétude et n'est jamais traduit. Même idiome que `ComposerDocumentCopy`
/// et `ComposerMoodCopy`.
///
/// **Zéro clé neuve.** Les deux MIGRENT depuis `StatusComposerView`, où elles
/// n'avaient qu'un lecteur, et elles sont traduites dans les sept locales
/// livrées. Le socle est leur second lecteur : c'est ce qui les empêche de
/// devenir orphelines le jour du retrait (lot 4.8).
///
/// **Ce que ce déménagement n'avait pas réglé, et que le lot 4.8 a tranché** :
/// `status.composer.publish` n'était lue que par `StatusComposerView`. Le socle
/// garde `composer.socle.publish`, qui n'est pas la même phrase — « Publish »
/// contre « Post » en anglais — et fondre les deux aurait été une édition de
/// catalogue qu'aucun de ces lots ne possède. La clé a donc été RETIRÉE des sept
/// locales avec l'écran qui la lisait : la laisser aurait fait rougir la garde
/// des clés mortes (`LocalizationConsistencyTests`).
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
    /// `nil` hors du mood, et c'est une lacune ASSUMÉE, pas un oubli : la seule
    /// phrase déjà traduite dit « choisissez un emoji », ce qui est faux d'un
    /// document, dont le gate porte sur le texte. Le lot 4 n'ajoute AUCUNE clé
    /// au catalogue (sept locales, cliquet français à zéro tolérance).
    ///
    /// **Une porte de production ATTEINT le document depuis le lot 4.7** — la
    /// republication d'un mood, dont l'éventail offre le chip « Post ». La
    /// lacune n'y mord pourtant pas, et c'est ce qui a rendu la descente de
    /// l'éventail possible sans clé neuve : sous un ancrage, le gate arme sur la
    /// SOURCE (`repostOfId`), jamais sur le texte, si bien que la flèche n'y est
    /// jamais grise faute d'une phrase. Le seul refus qui reste atteignable sous
    /// cette surface est l'audience nominative vide, et `publishBlockedHint`
    /// rend déjà `""` dans ce cas — un indice FAUX coûtant plus qu'un indice
    /// absent.
    ///
    /// Une phrase pour le document s'écrira le jour où une porte l'atteindra
    /// avec un gate qui porte sur le TEXTE — c'est-à-dire `.feedComposer`, dans
    /// le lot qui possède le catalogue.
    static func publishBlockedHint(surface: ComposerSurfaceKind) -> String? {
        switch surface {
        case .mood:
            return String(localized: "a11y.status.publish.disabled.hint",
                          defaultValue: "Choisissez un emoji pour publier votre status", bundle: .main)
        case .document, .scene:
            return nil
        }
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
/// Les deux ensembles vécurent en `Set` littéraux, écrits à la volée dans
/// l'expression `sceneSurface`. Un littéral posé là est INÉPROUVABLE autrement
/// que par une garde de source — et une garde de source sur un littéral est
/// exactement le témoin qui passe au vert le jour où quelqu'un réécrit la liste
/// autrement. Sortis ici, les deux ensembles s'interrogent directement : un test
/// demande « la porte sticker est-elle servie ? » et obtient une réponse, pas
/// une sous-chaîne.
///
/// ## La loi 4, et ce qu'elle exige VRAIMENT d'une capacité
///
/// « Un contrôle sans effet est ABSENT, jamais grisé. » Une entrée n'entre donc
/// ici **qu'accompagnée de son chemin** : le meuble doit savoir, pour chacune,
/// ouvrir le portail et poser le résultat. C'est la seule question à se poser
/// avant d'ajouter une ligne — pas « la maquette la dessine-t-elle ? ».
///
/// ## Ce que l'absence de `sticker` cachait, et qui vaut d'être dit
///
/// La porte `sticker` fut retenue au motif qu'« aucun chemin ne pose un objet de
/// ce kind ». Le motif était faux : `StoryComposerViewModel.addSticker(emoji:)`
/// existe depuis C13, `StickerPickerView` est publique depuis C8, et le meuble
/// injecte déjà « Mes stickers » (`storyStickerLibraryProvided`). Ce qui
/// manquait n'était pas le chemin, c'était le niveau d'ACCÈS de la primitive —
/// et un `internal` ressemble, vu du site d'appel, à une règle produit.
///
/// Même histoire pour l'empilement : `bringForward` / `sendBackward` vivent sur
/// le MODÈLE, pas sur la vue UIKit, et l'auraient toujours pu.
///
/// ## Ce qui n'y est PAS, et pourquoi
///
/// - `edit` — l'inspecteur par kind est la vue `1c`, pas encore montée (#4073) ;
///   servir l'action ouvrirait un éditeur qui n'existe pas.
/// - `leaveScene` — sortir un objet de la scène demande de décider ce qu'il
///   devient dehors, ce qu'aucune règle du dépôt ne tranche encore (#4038).
nonisolated enum ComposerSceneCapabilities {

    /// Les portes du rail *leading*. Passées à `ComposerRailDoor.offered`, qui
    /// leur applique ensuite la règle du FORMAT — une porte de niveau objet
    /// disparaît d'un `status`, qui n'a pas de scène.
    /// **La porte SON n'y est plus** (directive porteur 2026-08-31) :
    ///
    /// > « Retire la porte son de la rangée, car on n'aura ici qu'une
    /// > possibilité d'ajouter un son sur LE CANVAS, en tant que sticker /
    /// > chip redimensionnable, déplaçable. »
    ///
    /// **Elle ne coûtait aucune capacité, et c'est mesuré** : `handleRailDoor(.sound)`
    /// appelait `presentSoundSources()`, dont le corps entier est
    /// `presentedPortal = .sound` — la ligne EXACTE que la pastille du socle
    /// exécute déjà. Deux boutons, une seule feuille.
    ///
    /// > Ce n'était pas une capacité en double, c'était un BOUTON en double. La
    /// > différence décide du correctif : on retire l'un des deux sans rien
    /// > perdre, là où deux capacités auraient demandé de choisir laquelle
    /// > survit.
    ///
    /// Le son POSÉ sur la scène (objet visible, déplaçable, redimensionnable)
    /// revient par la palette de constructions (#4579), derrière l'entrée
    /// sticker ; le son de FOND reste au socle, où il porte son crédit (#4071).
    ///
    /// **`.hashtag` y entre le 2026-08-31** (#4636, directive porteur : « mettre
    /// l'outil hashtag dans la liste des outils d'un slide ou d'une
    /// publication »). Elle est servie parce que le meuble possède le chemin
    /// complet — le texte de la publication est à lui (`documentText`), et
    /// `ComposerHashtags.inserting` y écrit. Une porte servie sans son chemin
    /// d'ingestion ouvrirait un sélecteur dont le résultat n'irait nulle part.
    static let doors: Set<ComposerRailDoor> = [
        .description, .media, .text, .drawing, .sticker, .mention, .hashtag, .place
    ]

    /// Les contrôleurs du rail *trailing*. Passés à
    /// `ComposerTrailingRailPolicy.actions`, qui leur applique ensuite ce que
    /// l'OBJET admet (verrouillé, fond, seul de son plan).
    /// `.trim` y est entrée au #4082 : le meuble sait désormais ouvrir la bande
    /// de rognage sous la scène. Ce jeu dit ce que CE meuble sait faire ; ce
    /// qu'un OBJET admet reste à la règle du SDK, qui n'offre le rognage qu'à
    /// une vidéo ou un son (`hasTrimmableSource`).
    static let controllers: Set<StoryCanvasContextAction> = [
        .duplicate, .delete, .bringForward, .sendBackward, .trim
    ]

    /// Les bandes contextuelles du bas de scène. Passées à
    /// `ComposerSceneBand.opened`, qui n'ouvre JAMAIS une bande demandée mais
    /// non servie — sans quoi un contexte déclaré avant d'avoir son contenu
    /// occuperait les ≈ 170 pt que l'encastrement des rails vient de libérer.
    ///
    /// `timeline` et `textStyles` appartiennent au critère de
    /// `ComposerSceneBand` — un axe horizontal, une comparaison latérale — mais
    /// n'ont pas d'hôte ici : la timeline vit dans l'atelier (#4075), et les 18
    /// styles exigent un objet `text` SÉLECTIONNÉ, qu'aucune porte de cette
    /// surface ne pose encore (#4083).
    static let bands: Set<ComposerSceneBand> = [.palette]

    /// **`timeline` est servie SEULEMENT quand elle a de quoi se remplir**
    /// (#4082) — c'est-à-dire quand l'objet sélectionné a une source à rogner.
    ///
    /// Sans cette condition, la bande deviendrait un membre permanent du jeu
    /// servi, et `ComposerSceneBand.opened` l'ouvrirait sur une sélection qui
    /// n'a rien à rogner : une bande VIDE occupant les ≈ 170 pt que
    /// l'encastrement des rails vient de libérer, c'est-à-dire précisément le
    /// résultat que la règle `opened(_:served:)` existe pour interdire.
    ///
    /// Le jeu de base reste `bands` : il dit ce qui est servi quel que soit
    /// l'état, et c'est lui que les gardes interrogent pour vérifier
    /// qu'aucune bande sans hôte n'y est entrée par distraction.
    /// **Deux capacités, deux questions distinctes** — et c'est pour cela
    /// qu'elles sont deux paramètres et non un `Set` reçu tout fait : le jour
    /// où l'appelant les confond, le compilateur ne dit rien, alors qu'un
    /// paramètre nommé se relit.
    ///
    /// `canStyleSelection` est vrai quand l'objet sélectionné est un TEXTE
    /// (#4083). Sans lui, la bande `textStyles` n'était jamais servie et le
    /// jeton « STYLE » de l'inspecteur pointait sur du vide — mesuré au
    /// simulateur le 2026-08-31 : il s'annonçait en `StaticText`, faute de
    /// destination ouvrable.
    static func bands(canTrimSelection: Bool,
                      canStyleSelection: Bool = false) -> Set<ComposerSceneBand> {
        var servies = bands
        if canTrimSelection { servies.insert(.timeline) }
        if canStyleSelection { servies.insert(.textStyles) }
        return servies
    }
}


/// **Les trois sources qu'UNE porte média ouvre** — et pourquoi la porte du
/// rail n'en servait qu'une.
///
/// `ComposerRailDoor.offered` porte, sur son paramètre `allowsCapture`, cette
/// phrase :
///
///   > « Le rail n'ayant qu'UNE porte pour les trois sources, la gater ici
///   > retirerait la bibliothèque avec la caméra […]. Le drapeau est donc reçu,
///   > documenté, et volontairement sans effet sur cette liste : c'est le
///   > SÉLECTEUR qu'il gouverne, en aval. »
///
/// Le raisonnement est juste. **Le sélecteur en aval n'existait pas** :
/// `handleRailDoor(.media)` allait droit à la photothèque. Dès qu'une scène
/// existait, la CAMÉRA et l'IMPORT DE FICHIER — deux des sept entrées de la
/// rangée canonique — disparaissaient de l'écran sans qu'aucune règle les
/// retire. C'est la leçon 335 une seconde fois, sur le même écran : un
/// commentaire qui décrit un mécanisme ABSENT ne se fait contredire par rien.
///
/// ## Ce que la règle décide, et ce qu'elle laisse au meuble
///
/// Elle dit QUELLES sources sont offertes ; le meuble décide comment les
/// présenter — et notamment qu'**une source unique se présente DIRECTEMENT**,
/// sans feuille de choix : une liste à un seul élément est un geste de plus
/// pour zéro décision (loi 7, chemin nominal ≤ 2 gestes).
///
/// ## `allowsCapture` retire la caméra, jamais les deux autres
///
/// Le drapeau existe pour ce qui REPREND un contenu déjà publié (repost,
/// édition) : on n'y filme pas, mais on garde le droit d'ajouter une image de
/// sa bibliothèque ou un fichier. Le gater plus haut aurait fermé les trois.
nonisolated enum ComposerMediaSourcePolicy {

    static func offered(allowsCapture: Bool) -> [ComposerMediaIntake] {
        [.photoLibrary, .camera, .files].filter { $0 != .camera || allowsCapture }
    }

    /// L'outil de la rangée canonique qui NOMME cette source.
    ///
    /// Le libellé n'est pas réécrit ici : c'est `ComposerDocumentCopy.label`
    /// qui le rend, donc exactement le mot que la rangée du document emploie
    /// pour le même geste. Une seconde table aurait fait dire « Photos » d'un
    /// côté et « Photothèque » de l'autre pour un seul sélecteur (dimension 6),
    /// et dédoublé sept traductions.
    static func namingTool(_ intake: ComposerMediaIntake) -> ComposerDocumentTool {
        switch intake {
        case .photoLibrary: return .photo
        case .camera:       return .camera
        case .files:        return .document
        }
    }

    /// Le titre de la feuille est **le libellé de la porte elle-même**, pas une
    /// clé neuve : `composer.rail.media` dit déjà « Ajouter un média » dans les
    /// sept langues servies. Une seconde clé pour la même phrase, ce sont sept
    /// traductions à faire diverger — le raisonnement que
    /// `ComposerDocumentCopy.label` tient déjà pour la rangée du document.
    static var chooserTitle: String { ComposerRailCopy.label(.media) }

    static var cancel: String {
        String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)
    }
}


/// **D'où vient un son posé sur la scène** — et pourquoi la porte n'en servait
/// qu'une provenance.
///
/// La porte `sound` du rail routait vers `handleDocumentTool(.microphone)` :
/// elle n'ENREGISTRAIT que. Emprunter un son à l'étagère était impossible
/// depuis le composer unifié — aucune occurrence de `SoundLibraryPicker` ni
/// d'`addBorrowedSound` dans tout le meuble — alors que le socle de la vue `1b`
/// affiche déjà un crédit de son (« ♫ NUITS BLANCHES · @lume · 0:28 »).
///
/// **Troisième fois sur le même écran** qu'une porte unique ne sert qu'une de
/// ses sources, après le média (caméra et fichier perdus) et les capacités de
/// la scène (sticker, empilement). Le motif se répète parce que rien n'oppose
/// une porte à ce qu'elle PROMET : le rail dit « Ajouter un son », le handler
/// en sert un seul type.
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
/// ## Ce que cette doctrine confondait, et que le porteur a tranché (#4483)
///
/// Elle concluait « les fondre en un seul geste ferait d'une note vocale la
/// bande-son de la publication ». La conclusion ne suivait pas de sa prémisse :
/// elle mêlait deux champs ORTHOGONAUX de `StoryAudioPlayerObject`.
///
/// | ce qui est en jeu | le champ qui le porte | qui l'écrit |
/// |---|---|---|
/// | le CRÉDIT (« ♫ NUITS BLANCHES · @lume ») | `soundId` + `soundAuthorUsername` | `addBorrowedSound`, et lui seul |
/// | le rôle de MIXAGE | `isBackground` | n'importe quel son |
///
/// Un vocal mis en fond porte donc `isBackground = true` et `soundId = nil` : le
/// bon mixage, sans ligne de crédit mensongère. Ce que la doctrine protégeait
/// vraiment — qu'un enregistrement personnel ne s'attribue pas le crédit d'une
/// piste empruntée — reste protégé, et l'auteur gagne le choix que le porteur a
/// demandé le 2026-08-30 : « les mettre en background ou en foreground ».
///
/// L'ORDRE change avec elle. La doctrine rangeait l'étagère en premier, au motif
/// qu'emprunter est le geste nominal. Le porteur a demandé que la porte « ouvre
/// directement l'enregistrement audio » : le micro passe donc devant, et les
/// deux autres provenances deviennent des entrées SOUS lui, dans la même
/// feuille — plus un choix préalable qui coûtait un geste pour rien.
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
    /// Le micro — la surface PRINCIPALE de la feuille depuis #4483.
    case record
    /// Un fichier audio du disque.
    case files
}

/// Les mots du rôle de mixage (#4483).
///
/// « Fond » et « premier plan » sont les deux mots du DOMAINE — le modèle les
/// porte déjà sous `isBackground`. On ne dit ni « musique » ni « voix » : le
/// rôle ne dépend pas de ce qu'est le son, mais de la place qu'il occupe.
nonisolated enum ComposerSoundRoleCopy {

    static var title: String {
        String(localized: "composer.sound.role.title",
               defaultValue: "Place du son", bundle: .main)
    }

    static func label(_ role: ComposerAudioRole) -> String {
        switch role {
        // **Ce que le son EST**, pas où il se place géométriquement (directive
        // porteur 2026-09-01). « En fond » et « au premier plan » décrivaient
        // une position ; ce que l'auteur choisit est une NATURE — la slide
        // porte ce son, ou la publication EST ce son.
        //
        // **Et le fond appartient à la SLIDE, pas à la publication** (arbitrage
        // porteur 2026-09-01, #4673 : « clairement à un Slide ! »). Le modèle le
        // portait déjà — `StorySlide.effects.audioPlayerObjects` est par slide —
        // et le mot disait le contraire. Un libellé qui désigne le mauvais
        // propriétaire est exactement ce qui a permis à la question de rester
        // ouverte : chaque relecteur y lisait la réponse qu'il avait en tête.
        case .background:
            return String(localized: "composer.sound.role.background",
                          defaultValue: "Fond de la slide", bundle: .main)
        case .foreground:
            return String(localized: "composer.sound.role.foreground",
                          defaultValue: "Contenu de publication", bundle: .main)
        }
    }

    /// **Ce que le placement VEUT DIRE sur une publication** (directive porteur
    /// 2026-09-01).
    ///
    /// Deux mots — « fond », « premier plan » — décrivent une géométrie, et le
    /// choix n'en est pas une : c'est un choix de NATURE. Le dire sous chaque
    /// option coûte deux lignes et retire la seule question que l'auteur ne
    /// pouvait pas trancher à l'œil.
    ///
    /// | placement | ce que le lecteur voit et entend |
    /// |---|---|
    /// | fond | le son se joue pendant la lecture ; **aucun lecteur** n'apparaît |
    /// | premier plan | le son devient une **pièce jointe** du post, avec son lecteur — un post audio |
    static func description(_ role: ComposerAudioRole) -> String {
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

    /// L'ordre n'est pas décoratif : **enregistrer d'abord** depuis #4483. La
    /// porte ouvre directement le micro (directive porteur), et les deux autres
    /// provenances sont des entrées offertes SOUS lui, dans la même feuille.
    /// Auparavant l'étagère venait en tête, au motif qu'emprunter est le geste
    /// nominal — c'était vrai d'un CHOIX préalable, qui n'existe plus.
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


/// **Les libellés de l'historique** (#4402).
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


/// **Qui sert l'historique, et pourquoi pas tout le monde** (#4402).
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
/// ## Le défaut que la vérification simulateur a trouvé (2026-08-30)
///
/// Ce prédicat prenait un `ComposerSurfaceKind`. Il compilait, il était testé,
/// et il ne pouvait JAMAIS rendre `true` là où il comptait : la scène incrustée
/// est un `ComposerSurfaceKind.document` **qui a une scène** — c'est
/// `ComposerMountedView.scene` qui la nomme, et seul lui. Le `.scene` du KIND
/// désigne l'ATELIER, une surface que ce meuble ne monte pas sur ce chemin.
///
/// > **Deux énumérations dont un cas porte le même nom décrivent deux niveaux
/// > différents, et le compilateur ne peut pas dire laquelle on voulait.** Le
/// > témoin qui l'aurait attrapé n'est pas un test de plus sur le prédicat —
/// > il en avait trois, tous verts — mais un test qui part de l'ÉTAT réel :
/// > « un document AVEC une scène sert-il l'historique ? »
nonisolated enum ComposerHistoryService {

    /// - Parameter view: la vue réellement MONTÉE — jamais le format, jamais le
    ///   kind de surface. C'est la présence de la scène qui décide, et elle
    ///   seule ; `ComposerMountedView` est le seul type qui la porte.
    static func servesHistory(on view: ComposerMountedView) -> Bool {
        view == .scene || view == .atelier
    }
}

/// **Ce qu'une provenance de son EXIGE de la présentation** (#4632).
///
/// ## Le défaut que ce type ferme
///
/// `ComposerPortal` a rendu deux feuilles simultanées non représentables : une
/// variable ne porte qu'une valeur, et ouvrir la seconde ferme la première. La
/// règle a tenu — pour les feuilles. **Elle ne dit rien des présentations qui
/// n'en sont pas.**
///
/// Le bouton « Fichiers » de la feuille du son posait `showsFileImporter = true`
/// en laissant `presentedPortal = .sound` monté. Les deux présentations sont
/// attachées au MÊME corps de vue ; iOS n'en présente pas une seconde depuis un
/// présentateur déjà occupé. **Le bouton était INERTE** — aucun crash, aucune
/// trace, rien à l'écran.
///
/// Sa voisine `.library` n'avait pas ce défaut, et c'est ce qui a caché le
/// défaut un mois : elle REMPLACE le portail (`.soundLibrary`), donc elle passe
/// par la propriété structurelle du type somme. Les deux branches se
/// ressemblaient au point d'être lues comme équivalentes ; elles empruntent deux
/// mécanismes de présentation différents, dont un seul est protégé.
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

/// **Ce que l'importateur de fichiers va RAPPORTER** (#4632).
///
/// Le meuble n'a qu'UN `.fileImporter`, et c'est voulu : deux sélecteurs frères
/// rejoueraient exactement le conflit de présentation que `ComposerSoundHandoff`
/// documente. Ce qui change d'une porte à l'autre n'est donc pas le sélecteur
/// mais ce qu'on lui demande — et ce qu'on fait du résultat.
///
/// **La destination est le VRAI correctif.** Même l'importateur ouvert, tout
/// fichier partait dans `documentLocalMedia`, la liste média du DOCUMENT : un
/// audio choisi pour la scène n'y arrivait jamais comme son. C'est le défaut que
/// #4483 avait fermé pour l'enregistrement (« le résultat va sur la SCÈNE,
/// jamais dans la liste média ») et que la branche fichier n'avait pas suivi.
nonisolated enum ComposerFileImportIntent: Equatable {

    /// La rangée du document et la porte média — tout ce qui compose la
    /// publication.
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
