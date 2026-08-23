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
/// 3. **les trois fournisseurs d'environnement** (lieu, caméra, pellicule).
///    Sans eux la pastille « Lieu » et les amorces de page blanche
///    disparaissent — sans le moindre signal.
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
    let onPublishAllInBackground: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String], String, [ComposerReference]) -> Bool
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
    /// `initialFormat` de la porte et, aujourd'hui, N'EN BOUGE PLUS : le
    /// sélecteur (`ComposerFormatFan`) existe et est testé, mais il n'est PAS
    /// monté.
    ///
    /// Sa garde négative nommait DEUX conditions de levée. V1 a levé la
    /// première : l'offre varie désormais avec la composition. V2 a levé la
    /// moitié de la seconde : changer de format change la SURFACE montée
    /// (`ComposerSurfaceRouting`). Ce qui manque encore est l'autre moitié —
    /// changer de format doit changer ce qui est PUBLIÉ, et le socle nomme
    /// aujourd'hui la publication sans la piloter. Monter l'éventail avant
    /// cela offrirait un choix que l'envoi ignore : le pire des deux mondes,
    /// puisqu'il aurait l'air de marcher.
    @State private var currentFormat: ComposerFormat

    /// Le contenu du DOCUMENT, quand la surface montée en est un. Il vit dans
    /// le meuble et non dans la surface : c'est le meuble qui le remettra au
    /// publieur, et une surface qui posséderait son texte le perdrait à chaque
    /// bascule de format.
    @State private var documentText = ""

    @State private var showsPreview = false
    @State private var previewSceneIndex = 0
    @State private var previewIsPlaying = false

    init(
        intent: ComposerIntent,
        initialVisibility: String,
        draftId: String? = nil,
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String], String, [ComposerReference]) -> Bool,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.intent = intent
        self.initialVisibility = initialVisibility
        self.draftId = draftId
        self.onPublishAllInBackground = onPublishAllInBackground
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

    var body: some View {
        VStack(spacing: 0) {
            surface
            socle
        }
        .background(tint.color.ignoresSafeArea())
    }

    // MARK: - Les deux surfaces (V2)

    /// Le meuble a DEUX surfaces, et c'est `ComposerSurfaceRouting` qui tranche
    /// — jamais une condition écrite ici. La règle vit à côté de la surface
    /// document parce qu'elle est éprouvable sans monter la moindre vue ; la
    /// recopier dans le `body` l'aurait rendue muette aux tests.
    ///
    /// Le socle, lui, ne dépend d'aucune des deux : il reste sous les deux
    /// (loi 5 — le socle ne bouge jamais).
    @ViewBuilder
    private var surface: some View {
        switch ComposerSurfaceRouting.surface(opening: profile.opensWith, format: currentFormat) {
        case .scene:
            composerSurface
        case .document:
            documentSurface
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
    /// Les trois fournisseurs sont posés SUR l'atelier, au plus près de son
    /// montage : c'est la forme que `AppInitWireupTests` compte, site par site.
    private var composerSurface: some View {
        VStack(spacing: 0) {
            plateauTools
            StoryComposerView(
                viewModel: viewModel,
                initialVisibility: initialVisibility,
                onPublishAllInBackground: onPublishAllInBackground,
                onPreview: onPreview,
                onDismiss: onDismiss
            )
            .storyLocationPickerProvided()
            .storyCameraCaptureProvided()
            .storyRecentCameraRollProvided()
            .storyPasteProvided()
        }
    }

    /// La surface « document sans scène » (V2).
    ///
    /// Elle ne porte PAS le plateau d'outils : `plateauTools` outille une
    /// scène — diapositives, timeline — et un document n'en a aucune. Le
    /// profil de `.feedComposer` annonce pourtant `showsSlides`/`showsTimeline`
    /// à `true`, et c'est cohérent : ils décrivent ce que la porte offre APRÈS
    /// bascule vers la story, pas ce que le document a.
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

    /// Les outils du plateau suivent le PROFIL, et une capacité refusée n'est
    /// pas montée du tout (loi 4). Une affordance grisée promettrait une
    /// surface qui n'existe pas pour cette porte.
    ///
    /// L'éventail occupe le flanc opposé : c'est le seul endroit du meuble où
    /// l'auteur choisit ce qu'il PUBLIE, et il doit se lire sans se confondre
    /// avec les outils de composition.
    @ViewBuilder
    private var plateauTools: some View {
        HStack(spacing: 12) {
            if profile.allowsCapture {
                Image(systemName: "camera.fill")
                    .accessibilityLabel(Text("composer.plateau.capture", bundle: .main))
            }
            if profile.showsSlides {
                Image(systemName: "rectangle.stack")
                    .accessibilityLabel(Text("composer.plateau.slides", bundle: .main))
            }
            if profile.showsTimeline {
                Image(systemName: "timeline.selection")
                    .accessibilityLabel(Text("composer.plateau.timeline", bundle: .main))
            }
            Spacer()
        }
        .font(.footnote.weight(.semibold))
        .foregroundColor(MeeshyColors.textSecondary(isDark: true))
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    // MARK: - Le socle — permanent, jamais conditionnel

    private var socle: some View {
        HStack(spacing: 10) {
            audienceChip
            previewEye
            Spacer()
            publishButton
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    /// L'audience se choisit dans l'atelier (le picker 6 niveaux existant) ; le
    /// socle en montre l'ÉTAT. Dupliquer le picker ici ferait deux sources pour
    /// un même réglage.
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

    /// La zone de publication du socle est un TÉMOIN, pas un second bouton.
    ///
    /// L'unique publieur du composer est la barre du SDK : `publishAllSlides()`
    /// flush la timeline ouverte, rabat les effets du canvas courant sur la
    /// diapositive (`handoffSlides`), lit la visibilité et la langue tenues par
    /// l'atelier, puis rend la main — tout cela vit dans l'état privé de
    /// `StoryComposerView`, hors d'atteinte du meuble. Recomposer ce paquet
    /// app-side serait le second chemin de publication que la doctrine, C2 et
    /// le lot V7 interdisent tous les trois.
    ///
    /// Tant que le SDK n'expose pas ce déclenchement, le socle NOMME la
    /// publication sans la piloter. C'est ce qui interdit de basculer les
    /// racines sur ce host : deux barres, dont une inerte, seraient une
    /// régression sèche sur la surface de création la plus utilisée.
    private var publishButton: some View {
        Label {
            Text("composer.socle.publish", bundle: .main)
        } icon: {
            Image(systemName: "arrow.up.circle")
        }
        .font(.footnote.weight(.bold))
        .foregroundColor(MeeshyColors.indigo400)
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
