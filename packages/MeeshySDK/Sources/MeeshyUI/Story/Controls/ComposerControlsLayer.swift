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
        onOpenMediaCrop: @escaping (String) -> Void
    ) {
        self.viewModel = viewModel
        self._bandStateMachine = bandStateMachine
        self._areFabsVisible = areFabsVisible
        self._selectedFilter = selectedFilter
        self._fgMediaItem = fgMediaItem
        self._showAudioDocumentPicker = showAudioDocumentPicker
        self._showVoiceRecorderSheet = showVoiceRecorderSheet
        self.onOpenMediaCrop = onOpenMediaCrop
    }

    /// FABs are visible when the band is hidden; when a band panel is open,
    /// FABs hide to free space. Swiping down on the band dismisses it and
    /// restores FABs.
    private var shouldShowFABs: Bool {
        areFabsVisible && bandStateMachine.state == .hidden
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
                        filtersBadge: filtersBadge,
                        timelineBadge: timelineBadge,
                        activeCategory: nil, // band is hidden so no active category
                        onTap: { cat in bandStateMachine.tapFAB(cat) },
                        onSwipeUp: { cat in bandStateMachine.swipeUpOnFAB(cat) },
                        onSwipeDownAny: { areFabsVisible = false }
                    )
                    Spacer()
                }
                .padding(.bottom, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Band — with swipe-down to dismiss
            if bandStateMachine.state != .hidden {
                ComposerBottomBand(
                    state: bandStateMachine.state,
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
                    }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .gesture(
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

    private var filtersBadge: Int {
        viewModel.selectedFilter != nil ? 1 : 0
    }

    private var timelineBadge: Int {
        viewModel.timelineHasCustomizations ? 1 : 0
    }
}
