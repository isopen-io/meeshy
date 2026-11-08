import MeeshySDK
import SwiftUI

struct ImageEditorControllerPanel<Content: View>: View {
    let tool: EditorTool
    let mode: ImageEditorMode
    let canUndo: Bool
    let canRedo: Bool
    let accentColor: String
    @Binding var drag: CGFloat
    let onSelect: (EditorTool) -> Void
    let onUndo: () -> Void
    let onRedo: () -> Void
    let onClose: () -> Void
    @ViewBuilder let content: () -> Content

    @ResolvedThemePalette private var theme

    private var isDark: Bool { theme.mode.isDark }
    private var accent: Color { Color(hex: accentColor) }

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            handle
            header
            content()
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
        .offset(y: max(drag, 0))
    }

    private var handle: some View {
        Capsule()
            .fill(theme.textMuted.opacity(0.6))
            .frame(width: 40, height: 5)
            .frame(maxWidth: .infinity)
            .frame(height: 18)
            .contentShape(Rectangle())
            .gesture(
                DragGesture()
                    .onChanged { drag = $0.translation.height }
                    .onEnded { value in
                        if value.translation.height > 70 {
                            onClose()
                        }
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                            drag = 0
                        }
                    }
            )
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(EditorTool.rail(for: mode)) { candidate in
                toolChip(candidate, isActive: candidate == tool)
            }

            Spacer(minLength: 4)

            headerIcon("arrow.uturn.backward", enabled: canUndo, action: onUndo)
            headerIcon("arrow.uturn.forward", enabled: canRedo, action: onRedo)
            headerIcon("xmark", enabled: true, action: onClose)
        }
    }

    private func toolChip(_ tool: EditorTool, isActive: Bool) -> some View {
        Button {
            if !isActive { onSelect(tool) }
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
}
