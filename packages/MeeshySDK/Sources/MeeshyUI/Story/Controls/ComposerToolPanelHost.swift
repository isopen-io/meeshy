import SwiftUI
import PhotosUI
import PencilKit
import MeeshySDK

struct ComposerToolPanelHost: View {
    let tool: StoryToolMode
    @Bindable var viewModel: StoryComposerViewModel
    @Binding var drawingCanvas: PKCanvasView
    @Binding var drawingTool: DrawingTool
    @Binding var selectedFilter: StoryFilter?
    @Binding var fgMediaItem: PhotosPickerItem?
    @Binding var showAudioDocumentPicker: Bool
    @Binding var showVoiceRecorderSheet: Bool
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button(action: { onBack() }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                    Text(toolTitle).font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(.white)
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(.ultraThinMaterial, in: Capsule())
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            // Tool-specific body — Phase 2 placeholder. Wired in Phase 4.
            placeholderPanel
                .frame(height: panelHeight - 50)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
    }

    private var toolTitle: String {
        switch tool {
        case .media:    return "Médias"
        case .drawing:  return "Dessin"
        case .text:     return "Texte"
        case .texture:  return "Fond"
        case .filters:  return "Filtres"
        case .timeline: return "Timeline"
        }
    }

    private var panelHeight: CGFloat {
        switch tool {
        case .media:    return 220
        case .drawing:  return 140
        case .text:     return 140
        case .texture:  return 160
        case .filters:  return 180
        case .timeline: return 0  // presented as sheet, not in band
        }
    }

    @ViewBuilder
    private var placeholderPanel: some View {
        switch tool {
        case .media:
            mediaPanel
        case .drawing:
            drawingPanel
        case .text:
            textPanel
        case .texture:
            texturePanel
        case .filters:
            StoryFilterGridView(viewModel: viewModel, previewImage: nil)
        case .timeline:
            EmptyView()
        }
    }

    private var mediaPanel: some View {
        HStack(spacing: 8) {
            if viewModel.canAddMedia {
                PhotosPicker(selection: $fgMediaItem, matching: .any(of: [.images, .videos])) {
                    MediaPillLabel(icon: "photo.on.rectangle.angled", text: String(localized: "story.composer.addPhotoVideo", defaultValue: "Photo/Video", bundle: .module), destructive: false)
                }
            }
            if viewModel.canAddAudio {
                Button { showAudioDocumentPicker = true } label: {
                    MediaPillLabel(icon: "waveform", text: String(localized: "story.composer.addAudioFile", defaultValue: "Audio", bundle: .module), destructive: false)
                }
                Button { showVoiceRecorderSheet = true } label: {
                    MediaPillLabel(icon: "mic.fill", text: String(localized: "story.composer.record", defaultValue: "Enregistrer", bundle: .module), destructive: false)
                }
            }
            Spacer()
        }
    }

    private var drawingPanel: some View {
        DrawingToolbarPanel(
            toolColor: $viewModel.drawingColor,
            toolWidth: $viewModel.drawingWidth,
            toolType: $drawingTool,
            onUndo: {
                drawingCanvas.undoManager?.undo()
                viewModel.drawingData = drawingCanvas.drawing.dataRepresentation()
                HapticFeedback.light()
            },
            onRedo: {
                drawingCanvas.undoManager?.redo()
                viewModel.drawingData = drawingCanvas.drawing.dataRepresentation()
                HapticFeedback.light()
            },
            onClear: {
                drawingCanvas.drawing = PKDrawing()
                viewModel.drawingData = nil
                HapticFeedback.medium()
            }
        )
    }

    @ViewBuilder
    private var textPanel: some View {
        if viewModel.canAddText {
            Button {
                viewModel.addText()
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 14, weight: .medium))
                    Text(String(localized: "story.composer.addText", defaultValue: "Ajouter du texte", bundle: .module))
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundColor(MeeshyColors.brandPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            }
        } else {
            EmptyView()
        }
    }

    private var texturePanel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(StoryBackgroundPalette.colors, id: \.self) { hex in
                    Button {
                        viewModel.backgroundColor = "#\(hex)"
                        viewModel.hasBackgroundImage = false
                        HapticFeedback.light()
                    } label: {
                        Circle().fill(Color(hex: hex))
                            .frame(width: 44, height: 44)
                            .overlay(
                                Circle().stroke(Color.white, lineWidth: viewModel.backgroundColor == "#\(hex)" ? 3 : 0)
                                    .padding(2)
                            )
                            .shadow(color: Color(hex: hex).opacity(viewModel.backgroundColor == "#\(hex)" ? 0.5 : 0), radius: 6)
                    }
                }
            }
            .padding(.horizontal, 2)
            .padding(.vertical, 14)
        }
    }
}
