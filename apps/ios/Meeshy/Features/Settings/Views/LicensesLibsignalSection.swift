import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les avis de libsignal au tag épinglé — libsignal et chacune de ses
/// dépendances, tels que Signal les publie (`acknowledgments-ios.plist`). Une
/// rangée par avis ; le toucher ouvre le texte intégral de sa licence.
struct LicensesLibsignalSection: View {
    let notices: [LicenseNotice]
    let accentColor: String
    let onOpen: (LicenseNotice) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            LicensesSectionHeader(
                title: String(localized: "about.licenses.libsignal.title", defaultValue: "Avis de libsignal", bundle: .main),
                icon: "lock.shield.fill",
                color: accentColor
            )
            Text(String(localized: "about.licenses.libsignal.body", defaultValue: "libsignal et les bibliothèques qu’il intègre, avec le texte de leurs licences.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundStyle(theme.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, MeeshySpacing.xs)
            LazyVStack(spacing: MeeshySpacing.sm) {
                ForEach(notices) { notice in
                    row(notice)
                }
            }
        }
    }

    private func row(_ notice: LicenseNotice) -> some View {
        Button { onOpen(notice) } label: {
            HStack(spacing: MeeshySpacing.md) {
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(notice.title)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .lineLimit(3)
                    if let license = notice.license {
                        Text(license)
                            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                Spacer(minLength: MeeshySpacing.sm)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(Color(hex: accentColor))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)
            .frame(minHeight: 44)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.surfaceGradient(tint: accentColor))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(String(localized: "about.licenses.text.hint", defaultValue: "Affiche le texte intégral de la licence", bundle: .main))
    }
}
