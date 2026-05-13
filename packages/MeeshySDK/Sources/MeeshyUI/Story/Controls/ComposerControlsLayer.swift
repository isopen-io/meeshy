import SwiftUI
import UIKit
import PhotosUI
import PencilKit
import MeeshySDK

public struct ComposerControlsLayer: View {

    @Bindable var viewModel: StoryComposerViewModel

    @State private var bandStateMachine: BandStateMachine = BandStateMachine()
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

    public var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Band (under FABs)
            if bandStateMachine.state != .hidden {
                VStack(spacing: 0) {
                    Spacer()
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
                        }
                    )
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                .ignoresSafeArea(edges: .bottom)
            }

            // FABs (over band)
            if areFabsVisible {
                ComposerFABColumn(
                    contenuBadge: contenuBadge,
                    effetsBadge: effetsBadge,
                    activeCategory: bandStateMachine.state.activeCategory,
                    onTapContenu: { bandStateMachine.tapFAB(.contenu) },
                    onTapEffets: { bandStateMachine.tapFAB(.effets) },
                    onSwipeUpContenu: { bandStateMachine.swipeUpOnFAB(.contenu) },
                    onSwipeUpEffets: { bandStateMachine.swipeUpOnFAB(.effets) },
                    onSwipeDownAny: { areFabsVisible = false }
                )
                .padding(.bottom, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
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

    // MARK: - Public hooks (consumed by parent for double-tap routing)

    public mutating func openFormatPanel(_ kind: BandElementKind, id: String) {
        bandStateMachine.openFormatPanel(kind, id: id)
    }
}
