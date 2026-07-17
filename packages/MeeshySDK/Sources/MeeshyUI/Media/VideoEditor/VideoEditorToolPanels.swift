import SwiftUI
import MeeshySDK

// MARK: - Localized Labels

/// Localized titles for `VideoEditorTool`/`VideoEditorToolCategory` — lives
/// here (MeeshyUI) and not on the enums themselves (MeeshySDK core,
/// `nonisolated`, no resource bundle). Same pattern as
/// `OpeningEffectChips.title(for:)`.
enum VideoEditorLabels {
    static func title(for category: VideoEditorToolCategory) -> String {
        switch category {
        case .edit:  return String(localized: "videoEditor.category.edit", defaultValue: "Découpe", bundle: .module)
        case .style: return String(localized: "videoEditor.category.style", defaultValue: "Habillage", bundle: .module)
        }
    }

    static func title(for tool: VideoEditorTool) -> String {
        switch tool {
        case .trim:     return String(localized: "videoEditor.tool.trim", defaultValue: "Rogner", bundle: .module)
        case .split:    return String(localized: "videoEditor.tool.split", defaultValue: "Diviser", bundle: .module)
        case .speed:    return String(localized: "videoEditor.tool.speed", defaultValue: "Vitesse", bundle: .module)
        case .crop:     return String(localized: "videoEditor.tool.crop", defaultValue: "Cadrer", bundle: .module)
        case .rotate:   return String(localized: "videoEditor.tool.rotate", defaultValue: "Pivoter", bundle: .module)
        case .filter:   return String(localized: "videoEditor.tool.filter", defaultValue: "Filtres", bundle: .module)
        case .adjust:   return String(localized: "videoEditor.tool.adjust", defaultValue: "Couleur", bundle: .module)
        case .audio:    return String(localized: "videoEditor.tool.audio", defaultValue: "Audio", bundle: .module)
        case .captions: return String(localized: "videoEditor.tool.captions", defaultValue: "Sous-titres", bundle: .module)
        }
    }
}

// MARK: - Band Container

/// Bottom band that hosts either the tool tile grid or an active tool's
/// controller — the video-editor equivalent of `ComposerBottomBand`.
struct VideoEditorBand: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private var accent: Color { Color(hex: viewModel.accentColor) }

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(theme.textMuted.opacity(0.5))
                .frame(width: 40, height: 5)
                .padding(.top, 8)
                .padding(.bottom, 4)

            content
                .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity)
        .background(
            theme.glassMaterial,
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(accent.opacity(0.18), lineWidth: 0.5)
        )
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { value in
                    if value.translation.height > 44 { viewModel.dismissPanel() }
                }
        )
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.panel {
        case .none:
            EmptyView()
        case .tiles(let category):
            VideoEditorTileGrid(viewModel: viewModel, category: category)
                .transition(.opacity)
        case .tool(let tool):
            VStack(spacing: 10) {
                VideoEditorToolHeader(viewModel: viewModel, tool: tool)
                VideoEditorToolController(viewModel: viewModel, tool: tool)
            }
            .transition(.opacity)
        }
    }
}

// MARK: - Tile Grid

struct VideoEditorTileGrid: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    let category: VideoEditorToolCategory
    @Environment(\.theme) private var theme

    private var accent: Color { Color(hex: viewModel.accentColor) }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(viewModel.tools(for: category)) { tool in
                    tile(tool)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
    }

    private func tile(_ tool: VideoEditorTool) -> some View {
        Button {
            viewModel.selectTool(tool)
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Circle().fill(accent.opacity(0.22)).frame(width: 38, height: 38)
                    Image(systemName: tool.icon)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(accent)
                }
                Text(VideoEditorLabels.title(for: tool))
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
            }
            .frame(width: 78, height: 78)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(accent.opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(accent.opacity(0.3), lineWidth: 0.8)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Tool Header

struct VideoEditorToolHeader: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    let tool: VideoEditorTool
    @Environment(\.theme) private var theme

    var body: some View {
        HStack {
            Button {
                viewModel.backToTiles()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .bold))
                    Text(VideoEditorLabels.title(for: tool))
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(theme.textPrimary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(theme.glassMaterial, in: Capsule())
            }
            .buttonStyle(.plain)

            Spacer()

            Button {
                viewModel.dismissPanel()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(theme.textMuted)
                    .frame(width: 26, height: 26)
                    .background(theme.glassMaterial, in: Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 2)
    }
}

// MARK: - Tool Controller Dispatcher

struct VideoEditorToolController: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    let tool: VideoEditorTool

    var body: some View {
        Group {
            switch tool {
            case .trim:     TrimController(viewModel: viewModel)
            case .split:    SplitController(viewModel: viewModel)
            case .speed:    SpeedController(viewModel: viewModel)
            case .crop:     CropController(viewModel: viewModel)
            case .rotate:   RotateController(viewModel: viewModel)
            case .filter:   FilterController(viewModel: viewModel)
            case .adjust:   AdjustController(viewModel: viewModel)
            case .audio:    AudioController(viewModel: viewModel)
            case .captions: VideoEditorCaptionsPanel(viewModel: viewModel)
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Shared chip

struct EditorChip: View {
    let title: String
    let systemImage: String?
    let isActive: Bool
    let accent: Color
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 11, weight: .semibold))
                }
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(isActive ? Color.white : theme.textPrimary)
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(
                    isActive
                        ? AnyShapeStyle(MeeshyColors.brandGradient)
                        : AnyShapeStyle(accent.opacity(0.12))
                )
            )
            .overlay(
                Capsule().strokeBorder(accent.opacity(isActive ? 0 : 0.25), lineWidth: 0.8)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Slider row

struct EditorSliderRow: View {
    let label: String
    let valueText: String
    let range: ClosedRange<Double>
    let accent: Color
    @Binding var value: Double
    let onCommit: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 2) {
            HStack {
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(theme.textSecondary)
                Spacer()
                Text(valueText)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(theme.textPrimary)
            }
            Slider(value: $value, in: range) { editing in
                if !editing { onCommit() }
            }
            .tint(accent)
        }
    }
}

// MARK: - Trim Controller

/// Bottom-band controller for the Trim tool.
///
/// **Design** : pas de filmstrip ici — la timeline principale (au-dessus
/// de la vidéo) accueille les **brackets in/out** et la zone dimmée
/// pendant que cet outil est actif. Ce panneau ne fournit que :
/// - le rappel numérique (début / durée / fin)
/// - 2 boutons « pose ici » qui ancrent in/out à la position de lecture
///   (le bouton équivalent à un drag fin sur les handles de la timeline)
/// - un bouton de remise à zéro
///
/// Garder le couple `bracketsOnTimeline` + `controlsHere` évite la
/// double-timeline que reprochait l'audit : la filmstrip qui doublonnait
/// sous la vidéo + dans le panneau a été supprimée.
struct TrimController: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private var accent: Color { Color(hex: viewModel.accentColor) }
    private var doc: VideoEditDocument { viewModel.document }
    private var trimDuration: Double { max(0, doc.outPoint - doc.inPoint) }
    private var canTrimStartHere: Bool {
        playheadAsSourceTime.map { $0 < doc.outPoint - VideoEditLimits.minSegmentDuration } ?? false
    }
    private var canTrimEndHere: Bool {
        playheadAsSourceTime.map { $0 > doc.inPoint + VideoEditLimits.minSegmentDuration } ?? false
    }
    /// Convertit la position de lecture (temps edité) en temps source —
    /// nécessaire car `settingInPoint` / `settingOutPoint` prennent du
    /// source time, alors que `playheadTime` est en temps edité.
    private var playheadAsSourceTime: Double? {
        doc.locate(editedTime: viewModel.playheadTime).map { $0.sourceTime }
    }

    var body: some View {
        VStack(spacing: 10) {
            readout

            HStack(spacing: 8) {
                anchorButton(
                    title: "Début ici",
                    systemImage: "arrow.right.to.line",
                    enabled: canTrimStartHere
                ) {
                    guard let src = playheadAsSourceTime else { return }
                    viewModel.apply(doc.settingInPoint(src))
                    HapticFeedback.medium()
                }

                anchorButton(
                    title: "Fin ici",
                    systemImage: "arrow.left.to.line",
                    enabled: canTrimEndHere
                ) {
                    guard let src = playheadAsSourceTime else { return }
                    viewModel.apply(doc.settingOutPoint(src))
                    HapticFeedback.medium()
                }

                resetButton
            }

            if !viewModel.mode.isPro {
                Text("Astuce : poignées disponibles sur la timeline principale.")
                    .font(.system(size: 10))
                    .foregroundStyle(theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding(.bottom, 4)
    }

    private var readout: some View {
        HStack(spacing: 14) {
            readoutCell(label: "Début", value: doc.inPoint)
            readoutDivider
            readoutCell(label: "Durée", value: trimDuration, color: accent)
            readoutDivider
            readoutCell(label: "Fin", value: doc.outPoint)
        }
        .frame(maxWidth: .infinity)
    }

    private func readoutCell(label: String, value: Double, color: Color? = nil) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(theme.textMuted)
            Text(timeString(value))
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundStyle(color ?? theme.textPrimary)
        }
        .frame(maxWidth: .infinity)
    }

    private var readoutDivider: some View {
        Rectangle()
            .fill(theme.textMuted.opacity(0.25))
            .frame(width: 1, height: 22)
    }

    private func anchorButton(title: String, systemImage: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: systemImage)
                    .font(.system(size: 11, weight: .semibold))
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(enabled
                          ? AnyShapeStyle(MeeshyColors.brandGradient)
                          : AnyShapeStyle(accent.opacity(0.15)))
            )
            .foregroundStyle(enabled ? Color.white : theme.textMuted)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private var resetButton: some View {
        Button {
            // Remet le segment unique sur la source complète. En Pro avec
            // plusieurs segments, on n'agit que sur les bornes de
            // l'ensemble — l'outil dédié pour défaire un split est dans
            // le panneau Diviser (merge).
            viewModel.apply(
                doc
                    .settingInPoint(0)
                    .settingOutPoint(doc.sourceDuration)
            )
            HapticFeedback.light()
        } label: {
            Image(systemName: "arrow.counterclockwise")
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 42, height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(accent.opacity(0.15))
                )
                .foregroundStyle(theme.textPrimary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "media.editor.reset", defaultValue: "Réinitialiser", bundle: .module))
    }

    private func timeString(_ seconds: Double) -> String {
        let value = max(0, seconds)
        return String(format: "%d:%04.1f", Int(value) / 60, value.truncatingRemainder(dividingBy: 60))
    }
}

// MARK: - Split Controller

struct SplitController: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private var accent: Color { Color(hex: viewModel.accentColor) }

    var body: some View {
        VStack(spacing: 10) {
            Button {
                viewModel.splitAtPlayhead()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "scissors")
                    Text("Diviser au point de lecture")
                }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(MeeshyColors.brandGradient)
                )
            }
            .buttonStyle(.plain)

            if viewModel.document.segments.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(viewModel.document.segments.enumerated()), id: \.element.id) { index, segment in
                            segmentCard(index: index, segment: segment)
                        }
                    }
                }
            } else {
                Text("Placez la tête de lecture puis divisez la vidéo en segments.")
                    .font(.system(size: 11))
                    .foregroundStyle(theme.textMuted)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.bottom, 4)
    }

    private func segmentCard(index: Int, segment: VideoSegment) -> some View {
        let isSelected = viewModel.selectedSegmentID == segment.id
        let count = viewModel.document.segments.count
        return VStack(spacing: 5) {
            Text("Segment \(index + 1)")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(theme.textPrimary)
            Text(String(format: "%.1fs", segment.playbackDuration))
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(theme.textMuted)
            HStack(spacing: 11) {
                if index > 0 {
                    cardButton("arrow.left", tint: theme.textSecondary) {
                        viewModel.moveSegment(segment.id, to: index - 1)
                    }
                    cardButton("arrow.triangle.merge", tint: accent) {
                        viewModel.mergeSegment(segment.id)
                    }
                }
                if index < count - 1 {
                    cardButton("arrow.right", tint: theme.textSecondary) {
                        viewModel.moveSegment(segment.id, to: index + 1)
                    }
                }
                if count > 1 {
                    cardButton("trash", tint: theme.error) {
                        viewModel.removeSegment(segment.id)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(accent.opacity(isSelected ? 0.25 : 0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(accent.opacity(isSelected ? 0.7 : 0.2), lineWidth: 1)
                )
        )
        .onTapGesture {
            viewModel.selectedSegmentID = isSelected ? nil : segment.id
            HapticFeedback.light()
        }
    }

    private func cardButton(_ icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(tint)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Speed Controller

struct SpeedController: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private var accent: Color { Color(hex: viewModel.accentColor) }
    private let presets: [Double] = [0.25, 0.5, 1, 1.5, 2, 3, 4]

    private var currentSpeed: Double {
        if viewModel.mode.isPro, let segment = viewModel.selectedSegment {
            return segment.speed
        }
        return viewModel.document.segments.first?.speed ?? 1
    }

    var body: some View {
        VStack(spacing: 8) {
            if viewModel.mode.isPro {
                Text(viewModel.selectedSegment == nil
                     ? "Toute la vidéo"
                     : "Segment sélectionné")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(presets, id: \.self) { speed in
                        EditorChip(
                            title: speedLabel(speed),
                            systemImage: nil,
                            isActive: abs(currentSpeed - speed) < 0.001,
                            accent: accent
                        ) {
                            applySpeed(speed)
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .padding(.bottom, 4)
    }

    private func applySpeed(_ speed: Double) {
        if viewModel.mode.isPro, let segment = viewModel.selectedSegment {
            viewModel.apply(viewModel.document.settingSpeed(speed, forSegment: segment.id))
        } else {
            viewModel.apply(viewModel.document.settingGlobalSpeed(speed))
        }
        HapticFeedback.light()
    }

    private func speedLabel(_ speed: Double) -> String {
        speed == speed.rounded() ? "\(Int(speed))×" : String(format: "%.2g×", speed)
    }
}

// MARK: - Crop Controller

struct CropController: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private var accent: Color { Color(hex: viewModel.accentColor) }
    private let ratios: [CropRatio] = [.free, .square, .ratio4x3, .ratio16x9, .ratio9x16]

    var body: some View {
        VStack(spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ratios, id: \.self) { ratio in
                        EditorChip(
                            title: ratio == .free ? "Original" : ratio.label,
                            systemImage: icon(for: ratio),
                            isActive: isActive(ratio),
                            accent: accent
                        ) {
                            viewModel.setCropRatio(ratio == .free ? nil : ratio)
                        }
                    }
                }
                .padding(.vertical, 2)
            }
            if let recommended = viewModel.context.preferredCropRatio {
                Text("Recommandé pour \(viewModel.context.contextLabel) : \(recommended.label)")
                    .font(.system(size: 10))
                    .foregroundStyle(theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.bottom, 4)
    }

    private func isActive(_ ratio: CropRatio) -> Bool {
        let crop = viewModel.document.crop
        if ratio == .free { return crop.isFull }
        guard !crop.isFull, let target = ratio.aspectRatio else { return false }
        let outAspect = (crop.width * viewModel.document.naturalWidth)
            / max(0.001, crop.height * viewModel.document.naturalHeight)
        return abs(outAspect - target) < 0.05
    }

    private func icon(for ratio: CropRatio) -> String {
        switch ratio {
        case .free:      return "rectangle.dashed"
        case .square:    return "square"
        case .ratio4x3:  return "rectangle"
        case .ratio16x9: return "rectangle.ratio.16.to.9"
        case .ratio9x16: return "rectangle.ratio.9.to.16"
        }
    }
}

// MARK: - Rotate Controller

struct RotateController: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private var accent: Color { Color(hex: viewModel.accentColor) }

    var body: some View {
        HStack(spacing: 14) {
            rotateButton(systemImage: "rotate.left", label: "Gauche") {
                viewModel.apply(viewModel.document.rotatedCounterClockwise())
                HapticFeedback.light()
            }
            VStack(spacing: 2) {
                Text("\(viewModel.document.rotationQuarterTurns * 90)°")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(theme.textPrimary)
                Text("Rotation")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
            }
            .frame(maxWidth: .infinity)
            rotateButton(systemImage: "rotate.right", label: "Droite") {
                viewModel.rotate()
            }
        }
        .padding(.vertical, 6)
        .padding(.bottom, 4)
    }

    private func rotateButton(systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: .semibold))
                Text(label)
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(accent)
            .frame(width: 84, height: 60)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(accent.opacity(0.14))
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Filter Controller

/// Filter chooser — tiles show the **current video frame with each filter
/// applied** instead of an abstract SF icon. The user gets a real preview
/// of what they'd be picking, exactly like Photos / Instagram / CapCut.
///
/// Implementation : a single representative frame (middle of the filmstrip)
/// is run through every `VideoFilterPreset.ciFilterName` ONCE when the
/// controller appears. The cache survives across rebuilds of this
/// controller — only the source frame changing invalidates it.
struct FilterController: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme
    @StateObject private var previewCache = VideoFilterPreviewCache()

    private var accent: Color { Color(hex: viewModel.accentColor) }

    /// Picks the source frame to feed into the filter pipeline. Middle of
    /// the filmstrip when available — it's typically the most
    /// representative frame and avoids the dark frame artifact common at
    /// the start/end of recordings.
    private var sourceFrame: UIImage? {
        let strip = viewModel.filmstrip
        guard !strip.isEmpty else { return nil }
        return strip[strip.count / 2]
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 9) {
                ForEach(VideoFilterPreset.allCases, id: \.self) { preset in
                    filterTile(preset)
                }
            }
            .padding(.vertical, 2)
        }
        .padding(.bottom, 4)
        .onAppear { refreshPreviewsIfNeeded() }
        .adaptiveOnChange(of: viewModel.filmstrip.count) { _, _ in
            refreshPreviewsIfNeeded()
        }
    }

    private func refreshPreviewsIfNeeded() {
        guard let source = sourceFrame else { return }
        previewCache.populate(from: source, version: viewModel.filmstrip.count)
    }

    @ViewBuilder
    private func filterTile(_ preset: VideoFilterPreset) -> some View {
        let isActive = viewModel.document.filter == preset
        Button {
            viewModel.setFilter(preset)
        } label: {
            VStack(spacing: 5) {
                tileThumbnail(preset, isActive: isActive)
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(accent, lineWidth: isActive ? 2 : 0)
                    )
                Text(preset.displayName)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(isActive ? theme.textPrimary : theme.textMuted)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(preset.displayName)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    @ViewBuilder
    private func tileThumbnail(_ preset: VideoFilterPreset, isActive: Bool) -> some View {
        if let preview = previewCache.preview(for: preset) {
            // Live preview : frame de la vidéo passée au CIFilter du preset.
            Image(uiImage: preview)
                .resizable()
                .scaledToFill()
                .overlay(
                    isActive
                        ? Color.clear
                        : Color.black.opacity(0.15)
                )
        } else {
            // Filmstrip pas encore prêt : on retombe sur l'icône SF pour ne
            // pas laisser un tile noir le temps de l'extraction des frames.
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(accent.opacity(isActive ? 0.3 : 0.12))
                Image(systemName: preset.iconName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(isActive ? accent : theme.textSecondary)
            }
        }
    }
}

// MARK: - Adjust Controller

struct AdjustController: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private var accent: Color { Color(hex: viewModel.accentColor) }

    var body: some View {
        VStack(spacing: 8) {
            EditorSliderRow(
                label: "Luminosité",
                valueText: String(format: "%+.0f", viewModel.document.color.brightness * 100),
                range: -0.5...0.5,
                accent: accent,
                value: binding(\.brightness),
                onCommit: { viewModel.commitPreview() }
            )
            EditorSliderRow(
                label: "Contraste",
                valueText: String(format: "%.0f%%", viewModel.document.color.contrast * 100),
                range: 0.5...1.5,
                accent: accent,
                value: binding(\.contrast),
                onCommit: { viewModel.commitPreview() }
            )
            EditorSliderRow(
                label: "Saturation",
                valueText: String(format: "%.0f%%", viewModel.document.color.saturation * 100),
                range: 0...2,
                accent: accent,
                value: binding(\.saturation),
                onCommit: { viewModel.commitPreview() }
            )
        }
        .padding(.bottom, 4)
    }

    private func binding(_ keyPath: WritableKeyPath<VideoColorAdjustment, Double>) -> Binding<Double> {
        Binding(
            get: { viewModel.document.color[keyPath: keyPath] },
            set: { newValue in
                var color = viewModel.document.color
                color[keyPath: keyPath] = newValue
                viewModel.preview(viewModel.document.settingColor(color))
            }
        )
    }
}

// MARK: - Audio Controller

struct AudioController: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    private var accent: Color { Color(hex: viewModel.accentColor) }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Son")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(theme.textSecondary)
                Spacer()
                Button {
                    viewModel.toggleMute()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: viewModel.document.audio.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        Text(viewModel.document.audio.isMuted ? "Muet" : "Actif")
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(viewModel.document.audio.isMuted ? theme.error : accent)
                }
                .buttonStyle(.plain)
            }

            EditorSliderRow(
                label: "Volume",
                valueText: String(format: "%.0f%%", viewModel.document.audio.volume * 100),
                range: 0...2,
                accent: accent,
                value: binding(\.volume),
                onCommit: { viewModel.commitPreview() }
            )
            EditorSliderRow(
                label: "Fondu d'entrée",
                valueText: String(format: "%.1fs", viewModel.document.audio.fadeIn),
                range: 0...5,
                accent: accent,
                value: binding(\.fadeIn),
                onCommit: { viewModel.commitPreview() }
            )
            EditorSliderRow(
                label: "Fondu de sortie",
                valueText: String(format: "%.1fs", viewModel.document.audio.fadeOut),
                range: 0...5,
                accent: accent,
                value: binding(\.fadeOut),
                onCommit: { viewModel.commitPreview() }
            )
        }
        .padding(.bottom, 4)
    }

    private func binding(_ keyPath: WritableKeyPath<VideoAudioSettings, Double>) -> Binding<Double> {
        Binding(
            get: { viewModel.document.audio[keyPath: keyPath] },
            set: { newValue in
                var audio = viewModel.document.audio
                audio[keyPath: keyPath] = newValue
                viewModel.preview(viewModel.document.settingAudio(audio))
            }
        )
    }
}
