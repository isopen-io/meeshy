import SwiftUI

public struct CollapsibleHeader<TrailingContent: View>: View {
    let title: String
    let scrollOffset: CGFloat
    let showBackButton: Bool
    let onBack: (() -> Void)?
    let titleColor: Color
    let backArrowColor: Color
    let backgroundColor: Color
    let trailing: () -> TrailingContent

    public init(
        title: String,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) {
        self.title = title
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.trailing = trailing
    }

    public var progress: CGFloat {
        min(1, max(0, -scrollOffset / 60))
    }

    private var headerHeight: CGFloat {
        lerp(90, 48, progress)
    }

    private var titleSize: CGFloat {
        lerp(28, 17, progress)
    }

    private var arrowSize: CGFloat {
        lerp(24, 16, progress)
    }

    private func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat {
        a + (b - a) * t
    }

    public var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topTrailing) {
                // Trailing content — rendered ONCE, pinned top-right, always visible
                HStack {
                    Spacer()
                    trailing()
                        .frame(minWidth: 44, minHeight: 44)
                }
                .frame(height: 44)
                .padding(.trailing, 4)
                .zIndex(1)

                // Collapsed state: centered title + optional back arrow placeholder
                HStack(spacing: 0) {
                    if showBackButton {
                        backButton
                            .opacity(progress)
                    }
                    Spacer()
                    Text(title)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(titleColor)
                    Spacer()
                    Color.clear.frame(width: 44, height: 44)
                }
                .frame(height: 44)
                .opacity(progress)

                // Expanded state: large back arrow on top, large title below
                VStack(alignment: .leading, spacing: 4) {
                    if showBackButton {
                        backButton
                    }
                    Text(title)
                        .font(.system(size: titleSize, weight: .bold, design: .rounded))
                        .foregroundColor(titleColor)
                        .padding(.leading, showBackButton ? 4 : 16)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .opacity(1 - progress)
            }
            .frame(height: headerHeight)
            .padding(.horizontal, 12)
            .background(backgroundColor)

            Divider()
                .opacity(Double(progress) * 0.3)
        }
    }

    private var backButton: some View {
        Button {
            HapticFeedback.light()
            onBack?()
        } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: arrowSize, weight: .semibold))
                .foregroundColor(backArrowColor)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Retour")
    }
}
