import SwiftUI
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

/// **Le meuble** du composer unifié (C2) — plateau, scène, socle permanent.
///
/// Ce que ce type est, et surtout ce qu'il n'est PAS :
///
/// - il **enveloppe** l'atelier de composition du SDK (`StoryComposerView`), il
///   ne le réécrit pas. L'atelier porte des milliers de lignes éprouvées ; en
///   refaire une version app-side ferait diverger deux surfaces sans qu'aucun
///   test ne le dise ;
/// - il **ne construit aucun aperçu**. Loi 6 de la doctrine — « le lecteur EST
///   l'aperçu » : composer et viewers partagent un seul registre de rendu, et
///   l'œil du socle monte `MeeshyScenePlayer(mode: .preview)`. Un quatrième
///   chemin d'aperçu casserait le WYSIWYG par construction ;
/// - il **ne décide de rien** : ce qu'il montre est fonction du
///   `ComposerProfile` que `ComposerIntent` lui donne (C1). Le host lit la
///   table, il ne la double pas ;
/// - il **n'ouvre aucun chemin de publication**. L'unique publieur est la barre
///   du SDK (`StoryComposerView+TopBar.publishButton` → `publishAllSlides()`),
///   qui rabat les effets du canvas sur la diapositive courante avant de
///   rendre la main. Un second chemin app-side publierait un document que
///   personne n'a rabattu.
///
/// **Le socle ne bouge jamais** (loi 5 de la doctrine P1). Ses trois zones —
/// audience, œil, publication — sont toujours présentes, dans cet ordre, quelle
/// que soit la porte d'entrée. C'est le point fixe qui fait qu'un composer reste
/// le même objet vu de neuf endroits différents. `MeeshyComposerHostGuardTests`
/// le verrouille par garde de source, faute d'une sortie observable.
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
/// **Ce que ce déménagement NE règle PAS** : `status.composer.publish` reste
/// lue par `StatusComposerView` SEULE. Le socle garde `composer.socle.publish`,
/// qui n'est pas la même phrase — « Publish » contre « Post » en anglais — et
/// fondre les deux serait une édition de catalogue que ce lot ne possède pas. Au
/// retrait, c'est donc cette clé-là, et elle seule, qu'il faudra décider de
/// garder ou de retirer.
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
    /// au catalogue (sept locales, cliquet français à zéro tolérance), et aucune
    /// porte de production ne monte le document. Une phrase juste pour lui
    /// s'écrira le jour où une porte l'atteindra.
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
    /// **Ce que ce canal NE tient PAS aujourd'hui, et il faut le lire au mot
    /// près.** Le MÉCANISME du refus existe ; l'ÉCHEC D'ENVOI ne l'emprunte
    /// pas. Aucun écrivain ne rend `false` sur une erreur réseau :
    /// `MoodComposerDoor.publish` rend `true` inconditionnellement après son
    /// `await`, parce que `StatusViewModel.setStatus` ne rend rien — elle avale
    /// l'erreur dans un `catch` qui se contente d'un toast. Un gateway qui
    /// répond 500 referme donc le composer et perd l'emoji, la phrase,
    /// l'audience et les mentions. **Dette IDENTIQUE à celle de l'écran
    /// historique** (`StatusComposerView` dismisse aussi après un `setStatus`
    /// muet) et **non refermée par ce lot** : la remontée d'échec reste à
    /// écrire, et elle commence par faire rendre un résultat à `setStatus`.
    /// Le seul `false` atteignable depuis la porte du mood est sa garde de
    /// format, jamais un échec de transport.
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

    let onPreview: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void
    let onDismiss: () -> Void

    /// L'atelier et le socle lisent le MÊME état de composition. Le host le
    /// possède pour que l'œil du socle puisse migrer l'instant courant en v3
    /// sans redemander quoi que ce soit à l'atelier.
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
    @State private var documentText = ""

    /// L'emoji du mood — la seule matière SANS laquelle un mood ne part pas
    /// (`ComposerMoodPolicy.canPublish`). Il vit ici pour la même raison que
    /// `documentText` : le publieur est le socle, pas la surface.
    @State private var moodEmoji: String?

    /// L'audience du mood et sa liste nominative. La MÉMOIRE, elle, n'est pas
    /// ici : `@AppStorage("lastStatusVisibility")` vit dans la surface, parce
    /// que c'est la mémoire d'audience du FORMAT status (loi 10) et qu'une
    /// seconde clé posée ici en ferait une seconde mémoire à faire diverger.
    @State private var moodVisibility: PostVisibility = .public
    @State private var moodVisibilityUserIds: [String] = []

    /// Les personnes que ce mood nomme sans que son texte le dise. Le meuble
    /// les porte ; la RÈGLE de ce qu'on en déclare au serveur est
    /// `ComposerMoodPolicy.declared` (`nil` et jamais `[]`, loi 3).
    @State private var moodReferences: [ComposerReference] = []

    @State private var showsPreview = false
    @State private var previewSceneIndex = 0
    @State private var previewIsPlaying = false

    /// L'envoi EN VOL du socle. Il ferme le gate le temps de l'aller-retour :
    /// sans lui, un double tap sur la flèche produirait deux publications, ce
    /// que l'écran historique du mood évitait par le même drapeau.
    @State private var isPublishingDocument = false

    init(
        intent: ComposerIntent,
        initialVisibility: String,
        draftId: String? = nil,
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String], String, [ComposerReference], ComposerMediaAccessibility, PostType) -> Bool,
        onPublishDocument: @escaping @MainActor (ComposerDocumentDraft) async -> Bool,
        moodSeed: ComposerMoodSeed?,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.intent = intent
        self.initialVisibility = initialVisibility
        self.draftId = draftId
        self.onPublishAllInBackground = onPublishAllInBackground
        self.onPublishDocument = onPublishDocument
        self.moodSeed = moodSeed
        self.onPreview = onPreview
        self.onDismiss = onDismiss

        let composer = StoryComposerViewModel()
        if let draftId { composer.adoptDraft(id: draftId) }
        _viewModel = StateObject(wrappedValue: composer)

        _currentFormat = State(initialValue: ComposerProfile.profile(
            for: intent.origin,
            compositionQualifiesAsReel: ComposerReelGate.compositionQualifiesAsReel(composer.currentEffects)
        ).initialFormat)
    }

    private var tint: PlateauTint {
        PlateauTint(rawValue: storedTint) ?? .defaultTint
    }

    /// L'éventail RESPIRE : il est recalculé à chaque passe de rendu sur la
    /// composition du moment. Poser deux images puis en retirer une retire le
    /// réel de l'offre — c'est ce que V1 avait écrit et débranché.
    private var reelGate: Bool {
        ComposerReelGate.compositionQualifiesAsReel(viewModel.currentEffects)
    }

    private var profile: ComposerProfile {
        ComposerProfile.profile(
            for: intent.origin,
            compositionQualifiesAsReel: reelGate
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
        ComposerSurfaceRouting.surface(opening: profile.opensWith, format: selectedFormat)
    }

    /// QUI peint la publication — audience, aperçu, flèche. UNE source, lue deux
    /// fois : passée à l'atelier pour qu'il assemble ou non sa rangée haute, et
    /// lue ici pour que le socle peigne ou non les mêmes zones.
    ///
    /// **Ce fut une CONSTANTE `.atelier`, et le lot 4 l'a rendue calculée** —
    /// pas par confort : les deux blocages qui l'imposaient sont des blocages de
    /// la SCÈNE, et une constante qui les faisait valoir pour les trois surfaces
    /// était une constante mal placée. (1) `visibilityMenu` est l'UNIQUE
    /// écrivain de `visibility` DANS L'ATELIER — le retirer priverait l'auteur
    /// de tout moyen de changer son audience, sous la scène. (2) L'œil du socle
    /// monte `MeeshyScenePlayer` SANS `preloadedImages/VideoURLs/AudioURLs`,
    /// `internal` à `MeeshyUI` : il rendrait un aperçu AMPUTÉ des médias
    /// LOCAUX de l'atelier, ce qu'interdit la loi 6.
    ///
    /// Sous le document et sous le mood, **il n'y a pas d'atelier** : aucune de
    /// ces deux raisons n'a d'objet. La règle qui tranche est
    /// `ComposerChromeOwnership`, éprouvable sans monter une vue ; ce qui suit
    /// n'en est que la lecture.
    ///
    /// **Ce que la bascule NE lève PAS, et qu'il ne faut pas lire comme acquis** :
    /// la scène reste sur `.atelier`, et ses deux conditions de levée sont
    /// intactes — un écrivain d'audience atteignable par le meuble, et un aperçu
    /// qui porte les médias préchargés. Elles se remplissent côté SDK, jamais
    /// depuis ce fichier.
    private var chromeOwner: ComposerChromeOwner {
        ComposerChromeOwnership.owner(for: mountedSurface)
    }

    /// Les zones que le socle peint sous la surface montée. Une RÈGLE, jamais un
    /// `if` écrit dans le corps : une condition posée dans un `body` est
    /// invisible aux tests, et c'est ainsi qu'une règle produit se met à exister
    /// en deux exemplaires.
    private var paintedSocleZones: [ComposerTopBarControl] {
        ComposerChromeOwnership.socleZones(for: mountedSurface)
    }

    var body: some View {
        VStack(spacing: 0) {
            surface
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
                visibility: moodVisibility,
                visibilityUserIds: moodVisibilityUserIds
            )
        )
        moodEmoji = adoptee.emoji
        documentText = adoptee.text
        moodVisibility = adoptee.visibility
        moodVisibilityUserIds = adoptee.visibilityUserIds
    }

    // MARK: - Les trois surfaces (V2, élargies au mood par le lot 4)

    /// Le meuble a TROIS surfaces, et c'est `ComposerSurfaceRouting` qui tranche
    /// — jamais une condition écrite ici. La règle vit à côté de la surface
    /// document parce qu'elle est éprouvable sans monter la moindre vue ; la
    /// recopier dans le `body` l'aurait rendue muette aux tests.
    ///
    /// Le socle, lui, ne dépend d'aucune des trois : il reste sous toutes
    /// (loi 5 — le socle ne bouge jamais).
    @ViewBuilder
    private var surface: some View {
        switch mountedSurface {
        case .scene:
            composerSurface
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
    /// gouverne ce que LUI monte autour (`plateauTools` ci-dessous). Passer des
    /// capacités à l'atelier appartient à l'écriture v3 native, hors de ce lot.
    ///
    /// Les cinq fournisseurs sont posés SUR l'atelier, au plus près de son
    /// montage : c'est la forme que `AppInitWireupTests` compte, site par site.
    private var composerSurface: some View {
        VStack(spacing: 0) {
            plateauTools
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
    /// Aucun outil n'y est servi aujourd'hui, et c'est la loi 4 qui le veut :
    /// le meuble n'a pas encore de chemin d'ingestion. Le pipeline existe et
    /// tourne (`ComposerDropResolver` / `ComposerIngestRouter`, six sites de
    /// production) mais aucun de ses points d'entrée n'est dans le composer.
    /// Peindre la rangée avant lui ouvrirait des sélecteurs dont le résultat
    /// n'aurait nulle part où aller — l'affordance sans effet que ce chantier
    /// retire partout. `ComposerDocumentTool.canonicalRow` attend V3, dans
    /// l'ordre de la feuille historique, pour que rien n'ait à être réinventé.
    ///
    /// **Elle ne porte pas non plus l'ÉVENTAIL**, qui vit dans le plateau. Ce
    /// n'est pas une impasse aujourd'hui — mais la raison a changé au lot 4.6,
    /// et l'ancienne (« le seul appelant de production ouvre sur
    /// `.cameraReady` ») est devenue FAUSSE dans le même arbre. Il y a désormais
    /// DEUX appelants de production du meuble, et le second n'ouvre pas sur une
    /// capture :
    ///
    /// - `StoryTrayActions` — `.storyTray`, ouverture `.cameraReady`, que
    ///   `ComposerSurfaceRouting` route TOUJOURS vers la scène ;
    /// - `MoodComposerDoor` — `.moodChip` (`.moodGrid`) et
    ///   `.repost(sourceFormat: .status)` (`.keyboardOnContent`). Les deux
    ///   routent vers le MOOD tant que le format vaut `.status` — et le second
    ///   offre `[.status, .post]`, donc une bascule vers `.post` y monterait
    ///   cette surface-ci.
    ///
    /// Ce qui tient l'impasse fermée n'est donc pas l'ouverture, c'est que
    /// **l'éventail n'est monté que par `composerSurface`** : ni le mood ni le
    /// document ne le portent, et sans lui aucun auteur ne peut choisir `.post`.
    /// Le fait est tenu par `ComposerDocumentSurfaceTests`
    /// `.test_leRepostDUnMood_offreLAncrage_maisAucunEcranNeLePeint`, et NON par
    /// la garde du lot 3 (`portesDocumentDuMeuble` ne contient que
    /// `.feedComposer` et filtre sur `profil.initialFormat`, jamais sur le
    /// format qu'un éventail aurait choisi).
    ///
    /// La TABLE de C1 désigne par ailleurs le meuble pour `.feedComposer`
    /// (`routesToLegacy: nil`) depuis le lot 3, mais aucun site de présentation
    /// n'a bougé — le fil monte toujours sa feuille et son composer inline
    /// depuis ses propres booléens. La porte la plus utilisée ne passe donc pas
    /// encore ici.
    ///
    /// Le jour où elle passera, il faudra y porter le sélecteur — sans lui,
    /// basculer vers le document serait une porte à sens unique. **Et ce jour
    /// ne se décrète pas depuis ce fichier** : le porter AUJOURD'HUI serait
    /// pire que ne pas le porter. Mesuré le 2026-08-24 sur les 14 fichiers
    /// `StoryComposerViewModel*.swift` : ses écrivains publics sont l'adoption
    /// de brouillon (`adoptDraft(id:)`, `detachFromAdoptedDraft()`,
    /// `adoptDeclaredReferences(_:)`), la timeline (`loadCurrentSlideIntoTimeline()`,
    /// `commitTimelineToCurrentSlide()`, `applyPersistedCommandHistory(_:)`,
    /// `shutdownTimelineIfNeeded()`, et `timelineViewModel` qui rend une
    /// référence écrivant à son tour) et deux inits de reprise
    /// (`init(editing:)`, `init(reposting:authorHandle:)`) — **aucun n'écrit du
    /// TEXTE** : `currentEffects` est `public internal(set)`, et rien dans
    /// `+Elements.swift` n'expose publiquement la création d'un élément de
    /// texte. La liste est plus large que le blocage, et c'est le blocage qui
    /// compte : un `grep` de contrôle doit CONFIRMER cette phrase, jamais la
    /// démentir — un inventaire faux présenté comme « déjà vérifié » coûte plus
    /// cher que pas d'inventaire du tout. Un
    /// auteur qui taperait son post ici puis choisirait « Story » verrait le
    /// routage lui monter l'atelier, et `documentText` n'aurait aucun chemin
    /// pour l'y suivre — la saisie disparaîtrait sans un mot, sur la surface de
    /// création la plus fréquentée de l'app.
    ///
    /// Les deux branches sont donc des régressions — sans éventail une porte à
    /// sens unique, avec éventail une perte de texte — et c'est ce couple qui
    /// fait que recâbler `.feedComposer` demande plus qu'une ligne de table.
    /// **Condition de levée, côté SDK** : un écrivain public de texte
    /// atteignable par le meuble. L'éventail descend alors ici AVEC le
    /// transfert de la saisie, jamais avant lui.
    ///
    /// **Sa SORTIE est celle du meuble.** `onDismiss` n'était atteignable que
    /// sous la scène, où l'atelier du SDK peint la croix ; le document n'a pas
    /// d'atelier, et la surface serait restée un écran sans issue au moment
    /// même où V3 devait la brancher sur la porte la plus utilisée de l'app.
    /// Le host ne fabrique pas une seconde fermeture : il passe la SIENNE, la
    /// même que reçoit l'atelier deux blocs plus haut.
    private var documentSurface: some View {
        ComposerDocumentSurface(
            text: $documentText,
            tools: ComposerDocumentToolPolicy.visibleTools(
                served: servedDocumentTools,
                allowsCapture: profile.allowsCapture
            ),
            focusesOnAppear: ComposerSurfaceRouting.focusesContentOnAppear(opening: profile.opensWith),
            onClose: onDismiss
        )
    }

    private var servedDocumentTools: [ComposerDocumentTool] { [] }

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
            visibility: $moodVisibility,
            visibilityUserIds: $moodVisibilityUserIds,
            references: $moodReferences,
            viaUsername: moodSeed?.viaUsername,
            onClose: onDismiss
        )
    }

    /// Le plateau ne porte plus qu'UNE chose : l'éventail, le seul endroit du
    /// meuble où l'auteur choisit ce qu'il PUBLIE.
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
            ComposerFormatFan(
                offeredFormats: profile.offeredFormats,
                selection: formatSelection
            )
        }
        .font(.footnote.weight(.semibold))
        .foregroundColor(MeeshyColors.textSecondary(isDark: true))
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    // MARK: - Le socle — jamais conditionnel à la PORTE

    /// Le point fixe du composer, et il l'est resté : ce qui varie n'est pas la
    /// porte, c'est la SURFACE.
    ///
    /// La loi 5 interdit qu'il se réorganise selon la porte d'entrée. Elle n'a
    /// jamais dit qu'il peignait une commande sans objet — il s'efface déjà
    /// devant l'atelier, qui peint les mêmes zones (`body`, plus haut). Le lot 4
    /// tient la même phrase jusqu'au bout : l'audience n'est pas peinte là où la
    /// surface porte son propre sélecteur, l'œil n'est pas peint là où il n'y a
    /// pas de canvas à lire.
    ///
    /// Ce choix appartient à `ComposerChromeOwnership.socleZones`, une règle
    /// PURE et éprouvée. Aucun `if` sur `profile`, sur `origin` ni sur `intent`
    /// n'entre ici : ce serait la loi 5 défaite, et une condition écrite dans un
    /// `body` est invisible aux tests.
    private var socle: some View {
        HStack(spacing: 10) {
            if paintedSocleZones.contains(.audience) { audienceChip }
            if paintedSocleZones.contains(.preview) { previewEye }
            Spacer()
            publishButton
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    /// Un TÉMOIN, jamais un second sélecteur — dupliquer le picker ici ferait
    /// deux sources pour un même réglage.
    ///
    /// Il n'est peint que là où il a un objet, et il n'en a plus qu'un seul : le
    /// DOCUMENT. Sous la scène, l'atelier peint son propre picker 6 niveaux et le
    /// socle tout entier s'efface. Sous le mood, `ComposerMoodSurface` porte le
    /// sien, avec la mémoire `@AppStorage("lastStatusVisibility")` du format
    /// (loi 10) — poser ce témoin inerte au-dessus d'un vrai sélecteur aurait été
    /// exactement la duplication que ce commentaire s'interdit.
    ///
    /// **Dette CONSIGNÉE sous le document** : personne n'y écrit l'audience, ce
    /// témoin n'en est pas un écrivain, et le brouillon part donc sur la
    /// visibilité que la PORTE a semée (`initialVisibility`). Aucune porte de
    /// production ne monte le document, et la garde du lot 3 le retient.
    private var audienceChip: some View {
        Label {
            Text("composer.socle.audience", bundle: .main)
        } icon: {
            Image(systemName: "person.2.fill")
        }
        .font(.footnote.weight(.semibold))
        .foregroundColor(MeeshyColors.textSecondary(isDark: true))
    }

    /// L'œil — et c'est le LECTEUR, pas un aperçu maison (loi 6).
    ///
    /// Il n'est peint que là où il a quelque chose à lire, et
    /// `ComposerChromeOwnership.socleZones` en décide : jamais sous la scène (où
    /// l'atelier peint le sien), jamais sous le mood (qui n'a pas de canvas — la
    /// loi 6 interdit d'en fabriquer un aperçu).
    ///
    /// **Dette CONSIGNÉE sous le document** : `draftDocument` migre
    /// `viewModel.currentEffects`, que la surface document ne remplit pas — il
    /// rendrait donc une scène VIDE. La cause est la même que celle de
    /// `servedDocumentTools == []` : sans chemin d'ingestion, pas de média, donc
    /// rien à prévisualiser. Ce n'est pas une raison de retirer l'œil ici, c'en
    /// est une de ne pas monter le document en production tant que la rangée ne
    /// se peint pas — ce que la garde du lot 3 retient déjà.
    private var previewEye: some View {
        Button {
            showsPreview = true
        } label: {
            Image(systemName: "eye")
                .font(.footnote.weight(.semibold))
                .foregroundColor(MeeshyColors.textSecondary(isDark: true))
        }
        .accessibilityLabel(Text("composer.socle.preview", bundle: .main))
        .sheet(isPresented: $showsPreview) {
            previewSheet
        }
    }

    /// Le document de l'aperçu est celui que la publication enverra : depuis la
    /// règle d'encodage B7 (« encode = toujours le v3 migré du runtime
    /// courant »), c'est PAR CONSTRUCTION la même fonction sur le même état.
    /// L'aperçu ne peut donc pas mentir sur ce qui sera publié.
    private var draftDocument: CanvasV3 {
        CanvasV3(migrating: viewModel.currentEffects)
    }

    private var previewSheet: some View {
        MeeshyScenePlayer(
            document: draftDocument,
            mode: .preview,
            sceneIndex: $previewSceneIndex,
            isPlaying: $previewIsPlaying,
            accentColorHex: MeeshyColors.indigo400Hex
        )
    }

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
    ///   `visibilityMenu` en est l'unique écrivain ; passer `chromeOwner: .host`
    ///   sous la scène retirerait les trois commandes d'un coup, donc l'audience
    ///   avec. **Levée** : un écrivain d'audience atteignable depuis le meuble.
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
            Label {
                Text("composer.socle.publish", bundle: .main)
            } icon: {
                Image(systemName: "arrow.up.circle")
            }
            .font(.footnote.weight(.bold))
            .foregroundColor(canPublishDocument ? MeeshyColors.indigo400 : MeeshyColors.textSecondary(isDark: true))
        }
        .disabled(!canPublishDocument)
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
            isPublishing: isPublishingDocument
        )
    }

    /// Ce que VoiceOver annonce quand la flèche refuse. Vide pendant l'envoi :
    /// « choisissez un emoji » serait faux d'un mood qui en a un et qui part.
    private var publishBlockedHint: String {
        guard !canPublishDocument, !isPublishingDocument else { return "" }
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
                visibility: moodVisibility,
                visibilityUserIds: moodVisibilityUserIds,
                references: moodReferences,
                repostOfId: intent.origin.repostedPostId,
                audioUrl: moodSeed?.audioUrl
            )
        case .document:
            return ComposerDocumentDraft.document(
                format: selectedFormat,
                text: documentText,
                visibility: PostVisibility(rawValue: initialVisibility) ?? .public
            )
        }
    }

    /// Le meuble TRANSMET : il ne connaît ni service, ni file, ni endpoint.
    ///
    /// Il referme le composer sur une ACCEPTATION et le laisse ouvert sur un
    /// refus. Fermer sur un `false` jetterait ce que l'auteur vient d'écrire, et
    /// c'est le seul geste de cette méthode qu'aucune garde de source ne pourrait
    /// rattraper.
    ///
    /// **Ce que cette phrase ne dit PAS, et qu'il ne faut pas lire comme
    /// acquis** : aucun écrivain ne rend `false` sur un échec d'ENVOI
    /// aujourd'hui (cf. `onPublishDocument`). Le composer se referme donc aussi
    /// quand la publication a échoué — dette héritée de l'écran historique, non
    /// refermée par ce lot.
    private func publishDocument() {
        guard canPublishDocument, let draft = documentDraft else { return }
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
