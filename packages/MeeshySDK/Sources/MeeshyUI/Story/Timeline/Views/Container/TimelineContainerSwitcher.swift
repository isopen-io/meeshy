import SwiftUI

/// Picks Quick or Pro container based on horizontal size class (rotation /
/// iPad / split view) but lets the user override via the explicit mode switch
/// in the transport row. State (`selectedClipId`, `currentTime`, `zoomScale`)
/// lives in `TimelineViewModel` so a swap never loses anything.
public struct TimelineContainerSwitcher: View {

    @Bindable private var viewModel: TimelineViewModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let previewSlot: (() -> AnyView)?

    public init(viewModel: TimelineViewModel,
                @ViewBuilder previewSlot: @escaping () -> some View) {
        self.viewModel = viewModel
        self.previewSlot = { AnyView(previewSlot()) }
    }

    public init(viewModel: TimelineViewModel) {
        self.viewModel = viewModel
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
        Group {
            switch viewModel.mode {
            case .quick:
                if let previewSlot {
                    QuickTimelineView(viewModel: viewModel, previewSlot: previewSlot)
                } else {
                    QuickTimelineView(viewModel: viewModel)
                }
            case .pro:
                if let previewSlot {
                    ProTimelineView(viewModel: viewModel, previewSlot: previewSlot)
                } else {
                    ProTimelineView(viewModel: viewModel)
                }
            }
        }
        .animation(reduceMotion ? .none : .spring(response: 0.5, dampingFraction: 0.8), value: viewModel.mode)
        .onChange(of: horizontalSizeClass) { _, newValue in
            let resolved = Self.resolveAutoMode(horizontalSizeClass: newValue, currentMode: viewModel.mode)
            guard resolved != viewModel.mode else { return }
            viewModel.setMode(resolved)
        }
    }
}
