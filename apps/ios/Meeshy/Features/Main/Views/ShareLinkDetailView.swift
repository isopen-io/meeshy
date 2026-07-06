import SwiftUI
import Combine
import MeeshySDK

struct ShareLinkDetailView: View {
    let link: MyShareLink

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
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
        .confirmationDialog(String(localized: "shareLink.deleteTitle", defaultValue: "Delete this link?", bundle: .main), isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button(String(localized: "shareLink.delete", defaultValue: "Delete", bundle: .main), role: .destructive) { deleteLink() }
            Button(String(localized: "common.cancel", defaultValue: "Cancel", bundle: .main), role: .cancel) {}
        } message: {
            Text(String(localized: "shareLink.deleteConfirmation", defaultValue: "This action is irreversible. The link will no longer be accessible.", bundle: .main))
        }
    }

    // MARK: - Header card

    private var headerCard: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle().fill((isActive ? MeeshyColors.shareAccent : MeeshyColors.neutral500).opacity(0.15))
                    .frame(width: 60, height: 60)
                Image(systemName: isActive ? "link" : "link.badge.minus").font(.title)
                    .foregroundColor(isActive ? MeeshyColors.shareAccent : MeeshyColors.neutral500)
            }
            Text(link.displayName).font(.title3.weight(.bold))
                .foregroundColor(theme.textPrimary)
            HStack(spacing: 8) {
                statusBadge
                if let conv = link.conversationTitle {
                    Text(conv).font(.footnote).foregroundColor(theme.textMuted).lineLimit(1)
                }
            }
            Text(link.joinUrl).font(.system(.caption, design: .monospaced))
                .foregroundColor(theme.textSecondary).lineLimit(2).multilineTextAlignment(.center)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                .fill(theme.surfaceGradient(tint: MeeshyColors.shareAccentHex))
                .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                    .stroke(MeeshyColors.shareAccent.opacity(0.2), lineWidth: 1))
        )
    }

    private var statusBadge: some View {
        Text(isActive
             ? String(localized: "common.active", defaultValue: "Actif", bundle: .main)
             : String(localized: "common.inactive", defaultValue: "Inactif", bundle: .main))
            .font(.caption.weight(.semibold))
            .foregroundColor(isActive ? MeeshyColors.shareAccent : .secondary)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Capsule().fill(isActive ? MeeshyColors.shareAccent.opacity(0.15) : Color.gray.opacity(0.15)))
    }

    // MARK: - Actions bar

    private var actionsBar: some View {
        HStack(spacing: 12) {
            actionButton(String(localized: "common.copy", defaultValue: "Copy", bundle: .main), icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                         color: copiedFeedback ? MeeshyColors.success : MeeshyColors.shareAccent) {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    withAnimation { copiedFeedback = false }
                }
            }
            actionButton(String(localized: "common.share", defaultValue: "Share", bundle: .main), icon: "square.and.arrow.up", color: MeeshyColors.shareAccent) {
                guard let url = URL(string: link.joinUrl) else { return }
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                presentSheet(av)
            }
            actionButton(isActive ? String(localized: "shareLink.disable", defaultValue: "Disable", bundle: .main) : String(localized: "shareLink.activate", defaultValue: "Activate", bundle: .main),
                         icon: isActive ? "pause.circle" : "play.circle",
                         color: isActive ? MeeshyColors.warning : MeeshyColors.success) {
                toggleActive()
            }
            actionButton(String(localized: "shareLink.delete", defaultValue: "Delete", bundle: .main), icon: "trash", color: MeeshyColors.error) {
                showDeleteConfirm = true
            }
        }
    }

    private func actionButton(_ label: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(color.opacity(0.15))
                        .frame(width: 48, height: 48)
                    Image(systemName: icon).font(.title3)
                        .foregroundColor(color)
                }
                Text(label).font(.caption2.weight(.medium))
                    .foregroundColor(theme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Stats

    private var statsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle(String(localized: "shareLink.stats.title", defaultValue: "STATISTIQUES", bundle: .main))
            HStack(spacing: 12) {
                statCard("\(link.currentUses)", label: String(localized: "shareLink.stats.uses", defaultValue: "Utilisations", bundle: .main), icon: "person.fill.badge.plus", color: MeeshyColors.shareAccentHex)
                statCard(link.maxUses.map { "\($0)" } ?? "∞", label: String(localized: "shareLink.stats.max", defaultValue: "Maximum", bundle: .main), icon: "infinity", color: MeeshyColors.brandPrimaryHex)
            }
        }
    }

    private func statCard(_ value: String, label: String, icon: String, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.title2).foregroundColor(Color(hex: color))
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.title2.weight(.bold)).foregroundColor(theme.textPrimary)
                Text(label).font(.caption).foregroundColor(theme.textSecondary)
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
            sectionTitle(String(localized: "shareLink.informations", defaultValue: "INFORMATIONS", bundle: .main))
            VStack(spacing: 0) {
                infoRow(String(localized: "shareLink.identifier", defaultValue: "Identifiant", bundle: .main), value: link.identifier ?? link.linkId)
                Divider().padding(.leading, 16)
                infoRow(String(localized: "shareLink.createdAt", defaultValue: "Créé le", bundle: .main), value: link.createdAt.formatted(date: .abbreviated, time: .shortened))
                if let expires = link.expiresAt {
                    Divider().padding(.leading, 16)
                    infoRow(String(localized: "shareLink.expiresAt", defaultValue: "Expire le", bundle: .main), value: expires.formatted(date: .abbreviated, time: .shortened))
                }
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundColor(theme.textSecondary)
            Spacer()
            Text(value).font(.subheadline.weight(.medium)).foregroundColor(theme.textPrimary)
                .lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.caption.weight(.semibold))
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
        var topVC = root
        while let presented = topVC.presentedViewController { topVC = presented }
        // iPad requires a popover anchor for UIActivityViewController or
        // -present crashes. Anchor to the presenter's view, centered, no arrow.
        if let popover = vc.popoverPresentationController {
            popover.sourceView = topVC.view
            popover.sourceRect = CGRect(x: topVC.view.bounds.midX, y: topVC.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        topVC.present(vc, animated: true)
    }
}
