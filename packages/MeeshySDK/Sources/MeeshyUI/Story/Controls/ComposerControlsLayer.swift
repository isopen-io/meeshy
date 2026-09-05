import SwiftUI
import UIKit
import PhotosUI
import MeeshySDK

public struct ComposerControlsLayer: View {

    @ObservedObject var viewModel: StoryComposerViewModel

    @Binding var bandStateMachine: BandStateMachine

    /// Contexte de chrome construit par le parent (`StoryComposerView+Chrome`),
    /// site UNIQUE de son calcul. Passé en valeur : cette couche ne recompose
    /// plus sa propre résolution d'état effectif, qui divergeait de celle du
    /// header.
    let chrome: ComposerChromeContext

    @Binding var selectedFilter: StoryFilter?
    @Binding var fgMediaItem: PhotosPickerItem?
    @Binding var showAudioDocumentPicker: Bool
    @Binding var showVoiceRecorderSheet: Bool
    @Binding var showSoundLibrary: Bool

    /// Hauteur redimensionnable du panneau DESSIN (drag du grabber). En mode dessin
    /// (Option A) le canvas reste PLEIN — ce drawer flotte par-dessus son bas.
    @Binding var resizableBandHeight: CGFloat
    let bandMinHeight: CGFloat
    let bandMaxHeight: CGFloat

    /// Ouvre l'éditeur d'image plein écran pour un média (recadrage/filtres/
    /// ajustements). Seul point d'entrée d'édition média — il n'y a plus de
    /// panneau de contrôles média redondant dans le composer.
    let onOpenMediaCrop: (String) -> Void

    /// Ferme le panneau actif QUEL QUE SOIT le chemin (chevron « Retour »,
    /// swipe-down, grabber sous le minimum, tap sur le fond du canvas). Applicateur
    /// unique tenu par le parent : il seul peut effacer les overrides ViewModel
    /// (dessin, timeline) sans lesquels l'état effectif re-forcerait aussitôt le
    /// panneau.
    let onDismissActivePanel: () -> Void

    /// C8 — ouvre le picker de stickers (sheet présentée par StoryComposerView).
    var onOpenStickerPicker: (() -> Void)? = nil

    /// T20 — ouvre le sélecteur de lieu (sheet présentée par StoryComposerView,
    /// qui tient la fabrique injectée par l'app).
    var onOpenLocationPicker: (() -> Void)? = nil

    /// Ouvre le sélecteur de personne à mentionner (sheet présentée par
    /// StoryComposerView). Directive user 2026-08-18.
    var onOpenMentionPicker: (() -> Void)? = nil

    /// Reporte la hauteur RÉELLE rendue de `ComposerBottomBand` (content-driven) au
    /// parent, qui la réserve pour scaler le canvas exactement au-dessus. `0` quand
    /// la band est repliée (FABs seuls / dessin immersif) — le canvas reste plein.
    var onBandHeightChange: ((CGFloat) -> Void)? = nil

    /// Reporte la position Y (coord GLOBALES écran) du BORD SUPÉRIEUR réel de la
    /// band. Contrairement à `onBandHeightChange` (taille de layout, qui peut
    /// sous-estimer si le contenu déborde son `.frame(height:)` ou reste stale
    /// après un resize), `minY` global reflète TOUJOURS le haut visuellement
    /// rendu — le parent y colle le bas du canvas pour qu'il ne soit JAMAIS
    /// recouvert (bug troncature 2026-07-20). `.greatestFiniteMagnitude` = band
    /// repliée (aucune réserve).
    var onBandTopYChange: ((CGFloat) -> Void)? = nil

    /// C7-UI — texte alternatif commité pour un média (id, texte). Le store
    /// ci-dessous en garde l'état ; ce rappel est le canal SORTANT vers le
    /// point de publication, qui vit chez le parent (`StoryComposerView`).
    var onMediaAltCommitted: ((String, String) -> Void)? = nil

    /// C7-UI — opt-in `allowSoundExtraction` de l'auteur. Flag UNIQUE du post
    /// (`Post.allowSoundExtraction`), donc pas d'id de média ici.
    var onAllowSoundExtractionChanged: ((Bool) -> Void)? = nil

    /// C7-UI — PROPRIÉTAIRE de la collecte d'accessibilité média.
    ///
    /// Ce niveau est le plus bas qui survive aux démontages du panneau :
    /// `ComposerBottomBand` n'est monté que sous `if !chrome.isBandHidden`, et
    /// il démonte lui-même `ComposerToolPanelHost` à chaque bascule vers
    /// `.hidden` / `.formatPanel`. Un `@StateObject` dans le host mourait donc
    /// à la première fermeture du panneau Média — le texte alternatif déjà
    /// saisi disparaissait sans que rien ne le signale. Cette couche, elle,
    /// reste montée pendant toute la session de composition.
    @StateObject private var ownedAccessibilityStore = MediaAccessibilityStore()

    /// Store fourni par le parent quand il veut LIRE la collecte au moment de
    /// publier (`mediaAltPayload()` / `allowSoundExtractionPayload()`). Absent,
    /// la couche retombe sur le sien : le champ reste alors saisissable et
    /// persistant, seuls les rappels sortants portent la donnée.
    private let injectedAccessibilityStore: MediaAccessibilityStore?

    private var accessibilityStore: MediaAccessibilityStore {
        injectedAccessibilityStore ?? ownedAccessibilityStore
    }

    public init(
        viewModel: StoryComposerViewModel,
        chrome: ComposerChromeContext,
        bandStateMachine: Binding<BandStateMachine>,
        selectedFilter: Binding<StoryFilter?>,
        fgMediaItem: Binding<PhotosPickerItem?>,
        showAudioDocumentPicker: Binding<Bool>,
        showVoiceRecorderSheet: Binding<Bool>,
        showSoundLibrary: Binding<Bool>,
        resizableBandHeight: Binding<CGFloat>,
        bandMinHeight: CGFloat,
        bandMaxHeight: CGFloat,
        onBandHeightChange: ((CGFloat) -> Void)? = nil,
        onBandTopYChange: ((CGFloat) -> Void)? = nil,
        onOpenMediaCrop: @escaping (String) -> Void,
        onDismissActivePanel: @escaping () -> Void,
        onOpenStickerPicker: (() -> Void)? = nil,
        onOpenLocationPicker: (() -> Void)? = nil,
        onOpenMentionPicker: (() -> Void)? = nil,
        accessibilityStore: MediaAccessibilityStore? = nil,
        onMediaAltCommitted: ((String, String) -> Void)? = nil,
        onAllowSoundExtractionChanged: ((Bool) -> Void)? = nil
    ) {
        self.viewModel = viewModel
        self.chrome = chrome
        self._bandStateMachine = bandStateMachine
        self._selectedFilter = selectedFilter
        self._fgMediaItem = fgMediaItem
        self._showAudioDocumentPicker = showAudioDocumentPicker
        self._showVoiceRecorderSheet = showVoiceRecorderSheet
        self._showSoundLibrary = showSoundLibrary
        self._resizableBandHeight = resizableBandHeight
        self.bandMinHeight = bandMinHeight
        self.bandMaxHeight = bandMaxHeight
        self.onBandHeightChange = onBandHeightChange
        self.onBandTopYChange = onBandTopYChange
        self.onOpenMediaCrop = onOpenMediaCrop
        self.onDismissActivePanel = onDismissActivePanel
        self.onOpenStickerPicker = onOpenStickerPicker
        self.onOpenLocationPicker = onOpenLocationPicker
        self.onOpenMentionPicker = onOpenMentionPicker
        self.injectedAccessibilityStore = accessibilityStore
        self.onMediaAltCommitted = onMediaAltCommitted
        self.onAllowSoundExtractionChanged = onAllowSoundExtractionChanged
    }

    /// Le grabber redimensionne ET replie le band pour TOUS les panneaux d'outil
    /// (plus seulement DESSIN). L'utilisateur veut la poignée rétractable jusqu'à
    /// se cacher entièrement sur chaque outil, comme le dessin (2026-06-02).
    private var isBandResizable: Bool { chrome.effectiveBandState.allowsCollapsibleDrawer }

    /// C-DIR2 (d) : FABs et header partagent la MÊME règle, et désormais le MÊME
    /// argument — la résolution de l'état effectif vit dans le contexte, plus
    /// dans cette couche (le header lisait l'état brut, les FABs l'effectif).
    private var shouldShowFABs: Bool {
        ComposerChromePolicy.fullChromeVisible(chrome)
    }

    @Environment(\.storyComposerToolRowLeadingAccessory) private var toolRowLeadingAccessory

    /// **Le volet que le meuble pose sous la scène** (#4742) — la description
    /// de la slide, repliable. `nil` quand aucun hôte n'en sert.
    @Environment(\.storyComposerBelowCanvasAccessory) private var belowCanvasAccessory

    public var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // **Ce que le meuble pose sous la scène** (#4742) — la description
            // de la slide. Elle vient AVANT la rangée d'outils : de haut en
            // bas, le bas de l'écran descend les niveaux du modèle — la scène,
            // puis la SLIDE (ce volet), puis ce qui fait entrer de la matière.
            if let belowCanvasAccessory { belowCanvasAccessory.makeView() }

            // Barre d'outils horizontale — visible only when the band is hidden
            // (directive 2026-07-10 : outils en bas, centrés, à portée de pouce).
            if shouldShowFABs {
                HStack {
                    Spacer()
                    ComposerToolRow(
                        mediaBadge: mediaBadge,
                        sonBadge: sonBadge,
                        textBadge: textBadge,
                        drawingBadge: drawingBadge,
                        textureBadge: textureBadge,
                        timelineBadge: timelineBadge,
                        activeCategory: nil, // band is hidden so no active category
                        onTap: { cat in
                            // Le DESSIN n'a pas de panneau « tuiles » dans le band : son UI
                            // est les contrôleurs flottants (bulles) + la liste des traits.
                            // Tapper le FAB doit donc ACTIVER le mode dessin (`selectTool`)
                            // — l'`adaptiveOnChange(activeTool)` ouvre alors bulles + band.
                            // `tapFAB` seul ouvrait un band sans contrôles (bug user 2026-06-01).
                            if cat == .drawing {
                                viewModel.selectTool(.drawing)
                            } else if cat == .timeline {
                                // Intention UNIQUE d'ouverture (S4) : la machine
                                // gère `.timeline` comme un outil normal (cf.
                                // `BandStateMachineTests`) — plus de flip solo
                                // du flag ViewModel, seule source du bug de
                                // réservation d'espace du canvas (§0 du rapport).
                                bandStateMachine.openTimeline(isTimelineVisible: &viewModel.isTimelineVisible)
                            } else {
                                bandStateMachine.tapFAB(cat)
                            }
                        },
                        onSwipeUp: { cat in
                            if cat == .timeline {
                                bandStateMachine.openTimeline(isTimelineVisible: &viewModel.isTimelineVisible)
                            } else {
                                bandStateMachine.swipeUpOnFAB(cat)
                            }
                        },
                        onSwipeDownAny: { bandStateMachine.hideChrome() },
                        // #4136 — l'icône de description entre par ce slot :
                        // son texte appartient au meuble, pas au SDK.
                        leadingAccessory: toolRowLeadingAccessory?.makeView()
                    )
                    Spacer()
                }
                .padding(.bottom, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                // FABs posés SUR le canvas : leur lisibilité suit la
                // luminance du FOND de la slide, pas le thème de l'app
                // (capture user 2026-07-11 — indigo sombre sur bleu nuit).
                .environment(\.colorScheme, viewModel.canvasChromeScheme)
                // D4 — masquer le chrome n'était atteignable QUE par
                // `onSwipeDownAny`, un swipe physique sur la rangée de FABs :
                // VoiceOver intercepte les swipes pour sa propre navigation,
                // donc ce geste n'existait pour personne naviguant au rotor.
                // `fabRestoreHandle` (juste en dessous) a déjà son pendant
                // « Afficher les outils » — celui-ci est le SEUL côté resté
                // gestuel. Même canal que le swipe (`bandStateMachine
                // .hideChrome()`), exposé en action nommée sur le conteneur
                // du chrome plutôt que redécouvert au hasard d'un swipe.
                .accessibilityAction(named: Text(String(
                    localized: "story.composer.hideTools",
                    defaultValue: "Masquer les outils",
                    bundle: .module
                ))) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                        bandStateMachine.hideChrome()
                    }
                }
            }

            // C3 — état « chrome caché » (barre d'outils masquée par
            // swipe-down, band fermé) : l'écran était NU, sans aucune
            // affordance de récupération — seul un tap « au hasard » sur le
            // canvas ramenait les outils. Une poignée fantôme discrète (même
            // grammaire que le grabber du band replié) marque le point de
            // retour : tap ou swipe-up = réafficher les outils. Le tap sur le
            // fond du canvas reste actif en parallèle. CENTRÉE, alignée sur la
            // barre horizontale (2026-07-10).
            if chrome.isChromeHidden && chrome.isBandHidden {
                HStack {
                    Spacer()
                    fabRestoreHandle
                    Spacer()
                }
                .padding(.bottom, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Band — with swipe-down to dismiss
            if !chrome.isBandHidden {
                ComposerBottomBand(
                    state: chrome.effectiveBandState,
                    viewModel: viewModel,
                    accessibilityStore: accessibilityStore,
                    selectedFilter: $selectedFilter,
                    fgMediaItem: $fgMediaItem,
                    showAudioDocumentPicker: $showAudioDocumentPicker,
                    showVoiceRecorderSheet: $showVoiceRecorderSheet,
                    showSoundLibrary: $showSoundLibrary,
                    // La machine gère `.timeline` de façon générique depuis le
                    // refactor 2026-07-14 (`BandStateMachineTests.
                    // tapTileTimelineSwapsOpenPanel`) — le spécial-cas qui
                    // sautait `tapTile`/`selectTool` pour `.timeline` datait
                    // de l'ère « timeline en sheet » et empêchait le switch-chip
                    // Timeline de fonctionner depuis un AUTRE panneau déjà
                    // ouvert (bug reproduit simulateur : le chip restait sans
                    // effet, aucun panneau ne changeait). Passe désormais par
                    // `openTimeline` (S4, intention UNIQUE d'ouverture partagée
                    // avec les 5 autres sites) pour `.timeline` — comportement
                    // strictement identique (`tapTile`/`selectTool` inchangés),
                    // seule la mutation du flag ViewModel est centralisée.
                    onTapTile: { tool in
                        if tool == .timeline {
                            bandStateMachine.openTimeline(isTimelineVisible: &viewModel.isTimelineVisible)
                        } else {
                            viewModel.isTimelineVisible = false
                            bandStateMachine.tapTile(tool)
                        }
                        viewModel.selectTool(tool)
                    },
                    // Les quatre chemins de sortie passent par le MÊME
                    // applicateur : « Retour », swipe-down, grabber sous le
                    // minimum et tap sur le fond du canvas ne peuvent plus
                    // diverger. Chacun fermait auparavant un sous-ensemble
                    // différent des overrides (timeline, dessin, sélection), si
                    // bien que le chevron du panneau DESSIN était un no-op
                    // visuel — l'état effectif re-forçait aussitôt le panneau.
                    onBackFromToolPanel: onDismissActivePanel,
                    onCloseFormatPanel: onDismissActivePanel,
                    onEditMedia: { mediaId in
                        // Édition d'un média depuis la liste d'outils → éditeur
                        // d'image plein écran (plus de panneau intermédiaire).
                        viewModel.selectedElementId = mediaId
                        onOpenMediaCrop(mediaId)
                    },
                    onEditText: { textId in
                        // Action « éditer » depuis la liste des textes :
                        // ouvre l'overlay d'édition de texte flottant — même
                        // chemin que le tap sur un texte du canvas.
                        viewModel.enterTextEditingMode(textId: textId)
                    },
                    onDeleteText: { textId in
                        // Suppression d'un texte depuis la liste. Si le panel
                        // de format est ouvert sur ce même texte, on referme
                        // d'abord — sinon ComposerBottomBand garde un instant
                        // une vue vide (binding nil) avant que le fallback
                        // `Color.clear.onAppear` ne ferme le panel, et ça
                        // produit un flicker visible.
                        if case .formatPanel(.text, let openId) = bandStateMachine.state,
                           openId == textId {
                            bandStateMachine.closeFormatPanel()
                        }
                        if viewModel.selectedElementId == textId {
                            viewModel.selectedElementId = nil
                        }
                        viewModel.deleteElement(id: textId)
                    },
                    onShowInTimeline: {
                        // 6e chemin d'ouverture (challenge S4, attaque
                        // bloquante confirmée) : ce callback est câblé aux
                        // boutons « Timeline » des lignes média/texte
                        // (`ComposerToolPanelHost.swift`), atteignables
                        // uniquement quand un panneau (média/texte) est DÉJÀ
                        // ouvert — `effectiveBandState` ne force
                        // `.toolPanel(.timeline)` que depuis `.hidden`, donc
                        // flipper le flag seul ne changeait RIEN de visible.
                        // `openTimeline` swappe le panneau comme n'importe
                        // quel autre outil.
                        bandStateMachine.openTimeline(isTimelineVisible: &viewModel.isTimelineVisible)
                    },
                    onOpenStickerPicker: onOpenStickerPicker,
                    onOpenLocationPicker: onOpenLocationPicker,
                    onOpenMentionPicker: onOpenMentionPicker,
                    // C7-UI — dernier maillon INTERNE à cette couche : le
                    // texte alternatif et l'opt-in son remontent jusqu'ici,
                    // d'où le parent (qui tient le publish) les récupère, soit
                    // par ces rappels, soit en lisant le store qu'il injecte.
                    onMediaAltCommitted: onMediaAltCommitted,
                    onAllowSoundExtractionChanged: onAllowSoundExtractionChanged,
                    resizableHeight: isBandResizable ? $resizableBandHeight : nil,
                    minHeight: bandMinHeight,
                    maxHeight: bandMaxHeight,
                    // C-DIR2 (b), directive user 2026-07-04 : tirer le grabber
                    // sous le min ne replie PLUS le band en poignée — il FERME
                    // le panneau et rend les FABs.
                    onResizeDismiss: onDismissActivePanel
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
                // En mode dessin le grabber pilote le RESIZE — on désarme le
                // swipe-down/latéral du band entier pour ne pas le concurrencer.
                .gesture(
                    isBandResizable ? nil :
                    DragGesture(minimumDistance: 30)
                        .onEnded { value in
                            // Swipe down: dismiss band → show FABs
                            if value.translation.height > 40,
                               abs(value.translation.height) > abs(value.translation.width) {
                                onDismissActivePanel()
                            }
                        }
                )
                // Hauteur RÉELLE rendue de la band (content-driven) → réservée par
                // le parent pour scaler le canvas exactement au-dessus.
                .background(
                    GeometryReader { p in
                        Color.clear
                            .onAppear {
                                onBandHeightChange?(p.size.height)
                                onBandTopYChange?(p.frame(in: .global).minY)
                            }
                            .adaptiveOnChange(of: p.size.height) { _, h in
                                onBandHeightChange?(h)
                            }
                            // Le HAUT réel de la band (coord globales) — source de
                            // vérité pour la réserve du canvas (immunise frame/
                            // overflow/stale). Suivre minY directement.
                            .adaptiveOnChange(of: p.frame(in: .global).minY) { _, y in
                                onBandTopYChange?(y)
                            }
                    }
                )
            }
        }
        // PAS d'`.ignoresSafeArea(edges: .bottom)` ici : il étendait le LAYOUT
        // sous l'indicateur d'accueil, si bien que la dernière rangée du
        // panneau d'outil et la barre de FABs finissaient à 16 pt du bord
        // PHYSIQUE — donc à cheval sur la zone du geste système (constat user
        // 2026-07-30 « des contrôleurs hors du viewport »). Le verre du band
        // continue pourtant de saigner jusqu'en bas : c'est
        // `ComposerBottomBand.bandBackground` qui porte son propre
        // `.ignoresSafeArea(edges: .bottom)`, sur le FOND seul. Même règle que
        // `emptyStateLargePicker`, qui réservait déjà `safeAreaBottomInset`.
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: bandStateMachine.state)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: chrome.isChromeHidden)
        // Band repliée (FABs seuls / dessin immersif) → réserve 0 : le canvas
        // redevient plein écran, les FABs flottent par-dessus.
        .adaptiveOnChange(of: chrome.isBandHidden) { _, hidden in
            if hidden {
                onBandHeightChange?(0)
                // Band repliée → aucun bord haut à réserver (canvas plein écran).
                onBandTopYChange?(.greatestFiniteMagnitude)
            }
        }
        .adaptiveOnChange(of: viewModel.currentSlideIndex) { _, _ in
            // Slide switch invalidates any open formatPanel (id from previous
            // slide). `reset()` restaure aussi le chrome — un changement de
            // slide efface tout, y compris un masquage volontaire.
            bandStateMachine.reset()
        }
    }

    // MARK: - Poignée de récupération du chrome (C3)

    private var fabRestoreHandle: some View {
        Capsule()
            .fill(Color.white.opacity(0.28))
            .frame(width: 34, height: 5)
            .padding(.horizontal, 26)   // zone tappable large, centrée sur la barre
            // 5 + 16 + 16 = 37 pt de haut : SOUS le minimum HIG, alors que c'est
            // l'UNIQUE recours quand le chrome est masqué. Le débord de contact
            // le porte à 44 sans bouger le rendu ni la hauteur de layout.
            .padding(.vertical, 16)
            .composerHitTarget()
            .onTapGesture {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    bandStateMachine.showChrome()
                }
            }
            .gesture(
                DragGesture(minimumDistance: 15)
                    .onEnded { value in
                        if value.translation.height < -20 {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                bandStateMachine.showChrome()
                            }
                        }
                    }
            )
            .accessibilityLabel(String(
                localized: "story.composer.showTools",
                defaultValue: "Afficher les outils",
                bundle: .module
            ))
            .accessibilityAddTraits(.isButton)
    }

    // MARK: - Badges

    private var mediaBadge: Int {
        viewModel.currentEffects.mediaObjects?.count ?? 0
    }

    private var sonBadge: Int {
        viewModel.currentEffects.audioPlayerObjects?.count ?? 0
    }

    private var textBadge: Int {
        viewModel.currentEffects.textObjects.count
    }

    private var drawingBadge: Int {
        viewModel.drawingData != nil ? 1 : 0
    }

    private var textureBadge: Int {
        // Signale qu'un fond média custom est appliqué (l'outil Fond a remplacé
        // l'ancien FAB Effets). Une simple couleur unie ne déclenche pas de badge.
        viewModel.hasBackgroundImage ? 1 : 0
    }

    private var timelineBadge: Int {
        viewModel.timelineHasCustomizations ? 1 : 0
    }
}
