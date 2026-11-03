import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le texte intégral d'une licence, embarqué dans l'app : lisible hors ligne,
/// sélectionnable, en chasse fixe pour garder la mise en page du texte officiel.
struct LicenseTextView: View {
    let notice: LicenseNotice

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            CollapsibleHeaderPage(
                title: notice.title,
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary,
                content: {
                    Text(notice.text)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, design: .monospaced))
                        .foregroundStyle(theme.textPrimary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .environment(\.layoutDirection, .leftToRight)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.md)
                }
            )
        }
    }
}
