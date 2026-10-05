import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct CommunityLinkDetailView: View {
    let link: CommunityLink

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @State private var copiedFeedback = false

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: MeeshySpacing.xl) {
                    headerCard.padding(.horizontal, MeeshySpacing.lg)
                    actionsBar.padding(.horizontal, MeeshySpacing.lg)
                    statsSection.padding(.horizontal, MeeshySpacing.lg)
                    infoSection.padding(.horizontal, MeeshySpacing.lg)
                }
                .padding(.top, MeeshySpacing.lg).padding(.bottom, 60)
            }
        }
        .navigationTitle(link.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerCard: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            ZStack {
                Circle().fill(MeeshyColors.communityAccent.opacity(MeeshyOpacity.light)).frame(width: 60, height: 60)
                // Glyphe héros dans un cercle de dimension fixe 60×60 : figé (déborderait s'il scalait) + masqué VoiceOver (doctrine 86i)
                Image(systemName: "person.3.fill").font(.system(size: MeeshyIconSize.xxxl))
                    .foregroundColor(MeeshyColors.communityAccent)
                    .accessibilityHidden(true)
            }
            Text(link.name).font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold)).foregroundColor(theme.textPrimary)
            Text(link.joinUrl).font(MeeshyFont.relative(MeeshyFont.smallSize, design: .monospaced))
                .foregroundColor(theme.textSecondary).lineLimit(2).multilineTextAlignment(.center)
        }
        .padding(MeeshySpacing.xl).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xl).fill(theme.surfaceGradient(tint: MeeshyColors.communityAccentHex))
            .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                .stroke(MeeshyColors.communityAccent.opacity(MeeshyOpacity.light), lineWidth: 1)))
        .accessibilityElement(children: .combine)
    }

    private var actionsBar: some View {
        HStack(spacing: MeeshySpacing.md) {
            communityActionButton(String(localized: "common.copy", defaultValue: "Copier", bundle: .main), icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                                  color: copiedFeedback ? MeeshyColors.success : MeeshyColors.communityAccent) {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { copiedFeedback = false } }
            }
            shareActionButton
            communityActionButton(String(localized: "communityLink.identify", defaultValue: "Identifier", bundle: .main), icon: "doc.plaintext", color: MeeshyColors.brandPrimary) {
                UIPasteboard.general.string = link.identifier
                HapticFeedback.light()
            }
        }
    }

    // Native share: ShareLink handles the activity sheet, iPad popover anchoring
    // and top-VC presentation for free — no manual UIActivityViewController /
    // window-hierarchy traversal (doctrine: prefer first-party SwiftUI over UIKit).
    @ViewBuilder
    private var shareActionButton: some View {
        let shareLabel = String(localized: "common.share", defaultValue: "Partager", bundle: .main)
        if let url = URL(string: link.joinUrl) {
            ShareLink(item: url) {
                communityActionButtonLabel(shareLabel, icon: "square.and.arrow.up", color: MeeshyColors.communityAccent)
            }
            .simultaneousGesture(TapGesture().onEnded { HapticFeedback.light() })
            .accessibilityLabel(shareLabel)
        } else {
            communityActionButtonLabel(shareLabel, icon: "square.and.arrow.up", color: MeeshyColors.communityAccent)
                .opacity(0.4)
                .accessibilityHidden(true)
        }
    }

    private func communityActionButton(_ label: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            communityActionButtonLabel(label, icon: icon, color: color)
        }
        .accessibilityLabel(label)
    }

    private func communityActionButtonLabel(_ label: String, icon: String, color: Color) -> some View {
        VStack(spacing: MeeshySpacing.xsPlus) {
            ZStack {
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus).fill(color.opacity(MeeshyOpacity.light))
                    .frame(width: 52, height: 52)
                // Glyphe dans une tuile de dimension fixe 52×52 : figé (déborderait s'il scalait) — le libellé sous le glyphe est lu par VoiceOver (doctrine 86i)
                Image(systemName: icon).font(.system(size: MeeshyIconSize.xxl)).foregroundColor(color)
                    .accessibilityHidden(true)
            }
            Text(label).font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium)).foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var statsSection: some View {
        HStack(spacing: MeeshySpacing.md) {
            communityStatCard("\(link.memberCount)",
                              label: String(localized: "communityLink.members", defaultValue: "Membres", bundle: .main),
                              icon: "person.fill", color: MeeshyColors.communityAccentHex)
            communityStatCard(link.isActive
                              ? String(localized: "common.active", defaultValue: "Actif", bundle: .main)
                              : String(localized: "common.inactive", defaultValue: "Inactif", bundle: .main),
                              label: String(localized: "communityLink.status", defaultValue: "Statut", bundle: .main),
                              icon: "checkmark.circle.fill",
                              color: link.isActive ? MeeshyColors.successHex : MeeshyColors.neutral500Hex)
        }
    }

    private func communityStatCard(_ value: String, label: String, icon: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon).font(MeeshyFont.relative(MeeshyIconSize.xxl)).foregroundColor(Color(hex: color))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(value).font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold)).foregroundColor(theme.textPrimary)
                Text(label).font(MeeshyFont.relative(MeeshyFont.smallSize)).foregroundColor(theme.textSecondary)
            }
            Spacer()
        }
        .padding(MeeshySpacing.mdPlus).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.surfaceGradient(tint: color))
            .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.md).stroke(Color(hex: color).opacity(MeeshyOpacity.light), lineWidth: 1)))
        .accessibilityElement(children: .combine)
    }

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "communityLink.informations", defaultValue: "INFORMATIONS", bundle: .main))
                .font(.caption.weight(.semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                infoRow(String(localized: "communityLink.identifier", defaultValue: "Identifiant", bundle: .main), value: link.identifier)
                Divider().padding(.leading, MeeshySpacing.lg)
                infoRow(String(localized: "communityLink.fullLink", defaultValue: "Lien complet", bundle: .main), value: link.joinUrl)
                Divider().padding(.leading, MeeshySpacing.lg)
                infoRow(String(localized: "communityLink.createdAt", defaultValue: "Créé le", bundle: .main), value: link.createdAt.formatted(date: .abbreviated, time: .shortened))
            }
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(MeeshyColors.surfaceFill(isDark: isDark)))
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(MeeshyFont.relative(MeeshyFont.labelSize)).foregroundColor(theme.textSecondary)
            Spacer()
            Text(value).font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium)).foregroundColor(theme.textPrimary).lineLimit(1)
        }
        .padding(.horizontal, MeeshySpacing.lg).padding(.vertical, MeeshySpacing.md)
        .accessibilityElement(children: .combine)
    }
}
