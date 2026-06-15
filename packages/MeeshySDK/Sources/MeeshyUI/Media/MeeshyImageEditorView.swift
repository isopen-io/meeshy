import MeeshySDK
import SwiftUI
import UIKit

// MARK: - Editor Tool

/// One tool reachable from the floating FAB cluster. `CaseIterable` drives the
/// FAB column and the in-controller tool switcher.
enum EditorTool: String, CaseIterable, Identifiable {
    case crop, filters, adjust, effects

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .crop: return "crop"
        case .filters: return "camera.filters"
        case .adjust: return "slider.horizontal.3"
        case .effects: return "sparkles"
        }
    }

    var label: String {
        switch self {
        case .crop: return String(localized: "media.editor.tool.crop", defaultValue: "Recadrer", bundle: .module)
        case .filters: return String(localized: "media.editor.tool.filters", defaultValue: "Filtres", bundle: .module)
        case .adjust: return String(localized: "media.editor.tool.adjust", defaultValue: "Ajuster", bundle: .module)
        case .effects: return String(localized: "media.editor.tool.effects", defaultValue: "Effets", bundle: .module)
        }
    }

    /// Tools available in Simple mode. Pro mode exposes every tool.
    var isEssential: Bool { self != .effects }

    static func rail(for mode: ImageEditorMode) -> [EditorTool] {
        mode.isPro ? allCases : allCases.filter(\.isEssential)
    }
}

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
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first(where: { $0.isKeyWindow })?.safeAreaInsets ?? .zero
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
                historyOverlay
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
            .padding(.horizontal, 14)
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
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
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
        HStack(spacing: 12) {
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
        .padding(.horizontal, 14)
        .padding(.top, 8)
    }

    private var doneButton: some View {
        Button(action: finish) {
            HStack(spacing: 5) {
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .bold))
                Text(String(localized: "media.editor.done", defaultValue: "Termin\u{00E9}", bundle: .module))
                    .font(.system(size: 15, weight: .bold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
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
        VStack(spacing: 12) {
            ForEach(EditorTool.rail(for: viewModel.mode)) { tool in
                fab(icon: tool.icon, size: 54, accessibilityLabel: tool.label) {
                    selectTool(tool)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .padding(.leading, 16)
        .padding(.bottom, 22 + deviceSafeAreaInsets.bottom)
        .transition(.move(edge: .leading).combined(with: .opacity))
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: viewModel.mode)
    }

    /// History FABs — bottom-trailing. Hidden while a controller is open.
    private var sideFABColumn: some View {
        VStack(spacing: 10) {
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
        .padding(.trailing, 16)
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
        VStack(spacing: 12) {
            controllerHandle
            controllerHeader(for: tool)
            toolContent(for: tool)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .strokeBorder(accent.opacity(0.18), lineWidth: 0.5)
                )
                .shadow(color: .black.opacity(isDark ? 0.45 : 0.16), radius: 16, y: -4)
        )
        .padding(.horizontal, 8)
        .padding(.bottom, 8)
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
        HStack(spacing: 8) {
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
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(isActive ? .white : theme.textSecondary)
                .frame(width: 38, height: 34)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
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
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(enabled ? theme.textPrimary : theme.textMuted)
                .frame(width: 32, height: 32)
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
        VStack(spacing: 14) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(cropRatios, id: \.label) { ratio in
                        ratioChip(ratio)
                    }
                }
                .padding(.horizontal, 2)
            }

            HStack(spacing: 10) {
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
                .font(.system(size: 13, weight: isSelected ? .bold : .medium))
                .foregroundColor(isSelected ? .white : theme.textSecondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
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
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(theme.inputBackground))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    // MARK: Filters Panel

    private var filtersPanel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(visibleFilters) { filter in
                    filterCell(filter)
                }
            }
            .padding(.horizontal, 2)
            .padding(.bottom, 4)
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
            VStack(spacing: 5) {
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
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(isSelected ? accent : .clear, lineWidth: 2.5)
                )

                Text(filter.displayName)
                    .font(.system(size: 10, weight: isSelected ? .bold : .medium))
                    .foregroundColor(isSelected ? accent : theme.textSecondary)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: Adjust Panel

    private var adjustPanel: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 12) {
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
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(accent)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                }
            }
            .padding(.bottom, 6)
        }
        .frame(maxHeight: 230)
    }

    private var visibleAdjustments: [AdjustmentKind] {
        viewModel.mode.isPro ? AdjustmentKind.allCases : AdjustmentKind.allCases.filter(\.isEssential)
    }

    private func adjustmentRow(_ kind: AdjustmentKind) -> some View {
        let value = viewModel.state.adjustments[kind]
        let isActive = abs(value - kind.neutralValue) > 0.0001
        return HStack(spacing: 10) {
            Image(systemName: kind.icon)
                .font(.system(size: 12))
                .foregroundColor(isActive ? accent : theme.textMuted)
                .frame(width: 18)

            Text(kind.label)
                .font(.system(size: 12, weight: .medium))
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
                .font(.system(size: 10, weight: .semibold).monospacedDigit())
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
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(ImageEffect.allCases) { effect in
                    effectCell(effect)
                }
            }
            .padding(.bottom, 6)
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
            VStack(spacing: 6) {
                Image(systemName: effect.iconName)
                    .font(.system(size: 17))
                Text(effect.displayName)
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundColor(isSelected ? accent : theme.textSecondary)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isSelected ? accent.opacity(isDark ? 0.16 : 0.1) : theme.inputBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(isSelected ? accent : .clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - History Overlay

    private var historyOverlay: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.4)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { showHistory = false }
                }

            VStack(spacing: 0) {
                HStack {
                    Text(String(localized: "media.editor.history", defaultValue: "Historique", bundle: .module))
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { showHistory = false }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(theme.textSecondary)
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(theme.inputBackground))
                    }
                    .buttonStyle(.plain)
                }
                .padding(16)

                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(viewModel.historySteps.indices.reversed(), id: \.self) { index in
                            historyRow(index: index, step: viewModel.historySteps[index])
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 20)
                }
                .frame(maxHeight: 320)
            }
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24)
                    .fill(theme.backgroundSecondary)
                    .ignoresSafeArea(edges: .bottom)
            )
            .transition(.move(edge: .bottom))
        }
    }

    private func historyRow(index: Int, step: ImageEditHistoryStep) -> some View {
        let isCurrent = step.id == viewModel.currentHistoryStepID
        return Button {
            viewModel.jump(to: step.id)
            resetInspection()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(isCurrent ? AnyShapeStyle(theme.buttonGradient(color: accentColor)) : AnyShapeStyle(theme.inputBackground))
                        .frame(width: 30, height: 30)
                    Text("\(index)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(isCurrent ? .white : theme.textSecondary)
                }
                Text(step.label)
                    .font(.system(size: 13, weight: isCurrent ? .semibold : .regular))
                    .foregroundColor(isCurrent ? theme.textPrimary : theme.textSecondary)
                Spacer()
                if isCurrent {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(accent)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isCurrent ? accent.opacity(isDark ? 0.12 : 0.07) : .clear)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Shared Controls

    private func glassCircleButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .frame(width: 40, height: 40)
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

// MARK: - Crop Overlay View

/// Interactive crop frame with corner + edge handles. Aspect-ratio aware:
/// when `aspectRatio` is set, edge handles are hidden and corners resize
/// proportionally.
struct CropOverlayView: View {
    @Binding var cropRect: CGRect
    let imageDisplayRect: CGRect
    let aspectRatio: Double?
    let image: UIImage
    /// Fired once when the user first grabs a handle — lets the host know the
    /// crop frame was deliberately engaged.
    var onInteraction: () -> Void = {}

    private let handleSize: CGFloat = 24
    private let handleHitArea: CGFloat = 44
    private let minCropSize: CGFloat = 56

    @State private var isDragging = false
    @State private var activeHandle: CropHandle = .none
    @State private var lastTranslation: CGSize = .zero

    enum CropHandle {
        case none
        case topLeft, topRight, bottomLeft, bottomRight
        case top, bottom, left, right
        case center
    }

    var body: some View {
        ZStack {
            GeometryReader { geo in
                Path { path in
                    path.addRect(CGRect(origin: .zero, size: geo.size))
                    path.addRect(cropRect)
                }
                .fill(Color.black.opacity(0.6), style: FillStyle(eoFill: true))
            }
            .allowsHitTesting(false)

            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: imageDisplayRect.width, height: imageDisplayRect.height)
                .position(x: imageDisplayRect.midX, y: imageDisplayRect.midY)
                .mask(
                    Rectangle()
                        .frame(width: cropRect.width, height: cropRect.height)
                        .position(x: cropRect.midX, y: cropRect.midY)
                )

            CropFrameView(rect: cropRect)
            cropHandles
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    if !isDragging {
                        activeHandle = detectHandle(at: value.startLocation)
                        isDragging = true
                        lastTranslation = .zero
                        if activeHandle != .none { onInteraction() }
                    }
                    let delta = CGSize(
                        width: value.translation.width - lastTranslation.width,
                        height: value.translation.height - lastTranslation.height
                    )
                    lastTranslation = value.translation
                    updateCropRect(with: delta, handle: activeHandle)
                }
                .onEnded { _ in
                    isDragging = false
                    activeHandle = .none
                    lastTranslation = .zero
                    constrainCropRect()
                }
        )
    }

    private var cropHandles: some View {
        ZStack {
            cornerHandle(at: .topLeft)
            cornerHandle(at: .topRight)
            cornerHandle(at: .bottomLeft)
            cornerHandle(at: .bottomRight)

            if aspectRatio == nil {
                edgeHandle(at: .top)
                edgeHandle(at: .bottom)
                edgeHandle(at: .left)
                edgeHandle(at: .right)
            }
        }
    }

    private func cornerHandle(at handle: CropHandle) -> some View {
        let position: CGPoint = switch handle {
        case .topLeft: CGPoint(x: cropRect.minX, y: cropRect.minY)
        case .topRight: CGPoint(x: cropRect.maxX, y: cropRect.minY)
        case .bottomLeft: CGPoint(x: cropRect.minX, y: cropRect.maxY)
        case .bottomRight: CGPoint(x: cropRect.maxX, y: cropRect.maxY)
        default: .zero
        }

        return ZStack {
            Color.clear.frame(width: handleHitArea, height: handleHitArea)
            CornerHandleShape(corner: handle)
                .stroke(Color.white, lineWidth: 3)
                .frame(width: handleSize, height: handleSize)
                .shadow(color: .black.opacity(0.5), radius: 2)
        }
        .position(position)
    }

    private func edgeHandle(at handle: CropHandle) -> some View {
        let position: CGPoint = switch handle {
        case .top: CGPoint(x: cropRect.midX, y: cropRect.minY)
        case .bottom: CGPoint(x: cropRect.midX, y: cropRect.maxY)
        case .left: CGPoint(x: cropRect.minX, y: cropRect.midY)
        case .right: CGPoint(x: cropRect.maxX, y: cropRect.midY)
        default: .zero
        }

        let isHorizontal = handle == .top || handle == .bottom

        return ZStack {
            Color.clear.frame(width: handleHitArea, height: handleHitArea)
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.white)
                .frame(width: isHorizontal ? 30 : 4, height: isHorizontal ? 4 : 30)
                .shadow(color: .black.opacity(0.5), radius: 2)
        }
        .position(position)
    }

    private func detectHandle(at point: CGPoint) -> CropHandle {
        let threshold = handleHitArea / 2

        if distance(from: point, to: CGPoint(x: cropRect.minX, y: cropRect.minY)) < threshold { return .topLeft }
        if distance(from: point, to: CGPoint(x: cropRect.maxX, y: cropRect.minY)) < threshold { return .topRight }
        if distance(from: point, to: CGPoint(x: cropRect.minX, y: cropRect.maxY)) < threshold { return .bottomLeft }
        if distance(from: point, to: CGPoint(x: cropRect.maxX, y: cropRect.maxY)) < threshold { return .bottomRight }

        if aspectRatio == nil {
            if abs(point.y - cropRect.minY) < threshold && point.x > cropRect.minX && point.x < cropRect.maxX { return .top }
            if abs(point.y - cropRect.maxY) < threshold && point.x > cropRect.minX && point.x < cropRect.maxX { return .bottom }
            if abs(point.x - cropRect.minX) < threshold && point.y > cropRect.minY && point.y < cropRect.maxY { return .left }
            if abs(point.x - cropRect.maxX) < threshold && point.y > cropRect.minY && point.y < cropRect.maxY { return .right }
        }

        if cropRect.contains(point) { return .center }
        return .none
    }

    private func distance(from p1: CGPoint, to p2: CGPoint) -> CGFloat {
        sqrt(pow(p1.x - p2.x, 2) + pow(p1.y - p2.y, 2))
    }

    private func updateCropRect(with translation: CGSize, handle: CropHandle) {
        var newRect = cropRect

        switch handle {
        case .none:
            return
        case .center:
            newRect.origin.x += translation.width
            newRect.origin.y += translation.height
        case .topLeft:
            if let ratio = aspectRatio {
                let diagonal = min(translation.width, translation.height)
                newRect.origin.x += diagonal
                newRect.origin.y += diagonal / ratio
                newRect.size.width -= diagonal
                newRect.size.height -= diagonal / ratio
            } else {
                newRect.origin.x += translation.width
                newRect.origin.y += translation.height
                newRect.size.width -= translation.width
                newRect.size.height -= translation.height
            }
        case .topRight:
            if let ratio = aspectRatio {
                let change = max(translation.width, -translation.height)
                newRect.origin.y -= change / ratio
                newRect.size.width += change
                newRect.size.height += change / ratio
            } else {
                newRect.origin.y += translation.height
                newRect.size.width += translation.width
                newRect.size.height -= translation.height
            }
        case .bottomLeft:
            if let ratio = aspectRatio {
                let change = max(-translation.width, translation.height)
                newRect.origin.x -= change
                newRect.size.width += change
                newRect.size.height += change / ratio
            } else {
                newRect.origin.x += translation.width
                newRect.size.width -= translation.width
                newRect.size.height += translation.height
            }
        case .bottomRight:
            if let ratio = aspectRatio {
                let change = max(translation.width, translation.height)
                newRect.size.width += change
                newRect.size.height += change / ratio
            } else {
                newRect.size.width += translation.width
                newRect.size.height += translation.height
            }
        case .top:
            newRect.origin.y += translation.height
            newRect.size.height -= translation.height
        case .bottom:
            newRect.size.height += translation.height
        case .left:
            newRect.origin.x += translation.width
            newRect.size.width -= translation.width
        case .right:
            newRect.size.width += translation.width
        }

        if newRect.width >= minCropSize && newRect.height >= minCropSize {
            cropRect = newRect
        }
    }

    private func constrainCropRect() {
        var constrained = cropRect
        constrained.size.width = max(minCropSize, min(constrained.width, imageDisplayRect.width))
        constrained.size.height = max(minCropSize, min(constrained.height, imageDisplayRect.height))
        constrained.origin.x = max(imageDisplayRect.minX, min(constrained.origin.x, imageDisplayRect.maxX - constrained.width))
        constrained.origin.y = max(imageDisplayRect.minY, min(constrained.origin.y, imageDisplayRect.maxY - constrained.height))

        withAnimation(.easeOut(duration: 0.2)) {
            cropRect = constrained
        }
    }
}

// MARK: - Crop Frame View

private struct CropFrameView: View {
    let rect: CGRect

    var body: some View {
        ZStack {
            Rectangle()
                .stroke(Color.white, lineWidth: 1.5)
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
                .shadow(color: .black.opacity(0.3), radius: 2)

            GridLinesView()
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
        }
    }
}

// MARK: - Grid Lines View

private struct GridLinesView: View {
    var body: some View {
        GeometryReader { geo in
            ZStack {
                Path { path in
                    path.move(to: CGPoint(x: geo.size.width / 3, y: 0))
                    path.addLine(to: CGPoint(x: geo.size.width / 3, y: geo.size.height))
                    path.move(to: CGPoint(x: geo.size.width * 2 / 3, y: 0))
                    path.addLine(to: CGPoint(x: geo.size.width * 2 / 3, y: geo.size.height))
                }
                .stroke(Color.white.opacity(0.5), lineWidth: 0.5)

                Path { path in
                    path.move(to: CGPoint(x: 0, y: geo.size.height / 3))
                    path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height / 3))
                    path.move(to: CGPoint(x: 0, y: geo.size.height * 2 / 3))
                    path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height * 2 / 3))
                }
                .stroke(Color.white.opacity(0.5), lineWidth: 0.5)
            }
        }
    }
}

// MARK: - Corner Handle Shape

private struct CornerHandleShape: Shape {
    let corner: CropOverlayView.CropHandle

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let length = rect.width * 0.6

        switch corner {
        case .topLeft:
            path.move(to: CGPoint(x: 0, y: length))
            path.addLine(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: length, y: 0))
        case .topRight:
            path.move(to: CGPoint(x: rect.width - length, y: 0))
            path.addLine(to: CGPoint(x: rect.width, y: 0))
            path.addLine(to: CGPoint(x: rect.width, y: length))
        case .bottomLeft:
            path.move(to: CGPoint(x: 0, y: rect.height - length))
            path.addLine(to: CGPoint(x: 0, y: rect.height))
            path.addLine(to: CGPoint(x: length, y: rect.height))
        case .bottomRight:
            path.move(to: CGPoint(x: rect.width, y: rect.height - length))
            path.addLine(to: CGPoint(x: rect.width, y: rect.height))
            path.addLine(to: CGPoint(x: rect.width - length, y: rect.height))
        default:
            break
        }

        return path
    }
}
