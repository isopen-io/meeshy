import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Réglages › Packs et téléchargements (#10150)

/// **Les deux Boutiques au même endroit** — Stickers et Cadres du jeu — à côté
/// du téléchargement automatique : un pack est d'abord des octets qu'on garde
/// sur l'appareil.
struct PacksSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var domain: PackDomain = .sticker
    private var theme: ThemeManager { ThemeManager.shared }

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
            Picker(String(localized: "settings.packs.domain", defaultValue: "Type de pack", bundle: .main),
                   selection: $domain) {
                Text(String(localized: "settings.packs.stickers", defaultValue: "Stickers", bundle: .main))
                    .tag(PackDomain.sticker)
                Text(String(localized: "settings.packs.frames", defaultValue: "Cadres du jeu", bundle: .main))
                    .tag(PackDomain.gloryFrame)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, MeeshySpacing.lg)

            PackShopScreen(domain: domain)
        }
        .padding(.vertical, MeeshySpacing.md)
    }
}

// MARK: - La Boutique d'un domaine

/// **La Boutique d'un domaine, branchée sur son magasin.** Stickers : la
/// Boutique de la feuille de stickers, telle quelle. Cadres : la Boutique, puis
/// un ONGLET par pack installé qui montre ses cadres et leur usage.
struct PackShopScreen: View {
    let domain: PackDomain

    var body: some View {
        switch domain {
        case .sticker:
            StickerPackShopScreen(store: .shared)
                .padding(.horizontal, MeeshySpacing.lg)
        case .gloryFrame:
            FramePackShopScreen(store: .shared, shelf: .shared)
        }
    }
}

struct FramePackShopScreen: View {
    @ObservedObject var store: FramePackStore
    @ObservedObject var shelf: FramePackShelfLoader
    @State private var selected: PackShopPage = .shop

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
                    PackShopView(rows: store.state.catalogue.map { $0.map(row) },
                                 pending: store.state.pending,
                                 showsFailure: store.state.failed) { slug in
                        Task { await store.toggle(slug: slug) }
                    }
                case .pack(let slug):
                    FramePackShelfView(content: shelf.contents[slug] ?? .loading)
                        .task(id: slug) {
                            if let pack = installed.first(where: { $0.slug == slug }) { await shelf.load(pack) }
                        }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
        }
        .task {
            await store.loadInstalled()
            await store.loadCatalogue()
        }
    }

    private func entry(_ page: PackShopPage) -> PackShopTabBar.Entry {
        switch page {
        case .shop:
            PackShopTabBar.Entry(page: page, title: String(localized: "settings.packs.shop", defaultValue: "Boutique", bundle: .main))
        case .pack(let slug):
            PackShopTabBar.Entry(page: page, title: installed.first { $0.slug == slug }?.localizedName(language: language) ?? slug)
        }
    }

    private func row(_ pack: FramePack) -> PackRow {
        PackRow(slug: pack.slug, name: pack.localizedName(language: language), author: pack.author,
                description: pack.localizedDescription(language: language), installed: pack.installed,
                removable: pack.removable, cover: pack.coverFile.map(PackCover.stored) ?? .none,
                usageText: pack.usage.map(FrameUsageCopy.text))
    }
}
