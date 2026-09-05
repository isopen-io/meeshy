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
/// | la scène 9:16, encastrée | une `MeeshyScene` |
/// | rail *trailing* — les contrôleurs | UN `MeeshySceneObject` |
/// | la description | la `MeeshySlide` |
///
/// Le SOCLE n'est pas ici : il vit au meuble, sous les trois surfaces, et ne
/// bouge jamais (loi 5).
struct ComposerSceneSurface: View {

    // MARK: - La publication

    let localMedia: [ComposerDocumentMedia]
    let selectedMediaURL: URL?
    let selectableMediaURLs: Set<URL>
    /// **Le format COURANT, parce que la géographie des rails en dépend**
    /// (#4893). Lieu, hashtag, mention et corpus de texte ne se posent sur la
    /// scène qu'en Story ; ailleurs ils qualifient la publication et vivent en
    /// bas. La surface ne décide de rien — elle ne peut simplement pas
    /// interroger `ComposerSceneFloatingRail` sans dire pour quoi elle compose.
    let format: ComposerFormat
    let formatFan: AnyView?
    let overflowMenu: AnyView?
    let onClose: () -> Void
    var onRemoveMedia: ((ComposerDocumentMedia) -> Void)?
    var onSelectMedia: ((ComposerDocumentMedia) -> Void)?

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

    /// **Ancre un rail au bas du DESSIN, jamais au bas de la frame** (#4119).
    ///
    /// La carte est figée à son ratio et se CENTRE dans la hauteur qu'on lui
    /// donne. Un `.overlay(alignment: .bottom…)` tombe donc au bas de la FRAME,
    /// c'est-à-dire SOUS la composition — d'un écart qui vaut la moitié de la
    /// hauteur perdue, nul en 9:16 plein et maximal en paysage. Mesuré au
    /// simulateur : environ 25 pt, assez pour que la dernière porte flotte à
    /// côté du plateau plutôt qu'à côté de la scène.
    ///
    /// > Un rail qui suit la frame et non la composition n'est pas « un peu
    /// > plus bas » : il cesse de dire à quoi il s'applique.
    ///
    /// Le `GeometryReader` lit la taille de la vue PADDÉE — celle qui inclut
    /// les deux couloirs. C'est `ComposerRailGeometry.sceneBottomInset` qui en
    /// retire l'encastrement pour retrouver la largeur de la carte : sans cette
    /// soustraction, l'inset serait juste en portrait et faux partout ailleurs,
    /// exactement le genre de justesse accidentelle qui survit à une relecture.
    @ViewBuilder
    private func ancreAuDessin<Contenu: View>(_ contenu: Contenu,
                                              alignment: Alignment) -> some View {
        GeometryReader { geo in
            contenu
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
                .padding(.bottom, ComposerRailGeometry.sceneBottomInset(
                    overlay: geo.size,
                    ratio: aspectRatio,
                    horizontalInset: ComposerRailGeometry.sceneInset(railsShown: true)))
        }
    }

    /// **Borne un contenu AU DESSIN** (#4080) — ni au-dessus, ni en dessous :
    /// DEDANS.
    ///
    /// `ancreAuDessin` pose au BAS du dessin ; celle-ci lui donne exactement le
    /// rectangle du dessin, de sorte que ce qu'on y met flotte sur l'image et
    /// jamais dans le letterbox. C'est ce que le viseur exige : ses contrôles
    /// posés sur la frame paraîtraient hors de la scène, ce que la directive du
    /// 2026-09-04 corrige mot pour mot.
    @ViewBuilder
    private func ancreDansLeDessin<Contenu: View>(_ contenu: Contenu) -> some View {
        GeometryReader { geo in
            let inset = ComposerRailGeometry.sceneBottomInset(
                overlay: geo.size,
                ratio: aspectRatio,
                horizontalInset: ComposerRailGeometry.sceneInset(railsShown: true))
            contenu
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.vertical, inset)
                .padding(.horizontal, ComposerRailGeometry.sceneInset(railsShown: true))
        }
    }

    /// **Ancre un contenu JUSTE AU-DESSUS du dessin** (#5017) — la jumelle
    /// haute de `ancreAuDessin`, et pour la même raison.
    ///
    /// > Directive porteur 2026-09-03 : « il faut mettre **juste au dessus de la
    /// > scene** ! »
    ///
    /// Posée en frère dans la pile, la trace du son se collait sous la barre
    /// haute — deux cents points au-dessus de la carte. L'écart n'est pas une
    /// marge à régler : la carte est ajustée à son ratio et se CENTRE dans la
    /// hauteur qu'on lui donne, donc le vide du haut vaut celui du bas et varie
    /// avec le ratio.
    ///
    /// > Une étiquette séparée de ce qu'elle étiquette cesse d'être une
    /// > étiquette. Le vide la rattachait visuellement à la barre haute —
    /// > c'est-à-dire à la PUBLICATION — alors qu'elle parle de la SCÈNE.
    ///
    /// `padding(.top, inset)` porte la ligne d'alignement sur le bord HAUT du
    /// dessin ; `alignmentGuide(.top) { $0[.bottom] }` fait tomber le BAS du
    /// contenu sur cette ligne. Aucune hauteur n'est mesurée ni écrite : le
    /// contenu se soulève de la sienne, quelle que soit la taille de texte.
    @ViewBuilder
    private func ancreAuDessusDuDessin<Contenu: View>(_ contenu: Contenu) -> some View {
        GeometryReader { geo in
            contenu
                .alignmentGuide(.top) { dimensions in dimensions[.bottom] }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.top, ComposerRailGeometry.sceneBottomInset(
                    overlay: geo.size,
                    ratio: aspectRatio,
                    horizontalInset: ComposerRailGeometry.sceneInset(railsShown: true)))
        }
        // La bande ne prend AUCUN doigt : elle flotte au-dessus de la carte, et
        // le canvas doit continuer de recevoir les gestes sur toute sa surface.
        // Seule la capsule elle-même est touchable.
        .allowsHitTesting(true)
    }

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
                // Les MÊMES deux marges que le rail *trailing* : elles le
                // posent dans le couloir du plateau, jamais sur la scène.
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
    /// Les marges reprennent les deux couloirs (`sceneInset`) plus l'air qui
    /// l'écarte du bord : sans elles, le volet s'étalerait sur toute la largeur
    /// paddée et croiserait les deux rails, qui vivent précisément dans ces
    /// couloirs et à cette hauteur.
    @ViewBuilder
    private var descriptionOverlay: some View {
        if let descriptionPanel {
            descriptionPanel
                .padding(.horizontal, ComposerRailGeometry.sceneInset(railsShown: true) + 10)
                .padding(.bottom, 10)
        }
    }

    /// Le bord gauche du DESSIN, mesuré par le canvas et lu par l'en-tête son
    /// (#5011). `0` tant que la première passe de mise en page n'a pas eu lieu.
    @State private var sceneCardLeading: CGFloat = 0

    /// Le letterbox BAS du dessin, remonté par `ComposerSceneCardBottomKey`
    /// (#5036). Le pied des références s'en sert pour COLLER à la carte plutôt
    /// qu'au bas de la frame.
    @State private var sceneCardBottom: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
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

            // **La trace du son de FOND, EN TÊTE de la scène** (#5001, directive
            // porteur 2026-09-03 : « il faut ajouter au dessus de la scene une
            // note suivi du detail de l'audio de fond »).
            //
            // Elle vivait SOUS la carte, au niveau SLIDE de l'escalier du bas
            // (#4918). Ce lot la DÉPLACE, et il faut dire ce que cela amende :
            // l'escalier reste juste pour ce qui se RÈGLE, il l'était moins
            // pour ce qui se CONSTATE. Un son de fond n'est pas un réglage
            // qu'on descend chercher — il commence avec la scène, dure autant
            // qu'elle, et n'apparaît sur aucun de ses pixels. Sous la carte, il
            // partageait la place avec la bande d'outil et les jetons d'objet
            // et se lisait en dernier ; au-dessus, il se lit AVEC la scène,
            // comme un titre se lit avec ce qu'il titre.
            //
            // Dans le COULOIR, jamais sur la carte (`apps/ios/CLAUDE.md` § 1,
            // loi 6) : un son de fond ne produit aucun pixel au rendu.
            VStack(spacing: 8) {
                EmbeddedSceneCanvas(
                    slide: $slide,
                    aspectRatio: aspectRatio,
                    cornerRadius: 22,
                    // **Le dessin se pose DANS la carte, pas sur le cadre**
                    // (#4515). Il était un `overlay` frère, donc étalé sur tout
                    // le cadre de mise en page : mesuré à l'écran, un trait
                    // descendait SOUS la carte, sur le plateau — et un trait
                    // hors du canvas est perdu à la publication, le rendu final
                    // ne connaissant que la carte.
                    canvasOverlay: drawingSurface,
                    // Les sons posés sur la scène (#4722) — dans le slot qui ne
                    // capture pas, et retirés pendant le dessin, dont le calque
                    // prend la carte entière.
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
                    // Le canvas retire son calque de dessin persisté pendant
                    // qu'une surface live est posée dessus — sinon le trait
                    // s'affiche deux fois, à deux endroits (défaut 2026-05-27).
                    isDrawingOverlayActive: drawingSurface != nil,
                    editingTextId: editingTextId,
                    onInlineTextChanged: onInlineTextChanged,
                    onInlineTextEditEnded: onInlineTextEditEnded,
                    // **« Un seul objet à la fois » a enfin un témoin** (#4073,
                    // vue `1c`). L'inspecteur, les contrôleurs du rail et le
                    // menu d'appui long portaient tous sur un objet que rien ne
                    // désignait sur la scène ; le seul indice était que la
                    // rangée de jetons changeait de contenu.
                    selectedItemId: selectedItemId,
                    selectionBadge: selectionBadge
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                // **Le viseur OCCUPE la carte** (#4080, vue `2b`) — il ne
                // s'ouvre pas par-dessus elle.
                //
                // > « utiliser le fond de la scène comme caméra » — porteur,
                // > 2026-09-04
                //
                // Posé AVANT le padding des couloirs, exprès : le repère est
                // alors celui dans lequel la carte se `fit`, donc un
                // `aspectRatio(.fit)` y reproduit EXACTEMENT le rectangle du
                // dessin. Posé après, il couvrirait aussi les couloirs — et le
                // viseur déborderait sur les rails, qui sont précisément ce
                // qu'on garde visible pour que la caméra reste une ENTRÉE et
                // non un mode.
                //
                // `allowsHitTesting(false)` : l'aperçu ne prend aucun doigt.
                // Les gestes de la scène — déplacer, pincer, l'appui long qui
                // a armé ce viseur — continuent d'atteindre le canvas dessous.
                // **La surface ne PEINT plus le viseur — elle PUBLIE sa
                // place** (directive porteur 2026-09-04).
                //
                // Le viseur avait deux montages : ici pour la carte, et un
                // overlay de la surface entière pour le plein écran. Passer de
                // l'un à l'autre DÉTRUISAIT l'aperçu pour en construire un
                // second, qui doit ensuite attendre sa première image — c'est
                // le « trop de temps » du porteur, et aucune courbe
                // d'animation ne le rattrape.
                //
                // Il n'y a plus qu'un montage, et il est chez le MEUBLE : le
                // socle (audience · aperçu · publier) est le FRÈRE de cette
                // surface dans la `VStack` de l'hôte, donc aucun overlay posé
                // ici ne peut le couvrir. La directive demande précisément
                // qu'il disparaisse en plein écran.
                //
                // Ce qui reste ici est la seule chose que la surface sache et
                // que le meuble ignore : OÙ la scène dessine. `Color.clear` +
                // `aspectRatio(.fit)` reproduit exactement le rectangle du
                // dessin — la même construction que l'aperçu occupait — et
                // l'ancre le fait descendre sans repère partagé.
                .overlay {
                    Color.clear
                        .aspectRatio(aspectRatio, contentMode: .fit)
                        .anchorPreference(key: ComposerSceneCameraFrameKey.self,
                                          value: .bounds) { $0 }
                        .allowsHitTesting(false)
                }

                // **La scène s'ENCASTRE entre les deux couloirs** (#4061). Le
                // nombre se lit de la règle, jamais d'un littéral : il n'est pas
                // un goût de marge mais une conséquence — cible tactile 44 pt,
                // gouttière, marge de bord.
                //
                // Les rails se posent DANS ces couloirs par surimpression : le
                // repère de la vue paddée les inclut, donc `.bottomLeading` et
                // `.bottomTrailing` tombent sur le plateau, jamais sur la scène.
                // C'est la loi 6 — un rail posé sur la scène ferait mentir
                // l'aperçu sur le rendu final.
                .padding(.horizontal, ComposerRailGeometry.sceneInset(railsShown: true))
                // **Le bord gauche du DESSIN, mesuré ici et remonté** (#5011).
                // La carte se centre dans la largeur qu'on lui donne : son bord
                // n'est pas celui du couloir, et l'écart dépend du ratio ET de
                // la hauteur. L'en-tête est un FRÈRE de ce canvas — il ne peut
                // pas le calculer, seulement le recevoir.
                //
                // Posé APRÈS le padding, comme les deux `ancreAuDessin` : le
                // repère doit inclure les couloirs, sans quoi `sceneLeadingInset`
                // calculerait le `fit` sur une largeur que la carte n'occupe
                // jamais.
                .background {
                    GeometryReader { geo in
                        Color.clear
                            .preference(
                                key: ComposerSceneCardLeadingKey.self,
                                value: ComposerRailGeometry.sceneLeadingInset(
                                    overlay: geo.size,
                                    ratio: aspectRatio,
                                    horizontalInset: ComposerRailGeometry.sceneInset(railsShown: true)))
                            // **Le letterbox BAS, par le MÊME lecteur** (#5036).
                            // Deux `GeometryReader` sur la même vue mesureraient
                            // la même chose deux fois et pourraient diverger d'une
                            // passe de layout ; un seul lecteur, deux préférences.
                            .preference(
                                key: ComposerSceneCardBottomKey.self,
                                value: ComposerRailGeometry.sceneBottomInset(
                                    overlay: geo.size,
                                    ratio: aspectRatio,
                                    horizontalInset: ComposerRailGeometry.sceneInset(railsShown: true)))
                    }
                }
                // **L'ORDRE des modificateurs EST la disposition** (#4633,
                // directive porteur 2026-08-31) :
                //
                //   > « La bande gauche d'outil applicable dans un canvas doit
                //   > être placée sur le plateau hors du canvas. »
                //
                // Cet overlay était posé AVANT le padding — son repère excluait
                // donc les couloirs, et `.leading` tombait SUR la scène. Son
                // jumeau *trailing*, douze lignes plus bas, était posé APRÈS et
                // tombait dans le couloir. **Une seule des deux moitiés de la
                // directive #4561 avait été appliquée**, pendant que le
                // doc-comment de la seconde affirmait « les deux rails vivent
                // dans les COULOIRS du plateau ».
                //
                // Rien ne pouvait rougir : les deux formes compilent, les deux
                // montent le rail, et la différence ne se voit qu'au pixel — ou
                // au doigt, quand on essaie de traîner un objet sous la colonne
                // et que la scène ne répond pas.
                //
                // `.bottomLeading` et non `.leading` : ancré en bas comme son
                // jumeau, à portée du pouce, et avec les MÊMES marges — deux
                // rails qui encadrent la même scène à deux hauteurs différentes
                // se voient avant de se comprendre.
                // **La trace du son, JUSTE au-dessus de la carte** (#5017).
                //
                // Aucun `tint:` — et c'est mesuré, pas oublié : `plateauTint`
                // est le FOND du plateau (`indigo950`), et le passer en couleur
                // de CONTENU peint la capsule dans la couleur de ce qu'elle
                // recouvre. Vérifié au simulateur au #5011 : l'arbre
                // d'accessibilité portait la ligne, l'écran ne montrait rien.
                .overlay(alignment: .topLeading) {
                    ancreAuDessusDuDessin(
                        ComposerSceneSoundHeader(backgroundSound: backgroundSound,
                                                 toolIsOpen: toolIsOpen,
                                                 leadingInset: sceneCardLeading,
                                                 onEdit: onEditBackgroundSound,
                                                 onDelete: onDeleteBackgroundSound,
                                                 onPromote: onPromoteBackgroundSound))
                }
                .overlay(alignment: .bottomLeading) { ancreAuDessin(floatingRail, alignment: .bottomLeading) }
                // **Les deux rails vivent dans les COULOIRS du plateau**
                // (directive porteur 2026-08-31, #4561) :
                //
                //   > « On exploite la place du plateau sans encombrer le
                //   > canvas », ce qui « permet de manipuler tout le canvas sans
                //   > problème ».
                //
                // Cela REMPLACE l'arbitrage du 2026-08-28, qui faisait flotter
                // le rail sur le bord droit DANS la scène en s'appuyant sur les
                // quatre pastilles de la planche `1b`. Deux raisons, et la
                // seconde est celle que la directive ajoute : la loi 6 (un
                // contrôle posé sur la scène fait mentir l'aperçu sur le rendu
                // final), et la MANIPULATION — un objet se déplace, se pince et
                // se tourne n'importe où dans le cadre, donc un rail flottant
                // vole les touches de la bande qu'il couvre. L'auteur découvre
                // la zone morte en essayant d'y traîner quelque chose.
                //
                // Le plateau est de la place DISPONIBLE : la scène est figée en
                // 9:16 et l'écran ne l'est pas. L'occuper ne coûte rien ;
                // occuper le canvas coûte une zone morte.
                .overlay(alignment: .bottomTrailing) {
                    ancreAuDessin(
                        ComposerTrailingRail(actions: trailingActions,
                                             plateauTint: plateauTint,
                                             onAction: onTrailingAction,
                                             onAddSlide: onAddSlide,
                                             onUndo: onUndo,
                                             onRedo: onRedo)
                            .padding(.trailing, ComposerRailGeometry.outerMargin)
                            .padding(.bottom, ComposerRailGeometry.gutter),
                        alignment: .bottomTrailing
                    )
                }
                // **La description, ANCRÉE AU BAS DE LA CARTE** (#4993,
                // directive porteur 2026-09-03).
                //
                // Troisième overlay posé APRÈS le padding, comme ses deux
                // voisins — mais avec `alignment: .bottom` et une marge qui
                // REPREND les couloirs, si bien qu'il tombe sur la carte et non
                // dans le couloir. C'est l'exception que le doc-comment de la
                // loi 6 nomme : la description est le seul contenu du composer
                // que le lecteur peint DÉJÀ par-dessus le canvas.
                //
                // `ancreAuDessin` est réemployé tel quel : le volet suit la
                // COMPOSITION, jamais la frame — sans lui il flotterait sous la
                // carte de la moitié de la hauteur perdue dès que le ratio
                // n'est pas plein (#4119).
                .overlay(alignment: .bottom) {
                    // **Le volet CÈDE au viseur** (#4080) : il est ancré au bas
                    // du dessin, c'est-à-dire exactement là où le déclencheur se
                    // pose — mesuré au simulateur, ils se chevauchaient de
                    // quarante points. La question passe par la règle, jamais
                    // par un `cameraStage != .off` écrit ici : les trois meubles
                    // de la carte n'ont pas la même réponse, et c'est ce qui en
                    // fait une décision.
                    if ComposerSceneCameraOverlay.isServed(.description, stage: cameraStage) {
                        ancreAuDessin(descriptionOverlay, alignment: .bottom)
                    }
                }
                // **Le chrome du viseur vit DANS la carte** (#4080, directive
                // porteur 2026-09-04 : « tout doit être dans la scène »).
                //
                // La loi 6 protège l'APERÇU d'une composition, pour qu'il ne
                // mente pas sur le rendu. Un VISEUR n'est pas un aperçu de
                // composition — c'est un instrument de cadrage, et son chrome
                // ne part avec aucune publication. La planche `2b` le dessine
                // d'ailleurs par-dessus l'image.
                //
                // `ancreAuDessin` le borne au DESSIN et non à la frame : posé
                // sur celle-ci, les contrôles flotteraient dans le letterbox,
                // c'est-à-dire hors de la scène — exactement ce que la
                // directive corrige.
                .padding(.top, 8)

                // **Ce que la publication EMPORTE, COLLÉ au bas de la scène**
                // (#5002 pour son contenu, #5036 pour sa place).
                //
                // > Directive porteur 2026-09-03 : « les hashtag et mention
                // > doivent être **directement en bas de la scene** aligné comme
                // > le son de fond de la scene ! »
                //
                // **La loi : ce qui QUALIFIE la scène la touche ; ce qui
                // l'OUTILLE vient après.** D'où sa remontée en TÊTE de la zone
                // basse — devant la bande de mention, la bande contextuelle et
                // les jetons d'objet, qui outillent tous. C'est la jumelle basse
                // de #5017, qui a posé la même loi en haut pour la trace du son,
                // et le porteur fait lui-même le rapprochement.
                //
                // **L'ordre ne suffisait pas, et c'est ce que la mesure a
                // appris.** Le pied était DÉJÀ avant la rangée d'outils, et il
                // flottait pourtant à 77 pt sous le dessin. Ces points ne sont
                // ni une marge ni un espacement : le canvas est
                // `maxHeight: .infinity` et la carte s'y CENTRE — c'est la
                // moitié basse du letterbox, que rien n'occupe. Un `VStack` ne
                // pouvait pas la fermer ; seule la mesure remontée le peut.
                //
                // La remontée passe par `referencesLift`, jamais par un
                // littéral : elle vaut zéro dès que la carte est contrainte par
                // la hauteur (iPad, format non 9:16), cas où il n'y a rien à
                // remonter et où une valeur écrite en dur ferait chevaucher le
                // pied avec la rangée qui le suit.
                //
                // `padding` NÉGATIF et non `offset` : il collapse la mise en
                // page, donc ce qui suit remonte avec lui. Un `offset`
                // déplacerait le dessin du pied en laissant sa place réservée —
                // le trou serait simplement descendu d'un cran.
                //
                // **Il CÈDE la place aux options d'un outil** (#5010, directive
                // porteur 2026-09-03 : « lorsqu'on affiche les options d'un
                // outil il faut cacher les éléments permanents de la zone
                // canonique »). C'était le SEUL élément du bas que personne ne
                // gouvernait. La question passe par `ComposerCanonicalZone`,
                // jamais par un `!toolIsOpen` écrit ici : la troisième copie
                // d'une condition diverge, et ce fichier a déjà payé cette leçon.
                //
                // Dans le couloir, sous la carte — jamais dessus : aucun hashtag
                // ni aucune personne nommée ne se peint sur un pixel du rendu, et
                // les poser là volerait les touches de la bande qu'ils
                // couvriraient (loi 6).
                if ComposerCanonicalZone.isServed(.references, toolIsOpen: toolIsOpen) {
                    ComposerSceneReferenceFooter(hashtags: sceneHashtags,
                                                 references: sceneReferences,
                                                 leadingInset: sceneCardLeading,
                                                 onOpenHashtags: onOpenHashtags,
                                                 onOpenMentions: onOpenMentions)
                        .padding(.top, -ComposerRailGeometry.referencesLift(
                            cardBottomInset: sceneCardBottom,
                            gutter: ComposerRailGeometry.referencesGutter))
                }

                // **La bande contextuelle, entre la scène et la description**
                // (#4064). L'ordre n'est pas un rangement : de haut en bas, le
                // bas de l'écran descend les niveaux du modèle — l'objet (les
                // rails, sur la scène), la SCÈNE (cette bande), la SLIDE (la
                // description), la PUBLICATION (le socle, au meuble).
                //
                // Montée sans transition ni animation : la bande est un frère
                // du canvas, et animer son insertion ferait varier la frame de
                // `StoryCanvasUIView` sur chaque image du ressort.
                // Le panneau d'options passe AVANT la bande de fond : c'est
                // l'outil ouvert qui a la priorité sur le bas de l'écran, et
                // les deux ne coexistent jamais (ouvrir un outil ferme la
                // bande, et réciproquement).
                //
                // **L'exclusion se lit sur `railMode`, jamais sur la présence
                // du panneau** : l'hôte le passe inconditionnellement (il se
                // vide lui-même), donc `toolOptions == nil` était toujours faux
                // et `ComposerSceneBandView` n'a JAMAIS été montée ici — la
                // palette de fond, la bande de rognage et tout jeton d'objet
                // qui ouvre une bande étaient inertes. `ComposerLowZone` porte
                // le détail et la règle ; la rangée de jetons, douze lignes
                // plus bas, posait déjà la même question au même endroit.
                switch ComposerLowZone.resolve(toolIsOpen: toolIsOpen, band: band) {
                case .toolOptions:
                    if let toolOptions { toolOptions }
                case .band(let ouverte):
                    ComposerSceneBandView(band: ouverte,
                                          colors: bandColors,
                                          onPickColor: onPickBandColor,
                                          openingEffect: bandOpeningEffect,
                                          onPickOpening: onPickBandOpening)
                case .nothing:
                    EmptyView()
                }
                // **L'inspecteur de l'objet sélectionné** (#4073, vue `1c`) —
                // au-dessus de la rangée d'outils, sous tout ce qui appartient
                // à la scène. Il descend le même escalier que le reste du bas :
                // l'OBJET d'abord, puis la scène, puis la slide, puis la
                // publication.
                //
                // **Un outil ouvert lui prend la place**, et c'est voulu : les
                // deux règlent des choses différentes au même endroit, et les
                // empiler ferait remonter la scène de cinquante points sous le
                // doigt. La même exclusion que la bande, pour la même raison.
                // **Le témoin d'« outil ouvert » est le MODE DU RAIL, jamais
                // la présence du panneau d'options** : l'hôte passe ce dernier
                // inconditionnellement (il se vide lui-même), donc `toolOptions
                // == nil` était toujours faux et la rangée n'a jamais pu
                // paraître. Mesuré à l'écran, pas déduit.
                // **La description de la SLIDE, juste sous la scène** (#4742).
                //
                // Elle prend la place que la doctrine de ce fichier lui donnait
                // depuis le début — « l'objet, la SCÈNE, la SLIDE, la
                // PUBLICATION » — et qu'elle n'occupait pas : montée en overlay
                // de bas d'écran et SEULEMENT en mode saisie, elle était
                // invisible le reste du temps. Un texte qui part avec la
                // publication et que l'auteur ne voit jamais est un texte qu'il
                // oublie.
                // **La trace du son de fond a QUITTÉ cette marche** (#5001) :
                // elle est montée en tête de la surface, juste sous la barre
                // haute. Le raisonnement qui l'a déplacée est écrit là-bas, à
                // l'endroit où elle se peint désormais — le laisser ici en
                // double aurait fait deux doctrines pour une capsule.
                if ComposerObjectChips.isServed(toolIsOpen: toolIsOpen, chips: objectChips) {
                    ComposerObjectChipsRow(chips: objectChips,
                                           onSelect: onObjectChip)
                }
                // **La rangée basse — une PLACE permanente, un contenu qui
                // change** (#4072, précisé au #5010).
                //
                // « Permanente » qualifie la place, jamais ce qu'elle peint :
                // `lowToolRow` ÉCHANGE son contenu selon `railMode` — outil
                // ouvert, elle porte les contrôleurs de cet outil ; sinon, les
                // portes qui font ENTRER de la matière.
                //
                // Cette ambiguïté a trompé l'inventaire du #5010, qui comptait
                // la rangée parmi les éléments non gouvernés et prescrivait de
                // la cacher. L'y soumettre aurait caché les contrôleurs de
                // l'outil qu'on venait d'ouvrir — un « correctif » qui casse,
                // appliqué à du code correct, sur la foi d'un mot plutôt que
                // d'une lecture. Elle n'entre donc PAS dans
                // `ComposerCanonicalZone.Element`, et ce commentaire dit
                // pourquoi pour que personne ne l'y remette.
                // **Le viseur PREND la rangée basse** (#4080), exactement
                // comme les contrôleurs d'un outil ouvert la prennent depuis
                // #4072 : la place est permanente, son contenu change.
                //
                // La cible `2b` dessine ces contrôles SUR un aperçu plein
                // écran ; le plateau n'a pas cette géographie — ses rails et sa
                // rangée d'entrées vivent dans les couloirs, et un contrôle
                // posé sur le canvas vole les touches de la bande qu'il couvre
                // (directive porteur 2026-08-31). Ce qui est PRESCRIT par la
                // planche — l'ordre des modes, du déclencheur et de la phrase,
                // et leurs états — est tenu ; c'est la géographie qui suit le
                // plateau, comme pour les rails.
                lowToolRow

            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onPreferenceChange(ComposerSceneCardLeadingKey.self) { sceneCardLeading = $0 }
        .onPreferenceChange(ComposerSceneCardBottomKey.self) { sceneCardBottom = $0 }
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
