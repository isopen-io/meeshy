import SwiftUI
import MeeshySDK

struct CommunityLinksView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = CommunityLinksViewModel()

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    communityStatsOverview.padding(.horizontal, 16)
                    communityLinksSection.padding(.horizontal, 16)
                }
                .padding(.top, 16).padding(.bottom, 40)
            }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle("Liens communauté")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    private var communityStatsOverview: some View {
        HStack(spacing: 12) {
            communityStatCard("\(viewModel.stats.totalCommunities)", label: "Groupes", icon: "person.3.fill")
            communityStatCard("\(viewModel.stats.activeCommunities)", label: "Actifs", icon: "checkmark.circle.fill")
            communityStatCard("\(viewModel.stats.totalMembers)", label: "Membres", icon: "person.fill")
        }
    }

    private func communityStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 20))
                .foregroundColor(Color(hex: "F8B500"))
            Text(value).font(.system(size: 24, weight: .bold)).foregroundColor(theme.textPrimary)
            Text(label).font(.system(size: 11)).foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity).padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: "F8B500"))
                .overlay(RoundedRectangle(cornerRadius: 16)
                    .stroke(Color(hex: "F8B500").opacity(0.2), lineWidth: 1))
        )
    }

    private var communityLinksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("MES COMMUNAUTÉS").font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)

            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity).padding(40)
            } else if viewModel.links.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "person.3.fill").font(.system(size: 40))
                        .foregroundColor(Color(hex: "F8B500").opacity(0.6))
                    Text("Aucune communauté administrée")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(theme.textPrimary)
                    Text("Les communautés que vous gérez apparaîtront ici avec leur lien de partage")
                        .font(.system(size: 13)).foregroundColor(theme.textSecondary)
                        .multilineTextAlignment(.center)
                }.padding(40).frame(maxWidth: .infinity)
            } else {
                VStack(spacing: 8) {
                    ForEach(viewModel.links) { link in
                        NavigationLink(destination: CommunityLinkDetailView(link: link)) {
                            communityLinkRow(link)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func communityLinkRow(_ link: CommunityLink) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Color(hex: "F8B500").opacity(0.15)).frame(width: 40, height: 40)
                Image(systemName: "person.3.fill").font(.system(size: 14))
                    .foregroundColor(Color(hex: "F8B500"))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(link.name).font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary).lineLimit(1)
                Text("\(link.memberCount) membres · \(link.identifier)")
                    .font(.system(size: 12)).foregroundColor(theme.textMuted).lineLimit(1)
            }
            Spacer()
            Button {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
            } label: {
                Image(systemName: "doc.on.doc").font(.system(size: 16))
                    .foregroundColor(Color(hex: "F8B500"))
            }.padding(.horizontal, 4)
            Image(systemName: "chevron.right").font(.system(size: 12)).foregroundColor(theme.textMuted)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: "F8B500"))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: "F8B500").opacity(0.15), lineWidth: 1))
        )
    }
}

@MainActor
class CommunityLinksViewModel: ObservableObject {
    @Published var links: [CommunityLink] = []
    @Published var isLoading = false

    var stats: CommunityLinkStats { CommunityLinkService.shared.stats(links: links) }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        links = (try? await CommunityLinkService.shared.listCommunityLinks()) ?? []
    }
}
