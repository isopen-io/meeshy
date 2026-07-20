import SwiftUI
import Combine
import MeeshySDK

struct TrackingLinksView: View {
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var viewModel = TrackingLinksViewModel()
    @State private var showCreate = false

    @Environment(\.dismiss) private var dismiss

    private let accent = MeeshyColors.trackingAccent
    private let accentHex = MeeshyColors.trackingAccentHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            
            VStack(spacing: 0) {
                header
                
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        if let stats = viewModel.stats {
                            trackingStatsOverview(stats).padding(.horizontal, 16)
                        }
                        linksSection.padding(.horizontal, 16)
                    }
                    .padding(.top, 8).padding(.bottom, 40)
                }
                .refreshable { await viewModel.load() }
            }
        }
        .navigationBarHidden(true)
        .task { await viewModel.load() }
        .sheet(isPresented: $showCreate) {
            CreateTrackingLinkView { link in
                viewModel.links.insert(link, at: 0)
                Task { await viewModel.loadStats() }
            }
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
                    .foregroundColor(accent)
            }
            .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))

            Spacer()

            Text(String(localized: "tracking.links.title", defaultValue: "Liens de tracking", bundle: .main))
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
                    .foregroundColor(accent)
            }
            .accessibilityLabel(String(localized: "tracking.links.create.a11y", defaultValue: "Créer un lien de tracking", bundle: .main))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func trackingStatsOverview(_ stats: TrackingLinkStats) -> some View {
        HStack(spacing: 10) {
            trackingStatCard("\(stats.totalLinks)", label: String(localized: "tracking.links.stats.links", defaultValue: "Liens", bundle: .main), icon: "link")
            trackingStatCard("\(stats.totalClicks)", label: String(localized: "tracking.links.stats.clicks", defaultValue: "Clics", bundle: .main), icon: "cursorarrow.click")
            trackingStatCard("\(stats.uniqueClicks)", label: String(localized: "tracking.links.stats.uniques", defaultValue: "Uniques", bundle: .main), icon: "person.fill")
            trackingStatCard("\(stats.activeLinks)", label: String(localized: "tracking.links.stats.active", defaultValue: "Actifs", bundle: .main), icon: "checkmark.circle")
        }
    }

    private func trackingStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(16))
                .foregroundColor(accent)
                .accessibilityHidden(true)
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundColor(theme.textPrimary)
            Text(label)
                .font(.caption2)
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: accentHex))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(accent.opacity(0.2), lineWidth: 1))
        )
        .accessibilityElement(children: .combine)
    }

    private var linksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "tracking.links.section.myLinks", defaultValue: "MES LIENS", bundle: .main)).font(.caption.weight(.semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)
                .accessibilityAddTraits(.isHeader)

            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity).padding(40)
            } else if viewModel.links.isEmpty {
                trackingEmptyState
            } else {
                VStack(spacing: 8) {
                    ForEach(viewModel.links) { link in
                        NavigationLink(destination: TrackingLinkDetailView(link: link)) {
                            trackingLinkRow(link)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // Empty state deferred to the shared design-system `EmptyStateView`
    // (canonical icon+title+subtitle, combined VoiceOver label + spring appear)
    // instead of a hand-rolled VStack — mirrors the sibling links screen
    // `ShareLinksView` (178i). `compact` keeps it sized for this in-scroll
    // section; the brand accent (trackingAccentHex) is preserved. Reuses the
    // existing i18n keys — no new strings.
    private var trackingEmptyState: some View {
        EmptyStateView(
            icon: "chart.bar.fill",
            title: String(localized: "tracking.links.empty.title", defaultValue: "Aucun lien de tracking", bundle: .main),
            subtitle: String(localized: "tracking.links.empty.subtitle", defaultValue: "Créez un lien pour suivre vos clics et campagnes", bundle: .main),
            accentColor: accentHex,
            compact: true
        )
        .padding(.vertical, 24)
    }

    private func trackingLinkRow(_ link: TrackingLink) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill((link.isActive ? accent : MeeshyColors.neutral500).opacity(0.15))
                    .frame(width: 40, height: 40)
                // Glyphe dans un cercle de dimension fixe 40×40 : figé (déborderait s'il scalait) + masqué VoiceOver (doctrine 86i)
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 16))
                    .foregroundColor(link.isActive ? accent : MeeshyColors.neutral500)
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(link.displayName).font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary).lineLimit(1)
                HStack(spacing: 6) {
                    Text(String(localized: "tracking.links.row.clicks", defaultValue: "\(link.totalClicks) clics", bundle: .main))
                        .font(.caption).foregroundColor(accent)
                    Text(String(localized: "tracking.links.row.uniques", defaultValue: "· \(link.uniqueClicks) uniques", bundle: .main))
                        .font(.caption).foregroundColor(theme.textMuted)
                    if let c = link.campaign {
                        Text("· \(c)").font(.caption).foregroundColor(theme.textMuted).lineLimit(1)
                    }
                }
            }

            Spacer()

            Button {
                UIPasteboard.general.string = link.shortUrl
                HapticFeedback.success()
            } label: {
                Image(systemName: "doc.on.doc").font(MeeshyFont.relative(16))
                    .foregroundColor(accent)
            }.padding(.horizontal, 4)
            .accessibilityLabel(String(localized: "common.copyLink", defaultValue: "Copier le lien", bundle: .main))

            Image(systemName: "chevron.right").font(MeeshyFont.relative(12)).foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: accentHex))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(accent.opacity(0.15), lineWidth: 1))
        )
    }
}

@MainActor
class TrackingLinksViewModel: ObservableObject {
    @Published var links: [TrackingLink] = []
    @Published var stats: TrackingLinkStats? = nil
    @Published var isLoading = false

    func load() async {
        let cached = await CacheCoordinator.shared.trackingLinks.load(for: "list")
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
        async let l = TrackingLinkService.shared.listLinks()
        async let s = TrackingLinkService.shared.fetchStats()
        links = (try? await l) ?? []
        stats = try? await s
        try? await CacheCoordinator.shared.trackingLinks.save(links, for: "list")
        isLoading = false
    }

    func loadStats() async {
        stats = try? await TrackingLinkService.shared.fetchStats()
    }
}
