import SwiftUI

/// « Chiffrement de bout en bout activé » sur la Vitrine d'une fiche : un badge de succès, sans état.
struct ProfileE2EEBadge: View {
    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
                .foregroundStyle(MeeshyColors.success)

            Text(String(localized: "profile.e2ee.enabled", defaultValue: "Chiffrement de bout en bout activé", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundStyle(MeeshyColors.success)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.sm)
        .background(MeeshyColors.success.opacity(MeeshyOpacity.light))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .stroke(MeeshyColors.success.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.emphasis)
        )
    }
}
