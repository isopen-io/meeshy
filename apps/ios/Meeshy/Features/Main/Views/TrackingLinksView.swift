import SwiftUI
import MeeshySDK

struct TrackingLinksView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = TrackingLinksViewModel()
    @State private var showCreate = false

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    if let stats = viewModel.stats {
                        trackingStatsOverview(stats).padding(.horizontal, 16)
                    }
                    linksSection.padding(.horizontal, 16)
                }
                .padding(.top, 16).padding(.bottom, 40)
            }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle("Liens de tracking")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { showCreate = true } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Color(hex: "A855F7"))
                }
            }
        }
        .task { await viewModel.load() }
        .sheet(isPresented: $showCreate) {
            CreateTrackingLinkView { link in
                viewModel.links.insert(link, at: 0)
                Task { await viewModel.loadStats() }
            }
        }
    }

    private func trackingStatsOverview(_ stats: TrackingLinkStats) -> some View {
        HStack(spacing: 10) {
            trackingStatCard("\(stats.totalLinks)", label: "Liens", icon: "link")
            trackingStatCard("\(stats.totalClicks)", label: "Clics", icon: "cursorarrow.click")
            trackingStatCard("\(stats.uniqueClicks)", label: "Uniques", icon: "person.fill")
            trackingStatCard("\(stats.activeLinks)", label: "Actifs", icon: "checkmark.circle")
        }
    }

    private func trackingStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(Color(hex: "A855F7"))
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(theme.textPrimary)
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: "A855F7"))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: "A855F7").opacity(0.2), lineWidth: 1))
        )
    }

    private var linksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("MES LIENS").font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)

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

    private var trackingEmptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "chart.bar.fill")
                .font(.system(size: 40)).foregroundColor(Color(hex: "A855F7").opacity(0.6))
            Text("Aucun lien de tracking").font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)
            Text("Créez un lien pour suivre vos clics et campagnes")
                .font(.system(size: 13)).foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(40).frame(maxWidth: .infinity)
    }

    private func trackingLinkRow(_ link: TrackingLink) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Color(hex: link.isActive ? "A855F7" : "888888").opacity(0.15))
                    .frame(width: 40, height: 40)
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 16))
                    .foregroundColor(Color(hex: link.isActive ? "A855F7" : "888888"))
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(link.displayName).font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary).lineLimit(1)
                HStack(spacing: 6) {
                    Text("\(link.totalClicks) clics")
                        .font(.system(size: 12)).foregroundColor(Color(hex: "A855F7"))
                    Text("· \(link.uniqueClicks) uniques")
                        .font(.system(size: 12)).foregroundColor(theme.textMuted)
                    if let c = link.campaign {
                        Text("· \(c)").font(.system(size: 12)).foregroundColor(theme.textMuted).lineLimit(1)
                    }
                }
            }

            Spacer()

            Button {
                UIPasteboard.general.string = link.shortUrl
                HapticFeedback.success()
            } label: {
                Image(systemName: "doc.on.doc").font(.system(size: 16))
                    .foregroundColor(Color(hex: "A855F7"))
            }.padding(.horizontal, 4)

            Image(systemName: "chevron.right").font(.system(size: 12)).foregroundColor(theme.textMuted)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: "A855F7"))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: "A855F7").opacity(0.15), lineWidth: 1))
        )
    }
}

@MainActor
class TrackingLinksViewModel: ObservableObject {
    @Published var links: [TrackingLink] = []
    @Published var stats: TrackingLinkStats? = nil
    @Published var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        async let l = TrackingLinkService.shared.listLinks()
        async let s = TrackingLinkService.shared.fetchStats()
        links = (try? await l) ?? []
        stats = try? await s
    }

    func loadStats() async {
        stats = try? await TrackingLinkService.shared.fetchStats()
    }
}
