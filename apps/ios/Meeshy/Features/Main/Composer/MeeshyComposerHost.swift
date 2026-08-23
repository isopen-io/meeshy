import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le gate du réel, en UN seul endroit.
///
/// Les deux sites qui construisent un `ComposerProfile` passaient chacun
/// `compositionQualifiesAsReel: false` EN DUR. Deux littéraux jumeaux, dont
/// V1 devra retrouver les deux occurrences pour brancher l'éventail sur la
/// composition RÉELLE — et n'en corriger qu'une le ferait diverger en silence
/// (le plateau offrirait le réel que le routage ne connaîtrait pas).
///
/// Ce que V1 branchera ici : `ReelComposition.qualifiesAsReel(...)` sur la
/// composition courante. Elle n'est pas lisible aujourd'hui — `slides` et
/// `loadedVideoURLs` de `StoryComposerViewModel` sont internes au SDK, et
/// `currentEffects` ne porte que la diapositive COURANTE, donc rien qui
/// décrive une story multi-slides. Fabriquer une classification app-side
/// serait un second prédicat à côté de `ReelComposition`, exactement la
/// divergence que ce dépôt paie déjà ailleurs.
nonisolated enum ComposerReelGate {
    static let compositionQualifiesAsReel = false
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
    /// monté. Le monter maintenant peindrait un choix sans conséquence — une
    /// offre qui ne varie jamais (`ComposerReelGate.compositionQualifiesAsReel`
    /// est encore constante) et un chip dont la sélection n'est lue par
    /// personne. C'est exactement l'UI morte que ce chantier passe son temps à
    /// retirer. Condition d'armement : V1 (le gate réel nourrit l'éventail) ET
    /// V2/V3 (changer de format change la surface montée).
    @State private var currentFormat: ComposerFormat

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
            compositionQualifiesAsReel: ComposerReelGate.compositionQualifiesAsReel
        ).initialFormat)
    }

    private var tint: PlateauTint {
        PlateauTint(rawValue: storedTint) ?? .defaultTint
    }

    private var profile: ComposerProfile {
        ComposerProfile.profile(
            for: intent.origin,
            compositionQualifiesAsReel: ComposerReelGate.compositionQualifiesAsReel
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            composerSurface
            socle
        }
        .background(tint.color.ignoresSafeArea())
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
        }
    }

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
    var routesToLegacy: LegacyComposer? {
        ComposerProfile.profile(
            for: origin,
            compositionQualifiesAsReel: ComposerReelGate.compositionQualifiesAsReel
        ).routesToLegacy
    }
}
