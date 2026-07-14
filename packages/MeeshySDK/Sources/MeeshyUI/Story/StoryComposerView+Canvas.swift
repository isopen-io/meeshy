import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + Canvas

extension StoryComposerView {
    /// Canvas gestures disabled only while the DRAWING SURFACE is mounted
    /// (plein écran de tracé — the capture layer needs exclusive touch
    /// control). List mode keeps the canvas fully interactive.
    var isCanvasGestureEnabled: Bool {
        !isImmersiveDrawingSurface
    }

    /// Pan always available when zoomed — uses high minimumDistance to avoid accidental triggers
    var isPanEnabled: Bool {
        viewModel.isCanvasZoomed
    }

    var viewportDragGesture: some Gesture {
        DragGesture(minimumDistance: 20)
            .updating($viewportDragDelta) { value, state, _ in
                state = value.translation
            }
            .onEnded { value in
                viewModel.canvasOffset = CGSize(
                    width: viewModel.canvasOffset.width + value.translation.width,
                    height: viewModel.canvasOffset.height + value.translation.height
                )
            }
    }

    var mainContent: some View {
        ZStack {
            // BUG-2 (C-DIR4, user 2026-07-04) : en présentation LIBRE (chrome
            // plein), le canvas 9:16 aspect-fit laisse des bandes letterbox
            // haut/bas sur les écrans 19.5:9 — celle du haut se cache sous le
            // header, celle du bas restait NOIRE et nue (« zone noire en
            // bas »). Un 9:16 ne peut pas remplir l'écran ; le letterbox prend
            // donc la COULEUR DU FOND du slide : le canvas paraît occuper tout
            // l'écran. Noir conservé en carded (contraste voulu de la carte)
            // et sur fond MÉDIA (letterbox cinéma).
            Rectangle()
                .fill(canvasIsCarded || viewModel.hasBackgroundImage
                    ? AnyShapeStyle(Color.black)
                    : storyBackgroundStyle(
                        viewModel.backgroundColor.replacingOccurrences(of: "#", with: "")))
                .ignoresSafeArea()
                .animation(.easeInOut(duration: 0.25), value: canvasIsCarded)

            // Canvas core (CALayer) + drawing overlay + viewport modifiers,
            // extracted into `canvasComposerLayer` so the SwiftUI type-checker
            // doesn't time out on this body's full modifier chain.
            canvasComposerLayer

            // Top bar — auto-hides during canvas zoom to reveal canvas controls.
            // Hidden (non-interactive) while the floating text editor is open.
            VStack(spacing: 0) {
                if showTopBar {
                    topBar
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85), value: showTopBar)
            .opacity(viewModel.textEditingMode == .inactive ? 1 : 0)
            .allowsHitTesting(viewModel.textEditingMode == .inactive)
            .environment(\.colorScheme, canvasChromeScheme)

            // Bottom: toolbar + active panel.
            // When the composer is empty (no content + no tool selected) we
            // swap the compact toolbar for `emptyStateLargePicker` — large
            // rectangular tiles in a horizontal carousel taking the bottom
            // half of the screen. The compact toolbar comes back as soon as
            // a tool is selected OR a slide has any content.
            // Hidden (non-interactive) while the floating text editor is open.
            bottomRegion
                .opacity(isFloatingEditorActive ? 0 : 1)
                .allowsHitTesting(!isFloatingEditorActive)

            // Annuler/rétablir — colonne verticale flottante en bas à droite
            // sur le flanc droit (directive user 2026-07-10), levée au-dessus
            // de la barre horizontale de FABs. Suit la même règle de chrome
            // que le header (`showTopBar`) : visible uniquement canvas plein
            // écran au repos.
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    if showTopBar {
                        historyColumn
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                    }
                }
            }
            .padding(.trailing, 16)
            .padding(.bottom, 88)
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: showTopBar)
            .allowsHitTesting(showTopBar)
            .environment(\.colorScheme, canvasChromeScheme)

            // Floating text edit overlay — sits above every composer control.
            // Empty view when `textEditingMode == .inactive`.
            StoryTextEditToolbar(viewModel: viewModel)
                .padding(.bottom, keyboardHeight)
                .environment(\.colorScheme, canvasChromeScheme)

            // Le dessin utilise le band PARTAGÉ (`ComposerBottomBand` →
            // `drawingPanel` = liste éditable des traits), comme tous les autres
            // outils — plus de bande dédiée `DrawingBand` qui doublonnait
            // (2 sheets, l'une au grabber occulté/inactif — bug user 2026-06-01).

            // Floating drawing controls — mirror du toolbar texte. Vide quand
            // `drawingEditingMode == .inactive`. Les bulles (pinceau/couleur/
            // épaisseur/lissage) flottent sur le canvas, levées au-dessus du band
            // partagé (`bottomInset`).
            StoryDrawingToolbar(viewModel: viewModel, bottomInset: presentedSheetHeight)
                .environment(\.colorScheme, canvasChromeScheme)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85),
                   value: viewModel.textEditingMode)
        .animation(.spring(response: 0.3, dampingFraction: 0.85),
                   value: viewModel.drawingEditingMode)
        .adaptiveOnChange(of: viewModel.activeTool) { oldTool, newTool in
            // Dessin en DEUX temps (user 2026-07-11 v2) : entrer = mode
            // LISTE (band ouvert sur la liste des traits, rien d'activé) ;
            // le plein écran de tracé ne s'active qu'à la sélection d'un
            // pinceau (cf. onChange de `isDrawingImmersive` ci-dessous).
            // Quitter = restauration du système initial : chrome/FABs de
            // retour, band dessin refermé, zoom remis à 1 (VM).
            if newTool == .drawing {
                viewModel.enterDrawingEditingMode()
                if bandStateMachine.state.activeCategory != .drawing {
                    bandStateMachine.tapTile(.drawing)
                }
            } else {
                viewModel.exitDrawingEditingMode()
                if bandStateMachine.state.activeCategory == .drawing {
                    bandStateMachine.reset()
                }
                if oldTool == .drawing {
                    areFabsVisible = true
                }
            }
        }
        .adaptiveOnChange(of: viewModel.isDrawingImmersive) { _, immersive in
            // Bascule liste ⇄ plein écran : le pinceau sélectionné replie le
            // band (canvas full-bleed, bulles seules) ; retomber en mode
            // liste (sortie) rouvre la liste si l'outil dessin est toujours
            // actif.
            if immersive {
                if bandStateMachine.state != .hidden {
                    bandStateMachine.reset()
                }
            } else if viewModel.activeTool == .drawing,
                      bandStateMachine.state.activeCategory != .drawing {
                bandStateMachine.tapTile(.drawing)
            }
        }
        .statusBarHidden()
        .ignoresSafeArea(.keyboard)
        .onAppear {
            viewModel.startMemoryObserver()
            viewModel.loadCurrentSlideIntoTimeline()
            // Apply the random pastel background (initialised on VM) to the
            // current slide right away so the canvas previews the chosen
            // color instead of staying black until the user touches anything.
            // Without this, `slide.effects.background` is nil and the canvas
            // falls back to opaque black.
            if viewModel.currentSlide.effects.background == nil {
                syncCurrentSlideEffects()
            }
        }
        .adaptiveOnChange(of: viewModel.currentSlideIndex) { _, _ in
            viewModel.loadCurrentSlideIntoTimeline()
            bandStateMachine.reset()
            areFabsVisible = true
            // A text edit overlay open on the previous slide references an
            // element that does not exist on the new one — close it.
            viewModel.exitTextEditingMode()
        }
        .onDisappear {
            StoryMediaCoordinator.shared.deactivate()
            publishTask?.cancel()
            publishTask = nil
            viewModel.stopMemoryObserver()
            // Contrat StoryTimelineEngine : "owner MUST call shutdown()" —
            // libère AVPlayer + observer périodique + AVAudioEngine du mixer.
            viewModel.shutdownTimelineIfNeeded()
            // Do NOT cleanup temp files here — background upload may still need them.
            // Cleanup happens after upload completes in StoryViewModel.launchUploadTask.
        }
        .adaptiveOnChange(of: fgMediaItem) { _, item in handleForegroundMediaSelection(from: item) }
        // Real-time canvas sync — Task 2.18 migration. Toolbars + sheets
        // mutate composer-local @State (`selectedFilter`,
        // `selectedImage`, …); the CALayer canvas reads from
        // `viewModel.currentSlide.effects` exclusively, so re-serialize on
        // each toolbar mutation. Five separate `.onChange` modifiers tipped
        // the type-checker over the time-out threshold, so we collapse them
        // into a single extension modifier to maintain performance in O(1).
        .onReceive(NotificationCenter.default.publisher(
            for: UIResponder.keyboardWillShowNotification)) { note in
            let frame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey]
                as? NSValue)?.cgRectValue ?? .zero
            keyboardHeight = frame.height
            recomputeCanvasShift()
        }
        .onReceive(NotificationCenter.default.publisher(
            for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardHeight = 0
            canvasEditShift = 0
        }
        .adaptiveOnChange(of: viewModel.textEditingMode) { _, _ in recomputeCanvasShift() }
        // Quand le canvas se carde/décarde, sa frame présentée change (post-scale) ;
        // on re-aligne l'éditeur texte inline APRÈS que la carte se soit posée
        // (ressort 0.32s) pour que `canvasEditShift` se base sur le rect final.
        .adaptiveOnChange(of: canvasIsCarded) { _, carded in
            // BUG-4 (C-DIR4) : un zoom/pan viewport résiduel SOUS le carding
            // compose deux transforms (interne × carte) → contenu décalé/
            // débordant, perçu tronqué. Entrer en carding ramène le viewport
            // à l'échelle 1 (le zoom 3 doigts est un outil d'inspection du
            // canvas LIBRE ; le bouton reset et le double-tap C4 restent).
            if carded, viewModel.isCanvasZoomed {
                withAnimation(.spring(response: 0.3)) { viewModel.resetCanvasZoom() }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.34) { recomputeCanvasShift() }
        }
        .granularCanvasSync(
            filter: selectedFilter?.rawValue,
            hasImage: selectedImage != nil,
            stickersCount: viewModel.currentEffects.stickerObjects?.count ?? 0,
            drawingCount: viewModel.drawingData?.count ?? 0,
            bgColor: viewModel.backgroundColor,
            opening: viewModel.openingEffect,
            action: { syncCurrentSlideEffects() }
        )
    }

    var bottomRegion: some View {
        VStack(spacing: 0) {
            Spacer()
            if shouldShowEmptyStateLargePicker {
                emptyStateLargePicker
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                ComposerControlsLayer(
                    viewModel: viewModel,
                    bandStateMachine: $bandStateMachine,
                    areFabsVisible: $areFabsVisible,
                    selectedFilter: $selectedFilter,
                    fgMediaItem: $fgMediaItem,
                    showAudioDocumentPicker: $showAudioDocumentPicker,
                    showVoiceRecorderSheet: $showVoiceRecorderSheet,
                    resizableBandHeight: $composerBandHeight,
                    bandMinHeight: Self.composerBandMinHeight,
                    bandMaxHeight: Self.composerBandMaxHeight,
                    // Hauteur RÉELLE rendue de la band déployée (content-driven) —
                    // réservée par `presentedSheetHeight` pour scaler le canvas
                    // EXACTEMENT au-dessus (0 quand la band est repliée / FABs seuls,
                    // état où le canvas reste plein écran).
                    onBandHeightChange: { measuredBottomBandHeight = $0 },
                    onOpenMediaCrop: { id in openMediaEditor(elementId: id) },
                    onOpenStickerPicker: { showStickerPicker = true }
                )
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85),
                   value: shouldShowEmptyStateLargePicker)
    }

    // MARK: - Empty-State Large Picker
    //
    // Shown in place of the compact toolbar when the composer canvas is empty
    // (no media, no text, no sticker, no drawing, no background) AND no tool
    // is currently active. Surface a roomy carousel of large rectangular
    // tiles so the user discovers the available creation modes immediately
    // — better space utilization than ~70% black canvas + tiny pills row.
    // The current compact toolbar comes back the moment a tool is selected
    // OR any content is added.

    /// True when the entire composer carries no authoring state yet — used
    /// to decide whether to surface the discovery-mode large picker.
    ///
    /// `slide.effects.background` is intentionally NOT in the check because
    /// it is always auto-populated with a random pastel on composer open
    /// (see `.onAppear` → `syncCurrentSlideEffects`). The background being
    /// set therefore tells us nothing about user intent — only explicit
    /// content additions (text / media / sticker / drawing) flip the slide
    /// out of empty state.
    /// Un éditeur flottant plein-canvas est ouvert → le band compact standard
    /// est masqué et non-interactif. TEXTE : depuis toujours. DESSIN : en
    /// PLEIN ÉCRAN de tracé uniquement (user 2026-07-11 v2) — le mode liste
    /// garde le band visible (liste des traits).
    var isFloatingEditorActive: Bool {
        viewModel.textEditingMode != .inactive
            || viewModel.isDrawingImmersive
    }

    /// La surface de TRACÉ est montée : outil dessin actif ET plein écran
    /// (pinceau sélectionné). En mode liste, le canvas reste interactif
    /// normalement et rend son propre drawingLayer.
    var isImmersiveDrawingSurface: Bool {
        viewModel.isDrawingActive && viewModel.isDrawingImmersive
    }

    /// Scheme épinglé sur le chrome posé sur le canvas (header, bulles,
    /// FABs) : suit la luminance du FOND de la slide, pas le thème de l'app
    /// — icônes claires sur fond sombre, sombres sur fond clair (capture
    /// user 2026-07-11 : indigo950 illisible sur bleu nuit).
    var canvasChromeScheme: ColorScheme {
        CanvasChromeScheme.scheme(
            background: viewModel.backgroundColor,
            hasMediaBackground: viewModel.hasBackgroundImage
        )
    }

    var isComposerEmpty: Bool {
        let slidesEmpty = viewModel.slides.allSatisfy { slide in
            slide.content == nil
                && viewModel.slideImages[slide.id] == nil
                && slide.effects.textObjects.isEmpty
                && (slide.effects.mediaObjects ?? []).isEmpty
                && (slide.effects.stickerObjects ?? []).isEmpty
                && slide.effects.drawingData == nil
                && (slide.effects.drawingStrokes ?? []).isEmpty
        }
        return slidesEmpty
            && viewModel.drawingData == nil
            && viewModel.drawingStrokes.isEmpty
    }

    var shouldShowEmptyStateLargePicker: Bool {
        // Le picker grand format n'est montré QUE quand :
        //  - aucun outil n'est sélectionné côté viewModel,
        //  - le bandeau d'outils est complètement masqué (.hidden — le
        //    `bandStateMachine` peut être pré-ouvert via empty-state → tile,
        //    auquel cas le panel doit prendre toute la place),
        //  - et le slide n'a aucun contenu réel.
        // Sans le check `state == .hidden`, le picker pouvait persister visuellement
        // derrière le bandeau pendant les transitions (le band est animé via spring
        // et le if/else était insuffisant pendant le mid-transition).
        viewModel.activeTool == nil
            && isComposerEmpty
            && bandStateMachine.state == .hidden
    }

    /// Pastel accent color per tile. Picks a distinct hue so the carousel
    /// feels lively without breaking from the brand palette. Each accent is
    /// applied at low opacity behind the icon glyph (soft tinted card).
    func tileAccent(for tool: StoryToolMode) -> Color {
        switch tool {
        case .media:    return MeeshyColors.error          // peachy red
        case .audio:    return MeeshyColors.indigo400      // soft lavender
        case .text:     return MeeshyColors.indigo400      // soft lavender
        case .drawing:  return MeeshyColors.success        // mint green
        case .texture:  return MeeshyColors.warning        // butter yellow
        case .filters:  return MeeshyColors.info           // sky blue
        case .timeline: return MeeshyColors.indigo300      // pale indigo
        }
    }

    @ViewBuilder
    var emptyStateLargePicker: some View {
        VStack(spacing: 8) {
            VStack(spacing: 2) {
                Text(String(localized: "story.composer.empty.title",
                            defaultValue: "Commencez votre story",
                            bundle: .module))
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(MeeshyColors.brandGradient)
                Text(String(localized: "story.composer.empty.subtitle",
                            defaultValue: "Choisissez un outil pour démarrer",
                            bundle: .module))
                    .font(.system(size: 11))
                    .foregroundColor((colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.7))
            }
            .padding(.top, 8)
            .opacity(pickerSelectedTool == nil ? 1 : 0)
            .scaleEffect(pickerSelectedTool == nil ? 1 : 0.95)

            // 6 tiles in a 2-column grid fit comfortably.
            // The grid sizes to its content so the picker stays at
            // the bottom and leaves ≥ 80 % of the screen for the top bar +
            // canvas pastel preview, per the empty-state UX brief.
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10)
                ],
                spacing: 10
            ) {
                    largeToolTile(
                        .media,
                        icon: "play.rectangle.fill",
                        title: String(localized: "story.composer.empty.tile.media",
                                      defaultValue: "Médias",
                                      bundle: .module),
                        subtitle: String(localized: "story.composer.empty.tile.media.sub",
                                         defaultValue: "Photos, vidéos",
                                         bundle: .module)
                    )
                    largeToolTile(
                        .audio,
                        icon: "music.note",
                        title: String(localized: "story.composer.empty.tile.son",
                                      defaultValue: "Son",
                                      bundle: .module),
                        subtitle: String(localized: "story.composer.empty.tile.son.sub",
                                         defaultValue: "Musique, voix",
                                         bundle: .module),
                        specialCategory: .son
                    )
                    largeToolTile(
                        .text,
                        icon: "textformat",
                        title: String(localized: "story.composer.empty.tile.text",
                                      defaultValue: "Texte",
                                      bundle: .module),
                        subtitle: String(localized: "story.composer.empty.tile.text.sub",
                                         defaultValue: "Style, couleur, verre",
                                         bundle: .module)
                    )
                    largeToolTile(
                        .drawing,
                        icon: "pencil.tip",
                        title: String(localized: "story.composer.empty.tile.drawing",
                                      defaultValue: "Dessin",
                                      bundle: .module),
                        subtitle: String(localized: "story.composer.empty.tile.drawing.sub",
                                         defaultValue: "Pencil et couleurs",
                                         bundle: .module)
                    )
                largeToolTile(
                    .texture,
                    icon: "paintpalette.fill",
                    title: String(localized: "story.tool.texture",
                                  defaultValue: "Fond",
                                  bundle: .module),
                    subtitle: String(localized: "story.background.swatch",
                                     defaultValue: "Couleur de fond",
                                     bundle: .module)
                )
                largeToolTile(
                    .timeline,
                    icon: "clock",
                    title: String(localized: "story.composer.empty.tile.timeline",
                                  defaultValue: "Timeline",
                                  bundle: .module),
                    subtitle: String(localized: "story.composer.empty.tile.timeline.sub",
                                     defaultValue: "Montage et durée",
                                     bundle: .module)
                )
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
        }
        .padding(.bottom, safeAreaBottomInset + 12)
        .frame(maxWidth: .infinity)
        .background(
            UnevenRoundedRectangle(
                topLeadingRadius: 24,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 24,
                style: .continuous
            )
            // Aligné sur la même charte que `ComposerBottomBand` : un tint
            // opaque adaptatif (blanc en light / indigo950 en dark) pour rester
            // lisible quelle que soit la couleur du canvas (pastel/photo) en
            // arrière-plan. Avant: `.ultraThinMaterial` qui se faisait teinter
            // par la slide et écrasait le contraste des sous-titres.
            .fill(colorScheme == .dark
                ? MeeshyColors.indigo950.opacity(0.92)
                : Color.white.opacity(0.92))
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
            .shadow(color: .black.opacity(0.20), radius: 14, y: -6)
            .ignoresSafeArea(edges: .bottom)
        )
    }

    @ViewBuilder
    func largeToolTile(
        _ tool: StoryToolMode,
        icon: String,
        title: String,
        subtitle: String,
        specialCategory: BandCategory? = nil
    ) -> some View {
        let accent = tileAccent(for: tool)
        let isSelected = pickerSelectedTool == tool
        let isOtherSelected = pickerSelectedTool != nil && pickerSelectedTool != tool

        Button {
            // Selection animation : briefly highlight the tapped tile + fade
            // the others before propagating to viewModel.selectTool. The
            // resulting activeTool change flips `shouldShowEmptyStateLargePicker`
            // to false and the outer spring animates the picker out, revealing
            // the compact toolbar + active panel beneath. ~220ms total before
            // the swap fires so the highlight is perceivable.
            HapticFeedback.medium()
            withAnimation(.spring(response: 0.22, dampingFraction: 0.6)) {
                pickerSelectedTool = tool
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                // La timeline se présente en SHEET, jamais dans le band (C5) :
                // la tuile ouvre la sheet directement, sans selectTool ni band
                // (parité avec le chemin overflow ⋯ et les switch-chips).
                if tool == .timeline {
                    viewModel.isTimelineVisible = true
                    pickerSelectedTool = nil
                    return
                }
                // For the Text tile, jump straight into the inline editor :
                // viewModel.addText() itself spawns a fresh text + sets
                // selectedElementId + sets activeTool = .text, so calling
                // selectTool(.text) before it would toggle activeTool off
                // when addText then re-sets it back — and the @Published
                // re-render race could leave activeTool nil at the end.
                // Adopt the simpler invariant : addText is the sole entry
                // point for the .text tool when the slide has no text yet.
                if tool == .text,
                   viewModel.currentEffects.textObjects.isEmpty {
                    // Create the text and jump straight into the floating
                    // editor so the user can type immediately.
                    if let newText = viewModel.addText() {
                        viewModel.enterTextEditingMode(textId: newText.id)
                    }
                } else {
                    viewModel.selectTool(tool)
                }
                // Auto-open the band to the selected tool's category + panel
                // so controls appear immediately when the empty-state picker
                // transitions out. Without this, the band stayed .hidden and
                // the user had to manually tap a FAB to reveal controls.
                // (Le dessin s'ouvre lui aussi sur son panneau : la LISTE des
                // traits — le plein écran n'arrive qu'au choix d'un pinceau.)
                bandStateMachine.tapFAB(specialCategory ?? tool.bandCategory)
                bandStateMachine.tapTile(tool)
                pickerSelectedTool = nil
            }
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(accent.opacity(isSelected ? 0.55 : 0.30))
                        .frame(width: 44, height: 44)
                    Image(systemName: icon)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(accent)
                }

                VStack(alignment: .leading, spacing: 2) {
                    // Couleur adaptée au mode système — sur fond pastel clair
                    // le blanc sur clair était illisible. On utilise indigo950
                    // en light mode (contraste sur pastel) et blanc en dark.
                    Text(title)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(colorScheme == .dark ? .white : MeeshyColors.indigo950)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor((colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.75))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .frame(height: 72)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    // Uniform pastel tint matching the tile's accent — replaces
                    // the previous .ultraThinMaterial gray fill so each tile
                    // reads as its own color instead of a generic glass card.
                    .fill(accent.opacity(0.20))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(accent.opacity(isSelected ? 0.75 : 0.40), lineWidth: isSelected ? 2 : 1)
                    )
            )
            .shadow(color: accent.opacity(isSelected ? 0.45 : 0), radius: 14, y: 4)
            .scaleEffect(isSelected ? 1.05 : 1.0)
            .opacity(isOtherSelected ? 0.30 : 1.0)
            // Outer padding gives the scale-up animation room to breathe
            // without being clipped by the grid cell — without it, the
            // selected tile's enlarged corners touch neighbouring tiles
            // and shadow gets cropped.
            .padding(6)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(title)
        .accessibilityHint(subtitle)
    }

    // MARK: - Canvas + Drawing Layer (Task 2.18)

    /// CALayer-based canvas + drawing overlay + viewport transform/gestures
    /// + loading + zoom-reset overlays. Extracted so the SwiftUI type-checker
    /// doesn't time out on the parent body.
    @ViewBuilder
    var canvasComposerLayer: some View {
        // **Parité 9:16 composer ↔ reader / preview / export (2026-06-01).**
        // Le canvas d'édition était auparavant plein écran (`.ignoresSafeArea()`
        // sans contrainte de ratio), donc plus haut que 9:16 sur la plupart des
        // iPhone (ex. 402×874 sur iPhone 16 Pro). Le reader, lui, contraint le
        // canvas à 9:16 (402×714). Comme `StoryRenderer` projette en design→écran
        // sur la largeur (`scaleFactor = width/1080`), texte/média round-trippaient
        // (même largeur) mais : (1) le **dessin** (projection bounds non-uniforme
        // `1920/bounds.height`, cf. `StrokeCaptureLayer`) se compressait du ratio
        // `714/874` au reader et se détachait du texte qu'il entourait ; (2) le
        // contenu placé dans la hauteur excédentaire du composer était rogné par
        // le reader 9:16. On contraint donc le canvas à `aspectFitSize` (source de
        // vérité partagée avec le reader), centré dans la zone disponible — les
        // bandes letterbox haut/bas accueillent la top bar et le toolbar flottant.
        GeometryReader { proxy in
            // Le canvas garde des bounds intrinsèques 9:16 FIXES (`aspectFitSize` du
            // viewport PLEIN) — on n'anime JAMAIS la frame de la
            // `UIViewRepresentable` (sinon `layoutSubviews → rebuildLayers()` à
            // chaque frame = tempête perf). Le placement « cardé au-dessus de la
            // sheet » est rendu UNIQUEMENT par le container SwiftUI qui applique
            // `scaleEffect`/`offset`/`clipShape` calculés par `StoryCanvasFraming`.
            // La sheet (band/dessin/éditeur texte) est épinglée en bas ; le canvas
            // se rétracte au-dessus d'elle (`bottomInset = presentedSheetHeight`)
            // au lieu de la chevaucher (ancienne Option A).
            // BUG-4 (C-DIR4) : ne réserver la hauteur du header QUE s'il est
            // visible. Depuis C-DIR2 le header est masqué pendant l'édition —
            // garder ses 59 pt réservés faisait démarrer la carte cardée sous
            // un header FANTÔME (bande noire en haut, perçue « canvas coupé »,
            // capture user). Header caché → la carte monte sous la status bar.
            let headerInset = showTopBar
                ? max(proxy.safeAreaInsets.top, 59) + 12
                : proxy.safeAreaInsets.top + 12
            // Marge basse minimale même sheet repliée → la carte reste détachée du bas du
            // viewport (et de la poignée), sinon elle touchait quasi le bord en collapse.
            let bottomInset = max(presentedSheetHeight, 16) + max(proxy.safeAreaInsets.bottom, 0)
            // « L'import de l'image de fond impose le cadre et forme du Canvas » :
            // un fond paysage bascule le ratio en 16:9 (`currentCanvasRatio`), sinon
            // le canvas reste vertical 9:16 par défaut.
            let canvasRatio = viewModel.currentCanvasRatio
            let framing = StoryCanvasFraming.resolve(.init(
                viewport: proxy.size,
                headerInset: headerInset,
                bottomInset: bottomInset,
                // Marge latérale : la carte canvas reste toujours détachée des bords du
                // viewport (spec user 2026-06-02 « une marge suffisante pour être distingué
                // du viewport »). Le DESSIN n'est plus concerné : il ne carde plus
                // (mode immersif 2026-07-11, canvas plein écran).
                sideInset: 14,
                state: canvasIsCarded ? .carded : .free,
                cardedCornerRadius: 22,
                // Canvas PAYSAGE (16:9) : court, il laisse du mou vertical dans la
                // région réduite → `.top` le colle sous le header (« l'horizontal
                // bouge entièrement vers le haut »). PORTRAIT (9:16) : scale pour
                // remplir la région → `.center` (le mou est nul, aucune différence).
                verticalAlignment: canvasRatio > 1 ? .top : .center,
                canvasRatio: canvasRatio))
            let fit = CanvasGeometry.aspectFitSize(in: proxy.size, ratio: canvasRatio)
            // Rayon compensé par `framing.scale` : la carte est rendue à sa taille
            // intrinsèque `fit` PUIS réduite par `.scaleEffect(framing.scale)`, donc
            // un rayon UIKit de `cornerRadius / scale` atterrit à ~22pt à l'écran.
            // La rondeur doit vivre sur le layer UIKit : le `.clipShape` SwiftUI
            // ci-dessous ne masque pas l'arbre CALayer embarqué.
            canvasCore(cornerRadius: framing.scale > 0 ? framing.cornerRadius / framing.scale : 0)
                .frame(width: fit.width, height: fit.height)
                .scaleEffect(viewModel.canvasScale * viewportPinchDelta)
                .offset(
                    x: viewModel.canvasOffset.width + viewportDragDelta.width
                        + drawingViewportPanDelta.width,
                    y: viewModel.canvasOffset.height + viewportDragDelta.height
                        + drawingViewportPanDelta.height
                )
                // Le pinch viewport (zoom canvas) est maintenant un pinch 3 doigts
                // géré par `ThreeFingerPinchGestureRecognizer` côté UIKit, routé
                // via `onCanvasZoomScaleChanged`. Sans ça, l'ancien
                // `MagnificationGesture` SwiftUI 2-doigts firait en parallèle du
                // pinch d'élément UIKit → tout le canvas scalait.
                .gesture(isCanvasGestureEnabled && isPanEnabled ? viewportDragGesture : nil)
                .overlay { mediaLoadingOverlay }
                .overlay(alignment: .topTrailing) { canvasZoomResetButton }
                .overlay(alignment: .leading) {
                    // Sélecteur de couche manipulable (« Arrière-plan » /
                    // « Premier plan ») — flanc GAUCHE, textes verticaux
                    // (directive user 2026-07-11), miroir de la colonne
                    // annuler/rétablir du flanc droit. Rotation -90° du rail :
                    // lecture de bas en haut, convention « dos de livre ».
                    // `fixedSize` fige la mesure horizontale naturelle avant
                    // rotation ; le frame carré sert d'ancre de centrage — le
                    // contenu tourné déborde symétriquement et reste TAPPABLE
                    // (directive user 2026-07-14 : les chips pilotent la
                    // manipulation).
                    CanvasLayerIndicator(layer: manipulationLayer)
                        .fixedSize()
                        .rotationEffect(.degrees(-90))
                        .frame(width: 24, height: 44)
                        .padding(.leading, 8)
                }
                // Contours du canvas : matérialisés en pointillé dès que le
                // fond ne remplit PAS tout le canvas (mode « fit », ou aucun
                // média de fond) — directive user 2026-07-14. Le rayon épouse
                // celui de `canvasCore` (compensé par `framing.scale`) pour
                // coller exactement au bord de la carte.
                .overlay {
                    canvasOutlineOverlay(
                        cornerRadius: framing.scale > 0 ? framing.cornerRadius / framing.scale : 0
                    )
                }
                // Mesure la frame globale du canvas 9:16 PRÉSENTÉE (post-scale) —
                // `canvasNaturalFrame` pilote l'évitement clavier `canvasEditShift`
                // qui projette `textObj.y * canvasNaturalFrame.height`. Attaché
                // AVANT le container transform pour rapporter le rect réellement
                // affiché (le canvas cardé), donc le calcul reste exact.
                .background(
                    GeometryReader { p in
                        Color.clear
                            .onAppear { canvasNaturalFrame = p.frame(in: .global) }
                            .adaptiveOnChange(of: p.frame(in: .global)) { _, f in
                                canvasNaturalFrame = f
                            }
                    }
                )
                // ── Container transform (A4) : placement « carte au-dessus de la
                // sheet ». Seules ces 3 modifications réagissent au carding ; les
                // bounds intrinsèques (`fit`) restent FIXES (jamais animées).
                .scaleEffect(framing.scale)
                .offset(framing.offset)
                .clipShape(RoundedRectangle(cornerRadius: framing.cornerRadius, style: .continuous))
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .center)
                .offset(y: -canvasEditShift)
                .animation(.spring(response: 0.32, dampingFraction: 0.85), value: framing)
                .animation(.spring(response: 0.32, dampingFraction: 0.85), value: canvasEditShift)
        }
        .ignoresSafeArea()
    }

    /// Fraction d'écran occupée par une sheet SYSTÈME partielle présentée
    /// au-dessus du canvas — sticker / vocal / transitions (`.medium` ≈ 0.5),
    /// timeline (`.fraction(0.45)`). `nil` si aucune. Exclut l'audience picker
    /// (`.large` par défaut) et les `.fullScreenCover` (éditeurs) : ils couvrent
    /// l'écran, le canvas derrière n'a pas à rester visible.
    var presentedSystemSheetFraction: CGFloat? {
        if viewModel.isTimelineVisible { return 0.45 }
        if showStickerPicker || showVoiceRecorderSheet || showTransitionSheet { return 0.5 }
        return nil
    }

    /// Vrai dès qu'un panneau réduit la zone visible : band d'outils déployée,
    /// éditeur texte (clavier), OU une sheet système partielle (timeline / sticker /
    /// vocal / transitions). Le canvas se carde alors et scale pour rester
    /// ENTIÈREMENT visible AU-DESSUS (plus de bas masqué / débordement). L'état AU
    /// REPOS (FABs flottants, band `.hidden`) et le dessin immersif restent PLEIN
    /// écran — les FABs/bulles flottent par-dessus. Cf. `StoryCanvasFraming.isCarded`.
    var canvasIsCarded: Bool {
        let bandPresent = bandStateMachine.state != .hidden
        let drawingActive = viewModel.drawingEditingMode.isActive
        let textActive = viewModel.textEditingMode != .inactive
        if StoryCanvasFraming.isCarded(
            bandPresent: bandPresent,
            drawingActive: drawingActive,
            textActive: textActive
        ) {
            return true
        }
        return presentedSystemSheetFraction != nil
    }

    /// Hauteur (en points) de la présentation active, telle que le canvas doit la
    /// réserver en bas pour scaler ENTIÈREMENT au-dessus d'elle. Max des sources :
    /// éditeur texte → `keyboardHeight + 132` (barre bulles) ; band déployée →
    /// `measuredBottomBandHeight` (hauteur RÉELLE mesurée de `ComposerBottomBand`,
    /// content-driven — `composerBandHeight` reste un plancher tant que la 1re mesure
    /// n'a pas atterri) ; sheet système → `fraction × écran`. Le cap garantit qu'il
    /// reste toujours ≥ ~30 % d'écran pour le canvas (jamais écrasé à zéro → sinon le
    /// solver retombe en plein écran = bas de nouveau masqué). Hors carding → `0`.
    var presentedSheetHeight: CGFloat {
        guard canvasIsCarded else { return 0 }
        let cap = cappedSheetMaxHeight(screenHeight: composerScreenHeight)
        var height: CGFloat = 0
        if viewModel.textEditingMode != .inactive {
            height = max(height, keyboardHeight + 132)
        }
        if bandStateMachine.state != .hidden {
            height = max(height, max(composerBandHeight, measuredBottomBandHeight))
        }
        if let fraction = presentedSystemSheetFraction {
            height = max(height, composerScreenHeight * fraction)
        }
        return min(cap, height)
    }

    /// Plafond de hauteur réservée : ~70 % de l'écran. Assez haut pour couvrir
    /// l'empreinte RÉELLE du clavier (`keyboardHeight + 132` ≈ 0.55–0.58 H) et les
    /// détents `.medium` (~0.5 H) SANS les tronquer — l'ancien plafond 0.42 H
    /// laissait le bas du canvas sous le clavier / la sheet. Le reste (~30 %) suffit
    /// pour que le canvas cardé reste une carte pleinement visible.
    func cappedSheetMaxHeight(screenHeight: CGFloat) -> CGFloat {
        screenHeight * 0.70
    }

    /// Hauteur de la fenêtre active (et non `UIScreen.main.bounds`) — identique au
    /// calcul de `recomputeCanvasShift`, pour respecter split-screen / Stage Manager.
    var composerScreenHeight: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first(where: { $0.isKeyWindow })?.bounds.height
            ?? UIScreen.main.bounds.height
    }

    /// Liseré pointillé du bord du canvas, visible uniquement quand le fond ne
    /// couvre pas toute la surface (letterbox « fit », ou aucun média de fond)
    /// et hors mode dessin plein écran. Blanc translucide + ombre douce pour
    /// rester lisible sur fond clair comme sombre, sans jamais capturer les
    /// gestes (`allowsHitTesting(false)`).
    @ViewBuilder
    func canvasOutlineOverlay(cornerRadius: CGFloat) -> some View {
        if !viewModel.backgroundFillsCanvas && !viewModel.drawingEditingMode.isActive {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(Color.white.opacity(0.7),
                              style: StrokeStyle(lineWidth: 1.5, dash: [7, 5]))
                .shadow(color: .black.opacity(0.3), radius: 1)
                .allowsHitTesting(false)
                .transition(.opacity)
        }
    }

    @ViewBuilder
    func canvasCore(cornerRadius: CGFloat) -> some View {
        StoryComposerCanvasView(
            slide: $viewModel.currentSlide,
            onItemTapped: { id, kind in
                // Tap simple = sélection. Le canvas a déjà ramené l'élément
                // touché au premier plan. Le double-tap est réservé à
                // l'édition dédiée (overlay texte / éditeur d'image).
                HapticFeedback.light()
                viewModel.selectedElementId = id
                switch kind {
                case .text:
                    // Tap on a text → open the floating text edit overlay.
                    viewModel.enterTextEditingMode(textId: id)
                case .media:
                    // Tap simple sur un média : sélection seule. Le canvas
                    // l'a remonté au premier plan et `selectedElementId` est
                    // posé ci-dessus. L'éditeur d'image plein écran s'ouvre
                    // au double-tap.
                    break
                case .sticker:
                    break
                }
            },
            onItemDoubleTapped: { id, kind in
                HapticFeedback.medium()
                viewModel.selectedElementId = id
                switch kind {
                case .text:
                    // Double-tap on a text behaves like a single tap —
                    // opens the floating text edit overlay (idempotent).
                    viewModel.enterTextEditingMode(textId: id)
                case .media:
                    // Open dedicated full-screen media editor (image crop / video editor)
                    openMediaEditor(elementId: id)
                case .sticker:
                    break
                }
            },
            onItemDuplicated: { oldId, newId, kind in
                // Context-menu "Dupliquer" path mutates the slide directly inside
                // StoryCanvasUIView, but the ephemeral preview caches (loadedImages /
                // loadedVideoURLs) live on the viewModel. Mirror them under the new
                // UUID so the duplicated row shows its thumbnail immediately and
                // CALayer media rendering picks it up on the next rebuild.
                if kind == .media {
                    if let img = viewModel.loadedImages[oldId] {
                        viewModel.loadedImages[newId] = img
                    }
                    if let url = viewModel.loadedVideoURLs[oldId] {
                        viewModel.loadedVideoURLs[newId] = url
                    }
                    // Captions duplicate together with the video — sinon le
                    // clone perdrait ses sous-titres et l'utilisateur devrait
                    // re-transcrire alors qu'il duplique exprès.
                    if let captions = viewModel.loadedVideoCaptions[oldId] {
                        viewModel.loadedVideoCaptions[newId] = captions
                    }
                }
            },
            editingTextId: viewModel.textEditingMode.activeTextId,
            onInlineTextChanged: { id, str in
                guard let i = viewModel.currentEffects.textObjects.firstIndex(where: { $0.id == id })
                else { return }
                var effects = viewModel.currentEffects
                effects.textObjects[i].text = str
                viewModel.currentEffects = effects
            },
            onInlineTextEditEnded: { _ in
                viewModel.exitTextEditingMode()
            },
            onManipulationLayerChanged: { layer in
                manipulationLayer = layer
            },
            onCanvasZoomScaleChanged: { scale, state in
                // Pinch 3-doigts piloté par UIKit (cf. `ThreeFingerPinchGestureRecognizer`).
                // On remplace l'ancien `MagnificationGesture` SwiftUI 2-doigts
                // qui firait en parallèle du pinch d'élément et faisait scaler
                // tout le canvas en même temps que l'élément.
                switch state {
                case .began, .changed:
                    viewportPinchDelta = scale
                case .ended:
                    // Clamp + snap à l'identité (C4) : un relâcher quasi-1.0
                    // redevient EXACTEMENT 1.0 — sans ça, isCanvasZoomed
                    // (comparaison stricte) gardait TopBar cachée + bouton
                    // reset affiché sur un canvas visuellement à l'échelle 1.
                    let newScale = CanvasViewportZoomPolicy.settledScale(
                        current: viewModel.canvasScale,
                        gestureScale: scale
                    )
                    withAnimation(.spring(response: 0.2)) {
                        viewModel.canvasScale = newScale
                        if newScale <= 1.0 { viewModel.canvasOffset = .zero }
                    }
                    viewportPinchDelta = 1.0
                case .cancelled, .failed:
                    viewportPinchDelta = 1.0
                default:
                    break
                }
            },
            onBackgroundTapped: {
                withAnimation(.spring(response: 0.3)) {
                    areFabsVisible.toggle()
                }
            },
            onBackgroundTransformChanged: { transform in
                viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform(
                    scale: transform.scale ?? 1.0,
                    offsetX: transform.offsetX ?? 0,
                    offsetY: transform.offsetY ?? 0,
                    rotation: transform.rotation ?? 0,
                    videoFitMode: transform.videoFitMode
                )
                viewModel.saveBackgroundTransform()
            },
            // C4 — sortie gestuelle du zoom : double-tap fond en état zoomé
            // = reset viewport (même action que canvasZoomResetButton, qui
            // reste visible — invariant « ne jamais retirer d'affordance »).
            isViewportZoomed: viewModel.isCanvasZoomed,
            onViewportZoomResetRequested: {
                withAnimation(.spring(response: 0.3)) {
                    viewModel.resetCanvasZoom()
                }
            },
            // Quand le drawing overlay est actif, le canvas doit supprimer
            // son drawingLayer persisté — sinon double rendu (ancien drawing
            // au mauvais endroit dans le design space + nouveau drawing live
            // du PKCanvasView en bounds space). Bug "écrit en double", 2026-05-27.
            isDrawingOverlayActive: isImmersiveDrawingSurface,
            // Pont vers `StoryCanvasUIView.readerContext.imageCache` —
            // `StoryMediaLayer.configureImage` consulte d'abord ce cache
            // (clé = media.id) avant le file:// path, donc le main canvas
            // reflète immédiatement les éditions image (bug 2026-05-27).
            // La version sert de cookie au Coordinator pour ne déclencher
            // un rebuild qu'aux mutations utiles.
            loadedImages: viewModel.loadedImages,
            loadedImagesVersion: viewModel.loadedImagesVersion,
            loadedAudioURLs: viewModel.loadedAudioURLs,
            canvasCornerRadius: cornerRadius,
            timelineBridge: viewModel.canvasTimelineBridge
        )
        .allowsHitTesting(!isImmersiveDrawingSurface)
        .overlay {
            if isImmersiveDrawingSurface {
                // Refonte dessin (2026-05-30) : capture single-stroke (PencilKit) +
                // rendu live des traits éditables (avec halo sélection). Le canvas
                // sous-jacent suppress son propre drawingLayer pendant ce temps
                // (`suppressDrawingOverlay`), donc pas de double rendu.
                ZStack {
                    MeeshyStrokeCanvas(
                        strokes: viewModel.drawingStrokes,
                        selectedId: viewModel.drawingEditingMode.selectedStrokeId
                    )
                    .equatable()
                    // Aperçu WYSIWYG du trait en cours (C4) : rendu PAR-DESSUS les
                    // traits commités, par notre moteur largeur-variable, donc identique
                    // au trait finalement commité au lift-up.
                    if let preview = viewModel.activeStrokePreview {
                        MeeshyStrokeCanvas(strokes: [preview], selectedId: nil)
                    }
                    StrokeCaptureLayer(
                        activeTool: viewModel.activeBrushTool,
                        activeColorHex: DrawingEditToolOptions.hex(of: viewModel.drawingColor),
                        activeWidth: Double(viewModel.drawingWidth),
                        activeSmoothing: viewModel.activeBrushSmoothing,
                        onStrokeInProgress: { viewModel.activeStrokePreview = $0 },
                        onStrokeCommitted: { stroke in
                            // `commitStroke` ajoute le trait ET vide la pile de redo
                            // (un nouveau trait rend le « rétablir » caduc).
                            viewModel.commitStroke(stroke)
                            viewModel.activeStrokePreview = nil
                        },
                        onEraseGesture: { points in
                            eraseStrokes(near: points)
                            viewModel.activeStrokePreview = nil
                        },
                        onViewportPinch: { scale, translation, state in
                            // Zoom/pan d'inspection PENDANT le dessin (pinch
                            // 2 doigts sur la couche de capture) — même
                            // pipeline que le pinch 3 doigts hors dessin
                            // (`onCanvasZoomScaleChanged` ci-dessus). Le zoom
                            // est ramené à 1 en sortant du mode
                            // (`exitDrawingEditingMode`).
                            switch state {
                            case .began, .changed:
                                viewportPinchDelta = scale
                                drawingViewportPanDelta = translation
                            case .ended:
                                let newScale = CanvasViewportZoomPolicy.settledScale(
                                    current: viewModel.canvasScale,
                                    gestureScale: scale
                                )
                                withAnimation(.spring(response: 0.2)) {
                                    viewModel.canvasScale = newScale
                                    if newScale <= 1.0 {
                                        viewModel.canvasOffset = .zero
                                    } else {
                                        viewModel.canvasOffset = CGSize(
                                            width: viewModel.canvasOffset.width + translation.width,
                                            height: viewModel.canvasOffset.height + translation.height
                                        )
                                    }
                                }
                                viewportPinchDelta = 1.0
                                drawingViewportPanDelta = .zero
                            default:
                                viewportPinchDelta = 1.0
                                drawingViewportPanDelta = .zero
                            }
                        }
                    )
                }
            }
        }
        .overlay { audioForegroundOverlay }
        .overlay { videoMuteOverlay }
    }

    /// Chip glass posé sur le canvas pour chaque audio foreground (i.e.
    /// `isBackground != true`). La position vient du modèle (`x`/`y`
    /// normalisés) ; le drag local est éphémère et ne pousse que sur release
    /// pour éviter le scintillement des vues observant le VM. L'icône absente
    /// venait du fait que `StoryAudioPlayerView` n'était wired nulle part —
    /// ce chip est plus léger et dédié à la composition.
    @ViewBuilder
    var audioForegroundOverlay: some View {
        if !viewModel.isDrawingActive {
            GeometryReader { geo in
                ForEach(foregroundAudioBindings, id: \.wrappedValue.id) { binding in
                    AudioForegroundChip(
                        audioObject: binding,
                        canvasSize: geo.size,
                        mode: .composer,
                        isSelected: viewModel.selectedElementId == binding.wrappedValue.id,
                        isUserMuted: binding.wrappedValue.volume <= 0,
                        onDragEnd: { HapticFeedback.light() },
                        onTap: {
                            HapticFeedback.light()
                            viewModel.selectedElementId = binding.wrappedValue.id
                        },
                        onToggleMute: {
                            HapticFeedback.light()
                            var obj = binding.wrappedValue
                            obj.volume = obj.volume > 0 ? 0 : 1
                            binding.wrappedValue = obj
                        }
                    )
                }
            }
        }
    }

    /// Bouton mute (icône au touché) posé sur chaque vidéo foreground du canvas
    /// d'édition. Tap → coupe / réactive le son de la vidéo (persisté via le
    /// `volume` du modèle : 0 = muet). L'aperçu live, le reader et l'export
    /// respectent tous ce `volume`. Posé dans le MÊME espace de coordonnées que
    /// les chips audio (overlay sur le canvas) pour un placement cohérent.
    @ViewBuilder
    var videoMuteOverlay: some View {
        if !viewModel.isDrawingActive {
            GeometryReader { geo in
                ForEach(foregroundVideoBindings, id: \.wrappedValue.id) { binding in
                    videoMuteButton(for: binding, canvasSize: geo.size)
                }
            }
        }
    }

    func videoMuteButton(for binding: Binding<StoryMediaObject>,
                                 canvasSize: CGSize) -> some View {
        let media = binding.wrappedValue
        let muted = media.volume <= 0
        // Coin haut-droit de la vidéo : centre normalisé + demi-taille projetée
        // (même convention que `StoryMediaLayer.configure`). La rotation n'est
        // pas appliquée à l'icône (affordance, tolérance suffisante).
        let scaleFactor = canvasSize.width / CanvasGeometry.designWidth
        let base = StoryMediaLayer.baseMediaDesignSize(aspectRatio: media.aspectRatio)
        let halfW = base.width * CGFloat(media.scale) * scaleFactor / 2
        let halfH = base.height * CGFloat(media.scale) * scaleFactor / 2
        let cx = CGFloat(media.x) * canvasSize.width
        let cy = CGFloat(media.y) * canvasSize.height
        let inset: CGFloat = 18
        let px = min(canvasSize.width - inset, max(inset, cx + halfW - inset))
        let py = min(canvasSize.height - inset, max(inset, cy - halfH + inset))

        return Button {
            HapticFeedback.light()
            var obj = binding.wrappedValue
            obj.volume = obj.volume > 0 ? 0 : 1
            binding.wrappedValue = obj
        } label: {
            Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 30, height: 30)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .position(x: px, y: py)
        .accessibilityLabel(muted ? "Activer le son de la vidéo" : "Couper le son de la vidéo")
    }

    /// Bindings vers chaque vidéo foreground (`isBackground == false`, kind
    /// `.video`) de la slide courante — pour le bouton mute. Écrit en retour
    /// dans `viewModel.currentEffects`, ce qui resync la slide et l'aperçu.
    var foregroundVideoBindings: [Binding<StoryMediaObject>] {
        let medias = viewModel.currentEffects.mediaObjects ?? []
        return medias.enumerated().compactMap { idx, obj -> Binding<StoryMediaObject>? in
            guard obj.isBackground == false, obj.kind == .video else { return nil }
            return Binding<StoryMediaObject>(
                get: {
                    let list = viewModel.currentEffects.mediaObjects ?? []
                    return list.indices.contains(idx) ? list[idx] : obj
                },
                set: { newValue in
                    var effects = viewModel.currentEffects
                    guard var list = effects.mediaObjects,
                          list.indices.contains(idx) else { return }
                    list[idx] = newValue
                    effects.mediaObjects = list
                    viewModel.currentEffects = effects
                }
            )
        }
    }

    /// Bindings vers chaque `StoryAudioPlayerObject` foreground de la slide
    /// courante. Le binding écrit en retour dans `viewModel.currentEffects`
    /// — ce qui resync la slide via `currentSlide.didSet` et propage au canvas.
    var foregroundAudioBindings: [Binding<StoryAudioPlayerObject>] {
        let audios = viewModel.currentEffects.audioPlayerObjects ?? []
        return audios.enumerated().compactMap { idx, obj -> Binding<StoryAudioPlayerObject>? in
            guard obj.isBackground != true else { return nil }
            return Binding<StoryAudioPlayerObject>(
                get: {
                    let list = viewModel.currentEffects.audioPlayerObjects ?? []
                    return list.indices.contains(idx) ? list[idx] : obj
                },
                set: { newValue in
                    var effects = viewModel.currentEffects
                    guard var list = effects.audioPlayerObjects,
                          list.indices.contains(idx) else { return }
                    list[idx] = newValue
                    effects.audioPlayerObjects = list
                    viewModel.currentEffects = effects
                }
            )
        }
    }

    @ViewBuilder
    var mediaLoadingOverlay: some View {
        if isLoadingMedia {
            Color.black.opacity(0.4)
                .overlay {
                    VStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .stroke(Color.white.opacity(0.2), lineWidth: 4)
                                .frame(width: 56, height: 56)
                            Circle()
                                .trim(from: 0, to: mediaLoadProgress)
                                .stroke(MeeshyColors.brandGradient, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                                .frame(width: 56, height: 56)
                                .rotationEffect(.degrees(-90))
                                .animation(.easeInOut(duration: 0.3), value: mediaLoadProgress)
                            Text("\(Int(mediaLoadProgress * 100))%")
                                .font(.system(size: 13, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                        }
                        if !mediaLoadLabel.isEmpty {
                            Text(mediaLoadLabel)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white.opacity(0.8))
                        }
                    }
                }
                .allowsHitTesting(false)
                .transition(.opacity)
        }
    }

    @ViewBuilder
    var canvasZoomResetButton: some View {
        if viewModel.isCanvasZoomed {
            Button {
                withAnimation(.spring(response: 0.3)) {
                    viewModel.resetCanvasZoom()
                }
            } label: {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(.black.opacity(0.5)))
            }
            .padding(.top, showTopBar ? 70 : 16)
            .padding(.trailing, 12)
            .transition(.scale.combined(with: .opacity))
            .animation(.spring(response: 0.3), value: showTopBar)
        }
    }

    @ViewBuilder
    var timelineSection: some View {
        // V2 timeline editor is the product — no feature-flag gating since the
        // app has not yet shipped to a userbase that requires backwards-compat.
        TimelineSheetContent(composer: viewModel)
    }

    var safeAreaBottomInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first?.safeAreaInsets.bottom ?? 0
    }

    func textObjectBinding(for id: String) -> Binding<StoryTextObject>? {
        guard viewModel.currentEffects.textObjects.contains(where: { $0.id == id }) else { return nil }
        return Binding(
            get: {
                viewModel.currentEffects.textObjects.first(where: { $0.id == id })
                    ?? StoryTextObject(text: "")
            },
            set: { newObj in
                var effects = viewModel.currentEffects
                if let i = effects.textObjects.firstIndex(where: { $0.id == id }) {
                    effects.textObjects[i] = newObj
                    viewModel.currentEffects = effects
                }
            }
        )
    }

    /// Gomme par hit-test : supprime tout trait dont un point de rendu (espace
    /// design) tombe dans le rayon du geste de gomme. Pas d'effacement pixel-par-pixel
    /// (le modèle est vectoriel) — on supprime le trait entier croisé, UX acceptable
    /// (cf. Risque #2 du plan).
    func eraseStrokes(near erasePoints: [CGPoint]) {
        guard !erasePoints.isEmpty else { return }
        let eraseRadius: CGFloat = 28  // design px
        let survivors = viewModel.drawingStrokes.filter { stroke in
            let reach = CGFloat(stroke.width) / 2 + eraseRadius
            let points = StrokePathBuilder.renderPoints(for: stroke)
            for sp in points {
                for ep in erasePoints where hypot(sp.x - ep.x, sp.y - ep.y) <= reach {
                    return false
                }
            }
            return true
        }
        if survivors.count != viewModel.drawingStrokes.count {
            viewModel.drawingStrokes = survivors
            HapticFeedback.light()
        }
    }
}
