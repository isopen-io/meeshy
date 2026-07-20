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
        //
        // L'export N'EST PLUS un bouton d'en-tête (il chevauchait la dernière
        // chip du tool switcher). Il vit désormais dans le transport, juste
        // après la lecture (`TransportBar.onSave`, user 2026-07-20).
        container
    }

    @ViewBuilder
    private var container: some View {
        if let previewSlot {
            StoryTimelineView(viewModel: viewModel, onExport: onExport, previewSlot: previewSlot)
        } else {
            StoryTimelineView(viewModel: viewModel, onExport: onExport)
        }
    }
}
