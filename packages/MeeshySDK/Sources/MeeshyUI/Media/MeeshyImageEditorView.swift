import MeeshySDK
import SwiftUI
import UIKit

// MARK: - Meeshy Image Editor View

/// The single, immersive, full-screen image editor used everywhere in the app
/// (profile, posts, stories, messages, communities…). It merges what used to
/// be two separate screens — a context "preview/use" step and a fragmented
/// tabbed editor — into one fluid surface.
///
/// Chrome follows the Story composer's modern pattern: a full-bleed canvas
/// with floating controls — a glass top bar, a corner FAB cluster, and a
/// contextual "controller" panel that slides up only for the active tool.
/// Nothing is a fixed panel; options appear only when needed.
///
/// Architecture: this type is presentation-only. All mutable state, history
/// and the render loop live in `ImageEditorViewModel`; pixel work lives in the
/// stateless `ImageFilterEngine`. The edit pipeline is fully non-destructive —
/// the original image is never mutated and the final render is produced once,
/// on `Terminé`.
public struct MeeshyImageEditorView: View {

    @StateObject private var viewModel: ImageEditorViewModel
    @ResolvedThemePalette private var theme
    @Environment(\.dismiss) private var dismiss
    /// Les marges sûres de la fenêtre qui porte l'éditeur, mesurées par sa racine.
    @Environment(\.sceneSafeAreaInsets) var sceneSafeAreaInsets

    private let accentColor: String
    private let onAccept: (UIImage) -> Void
    private let onCancel: (() -> Void)?

    // Tool / panel state
    @State private var activeTool: EditorTool?
    @State private var showHistory = false
    @State private var controllerDrag: CGFloat = 0

    // Canvas inspection transform (view-only — never baked into the image)
    @State private var zoom: CGFloat = 1
    @State private var zoomAnchor: CGFloat = 1
    @State private var pan: CGSize = .zero
    @State private var panAnchor: CGSize = .zero

    // Before/after comparison
    @State private var isComparing = false
    @State private var beforeImage: UIImage?

    // Crop interaction
    @State private var cropRatio: CropRatio
    @State private var cropRect: CGRect = .zero
    @State private var cropDisplayRect: CGRect = .zero
    @State private var cropBackdrop: UIImage?
    @State private var cropInitialized = false
    @State private var cropGeneration = 0
    /// Whether the user has actually engaged the crop frame this session — a
    /// crop is only baked into the edit state when this is set (or a crop
    /// already exists), so opening and closing the tool is a true no-op.
    @State private var cropDirty = false

    public init(
        image: UIImage,
        context: MediaPreviewContext,
        accentColor: String = MeeshyColors.brandPrimaryHex,
        onAccept: @escaping (UIImage) -> Void,
        onCancel: (() -> Void)? = nil
    ) {
        self.accentColor = accentColor
        self.onAccept = onAccept
        self.onCancel = onCancel
        _viewModel = StateObject(wrappedValue: ImageEditorViewModel(image: image, context: context))
        _cropRatio = State(initialValue: context.preferredCropRatio ?? .free)
    }

    private var isDark: Bool { theme.mode.isDark }
    private var accent: Color { Color(hex: accentColor) }

    /// VRAIS safe-area insets de la fenêtre. `.statusBarHidden(true)` (plus bas)
    /// remet `safeAreaInsets = 0` dans l'environnement SwiftUI ; le chrome
    /// (top bar, FABs, panneau) passerait alors sous la Dynamic Island / home
    /// indicator. La racine de la fenêtre les a mesurées hors de `body` — on les
    /// applique au chrome, en laissant le canvas immersif, sans jamais lire la
    /// fenêtre pendant le rendu (#12470).
    private var deviceSafeAreaInsets: UIEdgeInsets {
        let insets = SceneWindowSize.resolveInsets(sceneSafeAreaInsets)
        return UIEdgeInsets(top: insets.top, left: insets.leading, bottom: insets.bottom, right: insets.trailing)
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            GeometryReader { geo in
                canvasContent(in: geo.size)
            }

            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 0)
            }
            .padding(.top, deviceSafeAreaInsets.top)

            if activeTool == nil {
                toolFABColumn
                sideFABColumn
            }

            if let tool = activeTool {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    controllerPanel(for: tool)
                }
                .padding(.bottom, deviceSafeAreaInsets.bottom)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            if showHistory {
                ImageEditorHistoryOverlay(
                    steps: viewModel.historySteps,
                    currentStepID: viewModel.currentHistoryStepID,
                    accentColor: accentColor,
                    onJump: { id in
                        viewModel.jump(to: id)
                        resetInspection()
                    },
                    onClose: {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { showHistory = false }
                    }
                )
                    .transition(.opacity)
            }
        }
        .statusBarHidden(true)
        .task { viewModel.loadFilterThumbnails() }
    }

    // MARK: - Canvas

    private func canvasContent(in size: CGSize) -> some View {
        let topInset: CGFloat = 60
        let bottomInset: CGFloat = activeTool == nil ? 92 : min(size.height * 0.52, 320)
        let areaHeight = max(size.height - topInset - bottomInset, 140)
        let area = CGSize(width: size.width, height: areaHeight)

        return ZStack {
            if activeTool == .crop {
                cropCanvas(in: area)
            } else {
                imageCanvas
            }
        }
        .frame(width: area.width, height: area.height)
        .position(x: size.width / 2, y: topInset + areaHeight / 2)
        .animation(.spring(response: 0.36, dampingFraction: 0.86), value: activeTool)
    }

    private var imageCanvas: some View {
        Image(uiImage: displayedImage)
            .resizable()
            .scaledToFit()
            .scaleEffect(zoom)
            .offset(pan)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .overlay(alignment: .top) { compareBadge }
            .contentShape(Rectangle())
            .simultaneousGesture(magnifyGesture)
            .simultaneousGesture(panGesture)
            .onTapGesture(count: 2) { toggleZoom() }
            .onLongPressGesture(
                minimumDuration: 0.25,
                maximumDistance: 30,
                perform: { beginComparing() },
                onPressingChanged: { pressing in if !pressing { endComparing() } }
            )
            .animation(.easeOut(duration: 0.16), value: isComparing)
    }

    private var displayedImage: UIImage {
        if isComparing, let beforeImage { return beforeImage }
        return viewModel.previewImage
    }

    @ViewBuilder
    private var compareBadge: some View {
        if isComparing {
            Text(String(localized: "media.editor.before", defaultValue: "Original", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.xsPlus)
                .background(Capsule().fill(.black.opacity(0.55)))
                .transition(.opacity)
        }
    }

    // MARK: - Crop Canvas

    private func cropCanvas(in size: CGSize) -> some View {
        let backdrop = cropBackdrop ?? viewModel.working
        let area = CGSize(width: max(size.width - 32, 80), height: max(size.height - 32, 80))
        let displayRect = ImageEditorCropGeometry.fittedRect(for: backdrop.size, in: area)

        return ZStack {
            Image(uiImage: backdrop)
                .resizable()
                .scaledToFit()
                .frame(width: displayRect.width, height: displayRect.height)
                .position(x: area.width / 2, y: area.height / 2)
                .opacity(0.32)

            CropOverlayView(
                cropRect: $cropRect,
                imageDisplayRect: displayRect,
                aspectRatio: cropRatio.aspectRatio,
                image: backdrop,
                onInteraction: { cropDirty = true }
            )
            .frame(width: area.width, height: area.height)
        }
        .frame(width: area.width, height: area.height)
        .id(cropGeneration)
        .onAppear {
            cropDisplayRect = displayRect
            ensureCropInitialized(displayRect)
        }
        .adaptiveOnChange(of: cropRatio) { _, ratio in
            adjustCrop(toRatio: ratio.aspectRatio, in: displayRect)
        }
        .adaptiveOnChange(of: area) { _, _ in
            cropInitialized = false
            cropGeneration += 1
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: MeeshySpacing.md) {
            glassCircleButton(
                icon: "xmark",
                label: String(localized: "media.editor.cancel", defaultValue: "Annuler", bundle: .module)
            ) {
                cancelEditing()
            }

            Spacer(minLength: 0)

            ImageEditorModeSwitcher(mode: viewModel.mode, isDark: isDark) { newMode in
                viewModel.setMode(newMode)
                if newMode == .simple, activeTool == .effects {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
                        activeTool = nil
                    }
                }
            }

            Spacer(minLength: 0)

            doneButton
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.sm)
    }

    private var doneButton: some View {
        Button(action: finish) {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: "checkmark")
                    .font(.system(size: MeeshyIconSize.xs, weight: .bold))
                Text(String(localized: "media.editor.done", defaultValue: "Termin\u{00E9}", bundle: .module))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                Capsule()
                    .fill(theme.buttonGradient(color: accentColor))
                    .shadow(color: theme.buttonShadow(color: accentColor), radius: 8, y: 3)
            )
        }
        .accessibilityLabel(Text(String(localized: "media.editor.done", defaultValue: "Termin\u{00E9}", bundle: .module)))
    }

    // MARK: - Floating FAB clusters

    /// Tool FABs — bottom-leading. Hidden while a controller is open.
    private var toolFABColumn: some View {
        VStack(spacing: MeeshySpacing.md) {
            ForEach(EditorTool.rail(for: viewModel.mode)) { tool in
                fab(icon: tool.icon, size: 54, accessibilityLabel: tool.label) {
                    selectTool(tool)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .padding(.leading, MeeshySpacing.lg)
        .padding(.bottom, 22 + deviceSafeAreaInsets.bottom)
        .transition(.move(edge: .leading).combined(with: .opacity))
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: viewModel.mode)
    }

    /// History FABs — bottom-trailing. Hidden while a controller is open.
    private var sideFABColumn: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            if viewModel.hasEdits {
                fab(icon: "clock.arrow.circlepath", size: 46,
                    accessibilityLabel: String(localized: "media.editor.history", defaultValue: "Historique", bundle: .module)) {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { showHistory = true }
                }
            }
            fab(icon: "arrow.uturn.forward", size: 46, enabled: viewModel.canRedo,
                accessibilityLabel: String(localized: "media.editor.redo", defaultValue: "R\u{00E9}tablir", bundle: .module)) {
                viewModel.redo()
            }
            fab(icon: "arrow.uturn.backward", size: 46, enabled: viewModel.canUndo,
                accessibilityLabel: String(localized: "media.editor.undo", defaultValue: "Annuler la modification", bundle: .module)) {
                viewModel.undo()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        .padding(.trailing, MeeshySpacing.lg)
        .padding(.bottom, 22 + deviceSafeAreaInsets.bottom)
        .transition(.move(edge: .trailing).combined(with: .opacity))
        .animation(.easeInOut(duration: 0.2), value: viewModel.hasEdits)
    }

    private func fab(
        icon: String,
        size: CGFloat,
        active: Bool = false,
        enabled: Bool = true,
        accessibilityLabel: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            guard enabled else { return }
            HapticFeedback.medium()
            action()
        } label: {
            Image(systemName: icon)
                .font(.system(size: size * 0.36, weight: .semibold))
                .foregroundColor(active ? .white : (enabled ? theme.textPrimary : theme.textMuted))
                .frame(width: size, height: size)
                .background(
                    Circle().fill(active
                                  ? AnyShapeStyle(theme.buttonGradient(color: accentColor))
                                  : AnyShapeStyle(.ultraThinMaterial))
                )
                .overlay(
                    Circle().strokeBorder(active ? Color.clear : accent.opacity(0.35), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.18), radius: 6, y: 3)
                .opacity(enabled ? 1 : 0.5)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(Text(accessibilityLabel))
    }

    // MARK: - Controller Panel

    private func controllerPanel(for tool: EditorTool) -> some View {
        ImageEditorControllerPanel(
            tool: tool,
            mode: viewModel.mode,
            canUndo: viewModel.canUndo,
            canRedo: viewModel.canRedo,
            accentColor: accentColor,
            drag: $controllerDrag,
            onSelect: { selectTool($0) },
            onUndo: { viewModel.undo() },
            onRedo: { viewModel.redo() },
            onClose: { closeController() }
        ) {
            toolContent(for: tool)
        }
    }

    @ViewBuilder
    private func toolContent(for tool: EditorTool) -> some View {
        switch tool {
        case .crop:
            ImageEditorCropPanel(
                isPro: viewModel.mode.isPro,
                accentColor: accentColor,
                cropRatio: $cropRatio,
                onRatioPicked: { cropDirty = true },
                onRotate: { rotate(clockwise: $0) },
                onFlip: { flip(horizontal: $0) }
            )
        case .filters:
            ImageEditorFiltersPanel(viewModel: viewModel, accent: accent)
        case .adjust:
            ImageEditorAdjustPanel(viewModel: viewModel, accent: accent)
        case .effects:
            ImageEditorEffectsPanel(viewModel: viewModel, accent: accent)
        }
    }

    // MARK: - Shared Controls

    private func glassCircleButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: MeeshyIconSize.sm, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .frame(width: MeeshyControlSize.large, height: MeeshyControlSize.large)
                .background(Circle().fill(.ultraThinMaterial))
                .overlay(Circle().strokeBorder(accent.opacity(0.3), lineWidth: 1))
                .shadow(color: .black.opacity(0.16), radius: 5, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    // MARK: - Gestures

    private var magnifyGesture: some Gesture {
        // MagnificationGesture (iOS 13+) au lieu de MagnifyGesture (iOS 17+).
        // `value` est directement le CGFloat de magnification (pas via .magnification).
        MagnificationGesture()
            .onChanged { value in
                zoom = min(max(zoomAnchor * value, 1), 6)
            }
            .onEnded { _ in
                zoomAnchor = zoom
                if zoom <= 1.01 {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
                        resetInspection()
                    }
                }
            }
    }

    private var panGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                guard zoom > 1 else { return }
                pan = CGSize(
                    width: panAnchor.width + value.translation.width,
                    height: panAnchor.height + value.translation.height
                )
            }
            .onEnded { _ in panAnchor = pan }
    }

    private func toggleZoom() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
            if zoom > 1 {
                resetInspection()
            } else {
                zoom = 2.4
                zoomAnchor = 2.4
            }
        }
    }

    private func resetInspection() {
        zoom = 1
        zoomAnchor = 1
        pan = .zero
        panAnchor = .zero
    }

    private func beginComparing() {
        guard viewModel.hasEdits else { return }
        beforeImage = viewModel.comparisonImage()
        isComparing = true
        HapticFeedback.light()
    }

    private func endComparing() {
        isComparing = false
    }

    // MARK: - Tool selection

    private func selectTool(_ tool: EditorTool) {
        let wasCrop = (activeTool == .crop)
        let willClose = (activeTool == tool)
        let nextTool: EditorTool? = willClose ? nil : tool

        if wasCrop, nextTool != .crop { bakeCrop() }

        withAnimation(.spring(response: 0.36, dampingFraction: 0.84)) {
            activeTool = nextTool
            controllerDrag = 0
        }

        if nextTool == .crop { enterCrop() }
        if nextTool == .filters { viewModel.loadFilterThumbnails() }
        HapticFeedback.light()
    }

    private func closeController() {
        if activeTool == .crop { bakeCrop() }
        withAnimation(.spring(response: 0.36, dampingFraction: 0.84)) {
            activeTool = nil
            controllerDrag = 0
        }
        HapticFeedback.light()
    }

    private func enterCrop() {
        cropBackdrop = viewModel.cropBackdrop()
        cropInitialized = false
        cropDirty = false
        cropGeneration += 1
    }

    // MARK: - Crop helpers

    private func ensureCropInitialized(_ displayRect: CGRect) {
        guard !cropInitialized, displayRect.width > 1, displayRect.height > 1 else { return }
        cropRect = ImageEditorCropGeometry.initialCrop(
            normalized: viewModel.state.cropNormalized,
            ratio: cropRatio.aspectRatio,
            in: displayRect
        )
        cropDisplayRect = displayRect
        cropInitialized = true
    }

    private func adjustCrop(toRatio ratio: Double?, in displayRect: CGRect) {
        guard let adjusted = ImageEditorCropGeometry.crop(cropRect, adjustedTo: ratio, in: displayRect) else { return }
        guard ratio != nil else {
            cropRect = adjusted
            return
        }
        withAnimation(.spring(response: 0.26, dampingFraction: 0.85)) {
            cropRect = adjusted
        }
    }

    private func bakeCrop() {
        guard cropDirty || viewModel.state.cropNormalized != nil else { return }
        guard let baked = ImageEditorCropGeometry.bake(cropRect: cropRect, in: cropDisplayRect) else { return }
        let target: CGRect?
        switch baked {
        case .fullFrame: target = nil
        case .region(let region): target = region
        }

        viewModel.perform(String(localized: "media.editor.crop.applied", defaultValue: "Recadrage", bundle: .module)) {
            $0.cropNormalized = target
        }
    }

    private func rotate(clockwise: Bool) {
        bakeCrop()
        viewModel.perform(String(localized: "media.editor.rotation", defaultValue: "Rotation", bundle: .module)) {
            clockwise ? $0.rotateClockwise() : $0.rotateCounterClockwise()
        }
        cropBackdrop = viewModel.cropBackdrop()
        cropInitialized = false
        cropDirty = false
        cropGeneration += 1
        HapticFeedback.light()
    }

    private func flip(horizontal: Bool) {
        bakeCrop()
        viewModel.perform(String(localized: "media.editor.flip", defaultValue: "Miroir", bundle: .module)) {
            horizontal ? $0.toggleFlipHorizontal() : $0.toggleFlipVertical()
        }
        cropBackdrop = viewModel.cropBackdrop()
        cropInitialized = false
        cropDirty = false
        cropGeneration += 1
        HapticFeedback.light()
    }

    // MARK: - Lifecycle actions

    private func finish() {
        if activeTool == .crop { bakeCrop() }
        let result = viewModel.export()
        HapticFeedback.success()
        onAccept(result)
        dismiss()
    }

    private func cancelEditing() {
        onCancel?()
        dismiss()
    }
}
