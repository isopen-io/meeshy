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
    var onEditText: ((String) -> Void)? = nil
    var onDeleteText: ((String) -> Void)? = nil
    var onShowInTimeline: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme

    /// Theme-aware tint for the swipe-down drag handle (visible on both light
    /// and dark composer canvases — previously hardcoded `.white` made the
    /// handle invisible on light slides).
    private var dragHandleColor: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.55)
            : MeeshyColors.indigo950.opacity(0.35)
    }

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

    /// Binding pour un `StoryTextObject` identifié, dérivée à la volée de
    /// `viewModel.currentEffects.textObjects`. Le setter remplace l'élément
    /// dans le tableau, ce qui propage aux observateurs `@Bindable` du modèle
    /// (canvas, slideStrip, badges) et déclenche la re-sérialisation slide
    /// via le pipeline `granularCanvasSync`.
    private func textObjectBinding(for id: String) -> Binding<StoryTextObject>? {
        guard viewModel.currentEffects.textObjects.contains(where: { $0.id == id }) else { return nil }
        return Binding(
            get: {
                viewModel.currentEffects.textObjects.first(where: { $0.id == id })
                    ?? StoryTextObject(text: "")
            },
            set: { newValue in
                var effects = viewModel.currentEffects
                if let i = effects.textObjects.firstIndex(where: { $0.id == id }) {
                    effects.textObjects[i] = newValue
                    viewModel.currentEffects = effects
                }
            }
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle for swipe-down affordance.
            // - Color adapts to colorScheme so it stays visible on light AND dark slides
            // - Tap-target zone is enlarged via padding so the handle is more discoverable
            RoundedRectangle(cornerRadius: 2.5)
                .fill(dragHandleColor)
                .frame(width: 42, height: 5)
                .padding(.top, 10)
                .padding(.bottom, 6)
                .accessibilityLabel("Poignée de la barre d'outils")
                .accessibilityHint("Faites glisser vers le bas pour réduire ou fermer.")
                .accessibilityAddTraits(.isButton)

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
                        onEditText: onEditText,
                        onDeleteText: onDeleteText,
                        onShowInTimeline: onShowInTimeline
                    )
                case .formatPanel(.text, let elementId):
                    if let binding = textObjectBinding(for: elementId) {
                        StoryTextEditorView(
                            textObject: binding,
                            onDelete: {
                                HapticFeedback.medium()
                                // Fermer AVANT de supprimer : sinon le binding
                                // bascule sur nil pendant le frame courant et
                                // SwiftUI rend un Color.clear flickering avant
                                // que le fallback onAppear ne ferme le panel.
                                onCloseFormatPanel()
                                viewModel.deleteElement(id: elementId)
                            }
                        )
                    } else {
                        // Element disappeared (slide switch / delete race) — close panel.
                        Color.clear
                            .onAppear { onCloseFormatPanel() }
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
            // Bandeau: tint opaque sous le material épais. Ça empêche les fonds
            // de canvas très clairs (image avec beaucoup de blanc, slide pastel)
            // d'inverser la perception du material et de tuer le contraste du
            // texte/icônes. ultraThinMaterial laissait trop transparaître le
            // canvas en arrière-plan.
            .fill(
                (colorScheme == .dark
                    ? MeeshyColors.indigo950.opacity(0.92)
                    : Color.white.opacity(0.92))
            )
            .overlay(
                UnevenRoundedRectangle(
                    topLeadingRadius: 24,
                    bottomLeadingRadius: 0,
                    bottomTrailingRadius: 0,
                    topTrailingRadius: 24,
                    style: .continuous
                )
                .stroke(
                    (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.08),
                    lineWidth: 0.5
                )
            )
            .ignoresSafeArea(edges: .bottom)
        )
        .shadow(color: .black.opacity(0.25), radius: 14, y: -6)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: stateKey)
    }
}
