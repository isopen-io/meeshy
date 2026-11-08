import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - En haut de MON profil : la boutique et mes packs (#16433)

/// **Deux accès directs, sur mon profil seulement** : la boutique des packs et
/// « Mes packs ». La navigation est injectée : la vue ne connaît pas le routeur.
struct ProfilePackShortcuts: View {
    let onShop: () -> Void
    let onMine: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    /// Le profil d'un autre ne propose jamais MA boutique ni MES packs.
    static func isShown(viewerId: String?, profileUserId: String?) -> Bool {
        guard let viewerId, !viewerId.isEmpty else { return false }
        return viewerId == profileUserId
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            shortcut(icon: "bag.fill", tint: MeeshyColors.brandPrimary, identifier: "profile.packs.shop",
                     title: String(localized: "profile.packs.shop", defaultValue: "Boutique", bundle: .main),
                     hint: String(localized: "profile.packs.shop.hint", defaultValue: "Ouvre la boutique des packs", bundle: .main),
                     action: onShop)
            shortcut(icon: "shippingbox.fill", tint: MeeshyColors.warning, identifier: "profile.packs.mine",
                     title: String(localized: "profile.packs.mine", defaultValue: "Mes packs", bundle: .main),
                     hint: String(localized: "profile.packs.mine.hint", defaultValue: "Ouvre les packs que tu as installés", bundle: .main),
                     action: onMine)
        }
    }

    private func shortcut(icon: String, tint: Color, identifier: String, title: String, hint: String,
                          action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.surfaceGradient(tint: tint))
                    .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.md).stroke(theme.border(tint: tint), lineWidth: 1))
            )
            .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityHint(hint)
        .accessibilityIdentifier(identifier)
    }
}
