import SwiftUI
import Combine
import MeeshySDK

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
                VStack(spacing: 20) {
                    headerCard.padding(.horizontal, 16)
                    actionsBar.padding(.horizontal, 16)
                    statsSection.padding(.horizontal, 16)
                    infoSection.padding(.horizontal, 16)
                }
                .padding(.top, 16).padding(.bottom, 60)
            }
        }
        .navigationTitle(link.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerCard: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(MeeshyColors.communityAccent.opacity(0.15)).frame(width: 60, height: 60)
                // Glyphe héros dans un cercle de dimension fixe 60×60 : figé (déborderait s'il scalait) + masqué VoiceOver (doctrine 86i)
                Image(systemName: "person.3.fill").font(.system(size: 26))
                    .foregroundColor(MeeshyColors.communityAccent)
                    .accessibilityHidden(true)
            }
            Text(link.name).font(MeeshyFont.relative(20, weight: .bold)).foregroundColor(theme.textPrimary)
            Text(link.joinUrl).font(MeeshyFont.relative(12, design: .monospaced))
                .foregroundColor(theme.textSecondary).lineLimit(2).multilineTextAlignment(.center)
        }
        .padding(20).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xl).fill(theme.surfaceGradient(tint: MeeshyColors.communityAccentHex))
            .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                .stroke(MeeshyColors.communityAccent.opacity(0.2), lineWidth: 1)))
        .accessibilityElement(children: .combine)
    }

    private var actionsBar: some View {
        HStack(spacing: 12) {
            communityActionButton(String(localized: "common.copy", defaultValue: "Copy", bundle: .main), icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                                  color: copiedFeedback ? MeeshyColors.success : MeeshyColors.communityAccent) {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { copiedFeedback = false } }
            }
            communityActionButton(String(localized: "common.share", defaultValue: "Share", bundle: .main), icon: "square.and.arrow.up", color: MeeshyColors.communityAccent) {
                guard let url = URL(string: link.joinUrl) else { return }
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                      let window = scene.windows.first,
                      let root = window.rootViewController else { return }
                var topVC = root
                while let presented = topVC.presentedViewController { topVC = presented }
                // iPad: UIActivityViewController needs a popover anchor or -present crashes.
                if let popover = av.popoverPresentationController {
                    popover.sourceView = topVC.view
                    popover.sourceRect = CGRect(x: topVC.view.bounds.midX, y: topVC.view.bounds.midY, width: 0, height: 0)
                    popover.permittedArrowDirections = []
                }
                topVC.present(av, animated: true)
            }
            communityActionButton(String(localized: "communityLink.identify", defaultValue: "Identify", bundle: .main), icon: "doc.plaintext", color: MeeshyColors.brandPrimary) {
                UIPasteboard.general.string = link.identifier
                HapticFeedback.light()
            }
        }
    }

    private func communityActionButton(_ label: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(color.opacity(0.15))
                        .frame(width: 52, height: 52)
                    // Glyphe dans une tuile de dimension fixe 52×52 : figé (déborderait s'il scalait) — le libellé sous le glyphe est lu par VoiceOver (doctrine 86i)
                    Image(systemName: icon).font(.system(size: 22)).foregroundColor(color)
                        .accessibilityHidden(true)
                }
                Text(label).font(MeeshyFont.relative(10, weight: .medium)).foregroundColor(theme.textSecondary)
            }
        }.frame(maxWidth: .infinity)
        .accessibilityLabel(label)
    }

    private var statsSection: some View {
        HStack(spacing: 12) {
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
        HStack(spacing: 12) {
            Image(systemName: icon).font(MeeshyFont.relative(22)).foregroundColor(Color(hex: color))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(MeeshyFont.relative(22, weight: .bold)).foregroundColor(theme.textPrimary)
                Text(label).font(MeeshyFont.relative(12)).foregroundColor(theme.textSecondary)
            }
            Spacer()
        }
        .padding(14).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(theme.surfaceGradient(tint: color))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: color).opacity(0.2), lineWidth: 1)))
        .accessibilityElement(children: .combine)
    }

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "communityLink.informations", defaultValue: "INFORMATIONS", bundle: .main))
                .font(.caption.weight(.semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                infoRow(String(localized: "communityLink.identifier", defaultValue: "Identifiant", bundle: .main), value: link.identifier)
                Divider().padding(.leading, 16)
                infoRow(String(localized: "communityLink.fullLink", defaultValue: "Lien complet", bundle: .main), value: link.joinUrl)
                Divider().padding(.leading, 16)
                infoRow(String(localized: "communityLink.createdAt", defaultValue: "Créé le", bundle: .main), value: link.createdAt.formatted(date: .abbreviated, time: .shortened))
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(MeeshyFont.relative(14)).foregroundColor(theme.textSecondary)
            Spacer()
            Text(value).font(MeeshyFont.relative(13, weight: .medium)).foregroundColor(theme.textPrimary).lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }
}
