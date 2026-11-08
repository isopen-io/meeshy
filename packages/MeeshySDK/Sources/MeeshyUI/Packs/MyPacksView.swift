import SwiftUI
import MeeshySDK

// MARK: - Mes packs (#16433)

/// **Mes packs** : ce que j'ai installé, rangé par catégorie (stickers, cadres du jeu, fonds,
/// contours, bannières, cadres de bannière), trié par récents, nom ou éditeur. Chaque pack ouvre
/// sa fiche — et de là son plein écran et son éditeur ; un pack retirable se retire d'un geste.
/// Lit la vitrine entière, cache d'abord (`PackShopStore`).
public struct MyPacksView: View {
    @StateObject private var store: PackShopStore
    @StateObject private var showcase: PackShowcaseModel
    @State private var sort: MyPacksSort = .recent
    private let language: String
    private let usageText: ((FrameUsage) -> String)?
    private let rankName: ((GloryRank) -> String)?
    private let recency: any PackInstallRecording

    @MainActor
    public init(language: String = "fr", usageText: ((FrameUsage) -> String)? = nil,
                rankName: ((GloryRank) -> String)? = nil, store: PackShopStore? = nil,
                designs: (any PackElementDesignProviding)? = nil,
                recency: any PackInstallRecording = PackInstallRecency.shared) {
        self.language = language
        self.usageText = usageText
        self.rankName = rankName
        self.recency = recency
        _store = StateObject(wrappedValue: store ?? PackShopStore(recency: recency))
        _showcase = StateObject(wrappedValue: PackShowcaseModel(designs: designs, language: language))
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Picker(String(localized: "shop.mine.sort", defaultValue: "Trier par", bundle: .module), selection: $sort) {
                ForEach(MyPacksSort.allCases, id: \.self) { option in
                    Text(Self.title(of: option)).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("shop.mine.sort")
            content
        }
        .task { await store.load(domains: nil) }
        .packShowcase(showcase) { context(for: $0) }
    }

    @ViewBuilder
    private var content: some View {
        let sections = MyPacks.sections(of: store.state, sort: sort, recency: recency.installDates(), language: language)
        if store.loadFailed {
            Text(String(localized: "shop.error.load", defaultValue: "La boutique n’a pas pu se charger. Réessaie.", bundle: .module))
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundStyle(MeeshyColors.error)
        } else if let sections, sections.isEmpty {
            Text(String(localized: "shop.mine.empty", defaultValue: "Aucun pack installé pour l’instant. La boutique t’attend.", bundle: .module))
                .font(MeeshyFont.relative(14))
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("shop.mine.empty")
        } else if let sections {
            ForEach(sections) { section in
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    Text(UnifiedShopView.title(of: section.domain))
                        .font(MeeshyFont.relative(15, weight: .semibold))
                        .accessibilityAddTraits(.isHeader)
                    PackShopView(rows: section.packs.map(row),
                                 pending: pendingSlugs(in: section.domain),
                                 showsFailure: false,
                                 onOpen: { showcase.openDetail(domain: section.domain, slug: $0) },
                                 onOpenCover: { showcase.openViewer(domain: section.domain, slug: $0) }) { slug in
                        Task { await store.tap(domain: section.domain, slug: slug) }
                    }
                }
                .accessibilityIdentifier("shop.mine.section.\(section.domain.rawValue)")
            }
        } else {
            PackShopView(rows: nil, pending: [], showsFailure: false) { _ in }
        }
    }

    private func row(_ pack: ShopPack) -> PackRow {
        UnifiedShopView.row(pack, language: language, usageText: usageText, rankName: rankName)
    }

    private func pendingSlugs(in domain: PackDomain) -> Set<String> {
        let prefix = "\(domain.rawValue)."
        return Set(store.state.pending.filter { $0.hasPrefix(prefix) }.map { String($0.dropFirst(prefix.count)) })
    }

    private func context(for domain: PackDomain) -> PackShowcaseContext {
        PackShowcaseContext(rows: store.state.packs(in: domain)?.map(row) ?? [], pending: pendingSlugs(in: domain),
                            wearer: .current,
                            onToggle: { slug in Task { await store.tap(domain: domain, slug: slug) } },
                            catalogue: store.state, language: language)
    }

    static func title(of sort: MyPacksSort) -> String {
        switch sort {
        case .recent: String(localized: "shop.mine.sort.recent", defaultValue: "Récents", bundle: .module)
        case .name: String(localized: "shop.mine.sort.name", defaultValue: "Nom", bundle: .module)
        case .publisher: String(localized: "shop.mine.sort.publisher", defaultValue: "Éditeur", bundle: .module)
        }
    }
}
