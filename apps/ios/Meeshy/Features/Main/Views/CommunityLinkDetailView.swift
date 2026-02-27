import SwiftUI
import MeeshySDK

struct CommunityLinkDetailView: View {
    let link: CommunityLink

    @ObservedObject private var theme = ThemeManager.shared
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
                Circle().fill(Color(hex: "F8B500").opacity(0.15)).frame(width: 60, height: 60)
                Image(systemName: "person.3.fill").font(.system(size: 26))
                    .foregroundColor(Color(hex: "F8B500"))
            }
            Text(link.name).font(.system(size: 20, weight: .bold)).foregroundColor(theme.textPrimary)
            Text(link.joinUrl).font(.system(size: 12, design: .monospaced))
                .foregroundColor(theme.textSecondary).lineLimit(2).multilineTextAlignment(.center)
        }
        .padding(20).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 20).fill(theme.surfaceGradient(tint: "F8B500"))
            .overlay(RoundedRectangle(cornerRadius: 20)
                .stroke(Color(hex: "F8B500").opacity(0.2), lineWidth: 1)))
    }

    private var actionsBar: some View {
        HStack(spacing: 12) {
            communityActionButton("Copier", icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                                  color: copiedFeedback ? "2ECC71" : "F8B500") {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { copiedFeedback = false } }
            }
            communityActionButton("Partager", icon: "square.and.arrow.up", color: "F8B500") {
                guard let url = URL(string: link.joinUrl) else { return }
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                      let window = scene.windows.first,
                      let root = window.rootViewController else { return }
                root.present(av, animated: true)
            }
            communityActionButton("Identifier", icon: "doc.plaintext", color: "6366F1") {
                UIPasteboard.general.string = link.identifier
                HapticFeedback.light()
            }
        }
    }

    private func communityActionButton(_ label: String, icon: String, color: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(Color(hex: color).opacity(0.15))
                        .frame(width: 52, height: 52)
                    Image(systemName: icon).font(.system(size: 22)).foregroundColor(Color(hex: color))
                }
                Text(label).font(.system(size: 10, weight: .medium)).foregroundColor(theme.textSecondary)
            }
        }.frame(maxWidth: .infinity)
    }

    private var statsSection: some View {
        HStack(spacing: 12) {
            communityStatCard("\(link.memberCount)", label: "Membres", icon: "person.fill", color: "F8B500")
            communityStatCard(link.isActive ? "Actif" : "Inactif",
                              label: "Statut", icon: "checkmark.circle.fill",
                              color: link.isActive ? "2ECC71" : "888888")
        }
    }

    private func communityStatCard(_ value: String, label: String, icon: String, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 22)).foregroundColor(Color(hex: color))
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(size: 22, weight: .bold)).foregroundColor(theme.textPrimary)
                Text(label).font(.system(size: 12)).foregroundColor(theme.textSecondary)
            }
            Spacer()
        }
        .padding(14).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(theme.surfaceGradient(tint: color))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: color).opacity(0.2), lineWidth: 1)))
    }

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("INFORMATIONS").font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)
            VStack(spacing: 0) {
                infoRow("Identifiant", value: link.identifier)
                Divider().padding(.leading, 16)
                infoRow("Lien complet", value: link.joinUrl)
                Divider().padding(.leading, 16)
                infoRow("Créé le", value: link.createdAt.formatted(date: .abbreviated, time: .shortened))
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 14)).foregroundColor(theme.textSecondary)
            Spacer()
            Text(value).font(.system(size: 13, weight: .medium)).foregroundColor(theme.textPrimary).lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }
}
