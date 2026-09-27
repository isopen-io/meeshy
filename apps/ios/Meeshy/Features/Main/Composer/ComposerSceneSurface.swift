import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// **La surface de SCÈNE — la quatrième vue du meuble** (#4070, planche § P4
/// et tâche 4.3).
///
/// ## Pourquoi elle existe
///
/// La scène incrustée (Phase 2, #3939) vivait comme un `if showsScene` dans
/// `ComposerDocumentSurface`, avec ses propres entrées — la slide, son ratio,
/// les relais de sélection, l'inspecteur, la description. Chacune était une
/// exception que la règle du DOCUMENT devait porter.
///
/// C'est exactement ce que la tâche 4.3 de la planche a fermé pour le mood :
///
///   > « `.mood` devient une SURFACE, pas un cas du document. […] une humeur
///   > n'est pas un post court, et la traiter comme tel obligeait chaque règle
///   > du document à porter une exception. »
///
/// Une scène n'est pas un document avec une image. Elle a ses portes, ses
/// contrôleurs, sa géométrie et sa description ; les loger dans le document
/// obligeait ce dernier à savoir ce qu'est un `MeeshySceneObject`.
///
/// ## Ce qu'elle porte, et sur quel niveau du modèle
///
/// | zone | niveau |
/// |---|---|
/// | barre haute (`ComposerTopBar`) | la `MeeshyPublication` |
/// | rail *leading* — les portes | crée un `MeeshySceneObject` (sauf « description ») |
/// | la scène, cadrée sur le viewport entier (#8370) | une `MeeshyScene` |
/// | rail *trailing* — les contrôleurs | UN `MeeshySceneObject` |
/// | la description | la `MeeshySlide` |
///
/// Le SOCLE n'est pas ici : il vit au meuble, sous les trois surfaces, et ne
/// bouge jamais (loi 5).
struct ComposerSceneSurface: View {

    // MARK: - La publication

    /// **Le rail des SCÈNES**, monté par l'hôte (constat porteur 2026-09-06).
    /// Slot opaque, comme `formatFan` : une mini-preview demande les effets
    /// vivants et les bitmaps chargés, donc le ViewModel — que cette surface ne
    /// connaît pas. `nil` ⇒ pas de rail.
    var slideRailSlot: AnyView?
    /// **Le format COURANT, parce que la géographie des rails en dépend**
    /// (#4893). Lieu, hashtag, mention et corpus de texte ne se posent sur la
    /// scène qu'en Story ; ailleurs ils qualifient la publication et vivent en
    /// bas. La surface ne décide de rien — elle ne peut simplement pas
    /// interroger `ComposerSceneFloatingRail` sans dire pour quoi elle compose.
    let format: ComposerFormat
    let overflowMenu: AnyView?
    let onClose: () -> Void

    // MARK: - La scène

    @Binding var slide: StorySlide
    let aspectRatio: CGFloat
    let plateauTint: Color
    var sceneImages: [String: UIImage] = [:]
    /// Octets animés des stickers collés, keyés par `sticker.id` (#3956).
    var sceneStickerAnimations: [String: Data] = [:]
    var sceneImagesVersion: UInt64 = 0
    var onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?

    /// **« Modifier » — l'appui long, et l'action VoiceOver du même nom**
    /// (#4074, vue `1d`).
    ///
    /// La scène ne transmettait pas ce rappel : `hasEditor` était faux et le
    /// menu n'offrait que deux actions sur quatre. `editableKinds` dit à quels
    /// objets le MEUBLE sait répondre — `[.text]` ici, tant qu'aucun éditeur
    /// média n'y est monté (#4082) — pour que « Modifier » ne paraisse jamais
    /// sur un objet que personne n'éditera.
    var onItemEdit: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?
    /// **Les familles dont l'hôte sait ouvrir l'éditeur** (#4937).
    ///
    /// Elle valait `[.text]` tant que l'éditeur d'objet ne savait éditer qu'un
    /// texte. Depuis que les cinq familles y ont leur fenêtre et leur timeline,
    /// les quatre autres s'y ouvrent aussi.
    ///
    /// **Ce jeu et le `switch` d'`onItemEdit` se tiennent la main** : servir
    /// l'un sans l'autre rend « Modifier » offert et INERTE — le doc-comment de
    /// l'hôte le dit depuis #4082, et `ComposerSceneEditableKindsTests` le garde
    /// désormais plutôt que de le rappeler.
    var editableSceneKinds: Set<StoryCanvasUIView.CanvasItemKind> = defaultEditableSceneKinds

    /// Le défaut, NOMMÉ pour que la garde puisse le lire — un littéral posé dans
    /// une valeur par défaut n'est interrogeable que par la source.
    static let defaultEditableSceneKinds: Set<StoryCanvasUIView.CanvasItemKind> = [
        .text, .media, .sticker, .place, .audio
    ]

    var onBackgroundTapped: (() -> Void)?

    /// **L'appui long sur une scène VIDE ouvre la caméra** (#4036, planche
    /// `2b`). L'hôte décide du mode ; la surface ne fait que transmettre.
    var onBackgroundLongPressed: (() -> Void)?

    /// **L'appui long sur un média DE FOND demande son MENU** (#5041).
    ///
    /// Distinct du jumeau ci-dessus, qui appartient au viseur : une scène qui
    /// porte un fond n'est pas vide. Tant que le meuble ne le branche pas, la
    /// règle du canvas (`StoryCanvasBackgroundLongPress`) retombe sur le viseur
    /// — le geste ne devient jamais muet en attendant son hôte.
    var onBackgroundMediaLongPressed: ((String) -> Void)?

    /// **La durée d'un appui long ARMÉ** (#5041) : la translation pendant qu'on
    /// tient, puis le relâchement. Le `.began` seul ouvrait un objectif ; ces
    /// deux-là permettent de TENIR une prise.
    var onBackgroundLongPressChanged: ((CGPoint) -> Void)?
    var onBackgroundLongPressEnded: (() -> Void)?

    /// **L'étape du viseur — la seule chose que la scène ait encore besoin de
    /// savoir de la caméra** (directive porteur 2026-09-04).
    ///
    /// La surface PEIGNAIT le viseur ; elle n'en publie plus que la place
    /// (`ComposerSceneCameraFrameKey`), le meuble le montant en un site unique
    /// pour couvrir le socle. Tout le reste du contrat caméra — session,
    /// permission, taille, mode, flash, segments et leurs onze rappels — est
    /// parti AVEC la vue qui les lisait.
    ///
    /// Ce champ reste parce qu'un autre consommateur le lit ici : la zone de
    /// description s'efface pendant qu'on cadre
    /// (`ComposerSceneCameraOverlay.isServed(.description, stage:)`). Le
    /// garder « au cas où » aurait été une dette ; le garder pour un lecteur
    /// nommé est un contrat.
    var cameraStage: ComposerSceneCameraStage = .off

    // MARK: - Les deux rails

    /// **Ce que le rail *leading* montre** — déjà résolu par
    /// `ComposerRailMode.resolve`. Cette vue ne re-filtre rien : une seconde
    /// loi 4 divergerait de la première.
    var railMode: ComposerRailMode = .doors([])

    /// **Ce que chaque porte PORTE DÉJÀ** (#4994) — déjà compté par
    /// `ComposerRailDoorBadge`. Cette vue ne compte rien : elle relaie, comme
    /// pour les portes elles-mêmes. Une entrée absente vaut « rien à dire ».
    var railBadges: [ComposerRailDoor: Int] = [:]
    var onRailDoor: ((ComposerRailDoor) -> Void)?
    var onRailToolControl: ((ComposerToolControl) -> Void)?
    var onRailExitTool: (() -> Void)?

    /// Le bouton SYSTÈME du rail — le collage (#4092). Une vue entière, parce
    /// qu'un `PasteButton` doit ÊTRE le bouton pour garder son privilège : accès
    /// au presse-papier sans bannière, et extinction automatique quand il n'y a
    /// rien à coller.
    var railSystemEntry: AnyView?
    var railSystemEntryAfter: ComposerRailDoor?

    /// Les contrôleurs SERVIS — déjà filtrés par `ComposerTrailingRailPolicy`.
    var trailingActions: [StoryCanvasContextAction] = []
    var onTrailingAction: ((StoryCanvasContextAction) -> Void)?

    /// La frame `[+]` du rail *trailing* — créer une slide.
    var onAddSlide: (() -> Void)?

    /// **L'HISTORIQUE, descendu du socle au rail droit** (#4586, directive
    /// porteur 2026-08-31). `nil` ⇒ rien à défaire, donc aucun bouton : la
    /// surface ne re-décide rien, le meuble a déjà posé la question.
    var onUndo: (() -> Void)?
    var onRedo: (() -> Void)?

    // MARK: - L'inspecteur de l'objet sélectionné (#4073, vue `1c`)

    /// Les jetons SERVIS — déjà résolus par `ComposerObjectChips.chips(forSelected:in:)`.
    /// Vide ⇒ aucun objet sélectionné, donc aucune rangée : cette vue ne
    /// re-filtre rien, exactement comme pour les deux rails et la bande.
    ///
    /// **Ils vivent EN BAS, et c'est la sémantique de placement du porteur**
    /// (2026-08-31) : les contrôles à gauche, le document et les slides à
    /// droite, et le bas pour ce qui règle l'OUTIL ou l'OBJET du moment. Un
    /// objet sélectionné n'est aucune des deux premières places.
    var objectChips: [ComposerObjectChips.Chip] = []

    /// Un outil est-il ouvert ? Lu sur `railMode`, la seule source qui le
    /// SAIT — voir `ComposerObjectChips.isServed`.
    private var toolIsOpen: Bool {
        if case .tool = railMode { return true }
        return false
    }

    /// **Plus d'`activeObjectChipId`** (2026-09-05) : un jeton ouvrait une
    /// bande montée SOUS la scène, donc visible en même temps que lui — d'où un
    /// état encadré. Il ouvre désormais l'éditeur plein écran, qui couvre cette
    /// surface : aucun jeton n'est visible en même temps que ce qu'il a ouvert.
    var onObjectChip: ((String) -> Void)?

    /// **Ce que le canvas ENCADRE, et ce qu'il en dit** (#4073, vue `1c`).
    ///
    /// Déjà résolus par le meuble — cette vue ne re-filtre rien, exactement
    /// comme pour les deux rails, la bande et les jetons. Le badge est une
    /// chaîne DÉJÀ composée : sa forme est du vocabulaire produit, et la
    /// composer ici la mettrait hors de portée d'un témoin.
    var selectedItemId: String?
    var selectionBadge: String?

    // MARK: - La bande contextuelle

    /// La bande OUVERTE — déjà résolue par `ComposerSceneBand.opened`. `nil` ⇒
    /// le bas ne porte que le socle (#4064). Cette vue ne re-filtre rien : une
    /// seconde loi 4 divergerait de la première, exactement comme pour les
    /// deux rails.
    ///
    /// **Les deux contenus injectés sont partis avec leurs bandes**
    /// (2026-09-05) : `timeline` (#4082) et `textStyles` (#4083) éditaient un
    /// objet déjà posé, et la première vue n'édite plus. Leurs jumelles vivent
    /// dans l'éditeur plein écran — `.media(.trim)` et `.tool(.style)`.
    var band: ComposerSceneBand?
    var bandColors: [String] = []
    var onPickBandColor: ((String) -> Void)?

    /// L'effet d'ouverture, servi par la même bande que les couleurs — c'est
    /// le contenu du panneau « Fond » de l'atelier, en entier (#4403).
    var bandOpeningEffect: StoryTransitionEffect?
    var onPickBandOpening: ((StoryTransitionEffect?) -> Void)?
    /// Le panneau Cadre (#8414) : le cadrage et le fond que le meuble lit sur
    /// la slide, et les deux écritures qu'il en attend.
    var bandFitMode: String = StoryBackgroundFraming.fill
    var bandBackdrop: StoryBackdrop = .blur
    var onPickBandFitMode: ((String) -> Void)?
    var onPickBandBackdrop: ((StoryBackdrop) -> Void)?

    /// **Le panneau d'OPTIONS de l'outil déplié**, monté sous la scène
    /// (directive porteur 2026-08-30). Les BULLES vivent au rail ; ce qui a
    /// besoin de largeur — palette, glissière — vit ici.
    ///
    /// **Il ne porte plus que le DESSIN depuis le 2026-09-05.** Les dix-huit
    /// styles et les sept autres outils de texte sont partis à l'éditeur plein
    /// écran avec le reste de l'édition ; ce qui reste ici règle le PINCEAU,
    /// c'est-à-dire le geste qui AJOUTE — pas un objet déjà posé. Le meuble
    /// tient la distinction (`ComposerFirstView.lowZoneShowsToolOptions`).
    var toolOptions: AnyView?

    /// L'édition EN LIGNE, relayée au canvas : le texte se saisit à sa vraie
    /// place, dans sa vraie police, sur le vrai fond.
    var editingTextId: String?
    var onInlineTextChanged: ((String, String) -> Void)?
    var onInlineTextEditEnded: ((String) -> Void)?

    /// **La bande de mention du texte de SCÈNE a quitté cette surface**
    /// (2026-09-05).
    ///
    /// Elle interprétait la frappe INLINE sur le canvas (#4475). Or la frappe
    /// n'a plus lieu ici : `openObjectEditor` est le seul chemin vers l'édition
    /// d'un texte — mesuré, `enterTextEditingMode` n'a que deux appelants, et
    /// tous deux montent l'écran modal par-dessus cette surface. La bande était
    /// donc peinte sous un écran plein, pour une requête `@` qui se formait
    /// ailleurs.
    ///
    /// Elle vit désormais dans `ComposerObjectEditorView`, où le doigt tape.

    /// **Le volet de description, replié ou non** (#4742). Construit par le
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

    // MARK: - Les sons POSÉS sur la scène (#4722)

    /// **Les puces sonores de premier plan, peintes SUR la carte.**
    ///
    /// > Directive porteur 2026-09-01 : « lorsqu'on a posé une scène on puisse
    /// > toujours ajouter un son sur la scène, en son de fond de la scène ou en
    /// > chip resizable sur la scène. »
    ///
    /// Le meuble savait DÉJÀ répondre à cette puce — `onItemEdit` traite
    /// `case .audio` depuis le #4671 — mais aucune surface ne la peignait :
    /// `AudioForegroundChip` n'était monté que par l'atelier et par le viewer.
    /// La branche était vivante, l'objet invisible ; le contrôle existait sans
    /// être ALIMENTÉ.
    ///
    /// **Le canvas UIKit ne peut pas les rendre, et c'est structurel** : il n'a
    /// pas de couche audio (`Layers/` en compte six, aucune pour le son) et
    /// `manipulable` exclut `.audio` de ce qu'un geste peut saisir. La puce est
    /// donc une vue SwiftUI posée par-dessus — d'où le slot `objectOverlay`,
    /// qui borne à la carte SANS éteindre les touches du canvas, à la
    /// différence de celui du dessin.
    ///
    /// **Pas de puce pendant le dessin**, comme dans l'atelier : le calque de
    /// tracé capture la carte entière, et une puce qui resterait dessus
    /// promettrait un doigt qu'elle ne recevrait pas.
    @ViewBuilder
    private func sceneSoundOverlay(canvasSize: CGSize) -> some View {
        ForEach(foregroundSoundBindings, id: \.wrappedValue.id) { binding in
            AudioForegroundChip(
                audioObject: binding,
                canvasSize: canvasSize,
                mode: .composer,
                isSelected: selectedItemId == binding.wrappedValue.id,
                isUserMuted: binding.wrappedValue.volume <= 0,
                onDragEnd: { HapticFeedback.light() },
                onTap: { onItemTapped?(binding.wrappedValue.id, .audio) },
                onToggleMute: {
                    HapticFeedback.light()
                    var objet = binding.wrappedValue
                    objet.toggleMute()
                    binding.wrappedValue = objet
                }
            )
        }
    }

    /// Un binding par son de premier plan — **résolu par IDENTIFIANT, jamais
    /// par index.**
    ///
    /// L'atelier capture l'index de l'énumération et le relit à chaque accès :
    /// c'est juste tant que la liste ne bouge pas, et un son supprimé pendant
    /// qu'un autre est saisi décale tous ceux qui le suivent — le geste finit
    /// alors sur le voisin. La recherche par `id` coûte un parcours d'une liste
    /// qui compte deux ou trois entrées, et ne peut pas se tromper de son.
    ///
    /// Une écriture dont l'objet a disparu est IGNORÉE plutôt que réinsérée :
    /// le relâchement d'un geste sur un son qu'on vient de supprimer ne doit
    /// pas le faire revenir.
    private var foregroundSoundBindings: [Binding<StoryAudioPlayerObject>] {
        (slide.effects.audioPlayerObjects ?? [])
            .filter { $0.isBackground != true }
            .map { objet in
                Binding<StoryAudioPlayerObject>(
                    get: {
                        slide.effects.audioPlayerObjects?
                            .first { $0.id == objet.id } ?? objet
                    },
                    set: { nouveau in
                        guard let index = slide.effects.audioPlayerObjects?
                            .firstIndex(where: { $0.id == objet.id }) else { return }
                        slide.effects.audioPlayerObjects?[index] = nouveau
                    }
                )
            }
    }

    // MARK: - Le son de FOND de la slide (#4918)

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
    /// Le RETRAIT passe par là (critère 2 de #4918) : la feuille porte le (x)
    /// de `deleteEditedSound`, et son doc-comment dit pourquoi le geste vit là
    /// et nulle part ailleurs — « trois boutons dispersés auraient été trois
    /// lois ». Deux gestes, ce que la dimension 7 demande.
    var onEditBackgroundSound: (() -> Void)?

    /// **Le RETRAIT du son de fond, par appui long** (#4930).
    ///
    /// `nil` ⇒ aucun menu. Deux cas le rendent : aucun fond, et un fond LEGACY
    /// — celui que `resolvedBackgroundAudio` synthétise depuis
    /// `backgroundAudioId`, qui n'a aucun objet à supprimer. Le meuble tranche ;
    /// la surface ne fait que peindre ce qu'elle reçoit.
    var onDeleteBackgroundSound: (() -> Void)?

    /// **Sortir le son du FOND pour le poser sur la scène** (#5018), par l'appui
    /// long de la trace. `nil` ⇒ l'entrée disparaît — un fond LEGACY n'a aucun
    /// objet à basculer, et l'hôte le sait avant nous.
    var onPromoteBackgroundSound: (() -> Void)?

    // MARK: - Ce que la publication EMPORTE (#5002)

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


    /// **Les boutons de CONTRÔLE, à GAUCHE** (directive porteur 2026-08-31).
    ///
    /// Trois places, trois niveaux : l'OUTIL agit (gauche), le DOCUMENT et la
    /// SLIDE se pilotent (droite), les réglages de l'outil OUVERT vivent en bas.
    /// Le rail avait d'abord été posé à droite d'après la planche `1b` ; la
    /// directive le ramène à gauche, et sépare surtout ce qu'il PORTE — les
    /// portes restent ici, les contrôleurs d'outil DESCENDENT.
    ///
    /// Il ne montre donc plus jamais `.tool(...)` : un outil ouvert VIDE ce rail
    /// au lieu de le travestir. C'est ce qui rend la place signifiante — le
    /// doigt apprend qu'à gauche on OUVRE, en bas on RÈGLE, et une place qui
    /// change de sens selon l'état n'apprend rien.
    private var floatingRail: AnyView {
        guard case .doors(let servies) = railMode else { return AnyView(EmptyView()) }
        let portes = ComposerSceneFloatingRail.sideRow(from: servies, format: format)
        guard !portes.isEmpty else { return AnyView(EmptyView()) }
        return AnyView(
            ComposerLeadingRail(mode: .doors(portes),
                                plateauTint: plateauTint,
                                onDoor: onRailDoor,
                                // Il FLOTTE : pas de ressort, sinon son socle
                                // s'étire sur toute la hauteur de la scène et
                                // la dernière entrée déborde sous elle.
                                pushesToThumb: false,
                                badges: railBadges)
                // Les MÊMES deux marges que le rail *trailing* : depuis la
                // scène plein écran (#8370), elles le posent SUR la scène, à
                // `outerMargin` du bord.
                .padding(.leading, ComposerRailGeometry.outerMargin)
                .padding(.bottom, ComposerRailGeometry.gutter)
        )
    }

    /// Ce qui FAIT ENTRER de la matière. Absente pendant qu'un outil est
    /// ouvert : la rangée ferait alors concurrence aux contrôleurs de l'outil,
    /// et l'arbitrage donne la priorité du bas à l'outil en cours.
    private var lowToolRow: AnyView {
        // **Un outil OUVERT prend le BAS** (directive porteur 2026-08-31) : ses
        // réglages y ont la largeur, et le rail de gauche redevient ce qu'il
        // est — des portes. Les deux ne coexistent jamais, ce qui donne au bas
        // de l'écran un seul sens à la fois.
        if case .tool = railMode {
            return AnyView(
                ComposerLeadingRail(mode: railMode,
                                    plateauTint: plateauTint,
                                    onToolControl: onRailToolControl,
                                    onExitTool: onRailExitTool,
                                    axis: .horizontal)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, ComposerRailGeometry.outerMargin)
                    .padding(.bottom, 4)
            )
        }
        guard case .doors(let servies) = railMode else { return AnyView(EmptyView()) }
        let portes = ComposerSceneFloatingRail.lowRow(from: servies, format: format)
        guard !portes.isEmpty else { return AnyView(EmptyView()) }
        return AnyView(
            // L'ordre des arguments suit l'ordre de DÉCLARATION — lu, jamais
            // deviné : c'est la cinquième fois de la session que je le paie.
            ComposerLeadingRail(mode: .doors(portes),
                                plateauTint: plateauTint,
                                onDoor: onRailDoor,
                                axis: .horizontal,
                                systemEntry: railSystemEntry,
                                systemEntryAfter: railSystemEntryAfter,
                                badges: railBadges)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, ComposerRailGeometry.outerMargin)
                .padding(.bottom, 4)
        )
    }

    /// **Le volet de description, borné à la CARTE** (#4993).
    ///
    /// Les marges valent la place d'un rail de chaque côté (`lane`) : sans
    /// elles, le volet s'étalerait sur toute la largeur et croiserait les deux
    /// rails, qui flottent sur la scène à cette hauteur. Elles se lisaient des
    /// couloirs (`sceneInset`), qui valent zéro depuis la scène plein écran
    /// (#8370) — le volet recouvrait alors le bas des deux rails (#8388).
    @ViewBuilder
    private var descriptionOverlay: some View {
        if let descriptionPanel {
            descriptionPanel
                .padding(.leading, ComposerRailGeometry.lane)
                .padding(.trailing, ComposerRailGeometry.tileLane)
                .padding(.bottom, 10)
        }
    }

    /// Le bord gauche du DESSIN, mesuré par le canvas et lu par l'en-tête son
    /// (#5011). `0` tant que la première passe de mise en page n'a pas eu lieu.
    @State private var sceneCardLeading: CGFloat = 0

    // MARK: - La scène PREND LE VIEWPORT, le chrome flotte dessus (#8370)

    /// **Deux calques, et c'est toute la disposition** (directive porteur
    /// 2026-09-27, maquette `docs/product/composer-plein-ecran/iOS.dc.html` :
    /// « la scène est en plein écran et le reste des contrôleurs sont par-dessus
    /// la scène »).
    ///
    /// La carte vivait dans une `VStack`, entre la barre haute et les rangées du
    /// bas : chaque bande qu'on y ajoutait lui prenait sa hauteur, et elle ne
    /// pouvait JAMAIS occuper l'écran. Elle se cadre désormais sur le viewport
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
        }
        .onPreferenceChange(ComposerSceneCardLeadingKey.self) { sceneCardLeading = $0 }
        // **La barre de statut s'efface** (directive porteur 2026-09-27 : la
        // croix et le `⋯` « un peu plus haut pour ne pas être sur la scène »).
        // Comme le lecteur de stories : la rangée de l'horloge rend sa hauteur,
        // et la croix monte dans celle de la Dynamic Island, aux coins.
        .statusBarHidden(true)
    }

    /// **Le SOL de la scène : le thumbhash de son propre résultat** (directive
    /// porteur 2026-09-27 : « la scène doit avoir un sol peint en thumbhash du
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
        SceneBackdropView(backdrop: .thumbHash, thumbHash: floorHash)
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture { onBackgroundTapped?() }
            .allowsHitTesting(drawingSurface == nil)
            .task(id: floorKey) {
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

    /// Ce qui change le RÉSULTAT au point de changer son hachage : la slide, son
    /// fond, sa matière, son cadrage et les bitmaps chargés. Une position ou une échelle ne
    /// la touchent pas — le sol n'a pas à être recalculé à chaque image d'un
    /// geste, et un hachage de 32 pixels ne verrait pas la différence.
    private var floorKey: ComposerSceneFloorKey {
        ComposerSceneFloorKey(slideId: slide.id,
                              background: slide.effects.background,
                              media: slide.effects.mediaObjects?.map(\.id) ?? [],
                              texts: slide.effects.textObjects.map(\.id),
                              framing: [slide.effects.backgroundTransform?.videoFitMode,
                                        slide.effects.backgroundTransform?.backdrop],
                              imagesVersion: sceneImagesVersion)
    }

    private var sceneLayer: some View {
        EmbeddedSceneCanvas(
            slide: $slide,
            aspectRatio: aspectRatio,
            cornerRadius: 22,
            // **Le dessin se pose DANS la carte, pas sur le cadre** (#4515) : un
            // trait hors du canvas est perdu à la publication.
            canvasOverlay: drawingSurface,
            // Les sons posés sur la scène (#4722) — retirés pendant le dessin,
            // dont le calque prend la carte entière.
            objectOverlay: drawingSurface == nil
                ? { taille in AnyView(sceneSoundOverlay(canvasSize: taille)) }
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
            // « Un seul objet à la fois » a son témoin sur la scène (#4073).
            selectedItemId: selectedItemId,
            selectionBadge: selectionBadge
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // **La surface PUBLIE la place du viseur, elle ne le peint pas**
        // (#4080, directive porteur 2026-09-04). Le meuble le monte une seule
        // fois ; `Color.clear` + `aspectRatio(.fit)` reproduit exactement le
        // rectangle du dessin dans le repère où la carte se cadre.
        .overlay {
            Color.clear
                .aspectRatio(aspectRatio, contentMode: .fit)
                .anchorPreference(key: ComposerSceneCameraFrameKey.self,
                                  value: .bounds) { $0 }
                .allowsHitTesting(false)
        }
        // **Le bord gauche du DESSIN, mesuré ici et remonté** (#5011) : la
        // trace du son et le pied des références s'alignent sur la carte, qui
        // se centre dans le viewport et n'en touche le bord que si la largeur la
        // contraint.
        .background {
            GeometryReader { geo in
                Color.clear
                    .preference(
                        key: ComposerSceneCardLeadingKey.self,
                        value: ComposerRailGeometry.sceneLeadingInset(
                            overlay: geo.size,
                            ratio: aspectRatio,
                            horizontalInset: ComposerRailGeometry.sceneInset(railsShown: true)))
            }
        }
        // **La scène se pose ENTRE la barre haute et le socle** (directive
        // porteur 2026-09-27). Ni la croix ni la capsule Publier ne se posent
        // sur le dessin : la zone sûre du bas porte déjà le socle
        // (`composerFloatingSocle`), celle du haut porte la barre, et la carte
        // se cadre dans ce qui reste. Le clavier, lui, ne la pousse pas — le
        // sol et le chrome montent, la scène reste où l'auteur la regarde.
        .padding(.top, ComposerTopBar.height + 4)
        .padding(.bottom, 4)
        .ignoresSafeArea(.keyboard)
    }

    private var chromeLayer: some View {
        VStack(alignment: .leading, spacing: 0) {
            ComposerTopBar(
                slideRailSlot: slideRailSlot,
                overflowMenu: overflowMenu,
                onClose: onClose,
                plateauTint: plateauTint
            )

            // **La trace du son de FOND, en tête** (#5001, #5017) : elle se lit
            // AVEC la scène, comme un titre avec ce qu'il titre. Aucun `tint:` —
            // `plateauTint` est un FOND, et le passer en couleur de contenu peint
            // la capsule dans la couleur de ce qu'elle recouvre (#5011).
            ComposerSceneSoundHeader(backgroundSound: backgroundSound,
                                     toolIsOpen: toolIsOpen,
                                     leadingInset: sceneCardLeading,
                                     onEdit: onEditBackgroundSound,
                                     onDelete: onDeleteBackgroundSound,
                                     onPromote: onPromoteBackgroundSound)
                .padding(.top, 4)

            freeZone

            // **Ce que la publication EMPORTE** (#5002, #5036) — hashtags et
            // mentions, juste sous la scène libre. Il CÈDE aux options d'un
            // outil (#5010), par `ComposerCanonicalZone`, jamais par un
            // `!toolIsOpen` écrit ici.
            if ComposerCanonicalZone.isServed(.references, toolIsOpen: toolIsOpen) {
                ComposerSceneReferenceFooter(hashtags: sceneHashtags,
                                             references: sceneReferences,
                                             leadingInset: sceneCardLeading,
                                             onOpenHashtags: onOpenHashtags,
                                             onOpenMentions: onOpenMentions)
            }

            // **Le panneau d'options passe AVANT la bande de fond** (#4064) :
            // l'outil ouvert a la priorité sur le bas, et les deux ne
            // coexistent jamais. L'exclusion se lit sur `railMode`, par
            // `ComposerLowZone`, jamais sur la présence du panneau.
            switch ComposerLowZone.resolve(toolIsOpen: toolIsOpen, band: band) {
            case .toolOptions:
                if let toolOptions { toolOptions }
            case .band(let ouverte):
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
            case .nothing:
                EmptyView()
            }
            // L'inspecteur de l'objet sélectionné (#4073) — un outil ouvert
            // lui prend la place, par le MODE DU RAIL.
            if ComposerObjectChips.isServed(toolIsOpen: toolIsOpen, chips: objectChips) {
                ComposerObjectChipsRow(chips: objectChips,
                                       onSelect: onObjectChip)
            }
            // **La rangée basse — une PLACE permanente, un contenu qui change**
            // (#4072, #5010) : outil ouvert, ses contrôleurs ; sinon, les portes
            // qui font ENTRER de la matière ; viseur armé, ses commandes (#4080).
            lowToolRow
        }
    }

    /// **La scène LIBRE** — le vide du calque de chrome, où la scène se voit et
    /// se touche. Les deux rails y flottent au bas, à portée du pouce, avec les
    /// MÊMES marges (#4633) ; le volet de description s'y pose entre eux (#4993).
    private var freeZone: some View {
        ZStack(alignment: .bottom) {
            HStack(alignment: .bottom, spacing: 0) {
                floatingRail
                Spacer(minLength: 0)
                ComposerTrailingRail(actions: trailingActions,
                                     plateauTint: plateauTint,
                                     onAction: onTrailingAction,
                                     onAddSlide: onAddSlide,
                                     onUndo: onUndo,
                                     onRedo: onRedo,
                                     pushesToThumb: false,
                                     labeledTiles: true)
                    .padding(.trailing, ComposerRailGeometry.outerMargin)
                    .padding(.bottom, ComposerRailGeometry.gutter)
            }
            // **Le volet CÈDE au viseur** (#4080) : la question passe par la
            // règle, jamais par un `cameraStage != .off` écrit ici.
            if ComposerSceneCameraOverlay.isServed(.description, stage: cameraStage) {
                descriptionOverlay
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }

    // **Le champ PERMANENT est parti** (directive porteur 2026-08-30) :
    //
    // > « La zone de description en bas ne doit pas être affichée si on ne
    // > touche pas l'icône description, même si une description existe ! »
    //
    // Il vivait ici en calque de lecture (#4065) et occupait le bas dès qu'un
    // texte existait — la place que la scène centrée réclame, pour un texte que
    // l'auteur ne regarde pas la plupart du temps. La description s'ouvre
    // désormais par sa PORTE, comme les autres niveaux du modèle, et le meuble
    // monte l'éditeur en zone basse (`sceneDescriptionEditor`).
    //
    // `description` et `descriptionPlaceholder` restent au contrat : la porte
    // est servie par le meuble, qui possède le texte. Les retirer obligerait
    // chaque site de montage à re-prouver qu'il n'en a pas besoin.
}

/// La clé du SOL de la scène — ce qui en change le hachage (#8370).
struct ComposerSceneFloorKey: Hashable {
    let slideId: String
    let background: String?
    let media: [String]
    let texts: [String]
    /// Le cadrage et le fond du panneau Cadre (#8414) : ils changent le composite.
    let framing: [String?]
    let imagesVersion: UInt64
}
