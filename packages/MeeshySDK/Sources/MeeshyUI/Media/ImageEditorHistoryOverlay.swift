import MeeshySDK
import SwiftUI

// MARK: - History Overlay

struct ImageEditorHistoryOverlay: View {
    let steps: [ImageEditHistoryStep]
    let currentStepID: UUID
    let accentColor: String
    let onJump: (UUID) -> Void
    let onClose: () -> Void

    @ObservedObject private var theme = ThemeManager.shared

    private var isDark: Bool { theme.mode.isDark }
    private var accent: Color { Color(hex: accentColor) }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.4)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { onClose() }
                }

            VStack(spacing: 0) {
                HStack {
                    Text(String(localized: "media.editor.history", defaultValue: "Historique", bundle: .module))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { onClose() }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: MeeshyIconSize.xs, weight: .bold))
                            .foregroundColor(theme.textSecondary)
                            .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
                            .background(Circle().fill(theme.inputBackground))
                            .meeshyTapTarget()
                    }
                    .buttonStyle(.plain)
                }
                .padding(EdgeInsets(top: MeeshySpacing.lg - MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.small), leading: MeeshySpacing.lg, bottom: MeeshySpacing.lg - MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.small), trailing: MeeshySpacing.lg - MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.small)))

                ScrollView {
                    VStack(spacing: MeeshySpacing.xsPlus) {
                        ForEach(steps.indices.reversed(), id: \.self) { index in
                            historyRow(index: index, step: steps[index])
                        }
                    }
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.bottom, MeeshySpacing.xl)
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
        let isCurrent = step.id == currentStepID
        return Button {
            onJump(step.id)
            HapticFeedback.light()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                ZStack {
                    Circle()
                        .fill(isCurrent ? AnyShapeStyle(theme.buttonGradient(color: accentColor)) : AnyShapeStyle(theme.inputBackground))
                        .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
                    Text("\(index)")
                        .font(.system(size: MeeshyFont.smallSize, weight: .bold))
                        .foregroundColor(isCurrent ? .white : theme.textSecondary)
                }
                Text(step.label)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: isCurrent ? .semibold : .regular))
                    .foregroundColor(isCurrent ? theme.textPrimary : theme.textSecondary)
                Spacer()
                if isCurrent {
                    Image(systemName: "checkmark")
                        .font(.system(size: MeeshyIconSize.xxs, weight: .bold))
                        .foregroundColor(accent)
                }
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                    .fill(isCurrent ? accent.opacity(isDark ? 0.12 : 0.07) : .clear)
            )
        }
        .buttonStyle(.plain)
    }
}
