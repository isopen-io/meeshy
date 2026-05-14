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
    var onEditMedia: ((String) -> Void)? = nil
    var onShowInTimeline: (() -> Void)? = nil

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
        case .media:    return 280
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

    // MARK: - Media Panel

    private var mediaPanel: some View {
        VStack(spacing: 10) {
            // Add buttons
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

            // List of existing media items — drag to reorder changes layer order
            if let mediaObjects = viewModel.currentEffects.mediaObjects, !mediaObjects.isEmpty {
                List {
                    ForEach(mediaObjects) { media in
                        mediaItemRow(media)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 2, leading: 0, bottom: 2, trailing: 0))
                            .listRowSeparator(.hidden)
                    }
                    .onMove { source, destination in
                        viewModel.moveMedia(from: source, to: destination)
                        HapticFeedback.light()
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .environment(\.editMode, .constant(.active))
                .frame(maxHeight: 150)
            }
        }
    }

    @ViewBuilder
    private func mediaItemRow(_ media: StoryMediaObject) -> some View {
        let isBg = viewModel.isBackground(id: media.id)
        let isImage = media.kind == .image
        HStack(spacing: 8) {
            // Thumbnail
            Group {
                if let img = viewModel.loadedImages[media.id] {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                } else {
                    ZStack {
                        Color.white.opacity(0.1)
                        Image(systemName: isImage ? "photo" : "video")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.5))
                    }
                }
            }
            .frame(width: 32, height: 32)
            .clipShape(RoundedRectangle(cornerRadius: 5))

            // Type + role
            VStack(alignment: .leading, spacing: 1) {
                Text(isImage ? "Image" : "Vidéo")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                Text(isBg ? "Fond" : "Premier plan")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(isBg ? MeeshyColors.indigo300 : .white.opacity(0.5))
            }

            Spacer(minLength: 4)

            // Action buttons — compact icon row
            HStack(spacing: 6) {
                // Toggle front/back
                mediaActionBtn(
                    icon: isBg ? "square.3.layers.3d.top.filled" : "square.3.layers.3d.bottom.filled",
                    color: isBg ? MeeshyColors.indigo300 : .white.opacity(0.6),
                    tip: isBg ? "Premier plan" : "Fond"
                ) {
                    viewModel.toggleBackground(id: media.id)
                }

                // Edit
                mediaActionBtn(icon: "pencil", color: .white.opacity(0.6), tip: "Éditer") {
                    onEditMedia?(media.id)
                }

                // Timeline
                mediaActionBtn(icon: "timeline.selection", color: .white.opacity(0.6), tip: "Timeline") {
                    viewModel.selectedElementId = media.id
                    onShowInTimeline?()
                }

                // Duplicate
                mediaActionBtn(icon: "doc.on.doc", color: .white.opacity(0.6), tip: "Dupliquer") {
                    viewModel.duplicateElement(id: media.id)
                }

                // Delete
                mediaActionBtn(icon: "trash", color: .red.opacity(0.7), tip: "Supprimer") {
                    viewModel.deleteElement(id: media.id)
                    HapticFeedback.medium()
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(isBg ? MeeshyColors.indigo400.opacity(0.15) : Color.white.opacity(0.05))
        )
    }

    private func mediaActionBtn(
        icon: String, color: Color, tip: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(color)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tip)
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
