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

    /// Drawer dessin replié « totalement » (poignée seule). Tirer le grabber sous le
    /// min le replie (sans quitter le dessin) ; le tirer vers le haut le redéplie.
    @Binding var bandDrawerCollapsed: Bool

    /// Ouvre l'éditeur d'image plein écran pour un média (recadrage/filtres/
    /// ajustements). Seul point d'entrée d'édition média — il n'y a plus de
    /// panneau de contrôles média redondant dans le composer.
    let onOpenMediaCrop: (String) -> Void

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
        bandDrawerCollapsed: Binding<Bool>,
        onOpenMediaCrop: @escaping (String) -> Void
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
        self._bandDrawerCollapsed = bandDrawerCollapsed
        self.onOpenMediaCrop = onOpenMediaCrop
    }

    /// Le grabber redimensionne ET replie le band pour TOUS les panneaux d'outil
    /// (plus seulement DESSIN). L'utilisateur veut la poignée rétractable jusqu'à
    /// se cacher entièrement sur chaque outil, comme le dessin (2026-06-02).
    private var isBandResizable: Bool { effectiveBandState.allowsCollapsibleDrawer }

    /// État effectif du band : le dessin utilise le band PARTAGÉ comme tous les
    /// outils (`drawingPanel` = liste éditable des traits). On force donc l'affichage
    /// du panneau dessin dès que l'outil dessin est actif, même si la machine d'état
    /// est restée `.hidden` (chemin d'entrée FAB, état restauré…). Sans ça le band
    /// partagé ne s'affichait pas pour le dessin (bug user 2026-06-01 « dessin devrait
    /// afficher le ComposerBottomBand aussi »).
    private var effectiveBandState: BandState {
        // On se cale sur `drawingEditingMode.isActive` (et non `activeTool`) car
        // c'est lui qui pilote l'affichage des contrôleurs flottants : tant que les
        // bulles de dessin sont à l'écran, le band partagé doit l'être aussi —
        // les deux états peuvent diverger selon le chemin d'entrée.
        if viewModel.drawingEditingMode.isActive, bandStateMachine.state == .hidden {
            return .toolPanel(.drawing)
        }
        return bandStateMachine.state
    }

    /// FABs are visible when the band is hidden; when a band panel is open,
    /// FABs hide to free space. Swiping down on the band dismisses it and
    /// restores FABs.
    private var shouldShowFABs: Bool {
        areFabsVisible && effectiveBandState == .hidden
    }

    public var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // FABs — visible only when the band is hidden
            if shouldShowFABs {
                HStack {
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
                    onTapTile: { tool in
                        if tool == .timeline {
                            viewModel.isTimelineVisible = true
                        } else {
                            bandStateMachine.tapTile(tool)
                            viewModel.selectTool(tool)
                        }
                    },
                    onBackFromToolPanel: { bandStateMachine.backFromToolPanel() },
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
                    resizableHeight: isBandResizable ? $resizableBandHeight : nil,
                    minHeight: bandMinHeight,
                    maxHeight: bandMaxHeight,
                    onResizeDismiss: {
                        // Grabber tiré sous le min → on REPLIE le drawer (poignée
                        // seule), pour TOUT outil : le canvas devient 100 % visible
                        // et l'outil reste actif (en dessin, le contrôleur flottant
                        // des bulles reste visible). Re-déplier via le grabber ; pour
                        // fermer l'outil → chevron retour du band (2026-06-02, étend
                        // le repli dessin à tous les outils).
                        bandDrawerCollapsed = true
                    },
                    drawingCollapsed: isBandResizable && bandDrawerCollapsed,
                    onExpandDrawer: {
                        // Grabber (replié) tiré vers le haut → on redéplie le drawer.
                        bandDrawerCollapsed = false
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
                            // Swipe left/right: switch category
                            if abs(value.translation.width) > abs(value.translation.height),
                               abs(value.translation.width) > 40 {
                                bandStateMachine.swipeHorizontalOnBand()
                            }
                        }
                )
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: bandStateMachine.state)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: areFabsVisible)
        .adaptiveOnChange(of: viewModel.currentSlideIndex) { _, _ in
            // Slide switch invalidates any open formatPanel (id from previous slide).
            bandStateMachine.reset()
            areFabsVisible = true
        }
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
