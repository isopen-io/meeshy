import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct CommunityLinksView: View {
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var viewModel = CommunityLinksViewModel()

    @Environment(\.routerCommands) private var router

    private let accent = MeeshyColors.communityAccent
    private let accentHex = MeeshyColors.communityAccentHex

    var body: some View {
        LinksPage(
            title: String(localized: "community.links.title", defaultValue: "Liens communauté", bundle: .main),
            accent: accent,
            action: LinksPageAction(
                label: String(localized: "community.links.create.a11y", defaultValue: "Créer une communauté", bundle: .main),
                perform: { router.push(.communityCreate) }
            )
        ) {
            VStack(spacing: MeeshySpacing.xl) {
                communityStatsOverview.padding(.horizontal, MeeshySpacing.lg)
                communityLinksSection.padding(.horizontal, MeeshySpacing.lg)
            }
            .padding(.top, MeeshySpacing.sm).padding(.bottom, 40)
        }
        .refreshable { await viewModel.load() }
        .task { await viewModel.load() }
    }

    private var communityStatsOverview: some View {
        HStack(spacing: MeeshySpacing.md) {
            communityStatCard("\(viewModel.stats.totalCommunities)", label: String(localized: "community.links.stat.groups", defaultValue: "Groupes", bundle: .main), icon: "person.3.fill")
            communityStatCard("\(viewModel.stats.activeCommunities)", label: String(localized: "community.links.stat.active", defaultValue: "Actifs", bundle: .main), icon: "checkmark.circle.fill")
            communityStatCard("\(viewModel.stats.totalMembers)", label: String(localized: "community.links.stat.members", defaultValue: "Membres", bundle: .main), icon: "person.fill")
        }
    }

    private func communityStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon).font(MeeshyFont.relative(MeeshyIconSize.xl))
                .foregroundColor(accent)
                .accessibilityHidden(true)
            Text(value).font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold)).foregroundStyle(theme.textPrimary)
            Text(label).font(MeeshyFont.relative(MeeshyFont.footnoteSize)).foregroundStyle(theme.textSecondary)
        }
        .frame(maxWidth: .infinity).padding(MeeshySpacing.mdPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.surfaceGradient(tint: accentHex))
                .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(accent.opacity(MeeshyOpacity.light), lineWidth: 1))
        )
        .accessibilityElement(children: .combine)
    }

    private var communityLinksSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(String(localized: "community.links.section.mine", defaultValue: "MES COMMUNAUTÉS", bundle: .main)).font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
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
                    accentColor: accentHex,
                    compact: true
                )
                .padding(.vertical, MeeshySpacing.xxl)
            } else {
                VStack(spacing: MeeshySpacing.sm) {
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
        LinksClipboard.copy(link.joinUrl)
    }

    private func communityLinkRow(_ link: CommunityLink) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            ZStack {
                Circle().fill(accent.opacity(MeeshyOpacity.light)).frame(width: MeeshyControlSize.large, height: MeeshyControlSize.large)
                // Glyphe dans un cercle de dimension fixe 40×40 : figé (déborderait s'il scalait) + masqué VoiceOver (doctrine 86i)
                Image(systemName: "person.3.fill").font(MeeshyFont.fixedGlyph(MeeshyIconSize.sm))
                    .foregroundColor(accent)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(link.name).font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary).lineLimit(1)
                Text(String(localized: "community.links.row.subtitle", defaultValue: "\(link.memberCount) membres · \(link.identifier)", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize)).foregroundColor(theme.textMuted).lineLimit(1)
            }
            Spacer()
            MeeshyGlassButton(
                systemImage: "doc.on.doc",
                label: String(localized: "common.copyLink", defaultValue: "Copier le lien", bundle: .main),
                size: .s36,
                glyphTint: accent,
                haptic: .none,
                action: { copyJoinLink(link) }
            )
            // Nested inside the row's NavigationLink, this Button is unreachable by
            // VoiceOver — the link absorbs its whole label as one element. Hide the
            // duplicate glyph here and re-expose the copy as an `.accessibilityAction`
            // on the combined row below, so VoiceOver users can still copy the invite.
            .accessibilityHidden(true)
            Image(systemName: "chevron.forward").font(MeeshyFont.relative(MeeshyIconSize.xs)).foregroundStyle(theme.textMuted)
                .accessibilityHidden(true)
        }
        .padding(MeeshySpacing.mdPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: accentHex))
                .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .stroke(accent.opacity(MeeshyOpacity.light), lineWidth: 1))
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
        await bestEffort("communityLinksView.communityLinks.save", category: .cache) { try await CacheCoordinator.shared.communityLinks.save(links, for: "list") }
        isLoading = false
    }
}
