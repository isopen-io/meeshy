import SwiftUI
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
/// obligeait ce dernier à savoir ce qu'est un `MeeshyObject`.
///
/// ## Ce qu'elle porte, et sur quel niveau du modèle
///
/// | zone | niveau |
/// |---|---|
/// | barre haute (`ComposerTopBar`) | la `MeeshyPublication` |
/// | rail *leading* — les portes | crée un `MeeshyObject` (sauf « description ») |
/// | la scène 9:16, encastrée | une `MeeshyScene` |
/// | rail *trailing* — les contrôleurs | UN `MeeshyObject` |
/// | la description | la `MeeshySlide` |
///
/// Le SOCLE n'est pas ici : il vit au meuble, sous les trois surfaces, et ne
/// bouge jamais (loi 5).
struct ComposerSceneSurface: View {

    // MARK: - La publication

    let localMedia: [ComposerDocumentMedia]
    let selectedMediaURL: URL?
    let selectableMediaURLs: Set<URL>
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
    var editableSceneKinds: Set<StoryCanvasUIView.CanvasItemKind> = [.text]

    var onBackgroundTapped: (() -> Void)?

    // MARK: - Les deux rails

    /// **Ce que le rail *leading* montre** — déjà résolu par
    /// `ComposerRailMode.resolve`. Cette vue ne re-filtre rien : une seconde
    /// loi 4 divergerait de la première.
    var railMode: ComposerRailMode = .doors([])
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

    var activeObjectChipId: String?
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
    var band: ComposerSceneBand?
    /// Ce que la bande `timeline` montre — composé par le meuble (#4082).
    var bandTimelineContent: AnyView?
    /// Ce que la bande `textStyles` montre — composé par le meuble (#4083).
    var bandTextStylesContent: AnyView?
    var bandColors: [String] = []
    var onPickBandColor: ((String) -> Void)?

    /// L'effet d'ouverture, servi par la même bande que les couleurs — c'est
    /// le contenu du panneau « Fond » de l'atelier, en entier (#4403).
    var bandOpeningEffect: StoryTransitionEffect?
    var onPickBandOpening: ((StoryTransitionEffect?) -> Void)?

    /// **Le panneau d'OPTIONS de l'outil déplié**, monté sous la scène
    /// (directive porteur 2026-08-30). Les BULLES vivent au rail ; ce qui a
    /// besoin de largeur — palette, glissière, dix-huit styles — vit ici.
    var toolOptions: AnyView?

    /// L'édition EN LIGNE, relayée au canvas : le texte se saisit à sa vraie
    /// place, dans sa vraie police, sur le vrai fond.
    var editingTextId: String?
    var onInlineTextChanged: ((String, String) -> Void)?
    var onInlineTextEditEnded: ((String) -> Void)?

    /// **La bande de mention du texte de SCÈNE** (#4475), montée sous le canvas
    /// pendant l'édition. `nil` ⇒ aucune requête `@` en cours, ou aucune
    /// personne à proposer — dans les deux cas, rien de peint (loi 4).
    ///
    /// Elle vit ICI et pas dans le canvas : `StoryCanvasUIView` est du UIKit et
    /// n'a aucune raison de connaître les amis de l'auteur. Ce qu'il donne — le
    /// texte, à chaque frappe — suffit, et c'est le meuble qui en tire une
    /// requête.
    var mentionStrip: AnyView?

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
        let portes = ComposerSceneFloatingRail.sideRow(from: servies)
        guard !portes.isEmpty else { return AnyView(EmptyView()) }
        return AnyView(
            ComposerLeadingRail(mode: .doors(portes),
                                plateauTint: plateauTint,
                                onDoor: onRailDoor,
                                // Il FLOTTE : pas de ressort, sinon son socle
                                // s'étire sur toute la hauteur de la scène et
                                // la dernière entrée déborde sous elle.
                                pushesToThumb: false)
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
        let portes = ComposerSceneFloatingRail.lowRow(from: servies)
        guard !portes.isEmpty else { return AnyView(EmptyView()) }
        return AnyView(
            // L'ordre des arguments suit l'ordre de DÉCLARATION — lu, jamais
            // deviné : c'est la cinquième fois de la session que je le paie.
            ComposerLeadingRail(mode: .doors(portes),
                                plateauTint: plateauTint,
                                onDoor: onRailDoor,
                                axis: .horizontal,
                                systemEntry: railSystemEntry,
                                systemEntryAfter: railSystemEntryAfter)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, ComposerRailGeometry.outerMargin)
                .padding(.bottom, 4)
        )
    }

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
                    loadedImages: sceneImages,
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
                .padding(.top, 8)

                // **La bande contextuelle, entre la scène et la description**
                // (#4064). L'ordre n'est pas un rangement : de haut en bas, le
                // bas de l'écran descend les niveaux du modèle — l'objet (les
                // rails, sur la scène), la SCÈNE (cette bande), la SLIDE (la
                // description), la PUBLICATION (le socle, au meuble).
                //
                // Montée sans transition ni animation : la bande est un frère
                // du canvas, et animer son insertion ferait varier la frame de
                // `StoryCanvasUIView` sur chaque image du ressort.
                // **La bande de mention passe avant tout le reste du bas** : une
                // liste de personnes qui apparaît pendant qu'on écrit doit
                // toucher le texte, pas se ranger sous des réglages.
                if let mentionStrip { mentionStrip }
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
                                          onPickOpening: onPickBandOpening,
                                          timelineContent: bandTimelineContent,
                                          textStylesContent: bandTextStylesContent)
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
                if let descriptionPanel { descriptionPanel }
                if ComposerObjectChips.isServed(toolIsOpen: toolIsOpen, chips: objectChips) {
                    ComposerObjectChipsRow(chips: objectChips,
                                           activeChipId: activeObjectChipId,
                                           onSelect: onObjectChip)
                }
                // **La rangée d'outils BASSE, permanente** (#4072). Elle fait
                // ENTRER de la matière — une photo, un lieu, un tracé — quand le
                // rail agit sur ce qui est déjà là. L'arbitrage la nomme
                // explicitement comme conservée ; la surface n'en avait aucune,
                // et choisir un fond faisait donc disparaître toutes les portes
                // d'entrée d'un coup.
                lowToolRow

            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
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
