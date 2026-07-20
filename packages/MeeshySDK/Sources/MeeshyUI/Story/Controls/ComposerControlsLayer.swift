import SwiftUI
import UIKit
import PhotosUI
import MeeshySDK

public struct ComposerControlsLayer: View {

    @ObservedObject var viewModel: StoryComposerViewModel

    @Binding var bandStateMachine: BandStateMachine
    @Binding var areFabsVisible: Bool

    @Binding var selectedFilter: StoryFilter?
    @Binding var fgMediaItem: PhotosPickerItem?
    @Binding var showAudioDocumentPicker: Bool
    @Binding var showVoiceRecorderSheet: Bool

    /// Hauteur redimensionnable du panneau DESSIN (drag du grabber). En mode dessin
    /// (Option A) le canvas reste PLEIN — ce drawer flotte par-dessus son bas.
    @Binding var resizableBandHeight: CGFloat
    let bandMinHeight: CGFloat
    let bandMaxHeight: CGFloat

    /// Ouvre l'éditeur d'image plein écran pour un média (recadrage/filtres/
    /// ajustements). Seul point d'entrée d'édition média — il n'y a plus de
    /// panneau de contrôles média redondant dans le composer.
    let onOpenMediaCrop: (String) -> Void

    /// C8 — ouvre le picker de stickers (sheet présentée par StoryComposerView).
    var onOpenStickerPicker: (() -> Void)? = nil

    /// Reporte la hauteur RÉELLE rendue de `ComposerBottomBand` (content-driven) au
    /// parent, qui la réserve pour scaler le canvas exactement au-dessus. `0` quand
    /// la band est repliée (FABs seuls / dessin immersif) — le canvas reste plein.
    var onBandHeightChange: ((CGFloat) -> Void)? = nil

    public init(
        viewModel: StoryComposerViewModel,
        bandStateMachine: Binding<BandStateMachine>,
        areFabsVisible: Binding<Bool>,
        selectedFilter: Binding<StoryFilter?>,
        fgMediaItem: Binding<PhotosPickerItem?>,
        showAudioDocumentPicker: Binding<Bool>,
        showVoiceRecorderSheet: Binding<Bool>,
        resizableBandHeight: Binding<CGFloat>,
        bandMinHeight: CGFloat,
        bandMaxHeight: CGFloat,
        onBandHeightChange: ((CGFloat) -> Void)? = nil,
        onOpenMediaCrop: @escaping (String) -> Void,
        onOpenStickerPicker: (() -> Void)? = nil
    ) {
        self.viewModel = viewModel
        self._bandStateMachine = bandStateMachine
        self._areFabsVisible = areFabsVisible
        self._selectedFilter = selectedFilter
        self._fgMediaItem = fgMediaItem
        self._showAudioDocumentPicker = showAudioDocumentPicker
        self._showVoiceRecorderSheet = showVoiceRecorderSheet
        self._resizableBandHeight = resizableBandHeight
        self.bandMinHeight = bandMinHeight
        self.bandMaxHeight = bandMaxHeight
        self.onBandHeightChange = onBandHeightChange
        self.onOpenMediaCrop = onOpenMediaCrop
        self.onOpenStickerPicker = onOpenStickerPicker
    }

    /// Le grabber redimensionne ET replie le band pour TOUS les panneaux d'outil
    /// (plus seulement DESSIN). L'utilisateur veut la poignée rétractable jusqu'à
    /// se cacher entièrement sur chaque outil, comme le dessin (2026-06-02).
    private var isBandResizable: Bool { effectiveBandState.allowsCollapsibleDrawer }

    /// État effectif du band — dessin en DEUX temps (user 2026-07-11 v2) et
    /// timeline embarquée (user 2026-07-14) : voir `resolveEffectiveBandState`
    /// pour la logique pure et testable.
    private var effectiveBandState: BandState {
        Self.resolveEffectiveBandState(
            machineState: bandStateMachine.state,
            drawingActive: viewModel.drawingEditingMode.isActive,
            drawingImmersive: viewModel.isDrawingImmersive,
            timelineVisible: viewModel.isTimelineVisible
        )
    }

    /// Résolution pure de l'état effectif du band à partir de la machine brute
    /// et des overrides ViewModel (dessin, timeline). Extrait en `static` pour
    /// être testable sans monter la View — même pattern que
    /// `StoryCanvasUIView.resolveManipulationLayer`.
    ///
    /// Mode dessin LISTE (band forcé sur `drawingPanel`) tant que non
    /// immersif ; `isDrawingImmersive` masque le band entièrement, priorité
    /// absolue. Timeline (2026-07-14) : force `.toolPanel(.timeline)`
    /// uniquement quand la machine est `.hidden` — si un autre outil est déjà
    /// ouvert (l'utilisateur a tapé une autre tuile), on ne réécrase pas ce
    /// choix (cf. `onTapTile`, qui remet `isTimelineVisible = false` dans ce cas).
    static func resolveEffectiveBandState(
        machineState: BandState,
        drawingActive: Bool,
        drawingImmersive: Bool,
        timelineVisible: Bool
    ) -> BandState {
        if drawingActive, !drawingImmersive, machineState == .hidden {
            return .toolPanel(.drawing)
        }
        if drawingImmersive { return .hidden }
        if timelineVisible, machineState == .hidden {
            return .toolPanel(.timeline)
        }
        return machineState
    }

    /// C-DIR2 (d) : FABs et header partagent la MÊME règle (ComposerChromePolicy)
    /// — chrome plein uniquement sur canvas plein écran au repos. Le swipe-down
    /// du band les restaure ; l'édition (texte/dessin/panneau) et le zoom les
    /// masquent.
    private var shouldShowFABs: Bool {
        ComposerChromePolicy.fullChromeVisible(
            fabsVisible: areFabsVisible,
            bandHidden: effectiveBandState == .hidden,
            isTextEditing: viewModel.textEditingMode != .inactive,
            isDrawingActive: viewModel.drawingEditingMode.isActive,
            isViewportZoomed: viewModel.isCanvasZoomed
        )
    }

    public var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Barre d'outils horizontale — visible only when the band is hidden
            // (directive 2026-07-10 : outils en bas, centrés, à portée de pouce).
            if shouldShowFABs {
                HStack {
                    Spacer()
                    ComposerFABColumn(
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
                                // La timeline vit en SHEET — le band n'a aucun
                                // panneau pour elle (C5 : le FAB ouvrait un band
                                // vide de hauteur 0, titré sans contenu).
                                viewModel.isTimelineVisible = true
                            } else {
                                bandStateMachine.tapFAB(cat)
                            }
                        },
                        onSwipeUp: { cat in
                            if cat == .timeline {
                                viewModel.isTimelineVisible = true
                            } else {
                                bandStateMachine.swipeUpOnFAB(cat)
                            }
                        },
                        onSwipeDownAny: { areFabsVisible = false }
                    )
                    Spacer()
                }
                .padding(.bottom, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                // FABs posés SUR le canvas : leur lisibilité suit la
                // luminance du FOND de la slide, pas le thème de l'app
                // (capture user 2026-07-11 — indigo sombre sur bleu nuit).
                .environment(\.colorScheme, viewModel.canvasChromeScheme)
            }

            // C3 — état « chrome caché » (barre d'outils masquée par
            // swipe-down, band fermé) : l'écran était NU, sans aucune
            // affordance de récupération — seul un tap « au hasard » sur le
            // canvas ramenait les outils. Une poignée fantôme discrète (même
            // grammaire que le grabber du band replié) marque le point de
            // retour : tap ou swipe-up = réafficher les outils. Le tap sur le
            // fond du canvas reste actif en parallèle. CENTRÉE, alignée sur la
            // barre horizontale (2026-07-10).
            if !areFabsVisible && effectiveBandState == .hidden {
                HStack {
                    Spacer()
                    fabRestoreHandle
                    Spacer()
                }
                .padding(.bottom, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Band — with swipe-down to dismiss
            if effectiveBandState != .hidden {
                ComposerBottomBand(
                    state: effectiveBandState,
                    viewModel: viewModel,
                    selectedFilter: $selectedFilter,
                    fgMediaItem: $fgMediaItem,
                    showAudioDocumentPicker: $showAudioDocumentPicker,
                    showVoiceRecorderSheet: $showVoiceRecorderSheet,
                    // La machine gère `.timeline` de façon générique depuis le
                    // refactor 2026-07-14 (`BandStateMachineTests.
                    // tapTileTimelineSwapsOpenPanel`) — le spécial-cas qui
                    // sautait `tapTile`/`selectTool` pour `.timeline` datait
                    // de l'ère « timeline en sheet » et empêchait le switch-chip
                    // Timeline de fonctionner depuis un AUTRE panneau déjà
                    // ouvert (bug reproduit simulateur : le chip restait sans
                    // effet, aucun panneau ne changeait). `isTimelineVisible`
                    // reste nécessaire pour `resolveEffectiveBandState` côté
                    // FAB/bouton top-bar (entrée depuis `.hidden`).
                    onTapTile: { tool in
                        viewModel.isTimelineVisible = (tool == .timeline)
                        bandStateMachine.tapTile(tool)
                        viewModel.selectTool(tool)
                    },
                    onBackFromToolPanel: {
                        // Toujours les DEUX (même schéma que `onResizeDismiss`
                        // ci-dessous) : `onTapTile` peut désormais avoir fait
                        // transiter `bandStateMachine` en `.toolPanel(.timeline)`
                        // (switch-chip) OU l'avoir laissée `.hidden` (FAB/bouton
                        // top-bar, override `isTimelineVisible` seul) — le
                        // conditionnel précédent ne fermait que l'un des deux
                        // chemins selon l'entrée. `backFromToolPanel()` est un
                        // no-op sûr quand l'état n'est pas `.toolPanel`.
                        viewModel.isTimelineVisible = false
                        bandStateMachine.backFromToolPanel()
                    },
                    onCloseFormatPanel: {
                        bandStateMachine.closeFormatPanel()
                        viewModel.selectedElementId = nil
                    },
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
                        viewModel.isTimelineVisible = true
                    },
                    onOpenStickerPicker: onOpenStickerPicker,
                    resizableHeight: isBandResizable ? $resizableBandHeight : nil,
                    minHeight: bandMinHeight,
                    maxHeight: bandMaxHeight,
                    onResizeDismiss: {
                        // C-DIR2 (b), directive user 2026-07-04 : tirer le
                        // grabber sous le min ne replie PLUS le band en poignée
                        // — il FERME le panneau et rend les FABs. En dessin,
                        // fermer le band = quitter le mode ; en timeline,
                        // fermer le band = quitter la timeline (sinon
                        // effectiveBandState le re-forcerait aussitôt dans les
                        // deux cas).
                        if viewModel.drawingEditingMode.isActive {
                            viewModel.activeTool = nil
                        }
                        if viewModel.isTimelineVisible {
                            viewModel.isTimelineVisible = false
                        }
                        bandStateMachine.swipeDownOnBand()
                        areFabsVisible = true
                    }
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
                                bandStateMachine.swipeDownOnBand()
                                // If band is now hidden, ensure FABs come back
                                if bandStateMachine.state == .hidden {
                                    areFabsVisible = true
                                }
                            }
                        }
                )
                // Hauteur RÉELLE rendue de la band (content-driven) → réservée par
                // le parent pour scaler le canvas exactement au-dessus.
                .background(
                    GeometryReader { p in
                        Color.clear
                            .onAppear { onBandHeightChange?(p.size.height) }
                            .adaptiveOnChange(of: p.size.height) { _, h in
                                onBandHeightChange?(h)
                            }
                    }
                )
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: bandStateMachine.state)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: areFabsVisible)
        // Band repliée (FABs seuls / dessin immersif) → réserve 0 : le canvas
        // redevient plein écran, les FABs flottent par-dessus.
        .adaptiveOnChange(of: effectiveBandState == .hidden) { _, hidden in
            if hidden { onBandHeightChange?(0) }
        }
        .adaptiveOnChange(of: viewModel.currentSlideIndex) { _, _ in
            // Slide switch invalidates any open formatPanel (id from previous slide).
            bandStateMachine.reset()
            areFabsVisible = true
        }
    }

    // MARK: - Poignée de récupération du chrome (C3)

    private var fabRestoreHandle: some View {
        Capsule()
            .fill(Color.white.opacity(0.28))
            .frame(width: 34, height: 5)
            .padding(.horizontal, 26)   // zone tappable large, centrée sur la barre
            .padding(.vertical, 16)     // zone tappable ≥ 44 pt
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    areFabsVisible = true
                }
            }
            .gesture(
                DragGesture(minimumDistance: 15)
                    .onEnded { value in
                        if value.translation.height < -20 {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                areFabsVisible = true
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
