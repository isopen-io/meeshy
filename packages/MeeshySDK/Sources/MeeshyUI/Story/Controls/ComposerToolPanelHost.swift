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

    @Environment(\.colorScheme) private var colorScheme

    // Texte adaptatif. Le bandeau étant désormais opaque (tint indigo950@92% dark
    // / white@92% light), on peut viser de vrais ratios de contraste WCAG-AA :
    //   primary   ≥ 4.5:1 → couleur pleine (indigo950 / white)
    //   secondary ≈ 4.5:1 → opacity 0.78
    //   muted     ≈ 3:1   → opacity 0.55
    private var primaryText: Color { colorScheme == .dark ? .white : MeeshyColors.indigo950 }
    private var secondaryText: Color { (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.78) }
    private var mutedText: Color { (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.55) }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button(action: { onBack() }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                    Text(toolTitle).font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(primaryText)
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
        // Pas de material ici — le bandeau parent fournit déjà le tint opaque
        // sous-jacent. Une seconde couche material ici sur-saturait le contraste
        // et rendait certaines icônes ultra pâles.
    }

    private var toolTitle: String {
        switch tool {
        case .media:    return "Médias"
        case .drawing:  return "Dessin"
        case .text:     return "Texte"
        case .texture:  return "Fond"
        case .filters:  return "Effets"
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

            // Liste des médias avec drag-to-reorder via long-press natif
            // (`.draggable` + `.dropDestination`). Pas de hamburger `≡` comme
            // le faisait `List` en `editMode = .active` : l'utilisateur appuie
            // longuement sur une row pour la commencer à glisser, puis la lâche
            // sur la position cible. Plus discret + plus compatible avec le
            // reste de l'UX (long-press déjà utilisé sur le canvas).
            if let mediaObjects = viewModel.currentEffects.mediaObjects, !mediaObjects.isEmpty {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 4) {
                        ForEach(mediaObjects) { media in
                            mediaItemRow(media)
                                .draggable(media.id) {
                                    // Aperçu visuel pendant le drag — version compacte
                                    // de la row avec juste le nom du media et son rôle.
                                    HStack(spacing: 6) {
                                        Image(systemName: media.kind == .image ? "photo.fill" : "video.fill")
                                            .font(.system(size: 14))
                                        Text(media.kind == .image ? "Image" : "Vidéo")
                                            .font(.system(size: 13, weight: .semibold))
                                    }
                                    .foregroundColor(primaryText)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(
                                        RoundedRectangle(cornerRadius: 10)
                                            .fill(MeeshyColors.indigo400.opacity(0.25))
                                    )
                                }
                                .dropDestination(for: String.self) { items, _ in
                                    guard let sourceId = items.first,
                                          let mediaList = viewModel.currentEffects.mediaObjects,
                                          let sourceIdx = mediaList.firstIndex(where: { $0.id == sourceId }),
                                          let targetIdx = mediaList.firstIndex(where: { $0.id == media.id }),
                                          sourceIdx != targetIdx else { return false }
                                    // `.onMove` consomme un IndexSet source + un offset destination.
                                    // Pour glisser un élément vers une position donnée, l'offset doit
                                    // pointer APRÈS la cible si on descend, AVANT si on monte.
                                    let destination = sourceIdx < targetIdx ? targetIdx + 1 : targetIdx
                                    viewModel.moveMedia(from: IndexSet(integer: sourceIdx), to: destination)
                                    HapticFeedback.light()
                                    return true
                                }
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .frame(maxHeight: 150)
            }
        }
    }

    @ViewBuilder
    private func mediaItemRow(_ media: StoryMediaObject) -> some View {
        let isBg = viewModel.isBackground(id: media.id)
        let isImage = media.kind == .image
        let actionTint: Color = secondaryText
        let rowBgFill: Color = isBg
            ? MeeshyColors.indigo400.opacity(0.18)
            : (colorScheme == .dark ? Color.white.opacity(0.07) : MeeshyColors.indigo950.opacity(0.05))
        HStack(spacing: 8) {
            // Thumbnail
            Group {
                if let img = viewModel.loadedImages[media.id] {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                } else {
                    ZStack {
                        (colorScheme == .dark ? Color.white.opacity(0.1) : MeeshyColors.indigo950.opacity(0.08))
                        Image(systemName: isImage ? "photo" : "video")
                            .font(.system(size: 12))
                            .foregroundColor(mutedText)
                    }
                }
            }
            .frame(width: 32, height: 32)
            .clipShape(RoundedRectangle(cornerRadius: 5))

            // Type + role
            VStack(alignment: .leading, spacing: 1) {
                Text(isImage ? "Image" : "Vidéo")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(primaryText)
                Text(isBg ? "Fond" : "Premier plan")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(isBg ? MeeshyColors.indigo400 : secondaryText)
            }

            Spacer(minLength: 4)

            // Action buttons — compact icon row
            HStack(spacing: 6) {
                // Toggle front/back
                mediaActionBtn(
                    icon: isBg ? "square.3.layers.3d.top.filled" : "square.3.layers.3d.bottom.filled",
                    color: isBg ? MeeshyColors.indigo400 : actionTint,
                    tip: isBg ? "Premier plan" : "Fond"
                ) {
                    viewModel.toggleBackground(id: media.id)
                }

                // Edit
                mediaActionBtn(icon: "pencil", color: actionTint, tip: "Éditer") {
                    onEditMedia?(media.id)
                }

                // Timeline
                mediaActionBtn(icon: "timeline.selection", color: actionTint, tip: "Timeline") {
                    viewModel.selectedElementId = media.id
                    onShowInTimeline?()
                }

                // Duplicate
                mediaActionBtn(icon: "doc.on.doc", color: actionTint, tip: "Dupliquer") {
                    viewModel.duplicateElement(id: media.id)
                }

                // Delete
                mediaActionBtn(icon: "trash", color: .red.opacity(0.8), tip: "Supprimer") {
                    viewModel.deleteElement(id: media.id)
                    HapticFeedback.medium()
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(rowBgFill)
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
                    let isSelected = viewModel.backgroundColor == "#\(hex)"
                    Button {
                        viewModel.backgroundColor = "#\(hex)"
                        viewModel.hasBackgroundImage = false
                        HapticFeedback.light()
                    } label: {
                        Circle().fill(Color(hex: hex))
                            .frame(width: 44, height: 44)
                            .overlay(
                                Circle().stroke(Color.white, lineWidth: isSelected ? 3 : 0)
                                    .padding(2)
                            )
                            .shadow(color: Color(hex: hex).opacity(isSelected ? 0.5 : 0), radius: 6)
                    }
                    .accessibilityLabel(String(localized: "story.background.swatch", defaultValue: "Couleur de fond", bundle: .module))
                    .accessibilityValue("#\(hex)")
                    .accessibilityHint(String(localized: "story.background.swatch.hint", defaultValue: "Touchez pour appliquer ce fond.", bundle: .module))
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .padding(.horizontal, 2)
            .padding(.vertical, 14)
        }
    }
}
