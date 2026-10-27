import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le lanceur de la vitrine (#10632)

/// **Porte la demande « ouvre la vitrine sur tel domaine »** de la porte (lien
/// profond, « Plus dans la boutique ») jusqu'à `SettingsView`, qui la consomme
/// une fois et présente `PacksSettingsView(initialDomain:)`.
@MainActor
final class PackShopLauncher: ObservableObject {
    nonisolated deinit {}
    static let shared = PackShopLauncher()

    struct Request: Equatable, Identifiable {
        let id = UUID()
        let domain: PackDomain?
        let pack: String?
    }

    @Published private(set) var pending: Request?

    func request(domain: PackDomain?, pack: String? = nil) {
        pending = Request(domain: domain, pack: pack)
    }

    func consume() -> Request? {
        defer { pending = nil }
        return pending
    }
}

// MARK: - Réglages › Packs et téléchargements (#10150)

/// **Les deux Boutiques au même endroit** — Stickers et Cadres du jeu — à côté
/// du téléchargement automatique : un pack est d'abord des octets qu'on garde
/// sur l'appareil.
struct PacksSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var domain: PackDomain
    private let focusedPack: String?
    private var theme: ThemeManager { ThemeManager.shared }

    /// `initialDomain` ouvre la vitrine FILTRÉE (lien profond `meeshy://settings/packs?domaine=…`,
    /// « Plus dans la boutique ») ; absent, la vitrine s'ouvre sur les stickers (#10632).
    /// `focusedPack` met CE pack en avant (#10703) : sa rangée est centrée et contourée.
    init(initialDomain: PackDomain? = nil, focusedPack: String? = nil) {
        let opened = initialDomain.flatMap { PackDomain.allCases.contains($0) ? $0 : nil } ?? .sticker
        _domain = State(initialValue: opened)
        self.focusedPack = focusedPack
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            CollapsibleHeaderPage(
                title: String(localized: "settings.packs.title", defaultValue: "Packs et téléchargements", bundle: .main),
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: Color(hex: MeeshyColors.brandPrimaryHex),
                backgroundColor: theme.backgroundPrimary,
                content: { content }
            )
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.sm) {
                    ForEach(PackDomain.allCases, id: \.self) { entry in
                        domainChip(entry)
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
            }
            .accessibilityLabel(String(localized: "settings.packs.domain", defaultValue: "Type de pack", bundle: .main))

            PackShopScreen(domain: domain, focusedPack: focusedPack)
        }
        .padding(.vertical, MeeshySpacing.md)
    }
}

extension PacksSettingsView {
    fileprivate func domainChip(_ entry: PackDomain) -> some View {
        let isSelected = entry == domain
        return Button {
            HapticFeedback.light()
            domain = entry
        } label: {
            Text(UnifiedShopView.title(of: entry))
                .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                .foregroundStyle(isSelected ? Color.white : theme.textPrimary)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background {
                    if isSelected {
                        Capsule().fill(MeeshyColors.brandGradient)
                    } else {
                        Capsule().fill(theme.textPrimary.opacity(0.08))
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - La Boutique d'un domaine

/// **La Boutique d'un domaine, branchée sur son magasin.** Stickers : la
/// Boutique de la feuille de stickers, telle quelle. Cadres : la Boutique, puis
/// un ONGLET par pack installé qui montre ses cadres et leur usage.
struct PackShopScreen: View {
    let domain: PackDomain
    var focusedPack: String?

    /// La langue dans laquelle la vitrine nomme ses packs — celle du magasin des cadres qu'elle remplace.
    static var language: String { AuthManager.shared.currentUser?.systemLanguage ?? "fr" }

    var body: some View {
        switch domain {
        case .gloryFrame:
            FramePackShopScreen(store: .shared, shelf: .shared, focusedPack: focusedPack)
        case .sticker, .wallpaper, .avatarRing, .banner, .bannerFrame:
            // La vitrine unique (#10632, #10711) : prix en Meeshes, possession, achat optimiste —
            // les stickers y passent comme les fonds, plus de seconde Boutique.
            UnifiedShopView(initialDomain: domain, domains: [domain], focusedSlug: focusedPack,
                            language: PackShopScreen.language, rankName: GameCopy.rankName)
                .id(domain)
                .padding(.horizontal, MeeshySpacing.lg)
        case .unknown:
            EmptyView()
        }
    }
}

struct FramePackShopScreen: View {
    @ObservedObject var store: FramePackStore
    @ObservedObject var shelf: FramePackShelfLoader
    var focusedPack: String?
    @State private var selected: PackShopPage = .shop
    /// La vitrine unique des cadres (#10711) : l'achat et l'installation passent par elle, et
    /// les onglets des packs installés suivent ce qu'elle installe.
    @StateObject private var vitrine = PackShopStore()

    private var language: String { AuthManager.shared.currentUser?.systemLanguage ?? "fr" }
    private var installed: [FramePack] { store.state.installed ?? [] }

    var body: some View {
        let offered = PackShopPage.offered(installed: installed.map(\.slug))
        let page = PackShopPage.resolved(selected, among: offered)
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            PackShopTabBar(selection: $selected, entries: offered.map { entry($0) })
            Group {
                switch page {
                case .shop:
                    UnifiedShopView(initialDomain: .gloryFrame, domains: [.gloryFrame],
                                    focusedSlug: focusedPack, language: language,
                                    usageText: FrameUsageCopy.text, store: vitrine)
                case .pack(let slug):
                    FramePackShelfView(content: shelf.contents[slug] ?? .loading)
                        .task(id: slug) {
                            if let pack = installed.first(where: { $0.slug == slug }) { await shelf.load(pack) }
                        }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
        }
        .task { await store.loadInstalled() }
        .onReceive(vitrine.$state.map { Self.installedSlugs(in: $0) }.removeDuplicates().dropFirst()) { _ in
            Task { await store.loadInstalled() }
        }
    }

    /// Ce que la vitrine tient pour installé — un changement relit les packs installés des onglets.
    static func installedSlugs(in state: PackShopState) -> [String] {
        (state.packs(in: .gloryFrame) ?? []).filter(\.installed).map(\.slug)
    }

    private func entry(_ page: PackShopPage) -> PackShopTabBar.Entry {
        switch page {
        case .shop:
            PackShopTabBar.Entry(page: page, title: String(localized: "settings.packs.shop", defaultValue: "Boutique", bundle: .main))
        case .pack(let slug):
            PackShopTabBar.Entry(page: page, title: installed.first { $0.slug == slug }?.localizedName(language: language) ?? slug)
        }
    }
}
