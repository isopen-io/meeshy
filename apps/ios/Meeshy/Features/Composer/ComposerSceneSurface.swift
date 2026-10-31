import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// **La surface de SCÈNE — la quatrième vue du meuble** (planche § P4
/// et tâche 4.3).
///
/// ## Pourquoi elle existe
///
/// La scène incrustée n'est pas un `if showsScene` dans
/// `ComposerDocumentSurface` : elle aurait ses propres entrées — la slide,
/// son ratio, les relais de sélection, l'inspecteur, la description —
/// chacune une exception que la règle du DOCUMENT devrait porter.
///
/// C'est exactement ce que la tâche 4.3 de la planche a fermé pour le mood :
///
///   > « `.mood` devient une SURFACE, pas un cas du document. […] une humeur
///   > n'est pas un post court, et la traiter comme tel obligeait chaque règle
///   > du document à porter une exception. »
///
/// Une scène n'est pas un document avec une image. Elle a ses portes, ses
/// contrôleurs, sa géométrie et sa description ; les loger dans le document
/// obligerait ce dernier à savoir ce qu'est un `MeeshySceneObject`.
///
/// ## Ce qu'elle porte, et sur quel niveau du modèle
///
/// | zone | niveau |
/// |---|---|
/// | barre haute (`ComposerTopBar`) | la `MeeshyPublication` |
/// | rail *leading* — les portes | crée un `MeeshySceneObject` (sauf « description ») |
/// | la scène, cadrée sur le viewport entier | une `MeeshyScene` |
/// | rail *trailing* — les contrôleurs | UN `MeeshySceneObject` |
/// | la description | la `MeeshySlide` |
///
/// Le SOCLE n'est pas ici : il vit au meuble, sous les trois surfaces, et ne
/// bouge jamais (loi 5).
struct ComposerSceneSurface: View {

    // MARK: - La publication

    /// **Le rail des SCÈNES**, monté par l'hôte.
    /// Slot opaque, comme `formatFan` : une mini-preview demande les effets
    /// vivants et les bitmaps chargés, donc le ViewModel — que cette surface ne
    /// connaît pas. `nil` ⇒ pas de rail.
    var slideRailSlot: AnyView?
    let onClose: () -> Void

    // MARK: - La scène

    @Binding var slide: StorySlide
    let aspectRatio: CGFloat
    let plateauTint: Color
    var sceneImages: [String: UIImage] = [:]
    /// Octets animés des stickers collés, keyés par `sticker.id`.
    var sceneStickerAnimations: [String: Data] = [:]
    var sceneImagesVersion: UInt64 = 0
    /// Les médias adoptés rendus à leur fichier local : l'échange avec l'URL
    /// téléversée ne se voit pas.
    var sceneLocalMediaAliases: [String: URL] = [:]
    var onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?

    /// **« Modifier » — l'appui long, et l'action VoiceOver du même nom**
    /// (vue `1d`).
    ///
    /// Sans ce rappel, `hasEditor` serait faux et le
    /// menu n'offrirait que deux actions sur quatre. `editableKinds` dit à quels
    /// objets le MEUBLE sait répondre — `[.text]` ici, tant qu'aucun éditeur
    /// média n'y est monté — pour que « Modifier » ne paraisse jamais
    /// sur un objet que personne n'éditera.
    var onItemEdit: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?
    /// **« Rogner » dans l'appui long** : les actions possibles apparaissent au
    /// long press, pas dans un rail de contrôleurs.
    var onItemTrim: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil
    /// **Le menu d'appui long, peint par le meuble en verre.** Le
    /// canvas remet l'objet et le point du doigt normalisé sur la carte ; une
    /// puce sonore, que le canvas ne peint pas, le demande par son propre appui
    /// long.
    var onItemMenu: ((String, StoryCanvasUIView.CanvasItemKind, CGPoint) -> Void)? = nil
    /// **Les familles dont l'hôte sait ouvrir l'éditeur.**
    ///
    /// Les cinq familles ont leur fenêtre et leur timeline dans l'éditeur
    /// d'objet : les quatre autres s'y ouvrent comme le texte.
    ///
    /// **Ce jeu et le `switch` d'`onItemEdit` se tiennent la main** : servir
    /// l'un sans l'autre rend « Modifier » offert et INERTE — le doc-comment de
    /// l'hôte le dit, et `ComposerSceneEditableKindsTests` le garde plutôt que
    /// de le rappeler.
    var editableSceneKinds: Set<StoryCanvasUIView.CanvasItemKind> = defaultEditableSceneKinds

    /// Le défaut, NOMMÉ pour que la garde puisse le lire — un littéral posé dans
    /// une valeur par défaut n'est interrogeable que par la source.
    static let defaultEditableSceneKinds: Set<StoryCanvasUIView.CanvasItemKind> = [
        .text, .media, .sticker, .place, .audio
    ]

    var onBackgroundTapped: (() -> Void)?

    /// **L'appui long sur une scène VIDE ouvre la caméra** (planche
    /// `2b`). L'hôte décide du mode ; la surface ne fait que transmettre.
    var onBackgroundLongPressed: (() -> Void)?

    /// **L'appui long sur un média DE FOND demande son MENU.**
    ///
    /// Distinct du jumeau ci-dessus, qui appartient au viseur : une scène qui
    /// porte un fond n'est pas vide. Tant que le meuble ne le branche pas, la
    /// règle du canvas (`StoryCanvasBackgroundLongPress`) retombe sur le viseur
    /// — le geste ne devient jamais muet en attendant son hôte.
    var onBackgroundMediaLongPressed: ((String) -> Void)?

    /// **La durée d'un appui long ARMÉ** : la translation pendant qu'on
    /// tient, puis le relâchement. Le `.began` seul ouvre un objectif ; ces
    /// deux-là permettent de TENIR une prise.
    var onBackgroundLongPressChanged: ((CGPoint) -> Void)?
    var onBackgroundLongPressEnded: (() -> Void)?

    /// **L'étape du viseur — la seule chose que la scène ait encore besoin de
    /// savoir de la caméra**.
    ///
    /// La surface ne PEINT pas le viseur ; elle n'en publie que la place
    /// (`ComposerSceneCameraFrameKey`), le meuble le montant en un site unique
    /// pour couvrir le socle. Tout le reste du contrat caméra — session,
    /// permission, taille, mode, flash, segments et leurs onze rappels — vit
    /// avec la vue qui les lit.
    ///
    /// Ce champ reste parce qu'un autre consommateur le lit ici : la zone de
    /// description s'efface pendant qu'on cadre
    /// (`ComposerSceneCameraOverlay.isServed(.description, stage:)`). Le
    /// garder « au cas où » serait une dette ; le garder pour un lecteur
    /// nommé est un contrat.
    var cameraStage: ComposerSceneCameraStage = .off

    /// **L'indication grise d'une scène vide** — déjà résolue par le
    /// meuble (`ComposerSceneQuickCapture`). `nil` ⇒ rien à dire.
    var quickCaptureHint: ComposerSceneQuickCapture.Hint?

    // MARK: - Le mode de l'outil, et ce que la colonne du repos relaie

    /// **Ce que la scène outille** — déjà résolu par `ComposerRailMode.resolve`.
    /// Un outil ouvert (`.tool`) retire le chrome du repos ; la vue ne
    /// re-filtre rien : une seconde loi 4 divergerait de la première.
    var railMode: ComposerRailMode = .doors([])

    /// L'appui long du bouton Média : la photothèque propose ses sources.
    var onRailDoorLongPress: ComposerRailDoorLongPressHandler?

    /// Le bouton SYSTÈME — le collage, sous la colonne du repos. Une vue
    /// entière, parce qu'un `PasteButton` doit ÊTRE le bouton pour garder son
    /// privilège : accès au presse-papier sans bannière, et extinction
    /// automatique quand il n'y a rien à coller.
    var railSystemEntry: AnyView?

    /// Les contrôleurs SERVIS — déjà filtrés par `ComposerTrailingRailPolicy`.
    var trailingActions: [StoryCanvasContextAction] = []
    var onTrailingAction: ((StoryCanvasContextAction) -> Void)?

    /// **Les options du moment, en haut du rail droit** — les
    /// contrôleurs de l'outil ouvert ou les options de l'objet touché, puis
    /// leur `(x)`. Déjà composées par `ComposerTrailingColumn.options` :
    /// cette vue ne re-filtre rien.
    var trailingOptions: [ComposerTrailingColumn.Entry] = []
    var onTrailingOption: ((ComposerTrailingColumn.Entry) -> Void)?

    /// **L'HISTORIQUE, posé en haut à droite de la scène** (#13839).
    /// `nil` ⇒ rien à défaire, donc aucun bouton : la
    /// surface ne re-décide rien, le meuble a déjà posé la question.
    var onUndo: (() -> Void)?
    var onRedo: (() -> Void)?

    // **Aucune rangée de jetons d'état sous la scène** (#13839, L4) : une
    // sélection est silencieuse (directive porteur), et la frappe
    // porte ses réglages dans la barre collée au clavier.

    /// Un outil est-il ouvert ? Lu sur `railMode`, la seule source qui le
    /// SAIT — voir `ComposerObjectChips.isServed`.
    private var toolIsOpen: Bool {
        ComposerToolFocus.toolIsOpen(railOpensTool: railMode.opensTool, editsInline: editsInline)
    }


    /// **Ce que le canvas ENCADRE, et ce qu'il en dit** (vue `1c`).
    ///
    /// Déjà résolus par le meuble — cette vue ne re-filtre rien, exactement
    /// comme pour les deux rails, la bande et les jetons. Le badge est une
    /// chaîne DÉJÀ composée : sa forme est du vocabulaire produit, et la
    /// composer ici la mettrait hors de portée d'un témoin.
    var selectedItemId: String?
    var selectionBadge: String?
    /// **La barre de la sélection** (#13839, L5), déjà composée par le meuble :
    /// `nil` ⇒ rien de sélectionné, la colonne des outils reparaît.
    var selectionBar: ComposerSelectionBar?

    // MARK: - La bande contextuelle

    /// La bande OUVERTE — déjà résolue par `ComposerSceneBand.opened`. `nil` ⇒
    /// le bas ne porte que le socle. Cette vue ne re-filtre rien : une
    /// seconde loi 4 divergerait de la première, exactement comme pour les
    /// deux rails.
    ///
    /// **Pas de contenu injecté pour la timeline ni les styles de texte** :
    /// ils éditent un objet déjà posé, et la première vue n'édite pas. Leurs
    /// jumelles vivent dans l'éditeur plein écran — `.media(.trim)` et `.tool(.style)`.
    var band: ComposerSceneBand?
    var bandColors: [String] = []
    var onPickBandColor: ((String) -> Void)?

    /// L'effet d'ouverture, servi par la même bande que les couleurs — c'est
    /// le contenu du panneau « Fond » de l'atelier, en entier.
    var bandOpeningEffect: StoryTransitionEffect?
    var onPickBandOpening: ((StoryTransitionEffect?) -> Void)?
    /// Le panneau Cadre : le cadrage et le fond que le meuble lit sur
    /// la slide, et les deux écritures qu'il en attend.
    var bandFitMode: String = StoryBackgroundFraming.fill
    var bandBackdrop: StoryBackdrop = .blur
    var onPickBandFitMode: ((String) -> Void)?
    var onPickBandBackdrop: ((StoryBackdrop) -> Void)?


    /// **Le repos posé sur la scène** (#13839) : le nombre de diapos (la
    /// rangée paraît dès deux), les six boutons de la colonne, le menu ⋯ et
    /// la barre de dessin. Un carrousel d'effets ouvert compte comme un
    /// panneau du bas : la colonne lui cède.
    var slideCount: Int = 1
    var restTools: [ComposerRestTool] = []
    var onRestTool: ((ComposerRestTool) -> Void)?
    var moreMenu: AnyView?
    var drawingBar: AnyView?
    var sceneEffectIsOpen: Bool = false

    // MARK: - Le grand écran (#13839, L6)

    /// Résolue par le meuble depuis la taille de sa racine. En rails, le chrome
    /// du repos cède aux deux rails libellés et la scène rend leur couloir.
    var rails = ComposerSceneRailsContext()
    private var arrangement: ComposerSceneArrangement { rails.arrangement }

    /// **Le mode Animé** : la frise qui prend le bas tant qu'elle est
    /// ouverte, et le pont qui la laisse piloter le canvas. Sa bascule vit dans
    /// « ⋯ › Animation » (#13839) ; `onTimeButton` ne sert plus que la colonne
    /// qui referme la frise ouverte.
    var onTimeButton: (() -> Void)? = nil
    var timeIsOpen: Bool = false
    var timelinePanel: AnyView?
    var timelineBridge: StoryCanvasTimelineBridge?

    /// **Le panneau d'OPTIONS de l'outil déplié**, monté sous la scène
    /// Les BULLES vivent au rail ; ce qui a
    /// besoin de largeur — palette, glissière — vit ici.
    ///
    /// **Il ne porte que le DESSIN.** Les dix-huit
    /// styles et les sept autres outils de texte vivent dans l'éditeur plein
    /// écran avec le reste de l'édition ; ce qui reste ici règle le PINCEAU,
    /// c'est-à-dire le geste qui AJOUTE — pas un objet déjà posé. Le meuble
    /// tient la distinction (`ComposerFirstView.lowZoneShowsToolOptions`).
    var toolOptions: AnyView?
    /// **Un objet s'édite EN PLACE** (le fond comme toutes
    /// les familles) : ses sous-outils au rail droit — et tout le reste du
    /// chrome cède, comme à un outil du rail (`ComposerToolFocus.toolIsOpen`).
    var editsInline: Bool = false
    /// **L'auteur ÉCRIT une légende ou le corps du post** —
    /// clavier levé : les rails et les étages du bas lui cèdent la place,
    /// par `ComposerToolFocus.isShown(_:toolIsOpen:writesText:)`.
    var writesText: Bool = false
    /// **Et ce qu'il écrit est le CORPS du post** : le panneau du corps
    /// recouvre le volet de légende, qui sort alors de l'arbre.
    var writesPostBody: Bool = false
    /// **Les options du sous-outil ouvert, à droite, depuis le haut** —
    /// le panneau entier, déjà composé et placé (`ComposerInlineToolPanel`) ;
    /// la surface le pose sur la scène libre, à côté de la colonne droite.
    var inlinePanel: AnyView?
    /// Le pied du rail droit suit-il ses sous-outils, sans ressort ?
    /// (`ComposerTrailingColumn.footFollowsOptions`)
    var trailingFootFollowsOptions: Bool = false

    /// L'édition EN LIGNE, relayée au canvas : le texte se saisit à sa vraie
    /// place, dans sa vraie police, sur le vrai fond.
    var editingTextId: String?
    var onInlineTextChanged: ((String, String) -> Void)?
    var onInlineTextEditEnded: ((String) -> Void)?
    /// La barre collée au clavier et le panneau qui le remplace (#13839, L4).
    var inlineEditInputLink: StoryInlineEditInputLink?

    /// **La bande de mention du texte de SCÈNE n'est pas sur cette surface.**
    ///
    /// Elle interprète la frappe INLINE sur le canvas. Or la frappe
    /// n'a pas lieu ici : `openObjectEditor` est le seul chemin vers l'édition
    /// d'un texte — `enterTextEditingMode` n'a que deux appelants, et
    /// tous deux montent l'écran modal par-dessus cette surface. La bande serait
    /// donc peinte sous un écran plein, pour une requête `@` qui se forme
    /// ailleurs.
    ///
    /// Elle vit dans `ComposerObjectEditorView`, où le doigt tape.

    /// **Le volet de description, replié ou non.** Construit par le
    /// MEUBLE — la surface n'a ni le texte, ni le binding de repli, ni le
    /// chemin vers la saisie ; elle sait seulement OÙ il va.
    ///
    /// `nil` quand le meuble n'en sert pas (loi 4 : une surface qui peint un
    /// volet sans rien derrière promettrait une description qu'on ne peut pas
    /// écrire).
    var descriptionPanel: AnyView?

    /// **La surface de dessin, posée SUR la scène.** `nil` ⇒ aucun dessin en
    /// cours, et le canvas garde son calque persisté ; non-`nil` ⇒ le canvas
    /// doit le RETIRER, sans quoi le trait s'affiche deux fois.
    var drawingSurface: AnyView?

    // MARK: - Le son de FOND de la slide

    /// **Le fond sonore dont la scène montre la trace** — `nil` ⇒ aucun fond,
    /// et le bas de l'écran reste ce qu'il était.
    ///
    /// La surface le REÇOIT, elle ne le cherche pas : le meuble le résout par
    /// `avatarBadgeSound`, qui applique la loi de `ComposerSoundColumn` — la
    /// place dit le FOND, et un son de CONTENU n'y paraît jamais.
    ///
    /// **La même valeur qu'affiche la surface document**, et c'est le point du
    /// lot : un son de fond posé sur une story se lisait nulle part pendant
    /// qu'il se lisait à côté de l'avatar sur un post.
    var backgroundSound: StoryAudioPlayerObject?

    /// **Ce que le doigt ouvre sur la trace** — `nil` ⇒ elle reste une lecture.
    ///
    /// Le RETRAIT passe par là : la feuille porte le (x)
    /// de `deleteEditedSound`, et son doc-comment dit pourquoi le geste vit là
    /// et nulle part ailleurs — « trois boutons dispersés auraient été trois
    /// lois ». Deux gestes, ce que la dimension 7 demande.
    var onEditBackgroundSound: (() -> Void)?

    /// **Le RETRAIT du son de fond, par appui long.**
    ///
    /// `nil` ⇒ aucun menu. Deux cas le rendent : aucun fond, et un fond LEGACY
    /// — celui que `resolvedBackgroundAudio` synthétise depuis
    /// `backgroundAudioId`, qui n'a aucun objet à supprimer. Le meuble tranche ;
    /// la surface ne fait que peindre ce qu'elle reçoit.
    var onDeleteBackgroundSound: (() -> Void)?

    /// **Sortir le son du FOND pour le poser sur la scène**, par l'appui
    /// long de la trace. `nil` ⇒ l'entrée disparaît — un fond LEGACY n'a aucun
    /// objet à basculer, et l'hôte le sait avant nous.
    var onPromoteBackgroundSound: (() -> Void)?

    // MARK: - Ce que la publication EMPORTE

    /// Les balises DÉRIVÉES du texte de la publication, sans leur `#`. La
    /// surface les REÇOIT : les dériver ici ouvrirait un second chemin vers le
    /// même fait, et `ComposerHashtags` est le premier.
    var sceneHashtags: [String] = []

    /// Les personnes que la publication nomme, **tous modes confondus**. Ni
    /// l'hôte ni la surface ne filtrent : le pied monte `ReferenceNoteRow`, qui
    /// est le site unique de l'exclusion `.inline` / `.silent` / `.pinned`.
    /// Filtrer en amont recréerait la divergence que ce montage évite.
    var sceneReferences: [ComposerReference] = []

    /// Les deux feuilles qui existent déjà — `nil` ⇒ le pied reste une lecture
    /// et ne s'annonce pas activable (loi 4).
    var onOpenHashtags: (() -> Void)?
    var onOpenMentions: (() -> Void)?

    // MARK: - La description

    @Binding var description: String
    let descriptionPlaceholder: String


    /// **Les boutons de CONTRÔLE, à GAUCHE**
    ///
    /// Un outil ouvert y remplace les portes par SES contrôleurs et leur `(x)`,
    /// et tout le reste du chrome s'efface : la
    /// place reste celle où l'on agit, l'outil en cours en est le seul
    /// occupant — `ComposerToolFocus` en porte la règle.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// **L'écran LARGE** — la loi `ComposerSceneArrangement` a posé les rails
    /// (#13839, L6) : la place libre décide, jamais la classe de taille. Marges
    /// de 24 pt, contrôleurs centrés en hauteur, volet de texte aligné sur la
    /// carte. Sans rails, la disposition du pouce.
    private var isRoomy: Bool { arrangement == .rails }
    private var edge: CGFloat { ComposerRailGeometry.edgeMargin(roomy: isRoomy) }

    /// **Le chrome du repos, posé SUR la scène** (#13839, qui renverse #4561 et #4633). Le rail gauche, la colonne
    /// droite du repos, la barre haute et la rangée basse sont partis : ✕, la
    /// rangée des diapos, ↶ ↷ et les six boutons ronds se posent sur la scène,
    /// et `ComposerRestChrome` dit ce qui paraît, état par état.
    private var restState: ComposerRestChrome.State {
        ComposerRestChrome.State(toolIsOpen: toolIsOpen,
                                 writesText: writing.writesText,
                                 cameraIsArmed: cameraStage != .off,
                                 bottomPanelIsOpen: band != nil || timelinePanel != nil || sceneEffectIsOpen,
                                 timelineIsOpen: timelinePanel != nil,
                                 objectIsSelected: selectionBar != nil)
    }

    /// La colonne droite ne sert plus le repos : ses effets de scène vivent
    /// dans ⋯. Elle reste pour un outil ouvert (hors dessin, qui a sa barre) ;
    /// un objet sélectionné a sa barre d'actions (L5).
    private var trailingRailIsShown: Bool {
        guard ComposerToolFocus.isShown(.trailingRail, toolIsOpen: toolIsOpen, writesText: writesText),
              drawingBar == nil else { return false }
        let servesSomethingElse = trailingOptions.contains { entree in
            if case .sceneEffect = entree { return false }
            return true
        }
        return toolIsOpen || servesSomethingElse || !trailingActions.isEmpty
    }

    private var historyIsOnTheScene: Bool { ComposerRestChrome.historyIsShown(restState) }

    private var railLaneLeading: CGFloat {
        ComposerSceneRailsInsets.insets(arrangement: arrangement, showsSlideRow: false).leading
    }

    private var showsRailsSlideRow: Bool {
        ComposerRestChrome.showsSlideRow(slideCount: slideCount) && slideRailSlot != nil
    }

    private var railsLayer: some View {
        ComposerSceneRailsLayer(
            leading: ComposerLabeledRail(tools: restTools, moreEntries: rails.moreEntries, openEntry: rails.openEntry,
                                         onClose: onClose, onTool: { onRestTool?($0) },
                                         onMore: rails.onMore,
                                         plus: rails.plus,
                                         mediaLongPress: onRailDoorLongPress,
                                         sound: .init(trace: backgroundSound, onEdit: onEditBackgroundSound,
                                                      onDelete: onDeleteBackgroundSound,
                                                      onPromote: onPromoteBackgroundSound),
                                         pasteEntry: railSystemEntry),
            selection: ComposerSelectionRail(selection: selectionBar, onUndo: onUndo, onRedo: onRedo),
            selectionIsShown: !trailingRailIsShown,
            slideRow: slideRailSlot,
            showsSlideRow: showsRailsSlideRow,
            isServed: ComposerLabeledRailLayout.railsAreServed(writesText: writing.writesText || editingTextId != nil,
                                                               cameraIsArmed: cameraStage != .off))
    }

    /// Une feuille ancrée ouverte retire le repos (#13839, L3) : la scène
    /// réduite ne porte que ce qu'on édite.
    private var restChrome: some View {
        restChromeContent
            .opacity(restChromeServed ? 1 : 0)
            .allowsHitTesting(restChromeServed)
            .accessibilityHidden(!restChromeServed)
    }

    private var restChromeContent: some View {
        ComposerSceneOverlayChrome(state: restState,
                                   slideRow: slideRailSlot,
                                   slideCount: slideCount,
                                   onClose: onClose,
                                   onUndo: onUndo,
                                   onRedo: onRedo,
                                   tools: restTools,
                                   onTool: onRestTool,
                                   mediaLongPress: onRailDoorLongPress,
                                   moreMenu: moreMenu,
                                   sound: .init(trace: backgroundSound,
                                                onEdit: onEditBackgroundSound,
                                                onDelete: onDeleteBackgroundSound,
                                                onPromote: onPromoteBackgroundSound),
                                   pasteEntry: railSystemEntry,
                                   selectionBar: selectionBar)
    }

    /// **Le volet de description, borné à la CARTE.**
    ///
    /// Les marges valent la place d'un rail de chaque côté (`lane`) : sans
    /// elles, le volet s'étalerait sur toute la largeur et croiserait les deux
    /// rails, qui flottent sur la scène à cette hauteur. Elles ne se lisent pas
    /// des couloirs (`sceneInset`), qui valent zéro avec la scène plein écran
    /// — le volet recouvrirait alors le bas des deux rails.
    @ViewBuilder
    private var descriptionOverlay: some View {
        if let descriptionPanel {
            descriptionPanel
                .padding(.horizontal, ComposerRailGeometry.descriptionInset(roomy: isRoomy,
                                                                             cardLeading: sceneCardLeading))
                .padding(.bottom, MeeshySpacing.smPlus)
                .environment(\.composerSceneCardWidth, sceneCardWidth)
        }
    }

    /// Le bord gauche du DESSIN, mesuré par le canvas et lu par l'en-tête son
    /// (#5011). `0` tant que la première passe de mise en page n'a pas eu lieu.
    @State private var sceneCardLeading: CGFloat = 0

    @Environment(\.composerAnchoredSheetTop) private var anchoredSheetTop
    private var restChromeServed: Bool {
        ComposerSceneFraming.restChromeIsShown(sheetIsOpen: anchoredSheetTop != nil)
    }

    /// La largeur du DESSIN, mesurée par le canvas : la flèche du volet
    /// s'y proportionne. `0` avant la première passe ⇒ le volet se mesure seul.
    @State private var sceneCardWidth: CGFloat = 0

    /// Le cadre du DESSIN dans l'écran : le panneau d'options s'y repère pour
    /// laisser voir l'objet qu'il règle.
    @State private var sceneCardFrame: CGRect = .null

    /// Le cadre de la scène LIBRE, dans le même repère que la carte : le rail
    /// droit s'y borne à la hauteur de la carte (#10542).
    @State private var freeZoneFrame: CGRect = .null

    /// Les marges verticales du rail droit : du haut de la carte, et au-dessus
    /// de la remontée tant que sa colonne y tient (`trailingRailBand`).
    private var trailingBand: ComposerRailBand {
        let pied = [onUndo != nil, onRedo != nil, !toolIsOpen && onTimeButton != nil].filter { $0 }.count
        return ComposerRailGeometry.trailingRailBand(
            freeZone: freeZoneFrame, card: sceneCardFrame,
            columnHeight: ComposerRailGeometry.columnHeight(entries: trailingOptions.count + pied,
                                                            withSpring: !trailingFootFollowsOptions))
    }

    /// **La hauteur des étages du bas, mesurée** — ce qu'un panneau
    /// ouvert y occupe, et donc de combien la scène doit REMONTER.
    @State private var lowerFloorsHeight: CGFloat = 0

    private var writing: ComposerWriting {
        ComposerWriting.resolve(editsSceneDescription: writesText, editsPostContent: writesPostBody)
    }

    private var sceneLiftInset: CGFloat {
        ComposerSceneLift.bottomInset(
            panelIsOpen: ComposerSceneLift.panelIsOpen(
                lowZone: ComposerLowZone.resolve(toolIsOpen: toolIsOpen, band: band),
                toolOptionsServed: toolOptions != nil),
            panelHeight: lowerFloorsHeight)
    }

    // MARK: - La scène PREND LE VIEWPORT, le chrome flotte dessus

    /// **Deux calques, et c'est toute la disposition** (maquette
    /// `docs/product/composer-plein-ecran/iOS.dc.html` : « la scène est en plein
    /// écran et le reste des contrôleurs sont par-dessus la scène »).
    ///
    /// La carte vivait dans une `VStack`, entre la barre haute et les rangées du
    /// bas : chaque bande qu'on y ajoutait lui prenait sa hauteur, et elle ne
    /// pouvait JAMAIS occuper l'écran. Elle se cadre sur le viewport
    /// entier (`ignoresSafeArea`), et barre haute, trace du son, rails, volet,
    /// bandes et rangée basse forment un calque qui flotte par-dessus. Le socle
    /// du meuble flotte au-dessus des deux (`composerFloatingSocle`) : il réduit
    /// la zone sûre du calque de chrome, jamais celle de la scène.
    ///
    /// Le calque de chrome ne prend aucun doigt hors de ses contrôles : ses vides
    /// sont des `Spacer`, que SwiftUI ne teste pas — les gestes de la scène
    /// l'atteignent partout où aucun contrôle n'est posé.
    var body: some View {
        ZStack {
            sceneLetterbox
            sceneLayer
            chromeLayer
            if arrangement == .rails { railsLayer } else { restChrome }
        }
        .onPreferenceChange(ComposerSceneCardLeadingKey.self) { sceneCardLeading = $0 }
        .onPreferenceChange(ComposerSceneCardWidthPreferenceKey.self) { sceneCardWidth = $0 }
        .onPreferenceChange(ComposerSceneCardFrameKey.self) { sceneCardFrame = $0 }
        .onPreferenceChange(ComposerFreeZoneFrameKey.self) { freeZoneFrame = $0 }
        .onPreferenceChange(ComposerLowerFloorsHeightKey.self) { lowerFloorsHeight = $0 }
        // **La bascule outil <-> scène se fait en fondu**, coupé sous
        // Reduce Motion ; VoiceOver est prévenu que l'écran a changé, et son
        // curseur rejoint le rail qui porte les réglages et le `(x)`.
        .animation(ComposerToolFocus.transition(reduceMotion: reduceMotion), value: toolIsOpen)
        // **Écrire efface les rails et les étages du bas, et les rend**
        // — en fondu, à l'aller comme au retour : rien ne saute.
        // Au retour, le chrome attend que le panneau du corps soit parti
        // — sinon le panneau sortant passe sur les rangées qui reviennent.
        .animation(ComposerWritingExit.chromeAnimation(reduceMotion: reduceMotion, writesText: writesText),
                   value: writesText)
        .adaptiveOnChange(of: toolIsOpen) { _, _ in
            UIAccessibility.post(notification: .layoutChanged, argument: nil)
        }
        // **La barre de statut s'efface** : la croix et le `⋯` se posent
        // « un peu plus haut pour ne pas être sur la scène ».
        // Comme le lecteur de stories : la rangée de l'horloge rend sa hauteur,
        // et la croix monte dans celle de la Dynamic Island, aux coins.
        .statusBarHidden(true)
    }

    /// **Le SOL de la scène : le thumbhash de son propre résultat** (directive
    /// porteur : « la scène doit avoir un sol peint en thumbhash du
    /// résultat de la scène »).
    ///
    /// Une scène 9:16 est moins haute qu'un iPhone, et elle se cadre entre la
    /// barre haute et le socle : ce qu'elle laisse du viewport n'est pas un
    /// plateau, c'est son SOL — la loi du lecteur (`SceneBackdropView`,
    /// `.thumbHash`), peinte du hachage du COMPOSITE de la slide, ce que la
    /// publication emportera. Le composer et le lecteur posent ainsi la même
    /// scène sur le même sol.
    ///
    /// Tapable comme le fond du canvas, dont il prolonge l'apparence ; inerte
    /// pendant un tracé, qui possède l'écran entier.
    private var sceneLetterbox: some View {
        // **Le sol est BORNÉ par un calque neutre** : en dessin, les
        // contrôleurs ne doivent pas « s'étirer et sortir » du viewport.
        // `SceneBackdropView` peint le thumbhash en `.scaledToFill()` et laisse
        // l'hôte clipper : une image en fill ANNONCE la taille de son
        // remplissage, plus large que l'écran dès que son rapport diffère —
        // et le calque de la surface s'élargissait d'autant, emportant la
        // croix, la carte et les pinceaux hors de l'écran. `Color.clear`
        // prend la taille proposée ; l'`overlay` ne peut plus la changer.
        Color.clear
            .overlay {
                if let teinte = ComposerSceneFloorRules.backdropColor(slide: slide) {
                    teinte
                } else {
                    SceneBackdropView(backdrop: .thumbHash, thumbHash: floorHash)
                }
            }
            .clipped()
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture { onBackgroundTapped?() }
            .allowsHitTesting(drawingSurface == nil && timelinePanel == nil)
            .task(id: ComposerSceneFloorRules.key(slide: slide, imagesVersion: sceneImagesVersion)) {
                // Anti-rebond : un geste de cadrage change la clé à chaque image,
                // et le sol n'a pas à suivre le doigt — il suit la COMPOSITION.
                try? await Task.sleep(nanoseconds: 200_000_000)
                guard !Task.isCancelled else { return }
                floorHash = StorySlideRenderer.computeThumbHash(slide: slide,
                                                                bgImage: nil,
                                                                loadedImages: sceneImages)
            }
    }

    @State private var floorHash: String?
    /// Le haut du clavier (repère global) et le mouvement qui l'y amène.
    @State private var keyboardTop: CGFloat?
    @State private var keyboardTiming: ComposerKeyboardMotion.Timing?

    /// **La scène est le plus grand 9:16 de la zone** (#13839) : ni carte ni
    /// couloir, et elle descend sous le socle, qui se pose dessus. Un panneau
    /// ouvert en bas la RÉDUIT par une échelle ancrée en haut et un décalage —
    /// une seule transaction, sans nouvelle mise en page du canvas : aucun
    /// objet ne saute pendant le geste (`ComposerSceneFit`).
    private var sceneLayer: some View {
        GeometryReader { geo in
            let zone = CGRect(origin: .zero, size: geo.size)
            let scene = ComposerSceneFit.frame(in: zone, aspectRatio: aspectRatio)
            let lift = ComposerSceneFit.lift(scene: scene, visibleBottom: visibleBottom(in: geo))
            sceneCanvas
                .frame(width: geo.size.width, height: geo.size.height)
                .scaleEffect(lift.scale,
                             anchor: UnitPoint(x: 0.5, y: geo.size.height > 0 ? scene.minY / geo.size.height : 0))
                .offset(y: lift.offsetY)
                .animation(liftAnimation, value: lift)
        }
        .padding(ComposerSceneRailsInsets.insets(arrangement: arrangement, showsSlideRow: showsRailsSlideRow))
        .ignoresSafeArea(.container, edges: arrangement == .rails ? [] : .bottom)
        .ignoresSafeArea(.keyboard)
        .allowsHitTesting(timelinePanel == nil)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) {
            keyboardMoved($0)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) {
            keyboardMoved($0, hidden: true)
        }
    }

    /// **La scène se réduit DANS le mouvement du clavier** (#13839, L4) : la
    /// durée et la courbe de la notification, sinon son propre ressort.
    private var liftAnimation: Animation? {
        guard !reduceMotion else { return nil }
        guard let timing = keyboardTiming, ComposerKeyboardMotion.drivesLift(timing, now: Date()) else {
            return .spring(response: 0.32, dampingFraction: 0.88)
        }
        return ComposerKeyboardMotion.animation(timing)
    }

    private func keyboardMoved(_ note: Notification, hidden: Bool = false) {
        let duree = note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
        let fin = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
        keyboardTiming = ComposerKeyboardMotion.timing(duration: duree, at: Date())
        keyboardTop = hidden ? nil : fin.flatMap {
            ComposerKeyboardMotion.keyboardTop(endFrame: $0, windowFrame: WindowMetrics.activeWindowFrameInScreen)
        }
    }

    /// Le bas visible de la scène, dans son propre repère : le haut des étages
    /// du bas quand un panneau y est ouvert, sinon le bas de la zone.
    /// Une feuille ancrée du meuble borne aussi la scène (#13839, L3) : le plus
    /// haut des deux obstacles gagne (`ComposerSceneFraming`).
    private func visibleBottom(in geo: GeometryProxy) -> CGFloat {
        let panneau: CGFloat? = sceneLiftInset > 0 && !freeZoneFrame.isNull ? freeZoneFrame.maxY : nil
        // La barre et le clavier — ou le panneau qui le remplace, de la même
        // hauteur — bornent la scène pendant qu'on écrit SUR elle.
        let clavier: CGFloat? = editingTextId != nil ? keyboardTop : nil
        return ComposerSceneFraming.visibleBottom(zoneHeight: geo.size.height,
                                                  zoneMinY: geo.frame(in: .global).minY,
                                                  obstructionTops: [panneau, anchoredSheetTop, clavier])
    }

    private var sceneCanvas: some View {
        EmbeddedSceneCanvas(
            slide: $slide,
            aspectRatio: aspectRatio,
            cornerRadius: MeeshyRadius.xlPlus,
            // **Le dessin se pose DANS la carte, pas sur le cadre** : un
            // trait hors du canvas est perdu à la publication.
            canvasOverlay: drawingSurface,
            // Les sons posés sur la scène — retirés pendant le dessin,
            // dont le calque prend la carte entière.
            objectOverlay: drawingSurface == nil
                ? { taille in AnyView(ComposerSceneSoundChips(
                    slide: $slide, canvasSize: taille, selectedItemId: selectedItemId,
                    onItemTapped: onItemTapped, onItemMenu: onItemMenu)) }
                : nil,
            onItemTapped: onItemTapped,
            onItemDoubleTapped: onItemEdit,
            editableKinds: editableSceneKinds,
            onBackgroundTapped: onBackgroundTapped,
            onBackgroundLongPressed: onBackgroundLongPressed,
            onBackgroundMediaLongPressed: onBackgroundMediaLongPressed,
            onBackgroundLongPressChanged: onBackgroundLongPressChanged,
            onBackgroundLongPressEnded: onBackgroundLongPressEnded,
            loadedImages: sceneImages,
            loadedStickerAnimations: sceneStickerAnimations,
            loadedImagesVersion: sceneImagesVersion,
            // Le canvas retire son calque de dessin persisté pendant qu'une
            // surface live est posée dessus — sinon le trait s'affiche deux fois.
            isDrawingOverlayActive: drawingSurface != nil,
            editingTextId: editingTextId,
            onInlineTextChanged: onInlineTextChanged,
            onInlineTextEditEnded: onInlineTextEditEnded,
            // « Un seul objet à la fois » a son témoin sur la scène.
            selectedItemId: selectedItemId,
            selectionBadge: selectionBadge,
            timelineBridge: timelineBridge,
            onItemTrimRequested: onItemTrim,
            onItemMenuRequested: onItemMenu,
            localMediaAliases: sceneLocalMediaAliases,
            inlineEditInputLink: inlineEditInputLink
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay {
            if let quickCaptureHint { ComposerSceneQuickCaptureHint(hint: quickCaptureHint) }
        }
        // **La surface PUBLIE la place du viseur, elle ne le peint pas.**
        // Le meuble le monte une seule
        // fois ; `Color.clear` + `aspectRatio(.fit)` reproduit exactement le
        // rectangle du dessin dans le repère où la carte se cadre.
        .overlay {
            Color.clear
                .aspectRatio(aspectRatio, contentMode: .fit)
                .anchorPreference(key: ComposerSceneCameraFrameKey.self,
                                  value: .bounds) { $0 }
                .background {
                    GeometryReader { geo in
                        Color.clear.preference(key: ComposerSceneCardFrameKey.self, value: geo.frame(in: .global))
                    }
                }
                .allowsHitTesting(false)
        }
        // **Le bord gauche du DESSIN, mesuré ici et remonté** : la
        // trace du son et le pied des références s'alignent sur la carte, qui
        // se centre dans le viewport et n'en touche le bord que si la largeur la
        // contraint.
        .background {
            GeometryReader { geo in
                let bordGauche = ComposerRailGeometry.sceneLeadingInset(overlay: geo.size,
                                                                        ratio: aspectRatio,
                                                                        horizontalInset: 0)
                Color.clear
                    .preference(key: ComposerSceneCardLeadingKey.self, value: bordGauche + railLaneLeading)
                    // La carte se CENTRE : sa largeur est ce que les deux bords
                    // lui laissent. Le volet en proportionne sa flèche.
                    .preference(key: ComposerSceneCardWidthPreferenceKey.self,
                                value: max(0, geo.size.width - 2 * bordGauche))
            }
        }
    }

    private var chromeLayer: some View {
        VStack(alignment: .leading, spacing: 0) {
            // **Ni barre haute ni trace du son** (#13839) : ✕, la rangée des
            // diapos et ↶ ↷ se posent sur la scène (`restChrome`), le son de
            // fond se lit au point du bouton Son et se règle de son menu.
            freeZone

            // **Sur grand écran, le bas reste dans la colonne de la scène** (#13839, L6) : une bande, la frise, les
            // réglages d'un outil ou la barre de dessin posés sous un rail y seraient couverts et intouchables.
            bottomFloors
                .padding(ComposerSceneRailsInsets.lowerFloors(arrangement: arrangement))
        }
    }

    /// **La frise prend le bas tant qu'elle est ouverte** : les étages qui outillent la scène image par image n'ont
    /// rien à y faire, et deux zones basses se recouvriraient.
    @ViewBuilder
    private var bottomFloors: some View {
        if let timelinePanel {
            timelinePanel
        } else if ComposerToolFocus.lowerFloorsAreShown(writesText: writesText) {
            // **Clavier levé, le bas est au clavier** : références,
            // jetons et rangée basse y seraient couverts ou hors du pouce.
            lowerFloors
                .background {
                    GeometryReader { geo in
                        Color.clear.preference(key: ComposerLowerFloorsHeightKey.self,
                                               value: geo.size.height)
                    }
                }
        }
    }

    @ViewBuilder
    private var lowerFloors: some View {
        VStack(alignment: .leading, spacing: 0) {
            // **Ce que la publication EMPORTE** — hashtags et
            // mentions, juste sous la scène libre. Il CÈDE aux options d'un
            // outil, par `ComposerCanonicalZone`, jamais par un
            // `!toolIsOpen` écrit ici.
            if ComposerCanonicalZone.isServed(.references, toolIsOpen: toolIsOpen), band == nil {
                ComposerSceneReferenceFooter(hashtags: sceneHashtags,
                                             references: sceneReferences,
                                             leadingInset: sceneCardLeading - railLaneLeading,
                                             onOpenHashtags: onOpenHashtags,
                                             onOpenMentions: onOpenMentions)
            }

            // **Le panneau d'options passe AVANT la bande de fond** :
            // l'outil ouvert a la priorité sur le bas, et les deux ne
            // coexistent jamais. L'exclusion se lit sur `railMode`, par
            // `ComposerLowZone`, jamais sur la présence du panneau.
            switch ComposerLowZone.resolve(toolIsOpen: toolIsOpen, band: band) {
            case .toolOptions:
                // La marge des rails : les options d'un outil ne touchent pas
                // le bord du verre.
                // Sur une PLAQUE DE VERRE, comme les options de l'éditeur
                // d'objet.
                if let toolOptions {
                    toolOptions
                        .padding(MeeshySpacing.smPlus)
                        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous),
                                       tint: plateauTint.opacity(0.55))
                        .padding(.horizontal, ComposerRailGeometry.outerMargin)
                        .padding(.bottom, MeeshySpacing.xsPlus)
                }
            case .band(let ouverte):
                // Sous la scène, qui se réduit au-dessus d'elle, sur tout écran :
                // en carte à côté du rail droit, elle couvrait la scène (#13839, L6).
                bandView(ouverte)
            case .nothing:
                EmptyView()
            }
            // **La rangée basse — une PLACE permanente, un contenu qui change** :
            // outil ouvert, ses contrôleurs ; sinon, les portes
            // qui font ENTRER de la matière ; viseur armé, ses commandes.
            // **Une bande ouverte prend le bas pour elle seule** : la mention, le
            // hashtag et le lieu s'effacent aussi le temps du panneau. Un OUTIL ouvert garde la rangée : elle
            // porte alors ses propres contrôleurs.
            if let drawingBar { drawingBar }
        }
    }

    /// **La scène LIBRE** — le vide du calque de chrome, où la scène se voit et
    /// se touche. Les deux rails y flottent au bas, à portée du pouce, avec les
    /// MÊMES marges ; le volet de description s'y pose entre eux.
    private var freeZone: some View {
        ZStack(alignment: .bottom) {
            // **Frise ouverte, la scène se RÈGLE dans le temps** : les
            // rails et le volet s'effacent, et le canvas ne prend plus de geste.
            // La frise réécrit la slide à sa fermeture ; une pose ou un
            // déplacement faits pendant qu'elle est ouverte seraient écrasés.
            // Seul « Temps » y reste (maquette : le couloir droit ne part pas
            // avec la frise) — le geste qui la RANGE doit rester là où il l'a
            // ouverte.
            if timelinePanel == nil { composingFloors } else { friseRail }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .background {
            GeometryReader { geo in
                Color.clear.preference(key: ComposerFreeZoneFrameKey.self, value: geo.frame(in: .global))
            }
        }
        // **Les options du sous-outil ouvert, à droite depuis le haut**
        // — sur la scène libre, alignées sur le haut de la colonne droite.
        .overlay {
            if timelinePanel == nil, let inlinePanel {
                inlinePanel
                    // Aligné sur le haut de la colonne droite, donc de la carte
                    // — la plaque pose elle-même sa gouttière.
                    .padding(.top, trailingBand.top - ComposerRailGeometry.gutter)
                    .environment(\.composerSceneCardFrame, sceneCardFrame)
                    .transition(.opacity)
            }
        }
    }

    /// « Temps » reste où il était — AU-DESSUS de l'historique : la
    /// frise masque annuler et rétablir (elle réécrit la slide à sa fermeture),
    /// mais leur place est gardée, sans quoi le bouton qui la RANGE descendrait
    /// sous le doigt qui vient de l'ouvrir.
    private var friseRail: some View {
        HStack {
            Spacer(minLength: 0)
            ComposerTrailingRail(actions: [],
                                 plateauTint: plateauTint,
                                 pushesToThumb: false,
                                 separateButtons: true,
                                 onTime: onTimeButton,
                                 timeIsOpen: timeIsOpen)
                .padding(.trailing, ComposerRailGeometry.outerMargin)
                .padding(.bottom, ComposerRailGeometry.floatingBottomInset
                                  + ComposerRailGeometry.historyReserve(undo: onUndo != nil, redo: onRedo != nil))
        }
    }

    @ViewBuilder
    private var composingFloors: some View {
        ZStack(alignment: .bottom) {
            // Sur grand écran, les rails se CENTRENT en hauteur (maquette
            // iPad : ils ne descendent pas au pouce, qui n'y tient pas l'écran).
            HStack(alignment: isRoomy ? .center : .bottom, spacing: 0) {
                Spacer(minLength: 0)
                if trailingRailIsShown {
                // **Les options EN HAUT, l'historique EN BAS** :
                // la colonne prend la hauteur de la scène libre dès qu'elle a
                // des options, et son pied reste au pouce.
                ComposerTrailingRail(actions: trailingActions,
                                     plateauTint: plateauTint,
                                     onAction: onTrailingAction,
                                     onUndo: historyIsOnTheScene ? nil : onUndo,
                                     onRedo: historyIsOnTheScene ? nil : onRedo,
                                     pushesToThumb: false,
                                     separateButtons: true,
                                     options: trailingOptions,
                                     onOption: onTrailingOption,
                                     onTime: nil,
                                     timeIsOpen: timeIsOpen,
                                     footFollowsOptions: trailingFootFollowsOptions)
                    // **Dans la hauteur de la CARTE** : un outil
                    // ouvert retire la barre haute, et la scène libre remonte
                    // au-dessus de la carte — le rail, lui, n'en sort pas.
                    .padding(.top, trailingBand.top)
                    .padding(.trailing, edge)
                    .padding(.bottom, trailingBand.bottom)
                    .transition(.opacity)
                }
            }
            .frame(maxHeight: .infinity, alignment: isRoomy ? .center : .bottom)
            // **Le volet CÈDE au viseur** : la question passe par la
            // règle, jamais par un `cameraStage != .off` écrit ici.
            // **Un outil ou une bande ouverts prennent le bas pour eux seuls** :
            // la légende s'efface le temps du
            // dessin ou du Cadre, comme la barre canonique sous un panneau.
            if ComposerSceneCameraOverlay.isServed(.description, stage: cameraStage),
               ComposerToolFocus.isShown(.description, toolIsOpen: toolIsOpen, writing: writing), band == nil {
                descriptionOverlay
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }

    private func bandView(_ ouverte: ComposerSceneBand) -> some View {
        ComposerSceneBandView(band: ouverte,
                              colors: bandColors,
                              onPickColor: onPickBandColor,
                              openingEffect: bandOpeningEffect,
                              onPickOpening: onPickBandOpening,
                              fitMode: bandFitMode,
                              backdrop: bandBackdrop,
                              plateauTint: plateauTint,
                              onPickFitMode: onPickBandFitMode,
                              onPickBackdrop: onPickBandBackdrop)
    }

    // **Le champ PERMANENT est absent** :
    //
    // > « La zone de description en bas ne doit pas être affichée si on ne
    // > touche pas l'icône description, même si une description existe ! »
    //
    // Un calque de lecture permanent occuperait le bas dès qu'un
    // texte existait — la place que la scène centrée réclame, pour un texte que
    // l'auteur ne regarde pas la plupart du temps. La description s'ouvre
    // par sa PORTE, comme les autres niveaux du modèle, et le meuble
    // monte l'éditeur en zone basse (`sceneDescriptionEditor`).
    //
    // `description` et `descriptionPlaceholder` restent au contrat : la porte
    // est servie par le meuble, qui possède le texte. Les retirer obligerait
    // chaque site de montage à re-prouver qu'il n'en a pas besoin.
}
