import SwiftUI

public struct CollapsibleHeader<TrailingContent: View>: View {
    let title: String
    let subtitle: String?
    let scrollOffset: CGFloat
    let showBackButton: Bool
    let onBack: (() -> Void)?
    let titleColor: Color
    let backArrowColor: Color
    let backgroundColor: Color
    let trailing: () -> TrailingContent

    private let expandedHeight: CGFloat = 100
    private let collapsedHeight: CGFloat = 52

    public init(
        title: String,
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) {
        self.title = title
        self.subtitle = subtitle
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
        lerp(expandedHeight, collapsedHeight, progress)
    }

    private var titleSize: CGFloat {
        lerp(32, 17, progress)
    }

    private var titleWeight: Font.Weight {
        progress < 0.5 ? .bold : .semibold
    }

    private var titleBottomPadding: CGFloat {
        lerp(12, 0, progress)
    }

    private var backArrowSize: CGFloat {
        lerp(20, 16, progress)
    }

    private var showExpandedSubtitle: Bool {
        subtitle != nil && progress < 0.7
    }

    private var showCollapsedSubtitle: Bool {
        subtitle != nil && progress > 0.7
    }

    private func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat {
        a + (b - a) * t
    }

    private func makeSubtitleText(_ text: String, size: CGFloat, opacity: Double) -> Text {
        Text(text)
            .font(.system(size: size))
            .foregroundColor(titleColor.opacity(opacity))
    }

    public var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottom) {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        LinearGradient(
                            stops: [
                                .init(color: backgroundColor.opacity(0.88), location: 0),
                                .init(color: backgroundColor.opacity(0.98), location: 0.9),
                                .init(color: backgroundColor.opacity(0.98), location: 1.0),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                HStack(alignment: .center, spacing: 0) {
                    if showBackButton {
                        backButton
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.system(size: titleSize, weight: titleWeight, design: .rounded))
                            .foregroundColor(titleColor)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)

                        if showExpandedSubtitle {
                            makeSubtitleText(subtitle ?? "", size: lerp(15, 12, progress), opacity: 0.6)
                                .lineLimit(1)
                                .opacity(Double(1.0 - min(1.0, progress / 0.6)))
                        }
                    }
                    .padding(.leading, showBackButton ? 0 : 16)

                    if showCollapsedSubtitle {
                        makeSubtitleText(subtitle ?? "", size: 12, opacity: 0.5)
                            .lineLimit(1)
                            .padding(.leading, 8)
                            .opacity(max(0, (progress - 0.7) / 0.3))
                    }

                    Spacer(minLength: 8)

                    trailing()
                        .frame(minWidth: 44, minHeight: 44)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, titleBottomPadding)
            }
            .frame(height: headerHeight)

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
                .font(.system(size: backArrowSize, weight: .semibold))
                .foregroundColor(backArrowColor)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Retour")
    }
}
