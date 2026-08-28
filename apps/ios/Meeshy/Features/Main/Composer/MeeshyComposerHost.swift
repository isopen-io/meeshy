import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

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

struct MeeshyComposerHost: View {

    let intent: ComposerIntent

    /// La visibilité d'ouverture. Le host ne la lit pas d'un magasin : c'est la
    /// porte qui la connaît (`StoryViewModel.lastComposerVisibility` pour la
    /// création), et un host qui irait la chercher lui-même deviendrait une
    /// seconde source pour un réglage qui en a déjà une.
    let initialVisibility: String

    /// Le brouillon à REPRENDRE, quand la porte en désigne un. `nil` ⇒ session
    /// neuve. Adopté à la construction du ViewModel, jamais après : l'atelier
    /// décide dès son premier passage s'il propose une reprise.
    let draftId: String?

    /// Le câblage de publication de l'atelier, transmis TEL QUEL. Le host
    /// n'ouvre pas un second chemin d'envoi : la file de publication unique est
    /// le lot V7, et fabriquer ici un chemin parallèle serait exactement la
    /// dette qu'il devra défaire.
    ///
    /// Son dernier terme est le FORMAT à publier (V3-3). Le host ne l'écrit pas
    /// lui-même dans l'appel — il ne fait aucun appel : il le POSE sur l'atelier
    /// (`publishTargetType`), qui le transmet au hand-off. C'est ce qui fait de
    /// l'éventail un choix réel plutôt qu'un décor.
    let onPublishAllInBackground: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String], String, [ComposerReference], ComposerMediaAccessibility, PostType) -> Bool

    /// **Le canal de publication du DOCUMENT** — le jumeau, pour les surfaces
    /// sans atelier, de ce que `onPublishAllInBackground` est pour la scène.
    ///
    /// Le meuble ne publie pas davantage qu'avant : il assemble un
    /// `ComposerDocumentDraft` et le tend à une fermeture que le SITE DE MONTAGE
    /// lui a donnée. Le rendu `Bool` est l'ACCEPTATION, et le socle n'obéit
    /// qu'à elle : il ne referme le composer que sur un `true`.
    ///
    /// **Ce que ce canal tient, et ce qu'il ne tient PAS — à lire au mot près,
    /// car la réponse a changé de moitié le 2026-08-25.** Le MÉCANISME du refus
    /// existe, et l'ÉCHEC D'ENVOI l'emprunte désormais sur DEUX des trois
    /// branches de production :
    ///
    /// - `DocumentComposerDoor.publish` rend `false` sur trois refus (plan,
    ///   matière, publieur muet) — lot 4.10 ;
    /// - `MoodComposerDoor.anchor` rend `false` dès que
    ///   `StatusViewModel.anchorStatusAsPost` refuse : un 403
    ///   `REPOST_AUDIENCE_WIDENING`, une coupure réseau, un hors-ligne — lot
    ///   4.7 ;
    /// - `MoodComposerDoor.publishMood`, LUI, rend toujours `true` après son
    ///   `await`, parce que `StatusViewModel.setStatus` ne rend rien — elle
    ///   avale l'erreur dans un `catch` qui se contente d'un toast. Un gateway
    ///   qui répond 500 referme donc ce composer-là et perd l'emoji, la phrase,
    ///   l'audience et les mentions.
    ///
    /// La dernière est la **dette IDENTIQUE à celle de l'écran historique**
    /// (`StatusComposerView` dismisse aussi après un `setStatus` muet) et **non
    /// refermée par ce lot** : sa levée commence par faire rendre un résultat à
    /// `setStatus`. Ne pas lire l'asymétrie comme un oubli de l'ancrage — c'est
    /// le miroir qui est en retard, et il est le seul.
    ///
    /// **Ce canal appartient au lot 4 et y RESTE.** Il n'est pas confié à un lot
    /// ultérieur : le plan du lot 7 déclare le dossier `Composer` interdit et
    /// fait naître son `PublishIntent` sous `Services/`. Écrire ici qu'il sera
    /// absorbé fabriquerait un travail que chacun croirait chez l'autre.
    ///
    /// — Note d'écriture, et ce n'est pas un détail de style : la phrase
    /// ci-dessus a d'abord été écrite avec le glob du plan, dont la forme
    /// contient la séquence qui OUVRE un commentaire de bloc. Le dépouilleur de
    /// `MyStoriesSourceCorpus` l'a lu comme tel, n'a jamais trouvé de fermeture,
    /// et a jeté les 738 lignes suivantes : toutes les gardes de source lisant
    /// ce fichier sont devenues aveugles d'un coup, et une seule a rougi.
    /// N'écris jamais ce glob dans un commentaire de ce dépôt.
    ///
    /// **Sans valeur par défaut, et c'est le fond de l'affaire.** Un défaut
    /// l'aurait fait disparaître en silence d'un site de montage — le mode
    /// d'échec exact que `ComposerDocumentSurface.onClose` consigne, et que
    /// `initialVisibility` a déjà coûté un cran plus haut. Un site qui n'a pas de
    /// publieur de document doit donc l'écrire, et écrire pourquoi.
    ///
    /// `@MainActor` sur le TYPE de fonction, et pas seulement sur le site : ce
    /// que la fermeture touchera est un ViewModel et une file, tous deux au main
    /// actor. Le poser ici évite qu'un brouillon traverse une frontière
    /// d'isolation pour rien — et fait dire à la signature où elle s'exécute.
    let onPublishDocument: @MainActor (ComposerDocumentDraft) async -> Bool

    /// **La graine du MOOD** — ce que la porte a déjà en main quand elle ouvre.
    ///
    /// `nil` ⇒ composition fraîche. Non-`nil` ⇒ une republication (lot 4.7) ou
    /// une reprise hors-ligne, et la surface s'ouvre remplie.
    ///
    /// **Elle n'est pas adoptée à la CONSTRUCTION, et c'est mesuré, pas
    /// stylistique.** La reprise hors-ligne interroge la file durable : sa
    /// graine arrive une ou plusieurs boucles APRÈS la première image, quand
    /// l'auteur a déjà pu poser un emoji. L'adoption passe donc par
    /// `ComposerMoodSeeding.adopt`, une règle pure qui ne remplit que ce qui est
    /// encore vide — la même que `StatusComposerView` tenait en quatre `if`
    /// dispersés dans son `.onAppear`, où aucun test ne pouvait la lire.
    ///
    /// **Sans valeur par défaut**, pour la raison qui a déjà coûté deux fois
    /// dans ce fichier : un défaut ferait disparaître la graine d'un site de
    /// republication sans casser la moindre compilation, et la republication
    /// deviendrait un mood neuf — sans bandeau, sans `repostOfId`, sans un mot.
    let moodSeed: ComposerMoodSeed?

    /// **La graine de la SCÈNE** — le média qu'une porte a déjà posé sur le
    /// canvas (`ConversationMediaComposerDoor`, lot 5).
    ///
    /// Elle est la JUMELLE de `moodSeed` et n'en partage pourtant ni le moment
    /// ni le mécanisme, et il faut le dire pour que la prochaine session ne les
    /// fonde pas : le mood s'adopte APRÈS coup, parce que sa graine arrive de la
    /// file durable une boucle plus tard ; le média, lui, se pose à la
    /// CONSTRUCTION, parce que le fond de slide est recopié dans un `@State` de
    /// l'atelier par un INSTANTANÉ (`restoreCanvas`) qui ne relit jamais ce qui
    /// arrive après lui. C'est aussi pourquoi elle n'est pas un `@State` : elle
    /// n'existe que le temps de construire le ViewModel.
    ///
    /// **Sans valeur par défaut**, pour la raison qui a déjà coûté trois fois
    /// dans ce dossier (`onPublishDocument`, `moodSeed`, puis le `repostOfId` de
    /// `ComposerDocumentDraft.document`) : un défaut la ferait disparaître d'un
    /// site de montage sans casser la moindre compilation, et la porte du média
    /// reçu ouvrirait un composer VIDE — un produit parfaitement plausible.
    let mediaSeed: StoryComposerSeed?

    let onPreview: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void
    let onDismiss: () -> Void

    /// L'atelier et le meuble lisent le MÊME état de composition. Le host le
    /// possède pour que le gate du réel (`ComposerReelGate`) lise la composition
    /// RÉELLE sans redemander quoi que ce soit à l'atelier — c'est ce qui fait
    /// varier l'offre de formats avec ce qui est composé.
    @StateObject private var viewModel: StoryComposerViewModel

    /// O6 — la teinte du plateau est un réglage PERSISTÉ, propre à l'auteur.
    /// Stockée par son `rawValue` : `@AppStorage` ne sait pas porter l'enum, et
    /// c'est aussi ce qui rend le repli sur valeur inconnue explicite.
    @AppStorage("composer.plateau.tint") private var storedTint: String = PlateauTint.defaultTint.rawValue

    /// Le format COURANT — un champ, pas une identité (loi 9). Il s'ouvre sur
    /// `initialFormat` de la porte et l'éventail (`ComposerFormatFan`) l'écrit.
    ///
    /// Sa garde négative nommait DEUX conditions de levée, et les deux sont
    /// tombées : V1 a fait varier l'offre avec la composition, V2 a fait
    /// changer la SURFACE montée avec le format, V3-3 a fait suivre l'ENVOI.
    /// L'ordre importait — monter l'éventail avant que l'envoi ne suive aurait
    /// offert un choix que la publication ignore, le pire des deux mondes
    /// puisqu'il aurait eu l'air de marcher.
    ///
    /// Ce champ est ce que l'auteur a TAPÉ ; ce qui gouverne est
    /// `selectedFormat`, qui le ramène dans l'offre quand celle-ci se referme.
    @State private var currentFormat: ComposerFormat

    /// Le texte des surfaces SANS canvas — le document ET le mood. Il vit dans
    /// le meuble et non dans la surface : c'est le meuble qui le remettra au
    /// publieur, et une surface qui posséderait son texte le perdrait à chaque
    /// bascule de format.
    ///
    /// **UN seul champ pour les deux, et c'est la raison qui compte** : la loi
    /// 9 autorise à changer de format, jamais à jeter ce qui est composé.
    /// Basculer Mood → Post dans l'éventail d'un repost (lot 4.7) doit garder
    /// la phrase déjà tapée ; deux `@State` jumeaux l'auraient perdue au
    /// premier tap, sans qu'aucun test ne le dise.
    /// #4057 — le socle lit la taille de texte pour décider s'il MONTRE ses
    /// libellés. Lue ici, sur le meuble, parce que c'est lui qui peint le socle.
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @State private var documentText = ""

    /// L'emoji du mood — la seule matière SANS laquelle un mood ne part pas
    /// (`ComposerMoodPolicy.canPublish`). Il vit ici pour la même raison que
    /// `documentText` : le publieur est le socle, pas la surface.
    @State private var moodEmoji: String?

    /// L'audience du meuble et sa liste nominative — **UNE seule pour ses deux
    /// surfaces sans atelier**, exactement pour la raison écrite au-dessus de
    /// `documentText` : la loi 9 autorise à changer de format, jamais à jeter ce
    /// qui est composé. Deux champs jumeaux auraient perdu le réglage au premier
    /// tap de l'éventail, sans qu'aucun test ne le dise.
    ///
    /// Elle est SEMÉE à la construction, depuis la mémoire du format d'ouverture
    /// (`init`), et jamais réappliquée ensuite : relire la mémoire à chaque
    /// apparition d'un contrôle écraserait, au premier changement de format,
    /// l'audience que l'auteur vient de choisir sur l'autre surface.
    @State private var composerVisibility: PostVisibility
    @State private var composerVisibilityUserIds: [String] = []

    /// La mémoire d'audience du format POST (loi 10) — celle qu'écrit le
    /// sélecteur du socle, seul contrôle d'audience de la surface document. La
    /// mémoire du format status, elle, vit dans `ComposerMoodSurface`, avec le
    /// ruban qui l'écrit. Les deux ne se croisent jamais : un `ONLY` posé sur un
    /// mood ne doit pas rétrécir le post écrit ensuite.
    @AppStorage(ComposerAudienceMemory.postKey)
    private var lastDocumentVisibility: String = PostVisibility.public.rawValue

    /// Le mode dont le sélecteur nominatif est ouvert. `nil` = fermé — la même
    /// forme que les cinq autres écrans qui montent `AudienceUserPickerView`.
    @State private var audiencePickerMode: PostVisibility?

    /// Les personnes que ce mood nomme sans que son texte le dise. Le meuble
    /// les porte ; la RÈGLE de ce qu'on en déclare au serveur est
    /// `ComposerMoodPolicy.declared` (`nil` et jamais `[]`, loi 3).
    /// Les personnes NOMMÉES par la composition en cours, partagées par les
    /// deux surfaces : le chip « Mentionner » du mood et l'outil `@` de la
    /// rangée du document ouvrent la MÊME feuille et écrivent ici.
    ///
    /// Un seul état parce que le meuble ne monte qu'une surface à la fois et
    /// remet le tout à zéro entre deux : deux états auraient été deux
    /// vérités à faire diverger, pour une capacité identique.
    @State private var composerReferences: [ComposerReference] = []

    /// La feuille qui NOMME — ouverte par l'outil `@` de la rangée du
    /// document. Même patron que `showsEmojiPicker` : la présentation vit
    /// dans le meuble, jamais dans la surface, qui reste sans état.
    @State private var showsReferencePicker = false

    /// L'envoi EN VOL du socle. Il ferme le gate le temps de l'aller-retour :
    /// sans lui, un double tap sur la flèche produirait deux publications, ce
    /// que l'écran historique du mood évitait par le même drapeau.
    @State private var isPublishingDocument = false

    /// Le sélecteur d'emoji de la rangée d'outils est-il ouvert ? Il vit dans le
    /// MEUBLE et non dans la surface, pour la même raison que `documentText` :
    /// c'est le meuble qui possède le texte où l'emoji atterrit, et une surface
    /// qui porterait le sélecteur devrait posséder sa destination — donc cesser
    /// d'être la simple présentation qu'elle est.
    @State private var showsEmojiPicker = false

    /// **La langue DÉCLARÉE du document (T2.2).** Semée sur
    /// `DefaultComposerLanguage.resolve()` — le point de DÉPART du brouillon
    /// que T2.1 posait déjà, et qui RESTE la constante « fr » — mais désormais
    /// ÉCRITE par l'auteur via `documentLanguageCapsule` plutôt que rappelée
    /// telle quelle à l'envoi. C'est le canal qui manquait à la porte : sans
    /// lui, un « Hello everyone » composé ici partait étiqueté français, et le
    /// Prisme le traduisait FR→EN sur un texte déjà anglais, sans que l'auteur
    /// ait aucun moyen de corriger.
    @State private var documentLanguage = DefaultComposerLanguage.resolve()

    /// Le sélecteur de langue de la rangée est-il ouvert ? Même forme que
    /// `showsEmojiPicker` juste au-dessus, pour la même raison : le sélecteur
    /// vit dans le meuble, qui possède `documentLanguage`, jamais dans la
    /// surface.
    @State private var showsDocumentLanguagePicker = false

    /// **L'ingestion de fichiers LOCAUX (T2.3).** Trois sélecteurs, un état
    /// par famille — même patron que `showsEmojiPicker` /
    /// `showsDocumentLanguagePicker` juste au-dessus : l'ingestion vit dans le
    /// MEUBLE, jamais dans la surface. `ComposerDocumentSurface` reste sans
    /// état — elle ne monte NI `photosPicker` NI `fileImporter` NI
    /// `CameraView` (`ComposerDocumentSurfaceTests`
    /// `.test_laSurface_neFabriquePasUnSecondPipelineDIngestion`, élargie à la
    /// caméra par ce lot).
    @State private var showsPhotoPicker = false
    @State private var pickedPhotoLibraryItems: [PhotosPickerItem] = []
    @State private var showsCamera = false
    @State private var showsFileImporter = false

    /// **Le sélecteur de lieu (T2.5).** Même patron que les trois au-dessus :
    /// vit dans le meuble, jamais dans `ComposerDocumentSurface`.
    @State private var showsLocationPicker = false

    /// Les pièces jointes LOCALES composées jusqu'ici. `documentDraft` les
    /// transmet désormais sous `.document` — `ComposerDocumentDraft.localMedia`
    /// ne repartait qu'à `[]` avant ce lot.
    @State private var documentLocalMedia: [ComposerDocumentMedia] = []

    /// **Quelle slide porte quel média (modèle § 3, #4038).** En profil Post,
    /// **une slide EST un média du post** : chaque média visuel ingéré a donc SA
    /// slide, dont il devient le fond (§ 4).
    ///
    /// **Ce n'est pas une seconde vérité.** `documentLocalMedia` reste la source
    /// UNIQUE — c'est elle que le plan de publication lit. Cette table n'est
    /// qu'un INDEX de la dérivation, clé `sourceURL`, qui permet deux choses
    /// qu'une simple reconstruction ne permettrait pas : ne pas re-poser un
    /// média déjà posé, et retrouver la slide à retirer quand son média
    /// disparaît. Reconstruire les slides à chaque changement aurait jeté au
    /// passage tout ce que l'auteur a composé DESSUS.
    @State private var slideIdByMediaURL: [URL: String] = [:]

    /// **F2 (#3885) — la couleur de FOND choisie sur le document.** `nil` = pas
    /// de fond, la surface reste plate. La couleur est semée dans l'atelier
    /// (`viewModel.applyBackground(hex:)`) pour que la scène l'affiche une fois
    /// montée — mais depuis #3939 (retour porteur 2026-08-27), choisir un fond
    /// ne fait plus NAÎTRE la scène plein écran toute seule (voir
    /// `mountedSurface`) : cette valeur reste posée en attendant l'incrustation
    /// du canvas DANS l'écran document, restant à livrer.
    @State private var documentBackground: String?

    /// **Lot 3A du composer unifié (#4035) — la sélection sur la scène
    /// incrustée.** Alimentée par `onSceneItemTapped`/`onSceneBackgroundTapped`
    /// (Phase 1/2, `EmbeddedSceneCanvas`) : `nil` ⇒ aucun objet sélectionné ⇒
    /// `ComposerDocumentSurface.sceneInspector` reste ABSENT (loi 4, planche P4
    /// §3).
    ///
    /// On retient le KIND, pas l'id : c'est lui qui décide QUELS contrôles
    /// s'appliquent (§ P4 §3, « les contrôles de l'objet courant, eux seuls »),
    /// et l'inspecteur lit le contenu directement sur `viewModel` — source
    /// unique. Garder l'id en plus serait un état MORT, qui masquerait une
    /// lecture morte le jour où un lot suivant croirait s'en servir.
    @State private var selectedSceneItemKind: StoryCanvasUIView.CanvasItemKind?
    /// **L'ID de l'objet sélectionné** — le relais le portait et l'hôte le
    /// JETAIT (`{ _, kind in … }`). Le kind suffisait à l'inspecteur, qui ne
    /// sert qu'un contrôle par famille ; le rail *trailing* offre des actions
    /// qui dépendent de CET objet — verrouillé ? au fond ? seul de son plan ? —
    /// et aucune ne se répond sans son id.
    @State private var selectedSceneItemId: String?

    /// **La bande contextuelle DEMANDÉE sur la surface de scène (#4064).**
    ///
    /// Ce n'est pas ce qui s'affiche : `ComposerSceneBand.opened` tranche, et
    /// refuse une bande qui n'est pas SERVIE. Garder la demande et le service
    /// séparés est ce qui empêche une bande vide d'occuper les ≈ 170 pt que
    /// l'encastrement vient de libérer.
    @State private var requestedSceneBand: ComposerSceneBand?

    /// **B2 (#3925) — la section description est-elle DÉPLIÉE ?** Repliée par
    /// défaut (une barre compacte qui ne mange pas le canvas) ; un tap la
    /// déplie sur un champ lié au CONTENU partagé (`documentText`). Vit dans le
    /// MEUBLE, comme tout état de chrome de la scène.

    /// **T2.5 — la POSITION posée sur le brouillon.** Vit dans le MEUBLE, comme
    /// `documentLocalMedia` juste au-dessus : `ComposerDocumentDraft.location`
    /// (T2.1) ne portait encore le résultat d'aucun geste, faute de picker
    /// câblé. `LocationPickerView` — le même sélecteur que le composer inline
    /// du fil (`FeedView+Attachments.handleFeedLocationSelection`) — l'écrit
    /// ici ; en fabriquer un second aurait donné deux flux de lieu à faire
    /// diverger.
    @State private var documentLocation: SharedPlace?

    /// **T2.5 — le SECOND opt-in**, indépendant du lieu lui-même : « rendre ce
    /// contenu trouvable à proximité ». `.disabled` est l'état INERTE — off,
    /// aucun palier offert — et c'est la valeur de départ obligée : rien n'a
    /// encore été choisi tant qu'aucun lieu n'existe. Un lieu CHOISI la
    /// remplace par `FeedNearbyDiscoverability.choiceForNewPlace()`, qui lit la
    /// mémoire locale (`LocationSharingPreferencesStore`) — jamais l'inverse :
    /// pré-sélectionner avant le premier lieu offrirait un sélecteur de grain
    /// sans lieu à indexer.
    @State private var documentDiscoverability: NearbyDiscoverabilityChoice = .disabled

    /// **T2.6 — le sixième et dernier outil de la rangée.** Même patron que
    /// `showsLocationPicker` juste au-dessus : le sélecteur vit dans le
    /// MEUBLE, jamais dans `ComposerDocumentSurface`, qui reste une
    /// présentation sans état.
    @State private var showsAudioComposer = false

    /// **T2.6 — la transcription du vocal composé par `AudioPostComposerView`.**
    /// Voyage À CÔTÉ de `documentLocalMedia` (l'enregistrement, posé comme un
    /// `ComposerDocumentMedia` ordinaire au retour) — jamais fondue dedans.
    /// `documentDraft` la transmet telle quelle à
    /// `ComposerDocumentDraft.document(mobileTranscription:)`, et
    /// `PublishIntent.document(transcription:)` l'élit en aval pour la LANGUE :
    /// la langue PARLÉE gagne sur `documentLanguage`, jamais l'inverse — la
    /// régression que 7.4b avait fermée sur `PublishIntent.audioRecording`.
    @State private var documentTranscription: MobileTranscriptionPayload?

    init(
        intent: ComposerIntent,
        initialVisibility: String,
        draftId: String? = nil,
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String], String, [ComposerReference], ComposerMediaAccessibility, PostType) -> Bool,
        onPublishDocument: @escaping @MainActor (ComposerDocumentDraft) async -> Bool,
        moodSeed: ComposerMoodSeed?,
        mediaSeed: StoryComposerSeed?,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.intent = intent
        self.initialVisibility = initialVisibility
        self.draftId = draftId
        self.onPublishAllInBackground = onPublishAllInBackground
        self.onPublishDocument = onPublishDocument
        self.moodSeed = moodSeed
        self.mediaSeed = mediaSeed
        self.onPreview = onPreview
        self.onDismiss = onDismiss

        // UN seul ViewModel, semé ou non. En fabriquer un second hors de cette
        // branche laisserait le composer s'autosauvegarder sous un id neuf,
        // pendant que le brouillon repris resterait intact à côté — le doublon
        // exact que l'adoption existe pour éviter.
        //
        // L'ADOPTION vient APRÈS la graine, et l'ordre est load-bearing : un
        // brouillon que l'auteur vient de désigner l'emporte sur ce qu'une porte
        // sème. `openingDraftAction` tient la même précédence côté SDK, et les
        // deux doivent rester d'accord.
        let composer: StoryComposerViewModel
        if let mediaSeed {
            composer = StoryComposerViewModel(seeding: mediaSeed)
        } else {
            composer = StoryComposerViewModel()
        }
        if let draftId { composer.adoptDraft(id: draftId) }
        _viewModel = StateObject(wrappedValue: composer)

        let ouverture = ComposerProfile.profile(
            for: intent.origin,
            compositionQualifiesAsReel: ComposerReelGate.compositionQualifiesAsReel(composer.currentEffects)
        ).initialFormat
        _currentFormat = State(initialValue: ouverture)

        // La mémoire d'audience s'applique ICI, et une seule fois — loi 10 sur
        // le format que la porte OUVRE. La poser dans un `.onAppear` aurait
        // rendu le moment de son application dépendant de la surface montée :
        // au premier changement de format, elle aurait écrasé l'audience que
        // l'auteur venait de choisir sur l'autre surface (loi 9).
        //
        // `UserDefaults.standard` est bien le magasin de `@AppStorage` : la
        // graine et l'écriture du socle lisent donc le même endroit, sous la
        // même clé, dont `ComposerAudienceMemory` est l'unique orthographe.
        _composerVisibility = State(initialValue: ComposerAudienceMemory.remembered(
            ComposerAudienceMemory.key(for: ouverture)
                .flatMap { UserDefaults.standard.string(forKey: $0) }
        ))
    }

    private var tint: PlateauTint {
        PlateauTint(rawValue: storedTint) ?? .defaultTint
    }

    /// L'éventail RESPIRE : il est recalculé à chaque passe de rendu sur la
    /// composition du moment. Poser deux images puis en retirer une retire le
    /// réel de l'offre — c'est ce que V1 avait écrit et débranché.
    ///
    /// **B3 (#3926) — il respire sur les DEUX compositions.** Le média peut
    /// vivre dans le document (`documentLocalMedia`, avant la bascule) OU dans
    /// l'atelier (`currentEffects`, après que B1 l'y a porté). L'éventail doit
    /// offrir RÉEL dans les deux états — sur le document, c'est
    /// `documentComposesReel` qui qualifie, exactement le gate que le sélecteur
    /// de destination retiré lisait déjà. Sans le premier terme, le fan
    /// n'offrirait jamais RÉEL tant qu'on n'a pas déjà basculé — l'offre
    /// arriverait trop tard pour servir à basculer.
    private var reelGate: Bool {
        documentComposesReel
            || ComposerReelGate.compositionQualifiesAsReel(viewModel.currentEffects)
    }

    /// **Ce qu'un tap sur le FOND de la scène incrustée sélectionne (#4035).**
    ///
    /// Un TOGGLE, et c'est ce qui le rend utilisable : rien de sélectionné et
    /// un fond média ⇒ on le sélectionne ; sinon ⇒ on efface. L'auteur entre et
    /// sort de l'inspecteur par le même geste, sur la même cible — sans quoi
    /// une sélection posée par un tap sur le fond n'aurait aucune sortie, la
    /// zone contextuelle restant montée pour toujours.
    private func handleSceneBackgroundTap() {
        selectedSceneItemKind = ComposerSceneBackgroundTapPolicy.selection(
            currentSelection: selectedSceneItemKind,
            backgroundIsMedia: viewModel.currentSlide.effects.hasVisualBackgroundMedia
        )
    }

    /// **#4030 — le gate du mood, nourri de la MÊME composition que celui du
    /// réel.** Le mood est une carte SANS scène et SANS média : il ne regarde
    /// donc pas `currentEffects` objet par objet comme le fait le réel, mais
    /// les deux faits que le meuble tient déjà — ce que l'auteur a ingéré
    /// (`documentLocalMedia`) et si une scène existe (`documentHasScene`, qui
    /// couvre autant le fond de couleur que les médias montés en slides).
    ///
    /// `moodEmoji` entre dans le prédicat pour la raison écrite sur
    /// `ComposerMoodGate` : sans lui, effacer sa phrase pour la réécrire
    /// retirerait le format sous les doigts de l'auteur.
    private var moodGate: Bool {
        ComposerMoodGate.compositionQualifiesAsMood(
            text: documentText,
            hasMedia: !documentLocalMedia.isEmpty,
            hasScene: documentHasScene,
            moodEmoji: moodEmoji
        )
    }

    private var profile: ComposerProfile {
        ComposerProfile.profile(
            for: intent.origin,
            compositionQualifiesAsReel: reelGate,
            compositionQualifiesAsMood: moodGate
        )
    }

    /// Le format qui GOUVERNE — surface montée et type publié.
    ///
    /// Il n'est pas `currentFormat` : l'offre respire (le réel n'est offert que
    /// tant que la composition qualifie), et retirer une image sous une
    /// sélection `.reel` laisserait le meuble sur un format que la porte
    /// n'offre plus. `resolvedSelection` le ramène au premier format offert,
    /// qui est toujours celui de la porte (invariant de C1). C'est la règle
    /// écrite avec l'éventail, et jusqu'ici jamais exercée hors de son test.
    private var selectedFormat: ComposerFormat {
        ComposerFormatFanPolicy.resolvedSelection(
            current: currentFormat,
            offeredFormats: profile.offeredFormats
        )
    }

    /// Ce que l'éventail écrit. La LECTURE passe par la règle de repli, sinon
    /// un éventail dont l'offre vient de se refermer ne marquerait plus aucun
    /// chip ; l'ÉCRITURE va droit au champ, parce qu'un tap ne vise jamais
    /// qu'un format offert.
    private var formatSelection: Binding<ComposerFormat> {
        Binding(get: { self.selectedFormat }, set: { self.currentFormat = $0 })
    }

    /// La surface MONTÉE — l'unique lecture de la règle de routage dans ce
    /// fichier. Le corps la consomme pour choisir sa vue, le chrome pour savoir
    /// qui peint la publication, le gate pour savoir ce qui fait matière. Trois
    /// lectures de la même expression auraient été trois occasions de diverger.
    private var mountedSurface: ComposerSurfaceKind {
        // B3 (#3926) — STORY et RÉEL montent la scène par le ROUTAGE
        // (`ComposerSurfaceRouting` envoie `.story`/`.reel` sur `.scene`), une
        // destination du socle que l'éventail écrit (`selectedFormat`) — c'est
        // ce qui fait de l'éventail le seul sélecteur.
        //
        // **Choisir une couleur de fond ne bascule PLUS ici (#3939, retour
        // porteur 2026-08-27).** L'ancienne règle F2 (`ComposerSceneActivation`,
        // supprimée) faisait naître la scène 9:16 PLEIN ÉCRAN dès qu'un fond
        // était choisi — remplacement de route surprenant, pas demandé :
        // l'auteur reste sur l'écran document qu'il a ouvert. `documentBackground`
        // continue d'être posé (utile à l'atelier une fois qu'il s'incrustera),
        // mais ne route plus vers `.scene` seul. Voir #3939 pour l'incrustation
        // du canvas DANS l'écran document, restant à livrer.
        return ComposerSurfaceRouting.surface(opening: profile.opensWith, format: selectedFormat)
    }

    /// QUI peint la publication — audience, aperçu, flèche. UNE source, lue deux
    /// fois : passée à l'atelier pour qu'il assemble ou non sa rangée haute, et
    /// lue ici pour que le socle peigne ou non les mêmes zones.
    ///
    /// **Ce fut une CONSTANTE `.atelier`, et le lot 4 l'a rendue calculée** —
    /// pas par confort : les deux blocages qui l'imposaient sont des blocages de
    /// la SCÈNE, et une constante qui les faisait valoir pour les trois surfaces
    /// était une constante mal placée.
    ///
    /// (1) **L'audience de l'atelier n'est pas atteignable d'ici.**
    /// `StoryComposerView.visibility` est un `@State` PRIVÉ, semé à la
    /// construction par `initialVisibility`, dont `visibilityMenu` est l'unique
    /// écrivain. Le socle a beau savoir choisir une audience depuis le lot 4.9,
    /// il écrit `composerVisibility`, que l'atelier ne lit jamais : céder le
    /// chrome sous la scène retirerait `visibilityMenu` et laisserait l'auteur
    /// devant un sélecteur qui ne gouverne rien. **Condition de levée, côté
    /// SDK** : que l'atelier accepte une audience en `@Binding` plutôt qu'en
    /// graine.
    ///
    /// (2) **L'aperçu de l'atelier porte des médias que le meuble ne voit pas.**
    /// `preloadedImages/VideoURLs/AudioURLs` sont `internal` à `MeeshyUI` ; un
    /// œil peint ici rendrait une scène amputée des médias LOCAUX, ce
    /// qu'interdit la loi 6. Le socle n'en peint plus aucun depuis le lot 4.9 —
    /// pour une raison voisine mais DISTINCTE, qu'il ne faut pas confondre :
    /// sous ses deux surfaces il n'y a pas de canvas du tout, pas même amputé.
    ///
    /// Sous le document et sous le mood, **il n'y a pas d'atelier** : aucune de
    /// ces deux raisons n'a d'objet. La règle qui tranche est
    /// `ComposerChromeOwnership`, éprouvable sans monter une vue ; ce qui suit
    /// n'en est que la lecture.
    ///
    /// **Ce que la bascule NE lève PAS, et qu'il ne faut pas lire comme acquis** :
    /// la scène reste sur `.atelier`, et ses deux conditions de levée sont
    /// intactes — une audience de l'atelier PILOTABLE depuis le meuble, et un
    /// aperçu qui porte les médias préchargés. Elles se remplissent côté SDK,
    /// jamais depuis ce fichier.
    private var chromeOwner: ComposerChromeOwner {
        ComposerChromeOwnership.owner(for: mountedSurface)
    }

    /// Les zones que le socle peint sous la surface montée. Une RÈGLE, jamais un
    /// `if` écrit dans le corps : une condition posée dans un `body` est
    /// invisible aux tests, et c'est ainsi qu'une règle produit se met à exister
    /// en deux exemplaires.
    private var paintedSocleZones: [ComposerTopBarControl] {
        ComposerChromeOwnership.socleZones(
            for: mountedSurface,
            // L'œil n'a d'objet que s'il y a une scène à montrer — c'est la
            // condition que le doc-comment de `socleZones` avait écrite en
            // 2026-08-24 comme prix de son retour, et elle se vérifie ICI,
            // jamais dans le corps du socle.
            documentHasScene: documentHasScene
        )
    }

    /// **OÙ le plateau — donc l'éventail — a le droit de se peindre.**
    ///
    /// Une RÈGLE nommée, jamais une expression écrite dans le `body` : une
    /// condition posée là est invisible aux tests, et c'est ainsi qu'une règle
    /// produit se met à exister en deux exemplaires.
    ///
    /// **La loi 5 impose de surcroît que rien dans le `body` ne conditionne
    /// l'affichage sur la PORTE, et il faut lire ce que cela interdit
    /// exactement.** Ce n'est pas « ne rien lire qui vienne de la porte » : le
    /// PROFIL vient d'elle, et `mountedSurface` comme `offeredAudiences` le
    /// remontent aussi. Ce qui est interdit est de tester son IDENTITÉ — un
    /// `if profile` / `if origin` écrit ici, ce que
    /// `test_theSocleYieldsToTheAtelier_andNeverToTheDoor` refuse en toutes
    /// lettres. Cette propriété ne lit que des CAPACITÉS — la surface montée,
    /// l'ouverture, l'offre —, si bien que deux portes aux mêmes capacités y
    /// obtiennent la même réponse. C'est cela, la loi 5.
    ///
    /// Jusqu'au lot 4.7, le plateau était monté par `composerSurface` : la SCÈNE
    /// seule le portait, et le chip « Post » d'une republication de mood
    /// n'existait sur aucun écran. Le descendre en bloc aurait livré le défaut
    /// symétrique sous `.feedComposer`. `ComposerFormatFanPlacement` est ce qui
    /// sépare les deux cas — et c'est une règle, non un accident de montage.
    ///
    /// **Elle lit les DEUX règles de l'éventail, et leur CONJONCTION n'est pas
    /// écrite ici.** Le plateau ne porte plus qu'une chose ; sans le test de
    /// VISIBILITÉ, une création de mood (`.moodChip`, qui n'offre qu'un format)
    /// monterait une rangée VIDE — un `HStack` réduit à ses 16 points de
    /// remplissage vertical, en haut d'un écran livré. Loi 4 : ce qui n'a rien à
    /// montrer est absent, pas transparent. La scène, elle, n'en change pas :
    /// sa seule porte de production (`.storyTray`) offre toujours au moins deux
    /// formats.
    ///
    /// Le `&&` a d'abord été écrit ICI, et c'était la même faute d'un cran plus
    /// haut : la composition EST la règle, et posée dans une propriété privée
    /// elle n'était exercée par aucune assertion. Mutation mesurée — remplacer
    /// ce `&&` par un `||` laissait passer les quatre gardes de source qui
    /// l'entouraient. `ComposerFormatFanPlacement.mounts` la porte désormais, et
    /// cette propriété n'est plus que sa LECTURE.
    private var mountsFormatFan: Bool {
        ComposerFormatFanPlacement.mounts(
            surface: mountedSurface,
            opening: profile.opensWith,
            offeredFormats: profile.offeredFormats
        )
    }

    /// **La RANGÉE du plateau le peint-elle ?** — `mountsFormatFan` dit QUE
    /// l'éventail est servi, `place` dit OÙ, et cette propriété joint les deux.
    ///
    /// La jonction est ici, dans une propriété NOMMÉE, jamais dans le `body` :
    /// une condition écrite dans un `body` est invisible aux tests, et c'est
    /// exactement la faute que la note ci-dessus raconte avoir déjà commise un
    /// cran plus haut. Sa jumelle vit au site d'appel de la surface document
    /// (`place == .documentHeader`), et l'exhaustivité du `switch` de `place`
    /// interdit qu'elles soient vraies ensemble.
    private var paintsFormatFan: Bool {
        mountsFormatFan
            && ComposerFormatFanPlacement.place(for: mountedSurface) == .plateauRow
    }

    /// **Les audiences que le meuble a le droit de proposer**, lues UNE fois et
    /// remises telles quelles à ses deux formes de sélecteur — le menu du socle
    /// et le ruban du mood.
    ///
    /// Les deux formes existent à dessein (une rangée n'accueille pas six chips)
    /// et ne sont jamais peintes ensemble. Mais deux OFFRES pour un même réglage
    /// seraient un plafond posé d'un côté seulement, et c'est très exactement le
    /// défaut que ce lot referme : le raisonnement sur le plafond d'une
    /// republication était écrit dans `ComposerIntent` pendant que le ruban
    /// déjà peint, sur le seul chemin vivant en production, offrait les six.
    ///
    /// C'est la PORTE qui répond, jamais la surface : elle seule sait si l'on
    /// republie (`ComposerOrigin.repostedPostId`).
    private var offeredAudiences: [PostVisibility] {
        ComposerAudienceOffer.offered(for: intent.origin)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Le plateau coiffe les TROIS surfaces depuis le lot 4.7, sous la
            // règle de placement. Il vivait dans `composerSurface`, ce qui le
            // réservait de fait à la scène : le chip « Post » d'une
            // republication de mood n'existait alors sur aucun écran. La
            // disposition de la scène est inchangée — un `VStack` qui empile le
            // plateau puis l'atelier —, et ce montage-ci est le SEUL.
            // **La surface DOCUMENT porte le chip dans SA barre haute (#4047).**
            // Il flottait ici, seul sur une rangée au-dessus de tout, pendant
            // que la barre de la surface ne portait qu'un `✕`. Le header voulu
            // est d'un seul tenant — `✕ · type · slides` — et une rangée
            // au-dessus d'une barre est deux barres.
            //
            // **La condition n'est PAS écrite ici.** `ComposerFormatFanPlacement`
            // porte les deux places (`paints` / `paintsInDocumentHeader`), et
            // elles sont EXCLUSIVES par construction. Un `&& mountedSurface !=
            // .document` ajouté sur cette ligne aurait été une seconde écriture
            // de la règle, invisible aux tests — exactement ce que la garde de
            // ce `body` interdit, et elle a rougi pour le dire.
            if paintsFormatFan { plateauTools }
            surfaceWithIntakePortals
            // B2 (#3925) — la description repliable vit SOUS le canvas, en mode
            // scène uniquement : c'est la surface d'édition, côté scène, du
            // CONTENU partagé que B1 préserve entre les modes. Le reader
            // l'affiche par-dessus le canvas composé (légende `content`).
            if mountedSurface == .scene { sceneDescriptionSection }
            // `assembles(.publish)` dit que l'ATELIER peint la flèche. Le socle
            // peint donc les MÊMES trois zones seulement quand l'atelier les a
            // cédées : deux barres de publication, dont une inerte, seraient
            // une régression sèche sur la surface de création la plus utilisée.
            if !chromeOwner.assembles(.publish) {
                socle
            }
        }
        .background(tint.color.ignoresSafeArea())
        // `initial: true` couvre la graine SYNCHRONE (la republication, connue
        // dès la construction) ; le changement couvre la graine ASYNCHRONE (la
        // reprise hors-ligne, qui arrive quand la file a répondu). Un seul
        // chemin pour les deux — deux adoptions se seraient corrigées à moitié.
        .adaptiveOnChange(of: moodSeed, initial: true) { _, graine in
            adoptMoodSeed(graine)
        }
        // B3 (#3926) — le report du contenu vers la scène, en UN seul site :
        // dès que `mountedSurface` DEVIENT `.scene` (par l'éventail STORY/RÉEL
        // ou par une couleur de fond), le texte et le média composés suivent.
        // `mountedSurface` est calculée à chaque passe ; `initial: true` couvre
        // les portes qui OUVRENT déjà sur la scène (storyTray, reprise, graine).
        .adaptiveOnChange(of: mountedSurface, initial: true) { _, surface in
            guard surface == .scene else { return }
            carryContentIntoSceneIfNeeded()
        }
        // #4038 — en Post, chaque média ingéré devient SA slide. Site UNIQUE :
        // les trois portes d'ingestion (photothèque, caméra, importateur)
        // écrivent toutes dans `documentLocalMedia`, donc brancher la dérivation
        // sur la LISTE plutôt que sur chaque porte évite d'en oublier une —
        // c'est un inventaire qu'on ne peut pas laisser diverger.
        // `initial: true` couvre les portes qui ouvrent AVEC un média (reprise
        // de brouillon, média reçu d'une conversation).
        .adaptiveOnChange(of: documentLocalMedia, initial: true) { _, _ in
            syncPostMediaIntoSlides()
        }
        // Basculer vers Post après avoir composé ailleurs doit rattraper la
        // dérivation : sans ça, un média ingéré en Story puis ramené en Post
        // n'aurait jamais sa slide (loi 9 — le contenu est PRÉSERVÉ).
        .adaptiveOnChange(of: selectedFormat) { _, _ in
            syncPostMediaIntoSlides()
        }
    }

    /// La graine entre par la RÈGLE, jamais par quatre affectations écrites
    /// ici : `ComposerMoodSeeding.adopt` est éprouvable sans monter une vue, et
    /// c'est elle qui tient l'invariant « une graine ne remplace jamais ce que
    /// l'auteur a posé ».
    /// Le `guard` n'est pas une redite de la règle : `adopt(nil, …)` rend la
    /// composition intacte, mais la RÉÉCRIRE déclencherait une passe de rendu
    /// pour rien à chaque apparition d'un composer de création — celui qui ne
    /// sème jamais rien.
    ///
    /// L'état COURANT est relu au moment de l'adoption, jamais capturé plus tôt.
    /// C'est ce qui rend l'ordre indifférent avec le sélecteur d'audience de la
    /// surface : qu'il ait déjà appliqué la mémoire du format (loi 10) ou non,
    /// une graine muette sur l'audience rend ce qu'elle trouve.
    private func adoptMoodSeed(_ graine: ComposerMoodSeed?) {
        guard let graine else { return }
        let adoptee = ComposerMoodSeeding.adopt(
            graine,
            into: ComposerMoodComposition(
                emoji: moodEmoji,
                text: documentText,
                visibility: composerVisibility,
                visibilityUserIds: composerVisibilityUserIds
            )
        )
        moodEmoji = adoptee.emoji
        documentText = adoptee.text
        composerVisibility = adoptee.visibility
        composerVisibilityUserIds = adoptee.visibilityUserIds
    }

    // MARK: - Les trois surfaces (V2, élargies au mood par le lot 4)

    /// Le meuble a TROIS surfaces, et c'est `ComposerSurfaceRouting` qui tranche
    /// — jamais une condition écrite ici. La règle vit à côté de la surface
    /// document parce qu'elle est éprouvable sans monter la moindre vue ; la
    /// recopier dans le `body` l'aurait rendue muette aux tests.
    ///
    /// Le socle, lui, ne dépend d'aucune des trois : il reste sous toutes
    /// (loi 5 — le socle ne bouge jamais).
    /// **Quatre vues, une par contexte** (#4070). La règle est PURE
    /// (`ComposerMountedView`) et séparée du routage : celui-ci dit quelle
    /// SURFACE le format appelle, celle-là quelle VUE cette surface monte une
    /// fois qu'on sait s'il y a une scène.
    ///
    /// Le `switch` est exhaustif : une cinquième vue casse la compilation ici,
    /// avant de pouvoir diverger en silence.
    /// **Les PORTAILS d'ingestion appartiennent au MEUBLE, jamais à une
    /// surface** (#4120).
    ///
    /// Ils vécurent attachés à l'expression `documentSurface` — et le
    /// doc-comment du bloc affirmait déjà la bonne règle sans que le code la
    /// tienne : « trois sélecteurs montés ICI, **sur le meuble**, jamais dans
    /// `ComposerDocumentSurface` ». « Ici » désignait la surface, pas le meuble,
    /// et la différence n'a coûté RIEN tant qu'il n'y eut qu'une vue à monter.
    ///
    /// #4070 en a monté quatre. Les quatre portes du rail *leading* posaient
    /// alors `showsPhotoPicker = true` / `showsLocationPicker` /
    /// `showsAudioComposer` / `showsReferencePicker` **sans qu'aucune vue à
    /// l'écran ne les lise** : chaque maillon correct, et la chaîne ne
    /// transportait personne.
    ///
    /// La règle est donc géographique, et c'est ce qui la rend gardable : un
    /// portail se monte **au-dessus de l'aiguillage**, là où les quatre vues
    /// passent. `ComposerIntakePortalsTests` en tient l'INVENTAIRE — tout
    /// `@State private var shows…` du meuble doit avoir son lecteur ici, sans
    /// quoi le contrôle qui l'écrit est inerte sur trois surfaces sur quatre.
    ///
    /// Le contrôle de découvrabilité y est aussi, et pour la même raison : un
    /// lieu posé depuis la scène doit pouvoir se retirer.
    private var surfaceWithIntakePortals: some View {
        surface
        // document : c'est l'ÉVENTAIL (le plateau, en tête), seul sélecteur de
        // mode. Le média qui qualifie fait respirer son offre (`reelGate` lit
        // `documentComposesReel`), et choisir RÉEL/STORY route vers la scène.
        // **Le SECOND opt-in (T2.5)**, en `safeAreaInset` et non en overlay :
        // `NearbyDiscoverabilityControl` porte un titre, un sélecteur de grain
        // et des notices — bien plus large qu'une capsule, il ne doit
        // recouvrir ni le texte ni la rangée d'outils. Gaté sur
        // `documentOffersNearbyDiscoverability`, jamais sur `documentLocation
        // != nil` seul : l'audience compte autant que le lieu.
        .safeAreaInset(edge: .bottom) {
            // **#4034 — le composant se monte sur le LIEU, plus sur l'opt-in.**
            // Il était gaté par `documentOffersNearbyDiscoverability` (lieu ET
            // audience publique) à l'époque où le nom du lieu vivait ailleurs,
            // dans un chip de la rangée d'outils. Ce chip est retiré — l'info
            // vit dans l'entête du composant —, si bien que garder l'ancienne
            // garde aurait fait DISPARAÎTRE de l'écran le lieu d'un post privé,
            // avec le seul moyen de le retirer. La découvrabilité, elle, reste
            // gouvernée par sa règle : c'est `offersDiscoverability` qui la
            // porte À L'INTÉRIEUR du composant.
            if let place = documentLocation {
                NearbyDiscoverabilityControl(
                    choice: $documentDiscoverability,
                    accentColor: MeeshyColors.brandPrimaryHex,
                    placeName: MediaKindLabel.placeTitle(name: place.name, address: place.address),
                    offersDiscoverability: documentOffersNearbyDiscoverability,
                    onRemovePlace: { documentLocation = nil }
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 10)
            }
        }
        .sheet(isPresented: $showsLocationPicker) { documentLocationPickerSheet }
        // **Le sixième outil (T2.6)**, même patron que le lieu juste au-dessus.
        .sheet(isPresented: $showsAudioComposer) { documentAudioComposerSheet }
        .sheet(isPresented: $showsEmojiPicker) { emojiPickerSheet }
        .sheet(isPresented: $showsReferencePicker) { referencePickerSheet }
        .sheet(isPresented: $showsDocumentLanguagePicker) { documentLanguagePickerSheet }
        // **L'ingestion de fichiers LOCAUX (T2.3).** Le commentaire qui vivait
        // ici disait « montés ICI, sur le meuble, jamais dans
        // `ComposerDocumentSurface` » — et « ici » désignait l'expression
        // `documentSurface`. La phrase était juste, le placement ne l'était
        // pas : c'est ce demi-pas qui a rendu les quatre portes du rail
        // inertes (#4120). Ils sont désormais où la phrase les mettait.
        .sheet(isPresented: $showsCamera) { documentCameraSheet }
        .photosPicker(
            isPresented: $showsPhotoPicker,
            selection: $pickedPhotoLibraryItems,
            maxSelectionCount: 10,
            matching: .any(of: [.images, .videos])
        )
        .adaptiveOnChange(of: pickedPhotoLibraryItems) { _, items in
            guard !items.isEmpty else { return }
            let picked = items
            pickedPhotoLibraryItems = []
            Task { await ingestPhotoLibraryItems(picked) }
        }
        .fileImporter(
            isPresented: $showsFileImporter,
            allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            Task { await ingestFileImporterResult(result) }
        }
    }

    @ViewBuilder
    private var surface: some View {
        switch ComposerMountedView.mounted(surface: mountedSurface, hasScene: documentHasScene) {
        case .atelier:
            composerSurface
        case .scene:
            sceneSurface
        case .document:
            documentSurface
        case .mood:
            moodSurface
        }
    }

    // MARK: - La scène

    /// L'atelier du SDK, monté tel quel — la scène vit dedans.
    ///
    /// Périmètre CONSIGNÉ de C2 : la zone contextuelle reste celle de l'atelier
    /// existant. Le host ne lui impose pas ses capacités par une API neuve ; il
    /// gouverne ce que LUI monte autour. Passer des capacités à l'atelier
    /// appartient à l'écriture v3 native, hors de ce lot.
    ///
    /// **Le plateau n'est plus monté ICI depuis le lot 4.7.** Il coiffe les
    /// trois surfaces depuis le `body`, sous `paintsFormatFan` : le tenir dans
    /// ce bloc le réservait de fait à la scène, et le chip « Post » d'une
    /// republication de mood n'existait alors sur aucun écran. La disposition
    /// visuelle de la scène n'a pas changé pour autant — le `body` empile déjà
    /// le plateau au-dessus de la surface.
    ///
    /// Les cinq fournisseurs sont posés SUR l'atelier, au plus près de son
    /// montage : c'est la forme que `AppInitWireupTests` compte, site par site.
    private var composerSurface: some View {
        StoryComposerView(
            viewModel: viewModel,
            initialVisibility: initialVisibility,
            chromeOwner: chromeOwner,
            publishTargetType: selectedFormat.postType,
            onPublishAllInBackground: onPublishAllInBackground,
            onPreview: onPreview,
            onDismiss: onDismiss
        )
        .storyLocationPickerProvided()
        .storyCameraCaptureProvided()
        .storyRecentCameraRollProvided()
        .storyPasteProvided()
        .storyStickerLibraryProvided()
    }

    /// La surface « document sans scène » (V2).
    ///
    /// Elle ne porte PAS le plateau — une garde de source le tient. Ce que le
    /// plateau porte depuis le 2026-08-24 est le seul éventail, et le
    /// paragraphe sur l'ÉVENTAIL plus bas dit ce qu'il en coûte ici.
    ///
    /// `profile.showsSlides` et `profile.showsTimeline` n'ont plus AUCUN
    /// lecteur de production depuis que les trois pictogrammes inertes du
    /// plateau sont partis ; seuls les tests de la table de C1 les lisent
    /// encore. Ce n'est pas un oubli à combler ici : la table décrit ce que la
    /// porte offre, et le meuble n'a aujourd'hui aucun moyen de l'honorer.
    ///
    /// **La rangée d'outils s'y peint depuis le 2026-08-24 — et elle en compte
    /// UN.** Ce n'est pas un demi-travail, c'est la loi 4 appliquée jusqu'au
    /// bout : `ComposerDocumentTool.effect` ne concède un outil que si son
    /// RÉSULTAT a une destination, et cinq des six n'en ont pas. Le pipeline
    /// d'ingestion du dépôt tourne bien (`ComposerDropResolver` /
    /// `ComposerIngestRouter`, six sites de production) mais le trou n'est pas
    /// là : `ComposerDocumentDraft` ne porte ni `mediaIds`, ni fichier, ni
    /// lieu, et le seul publieur que le meuble atteigne n'en accepte aucun.
    /// Peindre une photothèque au-dessus de ce trou rendrait une image que rien
    /// ne transporterait.
    ///
    /// L'emoji, lui, n'ingère rien : il écrit dans `documentText`, que le
    /// brouillon emporte déjà. Sa chaîne est complète, donc il se peint.
    ///
    /// **Elle ne porte pas non plus l'ÉVENTAIL**, qui vit dans le plateau — et
    /// depuis le lot 4.7 le plateau est monté par le `body`, sous une RÈGLE.
    ///
    /// Jusque-là, le plateau était monté par `composerSurface` : la scène seule
    /// le portait, et l'impasse était tenue par un ACCIDENT DE MONTAGE plutôt
    /// que par un raisonnement. Elle l'est désormais par
    /// `ComposerFormatFanPlacement`, qui répond à la seule question qui compte :
    /// *tous les formats offerts atterrissent-ils sur une surface qui partage
    /// l'état du meuble ?*
    ///
    /// Ce qui SÉPARE les deux portes qui atteignent cette surface :
    ///
    /// - **`.repost(sourceFormat: .status)`** offre `[.status, .post]`, deux
    ///   formats qui restent sur des surfaces sans atelier. `documentText`,
    ///   `moodEmoji` et l'audience sont l'état du MEUBLE et suivent la bascule.
    ///   L'éventail s'y peint donc, des DEUX côtés — sans quoi l'ancrage serait
    ///   une porte à sens unique.
    /// - **`.feedComposer`** offre `.story`, que `ComposerSurfaceRouting` envoie
    ///   à la SCÈNE. Un auteur qui taperait son post ici puis choisirait
    ///   « Story » verrait le routage lui monter l'atelier, et `documentText`
    ///   n'aurait aucun chemin pour l'y suivre — la saisie disparaîtrait sans un
    ///   mot, sur la surface de création la plus fréquentée de l'app.
    ///
    /// Mesuré le 2026-08-24 sur les 14 fichiers `StoryComposerViewModel*.swift`,
    /// et le fait n'a pas bougé : ses écrivains publics sont l'adoption de
    /// brouillon (`adoptDraft(id:)`, `detachFromAdoptedDraft()`,
    /// `adoptDeclaredReferences(_:)`), la timeline
    /// (`loadCurrentSlideIntoTimeline()`, `commitTimelineToCurrentSlide()`,
    /// `applyPersistedCommandHistory(_:)`, `shutdownTimelineIfNeeded()`, et
    /// `timelineViewModel` qui rend une référence écrivant à son tour) et deux
    /// inits de reprise (`init(editing:)`, `init(reposting:authorHandle:)`) —
    /// **aucun n'écrit du TEXTE** : `currentEffects` est `public internal(set)`,
    /// et rien dans `+Elements.swift` n'expose publiquement la création d'un
    /// élément de texte. La liste est plus large que le blocage, et c'est le
    /// blocage qui compte : un `grep` de contrôle doit CONFIRMER cette phrase,
    /// jamais la démentir.
    ///
    /// **Condition de levée pour `.feedComposer`, côté SDK** : un écrivain
    /// public de texte atteignable par le meuble. L'éventail y descend alors
    /// AVEC le transfert de la saisie, jamais avant lui — et la règle de
    /// placement le dira d'elle-même, sans qu'on ait à toucher ce fichier.
    ///
    /// La TABLE de C1 désigne le meuble pour `.feedComposer`
    /// (`routesToLegacy: nil`) depuis le lot 3, et depuis T3.1 le PLEIN composer
    /// du fil PASSE ici : `RootViewComponents` monte
    /// `DocumentComposerDoor(intent: ComposerIntent(origin: .feedComposer))`.
    /// Ce qui n'a pas bougé, c'est le reste — les deux CITATIONS montent encore
    /// leur feuille (T3.2, levée 7.5) et le composer inline iPad son propre
    /// booléen (T3.3 le nomme ; sa migration T3.4 est descopée). La porte la
    /// plus utilisée, elle, passe désormais par le meuble.
    ///
    /// **Ne pas confondre les deux blocages, ils n'ont ni la même cause ni la
    /// même levée.** Celui de `.feedComposer` est côté SDK (le transfert de la
    /// saisie). Celui que la republication portait était app-side — le plafond
    /// d'audience de la loi 10 — et il ne RETIENT plus l'éventail : ce que la
    /// loi 10 pouvait fermer sans connaître la source l'a été au lot 4.9
    /// (`ComposerAudienceOffer` retire `ONLY`/`EXCEPT` d'une republication), et
    /// l'ÉLARGISSEMENT qui reste pèse EXACTEMENT autant sur le ruban du mood,
    /// peint sur un écran réel depuis le lot 4.6. L'ancrage hérite d'un trou
    /// déjà nommé et déjà gardé ; il n'en ajoute aucun. Gardes :
    /// `ComposerDocumentSurfaceTests`
    /// `.test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint` et
    /// `.test_lAncrageDUnMood_nAToujoursAucunPlafondDAudience_etLEventailDescendQuandMeme`.
    ///
    /// **Sa SORTIE est celle du meuble.** `onDismiss` n'était atteignable que
    /// sous la scène, où l'atelier du SDK peint la croix ; le document n'a pas
    /// d'atelier, et la surface serait restée un écran sans issue au moment
    /// même où V3 devait la brancher sur la porte la plus utilisée de l'app.
    /// Le host ne fabrique pas une seconde fermeture : il passe la SIENNE, la
    /// même que reçoit l'atelier deux blocs plus haut.
    /// **La surface de SCÈNE** (#4070) — montée quand le document a une scène.
    ///
    /// Elle réemploie les MÊMES expressions que `documentSurface` pour tout ce
    /// qui appartient à la publication (barre haute, rail des slides, éventail,
    /// `⋯`) : deux dérivations d'une même valeur auraient divergé au premier
    /// ajustement. Ce qui diffère est ce qui n'a de sens QUE sur une scène —
    /// les deux rails et la géométrie d'encastrement.
    private var sceneSurface: some View {
        ComposerSceneSurface(
            localMedia: documentLocalMedia,
            selectedMediaURL: selectedSlideMediaURL,
            selectableMediaURLs: Set(slideIdByMediaURL.keys),
            formatFan: mountsFormatFan
                && ComposerFormatFanPlacement.place(for: mountedSurface) == .documentHeader
                ? AnyView(formatChip) : nil,
            overflowMenu: documentOverflowEntries.isEmpty
                ? nil : AnyView(overflowMenu),
            onClose: onDismiss,
            onRemoveMedia: { media in documentLocalMedia.removeAll { $0 == media } },
            onSelectMedia: { media in
                guard let slideId = slideIdByMediaURL[media.url],
                      let index = viewModel.slides.firstIndex(where: { $0.id == slideId })
                else { return }
                viewModel.selectSlide(at: index)
            },
            slide: Binding(
                get: { viewModel.currentSlide },
                set: { viewModel.currentSlide = $0 }
            ),
            aspectRatio: viewModel.currentCanvasRatio,
            plateauTint: tint.color,
            sceneImages: viewModel.loadedImages,
            sceneImagesVersion: viewModel.loadedImagesVersion,
            onItemTapped: { id, kind in
                selectedSceneItemId = id
                selectedSceneItemKind = kind
            },
            onBackgroundTapped: { handleSceneBackgroundTap() },
            // Les portes que CE meuble sert. `sticker` en est absente : aucun
            // chemin ne pose un objet de ce kind — `showsEmojiPicker` insère
            // dans le TEXTE, ce qui n'est pas la même chose. `description` non
            // plus : rien ne donne le focus au champ depuis l'extérieur (#4065).
            railDoors: ComposerRailDoor.offered(
                served: [.media, .sound, .place, .mention],
                format: selectedFormat,
                allowsCapture: profile.allowsCapture
            ),
            onRailDoor: { door in handleRailDoor(door) },
            // Les contrôleurs que CE meuble sert. L'empilement ne vit que sur la
            // `StoryCanvasUIView`, dont le meuble n'a aucune référence.
            trailingActions: ComposerTrailingRailPolicy.actions(
                slide: viewModel.currentSlide,
                selectedId: selectedSceneItemId,
                served: [.duplicate, .delete],
                hasEditor: false,
                canLeaveScene: selectedFormat != .story
            ),
            onTrailingAction: { action in handleTrailingRailAction(action) },
            // **Les bandes SERVIES par ce meuble** (#4064) — `palette` seule.
            // La timeline vit dans l'atelier et les 18 styles exigent un objet
            // `text` sélectionné, qu'aucune porte de cette surface ne pose :
            // les servir peindrait une bande vide.
            band: ComposerSceneBand.opened(requestedSceneBand, served: [.palette]),
            bandColors: StoryBackgroundPalette.colors,
            onPickBandColor: { hex in
                documentBackground = hex
                viewModel.applyBackground(hex: hex)
                // La bande se referme sur le choix : la couleur est visible sur
                // la scène juste au-dessus, donc la garder ouverte occuperait
                // l'espace pour montrer ce que l'écran montre déjà.
                requestedSceneBand = nil
            },
            description: $documentText,
            descriptionPlaceholder: ComposerDocumentCopy.placeholder
        )
    }

    private var documentSurface: some View {
        ComposerDocumentSurface(
            text: $documentText,
            tools: ComposerDocumentToolPolicy.visibleTools(
                served: servedDocumentTools,
                allowsCapture: profile.allowsCapture
            ),
            focusesOnAppear: ComposerSurfaceRouting.focusesContentOnAppear(opening: profile.opensWith),
            onClose: onDismiss,
            onTool: { tool in handleDocumentTool(tool) },
            localMedia: documentLocalMedia,
            onRemoveMedia: { media in documentLocalMedia.removeAll { $0 == media } },
            onPickBackground: { hex in
                // Phase 2 (#3939) — choisir un fond pose la couleur SUR la slide
                // courante et fait apparaître la scène INCRUSTÉE dans l'écran
                // document (via `showsScene` ci-dessous), SANS basculer sur
                // l'atelier plein écran. Le report du contenu reste géré ailleurs.
                documentBackground = hex
                viewModel.applyBackground(hex: hex)
            },
            // Phase 2 (#3939) — la scène 9:16 s'incruste EN HAUT de l'écran
            // document dès qu'un fond est choisi. Elle édite la slide courante
            // de l'atelier (source de vérité unique) ; son ratio suit le fond
            // (portrait par défaut, paysage si image de fond paysage).
            sceneSlide: Binding(
                get: { viewModel.currentSlide },
                set: { viewModel.currentSlide = $0 }
            ),
            showsScene: documentHasScene,
            sceneAspectRatio: viewModel.currentCanvasRatio,
            onSceneItemTapped: { _, kind in selectedSceneItemKind = kind },
            // **#4035 — taper la scène quand son FOND est un média le
            // SÉLECTIONNE.** Sans cette ligne l'inspecteur était INATTEIGNABLE
            // sur l'écran document, et le câblage complet ne le disait pas :
            // en profil Post, une slide ne porte QU'UN média et la règle 4 en
            // fait son FOND (#4038) ; or `hitTestItem` n'itère que
            // `itemsContainer`, où un fond ne vit pas — le tap retombait donc
            // sur `onBackgroundTapped`, qui EFFAÇAIT la sélection. Mesuré au
            // simulateur le 2026-08-28 : écran identique au bit près.
            //
            // La correction est APP-SIDE et non dans le geste du SDK : y
            // rendre le fond « hit-testable » changerait la manipulation de
            // l'atelier plein écran, que ce lot doit laisser intact. Le SDK dit
            // ce qui a été touché, l'app décide ce que cela sélectionne.
            onSceneBackgroundTapped: { handleSceneBackgroundTap() },
            // Taper une vignette amène SA slide sur la scène (#4038). La table
            // `slideIdByMediaURL` est justement l'index qui relie les deux ;
            // sans elle il faudrait deviner par l'ordre, qui ment dès qu'un
            // média est retiré au milieu.
            onSelectMedia: { media in
                guard let slideId = slideIdByMediaURL[media.url],
                      let index = viewModel.slides.firstIndex(where: { $0.id == slideId })
                else { return }
                viewModel.selectSlide(at: index)
            },
            // …et le rail DIT laquelle est à l'écran (#4047). La résolution est
            // ici parce que la carte `média → slide` et la slide courante
            // vivent ici : demander à la surface de la refaire l'obligerait à
            // lire le ViewModel, donc à cesser d'être sans état.
            // #4047 — le chip de TYPE descend dans la barre haute de la
            // surface, entre la fermeture et les slides. `nil` quand la règle
            // de placement ne le sert pas : la surface n'a alors rien à peindre
            // là, et non un trou à combler.
            formatFan: mountsFormatFan
                && ComposerFormatFanPlacement.place(for: mountedSurface) == .documentHeader
                ? AnyView(formatChip) : nil,
            // #4047 — le `⋯` au bout de la barre. Le meuble décide des ENTRÉES
            // par la règle, jamais par un `if` écrit dans un `body` ; aucune
            // entrée ⇒ `nil` ⇒ aucun bouton (loi 4).
            overflowMenu: documentOverflowEntries.isEmpty
                ? nil : AnyView(overflowMenu),
            selectedMediaURL: selectedSlideMediaURL,
            // #4052 — la carte média → slide est ICI, et elle est la seule
            // vérité sur « ce chip mène-t-il quelque part ? ». Un son n'y entre
            // pas : il est la bande-son, pas une page.
            selectableMediaURLs: Set(slideIdByMediaURL.keys),
            // #4032 — l'occultation de la rangée défilante se peint de la teinte
            // que le meuble applique DÉJÀ à tout l'écran, jamais d'une couleur
            // re-choisie. C'est le retour porteur du 2026-08-27, tenu.
            plateauTint: tint.color,
            // Le meuble ne décide QUE de l'ABSENCE/PRÉSENCE de la scène ; QUELS
            // contrôles la zone sert est la décision du SDK, portée par l'`init?`
            // de `EmbeddedSceneInspector` (il échoue pour tout kind qu'aucun
            // contrôle ne sert — loi 4 rendue impossible à enfreindre ici).
            // `documentBackground != nil` s'y ajoute : sans la scène (fond
            // retiré), une sélection restée en mémoire peindrait la zone
            // au-dessus de rien — un contrôle orphelin.
            sceneInspector: !documentHasScene
                ? nil
                : EmbeddedSceneInspector(viewModel: viewModel, kind: selectedSceneItemKind)
                    .map { AnyView($0) },
            sceneImages: viewModel.loadedImages,
            sceneImagesVersion: viewModel.loadedImagesVersion,
            // **La tuile de lieu (T2.5), corrigée #3903** : elle voyageait en
            // `.overlay(alignment: .bottomLeading)` sur TOUTE la surface —
            // exactement le point où `toolRow` peint sa première icône (elle
            // aussi calée au bord de tête). Un overlay et le premier enfant
            // d'un `HStack` occupent le MÊME z-niveau : rien n'empêchait le
            // chevauchement, à aucune taille d'écran ni palier de Dynamic
            // Type. Elle voyage désormais par `toolRowLeadingAccessory`, un
            // slot rendu DANS le `HStack` de `toolRow` — deux enfants d'un
            // `HStack` ne se superposent jamais, par construction.
            // **Le chip de lieu est RETIRÉ de la rangée (#4034)** : le nom du
            // lieu, son réglage et sa croix vivent désormais dans l'entête du
            // composant Position, en bas. Deux moitiés d'une même information à
            // deux endroits de l'écran, c'est ce que ce lot referme.
            //
            // Le SLOT reste, et ce n'est pas de la dette : il est le jumeau
            // symétrique de `toolRowTrailingAccessory` (la capsule de langue,
            // vivante), et c'est LUI qui tient l'invariant anti-chevauchement
            // de #3903 — tout futur chip de tête devra passer par là plutôt que
            // par un `.overlay`.
            toolRowLeadingAccessory: nil,
            // **La capsule de langue, corrigée revue Opus 2026-08-27** : elle
            // voyageait en `.overlay(alignment: .bottomTrailing)` sur TOUTE la
            // surface, sur la promesse que `toolRow` restait « la seule ligne
            // peinte au bas de la surface ». #3904 a rendu cette promesse
            // fausse — la bande de mentions peut désormais s'afficher SOUS
            // `toolRow` — et l'overlay recouvrait alors la moitié de la bande
            // (chevauchement mesuré : bande ≈82pt, capsule posée en bas-droite
            // sur ≈43pt). Même correctif que la tuile de lieu, à l'autre bout
            // du `HStack` : `toolRowTrailingAccessory`, un enfant du flux, ne
            // chevauche jamais ce qui se peint plus bas dans le `VStack`.
            toolRowTrailingAccessory: AnyView(documentLanguageCapsule)
        )
    }

    /// La capture caméra du document (T2.3), montée ICI plutôt que sous la
    /// scène : le document n'a pas d'atelier, donc pas d'environnement
    /// `storyCameraCaptureProvided` à réutiliser — `CameraView` est montée
    /// telle quelle, le même composant que la scène emprunte par
    /// environnement.
    private var documentCameraSheet: some View {
        CameraView { result in
            Task { await ingestCameraCapture(result) }
        }
    }

    /// **Le gate de l'interrupteur (T2.4).** Même prédicat SDK que
    /// `PublishIntent.document` juge en aval (`ReelComposition.defaultType`
    /// via `qualifiesAsReel`) — jamais un seuil recopié ici. Sans lui,
    /// l'interrupteur resterait peint sur une composition qui n'a rien à
    /// offrir (loi 4) : une image seule ou un texte seul ne qualifient pas.
    private var documentComposesReel: Bool {
        ReelComposition.qualifiesAsReel(
            mimeTypes: documentLocalMedia.map(\.mimeType),
            durationsMs: documentLocalMedia.map(\.durationMs)
        )
    }

    /// **B1 (#3924) — le média du document, traduit pour la scène.** Ne porte
    /// que l'IMAGE et la VIDÉO : un son ou un document joint n'a pas de place de
    /// fond sur un canvas. `applyContentMedia` est idempotent (clé = `sourceURL`),
    /// donc câbler cette liste à chaque bascule ne duplique rien. Le média VISUEL
    /// est aussi, par construction, ce qui fait qu'une composition qualifie comme
    /// scène — le texte, lui, suit par `applyContentText`.
    ///
    /// **Le classement image/vidéo passe par `ComposerIngestRouter.route(mime:)`**,
    /// le SEUL classeur MIME du dépôt (six sites de production) — jamais un
    /// `hasPrefix` recopié, qui divergerait de la casse et des repli qu'il gère.
    private var documentContentMedia: [ComposerContentMedia] {
        documentLocalMedia.compactMap { media in
            switch ComposerIngestRouter.route(mime: media.mimeType) {
            // **Le mime DÉCLARÉ voyage avec le média (#4038)** — jamais
            // re-dérivé du nom du fichier. La pose COPIE la source sous
            // `{objectId}.{ext}`, et c'est ce nom que l'aval relit pour
            // étiqueter le téléversement : sans le mime, une URL sans extension
            // partait sous un repli codé en dur (« jpg » / « mov »).
            case .image:
                return ComposerContentMedia(
                    sourceURL: media.url, kind: .image, mimeType: media.mimeType)
            case .video:
                return ComposerContentMedia(
                    sourceURL: media.url, kind: .video,
                    durationMs: media.durationMs, mimeType: media.mimeType)
            // **Le son rejoint la scène au #4052.** Il ne devient PAS une slide
            // (voir `syncPostMediaIntoSlides`) : le modèle § 4 lui donne un
            // TROISIÈME emplacement, la bande-son de la scène — pas une page du
            // carrousel.
            case .audio:
                return ComposerContentMedia(
                    sourceURL: media.url, kind: .audio,
                    durationMs: media.durationMs, mimeType: media.mimeType)
            // Un DOCUMENT reste hors scène, et ce n'est pas un oubli : il n'a de
            // place ni visuelle ni sonore. Il part comme pièce jointe du post.
            case .file:
                return nil
            }
        }
    }

    /// **B2 (#3925), devenue le CALQUE DE LECTURE au #4065.**
    ///
    /// En mode scène (Story/Réel), la description liée au CONTENU PARTAGÉ
    /// (`documentText`) : ce que l'auteur écrit ici part comme `slide.content`
    /// (via `applyContentText`, le même canal que B1) et le reader l'affiche
    /// par-dessus le canvas composé — la légende `content` des viewers existants
    /// (`ReelsPlayerView`, `FeedPostCard`, `PostDetailView`, `StoryViewer`).
    /// C'est la surface d'ÉDITION, côté scène, du contenu que B1 préserve entre
    /// les modes — jamais un second champ.
    ///
    /// **Elle fut une barre repliable à chevron, et ce n'en est plus une.** La
    /// barre montrait un RÉSUMÉ d'une ligne, en texte brut, sous une icône et un
    /// chevron : trois éléments de chrome pour dire ce que le lecteur verrait,
    /// et qui ne le montraient pas. `ComposerDescriptionLayer` rend le texte
    /// avec le renderer du lecteur et se déplie au tap — un seul calque, monté
    /// aussi par la surface de scène. Les deux profils voient donc EXACTEMENT la
    /// même chose, ce que deux implémentations n'auraient pas tenu deux lots.
    private var sceneDescriptionSection: some View {
        ComposerDescriptionLayer(
            text: sceneDescriptionBinding,
            placeholder: String(localized: "composer.scene.description.placeholder",
                                defaultValue: "Ajoutez une description…", bundle: .main)
        )
        .background(MeeshyColors.textPrimary(isDark: true).opacity(0.06))
    }

    /// **Le binding qui garde UN seul contenu.** Écrire dans la description met
    /// à jour `documentText` (l'état partagé du meuble) ET le sème sur la slide
    /// de la scène (`applyContentText`) : ainsi le texte part à la publication
    /// depuis la scène, et se retrouve dans le champ du document au retour —
    /// jamais deux champs à faire diverger (loi 9 / B1).
    private var sceneDescriptionBinding: Binding<String> {
        Binding(
            get: { documentText },
            set: { newValue in
                documentText = newValue
                viewModel.applyContentText(newValue)
            }
        )
    }

    /// **B3 (#3926) — le report du contenu vers la scène, en UN seul endroit.**
    ///
    /// Quand la surface montée devient la SCÈNE — que ce soit par l'éventail
    /// (STORY/RÉEL) ou par une couleur de fond (F2) —, le contenu déjà composé
    /// doit suivre (loi 9). Ce report vivait dans la closure du bouton du
    /// sélecteur de destination (F1) ; l'éventail ayant remplacé ce sélecteur,
    /// il n'y a plus de bouton où l'accrocher. Il devient donc une propriété de
    /// « la scène vient d'être montée », branchée sur `mountedSurface` dans le
    /// `body` — un site UNIQUE, quel que soit le contrôle qui a déclenché la
    /// bascule, et qui ne peut plus diverger d'un chip à l'autre.
    ///
    /// Idempotent par construction : `applyContentText` ne dirty pas une slide
    /// dont le contenu ne change pas, et `applyContentMedia` mémorise les
    /// sources déjà portées — refaire le report à chaque entrée en scène ne
    /// duplique rien.
    /// **En Post, chaque média posé devient SA slide (modèle § 3, #4038).**
    ///
    /// Le modèle dit qu'en profil Post une slide EST un média du post — c'est ce
    /// qui distingue un CARROUSEL (N slides d'un média) d'une SCÈNE COMPOSÉE
    /// (une slide, un fond et des premiers plans). Story et Réel ne passent donc
    /// pas ici : leur report reste `carryContentIntoSceneIfNeeded`, qui pose tout
    /// sur la slide courante — en Réel il n'y a qu'une slide (le réel EST la
    /// scène), en Story l'auteur compose sur celle qu'il regarde.
    ///
    /// **La première slide est RÉEMPLOYÉE, jamais doublée** : un composer neuf
    /// naît avec une slide vierge (`slides = [StorySlide()]`), et lui en ajouter
    /// une pour le premier média aurait laissé un carrousel dont la première vue
    /// est vide.
    ///
    /// Le retrait suit le même index : un média retiré de la bande retire SA
    /// slide. `removeSlide` refuse de descendre sous une slide — retirer le
    /// dernier média laisse donc une slide vierge, ce qui est exactement l'état
    /// d'un post sans média.
    private func syncPostMediaIntoSlides() {
        guard selectedFormat == .post else { return }

        // **Le SON ne fait pas de slide (#4052).** Il se pose sur la scène
        // COURANTE comme bande-son — pas une page du carrousel. Traité AVANT la
        // boucle des visuels : il n'entre jamais dans `slideIdByMediaURL`, dont
        // l'invariant est « une entrée = une slide », et l'y mettre ferait
        // supprimer une slide au retrait du vocal.
        viewModel.applyContentAudio(documentContentMedia.filter { $0.kind == .audio })

        for media in documentContentMedia where media.kind != .audio
            && slideIdByMediaURL[media.sourceURL] == nil {
            let target: String
            if slideIdByMediaURL.isEmpty,
               (viewModel.currentSlide.effects.mediaObjects ?? []).isEmpty {
                target = viewModel.currentSlide.id
            } else {
                viewModel.addSlide()
                target = viewModel.currentSlide.id
            }
            viewModel.applyContentMedia([media], intoSlideId: target)
            slideIdByMediaURL[media.sourceURL] = target
        }

        let present = Set(documentContentMedia.filter { $0.kind != .audio }.map(\.sourceURL))
        for (url, slideId) in slideIdByMediaURL where !present.contains(url) {
            if let index = viewModel.slides.firstIndex(where: { $0.id == slideId }) {
                viewModel.removeSlide(at: index)
            }
            slideIdByMediaURL.removeValue(forKey: url)
        }
    }

    /// Les entrées du `⋯`, lues à UN endroit. La règle est PURE
    /// (`ComposerOverflowPolicy`) et se lit ici ; le `body` ne fait que
    /// consommer, et ne peut donc pas en écrire une seconde version.
    private var documentOverflowEntries: [ComposerOverflowEntry] {
        ComposerOverflowPolicy.entries(
            hasBackground: documentBackground != nil,
            hasMedia: !documentLocalMedia.isEmpty,
            hasText: !documentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            hasLocation: documentLocation != nil,
            backgroundPickerIsReachable: backgroundPaletteIsReachable
        )
    }

    /// **La palette a-t-elle DÉJÀ un chemin à l'écran ?** (#4064)
    ///
    /// Sur la surface DOCUMENT, oui : l'icône de fond de la rangée d'outils la
    /// déplie. Sur la surface de SCÈNE, non — cette rangée n'y existe plus (le
    /// chrome est passé aux deux rails) et le rail *leading* ne porte que des
    /// portes qui font entrer un `MeeshyObject` ; une COULEUR n'en est pas un.
    /// Le `⋯` est alors le seul chemin restant, et la règle le lui accorde.
    ///
    /// La question se pose au MEUBLE parce que c'est lui qui monte les vues ;
    /// `ComposerOverflowPolicy`, elle, ne reçoit qu'un FAIT — pas un nom de
    /// surface, qu'elle n'aurait aucun moyen d'éprouver.
    private var backgroundPaletteIsReachable: Bool {
        ComposerMountedView.mounted(surface: mountedSurface,
                                    hasScene: documentHasScene) != .scene
    }

    /// **Le `⋯` de la barre haute (#4047).** Il ne peint QUE les entrées que la
    /// règle sert — une entrée absente, jamais grisée.
    ///
    /// Le verre est le même que celui du `✕` et du chip de format, et pour la
    /// même raison qu'eux le premier plan reste `textPrimary(isDark: true)` :
    /// `glassControlForeground()` rendrait `indigo950` en thème clair, sur un
    /// plateau qui est sombre en permanence.
    private var overflowMenu: some View {
        Menu {
            ForEach(Array(documentOverflowEntries.enumerated()), id: \.offset) { entry in
                let item = entry.element
                Button(role: item == .clearAll ? .destructive : nil) {
                    perform(item)
                } label: {
                    Label(ComposerOverflowCopy.label(item),
                          systemImage: ComposerOverflowCopy.icon(item))
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .frame(width: ComposerControlMetrics.visualDiameter,
                       height: ComposerControlMetrics.visualDiameter)
                .adaptiveGlass(in: Circle())
        }
        .accessibilityLabel(Text(ComposerOverflowCopy.menu))
    }

    /// **Ce que chaque entrée FAIT.** Séparé de ce qui les OFFRE : la règle dit
    /// lesquelles servir, cette fonction ce qu'elles emportent — et les deux se
    /// lisent sans monter une vue.
    private func perform(_ entry: ComposerOverflowEntry) {
        switch entry {
        case .pickBackground:
            // Bascule : le même geste ouvre et referme la bande. « Ouvrir »
            // sans « refermer » rendrait les ≈ 170 pt à sens unique.
            requestedSceneBand = requestedSceneBand == .palette ? nil : .palette

        case .removeBackground:
            // L'INTENTION de l'auteur est `documentBackground` : c'est elle qui
            // fait naître la scène (`documentHasScene`). Le canvas, lui, garde
            // toujours une couleur — `background` n'est pas optionnel dans
            // `StoryEffects`, et y poser du vide donnerait un canvas NOIR.
            documentBackground = nil
            viewModel.clearBackground()

        case .clearAll:
            // **`viewModel.reset()` d'ABORD, l'état du meuble ensuite.** Le
            // reset vide `carriedContentSources`, le cache d'idempotence
            // d'`applyContentMedia` ; sans lui, re-choisir la MÊME photo après
            // un effacement serait silencieusement sauté et n'atteindrait
            // jamais la scène.
            viewModel.reset()
            documentText = ""
            documentLocalMedia = []
            documentBackground = nil
            documentLocation = nil
            documentDiscoverability.reset()
            documentTranscription = nil
            // La carte média→slide est un INDEX du meuble : la laisser pleine
            // ferait retirer, au prochain sync, des slides qui n'existent plus.
            slideIdByMediaURL = [:]
            selectedSceneItemKind = nil
        }
    }

    /// **Quel média le rail doit CERCLER (#4047).**
    ///
    /// L'index `slideIdByMediaURL` est lu à l'ENVERS : il relie une URL à une
    /// slide, on cherche l'URL dont la slide est la courante. Passer par lui
    /// plutôt que par l'ordre des tableaux est ce qui tient quand un média est
    /// retiré au milieu — l'ordre ment alors, l'index non.
    ///
    /// `nil` quand rien ne correspond : un document sans média, une slide qui
    /// n'est celle d'aucun média (le cas du fond de COULEUR seul). Aucun anneau
    /// est la bonne réponse dans les deux cas — jamais un anneau par défaut sur
    /// la première vignette, qui affirmerait une position fausse.
    private var selectedSlideMediaURL: URL? {
        let current = viewModel.currentSlide.id
        return slideIdByMediaURL.first(where: { $0.value == current })?.key
    }

    /// La scène est peinte dès qu'il y a QUELQUE CHOSE à peindre — un fond
    /// choisi, ou au moins un média devenu slide. La lier au seul
    /// `documentBackground` (Phase 2) la réservait aux fonds de COULEUR, donc
    /// laissait un post de photos sans aucune scène.
    private var documentHasScene: Bool {
        documentBackground != nil || !slideIdByMediaURL.isEmpty
    }

    private func carryContentIntoSceneIfNeeded() {
        // E1 — la scène prend la langue DÉCLARÉE au composer comme défaut de
        // tout objet posé.
        viewModel.declaredContentLanguage = documentLanguage
        // B1 — le texte ET le média déjà composés SUIVENT dans la scène.
        viewModel.applyContentText(documentText)
        viewModel.applyContentMedia(documentContentMedia)
    }

    /// **Le sélecteur de lieu (T2.5)**, monté ICI plutôt que dans
    /// `ComposerDocumentSurface` — même patron que `documentCameraSheet` juste
    /// au-dessus : le picker est le même composant que le composer inline du
    /// fil (`FeedView+Attachments.handleFeedLocationSelection`), qui se
    /// referme lui-même (`LocationPickerView.dismiss()`) après `onSelect`.
    ///
    /// **Un lieu choisi recalcule le second opt-in DEPUIS LA MÉMOIRE**, jamais
    /// depuis l'état courant : `FeedNearbyDiscoverability.choiceForNewPlace()`
    /// lit `LocationSharingPreferencesStore` à cet instant précis, exactement
    /// ce que fait le composer inline sur le même geste — un second lieu choisi
    /// dans la même session doit repartir du dernier palier RETENU, pas d'un
    /// toggle resté ouvert pour le lieu précédent.
    private var documentLocationPickerSheet: some View {
        LocationPickerView(accentColor: MeeshyColors.brandPrimaryHex) { place in
            documentLocation = place
            documentDiscoverability = FeedNearbyDiscoverability.choiceForNewPlace()
        }
    }

    /// **Le sixième outil (T2.6)**, dernier de la rangée — même composant que
    /// le composer inline du fil monte déjà (`AudioPostComposerView`,
    /// `FeedView+Attachments.swift`) : en fabriquer un second aurait donné
    /// deux feuilles d'enregistrement/transcription à faire diverger,
    /// exactement le défaut que `PublishIntent` existe pour fermer.
    ///
    /// **La destination est double, et c'est le cœur du lot.** L'enregistrement
    /// rejoint `documentLocalMedia` comme un `ComposerDocumentMedia` ORDINAIRE
    /// — il part par la file durable, comme tout média local (T2.3). La
    /// transcription voyage À CÔTÉ dans `documentTranscription`, jamais fondue
    /// dans le texte : `documentDraft` la transmet telle quelle à
    /// `ComposerDocumentDraft.document(mobileTranscription:)`, que la porte
    /// poste à `PublishIntent.document(transcription:)`.
    ///
    /// **La capsule de langue est SEMÉE, jamais imposée.** Poser
    /// `documentLanguage = transcription.language` au retour rend le contrôle
    /// RÉEL (loi 4) et évite qu'une voix parte étiquetée par la langue de
    /// démarrage du meuble — mais ce n'est qu'un confort d'affichage : la
    /// garantie qui compte est le `??` de `PublishIntent.document`, qui élit
    /// la langue PARLÉE même si l'auteur rouvre la capsule et la change après
    /// coup.
    ///
    /// **Un son EMPRUNTÉ à la bibliothèque est hors du périmètre de ce lot.**
    /// `AudioPostComposerView.onPublishBorrowed` référence un `soundId` déjà
    /// côté serveur, sans fichier LOCAL ni transcription — une matière que
    /// `ComposerDocumentDraft` ne modélise pas ici. Fermer la feuille sans
    /// effet est le choix assumé, plutôt qu'un second chemin d'envoi pour un
    /// cas que la rangée du document n'offre nulle part ailleurs.
    private var documentAudioComposerSheet: some View {
        AudioPostComposerView(
            onPublish: { audioURL, mimeType, durationMs, transcription in
                documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                    url: audioURL,
                    declaredMimeType: mimeType,
                    durationMs: durationMs
                ))
                documentTranscription = transcription
                if let transcription {
                    documentLanguage = transcription.language
                }
                showsAudioComposer = false
                HapticFeedback.light()
            },
            onPublishBorrowed: { _ in
                showsAudioComposer = false
            }
        )
    }

    /// **Le SECOND opt-in n'est offert que sous la MÊME garde que le composer
    /// inline** — `FeedNearbyDiscoverability.offers(hasPlace:visibility:)`,
    /// APPELÉE et jamais recopiée (`hasPlace && visibility == .public`) : une
    /// condition réécrite ici diverge de l'originale au premier ajustement de
    /// l'une des deux, exactement le défaut que ce type existe pour fermer.
    private var documentOffersNearbyDiscoverability: Bool {
        FeedNearbyDiscoverability.offers(
            hasPlace: documentLocation != nil,
            visibility: composerVisibility
        )
    }

    /// **La capsule de langue (T2.2)** — le septième contrôle que la feuille
    /// historique porte dans la même barre que les six outils d'attache
    /// (`FeedComposerSheet`, `composerLanguage`), et que la porte du document
    /// n'avait ni en champ, ni en contrôle, ni en canal sur
    /// `ComposerDocumentDraft` avant ce lot.
    ///
    /// Même capsule, même sélecteur que la feuille : `ComposerLanguageFlag` et
    /// `AudioLanguagePickerView` tournent déjà en production, et en fabriquer
    /// une seconde paire ici donnerait deux listes de langues et deux mémoires
    /// à faire diverger.
    /// Le nom LOCALISÉ de la langue déclarée, pour VoiceOver — un emoji drapeau
    /// ne se lit pas utilement (contrat de `ComposerLanguageFlag`). Miroir de
    /// `composerLanguageDisplayName` de la feuille.
    private var documentLanguageDisplayName: String {
        let name = Locale.current.localizedString(forLanguageCode: documentLanguage) ?? documentLanguage
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    private var documentLanguageCapsule: some View {
        Button {
            showsDocumentLanguagePicker = true
            HapticFeedback.light()
        } label: {
            Text(ComposerLanguageFlag.label(for: documentLanguage))
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo400)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(MeeshyColors.indigo400.opacity(0.15))
                        .overlay(
                            Capsule()
                                .stroke(MeeshyColors.indigo400.opacity(0.3), lineWidth: 1)
                        )
                )
        }
        .accessibilityLabel(Text(ComposerDocumentCopy.language))
        .accessibilityValue(documentLanguageDisplayName)
        // Même correctif que l'ancienne tuile de lieu (#4034, retirée) :
        // `.padding(16)` datait
        // de l'ancien `.overlay(alignment: .bottomTrailing)` et doublait la
        // marge une fois la capsule devenue enfant du `HStack` de `toolRow`
        // — cause du débordement horizontal mesuré au simulateur.
    }

    /// Le sélecteur du dépôt, monté tel quel — même raison que
    /// `emojiPickerSheet` deux zones plus haut : `AudioLanguagePickerView`
    /// tourne déjà en production sous la feuille historique, avec ses
    /// catégories, sa recherche et son bouton « afficher toutes les langues ».
    /// En fabriquer un second ici serait deux listes de langues à faire
    /// diverger.
    private var documentLanguagePickerSheet: some View {
        AudioLanguagePickerView(
            selectedLocale: Binding(
                get: { Locale(identifier: documentLanguage) },
                set: { newLocale in
                    documentLanguage = newLocale.language.languageCode?.identifier ?? newLocale.identifier
                }
            ),
            title: "Langue du post"
        )
    }

    /// Ce que le meuble sert — une PROJECTION de la règle, jamais une liste
    /// écrite ici. Le jour où un outil gagnera sa destination, il suffira de lui
    /// donner un `effect` : une énumération recopiée ici aurait exigé de penser
    /// aux DEUX endroits, et le second est celui qu'on oublie.
    private var servedDocumentTools: [ComposerDocumentTool] { ComposerDocumentTool.servedRow }

    /// Le rappel de la rangée, aiguillé sur l'EFFET et non sur l'outil.
    ///
    /// Aiguiller sur l'outil aurait rouvert exactement ce que `effect` referme :
    /// des branches muettes pour les outils que la rangée ne sert pas, et la
    /// dérive silencieuse le jour où l'une d'elles cesserait de correspondre à
    /// ce que la rangée sert. Ici, `nil` est le seul cas inatteignable, et il
    /// l'est par construction — un outil sans effet n'arrive jamais à l'écran.
    ///
    /// **`.attachesLocalMedia` porte UNE valeur associée (T2.3)**, jamais trois
    /// cas distincts sur `tool.effect` — `.photoLibrary`/`.camera`/`.files`
    /// restent une question posée au SÉLECTEUR à ouvrir
    /// (`presentMediaIntake`), jamais une seconde question posée à l'outil.
    /// Une porte du rail délègue au chemin d'ingestion EXISTANT — le rail est
    /// une autre GÉOGRAPHIE, pas un second pipeline. Y écrire un chemin neuf
    /// ferait diverger la porte de la rangée qui fait déjà la même chose.
    private func handleRailDoor(_ door: ComposerRailDoor) {
        switch door {
        case .media:   handleDocumentTool(.photo)
        case .sound:   handleDocumentTool(.microphone)
        case .mention: handleDocumentTool(.mention)
        case .place:   handleDocumentTool(.place)
        case .description, .sticker:
            // Injoignables : `railDoors` ne les sert pas, et la loi 4 veut
            // qu'une porte sans effet ne soit pas peinte. Le `switch` reste
            // exhaustif pour qu'ajouter leur chemin oblige à passer ici.
            break
        }
    }

    /// **Le rail délègue au VIEWMODEL, jamais au canvas.** Muter la slide par
    /// le modèle est ce qui garde publication, reader et export d'accord ; le
    /// meuble n'a d'ailleurs aucune référence à la vue UIKit.
    private func handleTrailingRailAction(_ action: StoryCanvasContextAction) {
        guard let id = selectedSceneItemId else { return }
        switch action {
        case .duplicate: viewModel.duplicateElement(id: id)
        case .delete:
            viewModel.deleteElement(id: id)
            selectedSceneItemId = nil
            selectedSceneItemKind = nil
        case .edit, .leaveScene, .bringForward, .sendBackward:
            // Injoignables : `served` ne les contient pas. L'empilement ne vit
            // que sur la `StoryCanvasUIView` ; l'y router demanderait de porter
            // la primitive sur le MODÈLE — un lot en soi.
            break
        }
    }

    private func handleDocumentTool(_ tool: ComposerDocumentTool) {
        switch tool.effect {
        case .insertsEmojiIntoText:
            HapticFeedback.light()
            showsEmojiPicker = true
        case .opensReferencePicker:
            HapticFeedback.light()
            showsReferencePicker = true
        case .attachesLocalMedia(let intake):
            HapticFeedback.light()
            presentMediaIntake(intake)
        case .attachesLocation:
            HapticFeedback.light()
            showsLocationPicker = true
        case .attachesTranscribedAudio:
            HapticFeedback.light()
            showsAudioComposer = true
        case .none:
            break
        }
    }

    /// Quel sélecteur ouvrir pour la famille d'ingestion demandée — la seule
    /// question que `ComposerMediaIntake` pose. `handleDocumentTool` ne la
    /// pose jamais lui-même : il reste aiguillé sur l'EFFET, cette fonction
    /// sur l'INTAKE.
    private func presentMediaIntake(_ intake: ComposerMediaIntake) {
        switch intake {
        case .photoLibrary:
            showsPhotoPicker = true
        case .camera:
            showsCamera = true
        case .files:
            showsFileImporter = true
        }
    }

    /// La photothèque (T2.3). `PhotosPickerItem` ne porte ni URL ni octets
    /// tant qu'on ne les charge pas : `loadTransferable` les matérialise, et
    /// `supportedContentTypes` porte le type DÉCLARÉ par la photothèque.
    ///
    /// **Revue Opus, correctifs 1 et 3.** Le mime et la durée passent tous
    /// deux par `ComposerMediaProbe` — jamais un repli `?? "application/octet-stream"`
    /// recalculé ici (`.mime`, qui seul sait retomber sur la table par
    /// EXTENSION avant ce repli terminal), jamais une vidéo sélectionnée
    /// figée `durationMs: nil` (`.durationMs`, sans quoi `ReelComposition`
    /// la classerait `.post` au lieu de `.reel`).
    private func ingestPhotoLibraryItems(_ items: [PhotosPickerItem]) async {
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let declaredType = item.supportedContentTypes.first
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(
                "composer_photo_\(UUID().uuidString).\(declaredType?.preferredFilenameExtension ?? "dat")"
            )
            guard (try? data.write(to: url)) != nil else { continue }
            let mime = ComposerMediaProbe.mime(forURL: url, declaredType: declaredType)
            let duration = await ComposerMediaProbe.durationMs(forURL: url, mime: mime)
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                url: url,
                declaredMimeType: mime,
                durationMs: duration
            ))
        }
        HapticFeedback.light()
    }

    /// La caméra (T2.3) — le mime est celui que CE SITE choisit en écrivant
    /// le fichier, jamais dérivé après coup : JPEG pour une photo, QuickTime
    /// pour une vidéo (le conteneur qu'`AVCaptureMovieFileOutput` écrit déjà,
    /// `CameraModel.startSegment()`).
    ///
    /// **Revue Opus, correctif 1.** La branche vidéo sonde sa durée RÉELLE
    /// (`ComposerMediaProbe.durationMs`) — sans elle, une vidéo de 10 s
    /// captée ici partait `durationMs: nil` et `ReelComposition` la classait
    /// `.post` au lieu de `.reel`. La branche photo n'a rien à sonder : une
    /// image n'a pas de durée, et `ComposerMediaProbe.durationMs` la
    /// classerait `nil` de toute façon — l'appeler ici serait un aller-retour
    /// pour rien.
    private func ingestCameraCapture(_ result: CameraResult) async {
        switch result {
        case .photo(let image):
            guard let data = image.jpegData(compressionQuality: 0.9) else { return }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("composer_camera_\(UUID().uuidString).jpg")
            guard (try? data.write(to: url)) != nil else { return }
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(url: url, declaredMimeType: "image/jpeg"))
        case .video(let url):
            let duration = await ComposerMediaProbe.durationMs(forURL: url, mime: "video/quicktime")
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                url: url,
                declaredMimeType: "video/quicktime",
                durationMs: duration
            ))
        }
        HapticFeedback.light()
    }

    /// L'importateur de documents (T2.3) — le mime passe par
    /// `ComposerMediaProbe.mime`, jamais recalculé ici.
    ///
    /// **Revue Opus, correctif 3.** `UTType.preferredMIMEType` rend `nil`
    /// pour des types pourtant bien identifiés (`.caf`, `.opus`) : retomber
    /// directement sur `application/octet-stream` ici ferait perdre
    /// EXACTEMENT le défaut que ce lot prétend fermer. `ComposerMediaProbe.mime`
    /// retombe d'abord sur la table par EXTENSION (`MimeTypeResolver`).
    ///
    /// **Revue Opus, correctif 4.** `startAccessingSecurityScopedResource()`
    /// rend `false` pour un fichier qui N'EST PAS security-scoped (conteneur
    /// app, certains fournisseurs) — ce n'EST PAS un échec. La copie est
    /// tentée QUEL QUE SOIT ce retour ; `stopAccessingSecurityScopedResource()`
    /// n'est appelé QUE si `start` a rendu `true`.
    ///
    /// **Revue Opus, correctif 1.** La durée RÉELLE est sondée
    /// (`ComposerMediaProbe.durationMs`) — un `.mp4`/`.caf` importé ici
    /// portait sinon `durationMs: nil`, et `ReelComposition` le classait
    /// `.post` au lieu de `.reel`/l'excluait à tort d'un réel à deux médias.
    ///
    /// `async` depuis ce lot : le `.fileImporter` du corps l'enveloppe d'un
    /// `Task`, comme les deux autres ingestions.
    private func ingestFileImporterResult(_ result: Result<[URL], Error>) async {
        guard case .success(let urls) = result else { return }
        for sourceURL in urls {
            let scoped = sourceURL.startAccessingSecurityScopedResource()
            defer { if scoped { sourceURL.stopAccessingSecurityScopedResource() } }
            let declaredType = try? sourceURL.resourceValues(forKeys: [.contentTypeKey]).contentType
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("composer_file_\(UUID().uuidString)_\(sourceURL.lastPathComponent)")
            guard (try? FileManager.default.copyItem(at: sourceURL, to: destination)) != nil else { continue }
            let mime = ComposerMediaProbe.mime(forURL: destination, declaredType: declaredType)
            let duration = await ComposerMediaProbe.durationMs(forURL: destination, mime: mime)
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                url: destination,
                declaredMimeType: mime,
                durationMs: duration
            ))
        }
        HapticFeedback.light()
    }

    /// **Le sélecteur du dépôt, monté tel quel** — celui que le composer inline
    /// du fil ouvre déjà, avec ses catégories, sa recherche et ses récents. En
    /// fabriquer un second ici aurait donné deux listes d'emojis, deux mémoires
    /// et deux jeux de catégories à faire diverger : le motif que la surface du
    /// mood a refusé pour `StatusViewModel.moodOptions`.
    ///
    /// Il écrit dans `documentText`, et **jamais dans `moodEmoji`** : les deux
    /// sont des emojis et vivent à quelques lignes l'un de l'autre, mais l'un
    /// est un caractère glissé dans une phrase et l'autre est la matière
    /// DÉFINISSANTE d'un mood — celle sans laquelle `ComposerDocumentPublishGate`
    /// refuse de publier. Les confondre changerait ce qu'un mood EST à chaque
    /// frappe de son texte.
    private var emojiPickerSheet: some View {
        EmojiPickerSheet(quickReactions: Self.quickEmojis, title: "composer.attach.emoji") { emoji in
            documentText += emoji
            showsEmojiPicker = false
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    /// **La SECONDE porte pour nommer** — celle qui n'écrit pas.
    ///
    /// La première reste la frappe `@`, servie inline par la surface
    /// (`ComposerMentionControllerBox` → `ComposerMentionStrip`) : elle écrit le
    /// nom DANS le texte, pendant la saisie. Celle-ci cherche la personne
    /// correctement, puis laisse choisir COMMENT elle paraît — `INLINE`,
    /// `NOTE` (« Avec … » sous le contenu) ou `SILENT` (notifiée, invisible aux
    /// tiers). Le mode ne se choisit pas à la frappe, et c'est toute la raison
    /// d'être de cette feuille.
    ///
    /// `forCanvas: false` — un post n'a aucune couche de positionnement : lui
    /// proposer le badge `PINNED` promettrait un affichage qui n'arriverait
    /// jamais. C'est `StoryMentionPickerSheet` qui porte cette règle, on ne fait
    /// que lui dire de quelle matière il s'agit.
    ///
    /// Exactement la feuille que `ReferenceComposerBar` ouvre depuis le mood :
    /// une seconde aurait été une seconde vérité sur « comment on nomme ».
    private var referencePickerSheet: some View {
        StoryMentionPickerSheet(
            references: composerReferences,
            modes: PostReferenceDisplay.declarable(forCanvas: false)
        ) { updated in
            composerReferences = updated
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    /// Les six emojis de tête, ceux que le composer du fil propose déjà. Écrits
    /// ici plutôt qu'en ligne pour que la liste reste une donnée nommée le jour
    /// où elle deviendra une mémoire de récents.
    private static let quickEmojis = ["\u{1F600}", "\u{2764}\u{FE0F}", "\u{1F525}", "\u{1F44D}", "\u{1F602}", "\u{1F389}"]

    // MARK: - Le mood

    /// La surface du mood (lot 4.4), montée par la MÊME règle que les deux
    /// autres. Le meuble lui remet des valeurs et récupère des événements ; il
    /// ne lui remet AUCUN chemin d'envoi.
    ///
    /// **Elle a une ISSUE depuis le lot 4.5.** Le chrome n'est plus cédé à
    /// l'atelier sous cette surface (`ComposerChromeOwnership.owner(for: .mood)`
    /// rend `.host`), donc le socle est peint et sa flèche remet un
    /// `ComposerDocumentDraft` à `onPublishDocument`. Le mood s'y compose ET s'y
    /// envoie — à la fermeture que le site de montage a fournie, jamais par un
    /// chemin que le meuble aurait fabriqué.
    ///
    /// **Et des auteurs l'atteignent depuis le lot 4.6.** `.moodChip` ne route
    /// plus vers son composer historique, et les quatre feuilles qui montaient
    /// `StatusComposerView` montent `MoodComposerDoor` — le rail Lentille, le
    /// tray classique, l'accès rapide de la queue de liste, le tray du fil, et
    /// les deux `onRepublish` des racines de fenêtre.
    ///
    /// `viaUsername` vient de la GRAINE, et il n'a de valeur que pour la
    /// republication (lot 4.7). Il n'est pas porté par un paramètre à défaut :
    /// `ComposerMoodSeed` est elle-même obligatoire dans l'`init`, si bien qu'un
    /// site de republication ne peut pas la perdre en silence.
    private var moodSurface: some View {
        ComposerMoodSurface(
            emoji: $moodEmoji,
            text: $documentText,
            visibility: $composerVisibility,
            visibilityUserIds: $composerVisibilityUserIds,
            // `allowedAudiences:` vient APRÈS `visibilityUserIds:`, comme la
            // déclaration : Swift n'autorise aucun réordonnancement, et l'ordre
            // de cet `init` est déjà tenu par une garde côté meuble. Le ruban
            // REÇOIT son offre — il la décidait, et peignait alors les six
            // niveaux du SDK jusque sous une republication.
            allowedAudiences: offeredAudiences,
            references: $composerReferences,
            viaUsername: moodSeed?.viaUsername,
            onClose: onDismiss
        )
    }

    /// Le plateau ne porte plus qu'UNE chose : l'éventail, le seul endroit du
    /// meuble où l'auteur choisit ce qu'il PUBLIE.
    ///
    /// **Il est monté par le `body`, une seule fois, sous `paintsFormatFan`**
    /// (lot 4.7). Il l'était par `composerSurface`, ce qui le réservait de fait
    /// à la scène : le chip « Post » d'une republication de mood n'existait
    /// alors sur aucun écran. Le descendre en bloc aurait livré le défaut
    /// symétrique sous `.feedComposer` — d'où la règle, et non un second
    /// montage.
    ///
    /// **Trois pictogrammes en sont partis le 2026-08-24** — caméra,
    /// diapositives, timeline. Ils n'étaient pas des `Button` : le tap ne
    /// faisait rien, et depuis que la porte de création monte le meuble ils
    /// étaient inertes EN PRODUCTION, sur la surface de création la plus
    /// utilisée. Loi 4 : une affordance non offerte est absente.
    ///
    /// Ils ne sont pas branchables d'ici. `addSlide()`, `isTimelineVisible` et
    /// l'écriture de `currentEffects` (`public internal(set)`) sont `internal`
    /// à `MeeshyUI` : le meuble peut LIRE la composition, pas la modifier.
    /// Fabriquer un chemin de secours app-side aurait doublé des commandes que
    /// l'atelier offre déjà et qui, elles, agissent — la bande de diapositives,
    /// le menu ⋯ → Timeline, le fournisseur de capture que ce host injecte.
    ///
    /// Condition de retour, à remplir côté SDK : un écrivain public de la
    /// composition atteignable par le meuble. Sans lui, un bouton ici ouvrirait
    /// une caméra dont la photo n'aurait nulle part où aller.
    private var plateauTools: some View {
        HStack(spacing: 12) {
            Spacer()
            formatChip
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    /// **Le SITE UNIQUE du sélecteur de format.**
    ///
    /// Deux places le montent — la rangée du plateau (scène, mood) et la barre
    /// haute du document (#4047) — et elles sont EXCLUSIVES par la règle de
    /// placement, jamais par une condition écrite dans un `body`. Une seule
    /// CONSTRUCTION les sert toutes les deux : en écrire une par place aurait
    /// donné deux sélecteurs à faire diverger, et le compte d'occurrences que
    /// les gardes tiennent est là pour l'interdire.
    private var formatChip: some View {
        ComposerFormatFan(
            offeredFormats: profile.offeredFormats,
            selection: formatSelection
        )
        .font(.footnote.weight(.semibold))
        .foregroundColor(MeeshyColors.textSecondary(isDark: true))
    }

    // MARK: - Le socle — jamais conditionnel à la PORTE

    /// Le point fixe du composer, et il l'est resté : ce qui varie n'est pas la
    /// porte, c'est la SURFACE.
    ///
    /// La loi 5 interdit qu'il se réorganise selon la porte d'entrée. Elle n'a
    /// jamais dit qu'il peignait une commande sans objet — il s'efface déjà
    /// devant l'atelier, qui peint les mêmes zones (`body`, plus haut). Le lot 4
    /// tient la même phrase jusqu'au bout : l'audience n'est pas peinte là où la
    /// surface porte son propre sélecteur, et l'œil ne l'est que là où il a un
    /// canvas à lire — le DOCUMENT, depuis que chaque média du post y est une
    /// slide (#4038). Sous le mood il n'y a toujours aucun canvas, et il n'y
    /// est donc toujours pas peint.
    ///
    /// Ce qui RESTE peint, en revanche, tient : l'audience est un vrai
    /// sélecteur avec sa mémoire, la flèche un vrai bouton avec son gate de
    /// matière. Un socle qui nomme sans faire est le motif que ce chantier
    /// retire, pas celui qu'il installe.
    ///
    /// Ce choix appartient à `ComposerChromeOwnership.socleZones`, une règle
    /// PURE et éprouvée. Aucun `if` sur `profile`, sur `origin` ni sur `intent`
    /// n'entre ici : ce serait la loi 5 défaite, et une condition écrite dans un
    /// `body` est invisible aux tests.
    /// L'unique lecture de la règle de densité — la recopier au second site
    /// donnerait deux seuils à faire diverger, et l'un des deux se casserait en
    /// syllabes sans que rien ne le dise.
    private var socleShowsLabels: Bool {
        ComposerSocleDensity.showsLabels(dynamicTypeSize)
    }

    private var socle: some View {
        HStack(spacing: 10) {
            if paintedSocleZones.contains(.audience) { audienceChip }
            Spacer()
            if paintedSocleZones.contains(.preview) { previewButton }
            publishButton
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    /// **L'œil — voir le post COMME IL SERA LU, avant de le publier.**
    ///
    /// Il ne rend rien lui-même : il remet les slides composées au rappel
    /// `onPreview`, que la PORTE branche sur `StoryViewerView` — le lecteur
    /// réel, celui qui rendra la publication. C'est la loi 6 tenue à la
    /// lettre : un aperçu maison serait un quatrième chemin de rendu, et il
    /// mentirait le premier jour où le lecteur changerait sans lui.
    ///
    /// **Ce que le meuble remet vient du ViewModel, pas d'un instantané de
    /// vue.** L'atelier passe par `snapshotAllSlides()` parce que sa slide
    /// COURANTE vit dans un état de vue (`buildEffects()`) qu'il doit d'abord
    /// replier dans le tableau. Ici la scène incrustée édite
    /// `viewModel.currentSlide` en direct par un `Binding` : le tableau EST
    /// déjà à jour, et le replier une seconde fois écraserait la slide courante
    /// par une copie plus ancienne.
    ///
    /// Aucun `NotificationCenter.storyComposerMuteCanvas` n'est posté, à la
    /// différence de l'atelier : la scène incrustée ne joue aucun son, il n'y a
    /// donc rien à faire taire — poster quand même laisserait un canvas MUET
    /// derrière l'aperçu, sans personne pour le rallumer sur cette surface.
    private var previewButton: some View {
        Button {
            onPreview(
                viewModel.slides,
                viewModel.slideImages,
                viewModel.loadedImages,
                viewModel.loadedVideoURLs,
                viewModel.loadedAudioURLs
            )
        } label: {
            Image(systemName: "eye")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(String(
            localized: "composer.a11y.preview",
            defaultValue: "Aperçu", bundle: .main
        )))
    }

    /// **L'audience du socle CHOISIT — elle ne témoigne plus.**
    ///
    /// Elle fut un `Label` : un pictogramme et un mot, que rien n'écrivait. Le
    /// brouillon partait alors sur la visibilité semée par la PORTE, et l'auteur
    /// n'avait aucun moyen d'en changer sous cette surface. C'était la première
    /// des deux affordances sans objet qui retenaient l'éventail au lot 4.7 —
    /// et de l'UI morte au sens strict de la loi 4, puisqu'elle NOMMAIT un
    /// réglage qu'elle ne réglait pas.
    ///
    /// **La FORME est celle de l'atelier** (`StoryComposerView+TopBar.visibilityMenu`),
    /// pas celle du mood : un menu qui se replie en une capsule. Le socle est une
    /// RANGÉE — le ruban de six chips du mood y mangerait toute la largeur et
    /// repousserait la flèche hors de l'écran. Les deux surfaces ne sont jamais
    /// peintes ensemble (`ComposerChromeOwnership.socleZones`), il n'y a donc pas
    /// deux contrôles pour un réglage : il y a deux FORMES, une par surface, et
    /// une seule règle de relecture (`ComposerAudienceMemory`).
    ///
    /// Il n'est peint que là où il a un objet, et il n'en a qu'un : le DOCUMENT.
    /// Sous la scène l'atelier peint le sien ; sous le mood, le ruban du bloc 3.
    private var audienceChip: some View {
        Menu {
            ForEach(offeredAudiences) { candidate in
                Button {
                    chooseAudience(candidate)
                } label: {
                    Label(
                        candidate.label,
                        systemImage: composerVisibility == candidate ? "checkmark" : candidate.icon
                    )
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: composerVisibility.icon)
                    .accessibilityHidden(true)
                // #4057 — le mot s'efface aux paliers d'accessibilité ; le nom
                // accessible, lui, ne bouge pas (voir `ComposerSocleDensity`).
                if socleShowsLabels {
                    Text(audienceTitle)
                        .lineLimit(1)
                }
            }
            .font(.footnote.weight(.semibold))
            .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        // Le LIBELLÉ reste « Audience » et ne s'échange pas contre la valeur —
        // c'est la faute que la flèche évite déjà : un contrôle qui perd son nom
        // accessible dès qu'il porte un état. La valeur est annoncée comme
        // valeur, ce que VoiceOver sait lire séparément.
        .accessibilityLabel(Text("composer.socle.audience", bundle: .main))
        .accessibilityValue(Text(composerVisibility.label))
        .sheet(item: $audiencePickerMode) { mode in
            AudienceUserPickerView(mode: mode, initialSelection: composerVisibilityUserIds) { ids in
                composerVisibilityUserIds = ids
            }
        }
    }

    /// Le compte ne s'affiche que là où il VEUT dire quelque chose : sous un
    /// `ONLY`/`EXCEPT` déjà renseigné. Partout ailleurs il ferait lire
    /// « Public (0) », ce qui n'est pas une audience mais une erreur apparente.
    private var audienceTitle: String {
        guard composerVisibility.requiresUserSelection, !composerVisibilityUserIds.isEmpty else {
            return composerVisibility.label
        }
        return "\(composerVisibility.label) (\(composerVisibilityUserIds.count))"
    }

    /// **Choisir écrit la MÉMOIRE dans le même geste** (loi 10). Séparer les deux
    /// écritures, c'est l'occasion d'oublier la seconde — et l'audience
    /// repartirait à zéro à chaque ouverture, sans qu'aucun écran ne le dise.
    ///
    /// Un mode qui exige une liste nominative ouvre le sélecteur dans la foulée :
    /// un `ONLY` sans personne est rejeté par le gateway, et le laisser partir
    /// produirait un refus que rien à l'écran n'annonçait. L'écran historique le
    /// faisait déjà ; le meuble ne le redécouvre pas.
    ///
    /// **Ce refus est réel, et il faut le chercher au bon étage** : il n'est pas
    /// dans `PostService.createPost` — qui écrit `data.visibilityUserIds ?? []`
    /// sans rien vérifier — mais UNE COUCHE plus haut, au schéma de la route
    /// (`CreatePostSchema`, « EXCEPT and ONLY visibility require at least one
    /// userId in visibilityUserIds », 400 `VALIDATION_ERROR`). Le dire ici évite
    /// qu'une lecture du seul service conclue que la phrase ci-dessus est fausse.
    ///
    /// **L'ouverture ne SUFFIT pas, et c'est ce qui manquait.** Elle ne couvre
    /// que le chemin INTERACTIF, et même là qu'à moitié : toucher « Annuler »
    /// dans `AudienceUserPickerView` ne rappelle rien — son en-tête n'appelle
    /// `onDone` que sur « OK » — et laissait l'audience nominative debout avec
    /// une liste vide. Le chemin de RELECTURE la court-circuitait entièrement.
    /// Les deux sont fermés depuis le même lot, chacun à sa place :
    /// `ComposerAudienceMemory.remembered` ne restaure plus un mode dont la
    /// portée est une liste qu'elle ne porte pas, et
    /// `ComposerDocumentPublishGate` refuse d'armer la flèche sur une audience
    /// nominative vide.
    ///
    /// La liste n'est PAS vidée quand l'audience cesse de l'exiger : c'est la
    /// fabrique du brouillon qui l'écarte (loi 3), et la garder ici laisse
    /// l'auteur revenir sur `ONLY` sans avoir à re-sélectionner ses personnes.
    private func chooseAudience(_ candidate: PostVisibility) {
        composerVisibility = candidate
        lastDocumentVisibility = candidate.rawValue
        // **Parité vie privée (T2.5).** Le consentement de trouvabilité porte
        // sur UNE publication ET UNE audience : quitter PUBLIC réarme l'opt-in
        // de découvrabilité. Sans lui, un opt-in armé en PUBLIC survivrait à un
        // resserrement puis à un ré-élargissement — le contrôle réapparaîtrait
        // DÉJÀ ON et publierait sur un consentement PÉRIMÉ que personne n'a
        // réexaminé. Le composer inline de référence le fait pour cette raison
        // exacte (`FeedView+Attachments`), et le même meuble l'applique déjà à
        // `forcePlainPost` (T2.4). `reset()` pose `isDiscoverable = false`, ce
        // qui rend `precisionToSend == nil`.
        if candidate != .public { documentDiscoverability.reset() }
        if candidate.requiresUserSelection { audiencePickerMode = candidate }
    }

    // L'ŒIL DU SOCLE A ÉTÉ RETIRÉ le 2026-08-24 (lot 4.9), avec son lecteur, son
    // document migré et ses trois états de lecture. Il est écrit ici parce
    // qu'une session le rebrancherait sinon en croyant réparer un oubli.
    //
    // Il montait `MeeshyScenePlayer(mode: .preview)` sur
    // `CanvasV3(migrating: viewModel.currentEffects)`, et rien ne remplit
    // `currentEffects` sous les deux surfaces où le socle est peint : le mood n'a
    // pas de canvas, le document n'a AUCUN outil d'ingestion servi (la rangée
    // n'en peint qu'un, l'emoji, qui écrit du texte et ne rapporte aucun média —
    // `ComposerDocumentTool.effect`). L'œil ouvrait donc une scène VIDE — de l'UI
    // morte au sens de la loi 4, qu'aucune dette consignée n'excuse. La loi 6
    // fermait l'autre issue : un aperçu maison du texte serait un quatrième
    // chemin de rendu.
    //
    // CONDITION DE RETOUR : que la surface qui le peint ait quelque chose à
    // lire — un média ingéré côté document, un canvas côté mood. Il revient
    // alors ENTRE l'audience et la flèche, rang que
    // `test_socle_peintSesZones_dansLOrdreCanonique` tient déjà pour lui, et
    // `test_lOeilEtSonLecteur_vivent_etMeurent_ensemble` exige que le lecteur
    // revienne dans le MÊME commit.

    /// **La flèche du socle PUBLIE — sous les surfaces qui n'ont pas d'atelier.**
    ///
    /// Elle fut un `Label` : un témoin qui nommait la publication sans la
    /// piloter. Ce n'était pas un provisoire mou mais l'état exact où V3-2 avait
    /// dû s'arrêter, et le lot 4 ne le lève que là où les raisons de s'arrêter
    /// n'ont pas d'objet.
    ///
    /// **Ce qui a changé, et ce qui n'a PAS changé.** Les deux blocages mesurés
    /// sont des blocages de la SCÈNE, et ils tiennent toujours pour elle :
    ///
    /// - **la télécommande de l'atelier n'a pas de gate de matière.**
    ///   `ComposerPublishTrigger` entre dans `publishAllSlides()` sans repasser
    ///   par `canPublish`, `internal` à `MeeshyUI` : une pression sur une page
    ///   blanche partirait en publication. **Levée** : que l'armement suive ce
    ///   gate, ou que le gate devienne lisible app-side ;
    /// - **le socle ne sait pas CHOISIR l'audience de l'atelier.**
    ///   `visibilityMenu` en est l'unique écrivain, et le sélecteur que le socle
    ///   a gagné au lot 4.9 écrit `composerVisibility`, que l'atelier ne lit
    ///   jamais (`StoryComposerView.visibility` est un `@State` privé semé à la
    ///   construction). Passer `chromeOwner: .host` sous la scène retirerait
    ///   donc `visibilityMenu` en échange d'un contrôle qui ne gouverne rien.
    ///   **Levée** : que l'atelier prenne son audience en `@Binding`.
    ///
    /// Sous le document et sous le mood, **il n'y a pas d'atelier** : pas de
    /// télécommande à armer, pas de `visibilityMenu` à retirer. Le gate est
    /// app-side et pur (`ComposerDocumentPublishGate`), l'audience est celle de
    /// la surface. Les deux raisons ne s'appliquent pas, et une constante qui les
    /// faisait valoir pour les trois surfaces était une constante mal placée.
    ///
    /// **Ce n'est toujours PAS un second chemin d'envoi.** Le bouton n'appelle ni
    /// service, ni file, ni endpoint : il assemble un `ComposerDocumentDraft` et
    /// le tend à `onPublishDocument`, la fermeture que le site de montage a
    /// fournie — comme `onPublishAllInBackground` pour la scène. Le meuble
    /// transmet ; il ne publie pas.
    ///
    /// **Le libellé ne s'échange pas contre un `ProgressView`** pendant l'envoi.
    /// C'est le défaut que `StatusComposerView` a dû corriger : le bouton perdait
    /// son nom accessible à l'instant précis où il était occupé. L'état en vol
    /// est porté par `accessibilityValue`, et l'auteur le voit à la teinte qui
    /// retombe.
    private var publishButton: some View {
        Button {
            publishDocument()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.circle")
                    .accessibilityHidden(true)
                // #4057 — même réduction que l'audience. Sans elle, en allemand
                // à `accessibility-XXXL`, « Veröffentlichen » se cassait en
                // syllabes empilées : l'action TERMINALE du composer devenait
                // une colonne de fragments.
                if socleShowsLabels {
                    Text("composer.socle.publish", bundle: .main)
                        .lineLimit(1)
                }
            }
            .font(.footnote.weight(.bold))
            .foregroundColor(canPublishDocument ? MeeshyColors.indigo400 : MeeshyColors.textSecondary(isDark: true))
            .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
            .contentShape(Rectangle())
        }
        .disabled(!canPublishDocument)
        // Le nom accessible est posé EXPLICITEMENT : sans le `Text`, le `Label`
        // n'en dérive plus aucun, et la flèche perdrait son nom à l'instant même
        // où elle devient compacte — le défaut que `StatusComposerView` a dû
        // corriger, dans l'autre sens.
        .accessibilityLabel(Text("composer.socle.publish", bundle: .main))
        .accessibilityValue(isPublishingDocument ? ComposerSocleCopy.publishInProgress : "")
        .accessibilityHint(publishBlockedHint)
    }

    /// Le gate de MATIÈRE, lu deux fois — pour teindre la flèche et pour la
    /// désactiver. UNE source : l'écran historique du mood écrivait la même règle
    /// deux fois (`guard let emoji` dans l'action, `.disabled(selectedEmoji == nil
    /// || isPublishing)` sur le bouton), et deux écritures d'une règle sont deux
    /// occasions de la corriger à moitié.
    private var canPublishDocument: Bool {
        ComposerDocumentPublishGate.canPublish(
            surface: mountedSurface,
            emoji: moodEmoji,
            text: documentText,
            visibility: composerVisibility,
            visibilityUserIds: composerVisibilityUserIds,
            isPublishing: isPublishingDocument,
            repostOfId: intent.origin.repostedPostId
        )
    }

    /// Ce que VoiceOver annonce quand la flèche refuse. Vide pendant l'envoi :
    /// « choisissez un emoji » serait faux d'un mood qui en a un et qui part.
    ///
    /// **Et vide aussi quand c'est l'AUDIENCE qui retient**, pour la même
    /// raison, une phrase plus loin : un mood peut avoir son emoji et rester
    /// bloqué par un `ONLY` sans personne. Dicter « choisissez un emoji » y
    /// prescrirait un geste qui ne débloque rien — un indice FAUX coûte plus
    /// qu'un indice absent. La condition n'est pas réécrite ici : c'est la même
    /// règle que le gate lit, `ComposerDocumentPublishGate.audienceIsComplete`.
    ///
    /// **Aucune clé neuve, et c'est une contrainte, pas une paresse** : le
    /// catalogue est à SEPT langues avec un cliquet français à zéro tolérance,
    /// et aucune phrase existante ne dit « nommez au moins une personne ». Elle
    /// s'écrira dans le lot qui possède le catalogue.
    private var publishBlockedHint: String {
        guard !canPublishDocument, !isPublishingDocument else { return "" }
        guard ComposerDocumentPublishGate.audienceIsComplete(
            composerVisibility,
            userIds: composerVisibilityUserIds
        ) else { return "" }
        return ComposerSocleCopy.publishBlockedHint(surface: mountedSurface) ?? ""
    }

    /// Ce que la flèche remet au site de montage.
    ///
    /// `nil` sous la scène — le socle n'y est pas peint, et fabriquer un
    /// brouillon pour une surface qui publie par l'atelier aurait été le second
    /// chemin d'envoi que la doctrine, C2 et le lot 7 interdisent tous les trois.
    private var documentDraft: ComposerDocumentDraft? {
        switch mountedSurface {
        case .scene:
            return nil
        case .mood:
            // `repostOfId` vient de la PORTE, pas de la graine : c'est la porte
            // qui sait quelle publication elle repartage
            // (`.repost(ofPostId:sourceFormat:)`), et le poser aussi dans la
            // graine aurait fait deux sources pour un même fait. `audioUrl`,
            // lui, vient de la graine — c'est une matière de la SOURCE, pas son
            // identité.
            return ComposerDocumentDraft.mood(
                emoji: moodEmoji,
                text: documentText,
                visibility: composerVisibility,
                visibilityUserIds: composerVisibilityUserIds,
                references: composerReferences,
                repostOfId: intent.origin.repostedPostId,
                audioUrl: moodSeed?.audioUrl
            )
        case .document:
            // L'audience est celle du SOCLE, jamais la graine de la porte.
            // `initialVisibility` la fournissait tant qu'`audienceChip` était un
            // témoin ; le lire encore ferait publier sous un réglage que
            // l'auteur vient de changer, en silence. Il ne reste qu'un lecteur :
            // l'atelier, à qui le SDK l'imposerait par défaut sans lui.
            //
            // `repostOfId` vient de la PORTE, exactement comme sous le mood —
            // et c'est ce qui fait de la bascule Mood → Post un ANCRAGE plutôt
            // qu'un post ordinaire. Le lire ailleurs (la graine, un drapeau du
            // site de montage) en ferait une seconde source pour « quelle
            // publication republie-t-on », alors que la porte le sait.
            //
            // `originalLanguage` vient du SOCLE (`documentLanguage`, T2.2) et
            // non plus d'un littéral `nil` : c'est la capsule qui l'écrit, la
            // porte qui la poste telle quelle.
            //
            // `forcePlainPost` vaut TOUJOURS `true` ici (B3, #3926) : la surface
            // document ne publie plus qu'un POST simple — ses médias qualifiants
            // forment un carrousel, jamais un réel promu en silence. RÉEL et
            // STORY quittent le document par l'éventail (routage → scène) et
            // partent par l'atelier avec leur propre `postType`. Ce publieur
            // n'est d'ailleurs atteint que lorsque `mountedSurface == .document`,
            // c'est-à-dire `selectedFormat == .post` : le forçage y est vrai par
            // construction, on le pose en clair pour que la loi se lise.
            //
            // `location` vient du SOCLE (`documentLocation`, T2.5, écrit par
            // `LocationPickerView`) — jamais d'un littéral `nil` : un littéral
            // jetterait le lieu que l'auteur vient de choisir.
            //
            // `discoverabilityPrecision` est le SECOND opt-in, gardé par
            // `documentOffersNearbyDiscoverability` — la MÊME garde que celle
            // qui peint le contrôle (`FeedNearbyDiscoverability.offers(`),
            // jamais recopiée : un contrôle absent de l'écran ne doit jamais
            // pouvoir peser sur ce qui part. Hors de cette garde, ou tant que
            // l'auteur n'a rien activé, `precisionToSend` vaut déjà `nil`
            // (`NearbyDiscoverabilityChoice`, off par défaut).
            //
            // `mobileTranscription` vient du SOCLE (`documentTranscription`,
            // T2.6, écrit par `AudioPostComposerView` au retour du sixième
            // outil) — jamais d'un littéral `nil` : un littéral ferait perdre
            // la transcription faite SUR L'APPAREIL, et le serveur
            // re-transcrirait ce travail en silence.
            return ComposerDocumentDraft.document(
                format: selectedFormat,
                forcePlainPost: true,
                text: documentText,
                visibility: composerVisibility,
                visibilityUserIds: composerVisibilityUserIds,
                repostOfId: intent.origin.repostedPostId,
                localMedia: documentLocalMedia,
                location: documentLocation,
                discoverabilityPrecision: documentOffersNearbyDiscoverability
                    ? documentDiscoverability.precisionToSend
                    : nil,
                originalLanguage: documentLanguage,
                mobileTranscription: documentTranscription,
                // Les personnes nommées par la feuille de l'outil `@`. Sans ce
                // passage, la feuille aurait laissé choisir des gens et un mode
                // puis le brouillon serait parti avec `mentions: nil` : un geste
                // complet pour une conséquence nulle.
                references: composerReferences
            )
        }
    }

    /// Le meuble TRANSMET : il ne connaît ni service, ni file, ni endpoint.
    ///
    /// Il referme le composer sur une ACCEPTATION et le laisse ouvert sur un
    /// refus. Fermer sur un `false` jetterait ce que l'auteur vient d'écrire, et
    /// c'est le seul geste de cette méthode qu'aucune garde de source ne pourrait
    /// rattraper — un composer refermé sur un envoi perdu reste PLAUSIBLE : il se
    /// ferme exactement comme quand tout va bien.
    ///
    /// **Un refus EXISTE depuis le lot 4.10, et il faut lire lequel au mot près.**
    /// Le `Bool` de `onPublishDocument` a été documenté comme une ACCEPTATION
    /// pendant deux lots sans qu'aucun écrivain n'émette jamais `false` : un
    /// commentaire qui annonce ce que le code ne tient pas devient la loi que
    /// lira la session suivante. Ce n'est plus le cas —
    /// `DocumentComposerDoor.publish` en émet trois : un plan qui refuse (format
    /// non-post, brouillon sans matière, chemin non durable), un publieur qui
    /// refuse la ligne, un publieur MUET. La branche du refus est donc
    /// atteignable, et `test_lEnvoiDuSocle_neFermeQueSurUneAcceptation_etNeJettePasLaSaisie`
    /// la garde.
    ///
    /// **`MoodComposerDoor` en émet sur UNE de ses deux branches**, et il faut
    /// lire laquelle : son ANCRAGE remonte le refus (`anchorStatusAsPost` rend
    /// un `Bool` — 403 `REPOST_AUDIENCE_WIDENING`, coupure, hors-ligne), son
    /// MIROIR se tait. `StatusViewModel.setStatus` ne rend rien — elle avale
    /// l'erreur réseau dans un `catch` qui se contente d'un toast —, et sa file
    /// durable n'est atteinte que si `isOffline()` répond oui. Un gateway qui
    /// répond 500 referme donc le composer sur cette branche-là et perd l'emoji,
    /// la phrase, l'audience et les mentions. **Dette CONSIGNÉE, condition de
    /// levée nommée** : que `setStatus` rende un résultat, comme `createPost` le
    /// fait déjà par `publishSuccess` / `publishError`.
    private func publishDocument() {
        guard canPublishDocument, let draft = documentDraft else { return }
        // Le palier RETENU pour la PROCHAINE publication est écrit ICI, au
        // moment où il SERT — même geste que
        // `FeedView+Attachments.publishPostWithAttachments`
        // (`FeedNearbyDiscoverability.remember(nearbyDiscoverability)`) : la
        // spec parle du dernier choix « utilisé », pas du dernier survolé.
        if documentOffersNearbyDiscoverability {
            FeedNearbyDiscoverability.remember(documentDiscoverability)
        }
        isPublishingDocument = true
        Task {
            let accepted = await onPublishDocument(draft)
            isPublishingDocument = false
            if accepted { onDismiss() }
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
    /// gate, sur les neuf portes — `ComposerIntentTests` le prouve porte par
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
