import SwiftUI
import MeeshyUI

/// Pill flottante qui sépare deux groupes de messages appartenant à des
/// jours calendaires différents. Glass UI cohérent indigo, Equatable pour
/// préserver le pattern "zero re-render" des cellules de liste.
struct MessageDaySeparator: View, Equatable {
    let label: String
    let isDark: Bool

    static func == (lhs: MessageDaySeparator, rhs: MessageDaySeparator) -> Bool {
        lhs.label == rhs.label && lhs.isDark == rhs.isDark
    }

    var body: some View {
        HStack {
            Spacer(minLength: 0)
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundColor(textColor)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(.ultraThinMaterial)
                        .overlay(
                            Capsule()
                                .strokeBorder(borderColor, lineWidth: MeeshyBorder.hairline)
                        )
                )
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
        }
        .padding(.vertical, MeeshySpacing.xsPlus)
    }

    private var textColor: Color {
        isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo700
    }

    private var borderColor: Color {
        isDark ? MeeshyColors.indigo900 : MeeshyColors.indigo200
    }
}
