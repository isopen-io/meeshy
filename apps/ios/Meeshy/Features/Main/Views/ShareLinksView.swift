import SwiftUI
import Combine
import MeeshySDK

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

            Spacer()

            Text(String(localized: "share.links.title", defaultValue: "Liens de partage", bundle: .main))
                .font(.headline.weight(.bold))
                .foregroundColor(theme.textPrimary)

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
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.surfaceGradient(tint: MeeshyColors.shareAccentHex))
                .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(MeeshyColors.shareAccent.opacity(0.2), lineWidth: 1))
        )
    }

    // MARK: - Links list

    private var linksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "share.links.my_links", defaultValue: "MES LIENS", bundle: .main))
                .font(.caption.weight(.semibold))
                .foregroundColor(theme.textSecondary)
                .kerning(0.8)

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

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "link.badge.plus")
                .font(MeeshyFont.relative(40))
                .foregroundColor(MeeshyColors.shareAccent.opacity(0.6))
            Text(String(localized: "share.links.empty.title", defaultValue: "Aucun lien de partage", bundle: .main))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(theme.textPrimary)
            Text(String(localized: "share.links.empty.subtitle", defaultValue: "Créez un lien pour inviter des personnes dans une conversation", bundle: .main))
                .font(.footnote)
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity)
    }

    private func shareLinkRow(_ link: MyShareLink) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill((link.isActive ? MeeshyColors.shareAccent : MeeshyColors.neutral500).opacity(0.15))
                    .frame(width: 40, height: 40)
                Image(systemName: link.isActive ? "link" : "link.badge.minus")
                    .font(MeeshyFont.relative(16))
                    .foregroundColor(link.isActive ? MeeshyColors.shareAccent : MeeshyColors.neutral500)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(link.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text("\(link.currentUses) \(String(localized: "share.links.joined_label", defaultValue: "rejoints", bundle: .main))")
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

            Image(systemName: "chevron.right")
                .font(MeeshyFont.relative(12))
                .foregroundColor(theme.textMuted)
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
