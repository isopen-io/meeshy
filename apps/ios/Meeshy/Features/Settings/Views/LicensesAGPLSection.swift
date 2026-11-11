import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que l'AGPL-3.0 demande à l'écran Licences, parce que l'app embarque
/// libsignal : la licence de Meeshy (sources MIT, app distribuée sous
/// AGPL-3.0), l'offre de source au commit du build et le texte intégral de la
/// licence, embarqué.
///
/// Projet d'ingénierie de conformité, pas un avis juridique : la rédaction
/// finale attend l'avocat du projet (#11548).
struct LicensesAGPLSection: View {
    let source: SourceOffer
    let accentColor: String
    let onOpenAGPL: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            LicensesSectionHeader(
                title: String(localized: "about.licenses.meeshy.title", defaultValue: "Licence de Meeshy", bundle: .main),
                icon: "doc.text.fill",
                color: accentColor
            )
            statementCard
            sourceCard
            agplRow
        }
    }

    private var statementCard: some View {
        Text(String(localized: "about.licenses.meeshy.body", defaultValue: "Le code source de Meeshy est publié sous licence MIT. Cette application intègre libsignal (Signal Messenger), publié sous licence GNU AGPL-3.0 : l’application distribuée est donc une œuvre sous licence AGPL-3.0 uniquement.", bundle: .main))
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
            .foregroundStyle(theme.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.md)
            .background(cardBackground)
    }

    private var sourceCard: some View {
        Link(destination: source.url) {
            HStack(spacing: MeeshySpacing.md) {
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(String(localized: "about.licenses.source.title", defaultValue: "Code source", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text(String(localized: "about.licenses.source.body", defaultValue: "Code source de cette version, gratuit.", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                        .multilineTextAlignment(.leading)
                    sourceRevision
                }
                Spacer(minLength: MeeshySpacing.sm)
                Image(systemName: "arrow.up.right")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(Color(hex: accentColor))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.md)
            .background(cardBackground)
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(String(localized: "about.licenses.source.open", defaultValue: "Ouvrir le code source", bundle: .main))
    }

    @ViewBuilder
    private var sourceRevision: some View {
        if let short = source.shortCommit {
            Text(String(localized: "about.licenses.source.commit", defaultValue: "Révision \(short)", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold, design: .monospaced))
                .foregroundStyle(theme.textMuted)
                .environment(\.layoutDirection, .leftToRight)
        }
    }

    private var agplRow: some View {
        Button(action: onOpenAGPL) {
            HStack(spacing: MeeshySpacing.md) {
                Text(String(localized: "about.licenses.agpl.title", defaultValue: "Texte de la licence AGPL-3.0", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
                Spacer(minLength: MeeshySpacing.sm)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(Color(hex: accentColor))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.md)
            .frame(minHeight: 44)
            .background(cardBackground)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(String(localized: "about.licenses.text.hint", defaultValue: "Affiche le texte intégral de la licence", bundle: .main))
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: accentColor))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: accentColor), lineWidth: 1)
            )
    }
}
