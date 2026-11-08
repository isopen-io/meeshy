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
/// | le repos posé sur la scène (`ComposerSceneOverlayChrome`) | la `MeeshyPublication` et ses portes |
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

    /// **La publication citée**, figée sur la scène — `nil` hors d'une citation.
    var quotedPublication: ComposerQuotedPublication?

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
    var toolIsOpen: Bool {
        ComposerToolFocus.toolIsOpen(railOpensTool: railMode.opensTool,
                                     editsInline: ComposerSelectionChrome.inlineEditOpensTool(
                                        editsInline: editsInline, objectIsSelected: selectionColumn != nil))
    }

    /// **La scène est en focus** : un outil ouvert, ou un objet sélectionné
    /// (#13957, R6) — les références et la légende cèdent aux deux.
    var sceneIsFocused: Bool { toolIsOpen || selectionColumn != nil }

    /// **Ce que le canvas ENCADRE, et ce qu'il en dit** (vue `1c`).
    ///
    /// Déjà résolus par le meuble — cette vue ne re-filtre rien, exactement
    /// comme pour les deux rails, la bande et les jetons. Le badge est une
    /// chaîne DÉJÀ composée : sa forme est du vocabulaire produit, et la
    /// composer ici la mettrait hors de portée d'un témoin.
    var selectedItemId: String?
    var selectionBadge: String?
    /// **Les options de l'objet sélectionné** (#13957, R6), déjà composées par
    /// le meuble : `nil` ⇒ rien de sélectionné (ou le fond), la colonne des
    /// outils, ✕ et Publier reparaissent.
    var selectionColumn: ComposerSelectionColumn?

    // MARK: - L'élément qui entre (#13864, R5)

    /// Un ajout retient l'écran sous un voile ; seul l'espace réservé, posé SUR la carte, reste touchable (son ✕).
    var intakeBlocks: Bool = false
    var intakeGhost: AnyView?

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
    var onCloseBand: (() -> Void)?

    /// **Le repos posé sur la scène** (#13839) : le nombre de diapos (la
    /// rangée paraît dès deux), les boutons de la colonne, le menu ⋯ et
    /// la barre de dessin. Un carrousel d'effets ouvert compte comme un
    /// panneau du bas : la colonne lui cède.
    var slideCount: Int = 1
    var restTools: [ComposerRestTool] = []
    var restBackgroundIsMedia = false
    var restPostText = ""
    var onRestTool: ((ComposerRestTool) -> Void)?
    var moreMenu: AnyView?
    var drawingBar: AnyView?
    var sceneEffectIsOpen: Bool = false

    // MARK: - Le grand écran (#13839, L6)

    /// Résolue par le meuble depuis la taille de sa racine. En rails, le chrome
    /// du repos cède aux deux rails libellés et la scène rend leur couloir.
    var rails = ComposerSceneRailsContext()
    var arrangement: ComposerSceneArrangement { rails.arrangement }

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
    /// **Les options du PINCEAU**, contre la barre de dessin — le panneau
    /// entier, déjà composé et placé ; la surface le pose sur la scène libre.
    var inlinePanel: AnyView?
    /// **Les propriétés du sous-outil touché, EN BAS** (#13957, #13974) : la
    /// scène se réduit au-dessus, rien ne la recouvre.
    var propertiesSheet: AnyView?
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

    /// **La bande de mention du texte de SCÈNE n'est pas sur cette surface** :
    /// elle suit la frappe, donc la barre collée au clavier
    /// (`ComposerKeyboardDock`), et l'éditeur d'objet pour ses autres champs.

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
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    /// **L'écran LARGE** — la loi `ComposerSceneArrangement` a posé les rails
    /// (#13839, L6) : la place libre décide, jamais la classe de taille. Marges
    /// de 24 pt, contrôleurs centrés en hauteur, volet de texte aligné sur la
    /// carte. Sans rails, la disposition du pouce.
    var isRoomy: Bool { arrangement == .rails }

    /// Le bord gauche du DESSIN, mesuré par le canvas et lu par l'en-tête son
    /// (#5011). `0` tant que la première passe de mise en page n'a pas eu lieu.
    @State var sceneCardLeading: CGFloat = 0

    @Environment(\.composerAnchoredSheetTop) var anchoredSheetTop

    /// **L'état masqué** (#17111) : posé par l'hôte, il retire tout le chrome
    /// et pose la scène en letterbox 9:16 sur le viewport entier.
    @Environment(\.composerChromeIsConcealed) var chromeIsConcealed

    /// La largeur du DESSIN, mesurée par le canvas : la flèche du volet
    /// s'y proportionne. `0` avant la première passe ⇒ le volet se mesure seul.
    @State var sceneCardWidth: CGFloat = 0

    /// Le cadre du DESSIN dans l'écran : le panneau d'options s'y repère pour
    /// laisser voir l'objet qu'il règle.
    @State var sceneCardFrame: CGRect = .null
    @State var restSceneSideInset: CGFloat = 0
    @State var restSceneTop: CGFloat = 0
    @State var restChromeTop: CGFloat = 0

    /// Le haut des étages du bas au dernier repos (#15226).
    @State var restFloorTop: CGFloat?

    /// Le cadre de la scène LIBRE, dans le même repère que la carte : le rail
    /// droit s'y borne à la hauteur de la carte (#10542).
    @State var freeZoneFrame: CGRect = .null

    /// **La hauteur des étages du bas, mesurée** — ce que les propriétés y
    /// occupent : le rail d'édition s'arrête au-dessus d'elles.
    @State var lowerFloorsHeight: CGFloat = 0

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
            if !chromeIsConcealed {
                chromeLayer.modifier(ComposerIntakeVeil(veiled: intakeBlocks))
                if arrangement == .rails {
                    railsLayer.modifier(ComposerIntakeVeil(veiled: intakeBlocks))
                } else {
                    restChrome.modifier(ComposerIntakeVeil(veiled: intakeBlocks))
                }
                ComposerLimitCapsuleView()
            }
        }
        .animation(ComposerSelectionChrome.transition(reduceMotion: reduceMotion), value: chromeIsConcealed)
        .adaptiveOnChange(of: chromeIsConcealed) { _, masque in
            if masque { AdaptiveAccessibility.announce(ComposerPillCopy.concealedHint) }
            UIAccessibility.post(notification: .screenChanged, argument: nil)
        }
        .onPreferenceChange(ComposerSceneCardLeadingKey.self) { sceneCardLeading = $0 }
        .onPreferenceChange(ComposerSceneCardWidthPreferenceKey.self) { sceneCardWidth = $0 }
        .onPreferenceChange(ComposerSceneCardFrameKey.self) { sceneCardFrame = $0 }
        .onPreferenceChange(ComposerSceneDrawnOriginKey.self) { origine in
            guard let origine else { return }
            restSceneSideInset = ComposerRestChrome.restInset(measured: origine.x, sceneIsReduced: sceneIsReduced,
                                                              current: restSceneSideInset)
            restSceneTop = ComposerRestChrome.restInset(measured: origine.y, sceneIsReduced: sceneIsReduced,
                                                        current: restSceneTop)
        }
        .onPreferenceChange(ComposerFreeZoneFrameKey.self) { cadre in
            freeZoneFrame = cadre
            restFloorTop = ComposerSceneLift.restFloorTop(measured: cadre.isNull ? nil : cadre.maxY,
                                                          isRest: floorsAreAtRest, current: restFloorTop)
        }
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
        // **Sélectionner et désélectionner : un seul fondu** (#13957) — Fermer,
        // la colonne et ses options s'échangent sans saut.
        .animation(ComposerSelectionChrome.transition(reduceMotion: reduceMotion), value: selectionColumn != nil)
        // **La barre de statut s'efface** : la croix et le `⋯` se posent
        // « un peu plus haut pour ne pas être sur la scène ».
        // Comme le lecteur de stories : la rangée de l'horloge rend sa hauteur,
        // et la croix monte dans celle de la Dynamic Island, aux coins.
        .statusBarHidden(true)
    }

    @State var floorHash: String?
    @State var keyboard = ComposerSceneKeyboard()

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

/// L'état masqué de la scène (#17111), que l'hôte pose et que la surface lit.
struct ComposerChromeConcealedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var composerChromeIsConcealed: Bool {
        get { self[ComposerChromeConcealedKey.self] }
        set { self[ComposerChromeConcealedKey.self] = newValue }
    }
}

/// Le coin haut-gauche de la scène DESSINÉE, dans la fenêtre : le 9:16 de la
/// couche, à l'échelle et au décalage où la levée le pose.
struct ComposerSceneDrawnOriginKey: PreferenceKey {
    static let defaultValue: CGPoint? = nil
    static func reduce(value: inout CGPoint?, nextValue: () -> CGPoint?) { value = nextValue() ?? value }
}
