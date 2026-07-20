import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - ShareLinksView

struct ShareLinksView: View {
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var viewModel = ShareLinksViewModel()
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @State private var showCreate = false

    @Environment(\.dismiss) private var dismiss

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        if let stats = viewModel.stats {
                            shareLinkStatsOverview(stats)
                                .padding(.horizontal, 16)
                        }
                        linksSection
                            .padding(.horizontal, 16)
                    }
                    .padding(.top, 8)
                    .padding(.bottom, 40)
                }
                .refreshable {
                    await viewModel.load()
                }
            }
        }
        .navigationBarHidden(true)
        .task { await viewModel.load() }
        .sheet(isPresented: $showCreate) {
            CreateShareLinkView { _ in
                Task { await viewModel.load() }
            }
            .environmentObject(conversationListViewModel)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

            Spacer()

            Text(String(localized: "share.links.title", defaultValue: "Liens de partage", bundle: .main))
                .font(.headline.weight(.bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Button {
                HapticFeedback.light()
                showCreate = true
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(MeeshyFont.relative(22))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "share.links.create.a11y", defaultValue: "Créer un lien de partage", bundle: .main))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Stats overview

    private func shareLinkStatsOverview(_ stats: MyShareLinkStats) -> some View {
        HStack(spacing: 12) {
            shareLinkStatCard("\(stats.totalLinks)", label: String(localized: "share.links.stats.total", defaultValue: "Liens", bundle: .main), icon: "link")
            shareLinkStatCard("\(stats.activeLinks)", label: String(localized: "share.links.stats.active", defaultValue: "Actifs", bundle: .main), icon: "checkmark.circle.fill")
            shareLinkStatCard("\(stats.totalUses)", label: String(localized: "share.links.stats.joined", defaultValue: "Rejoints", bundle: .main), icon: "person.fill.badge.plus")
        }
    }

    private func shareLinkStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(20))
                .foregroundColor(MeeshyColors.shareAccent)
                .accessibilityHidden(true)
            Text(value)
                .font(.title2.weight(.bold))
                .foregroundColor(theme.textPrimary)
            Text(label)
                .font(.caption2)
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: MeeshyColors.shareAccentHex))
                .overlay(RoundedRectangle(cornerRadius: 16)
                    .stroke(MeeshyColors.shareAccent.opacity(0.2), lineWidth: 1))
        )
        .accessibilityElement(children: .combine)
    }

    // MARK: - Links list

    private var linksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "share.links.my_links", defaultValue: "MES LIENS", bundle: .main))
                .font(.caption.weight(.semibold))
                .foregroundColor(theme.textSecondary)
                .kerning(0.8)
                .accessibilityAddTraits(.isHeader)

            if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(40)
            } else if viewModel.links.isEmpty {
                emptyState
            } else {
                VStack(spacing: 8) {
                    ForEach(viewModel.links) { link in
                        NavigationLink(destination: ShareLinkDetailView(link: link)) {
                            shareLinkRow(link)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // Empty state deferred to the shared design-system `EmptyStateView`
    // (canonical icon+title+subtitle, combined VoiceOver label + spring appear)
    // instead of a hand-rolled VStack — same structure the peer settings screen
    // `BlockedUsersView` already reuses. `compact` keeps it sized for this
    // in-scroll section; the brand accent (shareAccentHex) is preserved.
    private var emptyState: some View {
        EmptyStateView(
            icon: "link.badge.plus",
            title: String(localized: "share.links.empty.title", defaultValue: "Aucun lien de partage", bundle: .main),
            subtitle: String(localized: "share.links.empty.subtitle", defaultValue: "Créez un lien pour inviter des personnes dans une conversation", bundle: .main),
            accentColor: MeeshyColors.shareAccentHex,
            compact: true
        )
        .padding(.vertical, 24)
    }

    // Single interpolated localized unit (was a number concatenated with a
    // standalone word — broke pluralization/word-order across locales).
    private func joinedCountLabel(_ count: Int) -> String {
        String(localized: "share.links.joined_count", defaultValue: "\(count) rejoints", bundle: .main)
    }

    private func rowAccessibilityLabel(_ link: MyShareLink) -> String {
        let status = link.isActive
            ? String(localized: "share.links.status.active", defaultValue: "Actif", bundle: .main)
            : String(localized: "share.links.status.inactive", defaultValue: "Inactif", bundle: .main)
        var parts = [link.displayName, status, joinedCountLabel(link.currentUses)]
        if let conv = link.conversationTitle { parts.append(conv) }
        return parts.joined(separator: ", ")
    }

    private func shareLinkRow(_ link: MyShareLink) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill((link.isActive ? MeeshyColors.shareAccent : MeeshyColors.neutral500).opacity(0.15))
                    .frame(width: 40, height: 40)
                // Glyph centered in a fixed 40×40 circle badge — a scalable font
                // would overflow the frame. Kept fixed + hidden (the link name
                // carries the meaning; doctrine 86i).
                Image(systemName: link.isActive ? "link" : "link.badge.minus")
                    .font(.system(size: 16))
                    .foregroundColor(link.isActive ? MeeshyColors.shareAccent : MeeshyColors.neutral500)
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(link.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(joinedCountLabel(link.currentUses))
                        .font(.caption)
                        .foregroundColor(MeeshyColors.shareAccent)
                    if let conv = link.conversationTitle {
                        Text("· \(conv)")
                            .font(.caption)
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                }
            }
            // The active/inactive state was signalled ONLY by the (hidden) badge
            // glyph's colour/shape — invisible to VoiceOver. Fold the row's text
            // into one element and surface the status word explicitly so it no
            // longer relies on colour alone (WCAG 1.4.1; doctrine 155i/164i).
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(rowAccessibilityLabel(link))

            Spacer()

            Button {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
            } label: {
                Image(systemName: "doc.on.doc")
                    .font(MeeshyFont.relative(16))
                    .foregroundColor(MeeshyColors.shareAccent)
            }
            .padding(.horizontal, 4)
            .accessibilityLabel(String(localized: "share.links.copy.a11y", defaultValue: "Copier le lien", bundle: .main))

            Image(systemName: "chevron.right")
                .font(MeeshyFont.relative(12))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: MeeshyColors.shareAccentHex))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(MeeshyColors.shareAccent.opacity(0.15), lineWidth: 1))
        )
    }
}

// MARK: - ViewModel

@MainActor
class ShareLinksViewModel: ObservableObject {
    @Published var links: [MyShareLink] = []
    @Published var stats: MyShareLinkStats? = nil
    @Published var isLoading = false

    func load() async {
        let cached = await CacheCoordinator.shared.shareLinks.load(for: "list")
        switch cached {
        case .fresh(let data, _):
            links = data
            return
        case .stale(let data, _):
            links = data
            await refreshFromAPI()
        case .expired, .empty:
            isLoading = links.isEmpty
            await refreshFromAPI()
        }
    }

    private func refreshFromAPI() async {
        async let l = ShareLinkService.shared.listMyLinks()
        async let s = ShareLinkService.shared.fetchMyStats()
        links = (try? await l) ?? []
        stats = try? await s
        try? await CacheCoordinator.shared.shareLinks.save(links, for: "list")
        isLoading = false
    }

    func loadStats() async {
        stats = try? await ShareLinkService.shared.fetchMyStats()
    }
}
