import SwiftUI
import MeeshySDK
import MeeshyUI

/// C4b — la rupture, telle qu'elle se montre.
///
/// **Cette vue n'a aucun bouton de fermeture, et c'est tout son propos.** Le
/// gateway refuse les écritures de ce binaire : laisser croire à l'utilisateur
/// qu'il peut « continuer quand même » lui ferait perdre ce qu'il compose.
/// Une porte avec une poignée est un avertissement, pas une rupture — garde :
/// `UpgradeGateTests.test_upgradeGateView_nOffreAucuneSortie`.
struct UpgradeGateView: View {

    let requirement: UpgradeRequirement

    @Environment(\.openURL) private var openURL
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    /// Repli quand le serveur n'a pas servi d'URL — c'est le cas du bootstrap,
    /// qui compare un plancher sans jamais recevoir de corps 426. Miroir du
    /// défaut du gateway (`getAppStoreUrl`, `utils/appVersion.ts`).
    static let defaultStoreURL = URL(string: "https://apps.apple.com/app/meeshy")!

    /// L'URL servie par le SERVEUR l'emporte : c'est lui qui sait, via
    /// `X-App-Platform`, s'il parle à un App Store ou à un Play Store.
    static func storeURL(for requirement: UpgradeRequirement) -> URL {
        guard let raw = requirement.storeUrl,
              let url = URL(string: raw),
              url.scheme != nil else {
            return defaultStoreURL
        }
        return url
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: MeeshySpacing.lg) {
                Spacer()

                Image(systemName: "arrow.up.circle.fill")
                    .font(MeeshyFont.relative(64, weight: .light))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo400, MeeshyColors.indigo700],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .accessibilityHidden(true)

                Text(String(localized: "upgradeGate.title",
                            defaultValue: "Mise à jour requise",
                            bundle: .main))
                    .font(MeeshyFont.relative(24, weight: .bold))
                    .multilineTextAlignment(.center)

                Text(String(localized: "upgradeGate.message",
                            defaultValue: "Cette version de Meeshy ne peut plus échanger avec le serveur. Installez la dernière version pour continuer.",
                            bundle: .main))
                    .font(MeeshyFont.relative(16, weight: .regular))
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, MeeshySpacing.lg)

                if !requirement.minVersion.isEmpty {
                    Text(String(format: String(localized: "upgradeGate.min_version",
                                               defaultValue: "Version minimale : %@",
                                               bundle: .main),
                                requirement.minVersion))
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(.secondary)
                }

                Spacer()

                Button {
                    HapticFeedback.light()
                    openURL(Self.storeURL(for: requirement))
                } label: {
                    Text(String(localized: "upgradeGate.action",
                                defaultValue: "Mettre à jour",
                                bundle: .main))
                        .font(MeeshyFont.relative(17, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, MeeshySpacing.md)
                        .background(
                            LinearGradient(
                                colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.bottom, MeeshySpacing.xl)
            }
            .padding(.horizontal, MeeshySpacing.md)
        }
        .shadow(color: MeeshyColors.indigo500.opacity(isDark ? 0.25 : 0.12), radius: 24, y: 8)
    }
}
