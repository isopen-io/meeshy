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
        .confirmationDialog(String(localized: "shareLink.deleteTitle", defaultValue: "Supprimer ce lien ?", bundle: .main), isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button(String(localized: "shareLink.delete", defaultValue: "Supprimer", bundle: .main), role: .destructive) { deleteLink() }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: {
            Text(String(localized: "shareLink.deleteConfirmation", defaultValue: "Cette action est irréversible. Le lien ne sera plus accessible.", bundle: .main))
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
                    .accessibilityHidden(true)
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
            RoundedRectangle(cornerRadius: 20)
                .fill(theme.surfaceGradient(tint: MeeshyColors.shareAccentHex))
                .overlay(RoundedRectangle(cornerRadius: 20)
                    .stroke(MeeshyColors.shareAccent.opacity(0.2), lineWidth: 1))
        )
        .accessibilityElement(children: .combine)
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
            actionButton(String(localized: "common.copy", defaultValue: "Copier", bundle: .main), icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                         color: copiedFeedback ? MeeshyColors.success : MeeshyColors.shareAccent) {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
                UIAccessibility.post(notification: .announcement, argument: String(localized: "shareLink.a11y.copied", defaultValue: "Lien copié", bundle: .main))
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    withAnimation { copiedFeedback = false }
                }
            }
            shareActionButton
            actionButton(isActive ? String(localized: "shareLink.disable", defaultValue: "Désactiver", bundle: .main) : String(localized: "shareLink.activate", defaultValue: "Activer", bundle: .main),
                         icon: isActive ? "pause.circle" : "play.circle",
                         color: isActive ? MeeshyColors.warning : MeeshyColors.success) {
                toggleActive()
            }
            actionButton(String(localized: "shareLink.delete", defaultValue: "Supprimer", bundle: .main), icon: "trash", color: MeeshyColors.error) {
                showDeleteConfirm = true
            }
        }
    }

    private func actionButton(_ label: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            actionButtonLabel(label, icon: icon, color: color)
        }
        .frame(maxWidth: .infinity)
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isButton)
    }

    private func actionButtonLabel(_ label: String, icon: String, color: Color) -> some View {
        VStack(spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 12).fill(color.opacity(0.15))
                    .frame(width: 48, height: 48)
                Image(systemName: icon).font(.title3)
                    .foregroundColor(color)
                    .accessibilityHidden(true)
            }
            Text(label).font(.caption2.weight(.medium))
                .foregroundColor(theme.textSecondary)
        }
    }

    /// Native share: `ShareLink` gives the activity sheet, the iPad popover
    /// anchor and top-VC presentation for free — no manual
    /// `UIActivityViewController` / window-hierarchy traversal (doctrine:
    /// prefer first-party SwiftUI over UIKit, cf. `CommunityLinkDetailView`).
    /// The `presentSheet(_:)` helper it replaces resolved its presenter from
    /// `connectedScenes.first`; `connectedScenes` is an *unordered* `Set`, so
    /// under iPad multitasking / Stage Manager it could target a background
    /// scene and present the sheet on a window nobody can see.
    ///
    /// `ShareLink` is already a button, so it carries `.isButton` natively —
    /// no `.accessibilityAddTraits` needed, unlike the `actionButton` siblings.
    @ViewBuilder
    private var shareActionButton: some View {
        let shareLabel = String(localized: "common.share", defaultValue: "Partager", bundle: .main)
        if let url = URL(string: link.joinUrl) {
            ShareLink(item: url) {
                actionButtonLabel(shareLabel, icon: "square.and.arrow.up", color: MeeshyColors.shareAccent)
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel(shareLabel)
        } else {
            // Malformed join URL: the old Button stayed tappable and silently
            // did nothing. Dim it and hide it from VoiceOver rather than
            // offering a dead control.
            actionButtonLabel(shareLabel, icon: "square.and.arrow.up", color: MeeshyColors.shareAccent)
                .frame(maxWidth: .infinity)
                .opacity(0.4)
                .accessibilityHidden(true)
        }
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
                .accessibilityHidden(true)
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
        .accessibilityElement(children: .combine)
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
        .accessibilityElement(children: .combine)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.caption.weight(.semibold))
            .foregroundColor(theme.textSecondary).kerning(0.8)
            .accessibilityAddTraits(.isHeader)
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

}
