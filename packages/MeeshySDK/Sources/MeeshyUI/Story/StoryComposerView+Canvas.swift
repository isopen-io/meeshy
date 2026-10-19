import SwiftUI
import UIKit
import os
import Combine
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
            StoryCanvasLetterbox(
                backgroundImage: composerLetterboxImage,
                backgroundColor: viewModel.backgroundColor,
                isCarded: canvasIsCarded,
                acceptsTaps: !isImmersiveDrawingSurface,
                onTap: { handleCanvasBackgroundTap() }
            )

            // Canvas core (CALayer) + drawing overlay + viewport modifiers,
            // extracted into `canvasComposerLayer` so the SwiftUI type-checker
            // doesn't time out on this body's full modifier chain.
            canvasComposerLayer

            // Amorces de page blanche — DANS le canvas, sous le chrome. Elles ne
            // prélèvent aucune hauteur : le canvas reste plein écran au repos.
            StoryComposerBlankCanvasStarters(
                offersContentStarters: offersContentStarters,
                canAddMedia: viewModel.canAddMedia,
                recentAsset: recentCameraRollAsset,
                fgMediaItem: $fgMediaItem,
                onBackgroundTap: { handleCanvasBackgroundTap() },
                onStartText: { startTextCompositionOnBlankCanvas() },
                onOpenCamera: { showCameraCapture = true },
                onPasteItems: { posePastedItems($0) },
                onRequestRecentAccess: { requestRecentCameraRollAccess() },
                onAddRecentAsset: { addRecentCameraRollAsset($0) }
            )
            .environment(\.colorScheme, canvasChromeScheme)

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

            // Bottom: toolbar + active panel. Monté INCONDITIONNELLEMENT depuis
            // S5 — l'ancienne grille d'état vide (6 tuiles opaques sur 47 % de la
            // hauteur) qui s'y substituait a disparu : une page blanche montre le
            // même rail d'outils que le reste du temps, donc rien à réapprendre.
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
            .padding(.trailing, MeeshySpacing.lg)
            .padding(.bottom, 88)
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: showTopBar)
            .allowsHitTesting(showTopBar)
            .environment(\.colorScheme, canvasChromeScheme)

            // Floating text edit overlay — sits above every composer control.
            // Empty view when `textEditingMode == .inactive`.
            StoryTextEditToolbar(
                viewModel: viewModel,
                onControlsTopYChange: { measuredTextToolbarTopY = $0 },
                onTopBarBottomYChange: { measuredTextTopBarBottomY = $0 }
            )
                .padding(.bottom, keyboardHeight)
                .environment(\.colorScheme, canvasChromeScheme)

            // E3 (#3888) — la langue par élément pour les objets NON-TEXTE.
            // Apparaît quand un média/audio/sticker/lieu est sélectionné ; le
            // texte garde sa pastille dans son éditeur inline.
            StoryElementLanguageBar(viewModel: viewModel)
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
                    bandStateMachine.showChrome()
                }
            }
            // Switching BETWEEN tabs of an already-open tool sheet (the
            // ComposerToolPanelHost chip row) goes through `selectTool(_:)`,
            // which changes `activeTool` but never touches `isTimelineVisible`
            // — so the `isTimelineVisible` trigger below never re-fires when
            // re-visiting Timeline after changing something (e.g. the opening
            // effect) on another tab first. Reload here on every genuine
            // transition INTO `.timeline` so the chrome lane never shows a
            // stale snapshot.
            if newTool == .timeline {
                viewModel.loadCurrentSlideIntoTimeline()
            }
        }
        // Le band s'ouvre à la hauteur de l'outil, pas à celle du précédent.
        // `composerBandHeight` (état du grabber, semé à 280) était appliqué tel
        // quel à TOUS les panneaux via `panelHeightOverride` : la timeline, qui
        // demande 392 pt pour ses opérations + transport + scrubber + 3 pistes
        // + footer, se retrouvait dans une fenêtre de 230 pt et son bas partait
        // hors de l'écran (constat user 2026-07-30 « des contrôleurs coupés »).
        .adaptiveOnChange(of: activeBandTool) { _, tool in
            guard let tool else { return }
            composerBandHeight = Self.bandHeight(for: tool)
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
            // Dernière photo de la pellicule : résolue UNE fois, app-side. Sans
            // fournisseur (défaut) ou sans autorisation, elle reste `nil` et
            // l'amorce retombe sur « Galerie » — jamais de vignette vide.
            loadRecentCameraRollAsset()
        }
        .adaptiveOnChange(of: viewModel.currentSlideIndex) { _, _ in
            viewModel.loadCurrentSlideIntoTimeline()
            // `reset()` restaure aussi le chrome : changer de slide efface tout,
            // y compris un masquage volontaire.
            bandStateMachine.reset()
            // A text edit overlay open on the previous slide references an
            // element that does not exist on the new one — close it.
            viewModel.exitTextEditingMode()
        }
        // Timeline sheet visibility is toggled from multiple entry points
        // (ComposerControlsLayer tile tap, TopBar overflow menu item, ...).
        // Rather than patching every call site individually (fragile — a new
        // entry point could silently miss the reload), react centrally here
        // whenever `isTimelineVisible` flips to true so the chrome lane always
        // reflects the live opening/closing effects instead of a stale snapshot.
        .adaptiveOnChange(of: viewModel.isTimelineVisible) { _, visible in
            if visible {
                viewModel.loadCurrentSlideIntoTimeline()
            }
        }
        .onDisappear {
            StoryMediaCoordinator.shared.deactivate()
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
        // La part de la fenêtre que le clavier RECOUVRE, pas la hauteur brute de sa trame : sur iPad le clavier
        // flotte, se scinde, ou passe sous une fenêtre Stage Manager. Détacher / recoller le clavier n'annonce
        // qu'un changement de trame — d'où l'écoute de `keyboardWillChangeFrame` en plus de l'apparition.
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .merge(with: NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification))) { note in
            let frame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey]
                as? NSValue)?.cgRectValue ?? .zero
            let lift = StoryKeyboardOverlap.height(keyboardEndFrame: frame,
                                                   windowFrame: WindowMetrics.activeWindowFrameInScreen,
                                                   current: keyboardHeight)
            guard lift != keyboardHeight else { return }
            keyboardHeight = lift
            if lift == 0 { canvasEditShift = 0 } else { recomputeCanvasShift() }
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
            ComposerControlsLayer(
                viewModel: viewModel,
                chrome: chromeContext,
                bandStateMachine: $bandStateMachine,
                selectedFilter: $selectedFilter,
                fgMediaItem: $fgMediaItem,
                showAudioDocumentPicker: $showAudioDocumentPicker,
                showVoiceRecorderSheet: $showVoiceRecorderSheet,
                showSoundLibrary: $showSoundLibrary,
                resizableBandHeight: $composerBandHeight,
                bandMinHeight: Self.composerBandMinHeight,
                bandMaxHeight: Self.composerBandMaxHeight,
                // Hauteur RÉELLE rendue de la band déployée (content-driven) —
                // réservée par `presentedSheetHeight` pour scaler le canvas
                // EXACTEMENT au-dessus (0 quand la band est repliée / FABs seuls,
                // état où le canvas reste plein écran).
                onBandHeightChange: { measuredBottomBandHeight = $0 },
                onBandTopYChange: { measuredBandTopY = $0 },
                onOpenMediaCrop: { id in openMediaEditor(elementId: id) },
                onDismissActivePanel: dismissActiveBandPanel,
                onOpenStickerPicker: stickerSheetRequest,
                onOpenLocationPicker: { showLocationPicker = true },
                onOpenMentionPicker: { showMentionPicker = true },
                // V3-4 — le store de collecte vient du composer, pas de la
                // couche : c'est le composer qui le relira au moment de
                // publier. Sans cette ligne la couche retombe sur le sien,
                // la saisie reste possible et la publication lit un objet vide.
                accessibilityStore: accessibilityStore
            )
        }
    }

    /// Un éditeur flottant plein-canvas est ouvert → le band compact standard
    /// est masqué et non-interactif. TEXTE : depuis toujours. DESSIN : en
    /// PLEIN ÉCRAN de tracé uniquement (user 2026-07-11 v2) — le mode liste
    /// garde le band visible (liste des traits).
    var isFloatingEditorActive: Bool {
        viewModel.textEditingMode != .inactive
            || viewModel.isDrawingImmersive
    }

    // `activeBandTool` a déménagé en `StoryComposerView+Chrome.swift` : il dérive
    // du contexte de chrome, seule résolution de l'état effectif du band.

    /// Hauteur d'ouverture du band pour `tool` : sa hauteur de conception,
    /// clampée dans les bornes du grabber.
    static func bandHeight(for tool: StoryToolMode) -> CGFloat {
        min(composerBandMaxHeight,
            max(composerBandMinHeight,
                ComposerToolPanelHost.defaultPanelHeight(for: tool)))
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
    /// user 2026-07-11 : indigo950 illisible sur bleu nuit). Délègue au VM,
    /// source unique partagée avec `ComposerControlsLayer`.
    var canvasChromeScheme: ColorScheme {
        viewModel.canvasChromeScheme
    }

    // MARK: - C5b — le collage

    /// C5b — pose ce que le collage a rendu. **Aucun pipeline neuf** : chaque
    /// famille emprunte le chemin d'insertion qui existe déjà, celui de la
    /// caméra pour l'image et la vidéo, celui de l'enregistrement pour le son.
    ///
    /// Le DOCUMENT n'arrive jamais ici : la scène de story n'héberge aucune
    /// pièce jointe, et c'est l'app qui l'annonce (règle O12). Le faire
    /// transiter par ce point l'obligerait à être jeté en silence.
    func posePastedItems(_ items: [StoryPastedItem]) {
        items.forEach { item in
            switch item {
            case .image(let image):
                addCapturedMedia(.photo(image))
            case .video(let url):
                addCapturedMedia(.video(url))
            case .audio(let url):
                addRecordingToBackground(url: url)
            case .text(let contenu):
                // **La destination du texte est une RÈGLE, pas un `if` ici**
                // (#4378) : « pourquoi mon texte est-il parti en description ? »
                // se répond en lisant `StoryPastePolicy`, pas en instrumentant
                // un écran.
                //
                // Le média, lui, n'a rien à décider à ce niveau : sa règle vit
                // déjà dans les chemins d'insertion (`shouldBeBackground`,
                // `ComposerAudioPlacement`), et la redoubler ici aurait donné
                // deux règles pour une question.
                switch StoryPastePolicy.placement(forText: contenu) {
                case .description(let texte):
                    viewModel.applyContentText(texte)
                case .textObject(let texte):
                    poseTextObject(texte)
                case nil:
                    break   // coller le vide n'est pas une erreur, c'est un geste sans matière
                }
            }
        }
    }

    /// Pose un objet texte PORTANT déjà son contenu.
    ///
    /// `addText()` crée un objet VIDE et ouvre l'éditeur — c'est le geste de
    /// l'auteur qui écrit. Un collage, lui, apporte son texte : le faire passer
    /// par l'éditeur obligerait l'auteur à valider ce qu'il vient de coller.
    /// L'objet est donc créé puis rempli par le même chemin que l'éditeur
    /// emprunte à la validation — jamais un second site de création.
    private func poseTextObject(_ contenu: String) {
        guard let objet = viewModel.addText() else { return }
        viewModel.updateTextContent(id: objet.id, text: contenu)
        viewModel.exitTextEditingMode()
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
            // Cadrage résolu par `StoryCanvasSheetRules.framing` : marges haute et basse,
            // alignement vertical et ratio y sont expliqués au point de la règle.
            let canvasRatio = viewModel.currentCanvasRatio
            let framing = StoryCanvasSheetRules.framing(
                viewport: proxy.size,
                safeAreaTop: proxy.safeAreaInsets.top,
                safeAreaBottom: proxy.safeAreaInsets.bottom,
                chromeAtTop: showTopBar,
                presentedSheetHeight: presentedSheetHeight,
                canvasRatio: canvasRatio,
                isCarded: canvasIsCarded,
                headerRowHeight: Self.headerRowHeight,
                sheetGap: Self.canvasSheetGap
            )
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
                    // Montés SEULEMENT là où leur override change réellement la
                    // couche manipulée (fond ET premier plan peuplés) : sur une
                    // slide à une seule couche, `resolveManipulationLayer` ignore
                    // l'override et les chips n'étaient que décoratifs.
                    if showsCanvasLayerIndicator {
                        CanvasLayerIndicator(layer: manipulationLayer)
                            .fixedSize()
                            .rotationEffect(.degrees(-90))
                            .frame(width: 24, height: 44)
                            .padding(.leading, MeeshySpacing.sm)
                            .transition(.opacity)
                    }
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.85),
                           value: showsCanvasLayerIndicator)
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
                .clipShape(RoundedRectangle(cornerRadius: framing.cornerRadius, style: .continuous))
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .center)
                // `.offset` APRÈS le `.frame(.center)` : sinon le recentrage du
                // frame absorbait le décalage vertical du framing et la carte
                // restait CENTRÉE — quand le sheet montait, sa moitié basse
                // passait sous le sheet (troncature dynamique, user 2026-07-20).
                // Appliqué après, l'offset déplace réellement la carte centrée.
                .offset(x: framing.offset.width, y: framing.offset.height - canvasEditShift)
                // Le suivi du framing est INSTANTANÉ (pas de spring) : pendant un
                // drag de resize du sheet, `framing` change à chaque frame ; une
                // animation ressort ne convergeait pas et la carte restait en
                // retard (tronquée). Le carding tap→ouverture reste fluide car
                // le sheet lui-même s'anime.
                .animation(.spring(response: 0.32, dampingFraction: 0.85), value: canvasEditShift)
        }
        .ignoresSafeArea()
    }

    /// Fraction d'écran occupée par une sheet SYSTÈME partielle présentée
    /// au-dessus du canvas — sticker / vocal / transitions (`.medium` ≈ 0.5).
    /// La timeline n'est plus une sheet système (2026-07-14, présentée inline
    /// dans le band comme les autres outils — cf. `canvasIsCarded`'s
    /// `timelineActive`). Exclut l'audience picker (`.large` par défaut) et
    /// les `.fullScreenCover` (éditeurs) : ils couvrent l'écran, le canvas
    /// derrière n'a pas à rester visible.
    var presentedSystemSheetFraction: CGFloat? {
        if showVoiceRecorderSheet || showTransitionSheet { return 0.5 }
        return nil
    }

    /// Vrai dès qu'un panneau réduit la zone visible : band d'outils déployée,
    /// éditeur texte (clavier), OU une sheet système partielle (timeline / sticker /
    /// vocal / transitions). Le canvas se carde alors et scale pour rester
    /// ENTIÈREMENT visible AU-DESSUS (plus de bas masqué / débordement). L'état AU
    /// REPOS (FABs flottants, band `.hidden`) et le dessin immersif restent PLEIN
    /// écran — les FABs/bulles flottent par-dessus. Cf. `StoryCanvasFraming.isCarded`.
    /// Hauteur de la rangée haute flottante — une pastille de 44 pt de cible.
    /// Nommée plutôt qu'écrite en littéral : elle sert à RÉSERVER de la place au
    /// canvas cardé, donc elle doit suivre la rangée si celle-ci grandit.
    static let headerRowHeight: CGFloat = 44

    var canvasIsCarded: Bool {
        StoryCanvasSheetRules.isCarded(
            isTextEditing: viewModel.textEditingMode != .inactive,
            effectiveBandIsHidden: chromeContext.isBandHidden,
            drawingActive: viewModel.drawingEditingMode.isActive,
            presentedSystemSheetFraction: presentedSystemSheetFraction
        )
    }

    /// Hauteur (en points) de la présentation active, telle que le canvas doit la
    /// réserver en bas pour scaler ENTIÈREMENT au-dessus d'elle. Max des sources :
    /// band déployée → `measuredBottomBandHeight` (hauteur RÉELLE mesurée de
    /// `ComposerBottomBand`, content-driven — `composerBandHeight` reste un plancher
    /// tant que la 1re mesure n'a pas atterri) ; sheet système → `fraction × écran`.
    /// L'éditeur texte n'y figure pas : il ne carde plus le canvas, la garde de tête
    /// retourne donc `0`. Le cap garantit qu'il reste toujours ≥ ~30 % d'écran pour le
    /// canvas (jamais écrasé à zéro → sinon le solver retombe en plein écran = bas de
    /// nouveau masqué). Hors carding → `0`.
    var presentedSheetHeight: CGFloat {
        StoryCanvasSheetRules.presentedSheetHeight(
            canvasIsCarded: canvasIsCarded,
            effectiveBandIsHidden: chromeContext.isBandHidden,
            measuredBandTopY: measuredBandTopY,
            measuredBottomBandHeight: measuredBottomBandHeight,
            composerBandHeight: composerBandHeight,
            presentedSystemSheetFraction: presentedSystemSheetFraction,
            composerScreenHeight: composerScreenHeight,
            hostBottomReservation: hostCanvasBottomReservation
        )
    }

    /// Petit espace (pt) laissé entre le BAS de la carte canvas et le haut du
    /// sheet d'édition — la carte ne doit pas être collée au sheet (user
    /// 2026-07-20). Ajouté au `bottomInset` du solveur de framing.
    static let canvasSheetGap: CGFloat = 14

    /// Bitmap du média de fond courant, source du flou de `StoryCanvasLetterbox`.
    /// `nil` quand le fond est une couleur/gradient (pas de média de fond chargé).
    var composerLetterboxImage: UIImage? {
        guard let bgId = viewModel.currentEffects.mediaObjects?
            .first(where: { $0.isBackground })?.id else { return nil }
        return viewModel.loadedImages[bgId]
    }

    /// Hauteur de la fenêtre qui PORTE le composer (publiée par sa racine) — pas la fenêtre clé, qui sous Stage
    /// Manager ou avec une fenêtre détachée peut être l'autre. `WindowMetrics` (scène au premier plan, fenêtre clé)
    /// n'est que le repli, avant la première mesure.
    var composerScreenHeight: CGFloat {
        SceneWindowSize.resolve(sceneWindowSize, fallback: WindowMetrics.windowSize).height
    }

    /// Ce qui DÉTACHE le canvas de son plateau, hors mode dessin plein écran.
    ///
    /// **Une OMBRE portée, plus un liseré (directive porteur 2026-08-28,
    /// #4124 : « le canvas sans bordure, juste un effet d'ombrage pour
    /// remarquer ses arrondis »).** Trois formes se sont succédé ici — trait
    /// pointillé, puis contour blanc solide (2026-08-27), puis ceci — et
    /// l'ombre est celle qui tient la promesse des deux autres sans en payer le
    /// prix : un liseré blanc à 55 % DESSINE une ligne qui n'appartient pas à la
    /// composition, et l'auteur la voit sur son aperçu alors que le lecteur ne
    /// la verra jamais. C'est la loi 6 prise au mot.
    ///
    /// L'ombre, elle, ne dessine rien SUR la carte : elle la décolle du fond, et
    /// les arrondis se lisent par le décrochage. Deux passes — une large et
    /// diffuse pour la profondeur, une courte et dense pour l'arête — parce
    /// qu'une seule ombre large laisse le bord flou sur un plateau de teinte
    /// proche, exactement le cas du letterbox, qui EST la couleur du fond.
    ///
    /// La condition `!backgroundFillsCanvas` reste : quand le fond couvre toute
    /// la carte, son propre bord la découpe déjà.
    @ViewBuilder
    func canvasOutlineOverlay(cornerRadius: CGFloat) -> some View {
        if !viewModel.backgroundFillsCanvas && !viewModel.drawingEditingMode.isActive {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(Color.clear)
                .shadow(color: .black.opacity(0.28), radius: 18, x: 0, y: 8)
                .shadow(color: .black.opacity(0.18), radius: 3, x: 0, y: 1)
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
                case .sticker, .place, .audio:
                    // Pastille de lieu ou de son : sélection seule (le canvas
                    // l'a remontée au premier plan). Elle se déplace,
                    // se redimensionne au doigt et se retire par le menu
                    // contextuel — rien à éditer au tap SIMPLE.
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
                case .sticker, .place, .audio:
                    // L'atelier n'ouvre pas d'éditeur audio : sa timeline porte
                    // déjà le rognage et le volume d'une piste. Le composer
                    // unifié, lui, le câble (#4671) — `editableKinds` est ce qui
                    // les distingue, pas ce `switch`.
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
                        // `registerLoadedImage` bump la version → le canvas reader se
                        // rafraîchit et stampe la vignette du clone tout de suite. Un
                        // simple `loadedImages[newId] = img` laissait le duplicata noir
                        // (reader périmé, même cause 2026-07-20).
                        viewModel.registerLoadedImage(img, for: newId)
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
            // Bornes de la ZONE d'édition texte : le canvas y centre le bloc
            // édité et l'y borne en hauteur, un texte plus long défilant à
            // l'intérieur (spec 2026-08-01).
            inlineEditFloorGlobalY: measuredTextToolbarTopY,
            inlineEditCeilingGlobalY: measuredTextTopBarBottomY,
            onManipulationLayerChanged: { layer in
                manipulationLayer = layer
            },
            onEditClockThrottleChanged: { throttled in
                isEditClockThrottled = throttled
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
            // Routé par `ComposerChromePolicy.backgroundTapAction` : le toggle
            // inconditionnel d'avant n'avait aucun effet visible panneau ouvert
            // (la politique masquait déjà le chrome), puis « Retour » découvrait
            // un écran sans « Fermer » ni « Publier » (bug terrain 2026-07-31).
            onBackgroundTapped: { handleCanvasBackgroundTap() },
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
            // #3956 — un GIF collé anime DANS le composer : sans ce fil,
            // l'aperçu montrerait une image fixe de ce que la publication
            // envoie animé.
            loadedStickerAnimations: viewModel.loadedStickerAnimations,
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
                // **La surface de dessin est EXTRAITE** (#4092) : ce bloc fut
                // cinq vues et sept lectures de ViewModel, écrites ici. Le
                // composer unifié en avait besoin à l'identique ; les recopier
                // aurait produit deux surfaces de dessin à faire diverger au
                // premier réglage ajouté. Un corps, deux montages — règle
                // d'emprunt du #4035, qui exige que l'ancien site consomme la
                // vue extraite LUI AUSSI.
                //
                // Le pincement d'inspection reste servi par l'atelier, seul à
                // posséder un viewport à déplacer : la surface le RELAIE sans
                // le décider. Une extraction qui perd une capacité de son site
                // d'origine n'est pas une extraction, c'est une réécriture.
                MeeshyDrawingSurface(
                    viewModel: viewModel,
                    onViewportPinch: { scale, translation, state in
                        switch state {
                        case .began, .changed:
                            viewportPinchDelta = scale
                            drawingViewportPanDelta = translation
                        case .ended:
                            let newScale = CanvasViewportZoomPolicy.settledScale(
                                current: viewModel.canvasScale,
                                gestureScale: scale
                            )
                            viewModel.canvasScale = newScale
                            viewportPinchDelta = 1
                            drawingViewportPanDelta = .zero
                        default:
                            viewportPinchDelta = 1
                            drawingViewportPanDelta = .zero
                        }
                    }
                )
            }
        }
        .overlay {
            StoryCanvasMediaMuteOverlays(viewModel: viewModel,
                                         isEditClockThrottled: isEditClockThrottled)
        }
    }


    @ViewBuilder
    var mediaLoadingOverlay: some View {
        if isLoadingMedia {
            Color.black.opacity(0.4)
                .overlay {
                    VStack(spacing: MeeshySpacing.md) {
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
                            // Doctrine 86i : badge numérique DANS un cercle fixe de
                            // 56 pt, pas un libellé de lecture — au même titre que
                            // les glyphes SF Symbols, hors périmètre D3 (scaler le
                            // ferait déborder du cercle sans bénéfice de lecture).
                            Text("\(Int(mediaLoadProgress * 100))%")
                                .font(.system(size: 13, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                        }
                        if !mediaLoadLabel.isEmpty {
                            Text(mediaLoadLabel)
                                .font(MeeshyFont.relative(12, weight: .medium))
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
                    // Pastille de 30 pt, seule dans son coin : le débord de
                    // contact la porte à 44 sans toucher au rendu.
                    .composerHitTarget()
            }
            .padding(.top, showTopBar ? 70 : 16)
            .padding(.trailing, MeeshySpacing.md)
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
        SceneWindowSize.resolveInsets(sceneSafeAreaInsets, fallback: WindowMetrics.safeAreaEdgeInsets).bottom
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

}
