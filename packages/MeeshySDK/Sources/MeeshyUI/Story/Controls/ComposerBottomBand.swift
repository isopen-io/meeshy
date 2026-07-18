import SwiftUI
import PhotosUI
import MeeshySDK

struct ComposerBottomBand: View {
    let state: BandState
    @ObservedObject var viewModel: StoryComposerViewModel

    @Binding var selectedFilter: StoryFilter?
    @Binding var fgMediaItem: PhotosPickerItem?
    @Binding var showAudioDocumentPicker: Bool
    @Binding var showVoiceRecorderSheet: Bool

    let onTapTile: (StoryToolMode) -> Void
    let onBackFromToolPanel: () -> Void
    let onCloseFormatPanel: () -> Void
    var onEditMedia: ((String) -> Void)? = nil
    var onEditText: ((String) -> Void)? = nil
    var onDeleteText: ((String) -> Void)? = nil
    var onShowInTimeline: (() -> Void)? = nil
    var onOpenStickerPicker: (() -> Void)? = nil

    /// Non-nil (mode dessin) → le grabber devient un handle de RESIZE : drag vertical
    /// ajuste cette hauteur de panneau (clampée), pilotée via `panelHeight`. Le canvas
    /// est scalé au-dessus côté `StoryComposerView`. `nil` → grabber décoratif (swipe-down
    /// géré par le parent).
    var resizableHeight: Binding<CGFloat>? = nil
    var minHeight: CGFloat = 160
    var maxHeight: CGFloat = 540
    /// Appelé quand le grabber est tiré nettement EN-DESSOUS de `minHeight` :
    /// le parent FERME alors le band et rend les FABs (C-DIR2 (b) — le repli
    /// « poignée seule » a été retiré, directive user 2026-07-04).
    var onResizeDismiss: (() -> Void)? = nil
    @State private var dragStartHeight: CGFloat?

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
        case .toolPanel(let t): return "tool-\(t)"
        case .formatPanel(let k, let id): return "format-\(k)-\(id)"
        }
    }

    /// Binding pour un `StoryTextObject` identifié, dérivée à la volée de
    /// `viewModel.currentEffects.textObjects`. Le setter remplace l'élément
    /// dans le tableau, ce qui propage aux observateurs `@ObservedObject` du modèle
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
            grabber

            // Panel content — keyed by state so the old panel slides
            // down and the new one slides up from the bottom.
            Group {
                switch state {
                case .hidden:
                    EmptyView()
                case .toolPanel(let tool):
                    ComposerToolPanelHost(
                        tool: tool,
                        viewModel: viewModel,
                        selectedFilter: $selectedFilter,
                        fgMediaItem: $fgMediaItem,
                        showAudioDocumentPicker: $showAudioDocumentPicker,
                        showVoiceRecorderSheet: $showVoiceRecorderSheet,
                        onBack: onBackFromToolPanel,
                        // Délègue à `onTapTile` qui est l'unique chemin de
                        // commutation d'éditeur (cf. `ComposerControlsLayer`) :
                        //   .timeline → `viewModel.isTimelineVisible = true`
                        //   sinon     → `bandStateMachine.tapTile(tool)` +
                        //               `viewModel.selectTool(tool)`
                        // Sans ce relai, le chip ne changerait QUE
                        // `viewModel.activeTool` — le BandStateMachine
                        // resterait sur `.toolPanel(.media)` et le panel
                        // ne switcherait pas visuellement.
                        onSwitchTool: onTapTile,
                        onEditMedia: onEditMedia,
                        onEditText: onEditText,
                        onOpenStickerPicker: onOpenStickerPicker,
                        onDeleteText: onDeleteText,
                        onShowInTimeline: onShowInTimeline,
                        panelHeightOverride: resizableHeight?.wrappedValue
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
                case .formatPanel(.media, _):
                    // Panneau de contrôles média retiré : l'édition d'un média
                    // passe par l'éditeur d'image plein écran (ouvert au tap
                    // sur le média). Cet état n'est plus produit.
                    EmptyView()
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
        .background(bandBackground)
        .shadow(color: .black.opacity(0.25), radius: 14, y: -6)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: stateKey)
    }

    private static let bandShape = UnevenRoundedRectangle(
        topLeadingRadius: 24,
        bottomLeadingRadius: 0,
        bottomTrailingRadius: 0,
        topTrailingRadius: 24,
        style: .continuous
    )

    private var bandStroke: Color {
        (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.08)
    }

    /// iOS 26+: the band is real Liquid Glass — refractive, responds to what's
    /// behind it — strongly tinted so the same contrast guarantee the pre-26
    /// opaque fill provided (bright/pastel canvas backgrounds never inverting
    /// text/icon legibility) still holds. iOS < 26: the exact opaque tint this
    /// shipped with since 2026-05-14 (a true `.ultraThinMaterial` let very
    /// light canvases show through and killed contrast) — unchanged, zero
    /// regression risk on OS versions that can't render real glass.
    @ViewBuilder
    private var bandBackground: some View {
        if #available(iOS 26.0, *) {
            Color.clear
                .glassEffect(
                    .regular.tint(colorScheme == .dark
                        ? MeeshyColors.indigo950.opacity(0.55)
                        : Color.white.opacity(0.55)),
                    in: Self.bandShape
                )
                .overlay(Self.bandShape.stroke(bandStroke, lineWidth: 0.5))
                .ignoresSafeArea(edges: .bottom)
        } else {
            Self.bandShape
                .fill(colorScheme == .dark
                    ? MeeshyColors.indigo950.opacity(0.92)
                    : Color.white.opacity(0.92))
                .overlay(Self.bandShape.stroke(bandStroke, lineWidth: 0.5))
                .ignoresSafeArea(edges: .bottom)
        }
    }

    /// Poignée du band. En mode redimensionnable (dessin), drag vertical = RESIZE :
    /// tirer vers le haut agrandit le panneau (et rétrécit le canvas scalé au-dessus),
    /// vers le bas l'inverse — clampé `[minHeight, maxHeight]`. Sinon décoratif
    /// (le swipe-down/fermeture est géré par le parent `ComposerControlsLayer`).
    @ViewBuilder
    private var grabber: some View {
        let handle = RoundedRectangle(cornerRadius: 2.5)
            .fill(dragHandleColor)
            .frame(width: 42, height: 5)
            .padding(.top, 10)
            .padding(.bottom, 6)
            .frame(maxWidth: .infinity)        // hit-area sur toute la largeur
            .contentShape(Rectangle())
            .accessibilityLabel(String(
                localized: "story.composer.grabber",
                defaultValue: "Poignée de la barre d'outils", bundle: .module
            ))
            .accessibilityAddTraits(.isButton)

        if let height = resizableHeight {
            handle
                // « replier » périmé depuis C-DIR2 : tirer sous le min FERME.
                .accessibilityHint(String(
                    localized: "story.composer.grabber.hint.resize",
                    defaultValue: "Faites glisser vers le haut pour agrandir, vers le bas pour réduire ou fermer.",
                    bundle: .module
                ))
                .gesture(
                    DragGesture(minimumDistance: 2)
                        .onChanged { value in
                            if dragStartHeight == nil { dragStartHeight = height.wrappedValue }
                            let base = dragStartHeight ?? height.wrappedValue
                            height.wrappedValue = max(minHeight, min(maxHeight, base - value.translation.height))
                        }
                        .onEnded { value in
                            let base = dragStartHeight ?? height.wrappedValue
                            let proposed = base - value.translation.height
                            dragStartHeight = nil
                            // Tiré nettement sous le min → FERME le band et rend
                            // les FABs (C-DIR2 (b), cf. `onResizeDismiss`).
                            if proposed < minHeight - 50 { onResizeDismiss?() }
                        }
                )
        } else {
            handle
                .accessibilityHint(String(
                    localized: "story.composer.grabber.hint.dismiss",
                    defaultValue: "Faites glisser vers le bas pour réduire ou fermer.",
                    bundle: .module
                ))
        }
    }
}
