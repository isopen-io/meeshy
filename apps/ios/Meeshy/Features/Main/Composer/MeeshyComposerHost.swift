import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// ⚠️ `MeeshyComposerHost` est découpé en QUATRE fichiers (#4102, budget 800–1100
// lignes du CLAUDE.md § Code Style). Le découpage suit une RESPONSABILITÉ :
//
// | fichier | ce qu'il porte |
// |---|---|
// | `MeeshyComposerHost.swift` | le type : ses entrées, son état, ses règles lues, son `body` |
// | `MeeshyComposerHost+Surfaces.swift` | ce que le meuble MONTE — les trois surfaces et leurs accessoires |
// | `MeeshyComposerHost+Intake.swift` | ce qui fait ENTRER de la matière — portes, feuilles, relais d'outils |
// | `MeeshyComposerHost+Socle.swift` | le chrome de PUBLICATION — audience, œil, flèche, brouillon |
//
// Les membres de ces extensions ne sont plus `private` : Swift ne rend un
// `private` visible qu'aux extensions du MÊME fichier. C'est le patron que
// `StoryComposerView` suit déjà dans le SDK (`+TopBar`, `+Canvas`,
// `+Publication`). La contrepartie est portée par les gardes de source, dont
// l'adresse est désormais l'UNITÉ (`AppSourceGuard.unit`) et non un fichier :
// sans cela, chaque découpage éteindrait en silence toutes les gardes NÉGATIVES
// du type — elles passeraient au vert en lisant la moitié qui ne contient pas
// l'interdit.

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
    @StateObject var viewModel: StoryComposerViewModel

    /// O6 — la teinte du plateau est un réglage PERSISTÉ, propre à l'auteur.
    /// Stockée par son `rawValue` : `@AppStorage` ne sait pas porter l'enum, et
    /// c'est aussi ce qui rend le repli sur valeur inconnue explicite.
    @AppStorage("composer.plateau.tint") var storedTint: String = PlateauTint.defaultTint.rawValue

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
    @State var currentFormat: ComposerFormat

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
    @Environment(\.dynamicTypeSize) var dynamicTypeSize

    @State var documentText = ""

    /// L'emoji du mood — la seule matière SANS laquelle un mood ne part pas
    /// (`ComposerMoodPolicy.canPublish`). Il vit ici pour la même raison que
    /// `documentText` : le publieur est le socle, pas la surface.
    @State var moodEmoji: String?

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
    @State var composerVisibility: PostVisibility
    @State var composerVisibilityUserIds: [String] = []

    /// La mémoire d'audience du format POST (loi 10) — celle qu'écrit le
    /// sélecteur du socle, seul contrôle d'audience de la surface document. La
    /// mémoire du format status, elle, vit dans `ComposerMoodSurface`, avec le
    /// ruban qui l'écrit. Les deux ne se croisent jamais : un `ONLY` posé sur un
    /// mood ne doit pas rétrécir le post écrit ensuite.
    @AppStorage(ComposerAudienceMemory.postKey)
    var lastDocumentVisibility: String = PostVisibility.public.rawValue

    /// Le mode dont le sélecteur nominatif est ouvert. `nil` = fermé — la même
    /// forme que les cinq autres écrans qui montent `AudienceUserPickerView`.
    @State var audiencePickerMode: PostVisibility?

    /// **Le sélecteur de personnes demandé DEPUIS la feuille d'audience**
    /// (#4636). Même mécanisme que `pendingFileImport`, et pour la même raison :
    /// le picker est monté sous la feuille, donc il ne peut pas s'ouvrir tant
    /// qu'elle occupe le présentateur. Sans cette intention, choisir
    /// « Seulement… » dans la feuille n'ouvrirait RIEN — le défaut exact que
    /// #4632 vient de fermer sur la porte du son.
    @State var pendingAudiencePicker: PostVisibility?

    /// Les tendances SUGGÉRÉES au sélecteur de hashtags. Vide est un état
    /// nominal (hors-ligne, aucune tendance) : le champ de saisie suffit, donc
    /// rien n'attend ce chargement.
    @State var trendingHashtags: [APIHashtag] = []

    /// **L'objet OUVERT dans l'éditeur plein écran** (#4634). Distinct de
    /// `selectedSceneItemId`, qui répond à une autre question : celui-là est
    /// SÉLECTIONNÉ sur la scène, celui-ci est en cours d'ÉDITION.
    @State var editedObject: ComposerEditedObject?

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
    @State var composerReferences: [ComposerReference] = []


    /// L'envoi EN VOL du socle. Il ferme le gate le temps de l'aller-retour :
    /// sans lui, un double tap sur la flèche produirait deux publications, ce
    /// que l'écran historique du mood évitait par le même drapeau.
    @State var isPublishingDocument = false

    /// Le sélecteur d'emoji de la rangée d'outils est-il ouvert ? Il vit dans le
    /// MEUBLE et non dans la surface, pour la même raison que `documentText` :
    /// c'est le meuble qui possède le texte où l'emoji atterrit, et une surface
    /// qui porterait le sélecteur devrait posséder sa destination — donc cesser
    /// d'être la simple présentation qu'elle est.
    /// **La porte STICKER de la scène** — distincte du sélecteur d'emoji juste
    /// au-dessus, et la distinction est celle du NIVEAU du modèle : l'emoji
    /// s'insère dans le TEXTE du document, le sticker POSE un objet sur la
    /// scène. Même patron de présentation, deux gestes qui ne se remplacent
    /// pas.
    /// **Le choix de la SOURCE, quand la porte média en offre plusieurs.**
    /// La rangée du document a trois entrées distinctes (Photos · Caméra ·
    /// Fichier) ; le rail n'a qu'une porte, donc le choix se fait ici — sans
    /// quoi deux des trois sources disparaissent dès qu'une scène existe.
    /// **Le choix de la PROVENANCE d'un son.** Emprunter à l'étagère et
    /// enregistrer un vocal ne posent pas le même objet — le premier devient le
    /// fond de la scène, le second jamais — donc la porte demande, elle ne
    /// devine pas.
    /// **Le rôle choisi pour le son que la feuille va poser (#4483).** `nil` =
    /// « l'auteur n'a rien dit » — la règle automatique s'applique alors mot
    /// pour mot, et c'est ce qui garantit qu'aucun geste existant ne change.
    @State var chosenSoundRole: ComposerAudioRole?
    /// **Le placement choisi dans la feuille de création audio** (#4657).
    ///
    /// NON optionnel, contrairement à `chosenSoundRole` : la feuille l'affiche
    /// toujours, donc il y a toujours une valeur montrée. Ce sont les deux
    /// ENTRÉES qui le posent — « Vocal » ⇒ premier plan, « Ajouter un son » ⇒
    /// fond — et l'auteur en change dans la feuille. Un défaut arbitraire ici
    /// contredirait le bouton qu'il vient de presser.
    @State var chosenSoundPlacement: ComposerAudioRole = .background

    /// **Le son que la feuille rouvre pour l'ÉDITER** (directive porteur
    /// 2026-09-01). `nil` ⇒ la feuille s'ouvre vierge, sur l'enregistreur ;
    /// posé ⇒ elle s'ouvre sur ce son, prêt à être rogné, re-transcrit ou
    /// replacé. C'est ce champ qui distingue « ajouter » de « modifier », et
    /// c'est aussi lui qui dit à `applyCreatedAudio` quelle entrée REMPLACER —
    /// sans quoi éditer un son en aurait posé un second à côté du premier.
    @State var editedForegroundSound: ComposerForegroundSound?

    /// **Le son de FOND que la feuille rouvre** (#4668) — l'identifiant de
    /// l'objet de scène, pas le son lui-même.
    ///
    /// Un identifiant plutôt qu'une copie parce que c'est lui qu'il faudra
    /// SUPPRIMER au retour : une copie prise à l'ouverture désignerait un objet
    /// que le canvas a pu déplacer, renommer ou ré-empiler entre-temps, et le
    /// remplacement viserait à côté.
    ///
    /// Les deux champs sont exclusifs — on n'édite qu'un son à la fois — et
    /// chaque entrée efface l'autre. Un type somme les rendrait exclusifs par
    /// construction ; il coûterait ici plus cher qu'il ne rapporte, les deux
    /// n'étant lus qu'en un seul endroit (`editedSoundTrack`).
    @State var editedBackgroundSoundId: String?

    /// **L'IDENTITÉ de la feuille « Création audio »** (#4684).
    ///
    /// `.sheet(item: $presentedPortal)` reconstruit son contenu quand l'ITEM
    /// change. Deux ouvertures successives portent la même valeur — `.sound` —
    /// donc SwiftUI est en droit de RÉUTILISER la vue, et avec elle tout son
    /// `@State` : la piste enregistrée, la phase, le son emprunté. Une feuille
    /// périmée se re-présente alors sur un son qu'elle n'édite pas.
    ///
    /// Observé une fois à la vérification simulateur du 2026-09-01, et
    /// destructeur : rouvrir un son de FOND montrait le commutateur sur
    /// « Contenu de publication », et valider déplaçait le son sans rien dire.
    /// L'indice qui l'a nommé est visuel — la feuille rendait la carte
    /// d'APRÈS-ENREGISTREMENT au lieu de celle de réouverture.
    ///
    /// Un identifiant neuf par ouverture rend la réutilisation impossible :
    /// c'est une garantie de STRUCTURE, là où « n'oublie pas de remettre l'état
    /// à zéro » est une consigne que le prochain site d'appel ne lira pas.
    /// **La pastille audio du CANVAS qu'on rouvre** (#4671).
    ///
    /// Un troisième contexte d'édition, et il fallait le distinguer des deux
    /// autres : une pastille posée sur la scène n'est ni le fond de la slide ni
    /// une pièce jointe du post. Le commutateur de placement n'a que ces deux
    /// moitiés — l'offrir ici laisserait l'auteur DÉPLACER son objet en croyant
    /// le rogner, et sans troisième valeur il ne pourrait jamais le remettre.
    /// La feuille s'ouvre donc SANS commutateur, et le résultat remplace la
    /// pastille à sa place.
    @State var editedSceneChipId: String?

    @State var soundSheetSession = UUID()


    @State var showsMediaSourceChooser = false



    /// **La langue DÉCLARÉE du document (T2.2).** Semée sur
    /// `DefaultComposerLanguage.resolve()` — le point de DÉPART du brouillon
    /// que T2.1 posait déjà, et qui RESTE la constante « fr » — mais désormais
    /// ÉCRITE par l'auteur via `documentLanguageCapsule` plutôt que rappelée
    /// telle quelle à l'envoi. C'est le canal qui manquait à la porte : sans
    /// lui, un « Hello everyone » composé ici partait étiqueté français, et le
    /// Prisme le traduisait FR→EN sur un texte déjà anglais, sans que l'auteur
    /// ait aucun moyen de corriger.
    @State var documentLanguage = DefaultComposerLanguage.resolve()


    /// **L'ingestion de fichiers LOCAUX (T2.3).** Trois sélecteurs, un état
    /// par famille — même patron que `showsEmojiPicker` /
    /// `showsDocumentLanguagePicker` juste au-dessus : l'ingestion vit dans le
    /// MEUBLE, jamais dans la surface. `ComposerDocumentSurface` reste sans
    /// état — elle ne monte NI `photosPicker` NI `fileImporter` NI
    /// `CameraView` (`ComposerDocumentSurfaceTests`
    /// `.test_laSurface_neFabriquePasUnSecondPipelineDIngestion`, élargie à la
    /// caméra par ce lot).
    /// **UNE feuille à la fois, et le type l'impose** (#4467).
    ///
    /// Huit booléens vécurent ici, chacun avec son `.sheet(isPresented:)`.
    /// SwiftUI n'en supporte qu'une par vue : dès que deux passaient à `true`
    /// dans la même transaction, il levait « only presenting a single sheet is
    /// supported » et **terminait le process**. Trois terminaisons mesurées au
    /// simulateur le 2026-08-30, sur trois points d'interaction différents.
    ///
    /// L'inventaire des portails (#4120) garantissait que chaque booléen est
    /// LU ; il ne pouvait pas garantir qu'un seul l'est à la fois — une règle de
    /// placement ne dit rien du nombre. Le type somme, lui, rend l'état invalide
    /// IRREPRÉSENTABLE : une variable ne porte qu'une valeur, et ouvrir un
    /// portail ferme le précédent au lieu de l'empiler.
    /// **Les mentions du texte de SCÈNE** (#4475).
    ///
    /// La bande existait sur deux champs de saisie sur trois — la description
    /// et le texte du document. Taper `@arto` dans un objet texte posé sur la
    /// scène écrivait littéralement « @arto » : aucune liste, aucun lien,
    /// aucune notification. Une affordance qui RESSEMBLE à une mention sans en
    /// être une est pire qu'une absence — c'est la loi 4 vue depuis le LECTEUR.
    ///
    /// Rien n'a été ajouté au canvas UIKit pour l'obtenir : `onInlineTextChanged`
    /// remonte déjà le texte à chaque frappe, et c'est tout ce qu'une requête
    /// `@` demande. Le canvas n'a aucune raison de connaître les amis de
    /// l'auteur.
    @StateObject var sceneMentionBox = ComposerMentionControllerBox()

    @State var presentedPortal: ComposerPortal?

    /// **Ce que le RAIL a posé** (directive porteur 2026-08-30).
    ///
    /// > « Les images canoniques de gauche permettent d'ajouter des éléments à
    /// > l'actuelle scène, en ADDITIF. […] `[+]` est maintenant réservé à créer
    /// > une slide. »
    ///
    /// En Post, `syncPostMediaIntoSlides` donne à chaque média SA slide — c'est
    /// la doctrine de la vue `1g` (« en Post, une slide est UN média »), et elle
    /// vaut pour la rangée du document. Elle ne vaut PAS pour le rail : depuis
    /// que `[+]` existe, créer une page est un geste EXPLICITE, et une porte qui
    /// en crée une au passage surprend.
    ///
    /// Ce jeu d'URL est ce qui distingue les deux origines. Sans lui, il
    /// faudrait un second chemin d'ingestion — et deux chemins pour un seul
    /// média divergeraient au premier champ ajouté.
    /// La prochaine ingestion vient-elle du RAIL ? Posé par la porte, consommé
    /// par l'ingestion — il vaut pour UNE pose, jamais pour un état durable :
    /// un drapeau qui resterait vrai ferait poser sur la scène courante le
    /// média suivant, même arrivé par la rangée du document.
    @State var railPosesNextMedia = false

    @State var railPosedMediaURLs: Set<URL> = []

    @State var showsPhotoPicker = false
    @State var pickedPhotoLibraryItems: [PhotosPickerItem] = []
    @State var showsFileImporter = false

    /// **Ce que l'importateur ouvert va rapporter** (#4632). Le meuble n'a qu'UN
    /// `.fileImporter` — deux sélecteurs frères rejoueraient le conflit de
    /// présentation que `ComposerSoundHandoff` documente. C'est donc l'intention
    /// qui change, jamais le sélecteur : son filtre de types ET la destination
    /// du résultat en découlent.
    @State var fileImportIntent: ComposerFileImportIntent = .media

    /// **L'import demandé PENDANT qu'une feuille est montée.**
    ///
    /// Un sélecteur système ne peut pas paraître tant qu'un portail occupe le
    /// présentateur. L'intention est donc retenue ici, le portail fermé, et
    /// l'importateur ouvert à la fermeture EFFECTIVE (`onDismiss`) — jamais dans
    /// la même transaction, où iOS l'ignorerait en silence.
    @State var pendingFileImport = false


    /// Les pièces jointes LOCALES composées jusqu'ici. `documentDraft` les
    /// transmet désormais sous `.document` — `ComposerDocumentDraft.localMedia`
    /// ne repartait qu'à `[]` avant ce lot.
    @State var documentLocalMedia: [ComposerDocumentMedia] = []

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
    @State var slideIdByMediaURL: [URL: String] = [:]

    /// **Le RÔLE de chaque média posé — fond ou premier plan** (#4724).
    ///
    /// Sa jumelle `slideIdByMediaURL` ci-dessus ne connaît que les FONDS : c'est
    /// sa définition, et c'est ce qui en fait la liste des tuiles. Il fallait
    /// donc une seconde mémoire pour les autres, et elle porte deux charges à la
    /// fois : dire ce qu'un média est devenu, et servir de garde d'idempotence
    /// (« ce média a DÉJÀ été posé ») — rôle que l'index des fondations tenait
    /// avant ce lot, et qu'il ne peut plus tenir depuis qu'un média peut être
    /// posé sans rien fonder.
    @State var mediaRoleByURL: [URL: ComposerMediaRole] = [:]

    /// **F2 (#3885) — la couleur de FOND choisie sur le document.** `nil` = pas
    /// de fond, la surface reste plate. La couleur est semée dans l'atelier
    /// (`viewModel.applyBackground(hex:)`) pour que la scène l'affiche une fois
    /// montée — mais depuis #3939 (retour porteur 2026-08-27), choisir un fond
    /// ne fait plus NAÎTRE la scène plein écran toute seule (voir
    /// `mountedSurface`) : cette valeur reste posée en attendant l'incrustation
    /// du canvas DANS l'écran document, restant à livrer.
    @State var documentBackground: String?

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
    @State var selectedSceneItemKind: StoryCanvasUIView.CanvasItemKind?
    /// **L'ID de l'objet sélectionné** — le relais le portait et l'hôte le
    /// JETAIT (`{ _, kind in … }`). Le kind suffisait à l'inspecteur, qui ne
    /// sert qu'un contrôle par famille ; le rail *trailing* offre des actions
    /// qui dépendent de CET objet — verrouillé ? au fond ? seul de son plan ? —
    /// et aucune ne se répond sans son id.
    @State var selectedSceneItemId: String?

    /// **La bande contextuelle DEMANDÉE sur la surface de scène (#4064).**
    ///
    /// Ce n'est pas ce qui s'affiche : `ComposerSceneBand.opened` tranche, et
    /// refuse une bande qui n'est pas SERVIE. Garder la demande et le service
    /// séparés est ce qui empêche une bande vide d'occuper les ≈ 170 pt que
    /// l'encastrement vient de libérer.
    @State var requestedSceneBand: ComposerSceneBand?

    /// **La durée du fichier source, MESURÉE, par objet (#4082).**
    ///
    /// Le modèle ne la porte pas de façon fiable : une vidéo a
    /// `intrinsicDuration`, un son n'a que `duration` — et celle-ci DEVIENT la
    /// durée de la fenêtre au premier rognage. Rouvrir la bande sur cette
    /// valeur montrerait une source rétrécie à chaque passage, et la queue
    /// coupée deviendrait irrécupérable : un rognage qui ne se défait pas n'est
    /// pas un rognage. Seul le fichier dit la vérité, et il faut la lui demander.
    @State var trimSourceDurations: [String: Double] = [:]

    /// **La couche d'écriture de la description, par-dessus l'atelier** (#4124).
    /// `false` ⇒ rien n'est monté : la scène occupe tout ce que le chrome lui
    /// laisse, et le bas ne porte plus de champ permanent.
    @State var editsSceneDescription = false

    /// La hauteur RENDUE de la zone de saisie (#4361) — déclarée à l'atelier en
    /// réserve basse pour que le canvas se rétracte AU-DESSUS d'elle au lieu
    /// d'être recouvert.
    @State var sceneDescriptionEditorHeight: CGFloat = 0

    /// **La télécommande de publication de l'atelier** (#4135).
    ///
    /// `@StateObject` et non `@State` : le meuble doit se re-rendre quand
    /// l'atelier RAPPORTE sa matière (`canPublish`) ou arme son œil, sinon la
    /// flèche du socle resterait grise sur une composition devenue publiable —
    /// une commande qui ment sur son propre état.
    ///
    /// Elle est CONSTRUITE ici et pressée ici ; c'est l'atelier qui l'arme avec
    /// `publishAllSlides` et `presentPreview`. Le meuble ne recompose rien : ni
    /// le rabattement des effets du canvas, ni la langue, ni les médias
    /// préchargés — trois choses qu'il ne voit pas.
    @StateObject var publishTrigger = ComposerPublishTrigger()

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
    @State var documentLocation: SharedPlace?

    /// **T2.5 — le SECOND opt-in**, indépendant du lieu lui-même : « rendre ce
    /// contenu trouvable à proximité ». `.disabled` est l'état INERTE — off,
    /// aucun palier offert — et c'est la valeur de départ obligée : rien n'a
    /// encore été choisi tant qu'aucun lieu n'existe. Un lieu CHOISI la
    /// remplace par `FeedNearbyDiscoverability.choiceForNewPlace()`, qui lit la
    /// mémoire locale (`LocationSharingPreferencesStore`) — jamais l'inverse :
    /// pré-sélectionner avant le premier lieu offrirait un sélecteur de grain
    /// sans lieu à indexer.
    @State var documentDiscoverability: NearbyDiscoverabilityChoice = .disabled


    /// **T2.6 — la transcription du vocal composé par `AudioPostComposerView`.**
    /// Voyage À CÔTÉ de `documentLocalMedia` (l'enregistrement, posé comme un
    /// `ComposerDocumentMedia` ordinaire au retour) — jamais fondue dedans.
    /// `documentDraft` la transmet telle quelle à
    /// `ComposerDocumentDraft.document(mobileTranscription:)`, et
    /// `PublishIntent.document(transcription:)` l'élit en aval pour la LANGUE :
    /// la langue PARLÉE gagne sur `documentLanguage`, jamais l'inverse — la
    /// régression que 7.4b avait fermée sur `PublishIntent.audioRecording`.
    /// **Une transcription PAR FICHIER** (#4672).
    ///
    /// C'était UNE valeur, écrasée à chaque retour de la feuille. Avec deux
    /// vocaux, la seconde effaçait la première : une seule carte s'affichait,
    /// et le premier son partait quand même à la publication, muet et
    /// invisible. La clé est l'URL du fichier — le seul handle que
    /// `documentLocalMedia` et la feuille partagent.
    @State var documentTranscriptions: [URL: MobileTranscriptionPayload] = [:]

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
        // **La PORTE peut porter le brouillon** (#4611). `draftId` était le
        // seul chemin d'adoption, et `ComposerOrigin.draft(id:)` transportait à
        // côté un identifiant que personne ne lisait — deux moitiés d'une même
        // intention, jamais reliées. Le paramètre garde la priorité : un
        // appelant qui le passe EXPLICITEMENT sait ce qu'il fait, là où la
        // graine de la porte est un défaut.
        let repris = draftId ?? intent.origin.resumedDraftId
        self.draftId = repris
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
        if let repris { composer.adoptDraft(id: repris) }
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
        // #4135 — le second rang N'EST PAS décoratif. Story et Réel n'ont pas de
        // clé de mémoire (délibérément : leur graine vient de la porte), et
        // depuis que le socle peint l'audience SERVIE sous la scène, retomber
        // sur `.public` publierait sous une audience que l'auteur n'a pas
        // choisie. La règle porte l'ordre ; ce site ne fait que lui donner ses
        // deux sources.
        _composerVisibility = State(initialValue: ComposerAudienceMemory.seed(
            rememberedRaw: ComposerAudienceMemory.key(for: ouverture)
                .flatMap { UserDefaults.standard.string(forKey: $0) },
            doorRaw: initialVisibility
        ))
    }

    var tint: PlateauTint {
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
    var reelGate: Bool {
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
    func handleSceneBackgroundTap() {
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
    var moodGate: Bool {
        ComposerMoodGate.compositionQualifiesAsMood(
            text: documentText,
            hasMedia: !documentLocalMedia.isEmpty,
            hasScene: documentHasScene,
            moodEmoji: moodEmoji
        )
    }

    var profile: ComposerProfile {
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
    var selectedFormat: ComposerFormat {
        ComposerFormatFanPolicy.resolvedSelection(
            current: currentFormat,
            offeredFormats: profile.offeredFormats
        )
    }

    /// Ce que l'éventail écrit. La LECTURE passe par la règle de repli, sinon
    /// un éventail dont l'offre vient de se refermer ne marquerait plus aucun
    /// chip ; l'ÉCRITURE va droit au champ, parce qu'un tap ne vise jamais
    /// qu'un format offert.
    var formatSelection: Binding<ComposerFormat> {
        Binding(get: { self.selectedFormat }, set: { self.currentFormat = $0 })
    }

    /// La surface MONTÉE — l'unique lecture de la règle de routage dans ce
    /// fichier. Le corps la consomme pour choisir sa vue, le chrome pour savoir
    /// qui peint la publication, le gate pour savoir ce qui fait matière. Trois
    /// lectures de la même expression auraient été trois occasions de diverger.
    var mountedSurface: ComposerSurfaceKind {
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
    var chromeOwner: ComposerChromeOwner {
        ComposerChromeOwnership.owner(for: mountedSurface)
    }

    /// Les zones que le socle peint sous la surface montée. Une RÈGLE, jamais un
    /// `if` écrit dans le corps : une condition posée dans un `body` est
    /// invisible aux tests, et c'est ainsi qu'une règle produit se met à exister
    /// en deux exemplaires.
    var paintedSocleZones: [ComposerTopBarControl] {
        ComposerChromeOwnership.socleZones(
            for: mountedSurface,
            // L'œil n'a d'objet que s'il y a une scène à montrer — c'est la
            // condition que le doc-comment de `socleZones` avait écrite en
            // 2026-08-24 comme prix de son retour, et elle se vérifie ICI,
            // jamais dans le corps du socle.
            documentHasScene: documentHasScene,
            // Sous la SCÈNE, l'œil n'existe que si l'atelier l'a armé (#4135).
            atelierOffersPreview: publishTrigger.offersPreview
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
    var mountsFormatFan: Bool {
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
    var paintsFormatFan: Bool {
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
    var offeredAudiences: [PostVisibility] {
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
            // **La description a quitté le bas au #4124.** Elle y vivait en
            // permanence — d'abord une barre à chevron, puis le calque de
            // lecture — et prenait la place que la scène CENTRÉE réclame, pour
            // un texte que l'auteur ne regarde pas la plupart du temps. Elle
            // s'ouvre désormais par l'icône de la rangée haute, par-dessus tout
            // (`sceneDescriptionLayer`), et n'occupe l'écran que quand on
            // l'écrit.
            // `assembles(.publish)` dit que l'ATELIER peint la flèche. Le socle
            // peint donc les MÊMES trois zones seulement quand l'atelier les a
            // cédées : deux barres de publication, dont une inerte, seraient
            // une régression sèche sur la surface de création la plus utilisée.
            //
            // `!paintedSocleZones.isEmpty` s'y ajoute depuis le 2026-08-28 : le
            // mood a cédé sa SEULE zone (`.publish`) à son propre en-tête
            // (`ComposerMoodSurface.header`), et sans cette garde le socle se
            // peindrait quand même — une `HStack` vide, juste un `Spacer` sous
            // un padding, l'espace exact que la consolidation vise à rendre.
            if !chromeOwner.assembles(.publish) && !paintedSocleZones.isEmpty {
                socle
            }
        }
        .background(tint.color.ignoresSafeArea())
        // **La couche d'écriture, AU-DESSUS de tout** (#4124). En overlay du
        // meuble et non en `.sheet` : une feuille système laisse voir la scène
        // NETTE derrière son bord arrondi et impose sa propre poignée, alors que
        // la directive demande la scène FLOUTÉE et un « Terminé » au-dessus du
        // clavier — deux choses qu'une feuille ne sait pas faire ensemble.
        // **La saisie s'ancre en BAS, la scène monte au-dessus** (#4361). Elle
        // fut une couche plein écran voilant la scène ; écrire une description,
        // c'est regarder la scène qu'on décrit, et le voile la retirait au
        // moment précis où elle sert. La remontée passe par
        // `storyComposerCanvasBottomReservation`, posée sur `composerSurface` —
        // la MÊME mécanique que celle d'une band qui s'ouvre, jamais une
        // seconde.
        .overlay(alignment: .bottom) {
            if editsSceneDescription { sceneDescriptionEditor }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.9), value: editsSceneDescription)
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
        .adaptiveOnChange(of: selectedFormat, initial: true) { _, _ in
            syncPostMediaIntoSlides()
            // La première unité d'histoire naît AVEC le format, jamais au
            // premier geste : le canvas d'une story se montre vide, et un rail
            // sans aucune unité n'aurait pas de voisine à côté de qui poser la
            // suivante. `initial: true` couvre les portes qui ouvrent DÉJÀ en
            // story (reprise d'un brouillon de story, tiroir des stories).
            seedStoryCanvasIfNeeded()
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
    func adoptMoodSeed(_ graine: ComposerMoodSeed?) {
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

    /// **La vue réellement MONTÉE** — et c'est elle, jamais le kind de surface,
    /// qui répond à « y a-t-il une scène à l'écran ? ».
    ///
    /// Elle était calculée en ligne dans l'aiguillage. Un second site en a eu
    /// besoin — l'historique (#4402) — et a interrogé `mountedSurface` à la
    /// place : ça compilait, et ça ne pouvait jamais rendre vrai, la scène
    /// incrustée étant un `.document` QUI A une scène. Une valeur lue à un seul
    /// endroit ne peut pas être lue de travers ailleurs.
    var mountedComposerView: ComposerMountedView {
        ComposerMountedView.mounted(
            surface: mountedSurface,
            // **Une story a toujours son canvas** (directive porteur
            // 2026-09-01). `documentHasScene` demande « y a-t-il de la matière
            // à cadrer ? », la bonne question pour un post dont la scène est
            // une incrustation optionnelle. Une story EST ses canvas : lui
            // poser le prédicat du post la laisserait sur l'écran document tant
            // qu'elle est vide — au moment précis où elle en a besoin.
            //
            // La substitution se fait ICI et pas dans `documentHasScene`, dont
            // le MOOD est l'autre lecteur : y injecter le format ferait décider
            // l'offre de formats par le format déjà choisi.
            hasScene: ComposerStoryCanvas.showsCanvas(
                format: selectedFormat,
                documentHasScene: documentHasScene
            )
        )
    }

    @ViewBuilder
    var surface: some View {
        switch mountedComposerView {
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

}
