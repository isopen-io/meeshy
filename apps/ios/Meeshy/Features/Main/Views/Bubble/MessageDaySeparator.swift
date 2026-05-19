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
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(textColor)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(.ultraThinMaterial)
                        .overlay(
                            Capsule()
                                .strokeBorder(borderColor, lineWidth: 0.5)
                        )
                )
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
    }

    private var textColor: Color {
        isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo700
    }

    private var borderColor: Color {
        isDark ? MeeshyColors.indigo900 : MeeshyColors.indigo200
    }
}
