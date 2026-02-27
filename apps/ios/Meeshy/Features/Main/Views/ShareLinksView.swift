import SwiftUI
import MeeshySDK

// MARK: - ShareLinksView

struct ShareLinksView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = ShareLinksViewModel()
    @State private var showCreate = false

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    if let stats = viewModel.stats {
                        shareLinkStatsOverview(stats)
                            .padding(.horizontal, 16)
                    }
                    linksSection
                        .padding(.horizontal, 16)
                }
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
            .refreshable {
                await viewModel.load()
            }
        }
        .navigationTitle("Liens de partage")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showCreate = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Color(hex: "08D9D6"))
                }
            }
        }
        .task { await viewModel.load() }
        .sheet(isPresented: $showCreate) {
            CreateShareLinkView { _ in
                Task { await viewModel.load() }
            }
        }
    }

    // MARK: - Stats overview

    private func shareLinkStatsOverview(_ stats: MyShareLinkStats) -> some View {
        HStack(spacing: 12) {
            shareLinkStatCard("\(stats.totalLinks)", label: "Liens", icon: "link")
            shareLinkStatCard("\(stats.activeLinks)", label: "Actifs", icon: "checkmark.circle.fill")
            shareLinkStatCard("\(stats.totalUses)", label: "Rejoints", icon: "person.fill.badge.plus")
        }
    }

    private func shareLinkStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(Color(hex: "08D9D6"))
            Text(value)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(theme.textPrimary)
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: "08D9D6"))
                .overlay(RoundedRectangle(cornerRadius: 16)
                    .stroke(Color(hex: "08D9D6").opacity(0.2), lineWidth: 1))
        )
    }

    // MARK: - Links list

    private var linksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("MES LIENS")
                .font(.system(size: 12, weight: .semibold))
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
                .font(.system(size: 40))
                .foregroundColor(Color(hex: "08D9D6").opacity(0.6))
            Text("Aucun lien de partage")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)
            Text("Créez un lien pour inviter des personnes dans une conversation")
                .font(.system(size: 13))
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
                    .fill(Color(hex: link.isActive ? "08D9D6" : "888888").opacity(0.15))
                    .frame(width: 40, height: 40)
                Image(systemName: link.isActive ? "link" : "link.badge.minus")
                    .font(.system(size: 16))
                    .foregroundColor(Color(hex: link.isActive ? "08D9D6" : "888888"))
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(link.displayName)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text("\(link.currentUses) rejoints")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "08D9D6"))
                    if let conv = link.conversationTitle {
                        Text("· \(conv)")
                            .font(.system(size: 12))
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
                    .font(.system(size: 16))
                    .foregroundColor(Color(hex: "08D9D6"))
            }
            .padding(.horizontal, 4)

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(theme.textMuted)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: "08D9D6"))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: "08D9D6").opacity(0.15), lineWidth: 1))
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
        isLoading = true
        defer { isLoading = false }
        async let l = ShareLinkService.shared.listMyLinks()
        async let s = ShareLinkService.shared.fetchMyStats()
        links = (try? await l) ?? []
        stats = try? await s
    }

    func loadStats() async {
        stats = try? await ShareLinkService.shared.fetchMyStats()
    }
}
