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
            canvasLetterbox

            // Canvas core (CALayer) + drawing overlay + viewport modifiers,
            // extracted into `canvasComposerLayer` so the SwiftUI type-checker
            // doesn't time out on this body's full modifier chain.
            canvasComposerLayer

            // Amorces de page blanche — DANS le canvas, sous le chrome. Elles ne
            // prélèvent aucune hauteur : le canvas reste plein écran au repos.
            blankCanvasStarters

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
            .padding(.trailing, 16)
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
                onOpenStickerPicker: { showStickerPicker = true },
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

    // MARK: - Amorces de page blanche (S5)
    //
    // Remplacent la grille de six tuiles opaques qui prélevait 47 % de la
    // hauteur avant même que l'utilisateur ait fait quoi que ce soit. Trois
    // éléments seulement, POSÉS DANS LE CANVAS, qui disparaissent au premier
    // contenu : un indice « Touchez pour écrire », une capsule « Caméra » et la
    // dernière photo de la pellicule (ou, à défaut, une capsule « Galerie »).
    // Aucun n'occupe de hauteur réservée : le canvas reste plein écran.

    var blankCanvasStarters: some View {
        // Gate STRUCTUREL, comme la top bar et la colonne d'historique de ce même
        // `mainContent` : hors page blanche, la surface n'existe pas. Elle
        // couvre le canvas ENTIER — la neutraliser par `.allowsHitTesting(false)`
        // marchait, mais imposait que plus aucun geste ne soit posé après le
        // drapeau (un modificateur ne s'applique qu'à ce qui le PRÉCÈDE), et les
        // deux gestes ci-dessous l'étaient. Démonter la vue rend l'ordre des
        // modificateurs sans effet sur la question.
        ZStack {
            if offersContentStarters {
                ZStack {
                    // LE FOND, et lui SEUL, porte les trois gestes de la page
                    // blanche. Il est posé DERRIÈRE les capsules, jamais autour
                    // d'elles : un `highPriorityGesture(…, including: .all)`
                    // monté sur un conteneur prime sur les gestes de SES
                    // SOUS-VUES — l'appui long ouvrait donc la caméra depuis les
                    // capsules « Photo », « Caméra » et « Coller » au lieu de
                    // l'action de la capsule touchée. Le masque `including:` est
                    // une déclaration de PRIORITÉ, pas de PORTÉE : seule la
                    // superposition met les contrôles hors d'atteinte du fond,
                    // parce qu'en `ZStack` la couche de dessus reçoit la touche
                    // et les couches du dessous ne la voient jamais.
                    //
                    // `Color.clear` occupe TOUTE la place offerte : c'est ce qui
                    // rend le geste de la directive user disponible depuis
                    // n'importe quel pixel LIBRE de la page blanche. Aucun geste
                    // n'est volé au canvas : sur une slide vierge il n'y a, par
                    // définition, aucun élément à sélectionner, et le tap y route
                    // vers EXACTEMENT la même politique.
                    Color.clear
                        .contentShape(Rectangle())
                        // Dégage le rail de FABs (48 pt + marge + safe area).
                        .padding(.bottom, ComposerControlMetrics.bottomOverlayClearance)
                        .onTapGesture { handleCanvasBackgroundTap() }
                        .simultaneousGesture(blankCanvasTextSwipe)
                        // C6a — l'appui long ouvre la caméra. Trois DÉCLARATIONS
                        // DE PRIORITÉ, jamais une action posée à côté des autres :
                        //
                        //  1. `highPriorityGesture` et NON `simultaneousGesture`
                        //     — en simultané, l'appui long ET le tap se
                        //     reconnaissent : la caméra s'ouvrirait avec
                        //     l'éditeur de texte derrière (`TapGesture` de
                        //     SwiftUI n'a pas de plafond de durée, un appui long
                        //     se termine toujours par un relâchement) ;
                        //  2. `maximumDistance` STRICTEMENT sous le
                        //     `minimumDistance` du swipe : dès que le doigt
                        //     glisse, l'appui long échoue et le
                        //     swipe-vers-le-bas reste maître de son geste ;
                        //  3. le masque : sans fournisseur de caméra, le geste
                        //     n'est pas seulement inutile, il VOLERAIT le tap au
                        //     profit de rien. `.subviews` le désactive sans
                        //     toucher au tap posé plus haut, qui appartient au
                        //     contenu.
                        .highPriorityGesture(
                            blankCanvasCaptureLongPress,
                            including: offersCameraStarter ? .all : .subviews
                        )
                    blankCanvasStarterContent
                }
                .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: offersContentStarters)
        .environment(\.colorScheme, canvasChromeScheme)
    }

    /// Les CONTRÔLES de la page blanche — l'indice « Touchez pour écrire » et la
    /// rangée de capsules — dans une couche SÉPARÉE du fond gestuel.
    ///
    /// Cette séparation EST la règle de portée : les trois gestes de la page
    /// blanche répondent au fond, jamais aux contrôles qu'ils recouvrent. Tant
    /// que capsules et gestes vivaient sur la MÊME vue, `including: .all` faisait
    /// primer l'appui long sur les gestes des sous-vues, et un appui long sur
    /// « Photo » ouvrait la caméra. Aucun masque `GestureMask` ne corrige cela :
    /// il ordonne des priorités, il ne délimite pas une zone. La superposition,
    /// elle, le fait — en `ZStack`, la couche du dessus reçoit la touche.
    ///
    /// D'où l'absence de tout modificateur de geste ICI : un seul suffirait à
    /// remettre les capsules sous une surface gestuelle, et
    /// `StoryComposerCaptureLongPressTests` le refuse.
    private var blankCanvasStarterContent: some View {
        BlankCanvasStarterSurface {
            blankCanvasTypeHint
            blankCanvasStarterRow
        }
        // Même dégagement que le fond : le rail de FABs reste hors de la couche.
        .padding(.bottom, ComposerControlMetrics.bottomOverlayClearance)
    }

    /// Directive user 2026-07-31 : sur l'état vide, un SWIPE VERS LE BAS range les
    /// amorces ET ouvre directement l'éditeur de texte — même chemin que le tap.
    /// Geste COMPLÉMENTAIRE, jamais unique (D4) : le tap canvas, le tap sur
    /// l'indice et le FAB « Texte » le doublent tous.
    ///
    /// Plus de garde `offersContentStarters` dans la closure : le geste n'existe
    /// que monté avec la surface, et elle ne l'est que sur une page blanche.
    private var blankCanvasTextSwipe: some Gesture {
        DragGesture(minimumDistance: Self.blankCanvasSwipeMinDistance)
            .onEnded { value in
                guard value.translation.height > 40,
                      abs(value.translation.height) > abs(value.translation.width)
                else { return }
                startTextCompositionOnBlankCanvas()
            }
    }

    /// L'indice est TAPABLE et route vers la même action que le canvas : un
    /// `Text` SwiftUI reçoit les taps par défaut, et le rendre inerte aurait
    /// créé un trou mort au centre exact de la zone qu'il désigne. Il annonce
    /// donc ce qu'il fait, et le fait.
    private var blankCanvasTypeHint: some View {
        Text(String(localized: "story.composer.start.hint",
                    defaultValue: "Touchez pour écrire", bundle: .module))
            .font(MeeshyFont.relative(15, weight: .semibold))
            .foregroundStyle(.primary.opacity(0.75))
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .onTapGesture { startTextCompositionOnBlankCanvas() }
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(String(localized: "story.composer.start.a11y.text",
                                       defaultValue: "Écrire un texte", bundle: .module))
    }

    /// **« Coller » vit sur sa PROPRE rangée, sous les deux autres** (#4378,
    /// directive porteur 2026-08-30) :
    ///
    /// > « Le bouton coller doit être centré plus bas pour que les autres
    /// > boutons restent au centre ! »
    ///
    /// Les trois capsules partageaient un `HStack`. Mesuré à l'écran : la
    /// troisième débordait du bord droit, et surtout les deux premières s'en
    /// trouvaient poussées HORS du centre — la rangée entière se décalait pour
    /// loger celle qui dépassait.
    ///
    /// Une seconde rangée règle les deux d'un coup : « Caméra » et « Galerie »
    /// retrouvent le centre, et « Coller » y est aussi, sous elles. Le
    /// `VStack` ne se peint pas quand la seconde rangée est vide — la capsule se
    /// retire d'elle-même quand le presse-papier ne porte rien d'acceptable, et
    /// un interstice réservé à une vue absente serait un trou.
    @ViewBuilder
    private var blankCanvasStarterRow: some View {
        VStack(spacing: 10) {
            blankCanvasCaptureRow
            BlankCanvasPasteStarter(
                canAddMedia: viewModel.canAddMedia,
                onItems: { posePastedItems($0) }
            )
        }
    }

    @ViewBuilder
    private var blankCanvasCaptureRow: some View {
        HStack(spacing: 10) {
            if offersCameraStarter {
                blankCanvasStarterCapsule(
                    icon: "camera.fill",
                    title: String(localized: "story.composer.start.camera",
                                  defaultValue: "Caméra", bundle: .module),
                    a11y: String(localized: "story.composer.start.a11y.camera",
                                 defaultValue: "Prendre une photo ou une vidéo", bundle: .module),
                    action: { showCameraCapture = true }
                )
            }
            if viewModel.canAddMedia {
                blankCanvasGalleryStarter
            }
        }
    }

    // MARK: - C6a — la capture par appui long, C5b — le collage

    /// Vrai quand la caméra peut répondre : fournisseur injecté par l'app ET
    /// plafond média non atteint.
    ///
    /// **Lue par les DEUX chemins** — la capsule « Caméra » et l'appui long sur
    /// la page blanche. Deux conditions retapées à deux endroits finissent par
    /// diverger, et le jour où elles divergent, l'appui long ouvre un plein
    /// écran vide (le fournisseur n'est pas là) ou passe le plafond média.
    var offersCameraStarter: Bool {
        Self.offersCameraCapture(hasProvider: storyCameraCapture != nil,
                                 canAddMedia: viewModel.canAddMedia)
    }

    /// Règle PURE de l'offre de capture. Deux conditions, jamais une seule :
    /// l'injection est la CAPACITÉ de répondre (une amorce qui ouvre le vide est
    /// pire que pas d'amorce, même doctrine que le chip « Lieu »), le plafond
    /// média est le droit de poser un objet de plus.
    nonisolated static func offersCameraCapture(hasProvider: Bool, canAddMedia: Bool) -> Bool {
        hasProvider && canAddMedia
    }

    /// Règle PURE de l'offre de collage — jumelle de `offersCameraCapture`.
    /// `hasResolver` est l'injection app-side (`\.storyPaste`) : sans elle,
    /// personne ne sait lire le presse-papier et la capsule n'est pas rendue.
    nonisolated static func offersPasteStarter(hasResolver: Bool, canAddMedia: Bool) -> Bool {
        hasResolver && canAddMedia
    }

    /// Ce que la capsule « Coller » accepte.
    ///
    /// **Cette liste EST la directive produit du 2026-08-23** — « on doit
    /// pouvoir coller des images, des documents dont les stickers, et ça doit
    /// être pris en compte et propagé ». La réduire aux images ne rendrait pas
    /// le collage d'un document impossible : elle rendrait la capsule INERTE
    /// devant lui, et le presse-papier ne dit jamais pourquoi rien ne s'est
    /// passé. `.item` ferme la liste, comme sur la cible de dépôt de la barre de
    /// conversation : ce que le composer ne sait pas peindre est ANNONCÉ
    /// app-side, jamais avalé.
    /// **RESTREINTE au #4378** (directive porteur 2026-08-30) :
    ///
    /// > « que coller n'apparaisse que si on a une image, un texte ou vidéo dans
    /// > le presse-papier »
    ///
    /// `.item` acceptait TOUT : `PasteButton` se croyait donc toujours servi, et
    /// « Coller » s'affichait quel que soit le contenu du presse-papier —
    /// l'affordance sans effet que la loi 4 interdit.
    ///
    /// **Ce n'est pas une annulation de la directive du 2026-08-23**, qui
    /// voulait qu'un document collé soit ANNONCÉ plutôt qu'avalé. Elle est
    /// RESTREINTE : ce qui n'est ni image, ni vidéo, ni son, ni texte n'est plus
    /// proposé du tout — il n'y a donc plus rien à annoncer sur ce chemin. La
    /// succession se consigne ; elle ne s'efface pas.
    ///
    /// Le TEXTE y entre en même temps que `StoryPastedItem.text` : l'accepter
    /// sans savoir le poser aurait rendu la capsule active devant un
    /// presse-papier qu'elle ne sait pas servir — pire que de ne pas l'accepter.
    nonisolated static let pasteStarterContentTypes: [UTType] = [
        .image, .movie, .audio, .plainText, .utf8PlainText
    ]

    /// Durée au-delà de laquelle l'appui devient un appui LONG.
    nonisolated static let blankCanvasLongPressDuration: TimeInterval = 0.45

    /// Distance au-delà de laquelle l'appui long ABANDONNE.
    ///
    /// STRICTEMENT inférieure à `blankCanvasSwipeMinDistance` : c'est toute la
    /// déclaration de priorité entre les deux gestes de la page blanche. Si elle
    /// l'égalait ou la dépassait, un doigt qui commence à glisser resterait
    /// candidat à l'appui long pendant que le swipe démarre — l'un des deux
    /// volerait l'autre, et lequel dépendrait du matériel.
    nonisolated static let blankCanvasLongPressMaxDistance: CGFloat = 12

    /// Distance minimale du swipe-vers-le-bas qui ouvre l'éditeur de texte.
    nonisolated static let blankCanvasSwipeMinDistance: CGFloat = 20

    /// C6a — l'appui long sur la page blanche ouvre la CAMÉRA.
    ///
    /// Geste COMPLÉMENTAIRE, jamais unique (D4) : la capsule « Caméra » de la
    /// même rangée le double, sous EXACTEMENT la même condition
    /// (`offersCameraStarter`), et le rail d'outils la double encore.
    ///
    /// Le point d'arrivée n'est pas neuf : `showCameraCapture` ouvre le cover
    /// app-side, dont le résultat passe par `addCapturedMedia` →
    /// `insertForegroundImage` / `insertForegroundVideo`, extraits en leur temps
    /// POUR un futur point d'entrée caméra. C'est celui-là.
    private var blankCanvasCaptureLongPress: some Gesture {
        LongPressGesture(minimumDuration: Self.blankCanvasLongPressDuration,
                         maximumDistance: Self.blankCanvasLongPressMaxDistance)
            .onEnded { _ in
                guard offersCameraStarter else { return }
                HapticFeedback.medium()
                showCameraCapture = true
            }
    }

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

    /// Règle PURE de l'amorce « pellicule ». `hasRecentAsset` ne vaut vrai que
    /// si l'app a pu résoudre une vignette SANS rien demander — c'est-à-dire si
    /// l'accès en lecture était DÉJÀ accordé (`.authorized`/`.limited`) et la
    /// pellicule non vide. Le composer ne prompte donc jamais à l'ouverture ; la
    /// demande d'accès est reportée sur le tap de la capsule générique.
    nonisolated static func galleryStarter(
        hasRecentAsset: Bool,
        hasCameraRollProvider: Bool
    ) -> StoryGalleryStarter {
        guard hasCameraRollProvider else { return .systemPickerCapsule }
        return hasRecentAsset ? .recentAssetThumbnail : .accessRequestCapsule
    }

    /// Règle PURE de l'issue du tap : accès accordé sur ce geste → la dernière
    /// photo entre directement (le geste reste UNIQUE) ; refus ou pellicule vide
    /// → `PhotosPicker` système. Laisser l'amorce sans effet ferait d'un refus
    /// une impasse définitive, et le picker n'exige aucune permission.
    nonisolated static func galleryAccessOutcome(
        resolved asset: StoryRecentCameraRollAsset?
    ) -> StoryGalleryAccessOutcome {
        guard let asset else { return .presentSystemPicker }
        return .insertRecentAsset(asset)
    }

    /// Vignette de la DERNIÈRE photo de la pellicule quand l'app l'a injectée
    /// (`\.storyRecentCameraRollAsset`) ET que l'accès en lecture était déjà
    /// accordé : un tap l'insère, sans passer par un picker — c'est l'ancre
    /// « dernière photo accessible en 1 geste ». Le chevron accolé reste la
    /// porte vers la pellicule complète. Sinon on retombe sur la capsule
    /// « Galerie » : la capacité n'est jamais perdue.
    @ViewBuilder
    private var blankCanvasGalleryStarter: some View {
        switch Self.galleryStarter(hasRecentAsset: recentCameraRollAsset != nil,
                                   hasCameraRollProvider: storyRecentCameraRollAsset != nil) {
        case .recentAssetThumbnail:
            blankCanvasRecentAssetStarter
        case .accessRequestCapsule:
            // Le TAP est le geste explicite qui autorise la demande d'accès —
            // jamais l'ouverture du composer.
            blankCanvasStarterCapsule(
                icon: "photo.on.rectangle.angled",
                title: String(localized: "story.composer.start.gallery",
                              defaultValue: "Galerie", bundle: .module),
                a11y: String(localized: "story.composer.start.a11y.gallery",
                             defaultValue: "Choisir dans la galerie", bundle: .module),
                action: { requestRecentCameraRollAccess() }
            )
        case .systemPickerCapsule:
            blankCanvasSystemPickerStarter
        }
    }

    @ViewBuilder
    private var blankCanvasRecentAssetStarter: some View {
        if let asset = recentCameraRollAsset {
            HStack(spacing: 0) {
                Button {
                    HapticFeedback.light()
                    addRecentCameraRollAsset(asset)
                } label: {
                    Image(uiImage: asset.thumbnail)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 44, height: 44)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .padding(.leading, 6)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "story.composer.start.a11y.recent",
                                           defaultValue: "Utiliser la dernière photo", bundle: .module))
                PhotosPicker(selection: $fgMediaItem, matching: .any(of: [.images, .videos])) {
                    // `.forward` et non `.right` : le chevron désigne « la
                    // suite » et doit se retourner en arabe (RTL).
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundStyle(.primary.opacity(0.7))
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(String(localized: "story.composer.start.a11y.gallery",
                                           defaultValue: "Choisir dans la galerie", bundle: .module))
            }
            .frame(minHeight: 44)
            .adaptiveGlass(in: Capsule())
        }
    }

    private var blankCanvasSystemPickerStarter: some View {
        // Le libellé est résolu AVANT le label du `PhotosPicker` : ce
        // closure est traité comme `@Sendable`, et `Bundle.module` y est
        // main-actor-isolé (avertissement de concurrence, futur erreur).
        let galleryTitle = String(localized: "story.composer.start.gallery",
                                  defaultValue: "Galerie", bundle: .module)
        return PhotosPicker(selection: $fgMediaItem, matching: .any(of: [.images, .videos])) {
            BlankCanvasStarterLabel(icon: "photo.on.rectangle.angled", title: galleryTitle)
        }
        .accessibilityLabel(String(localized: "story.composer.start.a11y.gallery",
                                   defaultValue: "Choisir dans la galerie", bundle: .module))
    }

    private func blankCanvasStarterCapsule(
        icon: String,
        title: String,
        a11y: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            BlankCanvasStarterLabel(icon: icon, title: title)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(a11y)
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
            // L'édition texte ne carde plus le canvas : il n'y a donc plus rien
            // à réserver pour sa rangée haute, qui flotte par-dessus.
            let chromeAtTop = showTopBar
            // **`+ headerRowHeight` au #4124.** Le `max(safeTop, 59)` réservait la
            // ZONE SÛRE, pas la rangée : la barre haute FLOTTE au-dessus du
            // canvas, si bien qu'elle ne prélevait aucune hauteur — invisible
            // tant que le canvas était plein écran et que le chrome se posait
            // dessus par-dessus. Cardée, la carte démarrait 10 pt sous la barre,
            // mesuré à l'écran : le ✕ et le chip de type se posaient sur la
            // composition. Même raison que le plancher bas, à l'autre bout.
            let headerInset = chromeAtTop
                ? max(proxy.safeAreaInsets.top, 59) + Self.headerRowHeight + 12
                : proxy.safeAreaInsets.top + 12
            // Marge basse minimale même sheet repliée → la carte reste détachée du bas du
            // viewport (et de la poignée), sinon elle touchait quasi le bord en collapse.
            //
            // **Le plancher passe de 16 à `bottomOverlayClearance` au #4124**, et
            // c'est le rail de FABs qui l'impose : il FLOTTE au-dessus du canvas,
            // donc il ne prélève aucune hauteur — tant que le repos ne cardait
            // pas, il flottait sur un canvas plein écran et personne ne s'en
            // plaignait. La carte cardée, elle, doit passer AU-DESSUS de lui,
            // sinon les six outils se posent sur la composition et la scène n'a
            // « pas d'espace en bas », à rebours de la directive.
            //
            // La MÊME constante que le bandeau de reprise de brouillon : deux
            // littéraux jumeaux finissent par diverger.
            let bottomInset = max(presentedSheetHeight, ComposerControlMetrics.bottomOverlayClearance)
                + max(proxy.safeAreaInsets.bottom, 0)
                + Self.canvasSheetGap
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
                // Carte PAYSAGE (16:9, courte) : `.bottom` — collée juste au-dessus
                // du sheet d'édition, elle « remonte » avec lui quand il grandit
                // (user 2026-07-20), letterbox flou (cf. `canvasLetterbox`) au-dessus.
                // Le sheet est plafonné (`presentedSheetHeight` → `maxSheetKeeping…`)
                // pour que la carte reste ENTIÈREMENT visible, jamais rognée.
                // PORTRAIT (9:16) : remplit la région → `.center` (aucun mou).
                //
                // **`presentedSheetHeight > 0` est ajouté au #4124**, et c'est la
                // condition que la règle de 2026-07-20 sous-entendait sans
                // pouvoir la dire : « remonter AVEC le sheet » n'a de sens que
                // s'il y en a un. Tant que le repos ne cardait pas, la question
                // ne se posait jamais — il n'y avait pas de carte au repos. Elle
                // se pose maintenant, et sans cette condition une carte paysage
                // se collerait en bas d'un écran vide, tout le mou en haut, à
                // rebours de « la scène au CENTRE ».
                verticalAlignment: canvasRatio > 1 && presentedSheetHeight > 0 ? .bottom : .center,
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
                    // Montés SEULEMENT là où leur override change réellement la
                    // couche manipulée (fond ET premier plan peuplés) : sur une
                    // slide à une seule couche, `resolveManipulationLayer` ignore
                    // l'override et les chips n'étaient que décoratifs.
                    if showsCanvasLayerIndicator {
                        CanvasLayerIndicator(layer: manipulationLayer)
                            .fixedSize()
                            .rotationEffect(.degrees(-90))
                            .frame(width: 24, height: 44)
                            .padding(.leading, 8)
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
        if showStickerPicker || showVoiceRecorderSheet || showTransitionSheet { return 0.5 }
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
        Self.resolveCanvasIsCarded(
            isTextEditing: viewModel.textEditingMode != .inactive,
            effectiveBandIsHidden: chromeContext.isBandHidden,
            drawingActive: viewModel.drawingEditingMode.isActive,
            presentedSystemSheetFraction: presentedSystemSheetFraction
        )
    }

    /// Résolution pure de `canvasIsCarded`, extraite en `static` — même
    /// pattern que `resolveShouldShowEmptyStateLargePicker`. `effectiveBandIsHidden`
    /// lit l'état RÉSOLU (`ComposerChromeContext.isBandHidden`, S1), jamais
    /// l'état BRUT de `bandStateMachine.state` : sur les 6 chemins d'ouverture
    /// Timeline (`BandStateMachineTests.openTimeline*`) la machine peut rester
    /// `.hidden` tandis que `isTimelineVisible` force le panneau via l'override
    /// d'`effectiveBandState` — lire l'état brut ici referait carder le canvas
    /// par coïncidence (le terme `timelineActive` séparé compensait déjà ce
    /// trou côté `canvasIsCarded`, mais PAS côté `presentedSheetHeight`, cf.
    /// `resolvePresentedSheetHeight`). Plus besoin de ce terme redondant une
    /// fois l'état résolu passé directement à `StoryCanvasFraming.isCarded`
    /// (paramètre `timelineActive` gardé à son défaut `false`).
    static func resolveCanvasIsCarded(
        isTextEditing: Bool,
        effectiveBandIsHidden: Bool,
        drawingActive: Bool,
        presentedSystemSheetFraction: CGFloat?
    ) -> Bool {
        // L'édition texte garde le canvas plein écran, sheet système comprise.
        guard !isTextEditing else { return false }
        if StoryCanvasFraming.isCarded(
            bandPresent: !effectiveBandIsHidden,
            drawingActive: drawingActive,
            textActive: false
        ) {
            return true
        }
        return presentedSystemSheetFraction != nil
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
        Self.resolvePresentedSheetHeight(
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

    /// Résolution pure de `presentedSheetHeight`, extraite en `static` — même
    /// pattern que `resolveCanvasIsCarded`. AVANT le fix S4, le bloc de
    /// réserve mesurée restait derrière l'état BRUT
    /// (`bandStateMachine.state != .hidden`), sans le filet redondant qui
    /// sauvait `canvasIsCarded` : sur les 6 chemins d'ouverture Timeline la
    /// machine reste `.hidden` pendant que `effectiveBandIsHidden` (résolu)
    /// est `false`, donc cette fonction retournait `0` alors que
    /// `canvasIsCarded == true` — le canvas cardait à une taille trop grande,
    /// ses contrôles bas passant SOUS le panneau Timeline réellement rendu
    /// (~392-406pt, bug §0 du rapport terrain 2026-07-30).
    static func resolvePresentedSheetHeight(
        canvasIsCarded: Bool,
        effectiveBandIsHidden: Bool,
        measuredBandTopY: CGFloat,
        measuredBottomBandHeight: CGFloat,
        composerBandHeight: CGFloat,
        presentedSystemSheetFraction: CGFloat?,
        composerScreenHeight: CGFloat,
        /// **Ce que l'HÔTE occupe en bas** (#4361) — sa zone de saisie de
        /// description. Défaut `0` : un appelant qui l'ignore obtient le
        /// comportement d'avant, exactement.
        ///
        /// Elle entre par un `max`, comme les deux autres termes, et pour la
        /// même raison : ces réserves ne s'ADDITIONNENT pas. Band et saisie
        /// occupent le même bas d'écran ; les sommer ferait remonter le canvas
        /// deux fois trop haut le jour où les deux coexistent.
        hostBottomReservation: CGFloat = 0
    ) -> CGFloat {
        // La réserve de l'hôte vaut MÊME hors cardage : elle ne décrit pas un
        // panneau de l'atelier mais une zone que le meuble a réellement peinte
        // par-dessus. La retenir derrière `canvasIsCarded` laisserait la saisie
        // recouvrir un canvas plein écran — le défaut qu'on corrige.
        guard canvasIsCarded else { return min(composerScreenHeight * 0.85, max(0, hostBottomReservation)) }
        var height: CGFloat = 0
        if !effectiveBandIsHidden {
            // Réserve = distance du HAUT RÉEL de la band (coord globales,
            // `measuredBandTopY`) au bas de l'écran → le canvas se rétracte
            // EXACTEMENT jusqu'au haut visuellement rendu de la band, jamais
            // recouvert/tronqué (bug 2026-07-20 : la hauteur de layout
            // sous-estimait quand le contenu débordait son `.frame` ou restait
            // stale après resize). Fallback layout tant que `minY` pas encore
            // mesuré (premier frame).
            // `.greatestFiniteMagnitude` (sentinelle « band repliée ») EST fini,
            // donc `isFinite` ne suffit pas : on teste `< composerScreenHeight`
            // (un vrai haut de band est toujours dans l'écran).
            let hasBandTop = measuredBandTopY.isFinite && measuredBandTopY < composerScreenHeight
            let byTop = hasBandTop
                ? max(0, composerScreenHeight - measuredBandTopY)
                : max(composerBandHeight, measuredBottomBandHeight)
            height = max(height, byTop)
        }
        if let fraction = presentedSystemSheetFraction {
            height = max(height, composerScreenHeight * fraction)
        }
        height = max(height, max(0, hostBottomReservation))
        // Plafond de SÉCURITÉ (0.85 H) : jamais atteint par une band réaliste
        // (max ~60 % avec `composerBandMaxHeight`), il ne fait qu'empêcher un
        // `measuredBandTopY` transitoire aberrant (0 au montage) d'écraser le
        // canvas à néant. Le cap 0.70 précédent, lui, TRONQUAIT une band > 70 %.
        return min(composerScreenHeight * 0.85, height)
    }

    /// Petit espace (pt) laissé entre le BAS de la carte canvas et le haut du
    /// sheet d'édition — la carte ne doit pas être collée au sheet (user
    /// 2026-07-20). Ajouté au `bottomInset` du solveur de framing.
    static let canvasSheetGap: CGFloat = 14

    /// Letterbox derrière la carte canvas. Historiquement NOIR (contraste carte
    /// + « cinéma » pour un média) — mais un fond PAYSAGE réduit le canvas 16:9 à
    /// une bande, laissant un grand vide noir perçu comme « canvas noir » (user
    /// 2026-07-20, choix « garder la forme, tuer le noir »). On le remplit
    /// désormais par un FLOU du média de fond — la carte nette flotte au-dessus de
    /// sa propre version floutée (look intégré) — ou, à défaut d'image, par la
    /// couleur de fond de la story.
    ///
    /// S5 — il est TAPABLE, et route vers la MÊME closure que le fond du canvas
    /// (`handleCanvasBackgroundTap`). Sur iPhone 16 Pro les bandes représentent
    /// 874 − 714 = 160 pt, soit ~18 % de la hauteur, dont la bande basse — la
    /// plus proche du pouce. Elles ont exactement l'apparence du canvas ; les
    /// laisser inertes contredisait frontalement « toute la surface du canvas
    /// est le bouton texte ». Le letterbox est SOUS `canvasComposerLayer` dans
    /// le ZStack : le canvas garde la priorité sur son propre rectangle.
    @ViewBuilder
    var canvasLetterbox: some View {
        Group {
            if let bg = composerLetterboxImage {
                Color.clear
                    .overlay(Image(uiImage: bg).resizable().scaledToFill())
                    .clipped()
                    .blur(radius: 34, opaque: true)
                    .overlay(Color.black.opacity(0.20))
                    .ignoresSafeArea()
            } else {
                // **Le plateau prend la couleur du slide, ASSOMBRIE** (directive
                // porteur 2026-08-28, #4124 : « un fond même couleur que
                // MeeshyComposer — sombre, prend la couleur de fond si aucun
                // média n'est mis en fond »).
                //
                // Le voile n'est pas une préférence de teinte : sans lui, le
                // plateau et la carte ont EXACTEMENT la même couleur, et la
                // carte disparaît. Mesuré à l'écran le jour où le liseré a cédé
                // la place à l'ombre — une ombre n'a rien à détacher quand les
                // deux surfaces sont identiques. C'est le même voile que la
                // branche MÉDIA juste au-dessus applique à son flou, pour la
                // même raison.
                Rectangle()
                    .fill(storyBackgroundStyle(
                        viewModel.backgroundColor.replacingOccurrences(of: "#", with: "")))
                    .overlay(Color.black.opacity(0.28))
                    .ignoresSafeArea()
                    .animation(.easeInOut(duration: 0.25), value: canvasIsCarded)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { handleCanvasBackgroundTap() }
        // Le tracé immersif possède l'écran entier : lui voler un touch par le
        // letterbox interromprait un trait en cours.
        .allowsHitTesting(!isImmersiveDrawingSurface)
    }

    /// Bitmap du média de fond courant, source du flou de `canvasLetterbox`.
    /// `nil` quand le fond est une couleur/gradient (pas de média de fond chargé).
    var composerLetterboxImage: UIImage? {
        guard let bgId = viewModel.currentEffects.mediaObjects?
            .first(where: { $0.isBackground })?.id else { return nil }
        return viewModel.loadedImages[bgId]
    }

    /// Hauteur de la fenêtre active (et non `UIScreen.main.bounds`) — identique au
    /// calcul de `recomputeCanvasShift`, pour respecter split-screen / Stage Manager.
    /// Délègue à `WindowMetrics`, le SSOT du module : l'implémentation locale
    /// choisissait la scène par `.first` sur un `Set` non ordonné (donc
    /// potentiellement une scène en arrière-plan), quand `WindowMetrics` la
    /// résout par `activationState == .foregroundActive`.
    var composerScreenHeight: CGFloat {
        WindowMetrics.windowSize.height
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
                case .sticker, .location:
                    // Pastille de lieu : sélection seule (le canvas l'a remontée
                    // au premier plan). Elle se déplace/redimensionne au doigt et
                    // se retire par le menu contextuel — rien à éditer au tap.
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
                case .sticker, .location:
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
                            // Un-bouton : mute → volume 0 (niveau mémorisé),
                            // unmute → restaure le niveau quitté (pas 1.0 forcé).
                            var obj = binding.wrappedValue
                            obj.toggleMute()
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
                // La vidéo de FOND — le cas le plus courant, et le seul qui
                // n'avait aucune affordance : `foregroundVideoBindings` filtre
                // sur `isBackground == false`. Son volume était pourtant bien
                // lu au rendu (`StoryCanvasUIView+Rendering`).
                if let bg = backgroundVideoBinding {
                    backgroundVideoMuteButton(for: bg, canvasSize: geo.size)
                }
            }
        }
    }

    /// Bouton de coupure du son de la vidéo de fond.
    ///
    /// Le fond couvre tout le canvas : sa position ne dérive pas du modèle
    /// comme celle d'un clip d'avant-plan, elle est ancrée au coin HAUT-GAUCHE
    /// — la colonne de boutons flottants est alignée en bas, et les boutons
    /// par-clip suivent chacun leur propre média.
    ///
    /// Mêmes icône, geste et clés de localisation que `videoMuteButton` : un
    /// contrôle visuellement différent pour la même action serait une
    /// régression d'apprentissage, et aucune clé neuve n'est à traduire.
    func backgroundVideoMuteButton(for binding: Binding<StoryMediaObject>,
                                   canvasSize: CGSize) -> some View {
        let muted = binding.wrappedValue.volume <= 0
        let inset: CGFloat = 18
        return Button {
            HapticFeedback.light()
            var obj = binding.wrappedValue
            obj.toggleMute()
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
        .position(x: inset + 15, y: inset + 15)
        .accessibilityLabel(muted
            ? String(localized: "story.video.unmute", defaultValue: "Activer le son de la vidéo", bundle: .module)
            : String(localized: "story.video.mute", defaultValue: "Couper le son de la vidéo", bundle: .module))
    }

    /// Binding vers la vidéo de FOND, s'il y en a une. Optionnel et non
    /// tableau — cf. `backgroundVideoIndex(in:)`.
    var backgroundVideoBinding: Binding<StoryMediaObject>? {
        let medias = viewModel.currentEffects.mediaObjects ?? []
        guard let idx = Self.backgroundVideoIndex(in: medias) else { return nil }
        let snapshot = medias[idx]
        return Binding<StoryMediaObject>(
            get: {
                let list = viewModel.currentEffects.mediaObjects ?? []
                return list.indices.contains(idx) ? list[idx] : snapshot
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
            // Un-bouton : mémento de restauration (cf. StoryVolumeCarrying).
            var obj = binding.wrappedValue
            obj.toggleMute()
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
        .accessibilityLabel(muted
            ? String(localized: "story.video.unmute", defaultValue: "Activer le son de la vidéo", bundle: .module)
            : String(localized: "story.video.mute", defaultValue: "Couper le son de la vidéo", bundle: .module))
    }

    /// Bindings vers chaque vidéo foreground (`isBackground == false`, kind
    /// `.video`) de la slide courante — pour le bouton mute. Écrit en retour
    /// dans `viewModel.currentEffects`, ce qui resync la slide et l'aperçu.
    /// Index de la vidéo de FOND, s'il y en a une.
    ///
    /// Pure et statique : la décision se teste sans monter la vue (même patron
    /// que `presentedCameraCapture(isRequested:provider:)`). Rend le PREMIER
    /// fond vidéo et non un tableau — le modèle ne contraint pas l'unicité du
    /// fond, et deux bindings poseraient deux boutons superposés au même coin
    /// du canvas.
    nonisolated static func backgroundVideoIndex(in medias: [StoryMediaObject]) -> Int? {
        medias.firstIndex { $0.isBackground && $0.kind == .video }
    }

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
        WindowMetrics.safeAreaInsets.bottom
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

// MARK: - Amorces de page blanche : surface d'accueil et libellé partagé

/// Surface d'accueil des amorces de page blanche. Sa seule responsabilité est
/// GÉOMÉTRIQUE : occuper l'intégralité de la place offerte, pour que ce qu'on y
/// centre soit centré sur le canvas entier. Un `VStack` ne s'étire QUE sur son
/// axe majeur — sa largeur vaut celle de son plus large enfant, soit ~200 pt sur
/// les 393 d'un iPhone 16 Pro : le swipe-down de la directive user (2026-07-31)
/// n'aurait répondu que dans une colonne centrale, et le même geste, sur des
/// pixels d'apparence identique, aurait marché ou non selon 80 pt d'écart.
///
/// **Elle ne déclare AUCUN `contentShape`, et c'est la correction du 2026-08-23.**
/// Un rectangle de contact plein cadre posé ici transformait la couche des
/// contrôles en écran opaque aux touches : le fond gestuel monté DERRIÈRE elle
/// n'aurait plus rien reçu, et l'appui long serait resté sur les capsules. La
/// zone de contact est donc déclarée par l'APPELANT, sur la couche qui doit
/// vraiment la porter — le fond.
///
/// Feuille de vue autonome (comme `BlankCanvasStarterLabel`) pour que la
/// propriété géométrique soit prouvée par un RENDU mesuré et non par un
/// `contains` dans un fichier de 1 400 lignes.
struct BlankCanvasStarterSurface<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 14) {
            Spacer(minLength: 0)
            content
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Libellé partagé des capsules d'amorce (Caméra, Galerie).
///
/// Feuille de vue autonome (pas une méthode de `StoryComposerView`) : elle est
/// montée à l'intérieur du label d'un `PhotosPicker`, contexte que le
/// compilateur traite comme non isolé — une méthode `@MainActor` n'y est pas
/// franchissable. C'est aussi la bonne granularité SwiftUI : entrées primitives,
/// aucune dépendance au graphe du composer.
///
/// D1 — 44 pt de zone de contact dès l'écriture, et typographie RELATIVE
/// (`MeeshyFont.relative`) : ce fichier n'utilisait jusqu'ici que des
/// `.font(.system(size:))` figées, insensibles au Dynamic Type.
struct BlankCanvasStarterLabel: View {
    let icon: String
    let title: String

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(15, weight: .semibold))
            Text(title)
                .font(MeeshyFont.relative(14, weight: .semibold))
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, 16)
        .frame(minHeight: 44)
        .contentShape(Capsule())
        .adaptiveGlass(in: Capsule())
    }
}

/// C5b — la capsule « Coller » des amorces de page blanche.
///
/// Feuille de vue autonome, comme `BlankCanvasStarterLabel`, et pour la même
/// raison portée à sa conclusion : elle lit `\.storyPaste` ELLE-MÊME. Ses
/// entrées sont primitives (`Bool`, une closure), donc elle ne s'abonne à aucun
/// graphe global — c'est la granularité que « Zero Unnecessary Re-render »
/// demande d'une feuille.
///
/// **`PasteButton` et non un `Button` qui lirait `UIPasteboard.general`.** Deux
/// propriétés qu'un bouton maison n'a pas : le système accorde l'accès au
/// presse-papier SANS la bannière « Coller depuis … » (celle que le chemin
/// `ingestPastedFileURLs` de la barre de conversation doit subir), et le bouton
/// se désactive de lui-même quand le presse-papier ne porte rien d'acceptable —
/// donc jamais d'affordance qui ne ferait rien. Son libellé vient du système :
/// il est déjà traduit dans les sept langues de l'app, sans clé de catalogue.
struct BlankCanvasPasteStarter: View {
    let canAddMedia: Bool
    let onItems: ([StoryPastedItem]) -> Void

    @Environment(\.storyPaste) private var provider

    var body: some View {
        if StoryComposerView.offersPasteStarter(hasResolver: provider != nil,
                                                canAddMedia: canAddMedia),
           let resolver = provider {
            PasteButton(supportedContentTypes: StoryComposerView.pasteStarterContentTypes) { providers in
                HapticFeedback.light()
                // Résolution SÉQUENTIELLE app-side, dans une tâche qui HÉRITE de
                // l'isolation MainActor : `NSItemProvider` n'est pas `Sendable`,
                // le confier à une tâche détachée est refusé net par Swift 6.
                // C'est le patron exact de la cible de dépôt de la barre de
                // conversation, pour la même raison.
                Task { onItems(await resolver.items(from: providers)) }
            }
            .labelStyle(.titleAndIcon)
            .buttonBorderShape(.capsule)
            .frame(minHeight: 44)
        }
    }
}
