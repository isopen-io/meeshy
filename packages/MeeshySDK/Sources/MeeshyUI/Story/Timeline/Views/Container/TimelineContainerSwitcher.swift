import SwiftUI

/// Picks Quick or Pro container based on horizontal size class (rotation /
/// iPad / split view) but lets the user override via the explicit mode switch
/// in the transport row. State (`selectedClipId`, `currentTime`, `zoomScale`)
/// lives in `TimelineViewModel` so a swap never loses anything.
public struct TimelineContainerSwitcher: View {

    @ObservedObject private var viewModel: TimelineViewModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    private let previewSlot: (() -> AnyView)?
    private let onExport: (() -> Void)?

    public init(viewModel: TimelineViewModel,
                onExport: (() -> Void)? = nil,
                @ViewBuilder previewSlot: @escaping () -> some View) {
        self.viewModel = viewModel
        self.onExport = onExport
        self.previewSlot = { AnyView(previewSlot()) }
    }

    public init(viewModel: TimelineViewModel,
                onExport: (() -> Void)? = nil) {
        self.viewModel = viewModel
        self.onExport = onExport
        self.previewSlot = nil
    }

    public static func resolveAutoMode(horizontalSizeClass: UserInterfaceSizeClass?,
                                       currentMode: TimelineMode) -> TimelineMode {
        switch horizontalSizeClass {
        case .compact: return .quick
        case .regular: return .pro
        case .none:    return currentMode
        @unknown default: return currentMode
        }
    }

    public var body: some View {
        VStack(spacing: 0) {
            modeSwitcherHeader
            container
        }
        // Glass material lives on the sheet itself
        // (`.presentationBackground(.ultraThinMaterial)`); doubling it here
        // would flatten the canvas blur. We leave this container transparent.
        .animation(reduceMotion ? .none : .spring(response: 0.5, dampingFraction: 0.8), value: viewModel.mode)
        .adaptiveOnChange(of: horizontalSizeClass) { _, newValue in
            let resolved = Self.resolveAutoMode(horizontalSizeClass: newValue, currentMode: viewModel.mode)
            guard resolved != viewModel.mode else { return }
            viewModel.setMode(resolved)
        }
    }

    @ViewBuilder
    private var container: some View {
        switch viewModel.mode {
        case .quick:
            if let previewSlot {
                QuickTimelineView(viewModel: viewModel, onExport: onExport, previewSlot: previewSlot)
            } else {
                QuickTimelineView(viewModel: viewModel, onExport: onExport)
            }
        case .pro:
            if let previewSlot {
                ProTimelineView(viewModel: viewModel, onExport: onExport, previewSlot: previewSlot)
            } else {
                ProTimelineView(viewModel: viewModel, onExport: onExport)
            }
        }
    }

    private var modeSwitcherHeader: some View {
        HStack {
            Spacer(minLength: 0)
            TimelineModeSwitcher(
                mode: viewModel.mode,
                isDark: colorScheme == .dark,
                onSelect: { target in
                    guard target != viewModel.mode else { return }
                    viewModel.setMode(target)
                }
            )
            .equatable()
            Spacer(minLength: 0)
        }
        // Top padding clears the system-rendered drag indicator (~14pt above
        // the sheet content) without crowding the segmented control.
        .padding(.top, 16)
        .padding(.bottom, 10)
        .padding(.horizontal, 12)
    }
}
