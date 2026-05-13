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

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle for swipe-down affordance
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.white.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.top, 8)
                .padding(.bottom, 6)

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
                    onBack: onBackFromToolPanel
                )
            case .formatPanel(.text, let elementId):
                // Text format band is presented via UITextView.inputAccessoryView,
                // so this case shows a stub here. The actual accessory bar is
                // built by ComposerTextEditingView in Phase 4.
                Color.clear.frame(height: 110)
                    .onAppear {
                        // Phase 4: trigger first-responder on the text element
                        _ = elementId
                    }
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
    }
}
