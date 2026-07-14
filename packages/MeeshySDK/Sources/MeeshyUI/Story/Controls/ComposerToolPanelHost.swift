import SwiftUI
import PhotosUI
import MeeshySDK

struct ComposerToolPanelHost: View {
    let tool: StoryToolMode
    @ObservedObject var viewModel: StoryComposerViewModel
    @Binding var selectedFilter: StoryFilter?
    @Binding var fgMediaItem: PhotosPickerItem?
    @Binding var showAudioDocumentPicker: Bool
    @Binding var showVoiceRecorderSheet: Bool
    let onBack: () -> Void
    var onSwitchTool: ((StoryToolMode) -> Void)? = nil
    var onEditMedia: ((String) -> Void)? = nil
    var onEditText: ((String) -> Void)? = nil
    /// C8 — ouvre le picker de stickers (sheet au niveau View : le sticker
    /// ajouté rejoint l'état canvas-authored du composer, pas le VM).
    var onOpenStickerPicker: (() -> Void)? = nil
    /// Suppression d'un texte depuis la liste : remontée jusqu'à
    /// `ComposerControlsLayer` afin de fermer le format panel si le texte
    /// supprimé était celui en cours d'édition — sans ce relai la branche
    /// `.formatPanel(.text, …)` continue de rendre un panel vide pendant un
    /// frame avant que le fallback `Color.clear.onAppear` ne déclenche la
    /// fermeture (flicker visible).
    var onDeleteText: ((String) -> Void)? = nil
    var onShowInTimeline: (() -> Void)? = nil
    /// Hauteur redimensionnable du panneau (drag du grabber), pour TOUS les outils
    /// (2026-06-02, plus seulement le dessin). Non-nil → remplace la hauteur fixe
    /// `panelHeight` (`.frame(height: panelHeight - 50)`), donc le menu suit le grabber.
    var panelHeightOverride: CGFloat? = nil

    @Environment(\.colorScheme) private var colorScheme

    /// État local pour piloter le `PhotosPicker` programmatiquement quand on
    /// entre dans l'outil media sur une slide vide. Pendant — comme le
    /// `textPanel.onAppear` qui crée un texte vide + ouvre l'éditeur, l'outil
    /// media ouvre directement le picker système quand l'utilisateur n'a
    /// encore aucun media. Voir le `.onAppear` sur `mediaPanel`.
    @State private var autoOpenMediaPicker: Bool = false

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
            headerRow
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

    /// En-tête du panel : `< {Tool}` à gauche + chips de switch direct vers
    /// les autres éditeurs à droite (scroll horizontal si la largeur ne suffit
    /// pas). Tap d'un chip → `viewModel.selectTool(other)` (l'overlay du band
    /// gère la transition vers le nouveau panel).
    @ViewBuilder
    private var headerRow: some View {
        HStack(spacing: 8) {
            backButton

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(otherTools, id: \.rawValue) { other in
                        switchChip(for: other)
                    }
                }
            }
        }
    }

    private var backButton: some View {
        Button(action: { onBack() }) {
            HStack(spacing: 4) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
                Text(toolTitle).font(.system(size: 14, weight: .semibold))
            }
        }
        .foregroundColor(primaryText)
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial, in: Capsule())
        .accessibilityLabel(String(
            localized: "story.composer.tool.back",
            defaultValue: "Retour",
            bundle: .module
        ))
        .accessibilityHint(toolTitle)
    }

    private func switchChip(for other: StoryToolMode) -> some View {
        Button {
            onSwitchTool?(other)
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: Self.icon(for: other))
                    .font(.system(size: 11, weight: .semibold))
                Text(Self.title(for: other))
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(secondaryText)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(colorScheme == .dark
                          ? Color.white.opacity(0.08)
                          : MeeshyColors.indigo950.opacity(0.06))
            )
            .overlay(
                Capsule()
                    .stroke(mutedText.opacity(0.25), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Self.title(for: other))
        .accessibilityHint(String(
            localized: "story.composer.tool.switch.hint",
            defaultValue: "Ouvre l'éditeur",
            bundle: .module
        ))
    }

    /// Tous les éditeurs sélectionnables SAUF celui couramment ouvert. Ordre
    /// stable depuis `StoryToolMode.selectableCases` — le filtre global `.filters`
    /// en est exclu (filtrage désormais par média via l'éditeur unitaire).
    private var otherTools: [StoryToolMode] {
        StoryToolMode.selectableCases.filter { $0 != tool }
    }

    private static func icon(for tool: StoryToolMode) -> String {
        switch tool {
        case .media:    return "play.rectangle.fill"
        case .audio:    return "music.note"
        case .drawing:  return "pencil.tip"
        case .text:     return "textformat"
        case .texture:  return "paintpalette.fill"
        case .filters:  return "camera.filters"
        case .timeline: return "clock"
        }
    }

    private static func title(for tool: StoryToolMode) -> String {
        switch tool {
        case .media:    return String(localized: "story.tool.media", defaultValue: "Médias", bundle: .module)
        case .audio:    return String(localized: "story.tool.audio", defaultValue: "Son", bundle: .module)
        case .drawing:  return String(localized: "story.tool.drawing", defaultValue: "Dessin", bundle: .module)
        case .text:     return String(localized: "story.tool.text", defaultValue: "Texte", bundle: .module)
        case .texture:  return String(localized: "story.tool.texture", defaultValue: "Fond", bundle: .module)
        case .filters:  return String(localized: "story.tool.filters", defaultValue: "Effets", bundle: .module)
        case .timeline: return String(localized: "story.tool.timeline", defaultValue: "Timeline", bundle: .module)
        }
    }

    private var toolTitle: String { Self.title(for: tool) }

    private var panelHeight: CGFloat {
        // Le grabber pilote la hauteur du panneau pour TOUS les outils (2026-06-02) :
        // quand le band est redimensionnable, `panelHeightOverride` (= hauteur du band
        // tirée par le grabber) prime sur la hauteur intrinsèque par défaut — sinon
        // tirer la poignée ne rétrécissait PAS le menu hors dessin (le contenu gardait
        // sa hauteur fixe). Le contenu scrolle s'il est plus grand que l'espace.
        panelHeightOverride ?? Self.defaultPanelHeight(for: tool)
    }

    /// Hauteur par défaut d'un panneau d'outil avant tout redimensionnement au
    /// grabber. Pure et testable indépendamment du montage SwiftUI.
    static func defaultPanelHeight(for tool: StoryToolMode) -> CGFloat {
        switch tool {
        case .media:    return 220
        case .audio:    return 220
        case .drawing:  return 280   // liste des traits
        case .text:     return 280
        case .texture:  return 236  // couleurs + rangée « Ouverture » (C1)
        case .filters:  return 180
        case .timeline: return 320  // scrubber + pistes clips (2026-07-14, band comme les autres outils)
        }
    }

    @ViewBuilder
    private var placeholderPanel: some View {
        switch tool {
        case .media:
            mediaPanel
        case .audio:
            audioPanel
        case .drawing:
            drawingPanel
        case .text:
            textPanel
        case .texture:
            texturePanel
        case .filters:
            // Feed the grid the current slide's background bitmap so each tile
            // renders a real per-effect preview. Resolves the background MEDIA
            // object (modern path) with a slideImages fallback — passing only
            // `slideImages[slide.id]` left photo-backed slides' tiles blank
            // because modern photos live in `mediaObjects`, not `slideImages`.
            // The grid falls back to gradient placeholders only when this is nil
            // (colour/gradient-only slides).
            StoryFilterGridView(viewModel: viewModel,
                                previewImage: viewModel.currentSlideBackgroundImage)
        case .timeline:
            timelinePanel
        }
    }

    // MARK: - Timeline Panel

    /// Contenu de la timeline embarqué inline dans le band, comme tous les
    /// autres outils (2026-07-14 — auparavant présenté en `.sheet()` modal).
    /// Le chargement du slide courant + la resynchronisation du scrub à
    /// l'ouverture, et l'arrêt de la lecture + le commit à la fermeture,
    /// suivent maintenant le cycle de vie du panneau (onAppear/onDisappear)
    /// plutôt que celui de l'ancienne sheet système.
    private var timelinePanel: some View {
        TimelineSheetContent(composer: viewModel)
            .onAppear {
                viewModel.loadCurrentSlideIntoTimeline()
                viewModel.canvasTimelineBridge.scrub(
                    seconds: Double(viewModel.timelineViewModel.currentTime))
            }
            .onDisappear {
                if viewModel.timelineViewModel.isPlaying {
                    viewModel.timelineViewModel.togglePlayback()
                }
                viewModel.canvasTimelineBridge.end()
                viewModel.commitTimelineToCurrentSlide()
            }
    }

    // MARK: - Audio Panel

    private var audioPanel: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
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

            if let audios = viewModel.currentEffects.audioPlayerObjects, !audios.isEmpty {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 4) {
                        ForEach(audios) { audio in
                            StoryAudioCell(
                                audio: audio,
                                url: viewModel.loadedAudioURLs[audio.id],
                                isBackground: viewModel.isBackground(id: audio.id),
                                onToggleBackground: { viewModel.toggleBackground(id: audio.id) },
                                onVolumeChanged: { viewModel.setAudioVolume(audioId: audio.id, volume: $0) },
                                onDelete: { viewModel.deleteElement(id: audio.id) }
                            )
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .frame(maxHeight: 150)
            }
        }
        // Ouvrir l'outil Son sur une slide vierge déclenche directement le
        // voice recorder — parité avec `textPanel.onAppear` qui ouvre
        // l'éditeur de texte sans étape intermédiaire. Couvre les deux
        // entrées : tap FAB son (band → audioPanel) et empty-state tile son.
        // Si la slide a déjà au moins un audio, on respecte l'intent (l'user
        // veut probablement gérer la liste existante).
        .onAppear {
            let isEmpty = (viewModel.currentEffects.audioPlayerObjects?.isEmpty ?? true)
            if isEmpty && viewModel.canAddAudio && !showVoiceRecorderSheet {
                showVoiceRecorderSheet = true
            }
        }
    }

    // MARK: - Media Panel

    private var mediaPanel: some View {
        // Bundle localisé hissé hors de la closure de label `PhotosPicker`
        // (inférée `@Sendable`) en constante Sendable — voir
        // `ConversationSettingsView.visualSection`.
        let addMediaLabel = String(localized: "story.composer.addPhotoVideo", defaultValue: "Photo/Video", bundle: .module)
        return VStack(spacing: 10) {
            // Add buttons
            HStack(spacing: 8) {
                if viewModel.canAddMedia {
                    PhotosPicker(selection: $fgMediaItem, matching: .any(of: [.images, .videos])) {
                        MediaPillLabel(icon: "photo.on.rectangle.angled", text: addMediaLabel, destructive: false)
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
                                        Text(media.kind == .image
                                             ? String(localized: "story.media.image", defaultValue: "Image", bundle: .module)
                                             : String(localized: "story.media.video", defaultValue: "Vidéo", bundle: .module))
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
        // Ouvrir l'outil Media sur une slide vierge déclenche directement le
        // PhotosPicker — parité avec `textPanel.onAppear` et l'audioPanel
        // qui ouvre le voice recorder. Couvre les deux entrées : tap FAB
        // media (band → mediaPanel) et empty-state tile media.
        .photosPicker(
            isPresented: $autoOpenMediaPicker,
            selection: $fgMediaItem,
            matching: .any(of: [.images, .videos])
        )
        .onAppear {
            let isEmpty = (viewModel.currentEffects.mediaObjects?.isEmpty ?? true)
            if isEmpty && viewModel.canAddMedia && !autoOpenMediaPicker {
                autoOpenMediaPicker = true
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
                Text(isImage
                     ? String(localized: "story.media.image", defaultValue: "Image", bundle: .module)
                     : String(localized: "story.media.video", defaultValue: "Vidéo", bundle: .module))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(primaryText)
                Text(isBg
                     ? String(localized: "story.media.background", defaultValue: "Fond", bundle: .module)
                     : String(localized: "story.media.foreground", defaultValue: "Premier plan", bundle: .module))
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
                    tip: isBg
                        ? String(localized: "story.media.foreground", defaultValue: "Premier plan", bundle: .module)
                        : String(localized: "story.media.background", defaultValue: "Fond", bundle: .module)
                ) {
                    viewModel.toggleBackground(id: media.id)
                }

                // Edit
                mediaActionBtn(icon: "pencil", color: actionTint, tip: String(localized: "common.edit", defaultValue: "Éditer", bundle: .module)) {
                    onEditMedia?(media.id)
                }

                // Timeline
                mediaActionBtn(icon: "timeline.selection", color: actionTint, tip: String(localized: "story.tool.timeline", defaultValue: "Timeline", bundle: .module)) {
                    viewModel.selectedElementId = media.id
                    onShowInTimeline?()
                }

                // Duplicate
                mediaActionBtn(icon: "doc.on.doc", color: actionTint, tip: String(localized: "common.duplicate", defaultValue: "Dupliquer", bundle: .module)) {
                    viewModel.duplicateElement(id: media.id)
                }

                // Delete
                mediaActionBtn(icon: "trash", color: .red.opacity(0.8), tip: String(localized: "common.delete", defaultValue: "Supprimer", bundle: .module)) {
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

    /// Le mode dessin n'utilise PAS ce panneau de bande : il a sa propre bande
    /// redimensionnable dédiée (`DrawingBand`, pilotée par `StoryComposerView`),
    /// affichée uniquement quand au moins un trait existe. Ici on reste `EmptyView`
    /// pour satisfaire le `switch` exhaustif sur `StoryToolMode`.
    /// Panneau DESSIN du band partagé : la liste éditable des traits (sélection /
    /// suppression / recoloration par-trait). Le band `ComposerBottomBand` est
    /// utilisé par TOUS les outils — le dessin l'affiche aussi (plus de 2ᵉ bande
    /// dédiée `DrawingBand` qui doublonnait, bug user 2026-06-01). Les contrôleurs
    /// de pinceau restent flottants sur le canvas (`StoryDrawingToolbar`).
    private var drawingPanel: some View {
        // `Spacer` : quand la liste est vide, `DrawingStrokeList` rend un `EmptyView`
        // dont SwiftUI ignore le `.frame(height:)` → le band collapserait à la barre
        // de chips. Le `Spacer` (vue concrète) remplit la hauteur du panneau.
        VStack(spacing: 0) {
            DrawingStrokeList(viewModel: viewModel, maxListHeight: .infinity)
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private var textPanel: some View {
        VStack(spacing: 10) {
            // Bouton « + Ajouter du texte ». Reste discret et collé à gauche
            // pour ne pas competition la liste qui suit (parité avec mediaPanel).
            HStack(spacing: 8) {
                if viewModel.canAddText {
                    Button {
                        addTextAndEdit()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 14, weight: .medium))
                            Text(String(localized: "story.composer.addText", defaultValue: "Ajouter du texte", bundle: .module))
                                .font(.system(size: 13, weight: .medium))
                        }
                        .foregroundColor(MeeshyColors.brandPrimary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(MeeshyColors.brandPrimary.opacity(0.12))
                        )
                    }
                }
                // C8 — les stickers redeviennent atteignables : le picker
                // complet existait (StickerPickerView) mais n'avait AUCUN
                // call site depuis le retrait du tool dédié. Foyer choisi :
                // le panneau Texte (les stickers sont des overlays de la
                // même famille), même style que « Ajouter du texte ».
                Button {
                    onOpenStickerPicker?()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "face.smiling")
                            .font(.system(size: 14, weight: .medium))
                        Text(String(localized: "story.sticker.title", defaultValue: "Stickers", bundle: .module))
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(MeeshyColors.brandPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(MeeshyColors.brandPrimary.opacity(0.12))
                    )
                }
                Spacer()
            }

            // Liste des textes existants — chaque row affiche un aperçu de
            // contenu + actions (éditer, dupliquer, placer dans la timeline,
            // supprimer). Caché si la slide n'a aucun texte (l'utilisateur
            // vient juste d'ouvrir l'outil texte sur une slide vierge).
            let texts = viewModel.currentEffects.textObjects
            if !texts.isEmpty {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 4) {
                        ForEach(texts) { text in
                            textItemRow(text)
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .frame(maxHeight: 170)
            }
        }
        // Ouvrir le panel Texte sur une slide vierge déclenche directement
        // l'ajout + l'édition inline : pas besoin de re-tapper "Ajouter du
        // texte" alors qu'on vient explicitement d'entrer dans l'éditeur
        // texte. Si la slide a déjà du texte, on respecte l'intent (l'user
        // veut probablement éditer un existant via la liste).
        .onAppear {
            if viewModel.currentEffects.textObjects.isEmpty && viewModel.canAddText {
                addTextAndEdit()
            }
        }
    }

    private func addTextAndEdit() {
        let new = viewModel.addText()
        HapticFeedback.light()
        if let id = new?.id {
            onEditText?(id)
        }
    }

    @ViewBuilder
    private func textItemRow(_ text: StoryTextObject) -> some View {
        let actionTint: Color = secondaryText
        let rowBgFill: Color = colorScheme == .dark
            ? Color.white.opacity(0.07)
            : MeeshyColors.indigo950.opacity(0.05)
        let preview: String = {
            let trimmed = text.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                return String(
                    localized: "story.composer.text.empty",
                    defaultValue: "Texte vide",
                    bundle: .module
                )
            }
            return trimmed
        }()
        let textHex = text.textColor ?? "FFFFFF"
        HStack(spacing: 8) {
            // Pastille couleur — rappelle la couleur courante du texte.
            ZStack {
                RoundedRectangle(cornerRadius: 5)
                    .fill(Color(hex: textHex))
                Text("Aa")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: textHex).luminance > 0.6 ? .black : .white)
            }
            .frame(width: 32, height: 32)
            .overlay(
                RoundedRectangle(cornerRadius: 5)
                    .stroke(Color.white.opacity(0.25), lineWidth: 0.5)
            )

            // Aperçu + style
            VStack(alignment: .leading, spacing: 1) {
                Text(preview)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(primaryText)
                    .lineLimit(1)
                Text((text.textStyle ?? "classic").capitalized)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(secondaryText)
            }

            Spacer(minLength: 4)

            HStack(spacing: 6) {
                textActionBtn(icon: "pencil", color: actionTint, tip: "Éditer") {
                    onEditText?(text.id)
                }
                textActionBtn(icon: "timeline.selection", color: actionTint, tip: "Timeline") {
                    viewModel.selectedElementId = text.id
                    onShowInTimeline?()
                }
                textActionBtn(icon: "doc.on.doc", color: actionTint, tip: "Dupliquer") {
                    viewModel.duplicateElement(id: text.id)
                }
                textActionBtn(icon: "trash", color: .red.opacity(0.8), tip: "Supprimer") {
                    HapticFeedback.medium()
                    if let onDeleteText {
                        onDeleteText(text.id)
                    } else {
                        viewModel.deleteElement(id: text.id)
                    }
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(rowBgFill)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            onEditText?(text.id)
            HapticFeedback.light()
        }
    }

    private func textActionBtn(
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

    private var texturePanel: some View {
        VStack(alignment: .leading, spacing: 0) {
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
                    // C11 — la palette de dégradés (définie depuis l'origine
                    // mais jamais offerte) rejoint la rangée : même format de
                    // pastille, valeur sérialisée « gradient:HEX1:HEX2 »
                    // (StoryBackgroundValue, rendue par les 3 renderers).
                    ForEach(Array(StoryBackgroundPalette.gradients.enumerated()), id: \.offset) { _, pair in
                        let serialized = StoryBackgroundValue.gradient(pair.0, pair.1).serialized
                        let isSelected = viewModel.backgroundColor == serialized
                        Button {
                            viewModel.backgroundColor = serialized
                            viewModel.hasBackgroundImage = false
                            HapticFeedback.light()
                        } label: {
                            Circle()
                                .fill(LinearGradient(
                                    colors: [Color(hex: pair.0), Color(hex: pair.1)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                                .frame(width: 44, height: 44)
                                .overlay(
                                    Circle().stroke(Color.white, lineWidth: isSelected ? 3 : 0)
                                        .padding(2)
                                )
                                .shadow(color: Color(hex: pair.0).opacity(isSelected ? 0.5 : 0), radius: 6)
                        }
                        .accessibilityLabel(String(localized: "story.background.gradient",
                                                   defaultValue: "Fond dégradé", bundle: .module))
                        .accessibilityValue("\(pair.0) → \(pair.1)")
                        .accessibilityAddTraits(isSelected ? .isSelected : [])
                    }
                }
                .padding(.horizontal, 2)
                .padding(.vertical, 14)
            }

            // C1 — l'animation d'ouverture du slide devient accessible par
            // GESTE (FAB Fond → band → chips ; swipe-down pour fermer), plus
            // seulement via le menu ⋯ → sheet Transitions. Même source de
            // vérité (viewModel.openingEffect) et même persistance
            // (granularCanvasSync) que la sheet — cf. OpeningEffectChips.
            Text(String(
                localized: "story.composer.openingTitle",
                defaultValue: "Ouverture du slide",
                bundle: .module
            ))
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(mutedText)
            .padding(.horizontal, 2)
            .padding(.bottom, 8)

            OpeningEffectChips(selection: viewModel.openingEffect) { effect in
                viewModel.openingEffect = effect
            }
        }
    }
}
