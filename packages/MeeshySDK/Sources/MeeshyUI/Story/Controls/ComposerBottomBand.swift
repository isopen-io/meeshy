import SwiftUI
import PhotosUI
import PencilKit
import MeeshySDK

struct ComposerBottomBand: View {
    let state: BandState
    @Bindable var viewModel: StoryComposerViewModel

    @Binding var drawingCanvas: PKCanvasView
    @Binding var drawingTool: DrawingTool
    @Binding var selectedFilter: StoryFilter?
    @Binding var fgMediaItem: PhotosPickerItem?
    @Binding var showAudioDocumentPicker: Bool
    @Binding var showVoiceRecorderSheet: Bool

    let onTapTile: (StoryToolMode) -> Void
    let onBackFromToolPanel: () -> Void
    let onCloseFormatPanel: () -> Void
    let onOpenMediaCrop: (String) -> Void
    let onOpenFilterForElement: (String) -> Void
    var onEditMedia: ((String) -> Void)? = nil
    var onShowInTimeline: (() -> Void)? = nil

    /// Stable identity key for the current panel content, so SwiftUI
    /// treats each state as a different view and animates the swap.
    private var stateKey: String {
        switch state {
        case .hidden: return "hidden"
        case .tiles(let c): return "tiles-\(c)"
        case .toolPanel(let t): return "tool-\(t)"
        case .formatPanel(let k, let id): return "format-\(k)-\(id)"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle for swipe-down affordance
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.white.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.top, 8)
                .padding(.bottom, 6)

            // Panel content — keyed by state so the old panel slides
            // down and the new one slides up from the bottom.
            Group {
                switch state {
                case .hidden:
                    EmptyView()
                case .tiles(let category):
                    ComposerTilesGrid(
                        category: category,
                        mediaCount: viewModel.currentEffects.mediaObjects?.count ?? 0,
                        drawingCount: viewModel.drawingData != nil ? 1 : 0,
                        textCount: viewModel.currentEffects.textObjects.count,
                        audioCount: viewModel.currentEffects.audioPlayerObjects?.count ?? 0,
                        filterCount: viewModel.selectedFilter != nil ? 1 : 0,
                        timelineCount: viewModel.timelineHasCustomizations ? 1 : 0,
                        onTapTile: onTapTile
                    )
                case .toolPanel(let tool):
                    ComposerToolPanelHost(
                        tool: tool,
                        viewModel: viewModel,
                        drawingCanvas: $drawingCanvas,
                        drawingTool: $drawingTool,
                        selectedFilter: $selectedFilter,
                        fgMediaItem: $fgMediaItem,
                        showAudioDocumentPicker: $showAudioDocumentPicker,
                        showVoiceRecorderSheet: $showVoiceRecorderSheet,
                        onBack: onBackFromToolPanel,
                        onEditMedia: onEditMedia,
                        onShowInTimeline: onShowInTimeline
                    )
                case .formatPanel(.text, let elementId):
                    Color.clear.frame(height: 110)
                        .onAppear { _ = elementId }
                case .formatPanel(.media, let elementId):
                    ComposerMediaFormatBand(
                        elementId: elementId,
                        viewModel: viewModel,
                        onDone: onCloseFormatPanel,
                        onOpenCropEditor: onOpenMediaCrop,
                        onOpenFilterPicker: onOpenFilterForElement
                    )
                }
            }
            .id(stateKey)
            .transition(.asymmetric(
                insertion: .move(edge: .bottom).combined(with: .opacity),
                removal: .move(edge: .bottom).combined(with: .opacity)
            ))
        }
        .padding(.bottom, 16) // Breathing room above home indicator
        .frame(maxWidth: .infinity)
        .background(
            UnevenRoundedRectangle(
                topLeadingRadius: 24,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 24,
                style: .continuous
            )
            .fill(.ultraThinMaterial)
            .ignoresSafeArea(edges: .bottom)
        )
        .shadow(color: .black.opacity(0.15), radius: 12, y: -4)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: stateKey)
    }
}
