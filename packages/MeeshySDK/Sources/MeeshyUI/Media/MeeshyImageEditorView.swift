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
    @ObservedObject private var theme = ThemeManager.shared
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
    /// indicator. La fenêtre expose toujours les insets physiques réels — on les
    /// applique au chrome, en laissant le canvas immersif. Même pattern que
    /// `MeeshyVideoEditorView` et `StoryComposerView.safeAreaBottomInset`.
    private var deviceSafeAreaInsets: UIEdgeInsets {
        let insets = SceneWindowSize.resolveInsets(sceneSafeAreaInsets, fallback: WindowMetrics.safeAreaEdgeInsets)
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
        let displayRect = Self.fittedRect(for: backdrop.size, in: area)

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
        VStack(spacing: MeeshySpacing.md) {
            controllerHandle
            controllerHeader(for: tool)
            toolContent(for: tool)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
        .padding(.bottom, MeeshySpacing.mdPlus)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
                        .strokeBorder(accent.opacity(0.18), lineWidth: MeeshyBorder.hairline)
                )
                .shadow(color: .black.opacity(isDark ? 0.45 : 0.16), radius: 16, y: -4)
        )
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.bottom, MeeshySpacing.sm)
        .frame(maxWidth: 620)
        .frame(maxWidth: .infinity)
        .offset(y: max(controllerDrag, 0))
    }

    private var controllerHandle: some View {
        Capsule()
            .fill(theme.textMuted.opacity(0.6))
            .frame(width: 40, height: 5)
            .frame(maxWidth: .infinity)
            .frame(height: 18)
            .contentShape(Rectangle())
            .gesture(
                DragGesture()
                    .onChanged { controllerDrag = $0.translation.height }
                    .onEnded { value in
                        if value.translation.height > 70 {
                            closeController()
                        }
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                            controllerDrag = 0
                        }
                    }
            )
    }

    private func controllerHeader(for tool: EditorTool) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(EditorTool.rail(for: viewModel.mode)) { candidate in
                toolChip(candidate, isActive: candidate == tool)
            }

            Spacer(minLength: 4)

            headerIcon("arrow.uturn.backward", enabled: viewModel.canUndo) { viewModel.undo() }
            headerIcon("arrow.uturn.forward", enabled: viewModel.canRedo) { viewModel.redo() }
            headerIcon("xmark", enabled: true) { closeController() }
        }
    }

    private func toolChip(_ tool: EditorTool, isActive: Bool) -> some View {
        Button {
            if !isActive { selectTool(tool) }
        } label: {
            Image(systemName: tool.icon)
                .font(.system(size: MeeshyIconSize.sm, weight: .semibold))
                .foregroundColor(isActive ? .white : theme.textSecondary)
                .frame(width: 38, height: 34)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                        .fill(isActive
                              ? AnyShapeStyle(theme.buttonGradient(color: accentColor))
                              : AnyShapeStyle(theme.inputBackground))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(tool.label))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    private func headerIcon(_ icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            guard enabled else { return }
            HapticFeedback.light()
            action()
        } label: {
            Image(systemName: icon)
                .font(.system(size: MeeshyIconSize.xs, weight: .bold))
                .foregroundColor(enabled ? theme.textPrimary : theme.textMuted)
                .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                .background(Circle().fill(theme.inputBackground.opacity(enabled ? 1 : 0.5)))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    @ViewBuilder
    private func toolContent(for tool: EditorTool) -> some View {
        switch tool {
        case .crop: cropPanel
        case .filters: filtersPanel
        case .adjust: adjustPanel
        case .effects: effectsPanel
        }
    }

    // MARK: Crop Panel

    private var cropPanel: some View {
        VStack(spacing: MeeshySpacing.mdPlus) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    ForEach(cropRatios, id: \.label) { ratio in
                        ratioChip(ratio)
                    }
                }
                .padding(.horizontal, MeeshySpacing.xxs)
            }

            HStack(spacing: MeeshySpacing.smPlus) {
                geometryButton("rotate.left",
                               label: String(localized: "media.editor.rotateLeft", defaultValue: "Pivoter \u{00E0} gauche", bundle: .module)) {
                    rotate(clockwise: false)
                }
                geometryButton("rotate.right",
                               label: String(localized: "media.editor.rotateRight", defaultValue: "Pivoter \u{00E0} droite", bundle: .module)) {
                    rotate(clockwise: true)
                }
                if viewModel.mode.isPro {
                    geometryButton("arrow.left.arrow.right",
                                   label: String(localized: "media.editor.flipH", defaultValue: "Miroir horizontal", bundle: .module)) {
                        flip(horizontal: true)
                    }
                    geometryButton("arrow.up.arrow.down",
                                   label: String(localized: "media.editor.flipV", defaultValue: "Miroir vertical", bundle: .module)) {
                        flip(horizontal: false)
                    }
                }
            }

            Text(String(localized: "media.editor.cropHint",
                         defaultValue: "Faites glisser les poign\u{00E9}es pour recadrer",
                         bundle: .module))
                .font(.system(size: 11))
                .foregroundColor(theme.textMuted)
        }
    }

    private var cropRatios: [CropRatio] {
        viewModel.mode.isPro
            ? [.free, .square, .ratio4x3, .ratio16x9, .ratio9x16]
            : [.free, .square, .ratio4x3, .ratio16x9]
    }

    private func ratioChip(_ ratio: CropRatio) -> some View {
        let isSelected = cropRatio == ratio
        return Button {
            HapticFeedback.light()
            cropDirty = true
            withAnimation(.spring(response: 0.26, dampingFraction: 0.82)) {
                cropRatio = ratio
            }
        } label: {
            Text(ratio.label)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: isSelected ? .bold : .medium))
                .foregroundColor(isSelected ? .white : theme.textSecondary)
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.sm)
                .background(
                    Capsule().fill(isSelected
                                   ? AnyShapeStyle(theme.buttonGradient(color: accentColor))
                                   : AnyShapeStyle(theme.inputBackground))
                )
        }
        .buttonStyle(.plain)
    }

    private func geometryButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: MeeshyIconSize.sm, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous).fill(theme.inputBackground))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    // MARK: Filters Panel

    private var filtersPanel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.md) {
                ForEach(visibleFilters) { filter in
                    filterCell(filter)
                }
            }
            .padding(.horizontal, MeeshySpacing.xxs)
            .padding(.bottom, MeeshySpacing.xs)
        }
    }

    private var visibleFilters: [ImageFilter] {
        viewModel.mode.isPro ? ImageFilter.allCases : ImageFilter.allCases.filter(\.isEssential)
    }

    private func filterCell(_ filter: ImageFilter) -> some View {
        let isSelected = viewModel.state.filter == filter
        return Button {
            HapticFeedback.light()
            viewModel.perform(filter.displayName) { $0.filter = filter }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                Group {
                    if let thumb = viewModel.filterThumbnails[filter] {
                        Image(uiImage: thumb)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else {
                        Rectangle()
                            .fill(theme.inputBackground)
                            .overlay(ProgressView().controlSize(.small))
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                        .strokeBorder(isSelected ? accent : .clear, lineWidth: MeeshyBorder.strong)
                )

                Text(filter.displayName)
                    .font(.system(size: MeeshyFont.captionSize, weight: isSelected ? .bold : .medium))
                    .foregroundColor(isSelected ? accent : theme.textSecondary)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: Adjust Panel

    private var adjustPanel: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: MeeshySpacing.md) {
                ForEach(visibleAdjustments) { kind in
                    adjustmentRow(kind)
                }
                if viewModel.state.adjustments.activeCount > 0 {
                    Button {
                        viewModel.perform(String(localized: "media.editor.resetAdjust", defaultValue: "Ajustements r\u{00E9}initialis\u{00E9}s", bundle: .module)) {
                            $0.adjustments = .neutral
                        }
                        HapticFeedback.light()
                    } label: {
                        Text(String(localized: "media.editor.reset", defaultValue: "R\u{00E9}initialiser", bundle: .module))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .foregroundColor(accent)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, MeeshySpacing.xxs)
                }
            }
            .padding(.bottom, MeeshySpacing.xsPlus)
        }
        .frame(maxHeight: 230)
    }

    private var visibleAdjustments: [AdjustmentKind] {
        viewModel.mode.isPro ? AdjustmentKind.toneCases : AdjustmentKind.toneCases.filter(\.isEssential)
    }

    private func adjustmentRow(_ kind: AdjustmentKind) -> some View {
        let value = viewModel.state.adjustments[kind]
        let isActive = abs(value - kind.neutralValue) > 0.0001
        return HStack(spacing: MeeshySpacing.smPlus) {
            Image(systemName: kind.icon)
                .font(.system(size: MeeshyIconSize.xs))
                .foregroundColor(isActive ? accent : theme.textMuted)
                .frame(width: 18)

            Text(kind.label)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .frame(width: 78, alignment: .leading)

            Slider(
                value: adjustmentBinding(kind),
                in: kind.range,
                onEditingChanged: { editing in
                    if !editing { viewModel.commit(kind.label) }
                }
            )
            .tint(accent)

            Text(formatAdjustment(value, kind: kind))
                .font(.system(size: MeeshyFont.captionSize, weight: .semibold).monospacedDigit())
                .foregroundColor(theme.textMuted)
                .frame(width: 34, alignment: .trailing)
        }
    }

    private func adjustmentBinding(_ kind: AdjustmentKind) -> Binding<Float> {
        Binding(
            get: { viewModel.state.adjustments[kind] },
            set: { newValue in viewModel.update { $0.adjustments[kind] = newValue } }
        )
    }

    private func formatAdjustment(_ value: Float, kind: AdjustmentKind) -> String {
        String(format: "%+.1f", value - kind.neutralValue)
    }

    // MARK: Effects Panel

    private var effectsPanel: some View {
        let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
        return ScrollView(.vertical, showsIndicators: false) {
            LazyVGrid(columns: columns, spacing: MeeshySpacing.smPlus) {
                ForEach(ImageEffect.allCases) { effect in
                    effectCell(effect)
                }
            }
            .padding(.bottom, MeeshySpacing.xsPlus)
        }
        .frame(maxHeight: 200)
    }

    private func effectCell(_ effect: ImageEffect) -> some View {
        let isSelected = viewModel.state.effect == effect
        return Button {
            HapticFeedback.light()
            viewModel.perform(effect.displayName) {
                $0.effect = ($0.effect == effect ? .none : effect)
            }
        } label: {
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: effect.iconName)
                    .font(.system(size: MeeshyIconSize.md))
                Text(effect.displayName)
                    .font(.system(size: MeeshyFont.captionSize, weight: .semibold))
            }
            .foregroundColor(isSelected ? accent : theme.textSecondary)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                    .fill(isSelected ? accent.opacity(isDark ? 0.16 : 0.1) : theme.inputBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                    .strokeBorder(isSelected ? accent : .clear, lineWidth: MeeshyBorder.emphasis)
            )
        }
        .buttonStyle(.plain)
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
        if let norm = viewModel.state.cropNormalized {
            cropRect = CGRect(
                x: displayRect.minX + norm.minX * displayRect.width,
                y: displayRect.minY + norm.minY * displayRect.height,
                width: norm.width * displayRect.width,
                height: norm.height * displayRect.height
            )
        } else if let ratio = cropRatio.aspectRatio {
            cropRect = Self.centeredRect(aspect: ratio, in: displayRect, fill: 0.92)
        } else {
            cropRect = displayRect
        }
        cropDisplayRect = displayRect
        cropInitialized = true
    }

    private func adjustCrop(toRatio ratio: Double?, in displayRect: CGRect) {
        guard displayRect.width > 1, displayRect.height > 1 else { return }
        guard let ratio else {
            if cropRect.width < 40 || cropRect.height < 40 {
                cropRect = displayRect
            }
            return
        }
        let centerX = cropRect.midX
        let centerY = cropRect.midY
        let maxWidth = min(cropRect.width, displayRect.width * 0.95)
        let maxHeight = min(cropRect.height, displayRect.height * 0.95)
        let width: CGFloat
        let height: CGFloat
        if maxWidth / ratio <= maxHeight {
            width = maxWidth
            height = maxWidth / ratio
        } else {
            height = maxHeight
            width = maxHeight * ratio
        }
        let proposed = CGRect(
            x: centerX - width / 2,
            y: centerY - height / 2,
            width: width,
            height: height
        )
        withAnimation(.spring(response: 0.26, dampingFraction: 0.85)) {
            cropRect = proposed.intersection(displayRect)
        }
    }

    private func bakeCrop() {
        guard cropDirty || viewModel.state.cropNormalized != nil else { return }
        let displayRect = cropDisplayRect
        guard displayRect.width > 1, displayRect.height > 1,
              cropRect.width > 1, cropRect.height > 1 else { return }

        let raw = CGRect(
            x: (cropRect.minX - displayRect.minX) / displayRect.width,
            y: (cropRect.minY - displayRect.minY) / displayRect.height,
            width: cropRect.width / displayRect.width,
            height: cropRect.height / displayRect.height
        )
        let normalized = raw.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        guard normalized.width > 0.02, normalized.height > 0.02 else { return }

        let isFullFrame = normalized.minX < 0.006 && normalized.minY < 0.006
            && normalized.width > 0.988 && normalized.height > 0.988
        let target: CGRect? = isFullFrame ? nil : normalized

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

    // MARK: - Geometry helpers

    static func fittedRect(for imageSize: CGSize, in container: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0,
              container.width > 0, container.height > 0 else {
            return CGRect(x: 0, y: 0, width: max(container.width, 1), height: max(container.height, 1))
        }
        let imageAspect = imageSize.width / imageSize.height
        let containerAspect = container.width / container.height
        let size: CGSize
        if imageAspect > containerAspect {
            size = CGSize(width: container.width, height: container.width / imageAspect)
        } else {
            size = CGSize(width: container.height * imageAspect, height: container.height)
        }
        return CGRect(
            x: (container.width - size.width) / 2,
            y: (container.height - size.height) / 2,
            width: size.width,
            height: size.height
        )
    }

    static func centeredRect(aspect ratio: Double, in bounds: CGRect, fill: CGFloat) -> CGRect {
        let maxWidth = bounds.width * fill
        let maxHeight = bounds.height * fill
        let width: CGFloat
        let height: CGFloat
        if maxWidth / ratio <= maxHeight {
            width = maxWidth
            height = maxWidth / ratio
        } else {
            height = maxHeight
            width = maxHeight * ratio
        }
        return CGRect(
            x: bounds.midX - width / 2,
            y: bounds.midY - height / 2,
            width: width,
            height: height
        )
    }
}
