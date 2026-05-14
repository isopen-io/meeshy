import SwiftUI
import UIKit
import PhotosUI
import PencilKit
import MeeshySDK

public struct ComposerControlsLayer: View {

    @Bindable var viewModel: StoryComposerViewModel

    @Binding var bandStateMachine: BandStateMachine
    @Binding var areFabsVisible: Bool

    @Binding var drawingCanvas: PKCanvasView
    @Binding var drawingTool: DrawingTool
    @Binding var selectedFilter: StoryFilter?
    @Binding var fgMediaItem: PhotosPickerItem?
    @Binding var showAudioDocumentPicker: Bool
    @Binding var showVoiceRecorderSheet: Bool

    /// Forwarded to the parent for handling element-scoped sheets/editors.
    let onOpenMediaCrop: (String) -> Void
    let onOpenFilterForElement: (String) -> Void



    public init(
        viewModel: StoryComposerViewModel,
        bandStateMachine: Binding<BandStateMachine>,
        areFabsVisible: Binding<Bool>,
        drawingCanvas: Binding<PKCanvasView>,
        drawingTool: Binding<DrawingTool>,
        selectedFilter: Binding<StoryFilter?>,
        fgMediaItem: Binding<PhotosPickerItem?>,
        showAudioDocumentPicker: Binding<Bool>,
        showVoiceRecorderSheet: Binding<Bool>,
        onOpenMediaCrop: @escaping (String) -> Void,
        onOpenFilterForElement: @escaping (String) -> Void
    ) {
        self.viewModel = viewModel
        self._bandStateMachine = bandStateMachine
        self._areFabsVisible = areFabsVisible
        self._drawingCanvas = drawingCanvas
        self._drawingTool = drawingTool
        self._selectedFilter = selectedFilter
        self._fgMediaItem = fgMediaItem
        self._showAudioDocumentPicker = showAudioDocumentPicker
        self._showVoiceRecorderSheet = showVoiceRecorderSheet
        self.onOpenMediaCrop = onOpenMediaCrop
        self.onOpenFilterForElement = onOpenFilterForElement
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
                        contenuBadge: contenuBadge,
                        effetsBadge: effetsBadge,
                        activeCategory: nil, // band is hidden so no active category
                        onTapContenu: { bandStateMachine.tapFAB(.contenu) },
                        onTapEffets: { bandStateMachine.tapFAB(.effets) },
                        onSwipeUpContenu: { bandStateMachine.swipeUpOnFAB(.contenu) },
                        onSwipeUpEffets: { bandStateMachine.swipeUpOnFAB(.effets) },
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
                    drawingCanvas: $drawingCanvas,
                    drawingTool: $drawingTool,
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
                    onOpenMediaCrop: onOpenMediaCrop,
                    onOpenFilterForElement: { id in
                        bandStateMachine.tapTile(.filters)
                        onOpenFilterForElement(id)
                    },
                    onEditMedia: { mediaId in
                        bandStateMachine.openFormatPanel(.media, id: mediaId)
                        viewModel.selectedElementId = mediaId
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
        .onChange(of: viewModel.currentSlideIndex) { _, _ in
            // Slide switch invalidates any open formatPanel (id from previous slide).
            bandStateMachine.reset()
            areFabsVisible = true
        }
    }

    // MARK: - Badges

    private var contenuBadge: Int {
        let media = viewModel.currentEffects.mediaObjects?.count ?? 0
        let audio = viewModel.currentEffects.audioPlayerObjects?.count ?? 0
        let text = viewModel.currentEffects.textObjects.count
        let drawing = viewModel.drawingData != nil ? 1 : 0
        return media + audio + text + drawing
    }

    private var effetsBadge: Int {
        let filter = viewModel.selectedFilter != nil ? 1 : 0
        let timeline = viewModel.timelineHasCustomizations ? 1 : 0
        return filter + timeline
    }
}
