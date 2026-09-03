import SwiftUI
import MeeshySDK
import MeeshyUI
import UIKit
import ImageIO

/// **La surface « document sans scène »** (V2, I6) — absorbée depuis
/// `FeedComposerSheet`.
///
/// Ce qu'elle est : une PRÉSENTATION. Des valeurs immuables entrent, des
/// événements sortent. Elle ne possède ni pièces jointes, ni sélecteurs, ni
/// chemin d'envoi — ces trois-là appartiennent au site qui la monte, et les
/// dupliquer ici ferait deux pipelines d'ingestion pour un seul composer, quand
/// celui de `ComposerDropResolver`/`ComposerIngestRouter` tourne déjà sur six
/// sites de production.
///
/// Ce qu'elle n'est PAS : un second chemin de publication. Le socle du meuble
/// nomme la publication, le SDK la déclenche, et V7 unifiera la file. Une
/// surface qui publierait elle-même serait exactement la dette que ce chantier
/// défait ailleurs.
///
/// **Aucun outil monté sans destination.** `tools` est ce que le site sert, et
/// une rangée vide ne se peint pas du tout (loi 4). C'est ce qui permet à cette
/// surface d'exister AVANT que l'ingestion du meuble soit branchée sans devenir
/// l'affordance sans effet que la doctrine interdit.
struct ComposerDocumentSurface: View {

    @Binding var text: String

    /// Les outils que le site de montage sait servir, déjà filtrés par
    /// `ComposerDocumentToolPolicy`. Vide ⇒ aucune rangée.
    let tools: [ComposerDocumentTool]

    /// `ComposerSurfaceRouting.focusesContentOnAppear(opening:)`. Passé plutôt
    /// que déduit : la surface ne connaît pas la porte, et aller la chercher
    /// ferait d'elle une seconde lectrice de la table de C1.
    let focusesOnAppear: Bool

    /// **La SORTIE**, et c'est un paramètre OBLIGATOIRE — non optionnel, sans
    /// valeur par défaut.
    ///
    /// La scène tient la sienne de l'atelier du SDK (`StoryComposerView` reçoit
    /// `onDismiss` et peint la croix) ; le document n'a pas d'atelier. Une
    /// surface montée sans issue est un écran dont on ne sort pas — et comme
    /// V3 devait la brancher sur `.feedComposer`, la porte la plus utilisée de
    /// l'app, on aurait livré le cul-de-sac à l'endroit le plus fréquenté.
    ///
    /// Elle n'est pas optionnelle à dessein : un `nil` par défaut n'aurait
    /// cassé aucune compilation au site de montage suivant, et la sortie aurait
    /// disparu sans un mot — exactement le silence que `initialVisibility`
    /// avait déjà coûté un cran plus haut.
    let onClose: () -> Void

    var onTool: ((ComposerDocumentTool) -> Void)? = nil

    /// **Les médias qui ont une TUILE — les FONDS de slide (B, #3883, #4724).**
    /// La surface les REÇOIT et les peint — elle reste sans état ; le meuble
    /// possède `documentLocalMedia` et décide qui gagne une tuile
    /// (`headerTileMedia`).
    ///
    /// **Ce n'est plus l'inventaire des pièces jointes**, et la nuance est le
    /// #4724. « En Post une slide EST un média » reste vrai ; « donc le rail des
    /// slides et l'inventaire des pièces jointes sont le MÊME objet » ne l'est
    /// plus depuis qu'un média peut être posé SUR la scène sans ouvrir de page.
    /// Un son, un document, une image de premier plan sont des pièces jointes
    /// qui ne sont aucune page — les compter ici faisait grossir le carrousel
    /// d'une tuile qui ne menait nulle part.
    var localMedia: [ComposerDocumentMedia] = []

    /// Retirer une vignette. Le meuble ôte l'élément de `documentLocalMedia`, ce
    /// qui RE-JUGE le format (loi 4 : le toggle POST↔RÉEL suit le média).
    var onRemoveMedia: ((ComposerDocumentMedia) -> Void)? = nil

    /// **Choisir une couleur de FOND (F2, #3885).** Le geste REMONTE au meuble,
    /// qui pose le fond du socle (`documentBackground`) et bascule la scène 9:16
    /// (« un post sans visuel devient une toile »). `nil` ⇒ aucune bande de
    /// fond (loi 4) — la surface reste sans état.
    var onPickBackground: ((String) -> Void)? = nil

    /// **La scène incrustée (Phase 2 du composer unifié, #3939).** La slide
    /// éditée par la scène 9:16 qui s'incruste EN HAUT de l'écran document dès
    /// qu'un fond est choisi (ou qu'un média/scène existe). `nil` ⇒ pas de
    /// scène, l'écran reste texte seul (comportement historique).
    var sceneSlide: Binding<StorySlide>? = nil

    /// La scène doit-elle être montée ? Découplé de `sceneSlide != nil` pour
    /// que le meuble garde la décision (« un fond a été choisi » / « un média
    /// qualifie »), la surface restant une pure présentation.
    var showsScene: Bool = false

    /// Ratio de la scène incrustée — 9:16 par défaut, 16:9 si le fond est
    /// paysage (source de vérité partagée avec l'atelier et le reader).
    var sceneAspectRatio: CGFloat = CanvasGeometry.portraitRatio

    /// **Relais du tap sur un objet de la scène incrustée (lot 3A du composer
    /// unifié, #4035).** L'hôte retient la sélection et décide de monter
    /// `sceneInspector` — la surface reste sans état sur CE que ce tap
    /// signifie. `nil` ⇒ la scène reste sans sélection observable
    /// (comportement Phase 1/2 inchangé).
    var onSceneItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil

    /// Relais du tap sur le FOND de la scène (désélection).
    var onSceneBackgroundTapped: (() -> Void)? = nil
    /// **L'appui long sur la scène VIDE d'un Post ouvre la caméra** (#4036).
    var onSceneBackgroundLongPressed: (() -> Void)? = nil

    /// **Naviguer entre les slides depuis le RAIL (#4038, monté en barre haute
    /// par #4047).** En Post, une slide EST un média — le rail DIT donc déjà les
    /// slides. Lui donner la navigation évite d'ajouter un second rail à côté du
    /// premier, qui montrerait exactement la même chose (loi 2). `nil` ⇒ le rail
    /// reste ce qu'il était, un inventaire avec son bouton de retrait.
    var onSelectMedia: ((ComposerDocumentMedia) -> Void)? = nil
    /// **Le son de FOND de la publication** (#4657) — `nil` quand il n'y en a
    /// pas, et la rangée retrouve alors sa forme d'avant : avatar et texte côte
    /// à côte. Une pastille toujours montée, vide, occuperait la place d'un son
    /// qui n'existe pas.
    var backgroundSound: StoryAudioPlayerObject? = nil
    /// **Ce que le doigt fait de la pastille du son de fond** (#4668). `nil` ⇒
    /// elle reste une lecture : la surface ne fabrique pas d'action que l'hôte
    /// ne lui a pas donnée.
    var onEditBackgroundSound: (() -> Void)?

    /// **Le RETRAIT du son de fond, par appui long** (#4930).
    ///
    /// `nil` ⇒ aucun menu. Deux cas le rendent : aucun fond, et un fond LEGACY
    /// — celui que `resolvedBackgroundAudio` synthétise depuis
    /// `backgroundAudioId`, qui n'a aucun objet à supprimer. Le meuble tranche ;
    /// la surface ne fait que peindre ce qu'elle reçoit.
    var onDeleteBackgroundSound: (() -> Void)? = nil
    /// **Ce que le doigt fait d'une carte de son de contenu.**
    ///
    /// Toucher la carte rouvre « Création audio » SUR ce son. `nil` ⇒ la carte
    /// s'écoute sans s'éditer, plutôt qu'un tap qui ne ferait rien (loi 4) — un
    /// composer qui sert la carte sans servir l'édition existe : c'est celui
    /// d'une surface en lecture seule.
    ///
    /// **Le son touché voyage en ARGUMENT depuis #4672** : avec N cartes, un
    /// rappel sans argument ouvrirait toujours le même — un contrôle qui a l'air
    /// de répondre et désigne son voisin.
    var onEditForegroundSound: ((ComposerForegroundSound) -> Void)? = nil

    /// **Retirer le son de la carte, par appui LONG** (#4696, directive porteur
    /// 2026-09-01 : « introduire le longpress sur les objets pour avoir un menu
    /// contenant la suppression »).
    ///
    /// Le geste double celui de la feuille, et c'est voulu : ouvrir puis
    /// supprimer demande trois gestes pour défaire ce qu'un seul a posé.
    /// `nil` ⇒ pas de menu — la surface ne fabrique pas une entrée sans effet.
    var onDeleteForegroundSound: ((ComposerForegroundSound) -> Void)? = nil

    /// **Le son placé en CONTENU de publication** (directive porteur
    /// 2026-09-01). Résolu par le meuble (`ComposerForegroundSound.resolve`),
    /// jamais fouillé ici : la surface reste une présentation. `nil` ⇒ aucune
    /// carte — et c'est le cas de l'écrasante majorité des publications.
    var foregroundSounds: [ComposerForegroundSound] = []

    /// **Le chip de TYPE DE PUBLICATION, dans la BARRE HAUTE (#4047).**
    ///
    /// Un slot opaque : la surface ne sait pas ce qu'est un format, ni quels
    /// formats sont offerts — c'est la règle de placement du meuble
    /// (`ComposerFormatFanPlacement`) qui décide, et l'éventail lui-même
    /// (`ComposerFormatFan`) qui les peint. La surface ne fait que lui donner sa
    /// PLACE, entre la fermeture et les slides.
    ///
    /// `nil` ⇒ rien peint. Le meuble le passe seulement là où il peignait déjà
    /// sa rangée `plateauTools` ; ailleurs, la barre garde sa forme courte.
    var formatFan: AnyView? = nil

    /// **Le menu `⋯` de la barre haute (#4047).**
    ///
    /// Slot OPAQUE, comme `formatFan` : la surface lui donne sa PLACE — au bout
    /// de la barre, après le rail — et ignore ce qu'il ouvre. Ce qui a du sens
    /// dans ce menu dépend de ce que le DOCUMENT porte (un fond posé, une
    /// composition non vide), et cet état vit chez le meuble.
    ///
    /// `nil` ⇒ ABSENT, jamais un `⋯` qui n'ouvre rien (loi 4). C'est le cas
    /// nominal d'un composer vierge : aucune de ses entrées n'aurait d'objet.
    var overflowMenu: AnyView? = nil

    /// **Le média dont la slide est à l'écran (#4047).** Le rail le cercle.
    /// L'hôte le RÉSOUT (il seul tient la carte `média → slide` et la slide
    /// courante) ; la surface ne fait que le peindre — sans quoi elle aurait
    /// besoin du ViewModel pour savoir où l'on est, et cesserait d'être sans
    /// état. `nil` ⇒ aucun anneau : c'est l'état d'un document sans scène.
    var selectedMediaURL: URL? = nil

    /// **Les médias qu'une slide peut ramener à l'écran (#4052).** Depuis que le
    /// son se pose en BANDE-SON plutôt qu'en page du carrousel, « être dans le
    /// rail » n'implique plus « avoir une slide ». Le meuble le sait — c'est lui
    /// qui tient la carte média → slide —, la surface ne le devine pas : une
    /// règle re-dérivée du mime ici divergerait le jour où un autre type
    /// gagnerait sa slide.
    var selectableMediaURLs: Set<URL> = []

    /// **La teinte du PLATEAU, pour que l'occultation de la rangée d'outils s'y
    /// fonde (#4032).**
    ///
    /// Elle vient du meuble — c'est lui qui peint l'écran entier de cette
    /// couleur (`PlateauTint`, trois teintes, réglable par l'auteur). La
    /// re-choisir ici en dur est exactement ce que le retour porteur du
    /// 2026-08-27 a rejeté : un fond noir sous le drapeau, sur un plateau navy.
    ///
    /// Défaut `.clear` : une surface montée sans teinte n'occulte rien, plutôt
    /// que d'inventer une couleur. C'est le repli SÛR — un dégradé transparent
    /// ne peut pas jurer.
    var plateauTint: Color = .clear

    /// **La zone contextuelle de l'état INSPECTEUR (lot 3A, #4035 — planche
    /// P4 §3).** Rendue DIRECTEMENT au-dessus de `toolRow` — seulement quand
    /// l'hôte retient une sélection sur la scène. `nil` ⇒ ABSENTE (loi 4 :
    /// « jamais de vide-mystère, jamais de contrôle grisé »). Même patron que
    /// `toolRowLeadingAccessory`/`toolRowTrailingAccessory` : un slot opaque,
    /// la surface ne sait rien de CE qui compose la zone.
    var sceneInspector: AnyView? = nil

    /// **Les bitmaps de la scène incrustée (#4038).** Sans eux, un fond MÉDIA ne
    /// se stampe pas — la Phase 2 n'ayant montré que des fonds de COULEUR, le
    /// manque n'a mordu qu'au premier post à photos. `sceneImagesVersion` est le
    /// cookie qui dit au canvas qu'un bitmap a changé (un dictionnaire d'images
    /// n'est pas `Equatable`).
    var sceneImages: [String: UIImage] = [:]
    /// Octets animés des stickers collés, keyés par `sticker.id` (#3956).
    var sceneStickerAnimations: [String: Data] = [:]
    var sceneImagesVersion: UInt64 = 0

    /// **Le slot de tête de `toolRow` (#3903).** Un chip d'état actif (le lieu,
    /// aujourd'hui) qui doit s'insérer DANS la disposition de la rangée d'outils
    /// plutôt que d'être stacké par-dessus : deux enfants d'un `HStack` ne se
    /// superposent jamais, quelle que soit la taille d'écran ou le palier de
    /// Dynamic Type — c'est la rangée elle-même qui garantit l'absence de
    /// chevauchement. `nil` ⇒ aucun chip, la rangée ne réserve aucune place.
    var toolRowLeadingAccessory: AnyView? = nil

    /// **Le slot de queue de `toolRow` (#3904, revue Opus 2026-08-27).** Même
    /// raisonnement que le slot de tête, à l'autre bout : la capsule de langue
    /// voyageait en `.overlay(alignment: .bottomTrailing)` sur TOUTE la
    /// surface, un raisonnement valable tant que `toolRow` était la dernière
    /// ligne peinte — ce qui a cessé d'être vrai dès que la bande de mentions
    /// (#3904) a pu s'afficher SOUS elle. Un enfant du `HStack` ne chevauche
    /// jamais la bande, quel que soit ce qui se peint plus bas dans le
    /// `VStack` parent.
    var toolRowTrailingAccessory: AnyView? = nil

    @FocusState private var isContentFocused: Bool

    /// Le dernier outil tapé — pilote le rebond SF (`.symbolEffect(.bounce)`)
    /// de l'icône concernée. Purement décoratif : aucune décision produit n'en
    /// dépend, il ne fait que donner à la valeur d'effet une raison de changer.
    @State private var lastTappedTool: ComposerDocumentTool?

    /// **La palette de couleur de fond est REPLIÉE par défaut (#4031, retour
    /// porteur 2026-08-27).** L'icône « couleur de fond » de `toolRow` (juste
    /// après l'emoji) la déplie ; au repos, la bande n'occupe plus l'espace en
    /// permanence.
    @State private var showColorPalette = false

    /// **Les mentions du brouillon (#3904)** — la surface reste sans état
    /// PARTAGÉ (`documentText` continue d'appartenir au meuble), mais
    /// l'autocomplétion @mention est de l'état d'UI éphémère, purement local
    /// à cet écran : `ComposerMentionControllerBox` la porte seule, sur le
    /// même patron que les `@StateObject` locaux de `PostDetailView` /
    /// `FeedCommentsSheet`.
    @StateObject private var mentionBox = ComposerMentionControllerBox()

    /// Le même délai que la feuille historique. Une prise de focus posée dans
    /// le tour de boucle de la présentation est avalée par l'animation de
    /// montée : le clavier ne se lève pas, et rien ne le signale.
    private static let focusDelay: TimeInterval = 0.3

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            exitAffordance
            content
            // **Sous la zone de texte, pas au bas de l'écran (retour porteur
            // 2026-08-27).** La bande vivait après `toolRow` — à côté des
            // boutons d'action, loin d'où l'auteur tape. Elle voyage
            // maintenant DIRECTEMENT sous `content`, avant le `Spacer` qui
            // pousse le reste vers le bas : la plus proche approximation du
            // curseur sans faire passer `TextEditor` par un pont UIKit
            // (`UITextView` + `caretRect`, qu'aucun composant du dépôt ne
            // fait aujourd'hui) — décision confirmée avec le porteur.
            // `!suggestions.isEmpty`, pas seulement `activeQuery != nil` (revue
            // Opus 2026-08-27) : en `.composerDraft`, il n'y a AUCUN appel
            // réseau en attente qui remplirait la liste plus tard — pas d'ami
            // accepté, une requête sans correspondance, ou le temps du `.task`
            // de chargement sont tous des états NOMINAUX. Gater sur la seule
            // requête active peindrait une bande de verre vide dans chacun.
            if mentionBox.controller.activeQuery != nil && !mentionBox.controller.suggestions.isEmpty {
                ComposerMentionStrip(
                    controller: mentionBox.controller,
                    currentText: text,
                    onSelect: { updated in text = updated }
                )
                .transition(.move(edge: .top).combined(with: .opacity))
            }
            Spacer(minLength: 0)
            backgroundStrip
            // **État INSPECTEUR (lot 3A, #4035 — planche P4 §3).** Juste
            // au-dessus de `toolRow`, montée SEULEMENT quand une sélection
            // existe sur la scène — `nil` ⇒ rien peint (loi 4).
            //
            // **Montée SANS transition ni animation, délibérément.** La zone
            // est un frère du `VStack` qui porte aussi `content` — donc la
            // scène incrustée. Animer son insertion ferait varier la hauteur
            // du canvas sur chaque frame du ressort, et `StoryCanvasUIView`
            // reconstruit ses layers à chaque `layoutSubviews` : une tempête
            // perf sur le geste le plus fréquent du composer. C'est la règle
            // écrite en tête d'`EmbeddedSceneCanvas` (« On n'anime JAMAIS la
            // frame du canvas ») ; un placement animé se fera plus tard par
            // `scaleEffect`/`offset` sur le CONTENEUR, jamais par la hauteur.
            if let sceneInspector {
                sceneInspector
            }
            toolRow
        }
        .animation(
            .spring(response: 0.3, dampingFraction: 0.8),
            value: mentionBox.controller.activeQuery != nil && !mentionBox.controller.suggestions.isEmpty
        )
        .onAppear { raiseKeyboardIfPromised() }
        .task { mentionBox.candidates = await ComposerMentionFriendsSource.acceptedFriends() }
        .adaptiveOnChange(of: text) { _, newText in mentionBox.controller.handleQuery(in: newText) }
    }

    /// L'issue, en haut à gauche — la position qu'occupe déjà la croix de
    /// l'atelier, pour que les deux surfaces du meuble se quittent du même
    /// geste. Elle n'est PAS dans le socle : le socle a trois zones et ne bouge
    /// jamais (loi 5), y ajouter une quatrième pour la seule surface document
    /// l'aurait fait dépendre de la porte.
    /// **La barre haute : fermer, puis le RAIL DES SLIDES (#4047).**
    ///
    /// La planche la dessine `✕ · [type ▾] · ▭ ▭ ＋ · ⋯`. Trois des quatre
    /// zones y sont : la fermeture, le TYPE DE PUBLICATION (descendu de sa
    /// rangée propre, où il flottait seul au-dessus de la surface) et le RAIL.
    ///
    /// **Le `⋯` est arrivé avec son premier contenu**, exactement comme cette
    /// note l'annonçait quand il était encore absent. Il ne reprend PAS les
    /// entrées de l'atelier (transitions, timeline, purge de slides), dont
    /// aucune n'a d'équivalent atteignable ici : il porte ce que le DOCUMENT
    /// sait faire et que rien d'autre à l'écran ne fait — et il disparaît
    /// entièrement quand aucune de ses entrées n'a d'objet.
    ///
    /// **Le rail REMPLACE la bande basse, il ne s'y ajoute pas.** Deux bandes
    /// montrant les mêmes vignettes auraient été deux inventaires à faire
    /// diverger, et la seconde aurait menti la première fois qu'un média serait
    /// entré par un chemin qui ne les alimente pas toutes les deux. C'est le
    /// « d'un seul tenant » de #4047, pris au mot.
    ///
    /// Les slides sont la STRUCTURE du document : elles se lisent donc là où se
    /// lit le type de publication, pas au milieu des outils.
    /// La barre haute vit désormais dans `ComposerTopBar` (#4070) — elle agit
    /// sur la `MeeshyPublication`, pas sur le document, et la scène incrustée
    /// en a le même besoin. La garder privée ici aurait obligé la surface de
    /// scène à la recopier.
    private var exitAffordance: some View {
        ComposerTopBar(
            localMedia: localMedia,
            selectedMediaURL: selectedMediaURL,
            selectableMediaURLs: selectableMediaURLs,
            formatFan: formatFan,
            overflowMenu: overflowMenu,
            onClose: onClose,
            onRemoveMedia: onRemoveMedia,
            onSelectMedia: onSelectMedia
        )
    }

    /// Le placeholder n'est PAS peint en `textMuted`, qui serait le réflexe.
    /// Ce jeton mesure 4,41:1 sur le violet profond du plateau — sous AA texte
    /// normal, constat déjà consigné par `ComposerPlateauTests` avec un témoin
    /// négatif. `textSecondary` est le seul premier plan mesuré au-dessus du
    /// seuil sur les TROIS teintes, et le plateau se choisit.
    @ViewBuilder
    private var content: some View {
        if showsScene, let sceneSlide {
            // **Phase 2 (#3939) — la scène est incrustée EN HAUT.** Dès qu'un
            // fond est choisi, la scène 9:16 (peinte de ce fond) occupe le haut
            // de l'écran document, arrondie ; le texte devient la DESCRIPTION,
            // sous la scène. Plus de switch vers l'atelier plein écran.
            VStack(spacing: 8) {
                EmbeddedSceneCanvas(
                    slide: sceneSlide,
                    aspectRatio: sceneAspectRatio,
                    cornerRadius: 22,
                    onItemTapped: onSceneItemTapped,
                    onBackgroundTapped: onSceneBackgroundTapped,
                    onBackgroundLongPressed: onSceneBackgroundLongPressed,
                    loadedImages: sceneImages,
                    loadedStickerAnimations: sceneStickerAnimations,
                    loadedImagesVersion: sceneImagesVersion
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                // **L'encastrement se lit de la RÈGLE, jamais d'un littéral**
                // (#4061). `railsShown: false` dit ce que cette surface EST :
                // le DOCUMENT n'a pas de rails. Ils appartiennent à la surface
                // de SCÈNE, qui n'existe pas encore (lot B) — et les monter ici
                // aurait obligé chaque règle du document à porter une exception
                // de scène, exactement ce que la tâche 4.3 de la planche a
                // fermé en faisant du mood une SURFACE plutôt qu'un cas.
                .padding(.horizontal, ComposerRailGeometry.sceneInset(railsShown: false))
                .padding(.top, 8)
                sceneDescriptionField
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            textOnlyContent
        }
    }

    /// L'écran document HISTORIQUE — texte long seul, sans scène.
    ///
    /// **L'avatar dit QUI publie (#4071).** La maquette `1a` le pose à gauche du
    /// champ, et il n'est pas décoratif : le composer s'ouvre depuis le fil, où
    /// plusieurs comptes peuvent se succéder, et la seule chose qui distingue
    /// « je publie » de « je réponds » est le visage à côté du curseur. Il est
    /// posé par la loi 8 sans y contrevenir — il ne dépend d'aucun contenu,
    /// c'est une propriété de la SESSION, présente dès l'ouverture.
    private var textOnlyContent: some View {
        // **Deux dispositions, et le son décide** (#4657). Sans son de fond, la
        // rangée reste ce qu'elle était : avatar et texte côte à côte. Avec un
        // son, la pastille prend la place à droite de l'avatar — les deux
        // attributs qui existent AVANT le premier caractère tapé se lisent d'un
        // coup d'œil — et le texte descend de ce qu'ils occupent, au lieu
        // d'être recouvert.
        Group {
            if let backgroundSound {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .center, spacing: 12) {
                        avatarView
                        ComposerAvatarSoundBadge(sound: backgroundSound,
                                                 onTap: onEditBackgroundSound)
                            .modifier(ComposerSoundActionsMenu(
                                supprimer: onDeleteBackgroundSound))
                        Spacer(minLength: 0)
                    }
                    textOnlyField
                    foregroundSoundCard
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top, spacing: 12) {
                        avatarView
                            .padding(.top, 10)
                        textOnlyField
                    }
                    foregroundSoundCard
                }
            }
        }
    }

    /// **Le son du CONTENU se joue là où le contenu se lit** (#4657).
    ///
    /// Il est monté ICI, et nulle part ailleurs, parce que `textOnlyContent`
    /// EST la branche « sans canvas » : le `if showsScene` de `content` a déjà
    /// tranché au-dessus. C'est la seule garde de cette condition — en écrire
    /// une seconde dans la règle de résolution ferait deux vérités pour un fait,
    /// et la seconde se tairait le jour où la première changerait.
    ///
    /// Avec une scène, un son de premier plan est un OBJET posé sur le canvas
    /// et s'y édite ; il n'a pas besoin d'une carte sous le texte.
    @ViewBuilder
    private var foregroundSoundCard: some View {
        // **UNE carte par son** (#4672). Une seule se montait, celle du DERNIER
        // fichier : les précédents restaient dans la publication — donc ils
        // partaient — sans que rien à l'écran ne dise qu'ils existaient. Un
        // contenu publié qu'on ne peut ni entendre, ni rogner, ni retirer.
        //
        // `ForEach` sur l'identité du FICHIER : deux sons peuvent partager
        // durée, type et texte sans être le même son.
        ForEach(foregroundSounds) { son in
            MeeshyAudioTranscriptPlayer(
                url: son.url,
                duration: son.duration,
                cues: son.cues,
                fallbackText: son.text,
                // Le plateau est sombre PAR CONSTRUCTION — comme les deux
                // champs de texte de cette surface, qui posent déjà
                // `isDark: true` sans consulter le thème de l'appareil.
                isDark: true,
                onEdit: onEditForegroundSound.map { rappel in { rappel(son) } }
            )
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .modifier(ComposerSoundActionsMenu(
                supprimer: onDeleteForegroundSound.map { rappel in { rappel(son) } }))
        }
    }

    /// L'avatar, extrait des deux dispositions : le monter deux fois le ferait
    /// diverger au premier réglage, et c'est le même visage dans les deux cas.
    private var avatarView: some View {
        MeeshyAvatar(
            name: AuthManager.shared.currentUser?.displayName
                ?? AuthManager.shared.currentUser?.username ?? "M",
            context: .feedComposer,
            avatarURL: AuthManager.shared.currentUser?.avatar,
            // Loi 6 — une vignette montre la DONNÉE. Le ThumbHash évite le
            // rond vide pendant que l'image arrive : le substitut porte
            // déjà les couleurs du vrai avatar.
            thumbHash: AuthManager.shared.currentUser?.avatarThumbHash
        )
        .padding(.leading, 16)
        .accessibilityHidden(true)
    }

    private var textOnlyField: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(ComposerDocumentCopy.placeholder)
                    .font(.body)
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .focused($isContentFocused)
                .scrollContentBackground(.hidden)
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .font(.body)
                .frame(minHeight: 120)
                .padding(.horizontal, 12)
                .padding(.top, 4)
                .accessibilityLabel(Text(ComposerDocumentCopy.placeholder))
        }
    }

    /// La description repliable sous la scène incrustée (Phase 2). Champ
    /// compact — le contenu long vit sur le canvas, ceci le légende.
    private var sceneDescriptionField: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(ComposerDocumentCopy.placeholder)
                    .font(.callout)
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .focused($isContentFocused)
                .scrollContentBackground(.hidden)
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .font(.callout)
                .frame(height: 56)
                .padding(.horizontal, 12)
                .accessibilityLabel(Text(ComposerDocumentCopy.placeholder))
        }
    }

    /// Une seule teinte pour les six outils, là où la feuille historique en
    /// portait six. Ce n'est pas un appauvrissement : ces couleurs vives
    /// avaient été mesurées sur un fond CLAIR, et le plateau du meuble est
    /// sombre par construction (`PlateauTint`, trois teintes toutes sombres).
    /// Les y recopier aurait posé six contrastes non mesurés d'un coup.
    @ViewBuilder
    private var toolRow: some View {
        // `|| toolRowLeadingAccessory != nil || toolRowTrailingAccessory != nil` :
        // sans ça, une rangée d'outils vide ferait aussi disparaître les deux
        // accessoires (le chip de lieu, la capsule de langue) en silence —
        // alors que ni l'un ni l'autre ne dépend de `tools`.
        if !tools.isEmpty || toolRowLeadingAccessory != nil || toolRowTrailingAccessory != nil {
            // **La rangée DÉFILE, et son occultation est peinte de la teinte du
            // PLATEAU (#4032).**
            //
            // Elle fut scrollable, puis rendue STATIQUE sur retour porteur du
            // 2026-08-27 — le fond noir sous le drapeau ne matchait pas le
            // plateau navy. Le retour ne condamnait pas le défilement : il
            // condamnait un fond CODÉ EN DUR, et posait la condition de retour
            // en toutes lettres — « un fond d'occultation ALIGNÉ sur la teinte
            // du plateau ».
            //
            // La condition est remplie ici : `plateauTint` vient du meuble, qui
            // peint déjà tout l'écran de cette couleur. Et le besoin est MESURÉ,
            // pas supposé — à `accessibility-XXXL` la rangée statique occupait
            // 630 pt sur un écran de 402, calée à x = −114 : coupée des DEUX
            // côtés, avec des outils qu'aucun geste n'atteignait.
            HStack(spacing: 16) {
                ScrollView(.horizontal, showsIndicators: false) {
                    // L'ecart et la largeur de tuile viennent de
                    // `ComposerDocumentToolRowFit`, qui porte la MESURE : a
                    // 52 pt et 8 pt d'ecart, trois entrees sur sept ne rendaient
                    // aucun pixel a taille nominale sur 402 pt (#4071). Resserrer
                    // ne fait pas tout tenir — rien ne le pourrait sans passer
                    // sous la cible tactile — mais fait PARAITRE la derniere,
                    // et c'est le signal qui manquait.
                    HStack(spacing: ComposerDocumentToolRowFit.spacing) {
                        if let toolRowLeadingAccessory {
                            toolRowLeadingAccessory
                        }
                        ForEach(tools, id: \.rawValue) { tool in
                            toolButton(tool)
                            // **La bascule de fond reste au 4e rang (#4071),
                            // et j'y suis revenu APRÈS mesure.**
                            //
                            // Huit entrées nommées ne tiennent pas sur 402 pt —
                            // ni en les resserrant, ni en les réordonnant :
                            // quelque chose débordera toujours. Le vrai
                            // arbitrage n'est donc pas « quel OUTIL cacher »
                            // mais « quelle PORTE ».
                            //
                            // Je l'avais passée en queue pour rendre visibles
                            // « Fichier », « Position » et « Vocal ». Mesuré à
                            // l'écran, c'était pire : elle devenait invisible,
                            // alors que **c'est elle qui fait NAÎTRE la
                            // scène** (vue `1b` : « choisir un fond fait naître
                            // la scène incrustée »). Cacher la porte d'une
                            // branche entière du composer coûte plus que cacher
                            // deux outils qui, eux, restent atteignables au
                            // balayage — et la tuile qui dépasse le dit.
                            if tool == .emoji, onPickBackground != nil {
                                backgroundColorToggle
                            }
                        }
                    }
                    // Le padding vertical vit ICI, dans le contenu défilant :
                    // posé sur le `ScrollView`, il rognerait la zone tactile des
                    // icônes au lieu de les aérer.
                    .padding(.vertical, 2)
                }
                if let toolRowTrailingAccessory {
                    // **L'occultation, en dégradé de la teinte du plateau.** Un
                    // outil qui glisse sous le drapeau doit s'y effacer, pas s'y
                    // superposer. Le dégradé est INVISIBLE tant que rien ne
                    // passe dessous — il va de la teinte transparente à la
                    // teinte pleine, sur la couleur que le meuble peint déjà.
                    toolRowTrailingAccessory
                        .background(
                            LinearGradient(
                                colors: [plateauTint.opacity(0), plateauTint],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            .frame(width: 44)
                            .offset(x: -22),
                            alignment: .leading
                        )
                }
            }
            .padding(16)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(ComposerDocumentCopy.toolRow))
        }
    }

    /// Un bouton d'outil de la rangée (extrait pour intercaler l'icône couleur).
    /// **Une TUILE : l'icône, et son mot dessous** (`1a`, #4071).
    ///
    /// Elle fut un glyphe nu. Les libellés existaient — traduits en sept langues
    /// par `ComposerDocumentCopy.label` — mais uniquement en `accessibilityLabel` :
    /// **lus par VoiceOver, jamais vus.** Mesuré le 2026-08-30 sur Meeshy-iOS26,
    /// la rangée alignait huit glyphes muets, dont deux paires que rien ne
    /// distingue à l'œil pour qui ne connaît pas le jeu SF — `photo`/`paperclip`
    /// et `mappin.and.ellipse`/`mic`.
    ///
    /// C'est la loi 12 : la complexité se paie dans le CODE, jamais chez
    /// l'utilisateur. Faire deviner une porte d'ingestion est le contraire.
    ///
    /// **Le mot est celui de l'app, pas celui de la maquette.** La cible écrit
    /// `PHOTO · CAMÉRA · EMOJI · DOC · LIEU · MICRO` ; le dépôt dit « Photos »,
    /// « Caméra », « Emoji », « Fichier », « Position », « Mentionner ». On garde
    /// le vocabulaire du dépôt : les abréviations de la maquette économisent de la
    /// place, elles ne tranchent pas un vocabulaire — et les remplacer orphelinerait
    /// sept catalogues pour un gain nul.
    ///
    /// `.caption2`, pas une taille en points : sur la seule surface où il faut LIRE
    /// pour choisir sa porte, ignorer Dynamic Type serait le pire endroit.
    private func toolButton(_ tool: ComposerDocumentTool) -> some View {
        Button {
            lastTappedTool = tool
            onTool?(tool)
        } label: {
            VStack(spacing: 6) {
                Image(systemName: tool.symbolName)
                    .font(.title3)
                    .symbolRenderingMode(.hierarchical)
                    .composerToolBounce(active: lastTappedTool == tool)
                Text(ComposerDocumentCopy.label(tool))
                    .font(.caption2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            .frame(minWidth: ComposerDocumentToolRowFit.minimumTileWidth)
            .padding(.vertical, 8)
            .padding(.horizontal, 6)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(MeeshyColors.textSecondary(isDark: true).opacity(0.22),
                                  lineWidth: 1)
            )
        }
        .accessibilityLabel(Text(ComposerDocumentCopy.label(tool)))
    }

    /// L'icône « couleur de fond » (#4031) — replie/déplie `backgroundStrip`.
    /// Active (palette dépliée) : teintée accent pour dire « ouvert ».
    @ViewBuilder
    private var backgroundColorToggle: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                showColorPalette.toggle()
            }
            HapticFeedback.light()
        } label: {
            // Même TUILE que ses voisines (#4071) : la rangée se lit comme une
            // famille, et un bouton qui porterait seul un glyphe nu au milieu de
            // six tuiles nommées se lirait comme un accident, pas comme un choix.
            VStack(spacing: 6) {
                Image(systemName: "paintpalette")
                    .font(.title3)
                    .symbolRenderingMode(.hierarchical)
                Text(ComposerDocumentCopy.backgroundShort)
                    .font(.caption2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .foregroundColor(showColorPalette
                ? Color(hex: MeeshyColors.brandPrimaryHex)
                : MeeshyColors.textSecondary(isDark: true))
            .frame(minWidth: ComposerDocumentToolRowFit.minimumTileWidth)
            .padding(.vertical, 8)
            .padding(.horizontal, 6)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(showColorPalette
                        ? Color(hex: MeeshyColors.brandPrimaryHex).opacity(0.55)
                        : MeeshyColors.textSecondary(isDark: true).opacity(0.22),
                                  lineWidth: 1)
            )
        }
        .accessibilityLabel(Text(ComposerDocumentCopy.background))
        // Le doc-comment ci-dessus écrivait la règle à l'envers — « Active
        // (palette dépliée) : teintée accent pour dire "ouvert" » : l'état ne
        // se disait QUE par la teinte, ce qui est exactement WCAG 1.4.1
        // (253i, #4266). Il se dit maintenant aussi.
        .toggleStateAccessibility(isToggle: true, isActive: showColorPalette)
    }

    /// **Le picker de couleur de fond (F2, #3885)** — « un post sans visuel
    /// devient une toile ». Une bande horizontale de pastilles sur la palette
    /// PARTAGÉE du SDK (`StoryBackgroundPalette.colors`, jamais recopiée) ;
    /// taper une couleur REMONTE au meuble (`onPickBackground`), qui pose le
    /// fond du socle. `nil` closure ⇒ aucune bande (loi 4) — la surface reste
    /// sans état.
    ///
    /// **Ne fait plus naître la scène (#3939, retour porteur 2026-08-27) :**
    /// choisir une couleur pose `documentBackground` (utile pour l'atelier
    /// quand il finira par s'incruster) mais ne bascule plus `mountedSurface`
    /// — cette bande reste donc temporairement SANS effet visuel tant que
    /// #3939 (incrustation du canvas dans l'écran document) n'est pas livré.
    /// La forme CIBLE — révéler la palette via l'icône de fond DANS `toolRow`,
    /// plutôt qu'un champ repliable séparé — appartient aussi à #3939 ; cette
    /// bande garde volontairement sa forme antérieure (toujours visible) dans
    /// cet incrément sûr, pour ne pas inventer un patron d'UI qui sera jeté.
    @ViewBuilder
    private var backgroundStrip: some View {
        // Repliée par défaut — dépliée par l'icône « couleur de fond » de la
        // toolRow (#4031). Ne s'affiche plus en permanence.
        if onPickBackground != nil && showColorPalette {
            BackgroundColorPalette(colors: StoryBackgroundPalette.colors) { hex in
                onPickBackground?(hex)
            }
        }
    }

    private func raiseKeyboardIfPromised() {
        guard focusesOnAppear else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.focusDelay) {
            isContentFocused = true
        }
    }
}

/// **Le rebond SF d'une icône d'outil, gardé derrière iOS 17.**
///
/// `.symbolEffect(.bounce)` n'existe qu'à partir d'iOS 17 ; la cible descend à
/// 16. Le garde passe par un `AnyView` plutôt qu'un `if #available` en
/// `@ViewBuilder` À DESSEIN : le second infère un `_ConditionalContent` qui
/// AJOUTE de la profondeur de type, et la pile d'un appareil réel (≈1 Mo,
/// contre 8 Mo au simulateur) déborde bien avant celle-ci — un défaut que le
/// gate simulateur ne verrait même pas. `AnyView` efface le type : profondeur
/// constante, aucun risque, au prix d'un coût d'exécution négligeable pour six
/// icônes.
private struct ComposerToolBounceModifier: ViewModifier {
    let active: Bool

    func body(content: Content) -> some View {
        guard #available(iOS 17.0, *) else { return AnyView(content) }
        return AnyView(content.symbolEffect(.bounce, value: active))
    }
}

extension View {
    /// Rebondit l'icône quand `active` bascule (l'outil vient d'être tapé).
    /// Statique et sûr en repli iOS 16.
    func composerToolBounce(active: Bool) -> some View {
        modifier(ComposerToolBounceModifier(active: active))
    }
}

/// **Une vignette du média choisi, retirable (B, #3883).**
///
/// Pour une IMAGE, la vraie miniature — chargée HORS du main thread
/// (`ComposerThumbnailDecoder`, tâche détachée) puis posée. Pour une vidéo ou un
/// document, un badge : « voir qu'un média est joint » sans générer de frame
/// (une image d'AVAsset est asynchrone et lourde — « un début », cf. décision
/// produit). La croix ôte l'élément, ce qui re-juge le format côté meuble.
/// **Quand un chip du rail porte sa croix (#4052).**
///
/// Le ✕ ne se peignait que sur le chip SÉLECTIONNÉ — correctif de pixel du
/// #4047 : à 40 pt il mange le quart du chip, et viser une vignette pour
/// NAVIGUER la supprimait.
///
/// Cette règle était TOTALE tant que tout média était une slide. Le #4052 a
/// rompu cette équivalence : un audio devient la bande-son de la scène, pas une
/// page du carrousel — il n'a donc aucune slide à sélectionner, son chip ne peut
/// jamais porter l'anneau, et **son ✕ ne s'affichait plus jamais**. Le vocal
/// devenait IRRETIRABLE : mesuré au simulateur le 2026-08-28.
///
/// Un chip qu'aucune slide ne peut sélectionner porte donc toujours sa croix —
/// c'est sa seule action, et un contrôle sans effet est ce que la loi 4
/// interdit. L'ordre « deux gestes pour supprimer » reste tenu partout où un
/// premier geste EXISTE.
nonisolated enum ComposerMediaChipAffordance {
    static func showsRemove(isSelected: Bool, isSelectable: Bool) -> Bool {
        isSelected || !isSelectable
    }
}


/// **Le menu de suppression d'une carte de son** (#4696).
///
/// Un modificateur plutôt qu'un `.contextMenu` posé en ligne : sans fermeture,
/// AUCUN menu ne se monte — un `.contextMenu` vide s'ouvrirait quand même, sur
/// rien, et un appui long qui répond par un cadre vide se lit comme une panne.

