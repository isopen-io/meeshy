import SwiftUI

/// Hosts the single unified timeline (Quick design carrying the full editing
/// feature set — inspectors, snap, undo/redo). The former Simple/Pro switch
/// is gone: one surface adapts instead of two competing containers. State
/// (`selectedClipId`, `currentTime`, `zoomScale`) lives in `TimelineViewModel`.
public struct StoryTimelineHost: View {

    @ObservedObject private var viewModel: TimelineViewModel

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

    public var body: some View {
        // Glass material lives on the sheet itself
        // (`.presentationBackground(.ultraThinMaterial)`); doubling it here
        // would flatten the canvas blur. We leave this container transparent.
        VStack(spacing: 0) {
            header
            container
        }
    }

    @ViewBuilder
    private var container: some View {
        if let previewSlot {
            StoryTimelineView(viewModel: viewModel, previewSlot: previewSlot)
        } else {
            StoryTimelineView(viewModel: viewModel)
        }
    }

    /// Export en trailing (pattern éditeurs vidéo : action en haut à droite) —
    /// le transport row est déjà saturé en portrait. La rangée reste même
    /// sans export pour dégager le drag indicator système (~14pt).
    private var header: some View {
        HStack {
            Spacer(minLength: 0)
            exportHeaderButton
        }
        .padding(.top, 16)
        .padding(.bottom, 10)
        .padding(.horizontal, 12)
    }

    @ViewBuilder
    private var exportHeaderButton: some View {
        if let onExport {
            Button(action: onExport) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 34, height: 34)
                    .contentShape(Rectangle().inset(by: -5))
            }
            .buttonStyle(.plain)
            .foregroundStyle(MeeshyColors.indigo600)
            .accessibilityLabel(String(localized: "story.timeline.export.button",
                                       defaultValue: "Exporter en vidéo MP4",
                                       bundle: .module))
        }
    }
}
