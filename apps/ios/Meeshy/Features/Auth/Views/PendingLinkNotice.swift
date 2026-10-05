import SwiftUI
import MeeshyUI

/// **Un lien reçu sans compte n'est pas perdu, et l'écran de connexion le dit** (#7811).
///
/// Un lien de contenu (post, story, réel, profil, communauté…) ouvert sans
/// session reste en attente dans `DeepLinkRouter.pendingDeepLink` et s'ouvre
/// dès que la racine se monte après la connexion. L'écran de connexion n'en
/// disait rien : on touchait un lien et l'app demandait un mot de passe, sans
/// dire pourquoi ni ce qui suivrait.
struct PendingLinkNotice: View {
    let isVisible: Bool

    var body: some View {
        if isVisible {
            HStack(spacing: MeeshySpacing.smPlus) {
                Image(systemName: "link")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                    .foregroundStyle(MeeshyColors.indigo500)
                    .accessibilityHidden(true)
                Text(String(localized: "auth.pendingLink.notice",
                            defaultValue: "Connectez-vous : le contenu qu'on vous a partagé s'ouvrira juste après.",
                            bundle: .main))
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(MeeshyColors.indigo500.opacity(MeeshyOpacity.subtle), in: RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous))
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
            .accessibilityElement(children: .combine)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}
