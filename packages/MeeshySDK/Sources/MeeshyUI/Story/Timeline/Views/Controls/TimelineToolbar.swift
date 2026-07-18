import SwiftUI

/// Pro-Mode-only toolbar : undo / redo / snap toggle / ruler resolution.
/// Hidden in Quick Mode (which only exposes the transport row).
public struct TimelineToolbar: View {

    public let canUndo: Bool
    public let canRedo: Bool
    public let isSnapEnabled: Bool
    public let rulerResolutionSeconds: Float
    public let onUndo: () -> Void
    public let onRedo: () -> Void
    public let onSnapToggle: () -> Void

    public init(canUndo: Bool, canRedo: Bool, isSnapEnabled: Bool,
                rulerResolutionSeconds: Float,
                onUndo: @escaping () -> Void,
                onRedo: @escaping () -> Void,
                onSnapToggle: @escaping () -> Void) {
        self.canUndo = canUndo; self.canRedo = canRedo
        self.isSnapEnabled = isSnapEnabled
        self.rulerResolutionSeconds = rulerResolutionSeconds
        self.onUndo = onUndo; self.onRedo = onRedo; self.onSnapToggle = onSnapToggle
    }

    public static func formatRulerResolution(seconds: Float) -> String {
        if seconds < 1 {
            let ms = Int((seconds * 1000).rounded())
            return "RULER:\(ms)ms"
        }
        if seconds.truncatingRemainder(dividingBy: 1) == 0 {
            return "RULER:\(Int(seconds))s"
        }
        return String(format: "RULER:%.1fs", seconds)
    }

    public static func snapAccessibilityKey(isOn: Bool) -> String {
        isOn ? "story.timeline.a11y.snap.on" : "story.timeline.a11y.snap.off"
    }

    public var body: some View {
        HStack(spacing: 10) {
            undoButton
            redoButton
            divider
            snapToggle
            divider
            rulerLabel
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .frame(minHeight: 36)
        .background(rowBackground)
        // MARK: - Keyboard Shortcuts (iPad / external keyboard)
        // ⌘Z — undo, ⇧⌘Z — redo
        .background(keyboardShortcutOverlay)
    }

    /// iOS 26+: the parent band (`ComposerBottomBand`) is now real Liquid
    /// Glass — stacking another `.ultraThinMaterial` here would blur/dull the
    /// same refracted color the band already shows through, breaking the
    /// continuous-surface feel. Pre-26 the band stays opaque, so this row
    /// keeps its own material for visual grouping, exactly as before.
    @ViewBuilder
    private var rowBackground: some View {
        if #available(iOS 26.0, *) {
            Color.clear
        } else {
            Rectangle().fill(.ultraThinMaterial)
        }
    }

    /// Invisible overlay buttons wiring keyboard shortcuts for toolbar actions.
    private var keyboardShortcutOverlay: some View {
        Group {
            Button(action: onUndo) { EmptyView() }
                .keyboardShortcut("z", modifiers: .command)
                .opacity(0).allowsHitTesting(false)
            Button(action: onRedo) { EmptyView() }
                .keyboardShortcut("z", modifiers: [.command, .shift])
                .opacity(0).allowsHitTesting(false)
        }
    }

    // MARK: - Keyboard shortcut availability (testable)

    /// True when this toolbar wires keyboard shortcuts (always true — used in tests).
    public static let hasKeyboardShortcuts: Bool = true

    /// Documented HIG contract: effective touch target (visual frame + contentShape inset)
    /// must meet Apple's 44×44pt minimum. Undo/redo icons are 30×30 visual, extended
    /// via `.contentShape(Rectangle().inset(by: -7))` to effective 44×44pt.
    public static let minimumHitTargetSize = CGSize(width: 44, height: 44)

    // MARK: - Sub-views

    private var undoButton: some View {
        Button(action: onUndo) {
            Image(systemName: "arrow.uturn.backward")
                .frame(width: 30, height: 30)
                .contentShape(Rectangle().inset(by: -7))
        }
        .buttonStyle(.plain)
        .foregroundStyle(canUndo ? MeeshyColors.indigo600 : Color.secondary.opacity(0.4))
        .disabled(!canUndo)
        .accessibilityLabel(String(localized: "story.timeline.toolbar.undo", bundle: .module))
    }

    private var redoButton: some View {
        Button(action: onRedo) {
            Image(systemName: "arrow.uturn.forward")
                .frame(width: 30, height: 30)
                .contentShape(Rectangle().inset(by: -7))
        }
        .buttonStyle(.plain)
        .foregroundStyle(canRedo ? MeeshyColors.indigo600 : Color.secondary.opacity(0.4))
        .disabled(!canRedo)
        .accessibilityLabel(String(localized: "story.timeline.toolbar.redo", bundle: .module))
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.secondary.opacity(0.3))
            .frame(width: 1, height: 18)
            .accessibilityHidden(true)
    }

    private var snapToggle: some View {
        Button(action: onSnapToggle) {
            HStack(spacing: 4) {
                Circle()
                    .fill(isSnapEnabled ? MeeshyColors.success : Color.secondary.opacity(0.4))
                    .frame(width: 8, height: 8)
                Text(String(localized: "story.timeline.toolbar.snap", bundle: .module))
                    .font(.caption2.weight(.semibold))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(isSnapEnabled
                               ? MeeshyColors.indigo500.opacity(0.15)
                               : Color.gray.opacity(0.1))
            )
        }
        .buttonStyle(.plain)
        .foregroundStyle(isSnapEnabled ? MeeshyColors.indigo700 : Color.secondary)
        .accessibilityLabel(isSnapEnabled
            ? String(localized: "story.timeline.a11y.snap.on", bundle: .module)
            : String(localized: "story.timeline.a11y.snap.off", bundle: .module))
    }

    private var rulerLabel: some View {
        Text(Self.formatRulerResolution(seconds: rulerResolutionSeconds))
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .tracking(0.2)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(Color.gray.opacity(0.1)))
            .accessibilityHidden(true)
    }
}
