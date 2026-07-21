import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct CommunityLinksView: View {
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var viewModel = CommunityLinksViewModel()

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var router: Router

    private let accent = MeeshyColors.communityAccent
    private let accentHex = MeeshyColors.communityAccentHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            
            VStack(spacing: 0) {
                header
                
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        communityStatsOverview.padding(.horizontal, 16)
                        communityLinksSection.padding(.horizontal, 16)
                    }
                    .padding(.top, 8).padding(.bottom, 40)
                }
                .refreshable { await viewModel.load() }
            }
        }
        .navigationBarHidden(true)
        .task { await viewModel.load() }
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

            Text(String(localized: "community.links.title", defaultValue: "Liens communauté", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Button {
                HapticFeedback.light()
                router.push(.communityCreate)
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(MeeshyFont.relative(22))
                    .foregroundColor(accent)
            }
            .accessibilityLabel(String(localized: "community.links.create.a11y", defaultValue: "Créer une communauté", bundle: .main))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var communityStatsOverview: some View {
        HStack(spacing: 12) {
            communityStatCard("\(viewModel.stats.totalCommunities)", label: String(localized: "community.links.stat.groups", defaultValue: "Groupes", bundle: .main), icon: "person.3.fill")
            communityStatCard("\(viewModel.stats.activeCommunities)", label: String(localized: "community.links.stat.active", defaultValue: "Actifs", bundle: .main), icon: "checkmark.circle.fill")
            communityStatCard("\(viewModel.stats.totalMembers)", label: String(localized: "community.links.stat.members", defaultValue: "Membres", bundle: .main), icon: "person.fill")
        }
    }

    private func communityStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(MeeshyFont.relative(20))
                .foregroundColor(accent)
                .accessibilityHidden(true)
            Text(value).font(MeeshyFont.relative(24, weight: .bold)).foregroundColor(theme.textPrimary)
            Text(label).font(MeeshyFont.relative(11)).foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity).padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentHex))
                .overlay(RoundedRectangle(cornerRadius: 16)
                    .stroke(accent.opacity(0.2), lineWidth: 1))
        )
        .accessibilityElement(children: .combine)
    }

    private var communityLinksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "community.links.section.mine", defaultValue: "MES COMMUNAUTÉS", bundle: .main)).font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)
                .accessibilityAddTraits(.isHeader)

            if viewModel.isLoading {
                // Instant App: cold-start (empty cache) shows structural
                // skeleton rows, never a spinner. `isLoading` is set true
                // only on `.expired`/`.empty` with no cached links.
                SkeletonLinkList()
            } else if viewModel.links.isEmpty {
                // Consolidation design-system : délègue au primitive partagé
                // EmptyStateView (compact) plutôt que ré-implémenter le VStack
                // hero-glyphe/titre/sous-titre (doctrine dédup 183i/205i). Hérite
                // spring d'apparition + a11y combinée. Glyphe teinté à l'accent
                // communauté via accentHex. 0 clé i18n neuve (les 2 clés existent).
                EmptyStateView(
                    icon: "person.3.fill",
                    title: String(localized: "community.links.empty.title", defaultValue: "Aucune communauté administrée", bundle: .main),
                    subtitle: String(localized: "community.links.empty.subtitle", defaultValue: "Les communautés que vous gérez apparaîtront ici avec leur lien de partage", bundle: .main),
                    accentColor: accentHex,
                    compact: true
                )
                .padding(.vertical, 24)
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

    private func copyJoinLink(_ link: CommunityLink) {
        UIPasteboard.general.string = link.joinUrl
        HapticFeedback.success()
    }

    private func communityLinkRow(_ link: CommunityLink) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(accent.opacity(0.15)).frame(width: 40, height: 40)
                // Glyphe dans un cercle de dimension fixe 40×40 : figé (déborderait s'il scalait) + masqué VoiceOver (doctrine 86i)
                Image(systemName: "person.3.fill").font(.system(size: 14))
                    .foregroundColor(accent)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(link.name).font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(theme.textPrimary).lineLimit(1)
                Text(String(localized: "community.links.row.subtitle", defaultValue: "\(link.memberCount) membres · \(link.identifier)", bundle: .main))
                    .font(MeeshyFont.relative(12)).foregroundColor(theme.textMuted).lineLimit(1)
            }
            Spacer()
            Button {
                copyJoinLink(link)
            } label: {
                Image(systemName: "doc.on.doc").font(MeeshyFont.relative(16))
                    .foregroundColor(accent)
            }.padding(.horizontal, 4)
            // Nested inside the row's NavigationLink, this Button is unreachable by
            // VoiceOver — the link absorbs its whole label as one element. Hide the
            // duplicate glyph here and re-expose the copy as an `.accessibilityAction`
            // on the combined row below, so VoiceOver users can still copy the invite.
            .accessibilityHidden(true)
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
        .accessibilityElement(children: .combine)
        .accessibilityHint(String(localized: "community.links.row.open.a11y", defaultValue: "Ouvre les détails de la communauté", bundle: .main))
        .accessibilityAction(named: String(localized: "common.copyLink", defaultValue: "Copier le lien", bundle: .main)) {
            copyJoinLink(link)
        }
    }
}

@MainActor
class CommunityLinksViewModel: ObservableObject {
    @Published var links: [CommunityLink] = []
    @Published var isLoading = false

    var stats: CommunityLinkStats { CommunityLinkService.shared.stats(links: links) }

    func load() async {
        let cached = await CacheCoordinator.shared.communityLinks.load(for: "list")
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
        links = (try? await CommunityLinkService.shared.listCommunityLinks()) ?? []
        try? await CacheCoordinator.shared.communityLinks.save(links, for: "list")
        isLoading = false
    }
}
