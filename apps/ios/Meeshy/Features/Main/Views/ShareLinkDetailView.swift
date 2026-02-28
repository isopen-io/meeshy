import SwiftUI
import MeeshySDK

struct ShareLinkDetailView: View {
    let link: MyShareLink

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isActive: Bool
    @State private var showDeleteConfirm = false
    @State private var copiedFeedback = false
    @Environment(\.dismiss) private var dismiss

    init(link: MyShareLink) {
        self.link = link
        _isActive = State(initialValue: link.isActive)
    }

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
        .navigationTitle(link.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Supprimer ce lien ?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { deleteLink() }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Cette action est irréversible. Le lien ne sera plus accessible.")
        }
    }

    // MARK: - Header card

    private var headerCard: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle().fill(Color(hex: isActive ? "08D9D6" : "888888").opacity(0.15))
                    .frame(width: 60, height: 60)
                Image(systemName: isActive ? "link" : "link.badge.minus").font(.system(size: 28))
                    .foregroundColor(Color(hex: isActive ? "08D9D6" : "888888"))
            }
            Text(link.displayName).font(.system(size: 20, weight: .bold))
                .foregroundColor(theme.textPrimary)
            HStack(spacing: 8) {
                statusBadge
                if let conv = link.conversationTitle {
                    Text(conv).font(.system(size: 13)).foregroundColor(theme.textMuted).lineLimit(1)
                }
            }
            Text(link.joinUrl).font(.system(size: 12, design: .monospaced))
                .foregroundColor(theme.textSecondary).lineLimit(2).multilineTextAlignment(.center)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(theme.surfaceGradient(tint: "08D9D6"))
                .overlay(RoundedRectangle(cornerRadius: 20)
                    .stroke(Color(hex: "08D9D6").opacity(0.2), lineWidth: 1))
        )
    }

    private var statusBadge: some View {
        Text(isActive ? "Actif" : "Inactif")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(isActive ? Color(hex: "08D9D6") : .secondary)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Capsule().fill(isActive ? Color(hex: "08D9D6").opacity(0.15) : Color.gray.opacity(0.15)))
    }

    // MARK: - Actions bar

    private var actionsBar: some View {
        HStack(spacing: 12) {
            actionButton("Copier", icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                         color: copiedFeedback ? "2ECC71" : "08D9D6") {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    withAnimation { copiedFeedback = false }
                }
            }
            actionButton("Partager", icon: "square.and.arrow.up", color: "08D9D6") {
                guard let url = URL(string: link.joinUrl) else { return }
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                presentSheet(av)
            }
            actionButton(isActive ? "Désactiver" : "Activer",
                         icon: isActive ? "pause.circle" : "play.circle",
                         color: isActive ? "FF6B6B" : "2ECC71") {
                toggleActive()
            }
            actionButton("Supprimer", icon: "trash", color: "FF2E63") {
                showDeleteConfirm = true
            }
        }
    }

    private func actionButton(_ label: String, icon: String, color: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(Color(hex: color).opacity(0.15))
                        .frame(width: 48, height: 48)
                    Image(systemName: icon).font(.system(size: 20))
                        .foregroundColor(Color(hex: color))
                }
                Text(label).font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Stats

    private var statsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("STATISTIQUES")
            HStack(spacing: 12) {
                statCard("\(link.currentUses)", label: "Utilisations", icon: "person.fill.badge.plus", color: "08D9D6")
                statCard(link.maxUses.map { "\($0)" } ?? "∞", label: "Maximum", icon: "infinity", color: "A855F7")
            }
        }
    }

    private func statCard(_ value: String, label: String, icon: String, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 22)).foregroundColor(Color(hex: color))
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(size: 22, weight: .bold)).foregroundColor(theme.textPrimary)
                Text(label).font(.system(size: 12)).foregroundColor(theme.textSecondary)
            }
            Spacer()
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 14).fill(theme.surfaceGradient(tint: color))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: color).opacity(0.2), lineWidth: 1))
        )
    }

    // MARK: - Info section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("INFORMATIONS")
            VStack(spacing: 0) {
                infoRow("Identifiant", value: link.identifier ?? link.linkId)
                Divider().padding(.leading, 16)
                infoRow("Créé le", value: link.createdAt.formatted(date: .abbreviated, time: .shortened))
                if let expires = link.expiresAt {
                    Divider().padding(.leading, 16)
                    infoRow("Expire le", value: expires.formatted(date: .abbreviated, time: .shortened))
                }
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 14)).foregroundColor(theme.textSecondary)
            Spacer()
            Text(value).font(.system(size: 14, weight: .medium)).foregroundColor(theme.textPrimary)
                .lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .semibold))
            .foregroundColor(theme.textSecondary).kerning(0.8)
    }

    // MARK: - Actions

    private func toggleActive() {
        Task {
            do {
                try await ShareLinkService.shared.toggleLink(linkId: link.linkId, isActive: !isActive)
                await MainActor.run {
                    withAnimation { isActive.toggle() }
                    HapticFeedback.light()
                }
            } catch {
                await MainActor.run { HapticFeedback.error() }
            }
        }
    }

    private func deleteLink() {
        Task {
            do {
                try await ShareLinkService.shared.deleteLink(linkId: link.linkId)
                await MainActor.run { dismiss() }
            } catch {
                await MainActor.run { HapticFeedback.error() }
            }
        }
    }

    private func presentSheet(_ vc: UIViewController) {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first,
              let root = window.rootViewController else { return }
        root.present(vc, animated: true)
    }
}
