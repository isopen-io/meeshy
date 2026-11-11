import SwiftUI
import MeeshySDK
import MeeshyUI

struct SecuritySectionHeader: View {
    let title: String
    let icon: String
    let color: String

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color(hex: color))
            Text(title.uppercased())
                .font(.system(.caption2, design: .rounded).weight(.bold))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, MeeshySpacing.xs)
    }
}

struct SecurityFieldIcon: View {
    let name: String
    let color: String

    init(_ name: String, color: String) {
        self.name = name
        self.color = color
    }

    var body: some View {
        Image(systemName: name)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Color(hex: color))
            .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                    .fill(Color(hex: color).opacity(MeeshyOpacity.light))
            )
    }
}

struct SecurityVerificationBadge: View {
    let verified: Bool

    var body: some View {
        Text(verified
             ? String(localized: "settings.security.verified", defaultValue: "Vérifié", bundle: .main)
             : String(localized: "settings.security.not_verified", defaultValue: "Non vérifié", bundle: .main))
            .font(.caption2.weight(.semibold))
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.xsPlus)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(Capsule().fill(verified ? MeeshyColors.success : MeeshyColors.warning))
            .accessibilityLabel(verified
                                ? String(localized: "settings.security.verified", defaultValue: "Vérifié", bundle: .main)
                                : String(localized: "settings.security.not_verified", defaultValue: "Non vérifié", bundle: .main))
    }
}
